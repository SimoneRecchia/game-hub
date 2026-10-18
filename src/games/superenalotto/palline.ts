import { NUMERI, type GiocataEnalotto } from '@shared/superenalotto'

/**
 * Il colore di una pallina, a quarti dell'urna: rosse fino al 23, gialle fino
 * al 45, verdi fino al 68, blu dopo. Lo stesso nella diretta in 3D e nelle
 * palline della pagina, cosi' un numero si riconosce dal colore.
 */
export function coloreDellaPallina(n: number): string {
  const gruppo = Math.min(3, Math.floor((n - 1) / (NUMERI / 4)))
  return ['#e5383b', '#f2a20d', '#1f9d74', '#2f6fe8'][gruppo]
}

/** Il nome di una pallina estratta, nell'ordine: "Primo estratto". */
export const ORDINALI = ['Primo', 'Secondo', 'Terzo', 'Quarto'] as const

const UNITA = ['', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove']
const DA_DIECI = [
  'dieci',
  'undici',
  'dodici',
  'tredici',
  'quattordici',
  'quindici',
  'sedici',
  'diciassette',
  'diciotto',
  'diciannove',
]
const DECINE = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta']

/**
 * Un numero dell'urna in lettere, come lo dice chi conduce l'estrazione:
 * "quarantasette". La decina perde la vocale davanti a uno e a otto
 * (ventuno, trentotto), e il tre in fondo prende l'accento (ventitré).
 */
export function inLettere(n: number): string {
  if (n < 10) return UNITA[n]
  if (n < 20) return DA_DIECI[n - 10]
  const decina = DECINE[Math.floor(n / 10)]
  const unita = n % 10
  if (unita === 0) return decina
  return (unita === 1 || unita === 8 ? decina.slice(0, -1) : decina) + (unita === 3 ? 'tré' : UNITA[unita])
}

/** I numeri di una giocata a caso, per la schedina: la "giocata casuale" delle ricevitorie. */
export function casuali(quanti: GiocataEnalotto): number[] {
  const urna = Array.from({ length: NUMERI }, (_, i) => i + 1)
  const fuori: number[] = []
  while (fuori.length < quanti) fuori.push(urna.splice(Math.floor(Math.random() * urna.length), 1)[0])
  return fuori.sort((a, b) => a - b)
}
