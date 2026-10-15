import { describe, expect, it } from 'vitest'
import { PUNTI_COMPLETO, RITMO_CRUCIVERBA, costiCruciverba } from '../../shared/cruciverba'
import type { CruciverbaEsito, CruciverbaLiberaRisposta, CruciverbaState } from '../../shared/types'
import { banco } from './banco'

/*
 *   C A N E
 *   A # # R
 *   S O L E
 *   A # # A
 */
const SOLUZIONE = 'canea##rsolea##a'

/** Gli schemi liberi, tutti difficili come quelli di prima dei livelli, o dei livelli chiesti. */
function conSchemi(quanti: number, livelli: string[] = []) {
  const b = banco()
  for (let id = 1; id <= quanti; id += 1) {
    b.db.sqlite
      .prepare(
        `INSERT INTO cruciverba_schemi_liberi (id, righe, colonne, soluzione, definizioni, created_at)
         VALUES (?, 4, 4, ?, ?, '2026-09-26T00:00:00.000Z')`,
      )
      .run(id, SOLUZIONE, JSON.stringify({ o0: { t: 'Il migliore amico', v: 'cane' } }))
    if (livelli[id - 1]) {
      b.db.sqlite.prepare('UPDATE cruciverba_schemi_liberi SET livello = ? WHERE id = ?').run(livelli[id - 1], id)
    }
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

  it('una griglia giusta chiude la partita a cento punti e svela le fonti', async () => {
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
    expect(esito.dati.punti).toBe(100)
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
    // Lo schema di prova ha dodici lettere: una parte vale un dodicesimo dei punti. Il controllo e' di tutto lo schema.
    const costi = costiCruciverba(SOLUZIONE)
    expect(controllo.dati.errate).toEqual([0])
    expect(controllo.dati.punti).toBe(PUNTI_COMPLETO - costi.controlloSchema - costi.errore)

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
    expect(svelata.dati.punti).toBe(PUNTI_COMPLETO - costi.controlloSchema - costi.errore - 2 * costi.svelata)
  })

  it('svelare costa ogni lettera, anche quelle gia’ giuste, e non due volte la stessa', async () => {
    const { chiama, giocatore } = conSchemi(1)
    const io = await giocatore('fabio')
    const p = (await chiama<CruciverbaState>('POST', '/cruciverba/libera', io)).dati
    const costi = costiCruciverba(SOLUZIONE)
    const svela = (lettere: string, versione: number, caselle: number[]) =>
      chiama<CruciverbaEsito>('POST', `/cruciverba/libera/${p.partitaId}/svela`, io, { lettere, versione, caselle })

    // CANE con la C e la A gia' scritte, e giuste: si pagano tutte e quattro.
    const cane = await svela('ca' + p.lettere.slice(2), p.versione, [0, 1, 2, 3])
    expect(cane.dati.svelate).toEqual([0, 1, 2, 3])
    expect(cane.dati.punti).toBe(PUNTI_COMPLETO - 4 * costi.svelata)
    // CASA, in verticale, incrocia CANE sulla C gia' svelata: si pagano le altre tre. Lo schema e' di dodici
    // lettere, e sette svelate lo portano a zero: il conto lo dicono le svelate.
    const casa = await svela('cane' + p.lettere.slice(4), cane.dati.versione, [0, 4, 8, 12])
    expect(casa.dati.svelate).toEqual([0, 1, 2, 3, 4, 8, 12])
    // Una lettera gia' svelata non si ripaga.
    const scritte = [...p.lettere].map((l, k) => ([0, 1, 2, 3, 4, 8, 12].includes(k) ? SOLUZIONE[k] : l)).join('')
    const di_nuovo = await svela(scritte, casa.dati.versione, [8])
    expect(di_nuovo.dati.svelate).toHaveLength(7)
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

  it('si sceglie il livello, e senza livello e\' un difficile come prima', async () => {
    const { chiama, giocatore } = conSchemi(3, ['facile', 'difficile', 'facile'])
    const io = await giocatore('franca')
    const prima = await chiama<CruciverbaLiberaRisposta>('GET', '/cruciverba/libera', io)
    expect(prima.dati.perLivello).toEqual({ facile: 2, media: 0, difficile: 1 })

    const facile = await chiama<CruciverbaState>('POST', '/cruciverba/libera', io, { livello: 'facile' })
    expect(facile.status).toBe(201)
    expect(facile.dati.livello).toBe('facile')
    expect((await chiama('POST', '/cruciverba/libera', io, { livello: 'media' })).status).toBe(503)
    const difficile = await chiama<CruciverbaState>('POST', '/cruciverba/libera', io)
    expect(difficile.dati.livello).toBe('difficile')
    // Un livello che non c'e' vale come nessun livello: i difficili sono finiti.
    expect((await chiama('POST', '/cruciverba/libera', io, { livello: 'esperto' })).status).toBe(503)

    const dopo = await chiama<CruciverbaLiberaRisposta>('GET', '/cruciverba/libera', io)
    expect(dopo.dati.perLivello).toEqual({ facile: 1, media: 0, difficile: 0 })
  })

  it('il tempo fa i punti: lo schema finito tardi vale la meta\'', async () => {
    const { chiama, giocatore, db } = conSchemi(1)
    const io = await giocatore('gino')
    const p = (await chiama<CruciverbaState>('POST', '/cruciverba/libera', io)).dati
    const costi = costiCruciverba(SOLUZIONE)
    const lento = RITMO_CRUCIVERBA.lentoMs * costi.daTrovare
    // Il server crede al tempo dichiarato solo fino a quanto e' passato davvero dall'ultima scrittura.
    const allora = new Date(Date.now() - lento - 60_000).toISOString()
    db.sqlite.prepare('UPDATE cruciverba_partite_libere SET updated_at = ? WHERE id = ?').run(allora, p.partitaId)
    const esito = await chiama<CruciverbaEsito>('PUT', `/cruciverba/libera/${p.partitaId}/lettere`, io, {
      lettere: SOLUZIONE,
      versione: p.versione,
      tempoMs: lento,
    })
    expect(esito.dati.status).toBe('done')
    expect(esito.dati.punti).toBe(PUNTI_COMPLETO / 2)
    expect(esito.dati.spesi).toBe(0)
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
    expect(riepilogo.dati).toMatchObject({ status: 'done', punti: 100 })
  })
})
