import { Hono } from 'hono'
import type { Attivita, CoopInvite, PresenzaRisposta } from '../../shared/types'
import type { AppEnv } from '../types'
import { requireVerified } from '../lib/session'
import { participation, pendingInvites } from '../lib/coopStore'
import { today } from '../lib/wordleStore'
import {
  ATTIVITA,
  latoDi,
  partitaAperta,
  partitaBreve,
  segnaPresenza,
  sfideRicevute,
} from '../lib/battagliaStore'

/**
 * Il giro di controllo che ogni schermata fa ogni pochi secondi.
 *
 * Una richiesta sola per tre cose: dice al server che il giocatore c'e' (e
 * dove), e gli riporta gli inviti del Wordle in compagnia, le sfide a
 * battaglia navale e la partita aperta. Tenerle separate raddoppierebbe le
 * richieste, e il piano gratuito delle Pages Functions ne concede centomila al
 * giorno per tutto il sito.
 */
export const presenzaRoutes = new Hono<AppEnv>()
  .use('*', requireVerified)
  .post('/', async (c) => {
    const corpo = (await c.req.json().catch(() => ({}))) as { attivita?: unknown }
    const attivita: Attivita = ATTIVITA.includes(corpo.attivita as Attivita)
      ? (corpo.attivita as Attivita)
      : 'altro'
    const io = c.get('player').id
    const adesso = Date.now()
    const db = c.env.DB

    await segnaPresenza(db, io, attivita, adesso)

    // Gli inviti del Wordle: la stessa regola di /coop/inbox. Chi gioca gia' la
    // giornata in una stanza non ne riceve altri.
    const when = today()
    const [mia, sfide, aperta] = await Promise.all([
      participation(db, io, when.puzzleNumber),
      sfideRicevute(db, io, adesso),
      partitaAperta(db, io),
    ])
    const coop: CoopInvite[] = mia?.spectated ? [] : await pendingInvites(db, io, when)

    const lato = aperta ? latoDi(aperta, io) : null
    return c.json<PresenzaRisposta>({
      coop,
      // Chi e' gia' in battaglia non riceve altre sfide: le vedrebbe e non
      // potrebbe accettarle.
      battaglia: aperta ? [] : sfide,
      partita: aperta && lato ? await partitaBreve(db, aperta, lato) : null,
    })
  })
