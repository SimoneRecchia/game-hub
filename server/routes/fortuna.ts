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
import { assicura, riepilogoEnalotto } from '../lib/enalottoStore'
import { today } from '../lib/wordleStore'

/**
 * La scheda della Fortuna in una richiesta: il saldo di oggi, comune a tutti i
 * giochi, e com'e' andata a ognuno. Di sola lettura, come la schermata iniziale.
 */
export const fortunaRoutes = new Hono<AppEnv>().use('*', requireVerified).get('/', async (c) => {
  const db = c.env.DB
  const io = c.get('player').id
  const quando = today()
  // I premi del SuperEnalotto prima del saldo: finita la diretta, chi apre la scheda li trova gia' dentro.
  // Il saldo si conta una volta, e lo usano anche Crazy Time e il SuperEnalotto, che partono appena c'e'.
  await assicura(db)
  const conto = saldoDi(db, io, quando.puzzleNumber)
  const [saldo, slot, blackjack, roulette, superenalotto, ruota] = await Promise.all([
    conto,
    riepilogoSlot(db, io),
    riepilogoBlackjack(db, io),
    riepilogoRoulette(db, io),
    conto.then((s) => riepilogoEnalotto(db, io, s)),
    conto.then((s) => riepilogoRuota(db, io, s)),
  ])
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
    superenalotto,
  })
})
