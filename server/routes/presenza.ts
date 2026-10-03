import { Hono } from 'hono'
import type { Attivita, CoopInvite, PresenzaRisposta } from '../../shared/types'
import type { AppEnv } from '../types'
import { requireVerified } from '../lib/session'
import { participation, pendingInvites } from '../lib/coopStore'
import { invitiRicevuti as invitiCompagnia } from '../lib/compagniaStore'
import { today } from '../lib/wordleStore'
import { duelloAperto, sfideQuizRicevute } from '../lib/quizSfideStore'
import {
  invitiRicevuti,
  latoDi as latoIndovina,
  partitaAperta as partitaIndovinaAperta,
  partitaBreve as partitaIndovinaBreve,
} from '../lib/indovinaStore'
import {
  invitiRicevuti as invitiTavolo,
  latoDi as latoTavolo,
  partitaAperta as partitaTavoloAperta,
  partitaBreve as partitaTavoloBreve,
} from '../lib/tavoloStore'
import {
  invitiRicevuti as invitiNomi,
  latoDi as latoNomi,
  sfidaAperta as sfidaNomiAperta,
  sfidaBreve as sfidaNomiBreve,
} from '../lib/nomiSfideStore'
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
 * Una richiesta sola per tutto: dice al server che il giocatore c'e' (e
 * dove), e gli riporta gli inviti a giocare in compagnia — il Wordle, il
 * cruciverba, lo Scarabeo — le sfide a battaglia navale, a quiz, a Indovina
 * chi, ai giochi da tavoliere e a Nomi, cose e città, le partite e il duello
 * aperti. Tenerle separate
 * moltiplicherebbe le richieste, e il piano gratuito delle Pages Functions ne
 * concede centomila al giorno per tutto il sito.
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
    const [
      mia,
      sfide,
      aperta,
      quiz,
      duello,
      indovina,
      apertaIndovina,
      tavolo,
      apertaTavolo,
      nomi,
      apertaNomi,
      compagnia,
    ] = await Promise.all([
      participation(db, io, when.puzzleNumber),
      sfideRicevute(db, io, adesso),
      partitaAperta(db, io),
      sfideQuizRicevute(db, io, adesso),
      duelloAperto(db, io, adesso),
      invitiRicevuti(db, io, adesso),
      partitaIndovinaAperta(db, io, adesso),
      invitiTavolo(db, io, adesso),
      partitaTavoloAperta(db, io, adesso),
      invitiNomi(db, io, adesso),
      sfidaNomiAperta(db, io, adesso),
      invitiCompagnia(db, io, when.puzzleNumber),
    ])
    const coop: CoopInvite[] = mia?.spectated ? [] : await pendingInvites(db, io, when)

    const lato = aperta ? latoDi(aperta, io) : null
    const latoInIndovina = apertaIndovina ? latoIndovina(apertaIndovina, io) : null
    const latoInTavolo = apertaTavolo ? latoTavolo(apertaTavolo, io) : null
    const latoInNomi = apertaNomi ? latoNomi(apertaNomi, io) : null
    return c.json<PresenzaRisposta>({
      coop,
      // Chi e' gia' in battaglia non riceve altre sfide: le vedrebbe e non
      // potrebbe accettarle.
      battaglia: aperta ? [] : sfide,
      partita: aperta && lato ? await partitaBreve(db, aperta, lato) : null,
      // Chi e' gia' in un duello non riceve altre sfide a quiz, tranne la rivincita di quello.
      quiz: duello ? quiz.filter((s) => s.rivincita) : quiz,
      duello,
      // Come per la battaglia: chi e' gia' in una partita non riceve altri inviti.
      indovina: apertaIndovina ? [] : indovina,
      partitaIndovina:
        apertaIndovina && latoInIndovina ? await partitaIndovinaBreve(db, apertaIndovina, latoInIndovina) : null,
      // Scacchi, dama, Forza 4 e go si contano insieme: una partita alla volta, a uno dei quattro.
      tavolo: apertaTavolo ? [] : tavolo,
      partitaTavolo: apertaTavolo && latoInTavolo ? await partitaTavoloBreve(db, apertaTavolo, latoInTavolo) : null,
      // Come per gli altri: chi e' gia' in una sfida a Nomi, cose e città non ne riceve altre.
      nomi: apertaNomi ? [] : nomi,
      partitaNomi: apertaNomi && latoInNomi ? await sfidaNomiBreve(db, apertaNomi, latoInNomi) : null,
      compagnia,
    })
  })
