import { describe, expect, it } from 'vitest'
import { GUESS_WORDS } from '../../shared/words/guesses'
import { SOLUTION_WORDS } from '../../shared/words/solutions'
import type { WordleLiberaRisposta, WordleLiberaState } from '../../shared/types'
import { GIORNI_PROTETTI, paroleProtette, scegliParola } from '../lib/wordleLibera'
import { today } from '../lib/wordleStore'
import { banco } from './banco'

function soluzioneDi(db: ReturnType<typeof banco>['db'], id: string): string {
  return String(db.sqlite.prepare('SELECT answer FROM wordle_libere WHERE id = ?').get(id)?.answer)
}

/** Parole valide diverse dalla soluzione, per perdere di proposito. */
function sbagliate(soluzione: string, quante: number): string[] {
  return GUESS_WORDS.filter((p) => p !== soluzione).slice(0, quante)
}

describe('la scelta della parola libera', () => {
  it('non pesca mai una parola dei prossimi giorni, principale o in piu’', () => {
    const protette = paroleProtette(today().puzzleNumber)
    // Sessanta giorni da cinque parole: al piu' trecento, qualche doppione fra le extra.
    expect(protette.size).toBeGreaterThan(GIORNI_PROTETTI * 4)
    for (let i = 0; i < 200; i += 1) {
      expect(protette.has(scegliParola(protette, new Set(), Math.random))).toBe(false)
    }
  })

  it('evita le parole gia’ uscite al giocatore, finché ce ne sono altre', () => {
    const protette = paroleProtette(today().puzzleNumber)
    const libere = SOLUTION_WORDS.filter((p) => !protette.has(p))
    const recenti = new Set(libere.slice(0, libere.length - 1))
    expect(scegliParola(protette, recenti, () => 0)).toBe(libere[libere.length - 1])
    // Tutte gia' uscite: si ricomincia invece di fermarsi.
    expect(protette.has(scegliParola(protette, new Set(libere), () => 0.5))).toBe(false)
  })
})

describe('il Wordle libero, dalle API', () => {
  it('una partita si apre, si gioca e si vince; la soluzione arriva solo alla fine', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('anna')

    const vuota = await chiama<WordleLiberaRisposta>('GET', '/wordle/libera', io)
    expect(vuota.status).toBe(200)
    expect(vuota.dati.partita).toBeNull()

    const nuova = await chiama<WordleLiberaState>('POST', '/wordle/libera', io)
    expect(nuova.status).toBe(201)
    expect(nuova.dati.answer).toBeNull()
    const soluzione = soluzioneDi(db, nuova.dati.id)

    const primo = await chiama<WordleLiberaState>('POST', `/wordle/libera/${nuova.dati.id}/guess`, io, {
      guess: sbagliate(soluzione, 1)[0],
    })
    expect(primo.status).toBe(200)
    expect(primo.dati.guesses).toHaveLength(1)
    expect(primo.dati.answer).toBeNull()

    const vinta = await chiama<WordleLiberaState>('POST', `/wordle/libera/${nuova.dati.id}/guess`, io, {
      guess: soluzione,
    })
    expect(vinta.dati.status).toBe('won')
    expect(vinta.dati.answer).toBe(soluzione)

    const dopo = await chiama<WordleLiberaState>('POST', `/wordle/libera/${nuova.dati.id}/guess`, io, {
      guess: sbagliate(soluzione, 2)[1],
    })
    expect(dopo.status).toBe(409)

    const stato = await chiama<WordleLiberaRisposta>('GET', '/wordle/libera', io)
    expect(stato.dati.partita).toBeNull()
    expect(stato.dati.statistiche).toMatchObject({ giocate: 1, vinte: 1, serie: 1 })
    expect(stato.dati.statistiche.distribuzione[1]).toBe(1)
  })

  it('cambiare parola a meta’ conta come una sconfitta; una partita mai toccata si riusa', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('bruno')
    const prima = await chiama<WordleLiberaState>('POST', '/wordle/libera', io)
    const ancora = await chiama<WordleLiberaState>('POST', '/wordle/libera', io)
    expect(ancora.dati.id).toBe(prima.dati.id)

    const soluzione = soluzioneDi(db, prima.dati.id)
    await chiama('POST', `/wordle/libera/${prima.dati.id}/guess`, io, { guess: sbagliate(soluzione, 1)[0] })
    const seconda = await chiama<WordleLiberaState>('POST', '/wordle/libera', io)
    expect(seconda.dati.id).not.toBe(prima.dati.id)

    const stato = await chiama<WordleLiberaRisposta>('GET', '/wordle/libera', io)
    expect(stato.dati.partita?.id).toBe(seconda.dati.id)
    expect(stato.dati.statistiche).toMatchObject({ giocate: 1, vinte: 0, serie: 0 })
  })

  it('sei tentativi sbagliati chiudono la partita e dicono la parola', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('carla')
    const p = await chiama<WordleLiberaState>('POST', '/wordle/libera', io)
    const soluzione = soluzioneDi(db, p.dati.id)
    let ultimo: WordleLiberaState | null = null
    for (const parola of sbagliate(soluzione, 6)) {
      ultimo = (await chiama<WordleLiberaState>('POST', `/wordle/libera/${p.dati.id}/guess`, io, { guess: parola })).dati
    }
    expect(ultimo?.status).toBe('lost')
    expect(ultimo?.answer).toBe(soluzione)
  })

  it('rifiuta parole inesistenti, doppioni e partite di altri', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('dario')
    const altro = await giocatore('elena')
    const p = await chiama<WordleLiberaState>('POST', '/wordle/libera', io)
    const soluzione = soluzioneDi(db, p.dati.id)
    const parola = sbagliate(soluzione, 1)[0]

    expect((await chiama('POST', `/wordle/libera/${p.dati.id}/guess`, io, { guess: 'qqqqq' })).status).toBe(400)
    await chiama('POST', `/wordle/libera/${p.dati.id}/guess`, io, { guess: parola })
    expect((await chiama('POST', `/wordle/libera/${p.dati.id}/guess`, io, { guess: parola })).status).toBe(400)
    expect((await chiama('POST', `/wordle/libera/${p.dati.id}/guess`, altro, { guess: soluzione })).status).toBe(404)
    expect((await chiama('GET', '/wordle/libera', null)).status).toBe(401)
  })
})
