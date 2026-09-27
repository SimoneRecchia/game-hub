/**
 * I periodi delle classifiche: un giorno, una settimana, un mese, sempre.
 *
 * Sono periodi di calendario — la settimana da lunedì a domenica, il mese dal
 * primo all'ultimo — e non finestre che scorrono. "Gli ultimi sette giorni"
 * cambiano ogni mattina anche se nessuno gioca, e non dicono mai chi ha vinto
 * una settimana; una settimana di calendario si chiude, e la si puo' andare a
 * rivedere (`indietro`), fino a quella del primo giorno di gioco.
 *
 * Gli stessi conti servono al Worker, per scegliere le partite, e al browser,
 * per dare un nome al periodo.
 */

import { EPOCH_DATE } from './config'
import { dateForPuzzleNumber, puzzleNumberFor } from './daily'
import type { LeaderboardScope, PeriodoClassifica } from './types'

export const PERIODI: readonly LeaderboardScope[] = ['today', 'week', 'month', 'all']

/** 0 il lunedì, 6 la domenica, per una data YYYY-MM-DD. */
export function giornoDellaSettimana(data: string): number {
  const [anno, mese, giorno] = data.split('-').map(Number)
  return (new Date(Date.UTC(anno, mese - 1, giorno)).getUTCDay() + 6) % 7
}

/** Il primo del mese di `data`, spostato di `mesi` mesi (negativi per andare avanti). */
function primoDelMese(data: string, mesi = 0): string {
  const [anno, mese] = data.split('-').map(Number)
  return new Date(Date.UTC(anno, mese - 1 - mesi, 1)).toISOString().slice(0, 10)
}

/** Fin dove si puo' tornare indietro: fino al periodo che contiene il primo giorno di gioco. */
export function indietroMassimo(scope: LeaderboardScope, numeroDiOggi: number): number {
  const oggi = dateForPuzzleNumber(numeroDiOggi)
  switch (scope) {
    case 'today':
      return Math.max(0, numeroDiOggi - 1)
    case 'week': {
      const lunediDiOggi = numeroDiOggi - giornoDellaSettimana(oggi)
      const lunediDelPrimo = 1 - giornoDellaSettimana(EPOCH_DATE)
      return Math.max(0, Math.round((lunediDiOggi - lunediDelPrimo) / 7))
    }
    case 'month': {
      const [annoPrimo, mesePrimo] = EPOCH_DATE.split('-').map(Number)
      const [anno, mese] = oggi.split('-').map(Number)
      return Math.max(0, (anno - annoPrimo) * 12 + (mese - mesePrimo))
    }
    case 'all':
      return 0
  }
}

/**
 * Il periodo `indietro` volte prima di quello in corso: 0 e' oggi, questa
 * settimana, questo mese. Un `indietro` oltre il primo giorno di gioco si ferma
 * li'. "Sempre" va dal primo giorno a oggi, e non ha un prima.
 */
export function periodoDi(scope: LeaderboardScope, numeroDiOggi: number, indietro = 0): PeriodoClassifica {
  const massimo = indietroMassimo(scope, numeroDiOggi)
  const quanti = Math.min(Math.max(0, Math.floor(indietro)), massimo)
  const oggi = dateForPuzzleNumber(numeroDiOggi)
  const periodo = (da: number, a: number): PeriodoClassifica => ({ scope, indietro: quanti, massimo, da, a })
  switch (scope) {
    case 'today':
      return periodo(numeroDiOggi - quanti, numeroDiOggi - quanti)
    case 'week': {
      const lunedi = numeroDiOggi - giornoDellaSettimana(oggi) - 7 * quanti
      return periodo(lunedi, lunedi + 6)
    }
    case 'month': {
      const primo = primoDelMese(oggi, quanti)
      return periodo(puzzleNumberFor(primo), puzzleNumberFor(primoDelMese(primo, -1)) - 1)
    }
    case 'all':
      return periodo(1, numeroDiOggi)
  }
}

/** true se il periodo arriva a oggi: solo allora ci sono partite in corso e serie da mostrare. */
export function comprendeOggi(periodo: PeriodoClassifica, numeroDiOggi: number): boolean {
  return periodo.da <= numeroDiOggi && numeroDiOggi <= periodo.a
}
