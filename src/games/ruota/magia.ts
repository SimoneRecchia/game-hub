/**
 * I tempi delle magie della fortuna: la ruota che diventa la ruota fortunata,
 * e i moltiplicatori che salgono sulla ruota del quiz, sul Pachinko e sul muro
 * del Cash Hunt. Le animazioni sono nel CSS, con il ritardo di ogni spicchio,
 * buca o casella scritto nel suo stile; i suoni li fa partire chi le mostra con
 * gli stessi numeri, così si sente quel che si vede.
 */
import {
  MOLTIPLICATORI_PACHINKO,
  MOLTIPLICATORI_PACHINKO_FORTUNATI,
  MOLTIPLICATORI_QUIZ,
  MOLTIPLICATORI_QUIZ_FORTUNATI,
  MURO_CASH_HUNT,
  MURO_CASH_HUNT_FORTUNATO,
  POSTO_FORTUNA,
  SPICCHI_FORTUNATI,
  SPICCHI_RUOTA,
  eSfida,
} from '@shared/ruota'

/** Un passo del conto: il valore, e quando compare, dall'inizio della magia. */
export interface PassoDelConto {
  valore: number
  ms: number
}

/**
 * Il conto di un premio che sale, da `da` ad `a` di `scatto` alla volta: veloce
 * all'inizio e piu' lento verso la fine, come i contatori delle slot, così
 * l'ultimo arriva con il suo peso.
 */
export function conto(da: number, a: number, inizio: number, scatto = 1): PassoDelConto[] {
  const passi = Math.round((a - da) / scatto)
  let t = inizio
  return Array.from({ length: passi + 1 }, (_, k) => {
    if (k > 0) t += 85 + 175 * ((k - 1) / Math.max(1, passi - 1)) ** 2
    return { valore: da + k * scatto, ms: Math.round(t) }
  })
}

/** Quanto ci mette uno spicchio a girarsi: meta' se ne va, meta' arriva gia' fortunato. */
export const GIRA_MS = 240
export const ARRIVA_MS = 440

/* ─────────────────────────────  La ruota fortunata  ───────────────────────────── */

const N = SPICCHI_RUOTA.length
const distanza = (a: number, b: number) => Math.min(Math.abs(a - b), N - Math.abs(a - b))

/** Il ×10 della ruota fortunata: e' il posto del triplo, e arriva per ultimo. */
export const POSTO_DIECI = SPICCHI_FORTUNATI.findIndex((s) => s.tipo === 'fisso' && s.moltiplicatore === 10)

const INIZIO_RUOTA_MS = 200
const PASSO_RUOTA_MS = 230

/**
 * Quando tocca a uno spicchio: due ondate partono dalla fortuna, che e' sotto
 * la lancetta, una per parte, e si incontrano dall'altra parte della ruota, sul
 * triplo, che sale per ultimo fino al ×10.
 */
export function passoDellaRuota(i: number): number {
  const d = distanza(i, POSTO_FORTUNA)
  return i === POSTO_DIECI ? d + 1 : d
}

export const ritardoDellaRuota = (i: number) => INIZIO_RUOTA_MS + passoDellaRuota(i) * PASSO_RUOTA_MS

/**
 * Uno spicchio che sulla ruota fortunata e' un altro, o un minigioco della
 * fortuna, che ha l'oro sul bordo: si gira.
 */
export function cambiaConLaFortuna(i: number): boolean {
  const [prima, dopo] = [SPICCHI_RUOTA[i], SPICCHI_FORTUNATI[i]]
  if (eSfida(dopo)) return true
  if (prima.tipo !== dopo.tipo) return true
  return prima.tipo === 'fisso' && dopo.tipo === 'fisso' && prima.moltiplicatore !== dopo.moltiplicatore
}

/** Il triplo che sale fino al ×10, un intero alla volta. */
export const CONTO_DIECI = conto(3, 10, ritardoDellaRuota(POSTO_DIECI))

/** Quando la ruota fortunata e' pronta: il ×10 e' arrivato, e lo scoppio e' passato. */
export const DURATA_MAGIA_MS = CONTO_DIECI[CONTO_DIECI.length - 1].ms + 900

/** I passi dei premi che salgono, prima del gran finale: per i suoni. */
export const PASSI_RUOTA = [...new Set(SPICCHI_RUOTA.map((_, i) => i).filter(cambiaConLaFortuna).map(passoDellaRuota))]
  .filter((p) => p < passoDellaRuota(POSTO_DIECI))
  .sort((a, b) => a - b)
  .map((p) => INIZIO_RUOTA_MS + p * PASSO_RUOTA_MS + GIRA_MS)

/* ─────────────────────────────  I moltiplicatori che salgono  ───────────────────────────── */

/**
 * La magia di una fila di moltiplicatori che salgono con la fortuna: la ruota
 * del quiz, le buche del Pachinko, le caselle del Cash Hunt. Salgono un valore
 * alla volta, dal piu' piccolo, tutti i posti di un valore insieme; il piu'
 * grande per ultimo, contando fino al suo valore della fortuna.
 */
export interface Aumento {
  /** Quando sale il moltiplicatore di un posto. */
  ritardo: (i: number) => number
  /** I posti del moltiplicatore piu' grande, che sale contando. */
  massimi: readonly number[]
  conto: readonly PassoDelConto[]
  /** Quando si puo' giocare: l'ultimo numero e' arrivato, e lo scoppio e' passato. */
  durata: number
  /** Quando sale ogni valore prima del piu' grande: per i suoni. */
  passi: readonly number[]
}

function aumento(prima: readonly number[], dopo: readonly number[], inizio: number, passo: number, scatto = 1) {
  const valori = [...new Set(prima)].sort((a, b) => a - b)
  const ritardo = (i: number) => inizio + valori.indexOf(prima[i]) * passo
  const piuGrande = valori[valori.length - 1]
  const massimi = prima.flatMap((v, i) => (v === piuGrande ? [i] : []))
  const contato = conto(piuGrande, dopo[massimi[0]], ritardo(massimi[0]), scatto)
  const passi = valori.slice(0, -1).map((_, k) => inizio + k * passo + GIRA_MS)
  return { ritardo, massimi, conto: contato, durata: contato[contato.length - 1].ms + 800, passi } satisfies Aumento
}

/** La ruota del quiz: il ×4 conta fino al ×10. */
export const AUMENTO_QUIZ = aumento(MOLTIPLICATORI_QUIZ, MOLTIPLICATORI_QUIZ_FORTUNATI, 450, 430)

/** Le buche del Pachinko: i due ×15 ai lati contano fino al ×30, di tre in tre. */
export const AUMENTO_PACHINKO = aumento(MOLTIPLICATORI_PACHINKO, MOLTIPLICATORI_PACHINKO_FORTUNATI, 400, 380, 3)

/** Il muro del Cash Hunt, scoperto dal piu' grande: il ×5 conta fino al ×10. */
export const AUMENTO_CASH_HUNT = aumento(MURO_CASH_HUNT, MURO_CASH_HUNT_FORTUNATO, 400, 380)

export const ritardoDelQuiz = AUMENTO_QUIZ.ritardo
export const POSTO_QUATTRO = AUMENTO_QUIZ.massimi[0]
export const CONTO_QUIZ = AUMENTO_QUIZ.conto
export const DURATA_AUMENTO_MS = AUMENTO_QUIZ.durata
export const PASSI_QUIZ = AUMENTO_QUIZ.passi
