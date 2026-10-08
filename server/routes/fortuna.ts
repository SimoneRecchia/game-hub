import { Hono } from 'hono'
import { msToNextPuzzle } from '../../shared/daily'
import type { FortunaRisposta } from '../../shared/types'
import type { AppEnv } from '../types'
import { saldoDi } from '../lib/fortuna'
import { requireVerified } from '../lib/session'
import { riepilogoRuota } from '../lib/ruotaStore'
import { riepilogoSlot } from '../lib/slotStore'
import { riepilogoBlackjack } from '../lib/blackjackStore'
import { riepilogoRoulette } from '../lib/rouletteStore'
import { today } from '../lib/wordleStore'

/**
 * La scheda della Fortuna in una richiesta: il saldo di oggi, comune a tutti i
 * giochi, e com'e' andata a ognuno. Di sola lettura, come la schermata iniziale.
 */
export const fortunaRoutes = new Hono<AppEnv>().use('*', requireVerified).get('/', async (c) => {
  const db = c.env.DB
  const io = c.get('player').id
  const quando = today()
  const [saldo, slot, blackjack, roulette] = await Promise.all([
    saldoDi(db, io, quando.puzzleNumber),
    riepilogoSlot(db, io),
    riepilogoBlackjack(db, io),
    riepilogoRoulette(db, io),
  ])
  const ruota = await riepilogoRuota(db, io, saldo)
  return c.json<FortunaRisposta>({
    puzzleNumber: quando.puzzleNumber,
    date: quando.date,
    msToNextPuzzle: msToNextPuzzle(),
    classificate: saldo.classificate,
    saldo: saldo.saldo,
    netti: saldo.netti,
    giocate: saldo.giocate,
    ruota,
    slot,
    blackjack,
    roulette,
  })
})
