/**
 * Tutte le classifiche di un periodo in una richiesta, per la schermata che le
 * mette una sotto l'altra: di ognuna i primi tre, quanti sono, e dove sei tu.
 *
 * Una richiesta e non sei, come la schermata iniziale: le Pages Functions
 * gratuite contano le richieste. Le classifiche sono quelle di sempre, con i
 * loro spareggi; qui si tagliano soltanto.
 */

import { comprendeOggi } from '../../shared/periodi'
import type {
  AnteprimaClassifica,
  PanoramicaClassifiche,
  PeriodoClassifica,
  RigaAnteprima,
} from '../../shared/types'
import { classificaBattaglia } from './battagliaStore'
import { classificaCruciverba } from './cruciverbaStore'
import { classificaGenerale } from './generale'
import { nowIso } from './http'
import { leaderboard } from './leaderboard'
import { classificaQuiz } from './quizStore'
import { classificaScarabeo } from './scarabeoStore'

interface RigaQualunque {
  rank: number
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
}

function anteprima<R extends RigaQualunque>(
  righe: R[],
  me: R | null,
  punti: (r: R) => number,
  inCorso: (r: R) => boolean,
): AnteprimaClassifica {
  const riga = (r: R): RigaAnteprima => ({
    rank: r.rank,
    playerId: r.playerId,
    nickname: r.nickname,
    displayName: r.displayName,
    avatarColor: r.avatarColor,
    punti: punti(r),
    inCorso: inCorso(r),
  })
  return { giocatori: righe.length, primi: righe.slice(0, 3).map(riga), me: me ? riga(me) : null }
}

export async function panoramica(
  db: D1Database,
  periodo: PeriodoClassifica,
  numeroDiOggi: number,
  viewerId: string,
): Promise<PanoramicaClassifiche> {
  const [wordle, scarabeo, cruciverba, battaglia, quiz, generale] = await Promise.all([
    leaderboard(db, periodo, numeroDiOggi, viewerId),
    classificaScarabeo(db, periodo, numeroDiOggi, viewerId),
    classificaCruciverba(db, periodo, numeroDiOggi, viewerId),
    classificaBattaglia(db, periodo, numeroDiOggi, viewerId),
    classificaQuiz(db, periodo, numeroDiOggi, viewerId),
    classificaGenerale(db, periodo, viewerId),
  ])

  // "In corso" vuol dire una classificata di oggi ancora aperta: in un periodo passato non ce ne sono.
  const oggi = comprendeOggi(periodo, numeroDiOggi)
  const aperti = new Set(
    [
      ...wordle.rows.filter((r) => r.todayStatus === 'playing'),
      ...scarabeo.rows.filter((r) => r.inCorso),
      ...cruciverba.rows.filter((r) => r.inCorso),
      ...battaglia.rows.filter((r) => r.inCorso),
      ...quiz.rows.filter((r) => r.inCorso),
    ].map((r) => r.playerId),
  )
  const colPunti = (r: { punti: number }) => r.punti
  const aperta = (r: { inCorso: boolean }) => oggi && r.inCorso

  return {
    scope: periodo.scope,
    periodo,
    updatedAt: nowIso(),
    classifiche: {
      generale: anteprima(generale.rows, generale.me, colPunti, (r) => oggi && aperti.has(r.playerId)),
      wordle: anteprima(
        wordle.rows,
        wordle.me,
        (r) => r.score,
        (r) => oggi && r.todayStatus === 'playing',
      ),
      scarabeo: anteprima(scarabeo.rows, scarabeo.me, colPunti, aperta),
      cruciverba: anteprima(cruciverba.rows, cruciverba.me, colPunti, aperta),
      battaglia: anteprima(battaglia.rows, battaglia.me, colPunti, aperta),
      quiz: anteprima(quiz.rows, quiz.me, colPunti, aperta),
    },
  }
}
