import type { DaySlot } from '@shared/types'

/**
 * La geometria e le etichette del percorso, separate dal componente.
 *
 * Sta qui perché e' l'unica parte della mappa che si puo' verificare senza un
 * browser: le coordinate delle tappe, la curva che le unisce e quanta di quella
 * curva risulta percorsa. Il componente si limita a disegnare.
 */

export interface Punto {
  x: number
  y: number
}

/**
 * Lo spazio in cui vivono le coordinate: 100 di larghezza, 168 di altezza.
 *
 * Sono unita' dell'SVG, non pixel — la mappa scala insieme al contenitore. Il
 * rapporto e' molto verticale, e non per gusto: la mappa e' larga quanto lo
 * schermo di un telefono e alta quanto tutto lo spazio fra intestazione e
 * bottone, quindi con un riquadro piu' quadrato avanzavano centosettanta pixel
 * vuoti sopra e sotto. Alto e stretto significa anche tappe piu' distanti fra
 * loro, cioe' spazio per l'etichetta di ognuna.
 *
 * I dodici punti di margine sopra la prima tappa e sotto l'ultima sono il raggio
 * del nodo: senza, i cerchi sporgerebbero dal riquadro e finirebbero sotto il
 * bottone.
 */
export const LARGHEZZA = 100
export const ALTEZZA = 168

/**
 * Le cinque tappe.
 *
 * L'alternanza non e' perfettamente simmetrica di proposito: con le x tutte a
 * 26 e 74 la curva diventava una zeta meccanica, mentre spostando ogni tappa di
 * qualche unita' il tracciato sembra disegnato. Le y sono equidistanti, quello
 * si': la prima versione stringeva l'ultimo tratto a 24 invece di 30 e le due
 * tappe in fondo si toccavano con le etichette.
 */
export const TAPPE: readonly Punto[] = [
  { x: 27, y: 12 },
  { x: 72, y: 48 },
  { x: 28, y: 84 },
  { x: 71, y: 120 },
  { x: 27, y: 156 },
]

/** true se la tappa sta nella metà sinistra: l'etichetta va dall'altra parte. */
export function aSinistra(punto: Punto): boolean {
  return punto.x < LARGHEZZA / 2
}

/**
 * Il tracciato che unisce le tappe, come attributo `d` di un `<path>`.
 *
 * Catmull-Rom convertito in cubiche di Bézier: passa **per** i punti (una
 * Bézier normale li userebbe come attrattori, e le tappe non starebbero sulla
 * linea). La tensione a 1 da' la versione uniforme, che e' quella che non
 * produce anse quando due tappe sono quasi allineate.
 */
export function tracciato(punti: readonly Punto[], tensione = 1): string {
  if (punti.length < 2) return ''

  const n = (v: number) => Math.round(v * 100) / 100
  let d = `M ${n(punti[0].x)} ${n(punti[0].y)}`

  for (let i = 0; i < punti.length - 1; i++) {
    const p0 = punti[i - 1] ?? punti[i]
    const p1 = punti[i]
    const p2 = punti[i + 1]
    const p3 = punti[i + 2] ?? p2

    const c1 = {
      x: p1.x + ((p2.x - p0.x) / 6) * tensione,
      y: p1.y + ((p2.y - p0.y) / 6) * tensione,
    }
    const c2 = {
      x: p2.x - ((p3.x - p1.x) / 6) * tensione,
      y: p2.y - ((p3.y - p1.y) / 6) * tensione,
    }

    d += ` C ${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(p2.x)} ${n(p2.y)}`
  }

  return d
}

export type StatoTappa = 'vinta' | 'persa' | 'incorso' | 'daGiocare' | 'bloccata'

export function statoTappa(d: DaySlot): StatoTappa {
  if (d.status === 'won') return 'vinta'
  if (d.status === 'lost') return 'persa'
  if (d.locked) return 'bloccata'
  return d.attempts > 0 ? 'incorso' : 'daGiocare'
}

/** true se la tappa e' finita, comunque sia andata. */
export function chiusa(d: DaySlot): boolean {
  return d.status === 'won' || d.status === 'lost'
}

/**
 * Quante tappe di fila sono chiuse, partendo dalla prima.
 *
 * E' la lunghezza della parte piena del tracciato. Si conta il prefisso e non il
 * totale di proposito: la linea piena parte dall'inizio, e una tappa chiusa piu'
 * in la' — che con le parole progressive non puo' esistere, ma il disegno non
 * deve dipendere da quella garanzia — colorerebbe un tratto che non e' stato
 * percorso.
 */
export function tratteFatte(day: readonly DaySlot[]): number {
  let fatte = 0
  for (const d of day) {
    if (!chiusa(d)) break
    fatte++
  }
  return fatte
}

/**
 * La frazione di tracciato percorsa, fra 0 e 1.
 *
 * Serve a `stroke-dasharray` con `pathLength="1"`: il tratto pieno arriva
 * esattamente sulla tappa raggiunta, senza dover misurare la curva.
 */
export function avanzamento(day: readonly DaySlot[]): number {
  const tratti = day.length - 1
  if (tratti <= 0) return 0
  return Math.min(tratteFatte(day), tratti) / tratti
}

/** La prossima parola da giocare: la prima non chiusa e non bloccata. */
export function prossimaTappa(day: readonly DaySlot[]): DaySlot | undefined {
  return day.find((d) => !chiusa(d) && !d.locked)
}

export function nomeTappa(slot: number): string {
  return slot === 1 ? 'Parola del giorno' : `${slot}ª parola`
}

/**
 * Cosa dice l'etichetta sotto il nome della tappa.
 *
 * Tentativi, non punti: quanti ne sono serviti e' l'unica cosa che chi guarda la
 * mappa non ricorda a memoria, mentre i punti sono una tabella da consultare una
 * volta — sta nel foglio informativo.
 */
export function dettaglioTappa(d: DaySlot): string {
  if (d.shared) return 'Giocata in compagnia'
  switch (statoTappa(d)) {
    case 'vinta':
      return d.attempts === 1 ? 'Al primo tentativo' : `In ${d.attempts} tentativi`
    case 'persa':
      return 'Non indovinata'
    case 'incorso':
      return `In corso · ${d.attempts} ${d.attempts === 1 ? 'tentativo' : 'tentativi'}`
    case 'daGiocare':
      return 'Da giocare'
    case 'bloccata':
      return d.slot === 2 ? 'Dopo la parola del giorno' : `Dopo la ${d.slot - 1}ª`
  }
}
