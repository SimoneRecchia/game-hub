/**
 * La stanza online di Lupus in fabula: quel che si dicono il telefono e il
 * server, e i controlli che il server fa su quel che arriva.
 *
 * Una stanza ha un codice di quattro lettere, chi l'ha creata (che conduce la
 * partita) e chi c'e' dentro. Prima della partita si aspettano gli altri e si
 * sceglie come giocare: il mazzo, automatico dal numero di giocatori o deciso
 * personaggio per personaggio, e le regole della variante. Poi la partita
 * gira sul server con lo stesso motore del telefono che passa di mano
 * (lupus.ts), e ognuno riceve solo la sua vista (lupus-vista.ts).
 *
 * Non ci sono connessioni aperte: il telefono chiede la stanza ogni pochi
 * secondi (`LUPUS_POLL_MS`), e i tempi della discussione e delle arringhe li
 * applica la prima richiesta che arriva dopo, da chiunque venga.
 */

import { IMPOSTAZIONI_LUPUS, type AzioneLupus, type ImpostazioniLupus, type SceltaNotturna } from './lupus'
import { GIOCATORI_MASSIMI, type Composizione } from './lupus-composizione'
import { TUTTI_I_PERSONAGGI, type IdPersonaggio } from './lupus-personaggi'
import type { VistaGiocatore } from './lupus-vista'
import type { GiocatoreBreve } from './types'

/** Le lettere dei codici: niente I e O, che si confondono con 1 e 0. */
export const ALFABETO_CODICE_LUPUS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
export const LUNGHEZZA_CODICE_LUPUS = 4

export function codiceLupusValido(x: unknown): x is string {
  return typeof x === 'string' && new RegExp(`^[${ALFABETO_CODICE_LUPUS}]{${LUNGHEZZA_CODICE_LUPUS}}$`).test(x)
}

/** Un codice scritto a mano: maiuscolo, senza spazi. */
export function codiceDaTesto(testo: string): string {
  return testo.replace(/\s+/g, '').toUpperCase().slice(0, LUNGHEZZA_CODICE_LUPUS)
}

/** Una stanza ferma da tanto si cancella quando se ne apre una nuova: nessuno torna a una partita di ieri. */
export const LUPUS_STANZA_FERMA_MS = 12 * 60 * 60_000

/** Un invito a una stanza vale due ore, come quelli delle libere in compagnia: si gioca adesso. */
export const LUPUS_INVITO_MS = 2 * 60 * 60_000

/** Il giro di controllo della stanza: durante la partita, e prima, quando si aspettano gli altri. */
export const LUPUS_POLL_MS = 2_500
export const LUPUS_POLL_ATTESA_MS = 4_000

/**
 * Chi conduce manda avanti le fasi. Se non si fa vedere da tanto, la partita
 * non resta ferma: la puo' mandare avanti chiunque sia nella stanza.
 */
export const LUPUS_CONDUTTORE_ASSENTE_MS = 90_000

export type StatoStanzaLupus = 'attesa' | 'partita' | 'finita'

export interface ImpostazioniStanzaLupus {
  regole: ImpostazioniLupus
  /** Il mazzo scelto a mano; null e' quello del regolamento per il numero di giocatori. */
  composizione: Composizione | null
}

export const IMPOSTAZIONI_STANZA_LUPUS: ImpostazioniStanzaLupus = {
  regole: IMPOSTAZIONI_LUPUS,
  composizione: null,
}

export interface IscrittoStanzaLupus extends GiocatoreBreve {
  conduce: boolean
  online: boolean
}

/** La stanza come la vede un giocatore. */
export interface VistaStanzaLupus {
  codice: string
  stato: StatoStanzaLupus
  io: string
  /** Sono io a condurre: posso cambiare le impostazioni, mandare via e mandare avanti. */
  conduco: boolean
  /** Chi conduce non si fa vedere da un po': chiunque puo' mandare avanti la partita. */
  conduttoreAssente: boolean
  iscritti: IscrittoStanzaLupus[]
  impostazioni: ImpostazioniStanzaLupus
  /** La partita come la vedo io, se e' cominciata. */
  partita: VistaGiocatore | null
  versione: number
  /** L'ora del server, per gli orologi della discussione e delle arringhe. */
  adesso: number
}

/** Un invito a una stanza, come arriva con la presenza. */
export interface InvitoLupus {
  id: string
  codice: string
  da: GiocatoreBreve
  /** Quanti sono gia' nella stanza. */
  iscritti: number
  createdAt: string
}

/** La stanza in cui sono, in breve: per tornarci dalle Libere. */
export interface StanzaLupusBreve {
  codice: string
  stato: StatoStanzaLupus
  iscritti: number
}

/** Le azioni che manda un telefono: chi le fa lo sa il server, dalla sessione. */
export type AzioneLupusDalTelefono =
  | { tipo: 'ruolo_visto' }
  | { tipo: 'notte'; scelta: SceltaNotturna }
  | { tipo: 'voto'; bersaglio: string | null }
  | { tipo: 'benvenuto'; rivela?: boolean }
  | { tipo: 'avanti' }

export class AzioneNonValida extends Error {}

function sceltaNotturna(x: unknown): SceltaNotturna {
  const s = (x ?? {}) as Record<string, unknown>
  switch (s.tipo) {
    case 'indica':
      if (typeof s.bersaglio !== 'string' || s.bersaglio.length === 0 || s.bersaglio.length > 80) break
      return { tipo: 'indica', bersaglio: s.bersaglio }
    case 'potere':
      if (typeof s.usa !== 'boolean') break
      return { tipo: 'potere', usa: s.usa }
    case 'nessuno':
      return { tipo: 'nessuno' }
    case 'letto':
      return { tipo: 'letto' }
  }
  throw new AzioneNonValida('Scelta della notte non valida.')
}

/**
 * L'azione del motore per quel che ha mandato un telefono: il giocatore e'
 * sempre chi l'ha mandata, e "avanti" lo puo' dire solo chi conduce (o
 * chiunque, se chi conduce e' assente). Quel che non si capisce non arriva al
 * motore.
 */
export function azioneDelGiocatore(x: unknown, io: string, puoMandareAvanti: boolean): AzioneLupus {
  const a = (x ?? {}) as Record<string, unknown>
  switch (a.tipo) {
    case 'ruolo_visto':
      return { tipo: 'ruolo_visto', giocatore: io }
    case 'notte':
      return { tipo: 'notte', giocatore: io, scelta: sceltaNotturna(a.scelta) }
    case 'voto': {
      const bersaglio = a.bersaglio
      if (bersaglio !== null && (typeof bersaglio !== 'string' || bersaglio.length === 0 || bersaglio.length > 80)) {
        throw new AzioneNonValida('Voto non valido.')
      }
      return { tipo: 'voto', giocatore: io, bersaglio }
    }
    case 'benvenuto':
      return { tipo: 'benvenuto', giocatore: io, ...(a.rivela === true ? { rivela: true } : {}) }
    case 'avanti':
      if (!puoMandareAvanti) throw new AzioneNonValida('Solo chi conduce manda avanti la partita.')
      return { tipo: 'avanti' }
  }
  throw new AzioneNonValida('Azione sconosciuta.')
}

const secondi = (x: unknown, predefinito: number, massimo: number) =>
  typeof x === 'number' && Number.isFinite(x) ? Math.min(massimo, Math.max(0, Math.round(x))) : predefinito

/** Le regole di una stanza, da quel che manda chi conduce: quel che manca o non va resta com'era. */
export function regoleValide(x: unknown, prima: ImpostazioniLupus = IMPOSTAZIONI_LUPUS): ImpostazioniLupus {
  const r = (x ?? {}) as Record<string, unknown>
  const si = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  return {
    primaNotteSenzaVittime: si(r.primaNotteSenzaVittime, prima.primaNotteSenzaVittime),
    fantasmiVotano: si(r.fantasmiVotano, prima.fantasmiVotano),
    gufoLetale: ['auto', 'si', 'no'].includes(r.gufoLetale as string)
      ? (r.gufoLetale as ImpostazioniLupus['gufoLetale'])
      : prima.gufoLetale,
    rivelaRuoloAllaMorte: si(r.rivelaRuoloAllaMorte, prima.rivelaRuoloAllaMorte),
    secondiDiscussione: secondi(r.secondiDiscussione, prima.secondiDiscussione, 30 * 60),
    secondiArringhe: secondi(r.secondiArringhe, prima.secondiArringhe, 10 * 60),
  }
}

/**
 * Un mazzo scelto a mano: solo personaggi che esistono, in numeri interi e non
 * oltre i giocatori possibili. null vuol dire il mazzo del regolamento. Se il
 * mazzo si puo' giocare lo dice `controllaComposizione` al momento del via,
 * quando si sa quanti sono.
 */
export function composizioneValida(x: unknown): Composizione | null {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return null
  const c: Composizione = {}
  for (const [id, n] of Object.entries(x as Record<string, unknown>)) {
    if (!TUTTI_I_PERSONAGGI.includes(id as IdPersonaggio)) continue
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) continue
    c[id as IdPersonaggio] = Math.min(n, GIOCATORI_MASSIMI)
  }
  return Object.keys(c).length > 0 ? c : null
}

/** Le impostazioni di una stanza, da quel che manda chi conduce, sopra quelle che c'erano. */
export function impostazioniStanzaValide(x: unknown, prima: ImpostazioniStanzaLupus): ImpostazioniStanzaLupus {
  const i = (x ?? {}) as Record<string, unknown>
  return {
    regole: 'regole' in i ? regoleValide(i.regole, prima.regole) : prima.regole,
    composizione: 'composizione' in i ? composizioneValida(i.composizione) : prima.composizione,
  }
}
