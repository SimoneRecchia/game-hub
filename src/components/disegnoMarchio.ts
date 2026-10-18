/**
 * Il disegno dell'icona dell'app, per il marchio che la ridisegna con i pezzi
 * veri (Marchio.tsx). Le misure e i colori sono quelli di
 * scripts/genera-icone.mjs, che gira in Node senza TypeScript e non si puo'
 * importare da qui: un test li tiene d'accordo.
 */

export const FONDO = ['#4f46e5', '#4337d2'] as const

export const TESSERE = {
  verde: ['#4fd96a', '#22b45e'],
  giallo: ['#ffc54f', '#f2911f'],
} as const

export const PUNTI = {
  wordle: '#22b45e',
  scarabeo: '#f2911f',
  app: '#4f46e5',
  cruciverba: '#4d8df7',
  quiz: '#f0506e',
} as const

export const MISURE = {
  tessera: { lato: 172, raggio: 42, x: 52, y: -26, angolo: 17 },
  dado: { lato: 188, raggio: 48, solco: 12 },
  punto: { passo: 50, raggio: 19 },
  centro: { x: 256, y: 270 },
} as const

/** I posti del cinque, nell'ordine di PUNTI. */
export const POSTI = [
  [-1, -1],
  [1, -1],
  [0, 0],
  [-1, 1],
  [1, 1],
] as const
