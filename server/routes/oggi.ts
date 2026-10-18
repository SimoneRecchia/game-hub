import { Hono } from 'hono'
import { msToNextPuzzle } from '../../shared/daily'
import { periodoDi } from '../../shared/periodi'
import type { OggiRisposta } from '../../shared/types'
import type { AppEnv } from '../types'
import { requireVerified } from '../lib/session'
import { classificaGenerale } from '../lib/generale'
import {
  riepilogoAnagrammi,
  riepilogoCruciverba,
  riepilogoNomi,
  riepilogoQuiz,
  riepilogoScarabeo,
  riepilogoGhigliottina,
  riepilogoParoliere,
  riepilogoCatena,
  riepilogoSudoku,
  riepilogoWordle,
} from '../lib/riepiloghi'
import { today } from '../lib/wordleStore'
import { annuncioVisibile } from '../lib/annunci'

/**
 * La schermata iniziale in una richiesta: le classificate di oggi, la
 * posizione nella classifica generale del giorno e i primi tre, che la
 * classifica calcola comunque. I giochi della Fortuna hanno la loro scheda, e
 * la loro richiesta (`/fortuna`).
 *
 * Una e non una per gioco perché il piano gratuito delle Pages Functions conta le
 * richieste, e la schermata iniziale e' quella che si apre di piu'. Come i
 * riepiloghi che la compongono, non apre niente: e' di sola lettura. Con lei
 * arriva l'annuncio a tutti, se ce n'e' uno (vedi server/lib/annunci.ts).
 */
export const oggiRoutes = new Hono<AppEnv>().use('*', requireVerified).get('/', async (c) => {
  const db = c.env.DB
  const io = c.get('player').id
  const quando = today()
  const [
    wordle,
    scarabeo,
    cruciverba,
    sudoku,
    quiz,
    nomi,
    anagrammi,
    ghigliottina,
    paroliere,
    catena,
    generale,
    annuncio,
  ] = await Promise.all([
    riepilogoWordle(db, io),
    riepilogoScarabeo(db, io),
    riepilogoCruciverba(db, io),
    riepilogoSudoku(db, io),
    riepilogoQuiz(db, io),
    riepilogoNomi(db, io),
    riepilogoAnagrammi(db, io),
    riepilogoGhigliottina(db, io),
    riepilogoParoliere(db, io),
    riepilogoCatena(db, io),
    classificaGenerale(db, periodoDi('today', quando.puzzleNumber), io),
    annuncioVisibile(db),
  ])
  return c.json<OggiRisposta>({
    date: quando.date,
    puzzleNumber: quando.puzzleNumber,
    msToNextPuzzle: msToNextPuzzle(),
    wordle,
    scarabeo,
    cruciverba,
    sudoku,
    quiz,
    nomi,
    anagrammi,
    ghigliottina,
    paroliere,
    catena,
    generale: {
      posizione: generale.me?.rank ?? null,
      punti: generale.me?.punti ?? 0,
      giocatori: generale.rows.length,
      podio: generale.rows
        .filter((r) => r.punti > 0)
        .slice(0, 3)
        .map((r) => ({
          playerId: r.playerId,
          nickname: r.nickname,
          displayName: r.displayName,
          avatarColor: r.avatarColor,
          punti: r.punti,
        })),
    },
    annuncio,
  })
})
