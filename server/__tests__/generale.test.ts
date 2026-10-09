import { describe, expect, it } from 'vitest'
import type { GeneraleLeaderboard, OggiRisposta } from '../../shared/types'
import { ordinaGenerale, puntiClassificateDi, type TotaliGenerale } from '../lib/generale'
import { today } from '../lib/wordleStore'
import { banco } from './banco'

function totali(nickname: string, perGioco: Partial<TotaliGenerale['perGioco']>, assist = 0, partite = 1): TotaliGenerale {
  return {
    playerId: nickname,
    nickname,
    displayName: nickname,
    avatarColor: '#000',
    perGioco: {
      wordle: 0,
      scarabeo: 0,
      cruciverba: 0,
      sudoku: 0,
      quiz: 0,
      nomi: 0,
      anagrammi: 0,
      sequenze: 0,
      ghigliottina: 0,
      paroliere: 0,
      catena: 0,
      ...perGioco,
    },
    battaglia: 0,
    tris: 0,
    ruota: 0,
    slot: 0,
    blackjack: 0,
    roulette: 0,
    superenalotto: 0,
    assist,
    partite,
  }
}

describe('l’ordine della classifica generale', () => {
  it('somma tutti i giochi', () => {
    const [riga] = ordinaGenerale([totali('a', { wordle: 80, scarabeo: 70, cruciverba: 95, quiz: 76 })])
    expect(riga.punti).toBe(321)
  })

  it('e la battaglia dei giorni in cui aveva la sua classificata', () => {
    const [riga] = ordinaGenerale([{ ...totali('a', { wordle: 80 }), battaglia: 84 }])
    expect(riga.punti).toBe(164)
  })

  it('e quel che hanno dato o tolto i giochi della Fortuna', () => {
    const [riga] = ordinaGenerale([
      { ...totali('a', { wordle: 80, quiz: 76 }), ruota: -40, slot: 25, blackjack: -11, roulette: 7 },
    ])
    expect(riga.punti).toBe(80 + 76 - 40 + 25 - 11 + 7)
  })

  it('a pari punti passa avanti chi ha meno punti assist, poi chi ha giocato meno partite', () => {
    const righe = ordinaGenerale([
      totali('aiutata', { wordle: 100 }, 40, 2),
      totali('sola', { wordle: 60, cruciverba: 40 }, 0, 3),
      totali('efficiente', { wordle: 60, cruciverba: 40 }, 0, 2),
    ])
    expect(righe.map((r) => r.nickname)).toEqual(['efficiente', 'sola', 'aiutata'])
  })
})

describe('la classifica generale e la schermata di oggi, dalle API', () => {
  it('mette insieme le classificate di tutti i giochi', async () => {
    const { chiama, giocatore, db } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const n = today().puzzleNumber
    const adesso = new Date().toISOString()
    const sql = (q: string, ...p: unknown[]) => db.sqlite.prepare(q).run(...p)

    // Anna: Wordle 45 + 20, Scarabeo 70, cruciverba 97 (finito), quiz 76, tris 38, anagrammi 47, sequenze 33,
    // Ghigliottina 16, Paroliere 52, Catena 8, i 44 di Nomi, cose e città di ieri, contati stanotte, che valgono oggi, e una
    // battaglia classificata da 84, di quando c'era.
    sql(`INSERT INTO wordle_games (id, player_id, puzzle_number, slot, date, answer, status, attempts, guesses, started_at, score)
         VALUES ('w1', ?, ?, 1, 'x', 'carta', 'won', 2, '[]', ?, 45)`, anna.id, n, adesso)
    sql(`INSERT INTO wordle_games (id, player_id, puzzle_number, slot, date, answer, status, attempts, guesses, started_at, score)
         VALUES ('w2', ?, ?, 2, 'x', 'carta', 'won', 1, '[]', ?, 20)`, anna.id, n, adesso)
    sql(`INSERT INTO scarabeo_games (id, player_id, puzzle_number, date, status, mosse, turns, score, punti, started_at)
         VALUES ('s1', ?, ?, 'x', 'done', '[]', 10, 180, 70, ?)`, anna.id, n, adesso)
    sql(`INSERT INTO cruciverba_games (id, player_id, puzzle_number, date, status, lettere, score, started_at, updated_at)
         VALUES ('c1', ?, ?, 'x', 'done', 'x', 97, ?, ?)`, anna.id, n, adesso, adesso)
    sql(`INSERT INTO battaglia_partite (id, modalita, giocatore_a, giocatore_b, puzzle_number, stato, colpi, punti, vincitore, created_at, updated_at)
         VALUES ('b1', 'classificata', ?, NULL, ?, 'finita', '[]', 84, 'a', ?, ?)`, anna.id, n, adesso, adesso)
    sql(`INSERT INTO quiz_partite (id, player_id, puzzle_number, date, status, giuste, score, started_at, updated_at)
         VALUES ('q1', ?, ?, 'x', 'done', 7, 76, ?, ?)`, anna.id, n, adesso, adesso)
    sql(`INSERT INTO tris_partite
           (id, player_id, puzzle_number, date, status, vinte, patte, score, started_at, updated_at)
         VALUES ('t1', ?, ?, 'x', 'done', 2, 3, 38, ?, ?)`, anna.id, n, adesso, adesso)
    sql(`INSERT INTO anagrammi_partite
           (id, player_id, puzzle_number, date, status, trovate, tempo_ms, score, started_at, updated_at)
         VALUES ('a1', ?, ?, 'x', 'done', 4, 90000, 47, ?, ?)`, anna.id, n, adesso, adesso)
    sql(`INSERT INTO sequenze_partite
           (id, player_id, puzzle_number, date, status, giuste, migliore, tempo_ms, score, started_at, updated_at)
         VALUES ('q2', ?, ?, 'x', 'done', 18, 8, 120000, 33, ?, ?)`, anna.id, n, adesso, adesso)
    sql(`INSERT INTO ghigliottina_partite
           (id, player_id, puzzle_number, date, status, scelte, sbagliate, indovinata, score, started_at, updated_at)
         VALUES ('h1', ?, ?, 'x', 'done', '[0,1,0,1,0]', 2, 1, 16, ?, ?)`, anna.id, n, adesso, adesso)
    sql(`INSERT INTO paroliere_partite
           (id, player_id, puzzle_number, date, status, iniziata_at, punteggio, trovate, score, updated_at)
         VALUES ('p1', ?, ?, 'x', 'done', ?, 33, 25, 52, ?)`, anna.id, n, adesso, adesso)
    sql(`INSERT INTO catena_partite
           (id, player_id, puzzle_number, date, status, mosse, indovinata, score, started_at, updated_at)
         VALUES ('k1', ?, ?, 'x', 'done', '[]', 1, 8, ?, ?)`, anna.id, n, adesso, adesso)
    sql(`INSERT INTO nomi_partite (id, player_id, puzzle_number, date, status, iniziata_at, tempo_ms, score, valide,
           updated_at)
         VALUES ('n1', ?, ?, 'x', 'done', ?, 60000, 44, 4, ?)`, anna.id, n - 1, adesso, adesso)
    // La partita di oggi conta domani: ancora niente.
    sql(`INSERT INTO nomi_partite (id, player_id, puzzle_number, date, status, iniziata_at, updated_at)
         VALUES ('n2', ?, ?, 'x', 'done', ?, ?)`, anna.id, n, adesso, adesso)
    // Bruno: solo un cruciverba ancora aperto, che vale zero.
    sql(`INSERT INTO cruciverba_games (id, player_id, puzzle_number, date, status, lettere, score, started_at, updated_at)
         VALUES ('c2', ?, ?, 'x', 'playing', 'x', 0, ?, ?)`, bruno.id, n, adesso, adesso)

    const g = (await chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', anna)).dati
    expect(g.rows.map((r) => [r.nickname, r.punti])).toEqual([
      ['anna', 45 + 20 + 70 + 97 + 84 + 76 + 38 + 47 + 33 + 16 + 52 + 8 + 44],
      ['bruno', 0],
    ])
    expect(g.me?.perGioco).toEqual({
      wordle: 65,
      scarabeo: 70,
      cruciverba: 97,
      sudoku: 0,
      quiz: 76,
      nomi: 44,
      anagrammi: 47,
      sequenze: 33,
      ghigliottina: 16,
      paroliere: 52,
      catena: 8,
    })
    expect(g.me?.battaglia).toBe(84)
    // Il tris, dei giorni in cui aveva la sua classificata, sta a parte come la battaglia.
    expect(g.me?.tris).toBe(38)
    expect(g.me?.partite).toBe(12)
    // La Fortuna legge i punti di oggi di un giocatore solo: devono essere quelli della generale.
    expect(await puntiClassificateDi(db as unknown as D1Database, anna.id, n)).toBe(
      g.me!.punti - g.me!.ruota - g.me!.slot - g.me!.blackjack - g.me!.roulette - g.me!.superenalotto,
    )
    expect(await puntiClassificateDi(db as unknown as D1Database, bruno.id, n)).toBe(0)

    const oggi = (await chiama<OggiRisposta>('GET', '/oggi', bruno)).dati
    // Il podio di oggi e' di chi ha fatto punti: Bruno, a zero, non ci sale.
    expect(oggi.generale).toEqual({
      posizione: 2,
      punti: 0,
      giocatori: 2,
      podio: [
        {
          playerId: anna.id,
          nickname: 'anna',
          displayName: 'anna',
          avatarColor: expect.any(String),
          punti: 45 + 20 + 70 + 97 + 84 + 76 + 38 + 47 + 33 + 16 + 52 + 8 + 44,
        },
      ],
    })
    expect(oggi.cruciverba.status).toBe('assente')
    expect(oggi.wordle.status).toBe('new')
    // La battaglia non e' piu' una classificata: la schermata di oggi non la nomina.
    expect('battaglia' in oggi).toBe(false)
    expect(oggi.quiz.status).toBe('assente')
  })

  it('regge più giocatori dei cento parametri che D1 accetta in un’istruzione', async () => {
    const { chiama, giocatore, db } = banco()
    const n = today().puzzleNumber
    const adesso = new Date().toISOString()
    const tutti = []
    for (let i = 0; i < 120; i += 1) {
      const g = await giocatore(`g${i}`)
      tutti.push(g)
      db.sqlite
        .prepare(
          `INSERT INTO quiz_partite (id, player_id, puzzle_number, date, status, giuste, score, started_at, updated_at)
           VALUES (?, ?, ?, 'x', 'done', 5, 60, ?, ?)`,
        )
        .run(`q${i}`, g.id, n, adesso, adesso)
    }
    const r = await chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', tutti[0])
    expect(r.status).toBe(200)
    expect(r.dati.rows).toHaveLength(120)
  })

  it('la schermata di oggi non apre nessuna partita', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('carla')
    const conta = () =>
      ['wordle_games', 'scarabeo_games', 'cruciverba_games', 'battaglia_partite', 'scarabeo_computer', 'quiz_partite'].map(
        (t) => db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()?.n,
      )
    const prima = conta()
    const r = await chiama<OggiRisposta>('GET', '/oggi', io)
    expect(r.status).toBe(200)
    expect(r.dati.puzzleNumber).toBe(today().puzzleNumber)
    expect(conta()).toEqual(prima)
  })
})
