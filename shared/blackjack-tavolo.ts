/**
 * Il tavolo del blackjack: fino a cinque giocatori contro il banco, ognuno con
 * la sua puntata e le sue mani. Qui ci sono solo le regole del tavolo — chi si
 * siede, quando si punta, di chi e' il turno, quando gioca il banco — come
 * funzioni pure: il server le applica allo stato salvato, i test le provano
 * con un mazzo deciso e un orologio finto.
 *
 * Un giro ha tre fasi. **Le puntate**: da soli si punta e si gioca subito; con
 * altri al tavolo la prima puntata apre `PUNTATE_MS` di tempo per gli altri, e
 * le carte arrivano quando hanno puntato tutti quelli che ci sono, o quando il
 * tempo finisce. **Il gioco**: un posto alla volta, da sinistra, e una mano
 * alla volta; chi deve decidere ha `TURNO_MS`, ma solo se qualcuno lo aspetta —
 * da soli si pensa quanto si vuole — e allo scadere sta. **La fine**: il banco
 * gioca, le mani si pagano, e le carte restano in vista quanto serve a vederle
 * girare (`durataFine`), poi si riparte.
 *
 * L'assicurazione si offre a ognuno al suo turno, prima di ogni altra mossa,
 * e non tutta insieme dopo la distribuzione come fa il croupier: senza carta
 * coperta, e con il sabot che si rimescola a ogni carta, le carte uscite prima
 * non dicono niente della seconda del banco, e nessuno sceglie sapendone di
 * piu'. Per questo contro l'asso anche il blackjack aspetta il suo turno,
 * invece di stare da solo: la scelta e' sua.
 *
 * Le scadenze non le fa scattare un orologio, perché sul server non ce n'e'
 * uno: le applica la prima richiesta che arriva dopo (`avanza`), da chiunque
 * venga, e ogni scadenza che ne segue parte da quella di prima e non da
 * adesso. Cosi' un tavolo letto dopo un minuto e' quello che sarebbe stato se
 * qualcuno lo avesse guardato tutto il tempo.
 *
 * Le regole non scrivono il saldo: dicono che cosa e' cambiato (`MovimentoBJ`)
 * e il server lo scrive nello stesso batch del tavolo.
 */

import {
  PUNTATA_MINIMA_BJ,
  assicurazioneOfferta,
  costoAssicurazione,
  deltaAssicurazione,
  deltaMano,
  eBlackjack,
  giocaAzione,
  giocaBanco,
  mossePossibili,
  sballata,
  type AzioneBJ,
  type Carta,
  type ManoBJ,
  type MossaBJ,
} from './blackjack'
import { PRESENZA_ONLINE_MS } from './config'

export const POSTI_BJ = 5
/** L'ordine in cui si occupano i posti liberi: dal centro verso i lati. */
export const ORDINE_POSTI: readonly number[] = [2, 1, 3, 0, 4]

/** Con altri al tavolo, quanto restano aperte le puntate dopo la prima. */
export const PUNTATE_MS = 15_000
/** Quanto ha chi deve decidere, quando qualcuno lo aspetta. */
export const TURNO_MS = 15_000
/** Il volo di una carta dal sabot al suo posto: il turno parte quando le carte sono arrivate. */
export const CARTA_MS = 340
/** Quanto resta in vista la fine di un giro, e quanto in piu' per ogni carta che pesca il banco. */
export const FINE_MS = 3_000
export const FINE_CARTA_MS = 900
/** Chi non si vede da tanto non e' piu' al tavolo: lo stesso tempo di chi e' online. */
export const ASSENTE_MS = PRESENZA_ONLINE_MS

export type FaseBJ = 'puntate' | 'gioco' | 'fine'

export interface PostoBJ {
  id: string
  /** La puntata del giro: zero per chi lo guarda e basta. */
  puntata: number
  /** La giornata della puntata: il giro si paga su quella, anche se finisce dopo mezzanotte. */
  giorno: number
  mani: ManoBJ[]
  /** Quel che ha messo sulla linea dell'assicurazione, se il banco mostrava un asso e si e' assicurato. */
  assicurazione?: number
  /** A giro finito: quel che il giro gli ha dato o tolto, assicurazione compresa. */
  delta: number | null
  /** L'ultima volta che ha fatto qualcosa al tavolo: sedersi, puntare, una mossa. */
  visto: number
  /** Si e' alzato a giro in corso: le sue mani stanno, e il posto si libera alla fine del giro. */
  via?: true
}

export interface TavoloBJ {
  giro: number
  fase: FaseBJ
  /** Quando finiscono le puntate, il turno o la fine del giro; null se non c'e' niente che scade. */
  scadenza: number | null
  posti: (PostoBJ | null)[]
  banco: Carta[]
  turno: { posto: number; mano: number } | null
}

/**
 * Quel che un cambio del tavolo chiede al database: i posti occupati e i conti
 * della giornata. `aggiunge` e' quel che si mette sul tavolo dopo la puntata:
 * il raddoppio, lo split, l'assicurazione.
 */
export type MovimentoBJ =
  | { tipo: 'siede'; id: string }
  | { tipo: 'alza'; id: string }
  | { tipo: 'punta'; id: string; giro: number; giorno: number; puntata: number }
  | { tipo: 'aggiunge'; id: string; giro: number; giorno: number; quanto: number }
  | {
      tipo: 'chiude'
      id: string
      giro: number
      giorno: number
      delta: number
      mani: ManoBJ[]
      banco: Carta[]
      assicurazione: number
    }
  | { tipo: 'rimborsa'; id: string; giro: number; giorno: number }

export interface ContestoBJ {
  adesso: number
  /** Una carta dal sabot. */
  pesca: () => Carta
  /** Chi ha la pagina del blackjack aperta, per la presenza: per sapere chi aspettare. */
  presente: (id: string) => boolean
  /**
   * Chi e' andato altrove nell'app dopo l'ultima cosa fatta al tavolo (`visto`):
   * la presenza lo dice appena si cambia schermata, e non serve aspettarlo.
   */
  altrove?: (id: string, visto: number) => boolean
}

/** Un errore delle regole, con il codice che il server manda al telefono. */
export class RegolaBJ extends Error {
  constructor(
    readonly codice: string,
    messaggio: string,
  ) {
    super(messaggio)
  }
}

export function tavoloNuovo(): TavoloBJ {
  return { giro: 1, fase: 'puntate', scadenza: null, posti: Array<null>(POSTI_BJ).fill(null), banco: [], turno: null }
}

/** Quanto dura la distribuzione: due carte a chi gioca e una al banco, una dopo l'altra. */
export function durataDistribuzione(giocatori: number): number {
  return CARTA_MS * (2 * giocatori + 1) + 400
}

/** Quanto resta in vista la fine del giro: le carte del banco una alla volta, poi gli esiti. */
export function durataFine(banco: readonly Carta[]): number {
  return FINE_MS + FINE_CARTA_MS * Math.max(0, banco.length - 1)
}

export const seduti = (t: TavoloBJ) => t.posti.filter((p): p is PostoBJ => p !== null)

export function postoDi(t: TavoloBJ, id: string): number | null {
  const k = t.posti.findIndex((p) => p?.id === id)
  return k < 0 ? null : k
}

/** Chi gioca il giro: ha puntato, e quindi ha le mani. */
const inGioco = (p: PostoBJ | null): p is PostoBJ => p !== null && p.puntata > 0

/**
 * Una bozza del tavolo: lo stato che cambia e i movimenti che ne vengono. Le
 * regole lavorano su una copia, cosi' un errore a meta' non lascia niente.
 */
export class BozzaBJ {
  readonly t: TavoloBJ
  readonly movimenti: MovimentoBJ[] = []

  constructor(
    stato: TavoloBJ,
    readonly c: ContestoBJ,
  ) {
    this.t = structuredClone(stato)
  }

  /** Al tavolo davvero: non si e' alzato, non e' andato altrove, e ha la pagina aperta o ha fatto qualcosa da poco. */
  attivo(p: PostoBJ): boolean {
    if (p.via || this.c.altrove?.(p.id, p.visto)) return false
    return this.c.presente(p.id) || this.c.adesso - p.visto < ASSENTE_MS
  }

  /** Qualcuno, oltre a chi deve decidere, e' al tavolo e aspetta: allora il tempo conta. */
  aspettano(posto: number): boolean {
    return this.t.posti.some((p, k) => k !== posto && p !== null && this.attivo(p))
  }

  vuoto(): boolean {
    return this.t.posti.every((p) => p === null || p.via)
  }

  private libera(k: number) {
    const p = this.t.posti[k]
    if (!p) return
    if (!p.via) this.movimenti.push({ tipo: 'alza', id: p.id })
    this.t.posti[k] = null
  }

  /* ───────────────────────────  Sedersi e alzarsi  ─────────────────────────── */

  siedi(id: string) {
    const gia = postoDi(this.t, id)
    if (gia !== null) {
      const p = this.t.posti[gia]!
      // Chi si era alzato a giro in corso e torna si riprende il posto, con le sue mani.
      if (p.via) {
        delete p.via
        this.movimenti.push({ tipo: 'siede', id })
      }
      p.visto = this.c.adesso
      return
    }
    const k = ORDINE_POSTI.find((i) => this.t.posti[i] === null)
    if (k === undefined) throw new RegolaBJ('PIENO', 'Il tavolo è pieno.')
    this.t.posti[k] = { id, puntata: 0, giorno: 0, mani: [], delta: null, visto: this.c.adesso }
    this.movimenti.push({ tipo: 'siede', id })
    // Chi stava pensando da solo adesso ha qualcuno che aspetta: il suo tempo parte da qui.
    if (this.t.fase === 'gioco' && this.t.scadenza !== null) {
      this.t.scadenza = Math.max(this.t.scadenza, this.c.adesso + TURNO_MS)
    }
  }

  /**
   * Alzarsi. Durante le puntate la puntata torna indietro; a giro in corso le
   * mani restano sul tavolo e stanno, e si pagano alla fine come le altre.
   */
  alzati(id: string) {
    const k = postoDi(this.t, id)
    if (k === null) return
    const p = this.t.posti[k]!
    if (this.t.fase === 'gioco' && p.puntata > 0) {
      if (!p.via) this.movimenti.push({ tipo: 'alza', id })
      p.via = true
      return
    }
    if (this.t.fase === 'puntate' && p.puntata > 0) {
      this.movimenti.push({ tipo: 'rimborsa', id, giro: this.t.giro, giorno: p.giorno })
    }
    this.libera(k)
  }

  /* ───────────────────────────────  Le puntate  ─────────────────────────────── */

  /** Una puntata, per il giro che il telefono ha visto: un doppio tocco non punta sul giro dopo. */
  punta(id: string, giro: unknown, puntata: unknown, saldo: number, giorno: number) {
    const k = postoDi(this.t, id)
    if (k === null || this.t.posti[k]!.via) throw new RegolaBJ('NON_SEDUTO', 'Non sei seduto a questo tavolo.')
    if (this.t.fase !== 'puntate' || giro !== this.t.giro) {
      throw new RegolaBJ('NON_ORA', 'Le puntate di questo giro sono chiuse.')
    }
    const p = this.t.posti[k]!
    if (p.puntata > 0) throw new RegolaBJ('GIA_PUNTATO', 'Hai già puntato.')
    if (saldo < PUNTATA_MINIMA_BJ) {
      throw new RegolaBJ('POCHI_PUNTI', `Per giocare servono almeno ${PUNTATA_MINIMA_BJ} punti di oggi.`)
    }
    if (!Number.isInteger(puntata) || (puntata as number) < PUNTATA_MINIMA_BJ || (puntata as number) > saldo) {
      throw new RegolaBJ('PUNTATA', `Si puntano da ${PUNTATA_MINIMA_BJ} a ${saldo} punti.`)
    }
    p.puntata = puntata as number
    p.giorno = giorno
    p.visto = this.c.adesso
    this.movimenti.push({ tipo: 'punta', id, giro: this.t.giro, giorno, puntata: p.puntata })
    // La prima puntata, con altri che ci sono, apre il tempo per le loro.
    if (this.t.scadenza === null && seduti(this.t).some((q) => q.id !== id && this.attivo(q))) {
      this.t.scadenza = this.c.adesso + PUNTATE_MS
    }
  }

  /** Le carte: la prima a ognuno, da sinistra, poi quella del banco, poi la seconda a ognuno. */
  private distribuisci(quando: number) {
    const giocano = this.t.posti.map((p, k) => (inGioco(p) ? k : -1)).filter((k) => k >= 0)
    for (const k of giocano) {
      const p = this.t.posti[k]!
      p.mani = [{ id: 0, carte: [this.c.pesca()], puntata: p.puntata }]
    }
    this.t.banco = [this.c.pesca()]
    for (const k of giocano) {
      const mano = this.t.posti[k]!.mani[0]
      mano.carte.push(this.c.pesca())
      // Il blackjack sta da solo, tranne contro l'asso: prima si sceglie se assicurarlo.
      if (eBlackjack(mano.carte) && !assicurazioneOfferta(this.t.banco)) mano.ferma = true
    }
    this.t.fase = 'gioco'
    this.cercaTurno({ posto: 0, mano: 0 }, quando + durataDistribuzione(giocano.length))
  }

  /* ─────────────────────────────────  Il gioco  ───────────────────────────────── */

  /**
   * Il turno dopo, da `da` compreso: la prima mano non ferma, in quel posto o
   * nei posti dopo. `base` e' quando comincia: la scadenza ne parte. Se non ce
   * n'e' piu', gioca il banco.
   */
  private cercaTurno(da: { posto: number; mano: number }, base: number) {
    for (let k = da.posto; k < POSTI_BJ; k += 1) {
      const p = this.t.posti[k]
      if (!inGioco(p)) continue
      for (let m = k === da.posto ? da.mano : 0; m < p.mani.length; m += 1) {
        if (!p.mani[m].ferma) {
          this.t.turno = { posto: k, mano: m }
          this.t.scadenza = base + TURNO_MS
          return
        }
      }
    }
    this.giocaIlBanco(base)
  }

  /**
   * Una mossa, sulla mano che il telefono ha visto (`mano`, con `carte` carte):
   * un doppio tocco non chiede due carte. Raddoppiare e fare split chiedono
   * un'altra puntata uguale, l'assicurazione la meta', e il saldo deve averle.
   */
  muovi(id: string, giro: unknown, mano: unknown, carte: unknown, azione: unknown, saldo: number) {
    const k = postoDi(this.t, id)
    const turno = this.t.turno
    if (k === null || this.t.posti[k]!.via) throw new RegolaBJ('NON_SEDUTO', 'Non sei seduto a questo tavolo.')
    if (this.t.fase !== 'gioco' || giro !== this.t.giro || !turno || turno.posto !== k || turno.mano !== mano) {
      throw new RegolaBJ('NON_TOCCA', 'Non tocca a te.')
    }
    const p = this.t.posti[k]!
    const attuale = p.mani[turno.mano]
    if (carte !== attuale.carte.length) throw new RegolaBJ('MOSSA_VECCHIA', 'Questa mano è già cambiata.')
    // Un doppio tocco sull'assicurazione: la mano e' la stessa, ma la linea ha gia' le sue fiches.
    if (azione === 'assicurazione' && p.assicurazione) throw new RegolaBJ('GIA_ASSICURATO', 'Sei già assicurato.')
    if (!mossePossibili(p.mani, turno.mano, this.t.banco, p.assicurazione).includes(azione as MossaBJ)) {
      throw new RegolaBJ('MOSSA', 'Questa mossa non si può fare.')
    }
    if (azione === 'assicurazione') {
      this.assicura(p, saldo)
      return
    }
    if ((azione === 'raddoppia' || azione === 'dividi') && saldo < attuale.puntata) {
      throw new RegolaBJ('POCHI_PUNTI', `Servono altri ${attuale.puntata} punti.`)
    }
    const { mani, inPiu } = giocaAzione(attuale, azione as AzioneBJ, this.c.pesca)
    // La mano nata da una divisione ha un nome nuovo: le carte che ci sono gia' non si rimescolano.
    if (mani.length > 1) {
      mani[0].id = attuale.id
      mani[1].id = 1 + Math.max(...p.mani.map((m) => m.id ?? 0))
    }
    p.mani.splice(turno.mano, 1, ...mani)
    p.visto = this.c.adesso
    if (inPiu > 0) {
      p.puntata += inPiu
      this.movimenti.push({ tipo: 'aggiunge', id, giro: this.t.giro, giorno: p.giorno, quanto: inPiu })
    }
    // Ogni decisione ha il suo tempo: la carta presa non ruba quello della prossima.
    this.cercaTurno(turno, this.c.adesso + CARTA_MS)
  }

  /**
   * L'assicurazione: la meta' della puntata, per difetto, sulla linea. Il turno
   * resta, con il tempo di una decisione nuova, perché la mano si gioca ancora;
   * un blackjack invece non ha piu' niente da decidere, e sta.
   */
  private assicura(p: PostoBJ, saldo: number) {
    const turno = this.t.turno!
    const quanto = costoAssicurazione(p.mani[0].puntata)
    if (saldo < quanto) throw new RegolaBJ('POCHI_PUNTI', `Servono altri ${quanto} punti.`)
    p.assicurazione = quanto
    p.visto = this.c.adesso
    this.movimenti.push({ tipo: 'aggiunge', id: p.id, giro: this.t.giro, giorno: p.giorno, quanto })
    if (eBlackjack(p.mani[0].carte)) p.mani[0].ferma = true
    this.cercaTurno(turno, this.c.adesso)
  }

  /** La mano di turno sta, perché il tempo e' finito o chi la gioca si e' alzato. */
  private staPerForza(base: number) {
    const turno = this.t.turno!
    this.t.posti[turno.posto]!.mani[turno.mano].ferma = true
    this.cercaTurno(turno, base)
  }

  /**
   * Il banco. Se restano mani in piedi che non sono blackjack pesca fino a 17;
   * se restano solo blackjack, o solo assicurazioni, pesca una carta, per
   * vedere se fa blackjack; se non resta niente non pesca. Poi si paga,
   * l'assicurazione con le mani, e il giro resta in vista per la sua fine.
   */
  private giocaIlBanco(base: number) {
    const giocano = this.t.posti.filter(inGioco)
    const vive = giocano.flatMap((p) => p.mani.filter((m) => !sballata(m.carte)))
    const assicurati = giocano.some((p) => (p.assicurazione ?? 0) > 0)
    if (vive.some((m) => !eBlackjack(m.carte, m.divisa))) this.t.banco = giocaBanco(this.t.banco, this.c.pesca)
    else if (vive.length > 0 || assicurati) this.t.banco.push(this.c.pesca())
    for (const p of giocano) {
      const assicurazione = p.assicurazione ?? 0
      const mani = p.mani.reduce((s, m) => s + deltaMano(m, this.t.banco), 0)
      p.delta = mani + deltaAssicurazione(assicurazione, this.t.banco)
      this.movimenti.push({
        tipo: 'chiude',
        id: p.id,
        giro: this.t.giro,
        giorno: p.giorno,
        delta: p.delta,
        mani: p.mani,
        banco: this.t.banco,
        assicurazione,
      })
    }
    this.t.fase = 'fine'
    this.t.turno = null
    this.t.scadenza = base + durataFine(this.t.banco)
  }

  /** Il giro dopo: le carte tornano nel sabot, chi si e' alzato o non c'e' piu' lascia il posto. */
  private nuovoGiro() {
    this.t.giro += 1
    this.t.fase = 'puntate'
    this.t.scadenza = null
    this.t.banco = []
    this.t.turno = null
    for (let k = 0; k < POSTI_BJ; k += 1) {
      const p = this.t.posti[k]
      if (!p) continue
      if (p.via || !this.attivo(p)) this.libera(k)
      else {
        Object.assign(p, { puntata: 0, giorno: 0, mani: [], delta: null })
        delete p.assicurazione
      }
    }
  }

  /**
   * Le scadenze passate, una dopo l'altra, ognuna dalla sua ora: le puntate
   * che si chiudono, i turni che scadono, la fine che lascia il posto al giro
   * dopo. Va chiamata prima e dopo ogni cambio.
   */
  avanza() {
    const { adesso } = this.c
    for (let passi = 0; passi < 64; passi += 1) {
      const t = this.t
      if (t.fase === 'puntate') {
        // Chi non ha puntato e non c'e' piu' lascia il posto: non lo si aspetta.
        for (let k = 0; k < POSTI_BJ; k += 1) {
          const p = t.posti[k]
          if (p && p.puntata === 0 && !this.attivo(p)) this.libera(k)
        }
        const puntate = seduti(t).filter((p) => p.puntata > 0)
        if (puntate.length === 0) {
          t.scadenza = null
          return
        }
        const tutti = seduti(t).every((p) => p.puntata > 0 || !this.attivo(p))
        if (tutti) this.distribuisci(adesso)
        else if (t.scadenza !== null && adesso >= t.scadenza) this.distribuisci(t.scadenza)
        else return
      } else if (t.fase === 'gioco') {
        const turno = t.turno
        if (!turno) {
          this.giocaIlBanco(adesso)
          continue
        }
        const p = t.posti[turno.posto]!
        if (p.via) this.staPerForza(adesso)
        else if (t.scadenza !== null && adesso >= t.scadenza && this.aspettano(turno.posto)) {
          this.staPerForza(t.scadenza)
        } else return
      } else {
        if (t.scadenza !== null && adesso < t.scadenza) return
        this.nuovoGiro()
      }
    }
  }
}

/** Le mosse che puo' fare adesso chi tocca, assicurazione compresa: nessuna se non tocca a lui. */
export function mosseDi(t: TavoloBJ, posto: number): MossaBJ[] {
  if (t.fase !== 'gioco' || t.turno?.posto !== posto) return []
  const p = t.posti[posto]
  if (!p) return []
  return mossePossibili(p.mani, t.turno.mano, t.banco, p.assicurazione)
}
