/**
 * Accesso ai dati delle partite in compagnia.
 *
 * Si gioca in compagnia **la parola del giorno**, l'unica della classificata:
 * per questo `coop_rooms` ha "una stanza per host al giorno". Le query filtrano
 * su `slot = 1` da quando le parole erano cinque, e il filtro resta: e' la
 * posizione della parola del giorno, e non costa niente.
 */

import { MAX_ATTEMPTS, MAX_COOP_GUESTS, WORD_LENGTH } from '../../shared/config'
import { evaluateAll } from '../../shared/wordle'
import type {
  CoopGuest,
  CoopInvite,
  CoopRoom,
  CoopSuggestion,
  CoopView,
  InvitablePlayer,
  InviteStatus,
} from '../../shared/types'
import { newId, nowIso } from './http'
import { openGame, parseGuesses, type GameRow, type Today } from './wordleStore'

/** Quanti suggerimenti si mostrano: bastano gli ultimi, non serve tutto. */
const SUGGESTION_LIMIT = 30

interface RoomRow {
  id: string
  host_id: string
  puzzle_number: number
  created_at: string
  closed_at: string | null
}

interface SuggestionRow {
  id: string
  guest_id: string
  word: string
  created_at: string
  used_at: string | null
  nickname: string
  display_name: string
  avatar_color: string
}

function toSuggestion(row: SuggestionRow): CoopSuggestion {
  return {
    id: row.id,
    word: row.word,
    guestId: row.guest_id,
    guestName: row.display_name || row.nickname,
    avatarColor: row.avatar_color,
    createdAt: row.created_at,
    usedAt: row.used_at,
  }
}

/** La stanza dell'host per la giornata, creata al primo invito. */
export async function openRoom(
  db: D1Database,
  hostId: string,
  when: Today,
): Promise<RoomRow> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO coop_rooms (id, host_id, puzzle_number, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(newId('room'), hostId, when.puzzleNumber, nowIso())
    .run()

  const row = await db
    .prepare('SELECT * FROM coop_rooms WHERE host_id = ? AND puzzle_number = ?')
    .bind(hostId, when.puzzleNumber)
    .first<RoomRow>()

  if (!row) throw new Error('Stanza non trovata subito dopo la creazione')
  return row
}

/** La stanza dell'host, se esiste. Non la crea. */
export async function findRoom(
  db: D1Database,
  hostId: string,
  puzzleNumber: number,
): Promise<RoomRow | null> {
  return db
    .prepare('SELECT * FROM coop_rooms WHERE host_id = ? AND puzzle_number = ?')
    .bind(hostId, puzzleNumber)
    .first<RoomRow>()
}

export async function roomById(db: D1Database, roomId: string): Promise<RoomRow | null> {
  return db.prepare('SELECT * FROM coop_rooms WHERE id = ?').bind(roomId).first<RoomRow>()
}

async function guestsOf(db: D1Database, roomId: string): Promise<CoopGuest[]> {
  const { results } = await db
    .prepare(
      `SELECT i.id           AS invite_id,
              i.status       AS status,
              p.id           AS player_id,
              p.nickname     AS nickname,
              p.display_name AS display_name,
              p.avatar_color AS avatar_color,
              (SELECT COUNT(*) FROM coop_suggestions s
                WHERE s.room_id = i.room_id AND s.guest_id = p.id) AS suggestions
         FROM coop_invites i
         JOIN players p ON p.id = i.guest_id
        WHERE i.room_id = ?
        ORDER BY i.created_at ASC`,
    )
    .bind(roomId)
    .all<{
      invite_id: string
      status: CoopGuest['status']
      player_id: string
      nickname: string
      display_name: string
      avatar_color: string
      suggestions: number
    }>()

  return results.map((r) => ({
    inviteId: r.invite_id,
    playerId: r.player_id,
    nickname: r.nickname,
    displayName: r.display_name || r.nickname,
    avatarColor: r.avatar_color,
    status: r.status,
    suggestions: r.suggestions,
  }))
}

async function suggestionsOf(db: D1Database, roomId: string): Promise<CoopSuggestion[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.guest_id, s.word, s.created_at, s.used_at,
              p.nickname, p.display_name, p.avatar_color
         FROM coop_suggestions s
         JOIN players p ON p.id = s.guest_id
        WHERE s.room_id = ?
        ORDER BY s.created_at DESC
        LIMIT ?`,
    )
    .bind(roomId, SUGGESTION_LIMIT)
    .all<SuggestionRow>()
  return results.map(toSuggestion)
}

/** Vista dell'host: chi ha invitato e cosa gli stanno suggerendo. */
export async function hostRoom(db: D1Database, room: RoomRow): Promise<CoopRoom> {
  const [guests, suggestions] = await Promise.all([
    guestsOf(db, room.id),
    suggestionsOf(db, room.id),
  ])
  return {
    roomId: room.id,
    puzzleNumber: room.puzzle_number,
    maxGuests: MAX_COOP_GUESTS,
    guests,
    suggestions,
  }
}

/** Quanti inviti occupano un posto: i rifiutati liberano lo slot. */
export async function occupiedSlots(db: D1Database, roomId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM coop_invites
        WHERE room_id = ? AND status IN ('pending', 'accepted')`,
    )
    .bind(roomId)
    .first<{ n: number }>()
  return row?.n ?? 0
}

/**
 * Gli altri giocatori, con l'indicazione di chi ha già finito oggi.
 *
 * `playedToday` non e' un divieto: serve alla UI per dire chiaramente che
 * invitare qualcuno che non ha ancora giocato gli svela la parola.
 */
export async function invitablePlayers(
  db: D1Database,
  hostId: string,
  when: Today,
  roomId: string | null,
): Promise<InvitablePlayer[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.nickname, p.display_name, p.avatar_color,
              EXISTS (SELECT 1 FROM wordle_games g
                       WHERE g.player_id = p.id
                         AND g.puzzle_number = ?
                         AND g.slot = 1
                         AND g.status != 'playing')                AS played_today,
              CASE WHEN ?2 IS NULL THEN 0 ELSE EXISTS (
                SELECT 1 FROM coop_invites i
                 WHERE i.room_id = ?2 AND i.guest_id = p.id
                   AND i.status IN ('pending', 'accepted')) END    AS invited
         FROM players p
        WHERE p.id != ?3
        ORDER BY p.last_seen_at DESC
        LIMIT 100`,
    )
    .bind(when.puzzleNumber, roomId, hostId)
    .all<{
      id: string
      nickname: string
      display_name: string
      avatar_color: string
      played_today: number
      invited: number
    }>()

  return results.map((r) => ({
    playerId: r.id,
    nickname: r.nickname,
    displayName: r.display_name || r.nickname,
    avatarColor: r.avatar_color,
    playedToday: r.played_today === 1,
    invited: r.invited === 1,
  }))
}

/** Gli inviti che il giocatore deve ancora accettare o rifiutare. */
export async function pendingInvites(
  db: D1Database,
  guestId: string,
  when: Today,
): Promise<CoopInvite[]> {
  const { results } = await db
    .prepare(
      `SELECT i.id AS invite_id, i.room_id, i.created_at,
              r.puzzle_number,
              p.nickname, p.display_name, p.avatar_color,
              EXISTS (SELECT 1 FROM wordle_games g
                       WHERE g.player_id = ?1
                         AND g.puzzle_number = r.puzzle_number
                         AND g.slot = 1
                         AND g.status != 'playing') AS ho_finito,
              COALESCE((SELECT g.attempts FROM wordle_games g
                         WHERE g.player_id = ?1
                           AND g.puzzle_number = r.puzzle_number
                           AND g.slot = 1), 0) AS miei_tentativi
         FROM coop_invites i
         JOIN coop_rooms r ON r.id = i.room_id
         JOIN players p ON p.id = r.host_id
        WHERE i.guest_id = ?1
          AND i.status = 'pending'
          AND r.closed_at IS NULL
          AND r.puzzle_number = ?2
        ORDER BY i.created_at DESC`,
    )
    .bind(guestId, when.puzzleNumber)
    .all<{
      invite_id: string
      room_id: string
      created_at: string
      puzzle_number: number
      nickname: string
      display_name: string
      avatar_color: string
      ho_finito: number
      miei_tentativi: number
    }>()

  return results.map((r) => ({
    inviteId: r.invite_id,
    roomId: r.room_id,
    puzzleNumber: r.puzzle_number,
    hostName: r.display_name || r.nickname,
    hostAvatarColor: r.avatar_color,
    createdAt: r.created_at,
    wouldSpoil: r.ho_finito !== 1,
    myAttempts: r.ho_finito === 1 ? 0 : r.miei_tentativi,
  }))
}

export interface InviteRow {
  id: string
  room_id: string
  guest_id: string
  status: InviteStatus
}

export async function inviteById(db: D1Database, inviteId: string): Promise<InviteRow | null> {
  return db
    .prepare('SELECT id, room_id, guest_id, status FROM coop_invites WHERE id = ?')
    .bind(inviteId)
    .first<InviteRow>()
}

/** L'invito accettato dal guest per una stanza, se c'e'. */
export async function acceptedInvite(
  db: D1Database,
  roomId: string,
  guestId: string,
): Promise<InviteRow | null> {
  return db
    .prepare(
      `SELECT id, room_id, guest_id, status FROM coop_invites
        WHERE room_id = ? AND guest_id = ? AND status = 'accepted'`,
    )
    .bind(roomId, guestId)
    .first<InviteRow>()
}

/**
 * La giornata del guest diventa questa partita.
 *
 * La parola del giorno e' la stessa per tutti: guardando quella dell'host la
 * conosce, quindi la propria board si chiude — e' la stessa parola, l'ha già
 * fatta. Il suo punteggio sarà quello dell'host (`payAssists`).
 *
 * Il `WHERE status = 'playing'` e' quello che distingue i due casi: chi ha già
 * concluso la propria partita non viene toccato, perché la sua giornata e' già
 * spesa. Puo' guardare e suggerire, ma non prende un secondo punteggio.
 *
 * Restituisce true se la giornata e' stata effettivamente presa in carico qui.
 */
export async function markSpectated(
  db: D1Database,
  guestId: string,
  when: Today,
  answer: string,
  roomId: string,
): Promise<boolean> {
  await openGame(db, guestId, when, answer)
  const esito = await db
    .prepare(
      `UPDATE wordle_games SET spectated = 1, assist_room_id = ?
        WHERE player_id = ? AND puzzle_number = ? AND slot = 1
          AND status = 'playing'
          AND (assist_room_id IS NULL OR assist_room_id = ?)`,
    )
    .bind(roomId, guestId, when.puzzleNumber, roomId)
    .run()
  return esito.meta.changes === 1
}

/** La giornata del giocatore, per capire se e' già spesa e dove. */
export async function participation(
  db: D1Database,
  playerId: string,
  puzzleNumber: number,
): Promise<{ spectated: boolean; roomId: string | null; ownFinished: boolean } | null> {
  const row = await db
    .prepare(
      `SELECT status, spectated, assist_room_id FROM wordle_games
        WHERE player_id = ? AND puzzle_number = ? AND slot = 1`,
    )
    .bind(playerId, puzzleNumber)
    .first<{ status: string; spectated: number; assist_room_id: string | null }>()

  if (!row) return null
  return {
    spectated: row.spectated === 1,
    roomId: row.assist_room_id,
    ownFinished: row.spectated !== 1 && row.status !== 'playing',
  }
}

/** Vista del guest: la board dell'host, con gli stessi colori. */
export async function guestView(
  db: D1Database,
  room: RoomRow,
  hostGame: GameRow,
  viewerId: string,
): Promise<CoopView> {
  const [host, mia] = await Promise.all([
    db
      .prepare('SELECT nickname, display_name, avatar_color FROM players WHERE id = ?')
      .bind(room.host_id)
      .first<{ nickname: string; display_name: string; avatar_color: string }>(),
    db
      .prepare(
        `SELECT spectated, assist_score, assist_room_id FROM wordle_games
          WHERE player_id = ? AND puzzle_number = ? AND slot = 1`,
      )
      .bind(viewerId, room.puzzle_number)
      .first<{ spectated: number; assist_score: number | null; assist_room_id: string | null }>(),
  ])

  const words = parseGuesses(hostGame)

  return {
    roomId: room.id,
    puzzleNumber: room.puzzle_number,
    hostName: host?.display_name || host?.nickname || 'host',
    hostAvatarColor: host?.avatar_color ?? '#007aff',
    wordLength: WORD_LENGTH,
    maxAttempts: MAX_ATTEMPTS,
    guesses: evaluateAll(words, hostGame.answer),
    status: hostGame.status,
    // Stessa regola che vale per l'host: la parola si vede solo alla fine.
    answer: hostGame.status === 'playing' ? null : hostGame.answer,
    suggestions: await suggestionsOf(db, room.id),
    active: room.closed_at === null,
    /*
     * Se la giornata di chi guarda e' questa partita, il suo punteggio e' quello
     * dell'host. Se invece aveva già giocato la propria, e' qui solo per dare
     * una mano: `counts` false, e la UI lo dice invece di far sperare punti che
     * non arriveranno.
     */
    counts: mia?.spectated === 1 && mia.assist_room_id === room.id,
    myScore: mia?.assist_score ?? null,
  }
}

/**
 * Segna come usati i suggerimenti che corrispondono a una parola giocata.
 *
 * Non assegna punti: l'assist e' il punteggio dell'host, non una somma di
 * suggerimenti (vedi `payAssists`). Questo serve solo a far vedere, all'host e
 * a chi lo ha aiutato, quali consigli sono stati seguiti.
 */
export async function markSuggestionUsed(
  db: D1Database,
  roomId: string,
  word: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE coop_suggestions SET used_at = ?
        WHERE room_id = ? AND word = ? AND used_at IS NULL`,
    )
    .bind(nowIso(), roomId, word)
    .run()
}

/**
 * Paga l'assist a chi ha giocato la giornata in questa stanza.
 *
 * Tutti prendono lo stesso punteggio dell'host: una parola indovinata al terzo
 * tentativo da un gruppo di sei vale ottanta punti a testa, esattamente come
 * varrebbe a chi la indovina da solo. E' l'unica cosa che rende accettare un
 * invito una scelta neutra invece di una rinuncia.
 *
 * Il filtro su `assist_score IS NULL` la rende ripetibile senza raddoppiare
 * niente: la rotta del tentativo la chiama a ogni chiusura di partita, e due
 * richieste ravvicinate non devono pagare due volte.
 */
export async function payAssists(
  db: D1Database,
  roomId: string,
  puzzleNumber: number,
  score: number,
  status: 'won' | 'lost',
): Promise<number> {
  const esito = await db
    .prepare(
      `UPDATE wordle_games
          SET assist_score = ?, assist_status = ?
        WHERE puzzle_number = ?
          AND slot = 1
          AND assist_room_id = ?
          AND spectated = 1
          AND assist_score IS NULL`,
    )
    .bind(score, status, puzzleNumber, roomId)
    .run()
  return esito.meta.changes
}
