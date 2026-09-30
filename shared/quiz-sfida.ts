/**
 * La sfida a quiz fra due giocatori: le regole del tempo e dei punti.
 *
 * Si gioca sempre a tempo, sulle stesse domande, nello stesso momento. Il
 * primo che risponde giusto prende il punto e la domanda si chiude. Chi
 * sbaglia e' fuori da quella domanda, e all'altro il tempo che resta va al
 * rallentatore: scorre alla meta', cioe' dura il doppio. Se sbaglia anche lui,
 * o se il tempo finisce, il punto non e' di nessuno.
 *
 * La verita' sono le risposte, nell'ordine in cui le ha ricevute il server, con
 * l'istante in cui sono arrivate: da quelle e dall'ora di inizio si ricava
 * tutto il resto — quale domanda e' aperta, fino a quando per ciascuno, chi ha
 * preso i punti. Il tempo che finisce non si scrive: e' l'orologio a dirlo. E'
 * la stessa regola delle mosse dello Scarabeo e dei colpi della battaglia, e
 * fa del duello una scrittura per risposta, non una per secondo.
 *
 * E' un'amichevole: i punti non vanno in classifica e il duello non resta.
 */

import {
  CATEGORIE,
  CONTINENTI,
  FATTORE_LUNGA,
  MODI,
  RISPOSTE_LIBERE,
  ambitoValido,
  diGeografia,
  type CategoriaQuiz,
  type ModoQuiz,
} from './quiz'
import { NOMI_TIPI, type AreaQuiz, type Notorieta, type TipoDomanda } from './quiz-domande'

export type LatoSfida = 'a' | 'b'
export const LATI: readonly LatoSfida[] = ['a', 'b']

export function avversarioDi(lato: LatoSfida): LatoSfida {
  return lato === 'a' ? 'b' : 'a'
}

/** Quante domande puo' avere una sfida: una sfida lunga si gioca male a due, col telefono in mano. */
export const QUANTE_SFIDA = [5, 10, 15, 20] as const
/** I secondi per le domande a scelta; sulla cartina sono il doppio, come nella libera. */
export const SECONDI_SFIDA = [10, 15, 20] as const
export const SECONDI_SFIDA_PREDEFINITI = 15

/** Chi sbaglia rallenta l'altro: il tempo che gli resta scorre a questa frazione. */
export const RALLENTY = 2

/**
 * Quel che il server concede dopo la scadenza, per la rete. Meno della
 * classificata: qui la domanda si apre a un'ora che i due telefoni conoscono,
 * e l'orologio lo tengono sull'ora del server, non su quando arriva la risposta.
 */
export const MARGINE_SFIDA_MS = 1_000

/** La risposta giusta resta sullo schermo fra una domanda e l'altra, con la cartina che insegna. */
export const PAUSA_SFIDA_MS = 4_500

/** Dal momento in cui sono pronti tutti e due alla prima domanda: il tre, due, uno. */
export const VIA_SFIDA_MS = 3_200

/** Quanto si aspetta che l'altro arrivi nella pagina del duello, dopo che la sfida e' stata accettata. */
export const PRONTI_ENTRO_MS = 90_000

/** Un duello fermo da tanto non tiene piu' occupati i due: chi chiude l'app a meta' non resta "in sfida". */
export const DUELLO_FERMO_MS = 10 * 60_000

/** Quanto resta un duello, finito o no: poi si cancella. E' un'amichevole, e il conto non si tiene. */
export const DUELLO_CONSERVA_MS = 24 * 60 * 60_000

/** Una sfida a chi e' online aspetta due minuti, come quelle della battaglia; il link un'ora. */
export const SFIDA_QUIZ_LINK_MS = 60 * 60_000

/* ──────────────────────────────  Le impostazioni  ───────────────────────── */

/** Come si gioca una sfida: la partita la sceglie chi sfida, dentro i limiti di un duello. */
export interface ImpostazioniSfida {
  categoria: CategoriaQuiz
  modo: ModoQuiz
  area: AreaQuiz
  quante: (typeof QUANTE_SFIDA)[number]
  secondi: (typeof SECONDI_SFIDA)[number]
  /** Sulla cartina: si accende quel che si tocca, fuori zona non si tocca, i nomi dei paesi. */
  evidenzia: boolean
  soloZona: boolean
  nomiPaesi: boolean
  /** Fra una domanda e l'altra, la cartina con la risposta. */
  imparo: boolean
  /**
   * Come si fanno le domande, dalle opzioni avanzate della libera: servono a
   * rifarle uguali per la rivincita.
   */
  risposte?: number
  tipi?: TipoDomanda[]
  notorieta?: Notorieta
  bandieraCapitali?: boolean
  /** Per le altre materie, l'ambito: un periodo, un premio, un argomento. */
  ambito?: string
}

function si(valore: unknown, predefinito: boolean): boolean {
  return typeof valore === 'boolean' ? valore : predefinito
}

/**
 * Le impostazioni arrivate dal client, ripulite: null se non si puo' giocare
 * cosi'. Il numero di domande e i secondi prendono il valore ammesso piu'
 * vicino, invece di rifiutare: chi sceglie cinquanta domande nella libera e
 * poi sfida qualcuno si trova le venti di un duello.
 */
export function impostazioniSfida(valore: unknown): ImpostazioniSfida | null {
  const x = (valore ?? {}) as Record<string, unknown>
  const categoria = x.categoria as CategoriaQuiz
  const geografia = diGeografia(categoria)
  // Le altre materie non hanno ne' la cartina ne' le zone.
  const modo = geografia ? (x.modo as ModoQuiz) : 'scelta'
  const area = geografia && typeof x.area === 'string' ? x.area : 'mondo'
  if (!CATEGORIE.includes(categoria) || !MODI.includes(modo)) return null
  const areaBuona =
    area === 'mondo' || CONTINENTI.includes(area as (typeof CONTINENTI)[number]) || /^paese:[A-Z]{2}$/.test(area)
  if (!areaBuona) return null
  const vicino = <T extends number>(ammessi: readonly T[], n: unknown, predefinito: T): T => {
    const v = Number(n)
    if (!Number.isFinite(v)) return predefinito
    return ammessi.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a))
  }
  const tipi = Array.isArray(x.tipi) ? x.tipi.filter((t): t is TipoDomanda => typeof t === 'string' && t in NOMI_TIPI) : []
  const notorieta = x.notorieta === 'noti' || x.notorieta === 'rari' ? x.notorieta : 'misti'
  return {
    categoria,
    modo,
    area: area as AreaQuiz,
    quante: vicino(QUANTE_SFIDA, x.quante, 10),
    secondi: vicino(SECONDI_SFIDA, x.secondi, SECONDI_SFIDA_PREDEFINITI),
    evidenzia: si(x.evidenzia, true),
    soloZona: si(x.soloZona, true),
    nomiPaesi: si(x.nomiPaesi, false),
    imparo: si(x.imparo, true),
    risposte: vicino(RISPOSTE_LIBERE, x.risposte, 4),
    ...(tipi.length > 0 ? { tipi } : {}),
    notorieta,
    bandieraCapitali: si(x.bandieraCapitali, true),
    ...(geografia ? {} : { ambito: ambitoValido(categoria, x.ambito) }),
  }
}

/** Il tempo di una domanda: il doppio sulla cartina, dove un posto va cercato, e un terzo in piu' se si legge tanto. */
export function limiteMs(impostazioni: Pick<ImpostazioniSfida, 'secondi'>, sullaCartina: boolean, lunga = false): number {
  return Math.round(impostazioni.secondi * (sullaCartina ? 2 : lunga ? FATTORE_LUNGA : 1) * 1000)
}

/* ─────────────────────────────  Il giro del tempo  ──────────────────────── */

/** Una risposta come la tiene il server: di quale domanda, di chi, cosa, quando, e se era giusta. */
export interface RispostaSfida {
  i: number
  lato: LatoSfida
  scelta: string
  /** L'ora del server quando e' arrivata, in millisecondi. */
  t: number
  giusta: boolean
}

/** Una domanda del duello, com'e' andata o come sta andando. */
export interface GiroSfida {
  indice: number
  apertaAt: number
  /** Fino a quando puo' rispondere ciascuno: con il rallenty, se l'altro ha sbagliato. */
  scade: Record<LatoSfida, number>
  /** Da quando il tempo di ciascuno va al rallentatore; null se va normale. */
  lentoDa: Record<LatoSfida, number | null>
  risposte: RispostaSfida[]
  /** Chi ha preso il punto: il primo che ha risposto giusto. */
  punto: LatoSfida | null
  /** Quando si e' chiusa; null se e' ancora aperta. */
  chiusaAt: number | null
}

export interface StatoSfida {
  /** Le domande chiuse, e quella aperta se ce n'e' una. */
  giri: GiroSfida[]
  /** La domanda di adesso, o la prossima durante la pausa; il totale a duello finito. */
  corrente: number
  /** Nella pausa (o prima della prima domanda), quando si apre la prossima. */
  prossimaAt: number | null
  finito: boolean
  punti: Record<LatoSfida, number>
}

/**
 * Lo stato del duello a un'ora data. `limiti` e' il tempo di ogni domanda,
 * `risposte` sono nell'ordine di arrivo: e' l'ordine, non l'istante, a dire chi
 * e' arrivato prima quando due risposte cadono nello stesso millisecondo.
 */
export function statoSfida(
  inizioAt: number,
  limiti: readonly number[],
  risposte: readonly RispostaSfida[],
  adesso: number,
): StatoSfida {
  const giri: GiroSfida[] = []
  const punti: Record<LatoSfida, number> = { a: 0, b: 0 }
  let apre = inizioAt
  for (let i = 0; i < limiti.length; i += 1) {
    if (adesso < apre) return { giri, corrente: i, prossimaAt: apre, finito: false, punti }
    const scade: Record<LatoSfida, number> = { a: apre + limiti[i], b: apre + limiti[i] }
    const lentoDa: Record<LatoSfida, number | null> = { a: null, b: null }
    const fuori: Record<LatoSfida, boolean> = { a: false, b: false }
    const qui = risposte.filter((r) => r.i === i)
    let punto: LatoSfida | null = null
    let chiusaAt: number | null = null
    for (const r of qui) {
      if (r.giusta) {
        punto = r.lato
        chiusaAt = r.t
        break
      }
      fuori[r.lato] = true
      const altro = avversarioDi(r.lato)
      if (fuori[altro]) {
        chiusaAt = r.t
        break
      }
      // Il tempo che resta all'altro va al rallentatore: dura il doppio.
      scade[altro] = r.t + Math.max(0, scade[altro] - r.t) * RALLENTY
      lentoDa[altro] = r.t
    }
    if (chiusaAt === null) {
      const ultima = Math.max(...LATI.filter((l) => !fuori[l]).map((l) => scade[l])) + MARGINE_SFIDA_MS
      if (adesso >= ultima) chiusaAt = ultima
    }
    giri.push({ indice: i, apertaAt: apre, scade, lentoDa, risposte: qui, punto, chiusaAt })
    if (punto) punti[punto] += 1
    if (chiusaAt === null) return { giri, corrente: i, prossimaAt: null, finito: false, punti }
    apre = chiusaAt + PAUSA_SFIDA_MS
  }
  return { giri, corrente: limiti.length, prossimaAt: null, finito: true, punti }
}

/**
 * Se un giocatore puo' ancora rispondere alla domanda aperta: non ha risposto,
 * e il suo tempo — margine compreso — non e' finito.
 */
export function puoRispondere(giro: GiroSfida | undefined, lato: LatoSfida, adesso: number): boolean {
  if (!giro || giro.chiusaAt !== null) return false
  if (giro.risposte.some((r) => r.lato === lato)) return false
  return adesso <= giro.scade[lato] + MARGINE_SFIDA_MS
}

/**
 * I secondi che mostra l'orologio di chi e' al rallentatore: scorrono alla
 * meta', quindi quel che resta davvero diviso per il rallenty. E' cosi' che il
 * tempo "rallenta" invece di raddoppiare: il numero e' lo stesso di prima, e
 * scende piano.
 */
export function secondiMostrati(restaMs: number, lento: boolean): number {
  return Math.max(0, Math.ceil((lento ? restaMs / RALLENTY : restaMs) / 1000))
}
