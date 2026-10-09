import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { istanteItaliano } from '../../shared/daily'
import { jackpotDi, liquida, momentiDi, montepremiDi } from '../../shared/superenalotto'
import type { FortunaLeaderboard, FortunaRisposta, GeneraleLeaderboard, VistaEnalotto } from '../../shared/types'
import { today } from '../lib/wordleStore'
import { banco, type Giocatore } from './banco'

type Banco = ReturnType<typeof banco>

const LUNEDI = '2026-10-12'
const MERCOLEDI = '2026-10-14'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(istanteItaliano(LUNEDI, 10))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** I numeri della prossima estrazione: il server pesca dall'urna, e la prova dice quale posto prendere ogni volta. */
function estratti(...posti: number[]) {
  const coda = [...posti]
  vi.spyOn(crypto, 'getRandomValues').mockImplementation(((a: ArrayBufferView) => {
    ;(a as Uint32Array)[0] = coda.shift() ?? 0
    return a
  }) as typeof crypto.getRandomValues)
}

function puntiDiOggi(b: Banco, io: Giocatore, punti: number) {
  const adesso = new Date().toISOString()
  b.db.sqlite
    .prepare(
      `INSERT INTO quiz_partite (id, player_id, puzzle_number, date, status, giuste, score, started_at, updated_at)
       VALUES (?, ?, ?, 'x', 'done', 7, ?, ?, ?)`,
    )
    .run(`q_${io.id}_${today().puzzleNumber}`, io.id, today().puzzleNumber, punti, adesso, adesso)
}

async function ok<T>(p: Promise<{ status: number; dati: T }>): Promise<T> {
  const r = await p
  expect(r.status, JSON.stringify(r.dati)).toBe(200)
  return r.dati
}

const guarda = (b: Banco, io: Giocatore) => ok(b.chiama<VistaEnalotto>('GET', '/superenalotto', io))
const gioca = (b: Banco, io: Giocatore, schede: unknown) =>
  b.chiama<VistaEnalotto>('POST', '/superenalotto/schede', io, { schede })

describe('il SuperEnalotto', () => {
  it('si gioca con i punti di oggi: dieci la scheda da quattro, venti il 4+1, al piu’ cinque schede', async () => {
    const b = banco()
    const anna = await b.giocatore('anna')
    const povero = await gioca(b, anna, [[1, 2, 3, 4]])
    expect(povero.status).toBe(409)
    expect(povero.dati).toMatchObject({ code: 'POCHI_PUNTI' })

    puntiDiOggi(b, anna, 100)
    const v = await ok(gioca(b, anna, [[4, 3, 2, 1], [90, 6, 7, 8, 9]]))
    expect(v.aperto).toMatchObject({ data: LUNEDI, schede: 2 })
    expect(v.aperto!.mie.map((s) => s.numeri)).toEqual([[1, 2, 3, 4], [6, 7, 8, 9, 90]])
    expect(v.saldo).toBe(70)
    expect(v.netto).toBe(-30)

    const troppe = await gioca(b, anna, [[1, 2, 3, 5], [1, 2, 3, 6], [1, 2, 3, 7], [1, 2, 3, 8]])
    expect(troppe.dati).toMatchObject({ code: 'TROPPE_SCHEDE' })
    for (const sbagliata of [[1, 2, 3, 3], [1, 2, 3, 91], [1, 2, 3, 4, 5, 6]]) {
      expect((await gioca(b, anna, [sbagliata])).dati).toMatchObject({ code: 'SCHEDA' })
    }
    await ok(gioca(b, anna, [[9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]))
    expect((await gioca(b, anna, [[1, 2, 3, 9]])).dati).toMatchObject({ code: 'TROPPE_SCHEDE' })
    expect((await guarda(b, anna)).saldo).toBe(40)
  })

  it('il saldo deve coprire quel che costa la giocata', async () => {
    const b = banco()
    const bruno = await b.giocatore('bruno')
    puntiDiOggi(b, bruno, 15)
    expect((await gioca(b, bruno, [[1, 2, 3, 4, 5]])).dati).toMatchObject({ code: 'POCHI_PUNTI' })
    expect((await gioca(b, bruno, [[1, 2, 3, 4], [5, 6, 7, 8]])).dati).toMatchObject({ code: 'POCHI_PUNTI' })
    expect((await ok(gioca(b, bruno, [[1, 2, 3, 4]]))).saldo).toBe(5)
  })

  it('alle 21 si chiude, alle 21:05 si vedono i numeri, finita la diretta si pagano i premi', async () => {
    const b = banco()
    const anna = await b.giocatore('anna')
    const bruno = await b.giocatore('bruno')
    puntiDiOggi(b, anna, 50)
    puntiDiOggi(b, bruno, 50)
    // Il jackpot arrivato dal concorso di prima: mille punti.
    b.db.sqlite
      .prepare(
        `INSERT INTO enalotto_concorsi (data, numero, estratti, raccolta, riporto, premi, jackpot, pagato_at, created_at)
         VALUES ('2026-10-09', 1, '[1,2,3,4]', 0, 0, '[]', 100000, 'x', 'x')`,
      )
      .run()
    expect((await guarda(b, anna)).aperto!.jackpot).toBe(1000)
    // Anna fa 4 con la prima e niente con la seconda; Bruno fa 2 con una e 3 con l'altra, un 4+1.
    await ok(gioca(b, anna, [[3, 7, 12, 18], [1, 2, 4, 5]]))
    await ok(gioca(b, bruno, [[3, 7, 1, 2], [3, 7, 12, 20, 21]]))

    vi.setSystemTime(istanteItaliano(LUNEDI, 21, 1))
    // Dall'urna di novanta: il 3 al terzo posto, poi il 7, il 12 e il 18 fra quelli rimasti.
    estratti(2, 5, 9, 14)
    let v = await guarda(b, anna)
    expect(v.aperto).toBeNull()
    expect(v.ultimo).toMatchObject({ data: LUNEDI, estratti: null, premi: null, schede: 4 })
    expect((await gioca(b, anna, [[1, 2, 3, 4]])).dati).toMatchObject({ code: 'CHIUSO' })

    vi.setSystemTime(istanteItaliano(LUNEDI, 21, 5) + 20_000)
    v = await guarda(b, anna)
    expect(v.ultimo!.estratti).toEqual([3, 7, 12, 18])
    expect(v.ultimo!.premi).toBeNull()
    expect(v.ultimo!.mie.every((s) => s.presi === null)).toBe(true)

    vi.setSystemTime(momentiDi(LUNEDI).fine + 1)
    v = await guarda(b, anna)
    const premi = v.ultimo!.premi!
    // La raccolta e' in punti: tre schede da dieci e un 4+1 da venti.
    expect(premi).toEqual(liquida(50, 100_000, { 4: 1, 3: 1, 2: 1 }).premi)
    // Il jackpot arrivato e la parte del 4 della raccolta.
    const jackpot = Math.floor((100_000 + Math.floor((montepremiDi(50) * 19) / 100)) / 100)
    expect(premi[0].premio).toBe(jackpot)
    expect(v.ultimo!.jackpot).toBe(jackpot)
    expect(v.ultimo!.mie.map((s) => [s.presi, s.vincita])).toEqual([
      [4, jackpot],
      [0, 0],
    ])
    expect(v.aperto).toMatchObject({ data: MERCOLEDI, schede: 0 })
    expect(v.aperto!.jackpot).toBe(jackpotDi(0, 0) + v.ultimo!.prossimoJackpot!)

    // I premi vanno nel saldo del lunedi', e nella Fortuna e nella generale del giorno.
    const vinto = premi[0].premio
    expect(v.netto).toBe(vinto - 20)
    expect(v.saldo).toBe(50 - 20 + vinto)
    const f = await ok(b.chiama<FortunaRisposta>('GET', '/fortuna', anna))
    expect(f.netti.superenalotto).toBe(vinto - 20)
    expect(f.saldo).toBe(50 - 20 + vinto)
    expect(f.superenalotto).toMatchObject({ aperto: MERCOLEDI, mie: 0, diretta: null })
    const g = await ok(b.chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', anna))
    expect(g.me).toMatchObject({ superenalotto: vinto - 20 })
    const cf = await ok(b.chiama<FortunaLeaderboard>('GET', '/leaderboard/fortuna?scope=today', bruno))
    const b3 = premi[1].premio
    const b2 = premi[2].premio
    expect(cf.me).toMatchObject({ netti: { superenalotto: b3 + b2 - 30 } })

    // Una seconda lettura non paga di nuovo.
    expect((await guarda(b, anna)).netto).toBe(vinto - 20)
  })

  it('se nessuno fa 4 il jackpot passa al concorso dopo, anche se nessuno ha guardato la diretta', async () => {
    const b = banco()
    const anna = await b.giocatore('anna')
    puntiDiOggi(b, anna, 50)
    await ok(gioca(b, anna, [[1, 2, 3, 4], [5, 6, 8, 9], [10, 11, 13, 14]]))
    // Martedi' mattina: il concorso di lunedi' lo estrae e lo paga la prima richiesta.
    vi.setSystemTime(istanteItaliano('2026-10-13', 9))
    estratti(19, 18, 17, 16)
    const v = await guarda(b, anna)
    expect(v.ultimo!.estratti).toEqual([20, 19, 18, 17])
    expect(v.ultimo!.premi!.every((p) => p.vincitori === 0)).toBe(true)
    // Il montepremi intero, il 60% di tre schede da dieci, passa avanti.
    expect(v.ultimo!.prossimoJackpot).toBe(18)
    expect(v.aperto!.data).toBe(MERCOLEDI)
    const riga = b.db.sqlite.prepare('SELECT jackpot FROM enalotto_concorsi WHERE data = ?').get(LUNEDI) as {
      jackpot: number
    }
    expect(riga.jackpot).toBe(1800)
  })

  it('le schede si tengono una settimana dopo l’estrazione, e i conti delle giornate restano', async () => {
    const b = banco()
    const anna = await b.giocatore('anna')
    puntiDiOggi(b, anna, 50)
    await ok(gioca(b, anna, [[1, 2, 3, 4]]))
    const lunedi = today().puzzleNumber
    // Il lunedi' si estrae e si paga; il lunedi' dopo Anna gioca di nuovo.
    vi.setSystemTime(momentiDi(LUNEDI).fine + 1)
    estratti(80, 80, 80, 80)
    await guarda(b, anna)
    vi.setSystemTime(istanteItaliano('2026-10-19', 10))
    puntiDiOggi(b, anna, 50)
    await ok(gioca(b, anna, [[5, 6, 7, 8]]))
    const schede = (data: string) =>
      (b.db.sqlite.prepare('SELECT COUNT(*) AS n FROM enalotto_schede WHERE concorso = ?').get(data) as { n: number }).n
    // Il mercoledi' dopo, nove giorni dalla prima estrazione: pagando, le schede del primo lunedi' se ne vanno.
    vi.setSystemTime(momentiDi('2026-10-21').fine + 1)
    estratti(70, 70, 70, 70, 60, 60, 60, 60)
    await guarda(b, anna)
    expect(schede(LUNEDI)).toBe(0)
    expect(schede('2026-10-19')).toBe(1)
    const conto = b.db.sqlite
      .prepare("SELECT netto FROM fortuna_giornate WHERE player_id = ? AND puzzle_number = ? AND gioco = 'superenalotto'")
      .get(anna.id, lunedi) as { netto: number }
    expect(conto.netto).toBe(-10)
    // I concorsi restano tutti, con i numeri e i premi: i due lunedi', il venerdi' in mezzo e il mercoledi'.
    expect(b.db.sqlite.prepare('SELECT COUNT(*) AS n FROM enalotto_concorsi').get()).toEqual({ n: 4 })
  })
})
