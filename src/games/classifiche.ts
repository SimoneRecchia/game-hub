/**
 * Le classifiche dei giochi viste nello stesso modo.
 *
 * Ogni gioco ha la sua classifica con i suoi spareggi e le sue colonne, e la
 * schermata della classifica le mostra per quel che sono. Ma per un'anteprima
 * — il podio nella pagina del gioco — servono solo chi, e quanti punti: questo
 * e' il modo comune di leggerle. Qui stanno anche gli indirizzi, con il
 * periodo, e il nome di ogni periodo come si legge sopra la classifica.
 */

import { ROTTE } from '@/app/rotte'
import { dateForPuzzleNumber } from '@shared/daily'
import type {
  BattagliaLeaderboard,
  ChiaveClassifica,
  CruciverbaLeaderboard,
  GeneraleLeaderboard,
  LeaderboardResponse,
  LeaderboardScope,
  PeriodoClassifica,
  QuizLeaderboard,
  ScarabeoLeaderboard,
} from '@shared/types'

export type { ChiaveClassifica }

export interface RigaComune {
  rank: number
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
}

/** Il periodo in fondo a un indirizzo: niente per quello di sempre, oggi. */
function conPeriodo(base: string, parametro: string, scope: LeaderboardScope, indietro: number): string {
  const parti = [...(scope === 'today' ? [] : [`${parametro}=${scope}`]), ...(indietro > 0 ? [`indietro=${indietro}`] : [])]
  return parti.length > 0 ? `${base}?${parti.join('&')}` : base
}

/** La richiesta al server per una classifica. */
export function percorsoClassifica(chiave: ChiaveClassifica, scope: LeaderboardScope, indietro = 0): string {
  const base = chiave === 'wordle' ? '/leaderboard' : `/leaderboard/${chiave}`
  return `${base}?scope=${scope}${indietro > 0 ? `&indietro=${indietro}` : ''}`
}

/** La richiesta al server per tutte le classifiche di un periodo, i primi tre di ognuna. */
export function percorsoPanoramica(scope: LeaderboardScope, indietro = 0): string {
  return `/leaderboard/panoramica?scope=${scope}${indietro > 0 ? `&indietro=${indietro}` : ''}`
}

/** L'indirizzo della schermata: `null` per tutte le classifiche, una chiave per quella per intero. */
export function indirizzoClassifica(chiave: ChiaveClassifica | null, scope: LeaderboardScope, indietro = 0): string {
  return conPeriodo(ROTTE.classifica(chiave ?? undefined), 'periodo', scope, indietro)
}

type Qualunque =
  | LeaderboardResponse
  | ScarabeoLeaderboard
  | CruciverbaLeaderboard
  | BattagliaLeaderboard
  | QuizLeaderboard
  | GeneraleLeaderboard

export function righeComuni(risposta: Qualunque): RigaComune[] {
  return risposta.rows.map((r) => ({
    rank: r.rank,
    playerId: r.playerId,
    nickname: r.nickname,
    displayName: r.displayName,
    avatarColor: r.avatarColor,
    punti: 'score' in r ? r.score : r.punti,
  }))
}

/* ─────────────────────────────  Il nome di un periodo  ───────────────────────────── */

const GIORNO = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const GIORNO_MESE = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const MESE = new Intl.DateTimeFormat('it-IT', { month: 'long', timeZone: 'UTC' })

function parti(numero: number): { anno: number; data: Date } {
  const [anno, mese, giorno] = dateForPuzzleNumber(numero).split('-').map(Number)
  return { anno, data: new Date(Date.UTC(anno, mese - 1, giorno)) }
}

const maiuscola = (testo: string) => testo.charAt(0).toUpperCase() + testo.slice(1)

/** "21–27 settembre", "31 agosto – 6 settembre", con l'anno solo se non e' quello di oggi. */
function settimana(da: number, a: number, annoDiOggi: number): string {
  const inizio = parti(da)
  const fine = parti(a)
  const coda = `${GIORNO_MESE.format(fine.data)}${fine.anno !== annoDiOggi || inizio.anno !== fine.anno ? ` ${fine.anno}` : ''}`
  if (inizio.anno !== fine.anno) return `${GIORNO_MESE.format(inizio.data)} ${inizio.anno} – ${coda}`
  if (inizio.data.getUTCMonth() !== fine.data.getUTCMonth()) return `${GIORNO_MESE.format(inizio.data)} – ${coda}`
  return `${inizio.data.getUTCDate()}–${coda}`
}

/**
 * Come si chiama un periodo sopra la classifica: "Oggi", "La settimana
 * scorsa", "Agosto", con sotto le date quando il nome non le dice.
 */
export function nomeDelPeriodo(periodo: PeriodoClassifica, numeroDiOggi: number): { titolo: string; sotto: string | null } {
  const annoDiOggi = parti(numeroDiOggi).anno
  const { scope, indietro, da, a } = periodo
  switch (scope) {
    case 'today': {
      const { anno, data } = parti(a)
      const giorno = `${GIORNO.format(data)}${anno !== annoDiOggi ? ` ${anno}` : ''}`
      if (indietro === 0) return { titolo: 'Oggi', sotto: giorno }
      if (indietro === 1) return { titolo: 'Ieri', sotto: giorno }
      return { titolo: maiuscola(giorno), sotto: null }
    }
    case 'week': {
      const date = settimana(da, a, annoDiOggi)
      if (indietro === 0) return { titolo: 'Questa settimana', sotto: date }
      if (indietro === 1) return { titolo: 'La settimana scorsa', sotto: date }
      return { titolo: date, sotto: null }
    }
    case 'month': {
      const { anno, data } = parti(da)
      const mese = maiuscola(`${MESE.format(data)}${anno !== annoDiOggi ? ` ${anno}` : ''}`)
      return { titolo: mese, sotto: indietro === 0 ? 'Questo mese' : indietro === 1 ? 'Il mese scorso' : null }
    }
    case 'all': {
      const { anno, data } = parti(1)
      return { titolo: 'Da sempre', sotto: `Dal ${GIORNO_MESE.format(data)} ${anno}` }
    }
  }
}
