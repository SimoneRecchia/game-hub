import { Hono } from 'hono'
import { MAX_COOP_GUESTS, WORD_LENGTH } from '../../shared/config'
import { isWellFormedGuess } from '../../shared/wordle'
import { GUESS_SET } from '../../shared/words/guesses'
import type { CoopInvite, CoopRoom, CoopView, InvitablePlayer } from '../../shared/types'
import type { AppEnv } from '../types'
import { fail, newId, nowIso } from '../lib/http'
import { requireAuth } from '../lib/session'
import { dailyAnswer, openGame, today } from '../lib/wordleStore'
import {
  acceptedInvite,
  findRoom,
  guestView,
  hostRoom,
  invitablePlayers,
  inviteById,
  markSpectated,
  occupiedSlots,
  openRoom,
  pendingInvites,
  roomById,
} from '../lib/coopStore'

export const coopRoutes = new Hono<AppEnv>()

  .use('*', requireAuth)

  /* ─────────────────────────────  Lato host  ───────────────────────────── */

  /**
   * La stanza dell'host per oggi, se esiste. Volutamente di sola lettura:
   * aprire il gioco non deve creare una stanza vuota a ogni visita. La crea
   * il primo invito.
   */
  .get('/room', async (c) => {
    const when = today()
    const room = await findRoom(c.env.DB, c.get('player').id, when.puzzleNumber)
    if (!room) return c.json<CoopRoom | null>(null)
    return c.json<CoopRoom | null>(await hostRoom(c.env.DB, room))
  })

  /** Chi si può invitare, con l'avviso su chi non ha ancora giocato. */
  .get('/players', async (c) => {
    const when = today()
    const room = await findRoom(c.env.DB, c.get('player').id, when.puzzleNumber)
    const players = await invitablePlayers(c.env.DB, c.get('player').id, when, room?.id ?? null)
    return c.json<{ players: InvitablePlayer[] }>({ players })
  })

  .post('/invite', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { playerId?: unknown } | null
    const guestId = typeof body?.playerId === 'string' ? body.playerId : ''
    if (!guestId) fail(400, 'BAD_REQUEST', 'Manca il giocatore da invitare.')

    const host = c.get('player')
    if (guestId === host.id) fail(400, 'SELF_INVITE', 'Non puoi invitare te stesso.')

    const guest = await c.env.DB.prepare('SELECT id FROM players WHERE id = ?')
      .bind(guestId)
      .first<{ id: string }>()
    if (!guest) fail(404, 'PLAYER_NOT_FOUND', 'Giocatore non trovato.')

    const when = today()
    const room = await openRoom(c.env.DB, host.id, when)

    if ((await occupiedSlots(c.env.DB, room.id)) >= MAX_COOP_GUESTS) {
      fail(409, 'ROOM_FULL', `Puoi invitare al massimo ${MAX_COOP_GUESTS} persone.`)
    }

    /*
     * `ON CONFLICT` invece di un controllo separato: due tap ravvicinati sullo
     * stesso nome non devono creare due inviti, e un invito già rifiutato deve
     * poter essere rifatto.
     */
    const inserted = await c.env.DB.prepare(
      `INSERT INTO coop_invites (id, room_id, guest_id, status, created_at)
            VALUES (?, ?, ?, 'pending', ?)
       ON CONFLICT (room_id, guest_id) DO UPDATE
            SET status = 'pending', created_at = excluded.created_at, responded_at = NULL
          WHERE coop_invites.status = 'declined'`,
    )
      .bind(newId('inv'), room.id, guestId, nowIso())
      .run()

    if (inserted.meta.changes !== 1) {
      fail(409, 'ALREADY_INVITED', 'Questa persona è già stata invitata.')
    }

    return c.json<CoopRoom>(await hostRoom(c.env.DB, room), 201)
  })

  /** Ritira un invito, o allontana un invitato. */
  .post('/invite/:id/revoke', async (c) => {
    const invite = await inviteById(c.env.DB, c.req.param('id'))
    if (!invite) fail(404, 'INVITE_NOT_FOUND', 'Invito non trovato.')

    const room = await roomById(c.env.DB, invite.room_id)
    if (!room || room.host_id !== c.get('player').id) {
      fail(403, 'NOT_HOST', 'Solo chi ha invitato può ritirare l’invito.')
    }

    await c.env.DB.prepare('DELETE FROM coop_invites WHERE id = ?').bind(invite.id).run()
    return c.json<CoopRoom>(await hostRoom(c.env.DB, room))
  })

  /** Chiude la stanza: gli invitati smettono di vedere la partita. */
  .post('/room/close', async (c) => {
    const when = today()
    const room = await findRoom(c.env.DB, c.get('player').id, when.puzzleNumber)
    if (!room) return c.json({ ok: true })
    await c.env.DB.prepare('UPDATE coop_rooms SET closed_at = ? WHERE id = ?')
      .bind(nowIso(), room.id)
      .run()
    return c.json({ ok: true })
  })

  /* ────────────────────────────  Lato guest  ───────────────────────────── */

  /** Gli inviti da accettare. Il client la interroga a polling. */
  .get('/inbox', async (c) => {
    const invites = await pendingInvites(c.env.DB, c.get('player').id, today())
    return c.json<{ invites: CoopInvite[] }>({ invites })
  })

  .post('/invite/:id/accept', async (c) => {
    const guest = c.get('player')
    const invite = await inviteById(c.env.DB, c.req.param('id'))
    if (!invite || invite.guest_id !== guest.id) {
      fail(404, 'INVITE_NOT_FOUND', 'Invito non trovato.')
    }
    if (invite.status === 'declined') fail(409, 'INVITE_DECLINED', 'Invito già rifiutato.')

    const room = await roomById(c.env.DB, invite.room_id)
    if (!room || room.closed_at !== null) {
      fail(409, 'ROOM_CLOSED', 'La partita non è più condivisa.')
    }

    const when = today()
    if (room.puzzle_number !== when.puzzleNumber) {
      fail(409, 'INVITE_EXPIRED', 'Questo invito era per la parola di un altro giorno.')
    }

    await c.env.DB.prepare(
      `UPDATE coop_invites SET status = 'accepted', responded_at = ? WHERE id = ?`,
    )
      .bind(nowIso(), invite.id)
      .run()

    /*
     * Accettando, il guest vedrà i tentativi dell'host e quindi la parola di
     * oggi. La sua giornata resta giocabile ma non fa punti: lo sapeva prima
     * di accettare (vedi `wouldSpoil` in /inbox).
     */
    const answer = await dailyAnswer(c.env.DB, when)
    await markSpectated(c.env.DB, guest.id, when, answer)

    return c.json({ ok: true, roomId: room.id })
  })

  .post('/invite/:id/decline', async (c) => {
    const invite = await inviteById(c.env.DB, c.req.param('id'))
    if (!invite || invite.guest_id !== c.get('player').id) {
      fail(404, 'INVITE_NOT_FOUND', 'Invito non trovato.')
    }
    await c.env.DB.prepare(
      `UPDATE coop_invites SET status = 'declined', responded_at = ? WHERE id = ?`,
    )
      .bind(nowIso(), invite.id)
      .run()
    return c.json({ ok: true })
  })

  /** La board dell'host, in sola lettura. Il client la interroga a polling. */
  .get('/room/:id/view', async (c) => {
    const guest = c.get('player')
    const room = await roomById(c.env.DB, c.req.param('id'))
    if (!room) fail(404, 'ROOM_NOT_FOUND', 'Partita non trovata.')

    // Solo chi ha accettato può guardare: altrimenti basterebbe l'ID della
    // stanza per conoscere la parola del giorno.
    if (room.host_id !== guest.id && !(await acceptedInvite(c.env.DB, room.id, guest.id))) {
      fail(403, 'NOT_INVITED', 'Non sei fra gli invitati di questa partita.')
    }

    const when = today()
    const answer = await dailyAnswer(c.env.DB, when)
    const hostGame = await openGame(c.env.DB, room.host_id, when, answer)
    return c.json<CoopView>(await guestView(c.env.DB, room, hostGame))
  })

  .post('/room/:id/suggest', async (c) => {
    const guest = c.get('player')
    const body = (await c.req.json().catch(() => null)) as { word?: unknown } | null
    const word = typeof body?.word === 'string' ? body.word.trim().toLowerCase() : ''

    if (!isWellFormedGuess(word)) {
      fail(400, 'BAD_GUESS', `Serve una parola di ${WORD_LENGTH} lettere, senza accenti.`)
    }
    if (!GUESS_SET.has(word)) {
      fail(400, 'NOT_A_WORD', `"${word.toUpperCase()}" non è nel dizionario.`)
    }

    const room = await roomById(c.env.DB, c.req.param('id'))
    if (!room) fail(404, 'ROOM_NOT_FOUND', 'Partita non trovata.')
    if (room.closed_at !== null) fail(409, 'ROOM_CLOSED', 'La partita non è più condivisa.')

    const invite = await acceptedInvite(c.env.DB, room.id, guest.id)
    if (!invite) fail(403, 'NOT_INVITED', 'Non sei fra gli invitati di questa partita.')

    const when = today()
    const answer = await dailyAnswer(c.env.DB, when)
    const hostGame = await openGame(c.env.DB, room.host_id, when, answer)
    if (hostGame.status !== 'playing') {
      fail(409, 'GAME_OVER', 'La partita è già finita.')
    }

    await c.env.DB.prepare(
      `INSERT INTO coop_suggestions (id, room_id, guest_id, word, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(newId('sug'), room.id, guest.id, word, nowIso())
      .run()

    return c.json<CoopView>(await guestView(c.env.DB, room, hostGame), 201)
  })
