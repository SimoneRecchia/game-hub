import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../shared/daily'
import { NOTE_VUOTE, VUOTA, generaSchema } from '../../shared/sudoku'
import type { GeneraleLeaderboard, OggiRisposta, SudokuEsito, SudokuLeaderboard, SudokuState } from '../../shared/types'
import { ordinaSudoku, type TotaliSudoku } from '../lib/sudokuStore'
import { today } from '../lib/wordleStore'
import { banco } from './banco'

const SCHEMA = generaSchema('media', mulberry32(9))!

function preparaBanco(conSchema = true) {
  const b = banco()
  if (conSchema) {
    b.db.sqlite
      .prepare(
        `INSERT INTO sudoku_schemi (puzzle_number, livello, dati, soluzione, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(today().puzzleNumber, SCHEMA.livello, SCHEMA.dati, SCHEMA.soluzione, new Date().toISOString())
  }
  return b
}

/** La griglia con le prime `quante` caselle vuote riempite dalla soluzione, e l'ultima sbagliata se si vuole. */
function scrivi(quante: number, sbagliaUltima = false): string {
  const celle = [...SCHEMA.dati]
  let fatte = 0
  for (let k = 0; k < 81 && fatte < quante; k += 1) {
    if (celle[k] !== VUOTA) continue
    fatte += 1
    celle[k] = sbagliaUltima && fatte === quante ? String((Number(SCHEMA.soluzione[k]) % 9) + 1) : SCHEMA.soluzione[k]
  }
  return celle.join('')
}

describe('la classifica del sudoku', () => {
  const g = (nickname: string, punti: number, giornate: number, tempoMs: number): TotaliSudoku => ({
    playerId: nickname,
    nickname,
    displayName: nickname,
    avatarColor: '#000',
    punti,
    giornate,
    tempoMs,
    inCorso: giornate === 0,
  })

  it('punti prima, poi il tempo piu’ corto, e chi non ha finito in fondo', () => {
    const righe = ordinaSudoku([g('lento', 100, 1, 900_000), g('aperto', 0, 0, 0), g('rapido', 100, 1, 300_000), g('aiutato', 94, 1, 60_000)])
    expect(righe.map((r) => r.nickname)).toEqual(['rapido', 'lento', 'aiutato', 'aperto'])
  })
})

describe('il sudoku del giorno, dalle API', () => {
  it('senza lo schema di oggi dice che non e’ pronto', async () => {
    const { chiama, giocatore } = preparaBanco(false)
    const io = await giocatore('anna')
    const r = await chiama('GET', '/sudoku/state', io)
    expect(r.status).toBe(503)
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.sudoku.status).toBe('assente')
  })

  it('la home non apre la partita; lo stato sì, senza la soluzione', async () => {
    const { chiama, giocatore, db } = preparaBanco()
    const io = await giocatore('bruno')
    const oggi = (await chiama<OggiRisposta>('GET', '/oggi', io)).dati.sudoku
    expect(oggi).toMatchObject({ status: 'new', livello: 'media', scritte: 0 })
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM sudoku_games').get()?.n).toBe(0)

    const stato = (await chiama<SudokuState>('GET', '/sudoku/state', io)).dati
    expect(stato).toMatchObject({ dati: SCHEMA.dati, cifre: SCHEMA.dati, note: NOTE_VUOTE, status: 'playing', punti: 100 })
    expect(stato.soluzione).toBeNull()
  })

  it('salva, rifiuta una griglia che cambia le date e una versione vecchia', async () => {
    const { chiama, giocatore } = preparaBanco()
    const io = await giocatore('carla')
    const stato = (await chiama<SudokuState>('GET', '/sudoku/state', io)).dati
    const salvata = await chiama<SudokuEsito>('PUT', '/sudoku/cifre', io, { cifre: scrivi(5), note: NOTE_VUOTE, versione: 0 })
    expect(salvata.status).toBe(200)
    expect(salvata.dati).toMatchObject({ versione: 1, status: 'playing', pienaConErrori: false })

    const primaData = [...SCHEMA.dati].findIndex((d) => d !== VUOTA)
    const toccaLeDate = [...scrivi(5)]
    toccaLeDate[primaData] = String((Number(SCHEMA.dati[primaData]) % 9) + 1)
    expect((await chiama('PUT', '/sudoku/cifre', io, { cifre: toccaLeDate.join(''), versione: 1 })).status).toBe(400)
    expect((await chiama('PUT', '/sudoku/cifre', io, { cifre: scrivi(6), versione: stato.versione })).status).toBe(409)
  })

  it('il controllo fa pagare gli errori nuovi, lo svelare tre punti, e la griglia giusta chiude', async () => {
    const { chiama, giocatore } = preparaBanco()
    const io = await giocatore('dario')
    await chiama('GET', '/sudoku/state', io)

    const controllo = await chiama<SudokuEsito>('POST', '/sudoku/controlla', io, { cifre: scrivi(4, true), versione: 0 })
    expect(controllo.dati.errate).toHaveLength(1)
    expect(controllo.dati.punti).toBe(99)
    // Lo stesso errore ricontrollato non costa.
    const di_nuovo = await chiama<SudokuEsito>('POST', '/sudoku/controlla', io, { cifre: scrivi(4, true), versione: 1 })
    expect(di_nuovo.dati.punti).toBe(99)

    const vuota = [...SCHEMA.dati].findIndex((d, k) => d === VUOTA && k > 40)
    const svelata = await chiama<SudokuEsito>('POST', '/sudoku/svela', io, {
      cifre: scrivi(4, true),
      versione: 2,
      caselle: [vuota],
    })
    expect(svelata.dati.rivelate).toEqual({ [vuota]: SCHEMA.soluzione[vuota] })
    expect(svelata.dati.punti).toBe(96)
    // Una data non si svela.
    const data = [...SCHEMA.dati].findIndex((d) => d !== VUOTA)
    expect((await chiama('POST', '/sudoku/svela', io, { cifre: scrivi(4), versione: 3, caselle: [data] })).status).toBe(400)

    const finita = await chiama<SudokuEsito>('PUT', '/sudoku/cifre', io, { cifre: SCHEMA.soluzione, versione: 3 })
    expect(finita.dati).toMatchObject({ status: 'done', punti: 96 })
    expect(finita.dati.stato?.soluzione).toBe(SCHEMA.soluzione)

    const classifica = (await chiama<SudokuLeaderboard>('GET', '/leaderboard/sudoku?scope=today', io)).dati
    expect(classifica.me).toMatchObject({ rank: 1, punti: 96, giornate: 1 })
    const generale = (await chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', io)).dati
    expect(generale.me?.perGioco.sudoku).toBe(96)
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.sudoku).toMatchObject({ status: 'done', punti: 96 })
  })

  it('una griglia piena ma sbagliata non chiude, e lo dice', async () => {
    const { chiama, giocatore } = preparaBanco()
    const io = await giocatore('elena')
    await chiama('GET', '/sudoku/state', io)
    const k = [...SCHEMA.dati].findIndex((d) => d === VUOTA)
    const piena = [...SCHEMA.soluzione]
    piena[k] = String((Number(piena[k]) % 9) + 1)
    const esito = await chiama<SudokuEsito>('PUT', '/sudoku/cifre', io, { cifre: piena.join(''), versione: 0 })
    expect(esito.dati).toMatchObject({ status: 'playing', pienaConErrori: true })
  })
})
