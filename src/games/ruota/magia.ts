/**
 * I tempi delle due magie della fortuna: la ruota che diventa la ruota
 * fortunata, e la ruota del quiz che sale. Le animazioni sono nel CSS
 * (disegni.css), con il ritardo di ogni spicchio scritto nel suo stile; i suoni
 * li fa partire la pagina con gli stessi numeri, così si sente quel che si vede.
 */
import {
  MOLTIPLICATORI_QUIZ,
  POSTO_FORTUNA,
  SPICCHI_FORTUNATI,
  SPICCHI_RUOTA,
  type Spicchio,
} from '@shared/ruota'

/** Un passo del conto: il valore, e quando compare, dall'inizio della magia. */
export interface PassoDelConto {
  valore: number
  ms: number
}

/**
 * Il conto di un premio che sale, da `da` ad `a` un intero alla volta: veloce
 * all'inizio e piu' lento verso la fine, come i contatori delle slot, così
 * l'ultimo arriva con il suo peso.
 */
export function conto(da: number, a: number, inizio: number): PassoDelConto[] {
  const passi = a - da
  let t = inizio
  return Array.from({ length: passi + 1 }, (_, k) => {
    if (k > 0) t += 85 + 175 * ((k - 1) / Math.max(1, passi - 1)) ** 2
    return { valore: da + k, ms: Math.round(t) }
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
const PASSO_RUOTA_MS = 290

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

/** Uno spicchio che sulla ruota fortunata e' un altro, o un quiz e una moneta della fortuna: si gira. */
export function cambiaConLaFortuna(i: number): boolean {
  const [prima, dopo]: Spicchio[] = [SPICCHI_RUOTA[i], SPICCHI_FORTUNATI[i]]
  if (dopo.tipo === 'quiz' || dopo.tipo === 'moneta') return true
  if (prima.tipo !== dopo.tipo) return true
  return prima.tipo === 'fisso' && dopo.tipo === 'fisso' && prima.moltiplicatore !== dopo.moltiplicatore
}

/** Il triplo che sale fino al ×10, un intero alla volta. */
export const CONTO_DIECI = conto(3, 10, ritardoDellaRuota(POSTO_DIECI))

/** Quando la ruota fortunata e' pronta: il ×10 e' arrivato, e lo scoppio e' passato. */
export const DURATA_MAGIA_MS = CONTO_DIECI[CONTO_DIECI.length - 1].ms + 900

/* ─────────────────────────────  La ruota del quiz  ───────────────────────────── */

/** I moltiplicatori della ruota del quiz in fila: salgono un valore alla volta, dal piu' piccolo. */
const VALORI_QUIZ = [...new Set(MOLTIPLICATORI_QUIZ)].sort((a, b) => a - b)

const INIZIO_QUIZ_MS = 450
const PASSO_QUIZ_MS = 430

export const passoDelQuiz = (i: number) => VALORI_QUIZ.indexOf(MOLTIPLICATORI_QUIZ[i])
export const ritardoDelQuiz = (i: number) => INIZIO_QUIZ_MS + passoDelQuiz(i) * PASSO_QUIZ_MS

/** Il ×4, che sale fino al ×10 per ultimo. */
export const POSTO_QUATTRO = MOLTIPLICATORI_QUIZ.indexOf(4)
export const CONTO_QUIZ = conto(4, 10, ritardoDelQuiz(POSTO_QUATTRO))

/** Quando la ruota del quiz fortunata si puo' girare. */
export const DURATA_AUMENTO_MS = CONTO_QUIZ[CONTO_QUIZ.length - 1].ms + 800

/** I passi dei premi che salgono, prima del gran finale: per i suoni. */
export const PASSI_RUOTA = [...new Set(SPICCHI_RUOTA.map((_, i) => i).filter(cambiaConLaFortuna).map(passoDellaRuota))]
  .filter((p) => p < passoDellaRuota(POSTO_DIECI))
  .sort((a, b) => a - b)
  .map((p) => INIZIO_RUOTA_MS + p * PASSO_RUOTA_MS + GIRA_MS)
export const PASSI_QUIZ = VALORI_QUIZ.slice(0, -1).map((_, k) => INIZIO_QUIZ_MS + k * PASSO_QUIZ_MS + GIRA_MS)
