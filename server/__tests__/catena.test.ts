import { describe, expect, it } from 'vitest'
import {
  ERRORE_CATENA,
  FONDO_CATENA,
  MARGINE_CATENA_MS,
  MONTEPREMI_CATENA,
  PREAMBOLO_FINALE_CATENA_MS,
  PREAMBOLO_PAROLA_CATENA_MS,
  PREAMBOLO_RIPRESA_CATENA_MS,
  PUNTI_CATENA_PERSA,
  SECONDO_ERRORE_CATENA,
  TEMPO_FINALE_CATENA_MS,
  TEMPO_PAROLA_CATENA_MS,
  type CatenaDelGiorno,
} from '../../shared/catena'
import type { CatenaLeaderboard, CatenaStato, GeneraleLeaderboard, OggiRisposta } from '../../shared/types'
import { puntiClassificateDi } from '../lib/generale'
import { ordinaCatena, type TotaliCatena } from '../lib/catenaStore'
import { today } from '../lib/wordleStore'
import { banco, type Giocatore } from './banco'

type Chiama = ReturnType<typeof banco>['chiama']

/** Quel che costa una parola mostrata: i due errori, o il minuto finito. */
const MOSTRATA = ERRORE_CATENA + SECONDO_ERRORE_CATENA
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

  it('guardare non apre niente; Comincia mostra la prima coppia, e della parola solo le prime due lettere', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    const prima = await stato(chiama, io)
    // Prima di Comincia non si vede niente: la coppia, vista prima del minuto, sarebbe tempo regalato.
    expect(prima).toMatchObject({ iniziata: false, voci: [], parola: null })
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM catena_partite').get()?.n).toBe(0)

    const s = await manda(chiama, io, 'inizia', prima)
    expect(s.iniziata).toBe(true)
    expect(s.voci.map((v) => v.parola)).toEqual(['spirito', null, 'tiro'])
    // Quanto e' lunga la parola non si dice.
    expect(s.voci[1]).toMatchObject({ lettere: 'LI', tipo: 'nascosta', lunghezza: 0 })
    expect(s).toMatchObject({ passo: 0, montepremi: MONTEPREMI_CATENA, jollyRestanti: 2, finale: null })
    expect(s.parola?.inizioMs).toBeGreaterThan(PREAMBOLO_PAROLA_CATENA_MS - 2_000)
    expect(s.parola?.restanteMs).toBe(TEMPO_PAROLA_CATENA_MS)
    for (const parola of ['libero', 'cavallo', 'navale', 'base', 'dondolo']) expect(JSON.stringify(s)).not.toContain(parola)
    expect(JSON.stringify(s.voci)).not.toContain('"lunghezza":6')
    // Comincia due volte non fa ripartire il minuto.
    const di_nuovo = await manda(chiama, io, 'inizia', s)
    expect(di_nuovo.versione).toBe(s.versione)
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM catena_partite').get()?.n).toBe(1)
  })

  it('il minuto di una parola: finito, la parola si mostra e costa due errori, dalla scadenza e non da adesso', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await manda(chiama, io, 'inizia', await stato(chiama, io))
    // Il minuto e' passato da un pezzo, e anche quello della seconda parola: si mostrano tutte e due.
    const fa = Date.now() - 2 * (TEMPO_PAROLA_CATENA_MS + PREAMBOLO_PAROLA_CATENA_MS) - MARGINE_CATENA_MS - 1_000
    db.sqlite
      .prepare('UPDATE catena_partite SET parola_at = ? WHERE player_id = ?')
      .run(new Date(fa).toISOString(), io.id)
    const vecchia = await chiama('POST', '/catena/prova', io, { versione: s.versione, parola: 'libero' })
    // La parola arrivata dopo il tempo non vale: la partita e' andata avanti, e il telefono rilegge.
    expect(vecchia.status).toBe(409)
    s = await stato(chiama, io)
    expect(s).toMatchObject({ passo: 2, montepremi: MONTEPREMI_CATENA - 2 * MOSTRATA })
    expect(s.voci[1]).toMatchObject({ parola: 'libero', tipo: 'rivelata' })
    expect(s.voci[3]).toMatchObject({ parola: 'cavallo', tipo: 'rivelata' })
    // Il minuto della terza parola parte dalla scadenza della seconda, con la scena: ne resta meno di uno intero.
    expect(s.parola?.inizioMs).toBe(0)
    expect(s.parola?.restanteMs).toBeLessThan(TEMPO_PAROLA_CATENA_MS)

    // Allo scadere il telefono lo dice da solo, senza aspettare il margine.
    s = await manda(chiama, io, 'tempo', s)
    expect(s).toMatchObject({ esito: 'scaduta', passo: 3, montepremi: MONTEPREMI_CATENA - 3 * MOSTRATA })
    expect(s.parola?.inizioMs).toBeGreaterThan(PREAMBOLO_PAROLA_CATENA_MS - 2_000)
  })

  it('un errore costa dieci punti e mostra una lettera; il secondo ne costa sei, mostra la parola e si scende', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await manda(chiama, io, 'prova', await stato(chiama, io), 'lancio')
    expect(s).toMatchObject({ esito: 'sbagliata', passo: 0, montepremi: MONTEPREMI_CATENA - ERRORE_CATENA })
    expect(s.voci[1].lettere).toBe('LIB')
    s = await manda(chiama, io, 'prova', s, 'lavoro')
    expect(s).toMatchObject({ esito: 'rivelata', passo: 1, montepremi: MONTEPREMI_CATENA - MOSTRATA })
    expect(s.voci[1]).toMatchObject({ parola: 'libero', tipo: 'rivelata' })
    expect(s.voci.map((v) => v.parola)).toEqual(['spirito', 'libero', 'tiro', null, 'dondolo'])
    // Un doppio tocco con la versione di prima non prova due volte.
    const vecchia = await chiama('POST', '/catena/prova', io, { versione: s.versione - 1, parola: 'cane' })
    expect(vecchia.status).toBe(409)
    expect((await stato(chiama, io)).montepremi).toBe(MONTEPREMI_CATENA - MOSTRATA)
  })

  it('una parola scritta per intero, con le lettere che si vedevano già, vale come giusta, e si salva giusta', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    // Il telefono mette LI davanti a quel che si e' scritto: chi scrive LIBERO manda "lilibero".
    let s = await manda(chiama, io, 'prova', await stato(chiama, io), 'lilibero')
    expect(s).toMatchObject({ esito: 'giusta', passo: 1, montepremi: MONTEPREMI_CATENA })
    s = await manda(chiama, io, 'prova', s, 'cacavallo')
    s = await manda(chiama, io, 'prova', s, 'sedia')
    s = await manda(chiama, io, 'prova', s, 'babattaglia')
    expect(s.passo).toBe(4)
    const mosse = db.sqlite.prepare('SELECT mosse FROM catena_partite WHERE player_id = ?').get(io.id)?.mosse
    expect(JSON.parse(String(mosse))).toEqual(GIUSTE.map((w) => ({ k: 'p', w })))
    // Nella finale si vede la N: chi scrive NAVALE manda "nnavale".
    const fine = await manda(chiama, io, 'rispondi', s, 'nnavale')
    expect(fine).toMatchObject({ status: 'done', indovinata: true, risposta: 'navale', punti: MONTEPREMI_CATENA })
  })

  it('un errore o un jolly fanno ripartire il minuto della parola', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await manda(chiama, io, 'inizia', await stato(chiama, io))
    // Sono passati quaranta secondi della prima parola.
    const fa = Date.now() - PREAMBOLO_PAROLA_CATENA_MS - 40_000
    const indietro = () =>
      db.sqlite.prepare('UPDATE catena_partite SET parola_at = ? WHERE player_id = ?').run(new Date(fa).toISOString(), io.id)
    indietro()
    s = await stato(chiama, io)
    expect(s.parola?.restanteMs).toBeLessThan(TEMPO_PAROLA_CATENA_MS - 30_000)
    s = await manda(chiama, io, 'prova', s, 'lancio')
    expect(s.parola?.inizioMs).toBeGreaterThan(PREAMBOLO_RIPRESA_CATENA_MS - 1_000)
    expect(s.parola?.restanteMs).toBe(TEMPO_PAROLA_CATENA_MS)
    indietro()
    s = await manda(chiama, io, 'jolly', await stato(chiama, io))
    expect(s.parola?.inizioMs).toBeGreaterThan(PREAMBOLO_RIPRESA_CATENA_MS - 1_000)
    expect(s.parola?.restanteMs).toBe(TEMPO_PAROLA_CATENA_MS)
  })

  it('i jolly sono due, e non costano niente', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await manda(chiama, io, 'jolly', await stato(chiama, io))
    s = await manda(chiama, io, 'jolly', s)
    expect(s).toMatchObject({ esito: 'jolly', jollyRestanti: 0, jollyUsabile: false, montepremi: MONTEPREMI_CATENA })
    expect(s.voci[1].lettere).toBe('LIBE')
    const terzo = await chiama('POST', '/catena/jolly', io, { versione: s.versione })
    expect(terzo.status).toBe(409)
  })

  it('arrivati alla finale con tutti e due i jolly il terzo elemento c’e’, e parte il minuto dopo la scena', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    const s = await catena(chiama, io)
    expect(s).toMatchObject({ passo: 4, terzo: 'regalato', compraUsabile: false, montepremi: MONTEPREMI_CATENA })
    expect(s.voci[9]).toMatchObject({ lettere: 'N', parola: null })
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

  it('con un jolly usato il terzo elemento si compra, e dimezza il montepremi', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await manda(chiama, io, 'jolly', await stato(chiama, io))
    s = await catena(chiama, io)
    expect(s).toMatchObject({ terzo: 'no', compraUsabile: true, jollyRestanti: 1 })
    expect(s.voci[10].parola).toBeNull()
    expect(JSON.stringify(s)).not.toContain('base')
    s = await manda(chiama, io, 'compra', s)
    expect(s).toMatchObject({ esito: 'comprato', terzo: 'comprato', montepremi: MONTEPREMI_CATENA / 2 })
    expect(s.voci[10].parola).toBe('base')
    // Il jolly rimasto nella finale non si usa.
    expect(s.jollyUsabile).toBe(false)
    expect((await chiama('POST', '/catena/jolly', io, { versione: s.versione })).status).toBe(409)
    expect((await chiama('POST', '/catena/tempo', io, { versione: s.versione })).status).toBe(409)
  })

  it('una parola finale sbagliata vale quanto un Wordle perso, e la risposta e’ una sola', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await catena(chiama, io, [false, true, true, true])
    expect(s.montepremi).toBe(MONTEPREMI_CATENA - MOSTRATA)
    s = await manda(chiama, io, 'rispondi', s, 'nave')
    expect(s).toMatchObject({ status: 'done', indovinata: false, risposta: 'nave', punti: PUNTI_CATENA_PERSA })
    const ancora = await manda(chiama, io, 'rispondi', s, 'navale')
    expect(ancora.punti).toBe(PUNTI_CATENA_PERSA)
  })

  it('tutte le parole mostrate e il terzo elemento lasciano quanto una finale sbagliata, non meno', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await manda(chiama, io, 'jolly', await stato(chiama, io))
    s = await catena(chiama, io, [false, false, false, false])
    expect(s.montepremi).toBe(MONTEPREMI_CATENA - 4 * MOSTRATA)
    s = await manda(chiama, io, 'compra', s)
    expect(s.montepremi).toBe(FONDO_CATENA)
    s = await manda(chiama, io, 'rispondi', s, 'navale')
    expect(s).toMatchObject({ status: 'done', indovinata: true, punti: FONDO_CATENA })
  })

  it('prima della finale non si risponde, e il minuto finito chiude la partita con i punti di consolazione', async () => {
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
    expect(tardi).toMatchObject({ status: 'done', indovinata: false, risposta: null, punti: PUNTI_CATENA_PERSA })
  })
})
