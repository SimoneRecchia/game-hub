import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../shared/daily'
import { puntiQuiz } from '../../shared/quiz'
import { generaDomande, type DomandaCompleta } from '../../shared/quiz-domande'
import type { QuizDatiRisposta, QuizEsito, QuizLeaderboard, QuizState } from '../../shared/types'
import { ID, MONDO } from '../../shared/__tests__/quiz-mondo'
import { ordinaQuiz, type TotaliQuiz } from '../lib/quizStore'
import { today } from '../lib/wordleStore'
import { banco, type Giocatore } from './banco'

type Chiama = ReturnType<typeof banco>['chiama']

/** Le domande di oggi: nove capitali e, in fondo, il Mediterraneo sulla cartina. */
function domandeDiProva(): DomandaCompleta[] {
  const capitali = generaDomande(MONDO, { categoria: 'capitali', area: 'mondo', quante: 9 }, mulberry32(5))
  const cartina = generaDomande(MONDO, { categoria: 'mari', modo: 'cartina', area: 'mondo', quante: 10 }, mulberry32(5)).find(
    (d) => d.giusta === ID.MED,
  ) ?? {
    tipo: 'dove-acqua',
    testo: 'Dov’è il Mar Mediterraneo?',
    opzioni: [],
    cartina: { vista: 'mediterraneo', strato: 'acque' },
    giusta: ID.MED,
    accettate: [ID.MED, ID.TIR, ID.ADR],
    risposta: 'Mar Mediterraneo',
    soggetto: ID.MED,
  }
  return [...capitali, cartina as DomandaCompleta]
}

function preparaGiornata(db: ReturnType<typeof banco>['db'], domande = domandeDiProva()) {
  db.sqlite
    .prepare('INSERT INTO quiz_giornate (puzzle_number, categoria, domande, created_at) VALUES (?, ?, ?, ?)')
    .run(today().puzzleNumber, 'capitali', JSON.stringify(domande), new Date().toISOString())
  return domande
}

async function apri(chiama: Chiama, io: Giocatore): Promise<QuizState> {
  const r = await chiama<QuizState>('POST', '/quiz/domanda', io)
  expect(r.status, JSON.stringify(r.dati)).toBe(200)
  return r.dati
}

async function rispondi(chiama: Chiama, io: Giocatore, indice: number, scelta: string | null) {
  return chiama<QuizEsito>('POST', '/quiz/risposta', io, { indice, scelta })
}

describe('il quiz del giorno', () => {
  it('senza le domande di oggi dice che non e’ pronto', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('anna')
    const r = await chiama('GET', '/quiz/state', io)
    expect(r.status).toBe(503)
    expect(r.dati.code).toBe('QUIZ_ASSENTE')
  })

  it('guardarlo non apre la partita: comincia alla prima domanda', async () => {
    const { chiama, giocatore, db } = banco()
    preparaGiornata(db)
    const io = await giocatore('anna')
    const stato = (await chiama<QuizState>('GET', '/quiz/state', io)).dati
    expect(stato).toMatchObject({ status: 'nuova', totale: 10, aperta: null, fatte: [], categoria: 'capitali', modo: 'scelta' })
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM quiz_partite').get()?.n).toBe(0)

    const aperto = await apri(chiama, io)
    expect(aperto.status).toBe('playing')
    expect(aperto.aperta?.indice).toBe(0)
    expect(aperto.aperta?.limiteMs).toBe(15_000)
    // La risposta non viaggia con la domanda.
    const domanda = aperto.aperta!.domanda as unknown as Record<string, unknown>
    for (const segreto of ['giusta', 'risposta', 'accettate', 'soggetto', 'luogo']) expect(domanda[segreto]).toBeUndefined()
    // Chiederla di nuovo non riavvia il tempo.
    const ancora = await apri(chiama, io)
    expect(ancora.aperta?.indice).toBe(0)
    expect(ancora.aperta!.restanteMs).toBeLessThanOrEqual(aperto.aperta!.restanteMs)
  })

  it('conta le risposte giuste, una volta sola, e chiude con i punti', async () => {
    const { chiama, giocatore, db } = banco()
    const domande = preparaGiornata(db)
    const io = await giocatore('anna')

    await apri(chiama, io)
    const prima = await rispondi(chiama, io, 0, domande[0].giusta)
    expect(prima.status).toBe(200)
    expect(prima.dati.risposta).toMatchObject({ giusta: true, corretta: domande[0].giusta, risposta: domande[0].risposta })
    // A risposta data arriva anche dove guardare, per la cartina che insegna.
    expect(prima.dati.risposta.luogo).toEqual(domande[0].luogo)
    expect(prima.dati.stato.aperta).toBeNull()
    expect(prima.dati.stato.giuste).toBe(1)

    // La stessa domanda due volte: la seconda non conta.
    const doppia = await rispondi(chiama, io, 0, domande[0].giusta)
    expect(doppia.status).toBe(409)
    // Senza aprire la domanda dopo, non si risponde.
    expect((await rispondi(chiama, io, 1, domande[1].giusta)).status).toBe(409)

    // Le altre: una sbagliata, le capitali giuste, e il Tirreno per il Mediterraneo.
    for (let i = 1; i < domande.length; i += 1) {
      await apri(chiama, io)
      const d = domande[i]
      const scelta = i === 1 ? d.opzioni.find((o) => o.id !== d.giusta)!.id : d.cartina ? ID.TIR : d.giusta
      const r = await rispondi(chiama, io, i, scelta)
      expect(r.status, JSON.stringify(r.dati)).toBe(200)
      expect(r.dati.risposta.giusta).toBe(i !== 1)
      // Sulla cartina, i posti che valevano: il Tirreno era giusto perché sta nel Mediterraneo.
      if (d.cartina) expect(r.dati.risposta.accettate).toEqual(expect.arrayContaining([ID.MED, ID.TIR]))
    }
    const finale = (await chiama<QuizState>('GET', '/quiz/state', io)).dati
    expect(finale.status).toBe('done')
    expect(finale.giuste).toBe(9)
    expect(finale.punti).toBe(puntiQuiz(9, 10))
    expect(finale.fatte).toHaveLength(10)
    // A partita finita non si apre piu' niente.
    expect((await apri(chiama, io)).aperta).toBeNull()
    expect((await rispondi(chiama, io, 10, 'x')).status).toBe(409)
  })

  it('una risposta oltre il tempo non vale, e una domanda lasciata aperta si chiude da sola', async () => {
    const { chiama, giocatore, db } = banco()
    const domande = preparaGiornata(db)
    const io = await giocatore('anna')
    const indietro = (ms: number) =>
      db.sqlite
        .prepare('UPDATE quiz_partite SET aperta_at = ? WHERE player_id = ?')
        .run(new Date(Date.now() - ms).toISOString(), io.id)

    await apri(chiama, io)
    indietro(15_000 + 3_000 + 1_000)
    const tardi = await rispondi(chiama, io, 0, domande[0].giusta)
    expect(tardi.status).toBe(200)
    expect(tardi.dati.risposta).toMatchObject({ giusta: false, scelta: null, ms: 15_000 })

    // La seconda la si lascia lì: rileggere lo stato la chiude come non data.
    await apri(chiama, io)
    indietro(60_000)
    const stato = (await chiama<QuizState>('GET', '/quiz/state', io)).dati
    expect(stato.fatte).toHaveLength(2)
    expect(stato.fatte[1].risposta.giusta).toBe(false)
    expect(stato.aperta).toBeNull()
    // E la terza parte solo quando la si chiede.
    expect((await apri(chiama, io)).aperta?.indice).toBe(2)
  })

  it('rifiuta le risposte che non sono un id', async () => {
    const { chiama, giocatore, db } = banco()
    preparaGiornata(db)
    const io = await giocatore('anna')
    await apri(chiama, io)
    expect((await rispondi(chiama, io, 0, '<script>' as string)).status).toBe(400)
  })

  it('va in classifica con i punti e, a pari punti, con il tempo', async () => {
    const { chiama, giocatore, db } = banco()
    const domande = preparaGiornata(db)
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    for (const io of [anna, bruno]) {
      for (let i = 0; i < domande.length; i += 1) {
        await apri(chiama, io)
        await rispondi(chiama, io, i, domande[i].cartina ? ID.MED : domande[i].giusta)
      }
    }
    db.sqlite.prepare('UPDATE quiz_partite SET tempo_ms = 90000 WHERE player_id = ?').run(anna.id)
    db.sqlite.prepare('UPDATE quiz_partite SET tempo_ms = 40000 WHERE player_id = ?').run(bruno.id)
    const c = (await chiama<QuizLeaderboard>('GET', '/leaderboard/quiz?scope=today', anna)).dati
    expect(c.rows.map((r) => [r.nickname, r.punti, r.giuste])).toEqual([
      ['bruno', 100, 10],
      ['anna', 100, 10],
    ])
    expect(c.me?.rank).toBe(2)
  })
})

describe('l’ordine della classifica del quiz', () => {
  const t = (nickname: string, punti: number, giornate: number, tempoMs: number): TotaliQuiz => ({
    playerId: nickname,
    nickname,
    displayName: nickname,
    avatarColor: '#000',
    punti,
    giornate,
    giuste: 0,
    tempoMs,
    inCorso: giornate === 0,
  })

  it('punti, poi il tempo piu’ corto, e chi ha solo una partita aperta in fondo', () => {
    const righe = ordinaQuiz([t('lento', 92, 1, 120_000), t('aperto', 0, 0, 0), t('svelto', 92, 1, 60_000), t('primo', 100, 1, 200_000)])
    expect(righe.map((r) => r.nickname)).toEqual(['primo', 'svelto', 'lento', 'aperto'])
  })
})

describe('il riassunto per le libere', () => {
  it('arriva intero la prima volta, e poi solo se cambia', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('anna')
    expect((await chiama('GET', '/quiz/dati', io)).status).toBe(503)

    const adesso = new Date().toISOString()
    for (const parte of ['paesi', 'acque', 'fiumi', 'laghi'] as const) {
      db.sqlite
        .prepare('INSERT INTO quiz_dati (parte, versione, dati, updated_at) VALUES (?, ?, ?, ?)')
        .run(parte, 'v1', JSON.stringify(MONDO[parte]), adesso)
    }
    const intero = (await chiama<QuizDatiRisposta>('GET', '/quiz/dati', io)).dati
    expect(intero.versione).toBe('v1')
    expect(intero.dati?.paesi).toEqual(MONDO.paesi)
    expect(intero.dati?.fiumi).toEqual(MONDO.fiumi)

    const uguale = (await chiama<QuizDatiRisposta>('GET', '/quiz/dati?versione=v1', io)).dati
    expect(uguale).toEqual({ versione: 'v1', dati: null })
  })

  it('porta le versioni delle geometrie e delle città, e le dà a parte, a pezzi incollati', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('anna')
    expect((await chiama('GET', '/quiz/geometrie?v=g1', io)).status).toBe(503)
    expect((await chiama('GET', '/quiz/citta?v=c1', io)).status).toBe(503)

    const adesso = new Date().toISOString()
    const metti = (parte: string, versione: string, dati: unknown) =>
      db.sqlite
        .prepare('INSERT INTO quiz_dati (parte, versione, dati, updated_at) VALUES (?, ?, ?, ?)')
        .run(parte, versione, JSON.stringify(dati), adesso)
    for (const parte of ['paesi', 'acque', 'fiumi', 'laghi'] as const) metti(parte, 'v1', MONDO[parte])
    metti('geo:fiumi:0', 'g1', { F1: [[1, 2, 3, 4]] })
    metti('geo:fiumi:1', 'g1', { F2: [[5, 6, 7, 8]] })
    metti('geo:laghi:0', 'g1', { L1: [[1, 1, 1, 1, 1, 1, 1, 1]] })
    metti('citta:regioni', 'c1', { R1: 'Lombardia' })
    metti('citta:0', 'c1', { C1: ['Milano', 'IT', 'R1', 9.19, 45.46, 970] })

    const riassunto = (await chiama<QuizDatiRisposta>('GET', '/quiz/dati', io)).dati
    expect(riassunto.dati).toMatchObject({ geo: 'g1', citta: 'c1' })

    const geo = await chiama<{ versione: string; fiumi: unknown; laghi: unknown }>('GET', '/quiz/geometrie?v=g1', io)
    expect(geo.dati).toEqual({
      versione: 'g1',
      fiumi: { F1: [[1, 2, 3, 4]], F2: [[5, 6, 7, 8]] },
      laghi: { L1: [[1, 1, 1, 1, 1, 1, 1, 1]] },
    })
    expect(geo.intestazioni?.get('cache-control')).toContain('immutable')
    // Una versione vecchia riceve la nuova, ma senza cache.
    expect((await chiama('GET', '/quiz/geometrie?v=vecchia', io)).intestazioni?.get('cache-control')).toBe('no-store')

    const citta = await chiama<{ regioni: unknown; citta: unknown }>('GET', '/quiz/citta?v=c1', io)
    expect(citta.dati).toEqual({
      versione: 'c1',
      regioni: { R1: 'Lombardia' },
      citta: { C1: ['Milano', 'IT', 'R1', 9.19, 45.46, 970] },
    })
  })
})
