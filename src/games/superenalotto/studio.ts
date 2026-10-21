import { ARRIVO_MS, RISUCCHIO_MS, TUBO_MS } from './tempi'

/**
 * Lo studio della diretta, disegnato piatto come nel mockup: le misure sono
 * punti di un palco largo 390 e alto 590, che la diretta scala sullo spazio
 * che ha. Il disegno (la sfera, la bocca, il tubo, la rotaia) e il viaggio
 * delle palline leggono le stesse misure, cosi' la pallina corre dentro il
 * tubo che si vede.
 */
export const PALCO = { largo: 390, alto: 590 } as const

/** Il riquadro della sfera di vetro, e il suo centro. */
export const SFERA = { x: 40, y: 48, lato: 220 } as const
export const CENTRO_SFERA = { x: SFERA.x + SFERA.lato / 2, y: SFERA.y + SFERA.lato / 2 }

/** La bocca d'oro in alto a destra della sfera, da cui esce la pallina: il suo centro. */
export const BOCCA = { x: 245, y: 78, lato: 28 } as const

/** La pallina che esce, e quelle sulla rotaia. */
export const RAGGIO_PALLINA = 26

/** Il tubo: dalla bocca a destra, la curva, e giu' fino alla rotaia. */
export const TUBO = { x: 336, curva: 18 } as const

/** La rotaia d'oro: il suo bordo di sopra e da dove a dove va. */
export const ROTAIA = { y: 426, da: 40, a: 356, alta: 12 } as const

/** Il centro dei quattro posti sulla rotaia, dal primo al quarto. */
export const POSTI_X: readonly number[] = [80, 150, 220, 290]

/** Il centro di una pallina posata sulla rotaia. */
export const SULLA_ROTAIA = ROTAIA.y - RAGGIO_PALLINA

/** La linea in mezzo al tubo, che e' anche la strada della pallina; `fuori` la sposta verso l'esterno della curva. */
export function tracciatoTubo(fuori = 0): string {
  const r = TUBO.curva + fuori
  const x = TUBO.x - TUBO.curva
  return `M${BOCCA.x} ${BOCCA.y - fuori}H${x}a${r} ${r} 0 0 1 ${r} ${r}V${SULLA_ROTAIA}`
}

/** Un fotogramma del viaggio: dove sta il centro della pallina, quanto e' girata e quanto e' grande. */
export interface Tappa {
  /** Da 0 a 1, sulla durata del viaggio (`ARRIVO_MS`). */
  offset: number
  x: number
  y: number
  giro: number
  scala: number
  opacita: number
  /** Come si va da questa tappa alla prossima. */
  easing: string
}

const gradi = (strada: number) => (strada / RAGGIO_PALLINA) * (180 / Math.PI)

/**
 * Il viaggio della pallina `i`, dalla sua uscita: risucchiata dal mezzo della
 * sfera fino alla bocca (`RISUCCHIO_MS`), a destra lungo il tubo, la curva,
 * giu' sempre piu' veloce (`TUBO_MS`), e sulla rotaia rotola fino al suo
 * posto, ci passa di un filo e torna (`ROTAIA_MS`). I momenti sono quelli dei
 * suoni (`estratto` in suoni.ts): il colpo alla bocca, i colpi giu' per il
 * tubo, il rotolare sulla rotaia.
 *
 * Il giro segue la strada, e finisce a zero: la pallina si ferma con il
 * numero dritto. Sulla rotaia rotola verso sinistra quanto la strada che fa,
 * quindi ci arriva girata di quel tanto, piu' i giri interi che servono a
 * restare in avanti rispetto alla curva.
 */
export function viaggioDi(i: number): Tappa[] {
  const posto = POSTI_X[i]
  const tubo = RISUCCHIO_MS / ARRIVO_MS
  const giu = (RISUCCHIO_MS + TUBO_MS) / ARRIVO_MS
  const orizzontale = TUBO.x - TUBO.curva - BOCCA.x
  // Il tratto dritto e la curva prendono un quarto del tubo: poi la pallina cade.
  const angolo = tubo + ((giu - tubo) * 0.22 * orizzontale) / (orizzontale + 10)
  const dopoCurva = tubo + (giu - tubo) * 0.3
  const inCurva = gradi(orizzontale)
  const dopo = inCurva + gradi((Math.PI * TUBO.curva) / 2)
  let sullaRotaia = gradi(TUBO.x - posto)
  while (sullaRotaia < dopo + 80) sullaRotaia += 360
  return [
    { offset: 0, x: CENTRO_SFERA.x + 48, y: CENTRO_SFERA.y - 30, giro: -40, scala: 0.6, opacita: 0, easing: 'linear' },
    { offset: tubo * 0.25, x: CENTRO_SFERA.x + 60, y: CENTRO_SFERA.y - 48, giro: -30, scala: 0.7, opacita: 1, easing: 'ease-in' },
    { offset: tubo, x: BOCCA.x, y: BOCCA.y, giro: 0, scala: 1, opacita: 1, easing: 'linear' },
    { offset: angolo, x: TUBO.x - TUBO.curva, y: BOCCA.y, giro: inCurva, scala: 1, opacita: 1, easing: 'linear' },
    { offset: dopoCurva, x: TUBO.x, y: BOCCA.y + TUBO.curva, giro: dopo, scala: 1, opacita: 1, easing: 'cubic-bezier(.5,0,.9,.6)' },
    { offset: giu, x: TUBO.x, y: SULLA_ROTAIA, giro: sullaRotaia, scala: 1, opacita: 1, easing: 'cubic-bezier(.2,.6,.4,1)' },
    { offset: 0.95, x: posto - 6, y: SULLA_ROTAIA, giro: -gradi(6), scala: 1, opacita: 1, easing: 'ease-in-out' },
    { offset: 1, x: posto, y: SULLA_ROTAIA, giro: 0, scala: 1, opacita: 1, easing: 'linear' },
  ]
}

/** Le palline che si mescolano nella sfera: posti fissi su una spirale, come nel mockup. */
export interface Mista {
  n: number
  /** Il centro, quando l'aria soffia. */
  x: number
  y: number
  /** Il centro a urna ferma: il mucchio sul fondo. */
  fermaX: number
  fermaY: number
}

const QUANTE_MISTE = 24
const LATO_MISTA = 30

/** Il mucchio sul fondo: file di palline, dalla piu' bassa, larghe quanto la sfera le lascia. */
function mucchio(): { x: number; y: number }[] {
  const dentro = SFERA.lato / 2 - 6
  const posti: { x: number; y: number }[] = []
  for (let fila = 0; posti.length < QUANTE_MISTE; fila += 1) {
    const y = SFERA.lato / 2 + dentro - LATO_MISTA / 2 - fila * (LATO_MISTA - 5)
    const mezza = Math.sqrt(Math.max(0, dentro ** 2 - (y + LATO_MISTA / 2 - SFERA.lato / 2) ** 2)) - LATO_MISTA / 2
    const quante = Math.max(1, Math.floor((2 * mezza) / (LATO_MISTA - 3)) + 1)
    const sfasa = fila % 2 ? (LATO_MISTA - 3) / 2 : 0
    for (let k = 0; k < quante && posti.length < QUANTE_MISTE; k += 1) {
      const x = SFERA.lato / 2 - mezza + sfasa + k * (LATO_MISTA - 3)
      if (x <= SFERA.lato / 2 + mezza) posti.push({ x, y })
    }
  }
  return posti
}

/** Le palline nella sfera, in punti della sfera (il suo riquadro parte da zero). */
export const MISTE: readonly Mista[] = (() => {
  const ferme = mucchio()
  return Array.from({ length: QUANTE_MISTE }, (_, i) => {
    const r = 22 + 58 * Math.sqrt((i + 0.5) / QUANTE_MISTE)
    const a = i * 2.39996
    // Le ferme prese a salti, cosi' il mucchio non ha i colori in fila.
    const ferma = ferme[(i * 7) % QUANTE_MISTE]
    return {
      n: ((i * 37 + 11) % 90) + 1,
      x: Math.round(110 + r * Math.cos(a)),
      y: Math.round(118 + r * 0.92 * Math.sin(a)),
      // Un poco fuori fila, come cadono davvero: un mucchio in griglia sembrerebbe un vassoio.
      fermaX: Math.round(ferma.x + (((i * 5) % 9) - 4) * 1.4),
      fermaY: Math.round(ferma.y + (((i * 3) % 7) - 3) * 1.3),
    }
  })
})()

/** Il lato di una pallina nella sfera. */
export const LATO_PALLINA_MISTA = LATO_MISTA
