import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Dawg } from '../../shared/dawg'
import { leggioDa, sacchettoDaSeme, sacchettoDelGiorno, tabelloneVuoto } from '../../shared/scarabeo'
import { mosseLegali } from '../../shared/scarabeo-motore'
import { MOSSE_A_TESTA, statoLibera, turnoDelComputer, type PartitaLibera } from '../../shared/scarabeo-computer'
import { RIFERIMENTO_SCARABEO, puntiScarabeo } from '../../shared/punti'
import type { ScarabeoState, ScarabeoSummary, StatisticheScarabeoLibero } from '../../shared/types'
import { giornata } from '../lib/scarabeoStore'
import { banco } from './banco'

const dawg = Dawg.da(readFileSync(join(__dirname, '..', '..', 'public', 'scarabeo', 'dizionario.dawg')))

describe('lo Scarabeo classificato, contro il riferimento del computer', () => {
  it('senza la partita del computer usa il ripiego, e lo fissa per tutta la giornata', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('anna')
    const riepilogo = await chiama<ScarabeoSummary>('GET', '/scarabeo/summary', io)
    expect(riepilogo.dati.computer).toBe(RIFERIMENTO_SCARABEO)
    // Il riepilogo e' di sola lettura: non scrive il ripiego.
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM scarabeo_computer').get()?.n).toBe(0)

    const stato = await chiama<ScarabeoState>('GET', '/scarabeo/state', io)
    expect(stato.dati.computer).toEqual({ punti: RIFERIMENTO_SCARABEO, mosse: null })
    expect(stato.dati.puntiClassifica).toBe(0)
    expect(db.sqlite.prepare('SELECT punti FROM scarabeo_computer').get()?.punti).toBe(RIFERIMENTO_SCARABEO)
  })

  it('una mossa scrive i punti in classifica in rapporto al computer, e il computer si vede alla fine', async () => {
    const { chiama, giocatore, db } = banco()
    const numero = giornata().puzzleNumber
    db.sqlite
      .prepare(`INSERT INTO scarabeo_computer (puzzle_number, punti, mosse, created_at) VALUES (?, 200, ?, 'x')`)
      .run(numero, JSON.stringify([{ tipo: 'passo' }]))

    // Una prima mossa legale con le tessere del giorno: il server la controlla sul dizionario vero.
    const { leggio } = leggioDa(sacchettoDelGiorno(numero), [])
    const mossa = mosseLegali(dawg, tabelloneVuoto(), leggio, true).sort((a, b) => b.punti - a.punti)[0]

    const io = await giocatore('bruno')
    const dopo = await chiama<ScarabeoState>('POST', '/scarabeo/mossa', io, { posa: mossa.posa })
    expect(dopo.status).toBe(200)
    expect(dopo.dati.punti).toBe(mossa.punti)
    expect(dopo.dati.puntiClassifica).toBe(puntiScarabeo(mossa.punti, 200))
    expect(dopo.dati.computer.mosse).toBeNull()

    const chiusa = await chiama<ScarabeoState>('POST', '/scarabeo/chiudi', io)
    expect(chiusa.dati.status).toBe('done')
    expect(chiusa.dati.computer.mosse).toHaveLength(1)
    const salvata = db.sqlite.prepare('SELECT score, punti FROM scarabeo_games').get()
    expect(salvata).toMatchObject({ score: mossa.punti, punti: puntiScarabeo(mossa.punti, 200) })

    const classifica = await chiama<{ rows: { punti: number; punteggio: number }[] }>('GET', '/leaderboard/scarabeo?scope=today', io)
    expect(classifica.dati.rows[0]).toMatchObject({ punti: puntiScarabeo(mossa.punti, 200), punteggio: mossa.punti })
  })

  it('i punti arrivano al tetto e non oltre', () => {
    expect(puntiScarabeo(0, 245)).toBe(0)
    expect(puntiScarabeo(122, 245)).toBe(75)
    expect(puntiScarabeo(245, 245)).toBe(150)
    expect(puntiScarabeo(600, 245)).toBe(150)
  })
})

describe('le partite libere contro il computer', () => {
  function partitaFinita(seme: number): PartitaLibera {
    const partita: PartitaLibera = { seme, livello: 'facile', mosse: [] }
    const sacchetto = sacchettoDaSeme(seme)
    while (!statoLibera(partita, sacchetto).finita) {
      const mossa = turnoDelComputer(dawg, partita, sacchetto)
      partita.mosse.push(mossa ?? { tipo: 'passo' })
    }
    return partita
  }

  it('il server rigioca la partita, conta lui chi ha vinto, e non la conta due volte', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('carla')
    const partita = partitaFinita(424242)
    const risposta = await chiama<StatisticheScarabeoLibero>('POST', '/scarabeo/libera', io, partita)
    expect(risposta.status).toBe(201)
    expect(risposta.dati).toMatchObject({ giocate: 1, vinte: 0, perse: 1 })
    expect(risposta.dati.perLivello.facile.giocate).toBe(1)

    const ancora = await chiama<StatisticheScarabeoLibero>('POST', '/scarabeo/libera', io, partita)
    expect(ancora.dati.giocate).toBe(1)
    expect((await chiama<StatisticheScarabeoLibero>('GET', '/scarabeo/libera', io)).dati.giocate).toBe(1)
  })

  it('rifiuta partite a meta’, livelli inventati e mosse illegali', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('dario')
    const partita = partitaFinita(99)
    expect(partita.mosse).toHaveLength(2 * MOSSE_A_TESTA)
    const meta = { ...partita, mosse: partita.mosse.slice(0, 5) }
    expect((await chiama('POST', '/scarabeo/libera', io, meta)).status).toBe(422)
    expect((await chiama('POST', '/scarabeo/libera', io, { ...partita, livello: 'impossibile' })).status).toBe(400)
    const truccata = {
      ...partita,
      mosse: [{ tipo: 'posa', posa: [{ r: 0, c: 0, lettera: 'a', jolly: false }] }, ...partita.mosse.slice(1)],
    }
    expect((await chiama('POST', '/scarabeo/libera', io, truccata)).status).toBe(422)
  })
})
