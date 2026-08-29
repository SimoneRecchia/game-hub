/**
 * Calendario del gioco.
 *
 * La parola cambia a mezzanotte italiana: tutti i giocatori vedono lo stesso
 * puzzle nello stesso istante, qualunque sia il fuso del loro telefono.
 * Le stesse funzioni girano sul client (countdown) e nel Worker (verita').
 */

import { EPOCH_DATE, GAME_TIMEZONE } from './config'

const MS_PER_DAY = 86_400_000

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: GAME_TIMEZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function wallClockIn(instant: Date): WallClock {
  const parts = partsFormatter.formatToParts(instant)
  const get = (type: Intl.DateTimeFormatPartTypes) => {
    const found = parts.find((p) => p.type === type)
    return found ? Number(found.value) : 0
  }
  // Intl restituisce "24" a mezzanotte in alcune implementazioni con hour12:false.
  const hour = get('hour') % 24
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  }
}

/** Scarto in ms fra l'ora locale italiana e UTC nell'istante dato. */
function zoneOffsetMs(instant: Date): number {
  const wc = wallClockIn(instant)
  const asIfUtc = Date.UTC(wc.year, wc.month - 1, wc.day, wc.hour, wc.minute, wc.second)
  const truncated = Math.floor(instant.getTime() / 1000) * 1000
  return asIfUtc - truncated
}

/**
 * Istante UTC corrispondente a una data/ora locale italiana.
 * Due iterazioni bastano a convergere anche a cavallo dei cambi di ora legale.
 */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second)
  let utc = naive
  for (let i = 0; i < 2; i += 1) {
    utc = naive - zoneOffsetMs(new Date(utc))
  }
  return utc
}

/** Data di gioco corrente in formato YYYY-MM-DD (fuso italiano). */
export function gameDate(now: Date = new Date()): string {
  const wc = wallClockIn(now)
  return toIsoDate(wc.year, wc.month, wc.day)
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseIsoDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error(`Data non valida: ${date}`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

/** Somma (o sottrae) giorni a una data YYYY-MM-DD, restando sul calendario civile. */
export function addDays(date: string, delta: number): string {
  const { year, month, day } = parseIsoDate(date)
  const shifted = new Date(Date.UTC(year, month - 1, day + delta))
  return toIsoDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

/** Giorni di calendario fra due date YYYY-MM-DD (b - a). */
export function daysBetween(a: string, b: string): number {
  const pa = parseIsoDate(a)
  const pb = parseIsoDate(b)
  const ua = Date.UTC(pa.year, pa.month - 1, pa.day)
  const ub = Date.UTC(pb.year, pb.month - 1, pb.day)
  return Math.round((ub - ua) / MS_PER_DAY)
}

/** Numero del puzzle per una data: 1 il giorno di lancio, poi progressivo. */
export function puzzleNumberFor(date: string): number {
  return daysBetween(EPOCH_DATE, date) + 1
}

/** Data corrispondente a un numero di puzzle. */
export function dateForPuzzleNumber(puzzleNumber: number): string {
  return addDays(EPOCH_DATE, puzzleNumber - 1)
}

/** Millisecondi che mancano alla prossima parola (mezzanotte italiana). */
export function msToNextPuzzle(now: Date = new Date()): number {
  const tomorrow = addDays(gameDate(now), 1)
  const { year, month, day } = parseIsoDate(tomorrow)
  return Math.max(0, zonedTimeToUtc(year, month, day) - now.getTime())
}

/** PRNG deterministico a 32 bit (mulberry32): stesso seed, stessa sequenza. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Permutazione stabile degli indici 0..size-1.
 *
 * Serve a non ripetere una parola finche' l'intero elenco non e' esaurito,
 * senza per questo seguirlo in ordine alfabetico o di frequenza.
 */
const permutationCache = new Map<number, number[]>()

export function solutionPermutation(size: number, seed = 0x5eed_1701): number[] {
  const cached = permutationCache.get(size)
  if (cached) return cached
  const order = Array.from({ length: size }, (_, i) => i)
  const random = mulberry32(seed ^ size)
  for (let i = size - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  permutationCache.set(size, order)
  return order
}

/** Indice della soluzione per un dato puzzle dentro un elenco di `size` parole. */
export function solutionIndexFor(puzzleNumber: number, size: number): number {
  if (size <= 0) throw new Error("L'elenco delle soluzioni e' vuoto")
  const order = solutionPermutation(size)
  // Modulo positivo anche per numeri di puzzle <= 0 (date precedenti al lancio).
  const slot = (((puzzleNumber - 1) % size) + size) % size
  return order[slot]
}
