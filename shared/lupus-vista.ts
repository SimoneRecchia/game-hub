/**
 * Quel che un giocatore puo' vedere della partita, e quel che deve fare adesso.
 * E' l'unica cosa che esce dal motore verso un'interfaccia: il server la manda
 * a ognuno, il telefono che passa di mano la mostra a chi lo ha in mano.
 *
 * `vistaDelTavolo` e' la parte senza segreti, quella che si potrebbe mostrare a
 * tutti insieme; `vistaPer` le aggiunge il giocatore (`tu`), che cosa deve fare
 * (`richiesta`), se l'ha gia' fatto (`fatto`) e quel che ha saputo di notte
 * (`segreti`). I ruoli degli altri si vedono solo quando sono pubblici — il
 * Mortovivo ucciso, Amleto e Dorian che si rivelano, la variante che li dice
 * alla morte — o a partita finita. I voti delle nomine si vedono man mano, come
 * le mani alzate; quelli del ballottaggio sono segreti, e se ne vede solo il
 * conteggio.
 *
 * Di notte nessuno aspetta nessuno (`aspetta` e' vuoto): sapere chi deve ancora
 * scegliere direbbe chi ha un potere. E prima della fine non si dice perché e'
 * morto qualcuno, come non lo dice il moderatore: "guardato dal Veggente"
 * direbbe che c'e' un Veggente e che il morto era il Criceto. Restano le morti
 * che tutti hanno visto, il linciaggio, e quelle dei segnalini sul tavolo, il
 * teschio di Amleto e il ritratto di Dorian Wolf. Per la stessa ragione chi di notte non
 * ha niente da fare riceve comunque una richiesta, `dormi`, e nel telefono che
 * passa di mano finge di scegliere come gli altri.
 */

import {
  bersaglioDelBaron,
  bersagliDellaNotte,
  cercaGiocatore,
  chiAspetta,
  chiaveDi,
  compagniDi,
  compitiDi,
  fazioneDi,
  malvagiVivi,
  mannaro,
  nominabili,
  ruoloAttuale,
  sceltaDiMorte,
  votantiDelBallottaggio,
  votantiDelleNomine,
  type EsitoBallottaggio,
  type CausaDiMorte,
  type EventoLupus,
  type FaseLupus,
  type ImpostazioniLupus,
  type PartitaLupus,
  type ResocontoAlba,
  type SceltaDiMorte,
  type SegretoLupus,
  type TipoCompito,
  type VincitoreLupus,
} from './lupus'
import type { Fazione, IdPersonaggio } from './lupus-personaggi'

export interface GiocatoreAlTavolo {
  id: string
  nome: string
  posto: number
  vivo: boolean
  nonMorto: boolean
  /** Il ruolo, solo se e' pubblico: il Mortovivo ucciso, chi si e' rivelato, la variante che lo dice, la fine. */
  ruolo?: IdPersonaggio
}

/** Un fatto della cronaca come lo vede il tavolo: di una morte, la causa solo se e' pubblica. */
export type EventoVisto =
  | Exclude<EventoLupus, { t: 'morte' }>
  | { t: 'morte'; giocatore: string; causa?: CausaDiMorte; pubblica: boolean }

/** Le cause di morte che il tavolo sa prima della fine: quelle che si sono viste, o che dicono i segnalini. */
const CAUSE_PUBBLICHE: ReadonlySet<CausaDiMorte> = new Set(['linciaggio', 'teschio', 'ritratto'])

/** Che cosa deve fare adesso il giocatore. */
export type RichiestaLupus =
  | { tipo: 'ruolo' }
  | {
      tipo: 'indica'
      compito: TipoCompito
      bersagli: string[]
      facoltativo: boolean
      /** Per i lupi: che cosa hanno scelto finora gli altri del branco. */
      branco?: { id: string; scelta: string | null }[]
    }
  | { tipo: 'conferma'; compito: 'resuscitare'; bersaglio: string }
  | { tipo: 'notizia'; compito: TipoCompito; testo: string; giocatori?: string[] }
  /** Vivo ma senza niente da fare: nel telefono che passa di mano si finge di scegliere. */
  | { tipo: 'dormi' }
  | { tipo: 'fantasma' }
  /** Sei appena morto: prendine atto; Amleto e Dorian Wolf possono rivelarsi. */
  | { tipo: 'benvenuto'; scelta: SceltaDiMorte | null }
  | { tipo: 'vota'; fase: 'nomine' | 'ballottaggio'; bersagli: string[]; astensione: boolean }
  | { tipo: 'aspetta' }

/** La vista "del tavolo": quel che tutti possono vedere insieme, senza segreti. */
export interface VistaTavolo {
  fase: FaseLupus
  notte: number
  giorno: number
  impostazioni: ImpostazioniLupus
  giocatori: GiocatoreAlTavolo[]
  /**
   * Chi deve ancora fare la sua parte, solo nelle fasi pubbliche: i ruoli, la
   * decisione, le votazioni. Di notte e' sempre vuoto: sapere chi sta ancora
   * scegliendo direbbe chi ha un potere.
   */
  aspetta: string[]
  inizioFase: number
  fineFase: number | null
  alba: ResocontoAlba | null
  indiziati: string[]
  /** I voti delle nomine, pubblici, man mano che arrivano. */
  votiNomine: Record<string, string | null>
  ordineDiVoto: string[]
  conteggioNomine: Record<string, number> | null
  /** I voti del ballottaggio sono segreti: se ne vede solo il conteggio finale. */
  esitoBallottaggio: EsitoBallottaggio | null
  benvenuto: string | null
  /** I segnalini dell'espansione, sul tavolo: chi ha il teschio di Amleto e chi il ritratto di Dorian Wolf. */
  teschio: string | null
  ritratto: string | null
  /** Nella fase della decisione: se si viene dalla notte o dal linciaggio. */
  decisioneDa: 'notte' | 'giorno' | null
  cronaca: EventoVisto[]
  esito: { vincitore: VincitoreLupus; vincitori: string[]; ruoli: Record<string, IdPersonaggio> } | null
}

/** La vista di un giocatore: il tavolo, piu' i suoi segreti e che cosa deve fare. */
export interface VistaGiocatore extends VistaTavolo {
  tu: {
    id: string
    ruolo: IdPersonaggio
    ruoloAssunto?: IdPersonaggio
    fazione: Fazione
    vivo: boolean
    nonMorto: boolean
    compagni: string[]
  }
  richiesta: RichiestaLupus
  /** Ha gia' fatto la sua parte in questa fase. */
  fatto: boolean
  segreti: SegretoLupus[]
}

export function giocatoriAlTavolo(partita: PartitaLupus): GiocatoreAlTavolo[] {
  const finita = partita.fase === 'finita'
  return [...partita.giocatori]
    .sort((a, b) => a.posto - b.posto)
    .map((g) => ({
      id: g.id,
      nome: g.nome,
      posto: g.posto,
      vivo: g.vivo,
      nonMorto: g.nonMorto ?? false,
      ruolo: finita || g.rivelato ? ruoloAttuale(g) : undefined,
    }))
}

export function richiestaPer(partita: PartitaLupus, id: string): RichiestaLupus {
  const io = cercaGiocatore(partita, id)
  switch (partita.fase) {
    case 'ruoli':
      return { tipo: 'ruolo' }
    case 'decisione':
      if (partita.decisione?.attesi.includes(id)) {
        return { tipo: 'benvenuto', scelta: sceltaDiMorte(partita, id) }
      }
      return { tipo: 'aspetta' }
    case 'notte': {
      const compiti = compitiDi(partita, id)
      // Chi ha finito vede ancora il primo dei suoi compiti, con `fatto`: cosi' il Veggente legge la risposta
      // prima di passare il telefono.
      const compito = compiti.find((c) => !(chiaveDi(c) in partita.scelte)) ?? compiti[0]
      if (!compito) return io.vivo ? { tipo: 'dormi' } : { tipo: 'fantasma' }
      switch (compito.tipo) {
        case 'sbranare': {
          const branco = partita.giocatori.filter(
            (g) => g.id !== id && g.vivo && compitiDi(partita, g.id).some((c) => c.tipo === 'sbranare'),
          )
          return {
            tipo: 'indica',
            compito: compito.tipo,
            facoltativo: false,
            bersagli: bersagliDellaNotte(partita, id, compito.tipo),
            branco: branco.map((g) => {
              const s = partita.scelte[g.id]
              return { id: g.id, scelta: s && s.tipo === 'indica' ? s.bersaglio : null }
            }),
          }
        }
        case 'proteggere':
        case 'scrutare':
        case 'gufare':
        case 'imitare':
        case 'pozione':
        case 'teschio':
        case 'ritratto':
        case 'passa_teschio':
          return {
            tipo: 'indica',
            compito: compito.tipo,
            facoltativo: compito.facoltativo,
            bersagli: bersagliDellaNotte(partita, id, compito.tipo),
          }
        case 'resuscitare':
          return { tipo: 'conferma', compito: 'resuscitare', bersaglio: bersaglioDelBaron(partita, io)! }
        case 'branco':
          return {
            tipo: 'notizia',
            compito: compito.tipo,
            testo: 'Stanotte il branco si riconosce soltanto.',
            giocatori: compagniDi(partita, id),
          }
        case 'loggia':
          return {
            tipo: 'notizia',
            compito: compito.tipo,
            testo: 'Vi riconoscete: potete fidarvi a vicenda.',
            giocatori: compagniDi(partita, id),
          }
        case 'sogno':
          return {
            tipo: 'notizia',
            compito: compito.tipo,
            testo: 'Sogni il branco: ecco chi sono i lupi mannari.',
            giocatori: compagniDi(partita, id),
          }
        case 'seduta': {
          if (!partita.ultimoLinciato) {
            return { tipo: 'notizia', compito: compito.tipo, testo: 'Oggi nessuno è stato linciato.' }
          }
          const l = cercaGiocatore(partita, partita.ultimoLinciato)
          return {
            tipo: 'notizia',
            compito: compito.tipo,
            testo: mannaro(l) ? `${l.nome} era un lupo mannaro.` : `${l.nome} non era un lupo mannaro.`,
            giocatori: [l.id],
          }
        }
        case 'indagine': {
          const n = malvagiVivi(partita)
          return {
            tipo: 'notizia',
            compito: compito.tipo,
            testo: n === 1 ? 'C’è ancora 1 malvagio vivo.' : `Ci sono ancora ${n} malvagi vivi.`,
          }
        }
      }
      break
    }
    case 'nomine':
      if (votantiDelleNomine(partita).includes(id)) {
        return { tipo: 'vota', fase: 'nomine', bersagli: nominabili(partita, id), astensione: false }
      }
      return { tipo: 'aspetta' }
    case 'ballottaggio':
      if (votantiDelBallottaggio(partita).includes(id)) {
        return { tipo: 'vota', fase: 'ballottaggio', bersagli: partita.indiziati, astensione: true }
      }
      return { tipo: 'aspetta' }
    default:
      return { tipo: 'aspetta' }
  }
  return { tipo: 'aspetta' }
}

export function vistaDelTavolo(partita: PartitaLupus): VistaTavolo {
  const pubblica = partita.fase !== 'notte'
  const finita = partita.fase === 'finita'
  const sidice = (c: CausaDiMorte) => finita || CAUSE_PUBBLICHE.has(c)
  return {
    fase: partita.fase,
    notte: partita.notte,
    giorno: partita.giorno,
    impostazioni: partita.impostazioni,
    giocatori: giocatoriAlTavolo(partita),
    aspetta: pubblica ? chiAspetta(partita) : [],
    inizioFase: partita.inizioFase,
    fineFase: partita.fineFase,
    alba: partita.alba && {
      ...partita.alba,
      cause: Object.fromEntries(Object.entries(partita.alba.cause).filter(([, c]) => sidice(c))),
    },
    indiziati: partita.indiziati,
    votiNomine: partita.fase === 'nomine' ? partita.voti : {},
    ordineDiVoto: partita.ordineDiVoto,
    conteggioNomine: partita.conteggioNomine,
    esitoBallottaggio: partita.esitoBallottaggio,
    benvenuto: partita.benvenuto,
    teschio: partita.teschio,
    ritratto: partita.ritratto,
    decisioneDa: partita.decisione?.da ?? null,
    cronaca: partita.cronaca.map((e): EventoVisto => {
      if (e.t !== 'morte' || sidice(e.causa)) return e
      const { causa: _causa, ...resto } = e
      return resto
    }),
    esito: partita.esito
      ? {
          ...partita.esito,
          ruoli: Object.fromEntries(partita.giocatori.map((g) => [g.id, ruoloAttuale(g)])),
        }
      : null,
  }
}

export function vistaPer(partita: PartitaLupus, id: string): VistaGiocatore {
  const io = cercaGiocatore(partita, id)
  const fatto = (() => {
    switch (partita.fase) {
      case 'ruoli':
        return partita.visti.includes(id)
      case 'notte': {
        const compiti = compitiDi(partita, id)
        return compiti.length > 0 && compiti.every((c) => chiaveDi(c) in partita.scelte)
      }
      case 'decisione':
        return !partita.decisione?.attesi.includes(id)
      case 'nomine':
      case 'ballottaggio':
        return id in partita.voti
      default:
        return false
    }
  })()
  return {
    ...vistaDelTavolo(partita),
    tu: {
      id: io.id,
      ruolo: io.ruolo,
      ruoloAssunto: io.ruoloAssunto,
      fazione: fazioneDi(io),
      vivo: io.vivo,
      nonMorto: io.nonMorto ?? false,
      compagni: compagniDi(partita, id),
    },
    richiesta: richiestaPer(partita, id),
    fatto,
    segreti: partita.segreti[id] ?? [],
  }
}
