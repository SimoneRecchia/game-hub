import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Dawg } from '../../shared/dawg'
import { MOSSE_PER_GIORNATA, leggiiDa, sacchettoDelGiorno, tabelloneDa, type Mossa } from '../../shared/scarabeo'
import { mosseLegali } from '../../shared/scarabeo-motore'
import { FORMATO_TRAGUARDO, giornataATurni, rispostaDelGiorno } from '../../shared/scarabeo-computer'
import { puntiScarabeo } from '../../shared/punti'
import type { ScarabeoState, ScarabeoSummary } from '../../shared/types'
import { giornateFerme, scriviTraguardo } from '../../scripts/scarabeo/traguardo'
import { giornata } from '../lib/scarabeoStore'
import { banco } from './banco'

const dawg = Dawg.da(readFileSync(join(__dirname, '..', '..', 'public', 'scarabeo', 'dizionario.dawg')))

type Banco = ReturnType<typeof banco>

/** Il traguardo di oggi, scritto come lo scrive la notte. */
function traguardo(b: Banco, numero: number, formato: number, punti = 240, mosse: Mossa[] = []) {
  b.db.sqlite
    .prepare('INSERT INTO scarabeo_computer (puzzle_number, punti, mosse, formato, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(numero, punti, JSON.stringify(mosse), formato, 'x')
}

/** La mia posa piu' ricca, adesso, con il mio leggio della partita a due. */
function miaMigliore(numero: number, mosse: Mossa[]): Mossa & { tipo: 'posa' } {
  const { leggii } = leggiiDa(sacchettoDelGiorno(numero), mosse, 2)
  const primaMossa = !mosse.some((m) => m.tipo === 'posa')
  const migliore = mosseLegali(dawg, tabelloneDa(mosse), leggii[0], primaMossa).sort((a, b) => b.punti - a.punti)[0]
  return { tipo: 'posa', posa: migliore.posa }
}

describe('lo Scarabeo classificato a turni contro il computer del giorno', () => {
  it('si gioca a turni, e il computer risponde nella stessa richiesta', async () => {
    const b = banco()
    const numero = giornata().puzzleNumber
    traguardo(b, numero, FORMATO_TRAGUARDO)
    const io = await b.giocatore('anna')

    const prima = await b.chiama<ScarabeoSummary>('GET', '/scarabeo/summary', io)
    expect(prima.dati).toMatchObject({ computer: 240, avversario: 0 })

    const stato = await b.chiama<ScarabeoState>('GET', '/scarabeo/state', io)
    expect(stato.dati).toMatchObject({ controComputer: true, avversario: 0, partita: [] })
    expect(stato.dati.leggio).toEqual(leggiiDa(sacchettoDelGiorno(numero), [], 2).leggii[0])

    const mossa = miaMigliore(numero, [])
    const senza = await b.chiama<{ code: string }>('POST', '/scarabeo/mossa', io, { posa: mossa.posa })
    expect(senza.status).toBe(422)
    expect(senza.dati.code).toBe('RISPOSTA_MANCANTE')

    const risposta = rispostaDelGiorno(dawg, numero, [mossa])!
    expect(risposta.tipo).toBe('posa')
    const dopo = await b.chiama<ScarabeoState>('POST', '/scarabeo/mossa', io, { posa: mossa.posa, risposta })
    expect(dopo.status).toBe(200)
    expect(dopo.dati.partita).toEqual([mossa, risposta])
    expect(dopo.dati.mosse.map((m) => m.mia)).toEqual([true, false])
    expect(dopo.dati.mosseUsate).toBe(1)
    expect(dopo.dati.avversario).toBe(dopo.dati.mosse[1].punti)
    expect(dopo.dati.puntiClassifica).toBe(puntiScarabeo(dopo.dati.punti, 240))
    expect(dopo.dati.leggio).toEqual(leggiiDa(sacchettoDelGiorno(numero), [mossa, risposta], 2).leggii[0])
    expect(b.db.sqlite.prepare('SELECT turns, score, punti_computer, contro_computer FROM scarabeo_games').get()).toEqual({
      turns: 1,
      score: dopo.dati.punti,
      punti_computer: dopo.dati.avversario,
      contro_computer: 1,
    })

    const riepilogo = await b.chiama<ScarabeoSummary>('GET', '/scarabeo/summary', io)
    expect(riepilogo.dati.avversario).toBe(dopo.dati.avversario)
  })

  it('la risposta del computer passa dagli stessi controlli di una mossa', async () => {
    const b = banco()
    const numero = giornata().puzzleNumber
    traguardo(b, numero, FORMATO_TRAGUARDO)
    const io = await b.giocatore('bruno')
    const mia: Mossa = { tipo: 'passo' }
    const { leggii } = leggiiDa(sacchettoDelGiorno(numero), [mia], 2)
    const suaMigliore = mosseLegali(dawg, tabelloneDa([]), leggii[1], true).sort((a, b) => b.punti - a.punti)[0]

    // Una tessera che il computer non ha.
    const mancante = 'abcdefghilmnopqrstuvz'.split('').find((l) => !leggii[1].includes(l))!
    const truccata = { tipo: 'posa', posa: suaMigliore.posa.map((p, i) => (i === 0 ? { ...p, lettera: mancante } : p)) }
    const r1 = await b.chiama<{ code: string }>('POST', '/scarabeo/passo', io, { risposta: truccata })
    expect(r1.status).toBe(422)
    expect(r1.dati.code).toBe('RISPOSTA')

    // Un cambio di tessere che non ha, e uno di niente.
    for (const tessere of [[mancante], []]) {
      const r = await b.chiama<{ code: string }>('POST', '/scarabeo/passo', io, { risposta: { tipo: 'cambio', tessere } })
      expect(r.status).toBe(422)
      expect(r.dati.code).toBe('RISPOSTA')
    }
    // Un tipo che non esiste.
    expect((await b.chiama('POST', '/scarabeo/passo', io, { risposta: { tipo: 'vinci' } })).status).toBe(422)
    expect(b.db.sqlite.prepare('SELECT turns FROM scarabeo_games').get()?.turns).toBe(0)

    // Il cambio di tutto il leggio, quando non sa posare niente, e' una mossa vera.
    const cambio = await b.chiama<ScarabeoState>('POST', '/scarabeo/passo', io, {
      risposta: { tipo: 'cambio', tessere: leggii[1] },
    })
    expect(cambio.status).toBe(200)
    expect(cambio.dati.mosse.map((m) => [m.tipo, m.mia])).toEqual([
      ['passo', true],
      ['cambio', false],
    ])
  })

  it('una parola del computer che non esiste non passa', async () => {
    const b = banco()
    const numero = giornata().puzzleNumber
    traguardo(b, numero, FORMATO_TRAGUARDO)
    const io = await b.giocatore('carla')
    const { leggii } = leggiiDa(sacchettoDelGiorno(numero), [{ tipo: 'passo' }], 2)
    // Le prime tessere del suo leggio in fila sulla stella: quasi mai una parola, e il test lo controlla.
    const posa = leggii[1].slice(0, 4).map((l, i) => ({ r: 7, c: 5 + i, lettera: l === '?' ? 'a' : l, jolly: l === '?' }))
    expect(dawg.contiene(posa.map((p) => p.lettera).join(''))).toBe(false)
    const r = await b.chiama<{ code: string; error: string }>('POST', '/scarabeo/passo', io, {
      risposta: { tipo: 'posa', posa },
    })
    expect(r.status).toBe(422)
    expect(r.dati.code).toBe('RISPOSTA')
    expect(r.dati.error).toMatch(/^La mossa del computer non va: .* nel dizionario\.$/)
  })

  it('dieci mosse a testa: il computer risponde anche all’ultima, e la giornata si chiude', async () => {
    const b = banco()
    const numero = giornata().puzzleNumber
    traguardo(b, numero, FORMATO_TRAGUARDO)
    const io = await b.giocatore('dario')
    const mosse: Mossa[] = []
    let ultima: ScarabeoState | null = null
    for (let i = 0; i < MOSSE_PER_GIORNATA; i += 1) {
      mosse.push({ tipo: 'passo' })
      const risposta = rispostaDelGiorno(dawg, numero, mosse)!
      mosse.push(risposta)
      const r = await b.chiama<ScarabeoState>('POST', '/scarabeo/passo', io, { risposta })
      expect(r.status).toBe(200)
      ultima = r.dati
    }
    expect(rispostaDelGiorno(dawg, numero, mosse)).toBeNull()
    expect(ultima!.status).toBe('done')
    expect(ultima!.partita).toEqual(mosse)
    expect(ultima!.avversario).toBe(ultima!.mosse.filter((m) => !m.mia).reduce((s, m) => s + m.punti, 0))
    expect((await b.chiama<{ code: string }>('POST', '/scarabeo/passo', io)).dati.code).toBe('MOSSE_FINITE')
  })

  it('a giornata chiusa si vede il traguardo: le mosse del computer al posto mio', async () => {
    const b = banco()
    const numero = giornata().puzzleNumber
    const partita = giornataATurni(dawg, numero, 7)
    traguardo(b, numero, FORMATO_TRAGUARDO, partita.punti, partita.mosse)
    const io = await b.giocatore('elena')
    const chiusa = await b.chiama<ScarabeoState>('POST', '/scarabeo/chiudi', io)
    const mosse = chiusa.dati.computer.mosse!
    expect(mosse.map((m) => m.numero)).toEqual(Array.from({ length: MOSSE_PER_GIORNATA }, (_, i) => i + 1))
    expect(mosse.reduce((s, m) => s + m.punti, 0)).toBe(partita.punti)
  })

  it('le giornate di prima dei turni restano da sole', async () => {
    const b = banco()
    const numero = giornata().puzzleNumber
    traguardo(b, numero, 1)
    const io = await b.giocatore('franco')
    const stato = await b.chiama<ScarabeoState>('GET', '/scarabeo/state', io)
    expect(stato.dati).toMatchObject({ controComputer: false, avversario: null })
    expect((await b.chiama<ScarabeoSummary>('GET', '/scarabeo/summary', io)).dati.avversario).toBeNull()
    const mossa = await b.chiama<ScarabeoState>('POST', '/scarabeo/passo', io)
    expect(mossa.status).toBe(200)
    expect(mossa.dati.partita).toEqual([{ tipo: 'passo' }])
  })

  it('senza traguardo la giornata e’ a turni, e il ripiego anche', async () => {
    const b = banco()
    const io = await b.giocatore('gina')
    const stato = await b.chiama<ScarabeoState>('GET', '/scarabeo/state', io)
    expect(stato.dati.controComputer).toBe(true)
    expect(b.db.sqlite.prepare('SELECT formato FROM scarabeo_computer').get()?.formato).toBe(FORMATO_TRAGUARDO)
  })
})

describe('i traguardi della notte', () => {
  it('si rifanno solo quelli da solo dei giorni che verranno e che nessuno ha aperto', async () => {
    const b = banco()
    const oggi = giornata().puzzleNumber
    const io = await b.giocatore('ivo')
    traguardo(b, oggi, 1, 200)
    traguardo(b, oggi + 1, 1, 200)
    traguardo(b, oggi + 2, 1, 200)
    traguardo(b, oggi + 3, FORMATO_TRAGUARDO, 210)
    // Una giornata che domani qualcuno ha gia' aperto: per esempio un orologio avanti.
    b.db.sqlite
      .prepare(
        `INSERT INTO scarabeo_games (id, player_id, puzzle_number, date, status, mosse, turns, score, started_at)
         VALUES ('g', ?, ?, '2099-01-01', 'playing', '[]', 0, 0, 'x')`,
      )
      .run(io.id, oggi + 2)

    const ferme = b.db.sqlite.prepare(giornateFerme(oggi, 5, oggi, FORMATO_TRAGUARDO)).all()
    expect(ferme.map((r) => r.puzzle_number).sort()).toEqual([oggi, oggi + 2, oggi + 3])

    // Anche riscrivendole tutte, quelle ferme non cambiano: la condizione e' nell'istruzione.
    for (let numero = oggi; numero < oggi + 5; numero += 1) {
      b.db.sqlite.exec(
        scriviTraguardo({ numero, punti: 250, mosse: [], formato: FORMATO_TRAGUARDO, adesso: 'y' }, oggi),
      )
    }
    const righe = b.db.sqlite.prepare('SELECT puzzle_number, punti, formato FROM scarabeo_computer ORDER BY 1').all()
    expect(righe.map((r) => [r.puzzle_number, r.punti, r.formato])).toEqual([
      [oggi, 200, 1],
      [oggi + 1, 250, FORMATO_TRAGUARDO],
      [oggi + 2, 200, 1],
      [oggi + 3, 210, FORMATO_TRAGUARDO],
      [oggi + 4, 250, FORMATO_TRAGUARDO],
    ])
  })
})
