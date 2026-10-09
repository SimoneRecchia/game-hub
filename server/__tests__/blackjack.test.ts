import { afterEach, describe, expect, it, vi } from 'vitest'
import { SEMI, VALORI, type Carta } from '../../shared/blackjack'
import { PUNTATE_MS } from '../../shared/blackjack-tavolo'
import type {
  FortunaLeaderboard,
  FortunaRisposta,
  GeneraleLeaderboard,
  PanoramicaClassifiche,
  SalaBlackjack,
  VistaTavoloBJ,
} from '../../shared/types'
import { today } from '../lib/wordleStore'
import { banco, type Giocatore } from './banco'

type Banco = ReturnType<typeof banco>

/**
 * Il sabot, deciso dalla prova: ogni carta sono due chiamate a
 * `crypto.getRandomValues`, il valore e il seme, e il server prende il resto
 * della divisione.
 */
function carte(...cc: Carta[]) {
  const coda = cc.flatMap((c) => [VALORI.indexOf(c[0] as (typeof VALORI)[number]), SEMI.indexOf(c[1] as 'c')])
  const prossimo = (a: ArrayBufferView) => {
    ;(a as Uint32Array)[0] = coda.shift() ?? 0
    return a
  }
  vi.spyOn(crypto, 'getRandomValues').mockImplementation(prossimo as typeof crypto.getRandomValues)
}

afterEach(() => {
  vi.restoreAllMocks()
})

/** I punti di oggi: un quiz finito. */
function puntiDiOggi(b: Banco, io: Giocatore, punti: number) {
  const adesso = new Date().toISOString()
  b.db.sqlite
    .prepare(
      `INSERT INTO quiz_partite (id, player_id, puzzle_number, date, status, giuste, score, started_at, updated_at)
       VALUES (?, ?, ?, 'x', 'done', 7, ?, ?, ?)`,
    )
    .run(`q_${io.id}`, io.id, today().puzzleNumber, punti, adesso, adesso)
}

/** La pagina del blackjack aperta: e' la presenza che dice chi c'e'. */
function presente(b: Banco, io: Giocatore, attivita = 'blackjack') {
  b.db.sqlite
    .prepare('INSERT OR REPLACE INTO presenza (player_id, visto_at, attivita) VALUES (?, ?, ?)')
    .run(io.id, new Date().toISOString(), attivita)
}

async function ok<T>(p: Promise<{ status: number; dati: T }>): Promise<T> {
  const r = await p
  expect(r.status, JSON.stringify(r.dati)).toBe(200)
  return r.dati
}

const apri = (b: Banco, io: Giocatore) => ok(b.chiama<VistaTavoloBJ>('POST', '/blackjack/tavoli', io))
const guarda = (b: Banco, io: Giocatore, id: string) =>
  ok(b.chiama<VistaTavoloBJ>('GET', `/blackjack/tavolo/${id}`, io))
const punta = (b: Banco, io: Giocatore, t: VistaTavoloBJ, puntata: number) =>
  b.chiama<VistaTavoloBJ>('POST', `/blackjack/tavolo/${t.id}/punta`, io, { giro: t.giro, puntata })

/** Una mossa sulla mano di turno, come la manda il telefono: con il giro, la mano e quante carte ha. */
function muovi(b: Banco, io: Giocatore, t: VistaTavoloBJ, azione: string) {
  const turno = t.turno!
  const carteInMano = t.posti[turno.posto]!.mani[turno.mano].carte.length
  return b.chiama<VistaTavoloBJ>('POST', `/blackjack/tavolo/${t.id}/mossa`, io, {
    giro: t.giro,
    mano: turno.mano,
    carte: carteInMano,
    azione,
  })
}

/** Fa passare il tempo del tavolo: le scadenze tornano indietro di `ms`, e la prova non aspetta davvero. */
function passaIlTempo(b: Banco, id: string, ms: number) {
  const riga = b.db.sqlite.prepare('SELECT stato FROM bj_tavoli WHERE id = ?').get(id) as { stato: string }
  const stato = JSON.parse(riga.stato)
  if (stato.scadenza !== null) stato.scadenza -= ms
  for (const p of stato.posti) if (p) p.visto -= ms
  b.db.sqlite.prepare('UPDATE bj_tavoli SET stato = ? WHERE id = ?').run(JSON.stringify(stato), id)
}

async function generaleDiOggi(b: Banco, io: Giocatore) {
  return (await b.chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', io)).dati.me
}

describe('il blackjack da soli', () => {
  it('senza i punti delle classificate ci si siede, ma non si punta', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    const t = await apri(b, io)
    expect(t).toMatchObject({ fase: 'puntate', giro: 1, mio: 2, saldo: 0, netto: 0, giri: 0 })
    const r = await punta(b, io, t, 10)
    expect(r.status).toBe(409)
    expect(r.dati).toMatchObject({ code: 'POCHI_PUNTI' })
  })

  it('si punta, le carte arrivano, si gioca; il saldo, la Fortuna e la generale seguono', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 100)
    const t = await apri(b, io)
    carte('9c', '6q', '7f')
    const dato = await ok(punta(b, io, t, 50))
    expect(dato).toMatchObject({ fase: 'gioco', banco: ['6q'], turno: { posto: 2, mano: 0 }, aTempo: false })
    expect(dato.posti[2]).toMatchObject({ puntata: 50, mani: [{ id: 0, carte: ['9c', '7f'], puntata: 50 }] })
    // La puntata si paga quando la si mette.
    expect(dato).toMatchObject({ saldo: 50, netto: -50, giri: 1 })

    carte('Tc', '8p')
    const fine = await ok(muovi(b, io, dato, 'stai'))
    expect(fine).toMatchObject({ fase: 'fine', banco: ['6q', 'Tc', '8p'], turno: null })
    expect(fine.posti[2]).toMatchObject({ delta: 50 })
    expect(fine).toMatchObject({ saldo: 150, netto: 50, giri: 1 })

    const mano = b.db.sqlite.prepare('SELECT puntata, delta, stato, esito FROM bj_mani WHERE player_id = ?').get(io.id)
    expect(mano).toMatchObject({ puntata: 50, delta: 50, stato: 'fatto' })
    expect(JSON.parse((mano as { esito: string }).esito).banco).toEqual(['6q', 'Tc', '8p'])
    expect(await generaleDiOggi(b, io)).toMatchObject({ punti: 150, blackjack: 50, slot: 0, ruota: 0 })
    const fortuna = await ok(b.chiama<FortunaRisposta>('GET', '/fortuna', io))
    expect(fortuna).toMatchObject({
      saldo: 150,
      netti: { blackjack: 50 },
      giocate: { blackjack: 1 },
      blackjack: { mioTavolo: t.id, tavoli: [] },
    })
  })

  it('si punta da dieci a tutto il saldo, e raddoppiare chiede un’altra puntata', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 60)
    const t = await apri(b, io)
    for (const puntata of [5, 61, 12.5, '20', null]) {
      const r = await punta(b, io, t, puntata as number)
      expect(r.status, String(puntata)).toBe(400)
      expect(r.dati).toMatchObject({ code: 'PUNTATA' })
    }
    carte('5c', '6q', '6f')
    const dato = await ok(punta(b, io, t, 40))
    const raddoppio = await muovi(b, io, dato, 'raddoppia')
    expect(raddoppio.status).toBe(409)
    expect(raddoppio.dati).toMatchObject({ code: 'POCHI_PUNTI' })
    expect((await guarda(b, io, t.id)).posti[2]!.mani[0].carte).toHaveLength(2)
  })

  it('un doppio tocco non chiede due carte', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 100)
    const t = await apri(b, io)
    carte('2c', '6q', '3f')
    const dato = await ok(punta(b, io, t, 10))
    carte('4p', 'Kc')
    expect((await muovi(b, io, dato, 'carta')).status).toBe(200)
    const doppio = await muovi(b, io, dato, 'carta')
    expect(doppio.status).toBe(409)
    expect(doppio.dati).toMatchObject({ code: 'MOSSA_VECCHIA' })
    expect((await guarda(b, io, t.id)).posti[2]!.mani[0].carte).toEqual(['2c', '3f', '4p'])
  })

  it('il saldo e’ quello della slot: quel che si perde li’ non si punta qui', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 100)
    // Un giro della slot perso: le fermate di niente.
    const fermate = [3, 2, 2]
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((a: ArrayBufferView) => {
      ;(a as Uint32Array)[0] = fermate.shift() ?? 0
      return a
    }) as typeof crypto.getRandomValues)
    expect((await b.chiama('POST', '/slot/gira', io, { puntata: 10 })).status).toBe(200)
    vi.restoreAllMocks()
    const t = await apri(b, io)
    expect(t.saldo).toBe(90)
    expect((await punta(b, io, t, 91)).dati).toMatchObject({ code: 'PUNTATA' })
    carte('Tc', '6q', '7f', 'Kp')
    const dato = await ok(punta(b, io, t, 90))
    const fine = await ok(muovi(b, io, dato, 'carta'))
    expect(fine).toMatchObject({ saldo: 0, netto: -90 })
    const fortuna = await ok(b.chiama<FortunaRisposta>('GET', '/fortuna', io))
    expect(fortuna).toMatchObject({ saldo: 0, netti: { slot: -10, blackjack: -90, ruota: 0 } })
  })

  it('il saldo si guarda anche nella scrittura: una puntata altrove nel frattempo non lo supera', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 100)
    const t = await apri(b, io)
    // Una puntata persa alla slot fra la lettura del saldo e la scrittura del tavolo.
    const batch = b.db.batch.bind(b.db)
    let una = true
    vi.spyOn(b.db, 'batch').mockImplementation(async (istruzioni) => {
      if (una && istruzioni.some((i) => i.sql.includes('INTO bj_mani'))) {
        una = false
        b.db.sqlite
          .prepare(
            `INSERT INTO fortuna_giornate (player_id, puzzle_number, gioco, netto, giocate)
             VALUES (?, ?, 'slot', -95, 9)`,
          )
          .run(io.id, today().puzzleNumber)
      }
      return batch(istruzioni)
    })
    carte('9c', '6q', '7f')
    const r = await punta(b, io, t, 50)
    expect(r.status).toBe(409)
    expect(r.dati).toMatchObject({ code: 'POCHI_PUNTI' })
    expect(b.db.sqlite.prepare('SELECT COUNT(*) AS n FROM bj_mani').get()).toEqual({ n: 0 })
    expect(await guarda(b, io, t.id)).toMatchObject({ fase: 'puntate', saldo: 5 })
  })
})

describe('l’assicurazione', () => {
  /** La riga del registro di Anna: una per giro. */
  function riga(b: Banco, io: Giocatore) {
    return b.db.sqlite.prepare('SELECT puntata, delta, stato, esito FROM bj_mani WHERE player_id = ?').get(io.id) as {
      puntata: number
      delta: number
      stato: string
      esito: string | null
    }
  }

  it('si paga dal saldo, sta nel registro con la mano, e torna 2 a 1 se il banco fa blackjack', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 100)
    const t = await apri(b, io)
    carte('Tc', 'Aq', '9f')
    const dato = await ok(punta(b, io, t, 50))
    expect(dato.posti[2]).toMatchObject({ puntata: 50, assicurazione: 0 })
    const assicurato = await ok(muovi(b, io, dato, 'assicurazione'))
    // La meta' della puntata, sulla linea: il turno resta, e il saldo scende subito.
    expect(assicurato).toMatchObject({ fase: 'gioco', turno: { posto: 2, mano: 0 }, saldo: 25, netto: -75 })
    expect(assicurato.posti[2]).toMatchObject({ puntata: 50, assicurazione: 25 })
    expect(riga(b, io)).toMatchObject({ puntata: 75, delta: -75, stato: 'gioco' })

    carte('Kp')
    const fine = await ok(muovi(b, io, assicurato, 'stai'))
    // Il blackjack del banco si prende la mano, 50, e l'assicurazione ne paga 50.
    expect(fine).toMatchObject({ fase: 'fine', banco: ['Aq', 'Kp'], saldo: 100, netto: 0 })
    expect(fine.posti[2]).toMatchObject({ delta: 0, assicurazione: 25 })
    expect(riga(b, io)).toMatchObject({ puntata: 75, delta: 0, stato: 'fatto' })
    expect(JSON.parse(riga(b, io).esito!)).toMatchObject({ banco: ['Aq', 'Kp'], assicurazione: 25 })
    const giornata = b.db.sqlite
      .prepare("SELECT netto, giocate FROM fortuna_giornate WHERE player_id = ? AND gioco = 'blackjack'")
      .get(io.id)
    expect(giornata).toEqual({ netto: 0, giocate: 1 })
  })

  it('si perde se il banco non fa blackjack, e la mano si paga da sola', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 100)
    const t = await apri(b, io)
    carte('Tc', 'Aq', '9f')
    const assicurato = await ok(muovi(b, io, await ok(punta(b, io, t, 50)), 'assicurazione'))
    carte('6p')
    const fine = await ok(muovi(b, io, assicurato, 'stai'))
    // 19 contro 17: la mano vince 50, l'assicurazione ne perde 25.
    expect(fine.posti[2]).toMatchObject({ delta: 25 })
    expect(fine).toMatchObject({ saldo: 125, netto: 25 })
    expect(await generaleDiOggi(b, io)).toMatchObject({ punti: 125, blackjack: 25 })
  })

  it('un doppio tocco non assicura due volte', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 100)
    const t = await apri(b, io)
    carte('9c', 'Aq', '7f')
    const dato = await ok(punta(b, io, t, 50))
    expect((await muovi(b, io, dato, 'assicurazione')).status).toBe(200)
    const doppio = await muovi(b, io, dato, 'assicurazione')
    expect(doppio.status).toBe(409)
    expect(doppio.dati).toMatchObject({ code: 'GIA_ASSICURATO' })
    expect(riga(b, io)).toMatchObject({ puntata: 75, delta: -75 })
    expect(await guarda(b, io, t.id)).toMatchObject({ saldo: 25 })
  })

  it('contro un dieci non c’e’, e dopo la prima mossa nemmeno', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 100)
    const t = await apri(b, io)
    carte('9c', 'Kq', '7f')
    const r = await muovi(b, io, await ok(punta(b, io, t, 20)), 'assicurazione')
    expect(r.status).toBe(400)
    expect(r.dati).toMatchObject({ code: 'MOSSA' })
    expect(riga(b, io)).toMatchObject({ puntata: 20 })
  })

  it('chiede il saldo, anche nella scrittura: una puntata altrove nel frattempo non lo supera', async () => {
    const b = banco()
    const io = await b.giocatore('anna')
    puntiDiOggi(b, io, 100)
    const t = await apri(b, io)
    carte('9c', 'Aq', '7f')
    const dato = await ok(punta(b, io, t, 50))
    // Fra la lettura del saldo, 50, e la scrittura del tavolo, se ne perdono 30 alla slot.
    const batch = b.db.batch.bind(b.db)
    let una = true
    vi.spyOn(b.db, 'batch').mockImplementation(async (istruzioni) => {
      if (una && istruzioni.some((i) => i.sql.includes('UPDATE bj_mani SET puntata'))) {
        una = false
        b.db.sqlite
          .prepare(
            `INSERT INTO fortuna_giornate (player_id, puzzle_number, gioco, netto, giocate)
             VALUES (?, ?, 'slot', -30, 3)`,
          )
          .run(io.id, today().puzzleNumber)
      }
      return batch(istruzioni)
    })
    const r = await muovi(b, io, dato, 'assicurazione')
    expect(r.status).toBe(409)
    expect(r.dati).toMatchObject({ code: 'POCHI_PUNTI' })
    expect(riga(b, io)).toMatchObject({ puntata: 50, delta: -50 })
    const dopo = await guarda(b, io, t.id)
    expect(dopo).toMatchObject({ saldo: 20 })
    expect(dopo.posti[2]).toMatchObject({ assicurazione: 0 })
  })
})

describe('il blackjack in compagnia', () => {
  /** Anna apre un tavolo, Bruno la vede dalla sala e si siede. */
  async function inDue() {
    const b = banco()
    const anna = await b.giocatore('anna')
    const bruno = await b.giocatore('bruno')
    puntiDiOggi(b, anna, 100)
    puntiDiOggi(b, bruno, 100)
    const t = await apri(b, anna)
    presente(b, anna)
    presente(b, bruno)
    return { b, anna, bruno, t }
  }

  it('la sala mostra il tavolo degli amici che ci sono, e ci si siede', async () => {
    const { b, anna, bruno, t } = await inDue()
    const sala = await ok(b.chiama<SalaBlackjack>('GET', '/blackjack', bruno))
    expect(sala).toMatchObject({ mioTavolo: null, saldo: 100 })
    expect(sala.tavoli).toEqual([{ id: t.id, giocatori: [expect.objectContaining({ nickname: 'anna' })], liberi: 4 }])

    const seduto = await ok(b.chiama<VistaTavoloBJ>('POST', `/blackjack/tavolo/${t.id}/siedi`, bruno))
    expect(seduto.mio).toBe(1)
    expect(seduto.posti.map((p) => p?.giocatore.nickname ?? null)).toEqual([null, 'bruno', 'anna', null, null])
    expect((await ok(b.chiama<SalaBlackjack>('GET', '/blackjack', bruno))).mioTavolo).toBe(t.id)
    // Chi non ha la pagina aperta non ha un tavolo in sala.
    presente(b, anna, 'hub')
    presente(b, bruno, 'hub')
    const carla = await b.giocatore('carla')
    expect((await ok(b.chiama<SalaBlackjack>('GET', '/blackjack', carla))).tavoli).toEqual([])
  })

  it('la prima puntata apre il tempo degli altri, e quando hanno puntato tutti si distribuisce', async () => {
    const { b, anna, bruno, t } = await inDue()
    await ok(b.chiama('POST', `/blackjack/tavolo/${t.id}/siedi`, bruno))
    const attesa = await ok(punta(b, anna, t, 20))
    expect(attesa).toMatchObject({ fase: 'puntate', aTempo: true })
    expect(attesa.scadenzaMs).toBeGreaterThan(PUNTATE_MS - 2_000)
    // Bruno sta a sinistra: la prima carta e' la sua.
    carte('2c', '3c', '4c', '5c', '6c')
    const dato = await ok(punta(b, bruno, attesa, 30))
    expect(dato).toMatchObject({ fase: 'gioco', banco: ['4c'], turno: { posto: 1, mano: 0 }, aTempo: true })
    expect(dato.posti[1]!.mani[0].carte).toEqual(['2c', '5c'])
    expect(dato.posti[2]!.mani[0].carte).toEqual(['3c', '6c'])
    // Non tocca ad Anna.
    const presto = await muovi(b, anna, { ...dato, turno: { posto: 2, mano: 0 } }, 'carta')
    expect(presto.dati).toMatchObject({ code: 'NON_TOCCA' })
  })

  it('chi non decide in tempo sta, e lo fa scadere chi guarda', async () => {
    const { b, anna, bruno, t } = await inDue()
    await ok(b.chiama('POST', `/blackjack/tavolo/${t.id}/siedi`, bruno))
    await ok(punta(b, anna, t, 20))
    carte('9c', 'Tc', '6q', '7f', '8f')
    const dato = await ok(punta(b, bruno, { ...t, giro: 1 }, 20))
    expect(dato.turno).toEqual({ posto: 1, mano: 0 })
    passaIlTempo(b, t.id, dato.scadenzaMs! + 1)
    const dopo = await guarda(b, anna, t.id)
    expect(dopo.turno).toEqual({ posto: 2, mano: 0 })
    expect(dopo.posti[1]!.mani[0]).toMatchObject({ carte: ['9c', '7f'], ferma: true })
  })

  it('chi va in un’altra schermata lascia il posto alla prima lettura, senza aspettare', async () => {
    const { b, anna, bruno, t } = await inDue()
    await ok(b.chiama('POST', `/blackjack/tavolo/${t.id}/siedi`, bruno))
    // Bruno torna alla Fortuna: la presenza lo dice subito, con l'ora di adesso.
    b.db.sqlite
      .prepare("UPDATE presenza SET attivita = 'fortuna', visto_at = ? WHERE player_id = ?")
      .run(new Date(Date.now() + 1_000).toISOString(), bruno.id)
    const vista = await guarda(b, anna, t.id)
    expect(vista.posti.map((p) => p?.giocatore.nickname ?? null)).toEqual([null, null, 'anna', null, null])
    expect((await ok(b.chiama<SalaBlackjack>('GET', '/blackjack', bruno))).mioTavolo).toBeNull()
  })

  it('alzarsi durante le puntate restituisce la puntata', async () => {
    const { b, anna, bruno, t } = await inDue()
    await ok(b.chiama('POST', `/blackjack/tavolo/${t.id}/siedi`, bruno))
    expect((await ok(punta(b, anna, t, 30))).saldo).toBe(70)
    await ok(b.chiama('POST', `/blackjack/tavolo/${t.id}/lascia`, anna))
    const sala = await ok(b.chiama<SalaBlackjack>('GET', '/blackjack', anna))
    expect(sala).toMatchObject({ mioTavolo: null, saldo: 100, netto: 0, giri: 0 })
    expect(b.db.sqlite.prepare('SELECT COUNT(*) AS n FROM bj_mani').get()).toEqual({ n: 0 })
    const vista = await guarda(b, bruno, t.id)
    expect(vista.posti.map((p) => p?.giocatore.nickname ?? null)).toEqual([null, 'bruno', null, null, null])
  })

  it('un tavolo alla volta: aprirne un altro lascia il primo, che vuoto se ne va', async () => {
    const b = banco()
    const anna = await b.giocatore('anna')
    const primo = await apri(b, anna)
    const secondo = await apri(b, anna)
    expect(secondo.id).not.toBe(primo.id)
    expect((await b.chiama('GET', `/blackjack/tavolo/${primo.id}`, anna)).status).toBe(404)
    expect((await ok(b.chiama<SalaBlackjack>('GET', '/blackjack', anna))).mioTavolo).toBe(secondo.id)
  })

  it('due posti insieme no: la scrittura che ne aprirebbe un secondo non lascia niente', async () => {
    const { b, bruno, t } = await inDue()
    const batch = b.db.batch.bind(b.db)
    vi.spyOn(b.db, 'batch').mockImplementation(async (istruzioni) => {
      if (istruzioni.some((i) => i.sql.includes('INSERT INTO bj_seduti'))) {
        b.db.sqlite
          .prepare("INSERT OR IGNORE INTO bj_seduti (player_id, tavolo, created_at) VALUES (?, 'altrove', 'x')")
          .run(bruno.id)
      }
      return batch(istruzioni)
    })
    const r = await b.chiama('POST', `/blackjack/tavolo/${t.id}/siedi`, bruno)
    expect(r.status).toBe(409)
    expect(r.dati).toMatchObject({ code: 'ALTRO_TAVOLO' })
    vi.restoreAllMocks()
    const vista = await guarda(b, bruno, t.id)
    expect(vista.posti.filter(Boolean)).toHaveLength(1)
  })

  it('l’ultimo che se ne va a giro in corso chiude il giro, e il tavolo se ne va', async () => {
    const b = banco()
    const anna = await b.giocatore('anna')
    puntiDiOggi(b, anna, 100)
    const t = await apri(b, anna)
    carte('9c', '5q', '7f', 'Tp', '8p')
    await ok(punta(b, anna, t, 10))
    await ok(b.chiama('POST', `/blackjack/tavolo/${t.id}/lascia`, anna))
    // La mano e' stata pagata: il banco ha sballato.
    expect(b.db.sqlite.prepare('SELECT delta, stato FROM bj_mani').get()).toEqual({ delta: 10, stato: 'fatto' })
    expect(b.db.sqlite.prepare('SELECT COUNT(*) AS n FROM bj_tavoli').get()).toEqual({ n: 0 })
    expect(b.db.sqlite.prepare('SELECT COUNT(*) AS n FROM bj_seduti').get()).toEqual({ n: 0 })
  })

  it('i tavoli fermi da un giorno si cancellano quando se ne apre uno', async () => {
    const b = banco()
    const anna = await b.giocatore('anna')
    const bruno = await b.giocatore('bruno')
    const vecchio = await apri(b, anna)
    b.db.sqlite
      .prepare('UPDATE bj_tavoli SET updated_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 25 * 60 * 60_000).toISOString(), vecchio.id)
    await apri(b, bruno)
    expect(b.db.sqlite.prepare('SELECT COUNT(*) AS n FROM bj_tavoli').get()).toEqual({ n: 1 })
    expect((await ok(b.chiama<SalaBlackjack>('GET', '/blackjack', anna))).mioTavolo).toBeNull()
  })
})

describe('la classifica della Fortuna', () => {
  it('mette in fila quel che i giochi d’azzardo hanno dato o tolto, e la generale li conta', async () => {
    const b = banco()
    const anna = await b.giocatore('anna')
    const bruno = await b.giocatore('bruno')
    const carla = await b.giocatore('carla')
    puntiDiOggi(b, anna, 100)
    puntiDiOggi(b, bruno, 100)
    puntiDiOggi(b, carla, 100)
    // Anna vince 40 al blackjack: il banco sballa.
    const ta = await apri(b, anna)
    carte('9c', '6q', '7f', 'Tc', '8p')
    await ok(muovi(b, anna, await ok(punta(b, anna, ta, 40)), 'stai'))
    // Bruno perde 20: sballa lui.
    const tb = await apri(b, bruno)
    carte('Tc', '6q', '7f', 'Kp')
    await ok(muovi(b, bruno, await ok(punta(b, bruno, tb, 20)), 'carta'))
    // Carla non gioca alla Fortuna: non c'e'.
    const classifica = await ok(b.chiama<FortunaLeaderboard>('GET', '/leaderboard/fortuna?scope=today', bruno))
    expect(classifica.rows.map((r) => [r.nickname, r.punti, r.giocate])).toEqual([
      ['anna', 40, 1],
      ['bruno', -20, 1],
    ])
    expect(classifica.rows[0].netti).toEqual({ ruota: 0, slot: 0, blackjack: 40, roulette: 0, superenalotto: 0 })
    expect(classifica.me).toMatchObject({ rank: 2, punti: -20 })
    const generale = await ok(b.chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', carla))
    expect(generale.rows.map((r) => [r.nickname, r.punti, r.blackjack])).toEqual([
      ['anna', 140, 40],
      ['carla', 100, 0],
      ['bruno', 80, -20],
    ])
    const panoramica = await ok(b.chiama<PanoramicaClassifiche>('GET', '/leaderboard/panoramica?scope=today', carla))
    expect(panoramica.classifiche.fortuna).toMatchObject({ giocatori: 2, me: null })
    expect(panoramica.classifiche.fortuna.primi.map((r) => r.punti)).toEqual([40, -20])
  })
})
