/**
 * Il tavolo della roulette: fino a sei giocatori attorno allo stesso panno,
 * ognuno con le sue fiches, e una biglia per tutti. Come il tavolo del
 * blackjack (shared/blackjack-tavolo.ts) qui ci sono solo le regole — chi si
 * siede, quando si punta, quando parte la biglia — come funzioni pure su una
 * bozza, che il server applica allo stato salvato e i test provano con un
 * numero deciso e un orologio finto.
 *
 * Un giro ha due fasi. **Le puntate**: da soli si mettono le fiches e si
 * lancia; con altri al tavolo la prima puntata apre `PUNTATE_RL_MS` per le
 * loro, e la biglia parte quando hanno puntato tutti quelli che ci sono, o
 * quando il tempo finisce. Fino ad allora una puntata si cambia mandandola di
 * nuovo: vale l'ultima. **Il giro**: il numero lo pesca il server al lancio, e
 * nello stesso momento si paga — la roulette non ha decisioni dopo il "rien
 * ne va plus" —, poi la biglia gira (`LANCIO_MS`) e il numero resta in vista
 * (`FINE_RL_MS`). Chi punta quando la biglia e' gia' ferma comincia il giro
 * dopo per tutti: chi guarda il numero lo ha gia' visto cadere.
 *
 * Le scadenze le applica la prima richiesta che arriva dopo (`avanza`), ognuna
 * dalla sua ora, come al blackjack. Le regole non scrivono il saldo: dicono che
 * cosa e' cambiato (`MovimentoRL`) e il server lo scrive nello stesso batch.
 */

import { PRESENZA_ONLINE_MS } from './config'
import { PUNTATA_MINIMA_RL, deltaDi, leggiPuntate, totaleDi, type PuntateRL } from './roulette'

export const POSTI_RL = 6

/** Con altri al tavolo, quanto restano aperte le puntate dopo la prima. */
export const PUNTATE_RL_MS = 20_000
/** Dal lancio alla biglia ferma nella sua casella: la ruota del telefono dura questo. */
export const LANCIO_MS = 8_000
/** Quanto resta in vista il numero uscito, con le vincite, prima del giro dopo. */
export const FINE_RL_MS = 7_000
/** Gli ultimi numeri usciti, per il tabellone del tavolo. */
export const STORIA_RL = 15
/** Chi non si vede da tanto non e' piu' al tavolo: lo stesso tempo di chi e' online. */
export const ASSENTE_RL_MS = PRESENZA_ONLINE_MS

export type FaseRL = 'puntate' | 'giro'

export interface PostoRL {
  id: string
  /** Le puntate del giro: vuote per chi guarda e basta. */
  puntate: PuntateRL
  /** La giornata delle puntate: il giro si paga su quella, anche se parte dopo mezzanotte. */
  giorno: number
  /** A giro lanciato: quel che gli ha dato o tolto. */
  delta: number | null
  /** L'ultima volta che ha fatto qualcosa al tavolo: sedersi, puntare. */
  visto: number
}

export interface TavoloRL {
  giro: number
  fase: FaseRL
  /** Quando finiscono le puntate o il giro; null se non c'e' niente che scade. */
  scadenza: number | null
  posti: (PostoRL | null)[]
  /** Il lancio del giro: quando e' partita la biglia e il numero in cui si ferma. */
  lancio: { quando: number; numero: number } | null
  /** Gli ultimi numeri usciti, dal piu' recente. */
  storia: number[]
}

/** Quel che un cambio del tavolo chiede al database: i posti occupati e i conti della giornata. */
export type MovimentoRL =
  | { tipo: 'siede'; id: string }
  | { tipo: 'alza'; id: string }
  /** `prima` e' quel che c'era gia' sul panno: il saldo deve coprire solo la differenza. */
  | { tipo: 'punta'; id: string; giro: number; giorno: number; puntate: PuntateRL; prima: number }
  | { tipo: 'chiude'; id: string; giro: number; giorno: number; numero: number; delta: number }
  | { tipo: 'rimborsa'; id: string; giro: number; giorno: number }

export interface ContestoRL {
  adesso: number
  /** Il numero del lancio, a caso fra i trentasette. */
  estrai: () => number
  /** Chi ha la pagina della roulette aperta, per la presenza: per sapere chi aspettare. */
  presente: (id: string) => boolean
  /** Chi e' andato altrove nell'app dopo l'ultima cosa fatta al tavolo: non serve aspettarlo. */
  altrove?: (id: string, visto: number) => boolean
}

/** Un errore delle regole, con il codice che il server manda al telefono. */
export class RegolaRL extends Error {
  constructor(
    readonly codice: string,
    messaggio: string,
  ) {
    super(messaggio)
  }
}

export function tavoloRLNuovo(): TavoloRL {
  return {
    giro: 1,
    fase: 'puntate',
    scadenza: null,
    posti: Array<null>(POSTI_RL).fill(null),
    lancio: null,
    storia: [],
  }
}

export const sedutiRL = (t: TavoloRL) => t.posti.filter((p): p is PostoRL => p !== null)

export function postoRLDi(t: TavoloRL, id: string): number | null {
  const k = t.posti.findIndex((p) => p?.id === id)
  return k < 0 ? null : k
}

const haPuntato = (p: PostoRL) => totaleDi(p.puntate) > 0

/** La biglia e' ferma: da qui chi punta comincia il giro dopo. */
export const bigliaFerma = (t: TavoloRL, adesso: number) =>
  t.fase === 'giro' && t.lancio !== null && adesso >= t.lancio.quando + LANCIO_MS

export class BozzaRL {
  readonly t: TavoloRL
  readonly movimenti: MovimentoRL[] = []

  constructor(
    stato: TavoloRL,
    readonly c: ContestoRL,
  ) {
    this.t = structuredClone(stato)
  }

  /** Al tavolo davvero: non e' andato altrove, e ha la pagina aperta o ha fatto qualcosa da poco. */
  attivo(p: PostoRL): boolean {
    if (this.c.altrove?.(p.id, p.visto)) return false
    return this.c.presente(p.id) || this.c.adesso - p.visto < ASSENTE_RL_MS
  }

  vuoto(): boolean {
    return this.t.posti.every((p) => p === null)
  }

  private libera(k: number) {
    const p = this.t.posti[k]
    if (!p) return
    this.movimenti.push({ tipo: 'alza', id: p.id })
    this.t.posti[k] = null
  }

  siedi(id: string) {
    const gia = postoRLDi(this.t, id)
    if (gia !== null) {
      this.t.posti[gia]!.visto = this.c.adesso
      return
    }
    const k = this.t.posti.findIndex((p) => p === null)
    if (k < 0) throw new RegolaRL('PIENO', 'Il tavolo è pieno.')
    this.t.posti[k] = { id, puntate: {}, giorno: 0, delta: null, visto: this.c.adesso }
    this.movimenti.push({ tipo: 'siede', id })
  }

  /**
   * Alzarsi. Durante le puntate le fiches tornano; a biglia lanciata il giro
   * e' gia' pagato, e alzarsi lascia solo il posto.
   */
  alzati(id: string) {
    const k = postoRLDi(this.t, id)
    if (k === null) return
    const p = this.t.posti[k]!
    if (this.t.fase === 'puntate' && haPuntato(p)) {
      this.movimenti.push({ tipo: 'rimborsa', id, giro: this.t.giro, giorno: p.giorno })
    }
    this.libera(k)
  }

  /**
   * Le puntate per il giro `giro`, tutte insieme: prendono il posto di quelle
   * mandate prima, e vuote le ritirano. `saldo` e' quel che resta, con le
   * puntate di prima gia' tolte: deve coprire la differenza.
   */
  punta(id: string, giro: unknown, puntate: unknown, saldo: number, giorno: number) {
    const k = postoRLDi(this.t, id)
    if (k === null) throw new RegolaRL('NON_SEDUTO', 'Non sei seduto a questo tavolo.')
    // La biglia e' ferma e il numero si e' visto: chi punta comincia il giro dopo.
    if (bigliaFerma(this.t, this.c.adesso) && giro === this.t.giro + 1) this.nuovoGiro()
    if (this.t.fase !== 'puntate' || giro !== this.t.giro) {
      throw new RegolaRL('NON_ORA', 'Rien ne va plus: le puntate di questo giro sono chiuse.')
    }
    const nuove = leggiPuntate(puntate)
    if (!nuove) throw new RegolaRL('PUNTATA', 'Queste puntate il panno non le accetta.')
    const p = this.t.posti[k]
    if (!p) throw new RegolaRL('NON_SEDUTO', 'Non sei seduto a questo tavolo.')
    const prima = totaleDi(p.puntate)
    const totale = totaleDi(nuove)
    if (totale === 0) {
      if (prima > 0) this.movimenti.push({ tipo: 'rimborsa', id, giro: this.t.giro, giorno: p.giorno })
      p.puntate = {}
      p.visto = this.c.adesso
      return
    }
    if (totale - prima > saldo) {
      throw new RegolaRL(
        'POCHI_PUNTI',
        saldo + prima < PUNTATA_MINIMA_RL
          ? `Per giocare serve almeno ${PUNTATA_MINIMA_RL} punto di oggi.`
          : `Sul panno ci stanno al massimo ${saldo + prima} punti.`,
      )
    }
    // Il giorno resta quello della prima puntata del giro: si paga tutto su quello.
    if (prima === 0) p.giorno = giorno
    p.puntate = nuove
    p.visto = this.c.adesso
    this.movimenti.push({ tipo: 'punta', id, giro: this.t.giro, giorno: p.giorno, puntate: nuove, prima })
    // La prima puntata, con altri che ci sono, apre il tempo per le loro.
    if (this.t.scadenza === null && sedutiRL(this.t).some((q) => q.id !== id && this.attivo(q))) {
      this.t.scadenza = this.c.adesso + PUNTATE_RL_MS
    }
  }

  /** Il lancio: il numero, e subito i conti di tutti quelli che hanno puntato. */
  private lancia(quando: number) {
    const numero = this.c.estrai()
    for (const p of sedutiRL(this.t)) {
      if (!haPuntato(p)) continue
      p.delta = deltaDi(p.puntate, numero)
      this.movimenti.push({ tipo: 'chiude', id: p.id, giro: this.t.giro, giorno: p.giorno, numero, delta: p.delta })
    }
    this.t.fase = 'giro'
    this.t.lancio = { quando, numero }
    this.t.storia = [numero, ...this.t.storia].slice(0, STORIA_RL)
    this.t.scadenza = quando + LANCIO_MS + FINE_RL_MS
  }

  /** Il giro dopo: il panno si svuota, e chi non c'e' piu' lascia il posto. */
  private nuovoGiro() {
    this.t.giro += 1
    this.t.fase = 'puntate'
    this.t.scadenza = null
    this.t.lancio = null
    for (let k = 0; k < POSTI_RL; k += 1) {
      const p = this.t.posti[k]
      if (!p) continue
      if (!this.attivo(p)) this.libera(k)
      else Object.assign(p, { puntate: {}, giorno: 0, delta: null })
    }
  }

  /**
   * Le scadenze passate, una dopo l'altra, ognuna dalla sua ora: le puntate
   * che si chiudono con il lancio, il giro che lascia il posto a quello dopo.
   */
  avanza() {
    const { adesso } = this.c
    for (let passi = 0; passi < 16; passi += 1) {
      const t = this.t
      if (t.fase === 'puntate') {
        // Chi non ha puntato e non c'e' piu' lascia il posto: non lo si aspetta.
        for (let k = 0; k < POSTI_RL; k += 1) {
          const p = t.posti[k]
          if (p && !haPuntato(p) && !this.attivo(p)) this.libera(k)
        }
        if (!sedutiRL(t).some(haPuntato)) {
          t.scadenza = null
          return
        }
        if (sedutiRL(t).every((p) => haPuntato(p) || !this.attivo(p))) this.lancia(adesso)
        else if (t.scadenza !== null && adesso >= t.scadenza) this.lancia(t.scadenza)
        else return
      } else {
        if (t.scadenza !== null && adesso < t.scadenza) return
        this.nuovoGiro()
      }
    }
  }
}
