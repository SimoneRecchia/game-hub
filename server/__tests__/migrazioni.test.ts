import { describe, expect, it } from 'vitest'
import { MAX_ATTEMPTS } from '../../shared/config'
import { scoreFor, speedBonus, streakBonus, type ScoreInput } from '../../shared/scoring'
import { ProvaD1, applica, migrazioni } from './banco'

/**
 * La scala delle cinque parole divisa a meta', com'era fra la migrazione 0013 e
 * la 0014: il codice non la conosce piu', e qui serve a verificare che la 0013
 * facesse esattamente quel che diceva.
 */
function scalaCinqueParole(input: ScoreInput, slot: number): number {
  const i = Math.min(Math.max(slot, 1), 5) - 1
  if (input.status === 'playing') return 0
  if (input.status === 'lost') return [10, 4, 2, 2, 2][i]
  const usati = Math.min(Math.max(input.attempts, 1), MAX_ATTEMPTS)
  const punti = [25, 10, 7, 4, 4][i] + [5, 2, 1, 1, 1][i] * (MAX_ATTEMPTS - usati)
  return slot === 1 ? punti + speedBonus(input.durationMs) + streakBonus(input.streak) : punti
}

function giocatore(db: ProvaD1, id: string) {
  const adesso = new Date().toISOString()
  db.sqlite
    .prepare(
      `INSERT INTO players (id, nickname, nickname_lower, display_name, password_hash,
         password_salt, password_iterations, avatar_color, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, 'x', 'x', 1, '#000', ?, ?)`,
    )
    .run(id, id, id, id, adesso, adesso)
}

describe('le migrazioni', () => {
  it('si applicano tutte, in ordine, su un database vuoto', () => {
    const db = new ProvaD1()
    const tabelle = db.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => r.name)
    for (const t of [
      'wordle_libere',
      'cruciverba_schemi_liberi',
      'cruciverba_partite_libere',
      'scarabeo_computer',
      'scarabeo_partite_libere',
      'battaglia_partite',
      'battaglia_link',
      'quiz_giornate',
      'quiz_partite',
      'quiz_dati',
    ]) {
      expect(tabelle).toContain(t)
    }
    expect(migrazioni().length).toBeGreaterThanOrEqual(15)
  })
})

describe('la scala del Wordle divisa a meta’', () => {
  it('ricalcola ogni punteggio salvato come lo calcola shared/scoring.ts', () => {
    const db = new ProvaD1('0013')
    const adesso = new Date().toISOString()
    db.sqlite
      .prepare(
        `INSERT INTO players (id, nickname, nickname_lower, display_name, password_hash,
           password_salt, password_iterations, avatar_color, created_at, last_seen_at)
         VALUES ('pl_a', 'a', 'a', 'a', 'x', 'x', 1, '#000', ?, ?)`,
      )
      .run(adesso, adesso)

    // Tutte le combinazioni: posizione, esito, tentativi, durata, serie.
    const casi: { slot: number; status: 'won' | 'lost'; attempts: number; durata: number | null; serie: number }[] = []
    let n = 0
    for (let slot = 1; slot <= 5; slot += 1) {
      for (let attempts = 1; attempts <= MAX_ATTEMPTS; attempts += 1) {
        for (const durata of [null, 0, 30_000, 45_000, 200_000, 382_500, 400_000, 720_000, 900_000]) {
          for (const serie of [0, 1, 2, 3, 7]) {
            casi.push({ slot, status: 'won', attempts, durata, serie })
          }
        }
      }
      casi.push({ slot, status: 'lost', attempts: 6, durata: 100_000, serie: 0 })
    }
    const inserisci = db.sqlite.prepare(
      `INSERT INTO wordle_games (id, player_id, puzzle_number, slot, date, answer, status, attempts,
         guesses, started_at, duration_ms, score, streak_at_end)
       VALUES (?, 'pl_a', ?, ?, '2026-09-01', 'carta', ?, ?, '[]', ?, ?, 999, ?)`,
    )
    for (const c of casi) {
      n += 1
      inserisci.run(`g${n}`, 1000 + n, c.slot, c.status, c.attempts, adesso, c.durata, c.serie)
    }

    applica(db, '0013_punti_bilanciati.sql')

    const righe = db.sqlite.prepare('SELECT id, score FROM wordle_games ORDER BY puzzle_number').all()
    righe.forEach((r, i) => {
      const c = casi[i]
      const atteso = scalaCinqueParole(
        { status: c.status, attempts: c.attempts, durationMs: c.durata, streak: c.serie },
        c.slot,
      )
      expect(r.score, JSON.stringify(c)).toBe(atteso)
    })
  })

  it('l’assist ricopia il punteggio nuovo dell’host', () => {
    const db = new ProvaD1('0013')
    const adesso = new Date().toISOString()
    for (const id of ['pl_h', 'pl_g']) {
      db.sqlite
        .prepare(
          `INSERT INTO players (id, nickname, nickname_lower, display_name, password_hash,
             password_salt, password_iterations, avatar_color, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, 'x', 'x', 1, '#000', ?, ?)`,
        )
        .run(id, id, id, id, adesso, adesso)
    }
    db.sqlite
      .prepare("INSERT INTO coop_rooms (id, host_id, puzzle_number, created_at) VALUES ('room_1', 'pl_h', 7, ?)")
      .run(adesso)
    db.sqlite
      .prepare(
        `INSERT INTO wordle_games (id, player_id, puzzle_number, slot, date, answer, status, attempts,
           guesses, started_at, duration_ms, score, streak_at_end)
         VALUES ('gh', 'pl_h', 7, 1, '2026-09-04', 'carta', 'won', 3, '[]', ?, 600000, 89, 2)`,
      )
      .run(adesso)
    db.sqlite
      .prepare(
        `INSERT INTO wordle_games (id, player_id, puzzle_number, slot, date, answer, status, attempts,
           guesses, started_at, score, spectated, assist_score, assist_room_id, assist_status)
         VALUES ('gg', 'pl_g', 7, 1, '2026-09-04', 'carta', 'playing', 0, '[]', ?, 0, 1, 89, 'room_1', 'won')`,
      )
      .run(adesso)

    applica(db, '0013_punti_bilanciati.sql')

    const host = db.sqlite.prepare("SELECT score FROM wordle_games WHERE id = 'gh'").get()
    const ospite = db.sqlite.prepare("SELECT score, assist_score FROM wordle_games WHERE id = 'gg'").get()
    // 40 per il terzo tentativo, 0 di velocità a dieci minuti, 2 di serie.
    expect(host?.score).toBe(42)
    expect(ospite?.assist_score).toBe(42)
    expect(ospite?.score).toBe(0)
  })
})

describe('una parola sola al giorno', () => {
  it('ricalcola la parola del giorno come shared/scoring.ts e archivia le altre', () => {
    const db = new ProvaD1('0014')
    giocatore(db, 'pl_a')
    const adesso = new Date().toISOString()
    const casi: { slot: number; status: 'won' | 'lost'; attempts: number; durata: number | null; serie: number }[] = []
    for (let attempts = 1; attempts <= MAX_ATTEMPTS; attempts += 1) {
      for (const durata of [null, 0, 30_000, 45_000, 200_000, 382_500, 400_000, 720_000, 900_000]) {
        for (const serie of [0, 1, 2, 3, 7]) casi.push({ slot: 1, status: 'won', attempts, durata, serie })
      }
    }
    casi.push({ slot: 1, status: 'lost', attempts: 6, durata: 100_000, serie: 0 })
    // Qualche parola in piu', della stessa giornata di una principale.
    const extra = [2, 3, 4, 5].map((slot) => ({ slot, status: 'won' as const, attempts: 3, durata: null, serie: 0 }))

    const inserisci = db.sqlite.prepare(
      `INSERT INTO wordle_games (id, player_id, puzzle_number, slot, date, answer, status, attempts,
         guesses, started_at, duration_ms, score, streak_at_end)
       VALUES (?, 'pl_a', ?, ?, '2026-09-01', 'carta', ?, ?, '[]', ?, ?, 7, ?)`,
    )
    casi.forEach((c, n) => inserisci.run(`g${n}`, 1000 + n, 1, c.status, c.attempts, adesso, c.durata, c.serie))
    extra.forEach((c, n) => inserisci.run(`x${n}`, 1000, c.slot, c.status, c.attempts, adesso, c.durata, c.serie))

    applica(db, '0014_parola_unica.sql')

    const righe = db.sqlite.prepare('SELECT slot, score FROM wordle_games ORDER BY puzzle_number').all()
    expect(righe).toHaveLength(casi.length)
    righe.forEach((r, i) => {
      const c = casi[i]
      expect(r.slot).toBe(1)
      expect(r.score, JSON.stringify(c)).toBe(
        scoreFor({ status: c.status, attempts: c.attempts, durationMs: c.durata, streak: c.serie }),
      )
    })
    // Le parole in piu' non spariscono: stanno in archivio, intere.
    const archivio = db.sqlite.prepare('SELECT id, slot, score FROM wordle_parole_extra ORDER BY slot').all()
    expect(archivio.map((r) => r.slot)).toEqual([2, 3, 4, 5])
    expect(archivio.every((r) => r.score === 7)).toBe(true)
  })

  it('l’assist ricopia il punteggio nuovo dell’host', () => {
    const db = new ProvaD1('0014')
    giocatore(db, 'pl_h')
    giocatore(db, 'pl_g')
    const adesso = new Date().toISOString()
    db.sqlite
      .prepare("INSERT INTO coop_rooms (id, host_id, puzzle_number, created_at) VALUES ('room_1', 'pl_h', 7, ?)")
      .run(adesso)
    db.sqlite
      .prepare(
        `INSERT INTO wordle_games (id, player_id, puzzle_number, slot, date, answer, status, attempts,
           guesses, started_at, duration_ms, score, streak_at_end)
         VALUES ('gh', 'pl_h', 7, 1, '2026-09-04', 'carta', 'won', 3, '[]', ?, 600000, 42, 2)`,
      )
      .run(adesso)
    db.sqlite
      .prepare(
        `INSERT INTO wordle_games (id, player_id, puzzle_number, slot, date, answer, status, attempts,
           guesses, started_at, score, spectated, assist_score, assist_room_id, assist_status)
         VALUES ('gg', 'pl_g', 7, 1, '2026-09-04', 'carta', 'playing', 0, '[]', ?, 0, 1, 42, 'room_1', 'won')`,
      )
      .run(adesso)

    applica(db, '0014_parola_unica.sql')

    const host = db.sqlite.prepare("SELECT score FROM wordle_games WHERE id = 'gh'").get()
    const ospite = db.sqlite.prepare("SELECT score, assist_score FROM wordle_games WHERE id = 'gg'").get()
    // 80 per il terzo tentativo, 0 di velocità a dieci minuti, 2 di serie.
    expect(host?.score).toBe(82)
    expect(ospite?.assist_score).toBe(82)
    expect(ospite?.score).toBe(0)
  })
})
