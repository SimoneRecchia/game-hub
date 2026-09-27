/**
 * Le bandiere del quiz: immagini di flagcdn, per codice ISO in minuscolo. Il
 * server non le vede mai: il browser le chiede lì, nelle misure che servono.
 */

/** Le larghezze che flagcdn tiene pronte, fra quelle che servono qui. */
export function urlBandiera(codice: string, larghezza: 40 | 80 | 160 | 320 | 640 = 320): string {
  return `https://flagcdn.com/w${larghezza}/${codice}.png`
}

/** Le due misure di una bandiera, per `srcSet`: il browser prende quella che serve allo schermo. */
export function misureBandiera(codice: string, piccola: 160 | 320, grande: 320 | 640): string {
  return `${urlBandiera(codice, piccola)} ${piccola}w, ${urlBandiera(codice, grande)} ${grande}w`
}
