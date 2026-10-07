import { describe, expect, it } from 'vitest'
import { PUNTI_COMPLETO, costiCruciverba } from '../../shared/cruciverba'
import type { CruciverbaEsito, CruciverbaLiberaRisposta, CruciverbaState } from '../../shared/types'
import { banco } from './banco'

/*
 *   C A N E
 *   A # # R
 *   S O L E
 *   A # # A
 */
const SOLUZIONE = 'canea##rsolea##a'

function conSchemi(quanti: number) {
  const b = banco()
  for (let id = 1; id <= quanti; id += 1) {
    b.db.sqlite
      .prepare(
        `INSERT INTO cruciverba_schemi_liberi (id, righe, colonne, soluzione, definizioni, created_at)
         VALUES (?, 4, 4, ?, ?, '2026-09-26T00:00:00.000Z')`,
      )
      .run(id, SOLUZIONE, JSON.stringify({ o0: { t: 'Il migliore amico', v: 'cane' } }))
  }
  return b
}

describe('il cruciverba libero, dalle API', () => {
  it('si apre uno schema nuovo, senza soluzione né fonti finché non e’ finito', async () => {
    const { chiama, giocatore } = conSchemi(2)
    const io = await giocatore('anna')
    const vuota = await chiama<CruciverbaLiberaRisposta>('GET', '/cruciverba/libera', io)
    expect(vuota.dati).toMatchObject({ partita: null, giocate: 0, disponibili: 2 })

    const nuova = await chiama<CruciverbaState>('POST', '/cruciverba/libera', io)
    expect(nuova.status).toBe(201)
    expect(nuova.dati.modalita).toBe('libera')
    expect(nuova.dati.soluzione).toBeNull()
    expect(nuova.dati.schema).not.toContain('c')
    const cane = nuova.dati.definizioni.find((d) => d.chiave === 'o0')
    expect(cane?.testo).toBe('Il migliore amico')
    expect(cane?.voce).toBeNull()

    const riletta = await chiama<CruciverbaLiberaRisposta>('GET', '/cruciverba/libera', io)
    expect(riletta.dati.partita?.partitaId).toBe(nuova.dati.partitaId)
  })

  it('una griglia giusta chiude la partita a centosessanta punti e svela le fonti', async () => {
    const { chiama, giocatore } = conSchemi(1)
    const io = await giocatore('bruno')
    const p = (await chiama<CruciverbaState>('POST', '/cruciverba/libera', io)).dati
    const esito = await chiama<CruciverbaEsito>('PUT', `/cruciverba/libera/${p.partitaId}/lettere`, io, {
      lettere: SOLUZIONE,
      versione: p.versione,
      tempoMs: 1000,
    })
    expect(esito.status).toBe(200)
    expect(esito.dati.status).toBe('done')
    expect(esito.dati.punti).toBe(160)
    expect(esito.dati.stato?.soluzione).toBe(SOLUZIONE)
    expect(esito.dati.stato?.definizioni.find((d) => d.chiave === 'o0')?.voce).toBe('cane')

    const numeri = await chiama<CruciverbaLiberaRisposta>('GET', '/cruciverba/libera', io)
    expect(numeri.dati).toMatchObject({ partita: null, giocate: 1, completate: 1, senzaAiuti: 1, disponibili: 0 })
  })

  it('controllare e svelare costano come nella classificata, e la versione protegge le scritture', async () => {
    const { chiama, giocatore } = conSchemi(1)
    const io = await giocatore('carla')
    const p = (await chiama<CruciverbaState>('POST', '/cruciverba/libera', io)).dati
    const sbagliata = 'x' + p.lettere.slice(1)
    const controllo = await chiama<CruciverbaEsito>('POST', `/cruciverba/libera/${p.partitaId}/controlla`, io, {
      lettere: sbagliata.replace('x', 'b'),
      versione: p.versione,
    })
    // Lo schema di prova ha dodici lettere: ognuna vale un dodicesimo dei punti.
    const costi = costiCruciverba(SOLUZIONE)
    expect(controllo.dati.errate).toEqual([0])
    expect(controllo.dati.punti).toBe(PUNTI_COMPLETO - costi.errore)

    const vecchia = await chiama('POST', `/cruciverba/libera/${p.partitaId}/svela`, io, {
      lettere: p.lettere,
      versione: p.versione,
      caselle: [1],
    })
    expect(vecchia.status).toBe(409)

    const svelata = await chiama<CruciverbaEsito>('POST', `/cruciverba/libera/${p.partitaId}/svela`, io, {
      lettere: p.lettere,
      versione: controllo.dati.versione,
      caselle: [1, 2],
    })
    expect(svelata.dati.rivelate).toEqual({ 1: 'a', 2: 'n' })
    expect(svelata.dati.punti).toBe(PUNTI_COMPLETO - costi.errore - 2 * costi.svelata)
  })

  it('quando gli schemi sono finiti lo dice, e le partite di altri non si vedono', async () => {
    const { chiama, giocatore } = conSchemi(1)
    const io = await giocatore('dario')
    const altro = await giocatore('elena')
    const p = (await chiama<CruciverbaState>('POST', '/cruciverba/libera', io)).dati
    expect((await chiama('POST', '/cruciverba/libera', io)).status).toBe(503)
    expect((await chiama('GET', `/cruciverba/libera/${p.partitaId}`, altro)).status).toBe(404)
    expect((await chiama('GET', `/cruciverba/libera/${p.partitaId}`, io)).status).toBe(200)
  })
})

describe('il cruciverba del giorno, dopo il riordino', () => {
  it('si apre, si scrive e si chiude come prima', async () => {
    const { chiama, giocatore, db } = banco()
    const { giornata } = await import('../lib/cruciverbaStore')
    db.sqlite
      .prepare(
        `INSERT INTO cruciverba_schemi (puzzle_number, righe, colonne, soluzione, definizioni, created_at)
         VALUES (?, 4, 4, ?, '{}', '2026-09-26T00:00:00.000Z')`,
      )
      .run(giornata().puzzleNumber, SOLUZIONE)
    const io = await giocatore('franca')
    const stato = await chiama<CruciverbaState>('GET', '/cruciverba/state', io)
    expect(stato.dati.modalita).toBe('classificata')
    expect(stato.dati.puzzleNumber).toBe(giornata().puzzleNumber)
    const esito = await chiama<CruciverbaEsito>('PUT', '/cruciverba/lettere', io, {
      lettere: SOLUZIONE,
      versione: stato.dati.versione,
    })
    expect(esito.dati.status).toBe('done')
    const riepilogo = await chiama<{ status: string; punti: number }>('GET', '/cruciverba/summary', io)
    expect(riepilogo.dati).toMatchObject({ status: 'done', punti: 160 })
  })
})
