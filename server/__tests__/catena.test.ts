import { describe, expect, it } from 'vitest'
import {
  MONTEPREMI_CATENA,
  PREAMBOLO_FINALE_CATENA_MS,
  TEMPO_FINALE_CATENA_MS,
  type CatenaDelGiorno,
} from '../../shared/catena'
import type { CatenaLeaderboard, CatenaStato, GeneraleLeaderboard, OggiRisposta } from '../../shared/types'
import { puntiClassificateDi } from '../lib/generale'
import { ordinaCatena, type TotaliCatena } from '../lib/catenaStore'
import { today } from '../lib/wordleStore'
import { banco, type Giocatore } from './banco'

type Chiama = ReturnType<typeof banco>['chiama']
type Db = ReturnType<typeof banco>['db']

/** Una catena di prova: si indovinano LIBERO, CAVALLO, SEDIA, BATTAGLIA e la finale NAVALE. */
const CATENA: CatenaDelGiorno = {
  parole: ['spirito', 'libero', 'tiro', 'cavallo', 'dondolo', 'sedia', 'elettrica', 'battaglia', 'grande', 'navale', 'base'],
  espressioni: [
    'spirito libero',
    'tiro libero',
    'tiro da cavallo',
    'cavallo a dondolo',
    'sedia a dondolo',
    'sedia elettrica',
    'battaglia elettrica',
    'grande battaglia',
    'grande navale',
    'base navale',
  ],
}
const GIUSTE = ['libero', 'cavallo', 'sedia', 'battaglia']

function conLaGiornata(db: Db, numero = today().puzzleNumber) {
  db.sqlite
    .prepare('INSERT INTO catena_giornate (puzzle_number, catena, created_at) VALUES (?, ?, ?)')
    .run(numero, JSON.stringify(CATENA), new Date().toISOString())
}

const stato = async (chiama: Chiama, chi: Giocatore) => (await chiama<CatenaStato>('GET', '/catena/state', chi)).dati

async function manda(chiama: Chiama, chi: Giocatore, percorso: string, s: CatenaStato, parola?: string) {
  const r = await chiama<CatenaStato>('POST', `/catena/${percorso}`, chi, { versione: s.versione, parola })
  expect(r.status, percorso).toBe(200)
  return r.dati
}

/** Le quattro parole della catena: giuste, o sbagliate due volte come dice `giuste`. */
async function catena(chiama: Chiama, chi: Giocatore, giuste: boolean[] = [true, true, true, true]) {
  let s = await stato(chiama, chi)
  for (let i = 0; i < GIUSTE.length; i += 1) {
    if (giuste[i]) s = await manda(chiama, chi, 'prova', s, GIUSTE[i])
    else {
      s = await manda(chiama, chi, 'prova', s, 'sbagliata')
      s = await manda(chiama, chi, 'prova', s, 'ancora')
    }
  }
  return s
}

describe('la classifica della Catena', () => {
  const g = (nickname: string, punti: number, giornate: number, indovinate: number, tempoMs: number) =>
    ({
      playerId: nickname,
      nickname,
      displayName: nickname,
      avatarColor: '#000',
      punti,
      giornate,
      indovinate,
      tempoMs,
      inCorso: giornate === 0,
    }) satisfies TotaliCatena

  it('punti prima, poi piu’ parole finali indovinate, poi meno tempo, e chi non ha finito in fondo', () => {
    const righe = ordinaCatena([
      g('lenta', 32, 2, 2, 50_000),
      g('aperta', 0, 0, 0, 0),
      g('veloce', 32, 2, 2, 20_000),
      g('una', 32, 1, 1, 5_000),
      g('meno', 16, 1, 1, 1_000),
    ])
    expect(righe.map((r) => r.nickname)).toEqual(['veloce', 'lenta', 'una', 'meno', 'aperta'])
  })
})

describe('la Catena del giorno, dalle API', () => {
  it('senza la catena di oggi risponde che non e’ pronta', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('anna')
    const r = await chiama<{ code: string }>('GET', '/catena/state', io)
    expect(r.status).toBe(503)
    expect(r.dati.code).toBe('CATENA_ASSENTE')
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.catena).toMatchObject({ pronta: false })
  })

  it('guardare non apre niente, e della parola da indovinare si vede solo la prima lettera', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    const s = await stato(chiama, io)
    expect(s.voci.map((v) => v.parola)).toEqual(['spirito', null, 'tiro'])
    expect(s.voci[1]).toMatchObject({ lettere: 'L', tipo: 'nascosta' })
    expect(s).toMatchObject({ passo: 0, montepremi: MONTEPREMI_CATENA, jollyRestanti: 2, finale: null })
    for (const parola of ['libero', 'cavallo', 'navale', 'base', 'dondolo']) expect(JSON.stringify(s)).not.toContain(parola)
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM catena_partite').get()?.n).toBe(0)
  })

  it('un errore dimezza e mostra una lettera; il secondo mostra la parola e si scende', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await manda(chiama, io, 'prova', await stato(chiama, io), 'lancio')
    expect(s).toMatchObject({ esito: 'sbagliata', passo: 0, montepremi: 32 })
    expect(s.voci[1].lettere).toBe('LI')
    s = await manda(chiama, io, 'prova', s, 'lavoro')
    expect(s).toMatchObject({ esito: 'rivelata', passo: 1, montepremi: 16 })
    expect(s.voci[1]).toMatchObject({ parola: 'libero', tipo: 'rivelata' })
    expect(s.voci.map((v) => v.parola)).toEqual(['spirito', 'libero', 'tiro', null, 'dondolo'])
    // Un doppio tocco con la versione di prima non prova due volte.
    const vecchia = await chiama('POST', '/catena/prova', io, { versione: s.versione - 1, parola: 'cane' })
    expect(vecchia.status).toBe(409)
    expect((await stato(chiama, io)).montepremi).toBe(16)
  })

  it('i jolly sono due, e non dimezzano', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await manda(chiama, io, 'jolly', await stato(chiama, io))
    s = await manda(chiama, io, 'jolly', s)
    expect(s).toMatchObject({ esito: 'jolly', jollyRestanti: 0, jollyUsabile: false, montepremi: MONTEPREMI_CATENA })
    expect(s.voci[1].lettere).toBe('LIB')
    const terzo = await chiama('POST', '/catena/jolly', io, { versione: s.versione })
    expect(terzo.status).toBe(409)
  })

  it('arrivati alla finale con tutti e due i jolly il terzo elemento c’e’, e parte il minuto dopo la scena', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    const s = await catena(chiama, io)
    expect(s).toMatchObject({ passo: 4, terzo: 'regalato', compraUsabile: false, montepremi: MONTEPREMI_CATENA })
    expect(s.voci[9]).toMatchObject({ lettere: 'NA', ultima: 'E', parola: null })
    expect(s.voci[10]).toMatchObject({ tipo: 'terzo', parola: 'base' })
    expect(s.finale?.inizioMs).toBeGreaterThan(PREAMBOLO_FINALE_CATENA_MS - 2_000)
    expect(s.finale?.restanteMs).toBe(TEMPO_FINALE_CATENA_MS)
    // Nella finale non si provano parole: c'e' una risposta sola.
    expect((await chiama('POST', '/catena/prova', io, { versione: s.versione, parola: 'navale' })).status).toBe(409)
    const fine = await manda(chiama, io, 'rispondi', s, ' Navale ')
    expect(fine).toMatchObject({ status: 'done', indovinata: true, punti: MONTEPREMI_CATENA, esito: 'giusta' })
    expect(fine.voci.map((v) => v.parola)).toEqual(CATENA.parole)
    expect(fine.voci.slice(0, -1).map((v) => v.espressione)).toEqual(CATENA.espressioni)

    const classifica = (await chiama<CatenaLeaderboard>('GET', '/leaderboard/catena?scope=today', io)).dati
    expect(classifica.me).toMatchObject({ punti: MONTEPREMI_CATENA, giornate: 1, indovinate: 1 })
    const generale = (await chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', io)).dati
    expect(generale.me?.perGioco.catena).toBe(MONTEPREMI_CATENA)
    expect(await puntiClassificateDi(db as unknown as D1Database, io.id, today().puzzleNumber)).toBe(MONTEPREMI_CATENA)
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.catena).toMatchObject({
      status: 'done',
      passo: 5,
      indovinata: true,
      punti: MONTEPREMI_CATENA,
    })
  })

  it('con un jolly usato il terzo elemento si compra, e dimezza', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await manda(chiama, io, 'jolly', await stato(chiama, io))
    s = await catena(chiama, io)
    expect(s).toMatchObject({ terzo: 'no', compraUsabile: true, jollyRestanti: 1 })
    expect(s.voci[10].parola).toBeNull()
    expect(JSON.stringify(s)).not.toContain('base')
    s = await manda(chiama, io, 'compra', s)
    expect(s).toMatchObject({ esito: 'comprato', terzo: 'comprato', montepremi: 32 })
    expect(s.voci[10].parola).toBe('base')
    // Il jolly rimasto vale anche nella finale.
    s = await manda(chiama, io, 'jolly', s)
    expect(s.voci[9].lettere).toBe('NAV')
  })

  it('una parola finale sbagliata non vale niente, e la risposta e’ una sola', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await catena(chiama, io, [false, true, true, true])
    expect(s.montepremi).toBe(16)
    s = await manda(chiama, io, 'rispondi', s, 'nave')
    expect(s).toMatchObject({ status: 'done', indovinata: false, risposta: 'nave', punti: 0 })
    const ancora = await manda(chiama, io, 'rispondi', s, 'navale')
    expect(ancora.punti).toBe(0)
  })

  it('prima della finale non si risponde, e il minuto finito chiude la partita senza punti', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await manda(chiama, io, 'prova', await stato(chiama, io), 'libero')
    expect((await chiama('POST', '/catena/rispondi', io, { versione: s.versione, parola: 'navale' })).status).toBe(409)
    for (const parola of GIUSTE.slice(1)) s = await manda(chiama, io, 'prova', s, parola)
    expect(s.passo).toBe(4)
    db.sqlite
      .prepare('UPDATE catena_partite SET finale_at = ? WHERE player_id = ?')
      .run(new Date(Date.now() - TEMPO_FINALE_CATENA_MS - 10_000).toISOString(), io.id)
    const tardi = await manda(chiama, io, 'rispondi', s, 'navale')
    expect(tardi).toMatchObject({ status: 'done', indovinata: false, risposta: null, punti: 0 })
  })
})
