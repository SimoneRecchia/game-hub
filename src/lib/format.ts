/** Formattazioni condivise, tutte in italiano. */

const dateFormatter = new Intl.DateTimeFormat('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** "venerdì 29 agosto" da una data YYYY-MM-DD. */
export function formatGameDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return dateFormatter.format(new Date(Date.UTC(y, m - 1, d)))
}

/** Countdown compatto "07:32:11". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

/** Durata leggibile: "1m 12s", "48s". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total}s`
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m < 60) return s === 0 ? `${m}m` : `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

/** Cronometro di gioco: "4:07", "1:04:07". */
export function formatCronometro(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

/** "1.240" con separatore delle migliaia italiano. */
const numberFormatter = new Intl.NumberFormat('it-IT')

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}
