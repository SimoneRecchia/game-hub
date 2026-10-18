/**
 * Le formattazioni del pannello: numeri, byte, date e ore, tutte in italiano e
 * sull'ora di Roma, che e' quella della giornata di gioco. Chi amministra puo'
 * essere altrove, ma i conti del server sono italiani.
 */

const FUSO = 'Europe/Rome'

const numeri = new Intl.NumberFormat('it-IT')
const decimali = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })

/** "1.240" */
export const numero = (n: number) => numeri.format(n)

/** "72,5": al piu' un decimale, e niente se non serve. */
export const decimale = (n: number) => decimali.format(n)

/** Con il segno sempre: "+120", "−45", "0". Il meno e' quello tipografico. */
export function conSegno(n: number): string {
  if (n === 0) return '0'
  return `${n > 0 ? '+' : '−'}${numeri.format(Math.abs(n))}`
}

/**
 * Le tacche degli assi, corte: "800", "12k", "1,5M". In italiano si direbbe
 * "mila", ma sotto un grafico conta lo spazio, e k e M si leggono lo stesso.
 */
export function compatto(n: number): string {
  const a = Math.abs(n)
  if (a < 1_000) return decimali.format(n)
  if (a < 1_000_000) return `${decimali.format(n / 1_000)}k`
  return `${decimali.format(n / 1_000_000)}M`
}

/** "1,3 MB", su base 1024: il limite di D1 e' 500 MB tondi. */
export function byte(n: number): string {
  if (n < 1024) return `${numeri.format(n)} B`
  const unita = ['KB', 'MB', 'GB', 'TB']
  let valore = n / 1024
  let i = 0
  while (valore >= 1024 && i < unita.length - 1) {
    valore /= 1024
    i += 1
  }
  return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: valore < 10 ? 1 : 0 }).format(valore)} ${unita[i]}`
}

/** "42%", o "0,4%" sotto l'uno: una barra quasi vuota non deve dire zero. */
export function percento(parte: number, tutto: number): string {
  if (tutto <= 0) return '—'
  const p = (parte / tutto) * 100
  if (p > 0 && p < 1) return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(p)}%`
  return `${Math.round(p)}%`
}

const conOra = new Intl.DateTimeFormat('it-IT', {
  timeZone: FUSO,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const soloOra = new Intl.DateTimeFormat('it-IT', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
const oraSecondi = new Intl.DateTimeFormat('it-IT', {
  timeZone: FUSO,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const soloData = new Intl.DateTimeFormat('it-IT', { timeZone: FUSO, day: 'numeric', month: 'short', year: 'numeric' })

/** "18 ott 2026" da un istante ISO. */
export const data = (iso: string) => soloData.format(new Date(iso))

/** "18 ott 2026, 14:32" da un istante ISO. */
export const dataOra = (iso: string) => conOra.format(new Date(iso))

/** "14:32" */
export const ora = (iso: string | number) => soloOra.format(new Date(iso))

/** "14:32:07" */
export const oraPrecisa = (iso: string | number) => oraSecondi.format(new Date(iso))

const giornoBreve = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const giornoLungo = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const giornoSettimana = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', weekday: 'short' })

/** Una data del gioco (YYYY-MM-DD) e' gia' italiana: si legge in UTC perché non scivoli al giorno prima. */
function daGiorno(data: string): Date {
  const [y, m, d] = data.split('-').map(Number)
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1))
}

/** "18 ott" */
export const giorno = (data: string) => giornoBreve.format(daGiorno(data))

/** "sabato 18 ottobre" */
export const giornoIntero = (data: string) => giornoLungo.format(daGiorno(data))

/** "sab" */
export const settimana = (data: string) => giornoSettimana.format(daGiorno(data)).replace('.', '')

/** Il giorno del mese, per le colonne strette: "18". */
export const delMese = (data: string) => String(Number(data.slice(8, 10)))

const relativo = new Intl.RelativeTimeFormat('it', { numeric: 'auto' })

/** "adesso", "3 minuti fa", "ieri", "5 giorni fa"; oltre un mese la data. */
export function fa(iso: string, adesso = Date.now()): string {
  const secondi = Math.round((new Date(iso).getTime() - adesso) / 1000)
  const a = Math.abs(secondi)
  if (a < 45) return 'adesso'
  if (a < 3_600) return relativo.format(Math.round(secondi / 60), 'minute')
  if (a < 86_400) return relativo.format(Math.round(secondi / 3_600), 'hour')
  if (a < 30 * 86_400) return relativo.format(Math.round(secondi / 86_400), 'day')
  return dataOra(iso)
}

/** "2 h 14 min", "38 s": una durata breve. */
export function durata(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)} ms`
  const s = Math.round(ms / 1_000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 === 0 ? `${h} h` : `${h} h ${m % 60} min`
}

/** Un dispositivo dallo user agent, in due parole: "iPhone · Safari", "Mac · Chrome". */
export function dispositivo(ua: string | null): string {
  if (!ua) return 'Dispositivo sconosciuto'
  const sistema = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Macintosh|Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : null
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /CriOS|Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : null
  const pezzi = [sistema, browser].filter(Boolean)
  return pezzi.length > 0 ? pezzi.join(' · ') : ua.slice(0, 40)
}
