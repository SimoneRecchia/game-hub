import { afterEach, describe, expect, it, vi } from 'vitest'
import { LANCIO_MS, PUNTATE_RL_MS } from '../../shared/roulette-tavolo'
import type {
  FortunaLeaderboard,
  FortunaRisposta,
  GeneraleLeaderboard,
  SalaRoulette,
  VistaTavoloRL,
} from '../../shared/types'
import { today } from '../lib/wordleStore'
import { banco, type Giocatore } from './banco'

type Banco = ReturnType<typeof banco>

/** Il numero dei prossimi lanci, deciso dalla prova: il server prende il resto della divisione per 37. */
function numeri(...nn: number[]) {
  const coda = [...nn]
  vi.spyOn(crypto, 'getRandomValues').mockImplementation(((a: ArrayBufferView) => {
    ;(a as Uint32Array)[0] = coda.shift() ?? 0
    return a
  }) as typeof crypto.getRandomValues)
}

afterEach(() => {
  vi.restoreAllMocks()
})

function puntiDiOggi(b: Banco, io: Giocatore, punti: number) {
  const adesso = new Date().toISOString()
  b.db.sqlite
    .prepare(
      `INSERT INTO quiz_partite (id, player_id, puzzle_number, date, status, giuste, score, started_at, updated_at)
       VALUES (?, ?, ?, 'x', 'done', 7, ?, ?, ?)`,
    )
    .run(`q_${io.id}`, io.id, today().puzzleNumber, punti, adesso, adesso)
}

function presente(b: Banco, io: Giocatore, attivita = 'roulette') {
  b.db.sqlite
    .prepare('INSERT OR REPLACE INTO presenza (player_id, visto_at, attivita) VALUES (?, ?, ?)')
    .run(io.id, new Date().toISOString(), attivita)
}

async function ok<T>(p: Promise<{ status: number; dati: T }>): Promise<T> {
  const r = await p
  expect(r.status, JSON.stringify(r.dati)).toBe(200)
  return r.dati
}

const apri = (b: Banco, io: Giocatore) => ok(b.chiama<VistaTavoloRL>('POST', '/roulette/tavoli', io))
const guarda = (b: Banco, io: Giocatore, id: string) =>
  ok(b.chiama<VistaTavoloRL>('GET', `/roulette/tavolo/${id}`, io))
const punta = (b: Banco, io: Giocatore, id: string, giro: number, puntate: Record<string, number>) =>
  b.chiama<VistaTavoloRL>('POST', `/roulette/tavolo/${id}/punta`, io, { giro, puntate })

/** Fa passare il tempo del tavolo: le scadenze e il lancio tornano indietro di `ms`. */
function passaIlTempo(b: Banco, id: string, ms: number) {
  const riga = b.db.sqlite.prepare('SELECT stato FROM rl_tavoli WHERE id = ?').get(id) as { stato: string }
  const stato = JSON.parse(riga.stato)
  if (stato.scadenza !== null) stato.scadenza -= ms
  if (stato.lancio) stato.lancio.quando -= ms
  for (const p of stato.posti) if (p) p.visto -= ms
  b.db.sqlite.prepare('UPDATE rl_tavoli SET stato = ? WHERE id = ?').run(JSON.stringify(stato), id)
}

describe('la roulette da soli', () => {
  it('senza i punti delle classificate ci si siede, ma non si punta', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    const t = await apri(b, io)
    expect(t).toMatchObject({ fase: 'puntate', giro: 1, mio: 0, saldo: 0, lancio: null, storia: [] })
    const r = await punta(b, io, t.id, 1, { rosso: 1 })
    expect(r.status).toBe(409)
    expect(r.dati).toMatchObject({ code: 'POCHI_PUNTI' })
  })

  it('si punta e la biglia parte subito; il giro si paga al lancio, e il saldo, la Fortuna e la generale seguono', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 100)
    const t = await apri(b, io)
    numeri(17)
    // Pieno sul 17, cavallo 17-20, rosso, e la prima dozzina.
    const dato = await ok(punta(b, io, t.id, 1, { '17': 2, '17-20': 3, rosso: 10, dozzina1: 5 }))
    expect(dato).toMatchObject({ fase: 'giro', giro: 1, lancio: { numero: 17 }, storia: [17] })
    // Il 17 e' nero e della seconda dozzina: vincono il pieno (36 volte) e il cavallo (18).
    expect(dato.posti[0]).toMatchObject({ delta: 72 + 54 - 20 })
    expect(dato).toMatchObject({ saldo: 206, netto: 106, giri: 1 })
    const giro = b.db.sqlite.prepare('SELECT puntata, delta, numero, stato FROM rl_giocate WHERE player_id = ?').get(io.id)
    expect(giro).toEqual({ puntata: 20, delta: 106, numero: 17, stato: 'fatto' })
    const generale = (await ok(b.chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', io))).me
    expect(generale).toMatchObject({ punti: 206, roulette: 106, blackjack: 0 })
    const fortuna = await ok(b.chiama<FortunaRisposta>('GET', '/fortuna', io))
    expect(fortuna).toMatchObject({
      saldo: 206,
      netti: { roulette: 106 },
      giocate: { roulette: 1 },
      roulette: { mioTavolo: t.id, tavoli: [] },
    })
  })

  it('lo zero fa perdere anche le chances semplici', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 100)
    const t = await apri(b, io)
    numeri(0)
    const dato = await ok(punta(b, io, t.id, 1, { rosso: 10, nero: 10, pari: 10, '0-1-2-3': 4 }))
    expect(dato.posti[0]!.delta).toBe(4 * 9 - 34)
  })

  it('si punta fino a tutto il saldo, non oltre, e il panno accetta solo le sue puntate', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 30)
    const t = await apri(b, io)
    expect((await punta(b, io, t.id, 1, { rosso: 20, nero: 11 })).dati).toMatchObject({ code: 'POCHI_PUNTI' })
    const sbagliate: Record<string, number>[] = [{ '1-5': 1 }, { '37': 1 }, { rosso: 0 }, { rosso: 1.5 }, { rosso: -1 }]
    for (const sbagliata of sbagliate) {
      const r = await punta(b, io, t.id, 1, sbagliata)
      expect(r.status, JSON.stringify(sbagliata)).toBe(400)
      expect(r.dati).toMatchObject({ code: 'PUNTATA' })
    }
    // Tutto il saldo: esce il 5, rosso, e il rosso torna doppio.
    numeri(5)
    expect(await ok(punta(b, io, t.id, 1, { rosso: 20, nero: 10 }))).toMatchObject({ saldo: 40 })
  })

  it('a biglia ferma si punta sul giro dopo; mentre gira no', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 100)
    const t = await apri(b, io)
    numeri(1, 2)
    await ok(punta(b, io, t.id, 1, { rosso: 5 }))
    const presto = await punta(b, io, t.id, 2, { rosso: 5 })
    expect(presto.dati).toMatchObject({ code: 'NON_ORA' })
    passaIlTempo(b, t.id, LANCIO_MS)
    const dopo = await ok(punta(b, io, t.id, 2, { nero: 5 }))
    expect(dopo).toMatchObject({ giro: 2, fase: 'giro', lancio: { numero: 2 }, storia: [2, 1] })
    // Un doppio tocco sul giro di prima non punta di nuovo.
    expect((await punta(b, io, t.id, 2, { nero: 5 })).dati).toMatchObject({ code: 'NON_ORA' })
    expect(b.db.sqlite.prepare('SELECT COUNT(*) AS n FROM rl_giocate').get()).toEqual({ n: 2 })
  })

  it('il saldo si guarda anche nella scrittura: una puntata altrove nel frattempo non lo supera', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 100)
    const t = await apri(b, io)
    const batch = b.db.batch.bind(b.db)
    let una = true
    vi.spyOn(b.db, 'batch').mockImplementation(async (istruzioni) => {
      if (una && istruzioni.some((i) => i.sql.includes('INTO rl_giocate'))) {
        una = false
        b.db.sqlite
          .prepare(
            `INSERT INTO fortuna_giornate (player_id, puzzle_number, gioco, netto, giocate)
             VALUES (?, ?, 'blackjack', -95, 3)`,
          )
          .run(io.id, today().puzzleNumber)
      }
      return batch(istruzioni)
    })
    numeri(3)
    const r = await punta(b, io, t.id, 1, { rosso: 50 })
    expect(r.dati).toMatchObject({ code: 'POCHI_PUNTI' })
    expect(b.db.sqlite.prepare('SELECT COUNT(*) AS n FROM rl_giocate').get()).toEqual({ n: 0 })
    expect(await guarda(b, io, t.id)).toMatchObject({ fase: 'puntate', saldo: 5 })
  })
})

describe('la roulette in compagnia', () => {
  async function inDue() {
    const b = banco()
    const anna = await b.giocatore('anna')
    const bruno = await b.giocatore('bruno')
    puntiDiOggi(b, anna, 100)
    puntiDiOggi(b, bruno, 100)
    const t = await apri(b, anna)
    presente(b, anna)
    presente(b, bruno)
    await ok(b.chiama('POST', `/roulette/tavolo/${t.id}/siedi`, bruno))
    return { b, anna, bruno, t }
  }

  it('la sala mostra il tavolo degli amici che ci sono', async () => {
    const b = banco()
    const anna = await b.giocatore('anna')
    const bruno = await b.giocatore('bruno')
    const t = await apri(b, anna)
    presente(b, anna)
    const sala = await ok(b.chiama<SalaRoulette>('GET', '/roulette', bruno))
    expect(sala.tavoli).toEqual([{ id: t.id, giocatori: [expect.objectContaining({ nickname: 'anna' })], liberi: 5 }])
    const seduto = await ok(b.chiama<VistaTavoloRL>('POST', `/roulette/tavolo/${t.id}/siedi`, bruno))
    expect(seduto.mio).toBe(1)
  })

  it('la prima puntata apre il tempo degli altri; si cambia mandandola di nuovo, e quando hanno puntato tutti parte', async () => {
    const { b, anna, bruno, t } = await inDue()
    const attesa = await ok(punta(b, anna, t.id, 1, { rosso: 20 }))
    expect(attesa.fase).toBe('puntate')
    expect(attesa.scadenzaMs).toBeGreaterThan(PUNTATE_RL_MS - 2_000)
    expect(attesa).toMatchObject({ saldo: 80 })
    // Anna cambia idea: vale l'ultima, e il saldo conta solo la differenza.
    const cambiata = await ok(punta(b, anna, t.id, 1, { nero: 30, '0': 70 }))
    expect(cambiata).toMatchObject({ fase: 'puntate', saldo: 0 })
    expect(cambiata.posti[0]!.puntate).toEqual({ nero: 30, '0': 70 })
    numeri(0)
    const lancio = await ok(punta(b, bruno, t.id, 1, { rosso: 10 }))
    expect(lancio).toMatchObject({ fase: 'giro', lancio: { numero: 0 } })
    expect(lancio.posti[0]!.delta).toBe(70 * 35 - 30)
    expect(lancio.posti[1]!.delta).toBe(-10)
  })

  it('a tempo finito parte con chi ha puntato, e chi guarda la fa partire', async () => {
    const { b, anna, bruno, t } = await inDue()
    await ok(punta(b, anna, t.id, 1, { pari: 10 }))
    passaIlTempo(b, t.id, PUNTATE_RL_MS + 1)
    numeri(8)
    const vista = await guarda(b, bruno, t.id)
    expect(vista).toMatchObject({ fase: 'giro', lancio: { numero: 8 } })
    expect(vista.lancio!.faMs).toBeGreaterThanOrEqual(0)
    expect(vista.posti[0]!.delta).toBe(10)
    expect(vista.posti[1]!.delta).toBeNull()
  })

  it('alzarsi durante le puntate le restituisce, e un tavolo vuoto se ne va', async () => {
    const { b, anna, bruno, t } = await inDue()
    await ok(punta(b, anna, t.id, 1, { pari: 10 }))
    await ok(b.chiama('POST', `/roulette/tavolo/${t.id}/lascia`, anna))
    expect(b.db.sqlite.prepare('SELECT COUNT(*) AS n FROM rl_giocate').get()).toEqual({ n: 0 })
    expect((await ok(b.chiama<SalaRoulette>('GET', '/roulette', anna))).saldo).toBe(100)
    await ok(b.chiama('POST', `/roulette/tavolo/${t.id}/lascia`, bruno))
    expect(b.db.sqlite.prepare('SELECT COUNT(*) AS n FROM rl_tavoli').get()).toEqual({ n: 0 })
  })

  it('la classifica della Fortuna conta la roulette', async () => {
    const { b, anna, bruno, t } = await inDue()
    numeri(36)
    await ok(punta(b, anna, t.id, 1, { '36': 1 }))
    await ok(punta(b, bruno, t.id, 1, { manque: 4 }))
    const classifica = await ok(b.chiama<FortunaLeaderboard>('GET', '/leaderboard/fortuna?scope=today', bruno))
    expect(classifica.rows.map((r) => [r.nickname, r.punti, r.netti.roulette])).toEqual([
      ['anna', 35, 35],
      ['bruno', -4, -4],
    ])
  })
})
