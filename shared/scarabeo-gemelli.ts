/**
 * I leggii gemelli della classificata dello Scarabeo.
 *
 * Con un sacchetto solo, il computer del giorno pescava le sue tessere e chi
 * gioca le sue, e a volte una delle due mani era molto migliore dell'altra: la
 * giornata la decideva la fortuna della pesca piu' di come la si giocava. Dal
 * 15 ottobre 2026 a ogni turno arrivano otto tessere nuove a testa, e le due
 * mani sono gemelle: non le stesse lettere, ma le stesse vocali, le stesse
 * consonanti, lo stesso jolly e gli stessi punti. Ogni tessera del computer
 * vale quanto quella al suo posto nel mio leggio, ed e' come lei una vocale o
 * una consonante (`gruppoDi`): una A puo' diventare una E, una R una S, una B
 * una P. La Q, la U e il jolly sono soli nel loro gruppo, e restano uguali.
 *
 * Una mano si gioca anche (`leggioBuono`): da tre a cinque vocali, mai la Q
 * senza la U, al piu' un jolly, due tessere da otto punti in su e tre tessere
 * uguali. Le tessere che restano in mano alla fine del turno se ne vanno, e il
 * cambio non serve: il turno dopo e' un leggio nuovo.
 *
 * Le mani dipendono solo dal numero del giorno e dal turno, non dalle mosse:
 * chiunque giochi lo stesso giorno ha le stesse tessere a ogni turno, e il
 * computer del giorno le sue gemelle. Come il sacchetto (vedi shared/scarabeo.ts)
 * non si salvano: cambiare questo file cambierebbe le mani delle giornate
 * passate.
 */

import { mulberry32 } from './daily'
import { DISTRIBUZIONE, JOLLY, TESSERE_LEGGIO, VALORI, sacchettoDaSeme, type Mossa } from './scarabeo'

/** Le mosse a testa della classificata a leggii gemelli: cinque, il tempo di un Wordle. */
export const MOSSE_GEMELLE = 5

const VOCALI = new Set(['a', 'e', 'i', 'o', 'u'])

/** Il gruppo di una tessera: il jolly, o vocale o consonante con il suo valore. Due tessere dello stesso gruppo sono gemelle. */
export function gruppoDi(tessera: string): string {
  if (tessera === JOLLY) return JOLLY
  return `${VOCALI.has(tessera) ? 'v' : 'c'}${VALORI[tessera]}`
}

/** Le lettere di ogni gruppo, con quante ne ha il sacchetto: le piu' frequenti escono piu' spesso. */
const GRUPPI = new Map<string, { lettera: string; quante: number }[]>()
for (const [lettera, quante] of DISTRIBUZIONE) {
  const g = gruppoDi(lettera)
  GRUPPI.set(g, [...(GRUPPI.get(g) ?? []), { lettera, quante }])
}

/** Una mano da cui si gioca: le vocali giuste, la Q con la U, niente mucchi di tessere care o uguali. */
export function leggioBuono(leggio: readonly string[]): boolean {
  let vocali = 0
  let jolly = 0
  let care = 0
  const conti = new Map<string, number>()
  for (const t of leggio) {
    if (t === JOLLY) jolly += 1
    else if (VOCALI.has(t)) vocali += 1
    if (t !== JOLLY && VALORI[t] >= 8) care += 1
    conti.set(t, (conti.get(t) ?? 0) + 1)
  }
  if (vocali < 3 || vocali > 5 || jolly > 1 || care > 2) return false
  if (leggio.includes('q') && !leggio.includes('u')) return false
  return [...conti.values()].every((n) => n <= 3)
}

const SEME_GEMELLI = 0x3b5f_c0a1

function semeDi(puzzleNumber: number, turno: number, tentativo: number): number {
  return (SEME_GEMELLI ^ Math.imul(puzzleNumber, 0x9e37_79b1) ^ Math.imul(turno + 1, 0x85eb_ca6b) ^ Math.imul(tentativo + 1, 0xc2b2_ae35)) >>> 0
}

/**
 * La gemella di una tessera: un'altra lettera del suo gruppo, se ce n'e' un'altra,
 * pescata col peso del sacchetto, e non una che la mano gemella ha gia' tre
 * volte (`gia`).
 */
function gemellaDi(tessera: string, gia: readonly string[], caso: () => number): string {
  const gruppo = GRUPPI.get(gruppoDi(tessera)) ?? []
  const diverse = gruppo.length > 1 ? gruppo.filter((g) => g.lettera !== tessera) : gruppo
  const libere = diverse.filter((g) => gia.filter((t) => t === g.lettera).length < 3)
  const altre = libere.length > 0 ? libere : diverse
  const totale = altre.reduce((s, g) => s + g.quante, 0)
  let r = caso() * totale
  for (const g of altre) {
    r -= g.quante
    if (r < 0) return g.lettera
  }
  return altre[altre.length - 1]?.lettera ?? tessera
}

/**
 * Le due mani di un turno: la mia e quella del computer del giorno. La mia sono
 * le prime otto tessere di un sacchetto mescolato col seme del giorno e del
 * turno, ripescate finché la mano non si gioca; quella del computer le gemelle,
 * una per una.
 */
export function leggiiGemelli(puzzleNumber: number, turno: number): [string[], string[]] {
  let mio: string[] = []
  // Una mano buona esce quasi sempre entro pochi tentativi; il tetto e' solo una garanzia.
  for (let tentativo = 0; tentativo < 500; tentativo += 1) {
    mio = sacchettoDaSeme(semeDi(puzzleNumber, turno, tentativo)).slice(0, TESSERE_LEGGIO)
    if (leggioBuono(mio)) break
  }
  const caso = mulberry32(semeDi(puzzleNumber, turno, -1))
  const suo: string[] = []
  for (const t of mio) suo.push(gemellaDi(t, suo, caso))
  return [mio, suo]
}

/**
 * I leggii dopo le mosse: chi ha fatto `n` mosse ha la mano del turno `n`. La
 * mossa `i` e' del giocatore `i % 2`, come in ogni partita a due. Il sacchetto
 * non c'e': `restanti` e' zero, e il computer senza pose passa invece di
 * cambiare.
 */
export function leggiiGemelliDa(
  puzzleNumber: number,
  mosse: readonly Mossa[],
): { leggii: [string[], string[]]; restanti: number } {
  const mie = Math.ceil(mosse.length / 2)
  const sue = Math.floor(mosse.length / 2)
  return { leggii: [leggiiGemelli(puzzleNumber, mie)[0], leggiiGemelli(puzzleNumber, sue)[1]], restanti: 0 }
}
