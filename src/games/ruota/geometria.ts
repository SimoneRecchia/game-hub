/**
 * Le misure delle ruote di Crazy Time, in unita' del disegno. La ruota e
 * quella dei moltiplicatori hanno la stessa cornice d'oro con le lampadine, lo
 * stesso mozzo e la stessa lancetta: cambiano solo gli spicchi.
 *
 * Il centro e' l'origine; la lancetta sta in cima, e sopra la cornice c'e' il
 * posto per lei. Gli angoli si contano dall'alto in senso orario, come la
 * ruota gira quando la si lancia verso destra.
 *
 * Le facce degli spicchi della ruota grande si misurano qui (`misureDi`), e
 * non nel disegno, perché un test le possa controllare: l'icona verso il bordo
 * e la scritta lungo il raggio sotto di lei non si toccano, l'icona sta nella
 * larghezza dello spicchio dove sta, e la scritta in quella dello spicchio
 * dove finisce, verso il mozzo, che e' il punto piu' stretto.
 */
import { MOLTIPLICATORE_FISSO, SPICCHI_RUOTA, etichettaDi, nomeDi, type Spicchio } from '@shared/ruota'

/** Il raggio degli spicchi, il bordo esterno della cornice, le lampadine, i pioli e il mozzo. */
export const RAGGIO = 96
export const CORNICE = 110
export const LAMPADE = 103.5
export const PIOLI = 91
export const RAGGIO_PIOLO = 1.9
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

/** Quanto e' largo uno spicchio di `n` a distanza `r` dal centro: la corda fra i suoi due raggi. */
export function corda(r: number, n: number): number {
  return 2 * r * Math.sin(Math.PI / n)
}

/**
 * Quanto occupa in larghezza ogni carattere delle scritte, in em: le maiuscole
 * di un grassetto, larghe come quelle di Arial, che sono fra le piu' larghe dei
 * caratteri di sistema; le cifre, il segno per, la virgola e lo spazio sono piu'
 * stretti. Una stima per eccesso: misurare il testo vorrebbe il disegno gia'
 * fatto, e una stima per difetto lo farebbe uscire dal suo posto, come la
 * scritta della fortuna sotto il quadrifoglio.
 */
const LARGHEZZE: Record<string, number> = {
  A: 0.72, B: 0.72, C: 0.72, D: 0.72, E: 0.67, F: 0.61, G: 0.78, H: 0.72, I: 0.28, J: 0.56, K: 0.72, L: 0.61,
  M: 0.83, N: 0.72, O: 0.78, P: 0.67, Q: 0.78, R: 0.72, S: 0.67, T: 0.61, U: 0.72, V: 0.67, W: 0.94, X: 0.67,
  Y: 0.67, Z: 0.61, '×': 0.58, ',': 0.28, '.': 0.28, ' ': 0.28, '?': 0.61, "'": 0.24,
}
const LARGHEZZA_CIFRA = 0.56
const MARGINE_STIMA = 1.04

/** Quanto e' lunga una scritta di `dimensione`, con la sua spaziatura fra le lettere (in em), per eccesso. */
export function larghezzaStimata(testo: string, dimensione: number, spaziatura = 0): number {
  let em = 0
  for (const c of testo.toUpperCase()) em += (/\d/.test(c) ? LARGHEZZA_CIFRA : (LARGHEZZE[c] ?? 0.78)) + spaziatura
  return em * dimensione * MARGINE_STIMA
}

/**
 * Le proprieta' di una scritta lungo il raggio, centrata fra i raggi `da` (verso
 * il bordo) e `a` (verso il mozzo): si legge dall'alto in basso quando lo
 * spicchio e' sotto la lancetta, come sulle ruote vere. Una parola troppo lunga
 * per lo spazio si stringe (`textLength`) invece di uscire dallo spicchio.
 * `scarto` la sposta di fianco, perpendicolare al raggio: due scritte nello
 * stesso spicchio stanno una accanto all'altra. `spaziatura` e' quella fra le
 * lettere che le da' il foglio di stile, in em.
 */
export function scrittaRadiale(
  centro: number,
  da: number,
  a: number,
  testo: string,
  dimensione: number,
  scarto = 0,
  spaziatura = 0.06,
) {
  const meta = (da + a) / 2
  const lunghezza = da - a
  const stimata = larghezzaStimata(testo, dimensione, spaziatura)
  return {
    transform: `rotate(${centro}) translate(${scarto} ${-meta}) rotate(90)`,
    fontSize: dimensione,
    ...(stimata > lunghezza ? { textLength: lunghezza, lengthAdjust: 'spacingAndGlyphs' as const } : {}),
  }
}

/* ─────────────────────────────  Le facce della ruota grande  ───────────────────────────── */

/** Quanti spicchi ha la ruota grande: la ruota fortunata ha gli stessi posti. */
export const SPICCHI = SPICCHI_RUOTA.length

/** Un'icona, disegnata dentro un quadrato di lato `lato` con il centro a `centro` dal mozzo. */
export interface MisuraIcona {
  centro: number
  lato: number
}

/** Il numero di un premio, dritto come un'icona: il centro, la dimensione e il testo. */
export interface MisuraNumero {
  centro: number
  dimensione: number
  testo: string
}

/** Una scritta lungo il raggio, fra `da` (verso il bordo) e `a` (verso il mozzo). */
export interface MisuraScritta {
  da: number
  a: number
  dimensione: number
  /** La spaziatura fra le lettere, in em: la stessa del foglio di stile. */
  spaziatura: number
  testo: string
}

export interface MisureFaccia {
  icona: MisuraIcona | null
  numero: MisuraNumero | null
  scritta: MisuraScritta | null
}

/**
 * Le misure delle facce, una per specie di scritta. Le icone stanno verso il
 * bordo, tutte nello stesso quadrato, e sotto di loro, con uno stacco, la
 * scritta: della stessa dimensione per tutti gli spicchi con l'icona, perché
 * una parola piu' lunga si stringe invece di farsi piu' piccola. Il banco, che
 * non ha icona, ha la scritta dal bordo al mozzo; i premi fissi il numero
 * dritto al posto dell'icona, e sotto il nome, quando ce l'ha.
 */
export const FACCE = {
  icona: { centro: 79.5, lato: 13 },
  /** Fra l'icona, o il numero, e la scritta sotto. */
  stacco: 3,
  scritta: { a: 28, dimensione: 7.2, spaziatura: 0.06 },
  banco: { da: 86, a: 30, dimensione: 9, spaziatura: 0.14 },
  numero: { centro: 79, dimensione: 15 },
  nome: { a: 28, dimensione: 6.4, spaziatura: 0.06 },
  /** Quanto resta libero ai lati del numero, dentro lo spicchio. */
  margine: 1,
} as const

/** L'altezza delle cifre, in frazioni della dimensione: dal centro, meta' sopra e meta' sotto. */
export const ALTEZZA_CIFRE = 0.72

/**
 * La dimensione del numero di un premio: la piu' grande, fino a quella dei
 * numeri corti, che sta nella larghezza dello spicchio dove il numero finisce,
 * verso il mozzo. "×3" e "×5" grandi, "×10" e "×1,5" un po' meno.
 */
export function dimensioneNumero(testo: string): number {
  const { centro, dimensione } = FACCE.numero
  const fondo = centro - (dimensione * ALTEZZA_CIFRE) / 2
  const posto = corda(fondo, SPICCHI) - 2 * FACCE.margine
  const adatta = posto / larghezzaStimata(testo, 1)
  return Math.min(dimensione, Math.floor(adatta * 10) / 10)
}

/** Il nome di un premio fisso lungo il raggio: solo i premi grandi ne hanno uno. */
const nomeDelPremio = (s: Extract<Spicchio, { tipo: 'fisso' }>) =>
  s.moltiplicatore >= MOLTIPLICATORE_FISSO ? nomeDi(s).toUpperCase() : null

/** Le misure della faccia di uno spicchio della ruota grande, normale o fortunata. */
export function misureDi(s: Spicchio): MisureFaccia {
  if (s.tipo === 'banco') {
    const { da, a, dimensione, spaziatura } = FACCE.banco
    return { icona: null, numero: null, scritta: { da, a, dimensione, spaziatura, testo: etichettaDi(s) } }
  }
  if (s.tipo === 'fisso') {
    const testo = etichettaDi(s)
    const dimensione = dimensioneNumero(testo)
    const numero = { centro: FACCE.numero.centro, dimensione, testo }
    const nome = nomeDelPremio(s)
    const fondo = numero.centro - (dimensione * ALTEZZA_CIFRE) / 2
    const scritta = nome
      ? { da: fondo - FACCE.stacco, a: FACCE.nome.a, dimensione: FACCE.nome.dimensione, spaziatura: 0.06, testo: nome }
      : null
    return { icona: null, numero, scritta }
  }
  const icona = { ...FACCE.icona }
  const { a, dimensione, spaziatura } = FACCE.scritta
  const da = icona.centro - icona.lato / 2 - FACCE.stacco
  return { icona, numero: null, scritta: { da, a, dimensione, spaziatura, testo: etichettaDi(s) } }
}

/**
 * Dove sta davvero una scritta lungo il raggio, dal mozzo verso il bordo:
 * centrata nel suo spazio, lunga quanto la stima o quanto lo spazio, se la
 * stima e' di piu' (allora si stringe).
 */
export function estensioneScritta(s: MisuraScritta): { da: number; a: number } {
  const meta = (s.da + s.a) / 2
  const lunga = Math.min(s.da - s.a, larghezzaStimata(s.testo, s.dimensione, s.spaziatura))
  return { da: meta + lunga / 2, a: meta - lunga / 2 }
}
