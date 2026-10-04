/**
 * Le misure delle ruote di Crazy Time, in unita' del disegno. La ruota e
 * quella dei moltiplicatori hanno la stessa cornice d'oro con le lampadine, lo
 * stesso mozzo e la stessa lancetta: cambiano solo gli spicchi.
 *
 * Il centro e' l'origine; la lancetta sta in cima, e sopra la cornice c'e' il
 * posto per lei. Gli angoli si contano dall'alto in senso orario, come la
 * ruota gira quando la si lancia verso destra.
 */

/** Il raggio degli spicchi, il bordo esterno della cornice, le lampadine, i pioli e il mozzo. */
export const RAGGIO = 96
export const CORNICE = 110
export const LAMPADE = 103.5
export const PIOLI = 91
export const MOZZO = 24

/** Il riquadro del disegno: la cornice, piu' la lancetta in cima e un filo d'ombra sotto. */
export const VISTA = { x: -116, y: -128, larghezza: 232, altezza: 248 }

/** Un punto sulla circonferenza, dall'alto in senso orario. */
export function punto(raggio: number, gradi: number): [number, number] {
  const r = ((gradi - 90) * Math.PI) / 180
  return [raggio * Math.cos(r), raggio * Math.sin(r)]
}

/** Lo spicchio `i` di `n`, dal centro al bordo. */
export function spicchioPath(i: number, n: number, raggio = RAGGIO): string {
  const passo = 360 / n
  const [x0, y0] = punto(raggio, i * passo)
  const [x1, y1] = punto(raggio, (i + 1) * passo)
  return `M0 0L${x0.toFixed(2)} ${y0.toFixed(2)}A${raggio} ${raggio} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`
}

/** L'angolo della ruota che porta lo spicchio `i` sotto la lancetta in cima, con uno scarto dentro lo spicchio. */
export function angoloPer(i: number, n: number, scarto = 0): number {
  const passo = 360 / n
  return -(i * passo + passo / 2 + scarto)
}

/** Lo spicchio sotto la lancetta, con la ruota girata di `angolo` gradi in senso orario. */
export function spicchioSotto(angolo: number, n: number): number {
  const passo = 360 / n
  return Math.floor((((-angolo % 360) + 360) % 360) / passo) % n
}

/**
 * Le proprieta' di una scritta lungo il raggio, centrata fra i raggi `da` (verso
 * il bordo) e `a` (verso il mozzo): si legge dall'alto in basso quando lo
 * spicchio e' sotto la lancetta, come sulle ruote vere. Una parola troppo lunga
 * per lo spazio si stringe (`textLength`) invece di uscire dallo spicchio; la
 * larghezza delle maiuscole si stima, perché misurarla vorrebbe il disegno gia'
 * fatto. `scarto` la sposta di fianco, perpendicolare al raggio: due scritte
 * nello stesso spicchio stanno una accanto all'altra.
 */
export function scrittaRadiale(centro: number, da: number, a: number, testo: string, dimensione: number, scarto = 0) {
  const meta = (da + a) / 2
  const lunghezza = da - a
  const stimata = testo.length * dimensione * 0.66
  return {
    transform: `rotate(${centro}) translate(${scarto} ${-meta}) rotate(90)`,
    fontSize: dimensione,
    ...(stimata > lunghezza ? { textLength: lunghezza, lengthAdjust: 'spacingAndGlyphs' as const } : {}),
  }
}
