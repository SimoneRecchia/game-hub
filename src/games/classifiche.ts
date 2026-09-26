/**
 * Le classifiche dei giochi viste nello stesso modo.
 *
 * Ogni gioco ha la sua classifica con i suoi spareggi e le sue colonne, e la
 * schermata della classifica le mostra per quel che sono. Ma per un'anteprima
 * — il podio nella pagina del gioco — servono solo chi, e quanti punti: questo
 * e' il modo comune di leggerle.
 */

import type {
  BattagliaLeaderboard,
  CruciverbaLeaderboard,
  GeneraleLeaderboard,
  GiocoClassificato,
  LeaderboardResponse,
  LeaderboardScope,
  ScarabeoLeaderboard,
} from '@shared/types'

export type ChiaveClassifica = GiocoClassificato | 'generale'

export interface RigaComune {
  rank: number
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
}

export function percorsoClassifica(chiave: ChiaveClassifica, scope: LeaderboardScope): string {
  const base = chiave === 'wordle' ? '/leaderboard' : `/leaderboard/${chiave}`
  return `${base}?scope=${scope}`
}

type Qualunque =
  | LeaderboardResponse
  | ScarabeoLeaderboard
  | CruciverbaLeaderboard
  | BattagliaLeaderboard
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
