/**
 * Da che parte si scrive, nello Scarabeo. La sceglie il gioco, guardando il
 * tabellone e le tessere gia' posate; la freccia del cursore la dice, e un
 * secondo tocco sulla casella la gira (vedi useComposizione.ts).
 */

import { CENTRO, LATO, TESSERE_LEGGIO, type Casella, type Posa } from '@shared/scarabeo'

/**
 * La direzione di una posa che ha gia' delle tessere: quella della riga o della
 * colonna su cui stanno tutte, con la casella toccata (`r`, `c`) se c'e'. Null
 * se non lo dicono: nessuna tessera, una sola senza casella, o tessere sparse.
 */
export function direzioneDellaPosa(posa: readonly Posa[], r?: number, c?: number): boolean | null {
  const tutte = r === undefined || c === undefined ? posa : [...posa, { r, c }]
  if (posa.length === 0 || tutte.length < 2) return null
  if (tutte.every((p) => p.r === tutte[0].r)) return true
  if (tutte.every((p) => p.c === tutte[0].c)) return false
  return null
}

/**
 * Da che parte scrivere cominciando da (r, c), quando le tessere posate non lo
 * dicono: verso le tessere che la casella tocca sulla sua riga o sulla sua
 * colonna, o che raggiunge andando avanti, e fra due la piu' vicina. Alla prima
 * mossa conta la stella. A pari merito — nessuna tessera vicino, o tessere da
 * tutte e due le parti — resta la direzione di prima.
 *
 * E' quel che rende inutile, quasi sempre, il secondo tocco: sotto la C di CASA
 * si scrive in verticale, dopo la sua ultima A in orizzontale.
 */
export function direzioneNaturale(
  tab: readonly (Casella | null)[],
  r: number,
  c: number,
  primaMossa: boolean,
  prima: boolean,
): boolean {
  const piena = (rr: number, cc: number) => rr >= 0 && rr < LATO && cc >= 0 && cc < LATO && tab[rr * LATO + cc] !== null
  const vicinanza = (oriz: boolean): number => {
    const dr = oriz ? 0 : 1
    const dc = oriz ? 1 : 0
    // Una tessera subito prima: la parola la comprende di sicuro.
    if (piena(r - dr, c - dc)) return TESSERE_LEGGIO + 1
    for (let passi = 1; passi <= TESSERE_LEGGIO; passi += 1) {
      const rr = r + dr * passi
      const cc = c + dc * passi
      if (rr >= LATO || cc >= LATO) break
      if (piena(rr, cc) || (primaMossa && rr === CENTRO && cc === CENTRO)) return TESSERE_LEGGIO + 2 - passi
    }
    return 0
  }
  const orizzontale = vicinanza(true)
  const verticale = vicinanza(false)
  return orizzontale === verticale ? prima : orizzontale > verticale
}
