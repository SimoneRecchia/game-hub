import { describe, expect, it } from 'vitest'
import {
  ERRORE_GHIGLIOTTINA,
  MARGINE_GHIGLIOTTINA_MS,
  MONTEPREMI_GHIGLIOTTINA,
  PUNTI_GHIGLIOTTINA_PERSA,
  PREAMBOLO_PRIMA_COPPIA_MS,
  TEMPO_FINALE_MS,
  TEMPO_SCELTA_MS,
  preamboloCoppia,
  type GhigliottinaDelGiorno,
} from '../../shared/ghigliottina'
import type {
  GeneraleLeaderboard,
  GhigliottinaLeaderboard,
  GhigliottinaStato,
  OggiRisposta,
} from '../../shared/types'
import { puntiClassificateDi } from '../lib/generale'
import { ordinaGhigliottina, type TotaliGhigliottina } from '../lib/ghigliottinaStore'
import { today } from '../lib/wordleStore'
import { banco, type Giocatore } from './banco'

type Chiama = ReturnType<typeof banco>['chiama']
type Db = ReturnType<typeof banco>['db']

/** Una ghigliottina di prova: la giusta e' ora la prima ora la seconda parola. */
const GIORNO: GhigliottinaDelGiorno = {
  soluzione: 'colpo',
  coppie: [
    { parole: ['fulmine', 'tuono'], giusta: 0, spiegazione: 'colpo di fulmine' },
    { parole: ['sedia', 'scena'], giusta: 1, spiegazione: 'colpo di scena' },
    { parole: ['genio', 'talento'], giusta: 0, spiegazione: 'colpo di genio' },
    { parole: ['nazione', 'stato'], giusta: 1, spiegazione: 'colpo di stato' },
    { parole: ['grazia', 'bellezza'], giusta: 0, spiegazione: 'colpo di grazia' },
  ],
}

function conLaGiornata(db: Db, numero = today().puzzleNumber) {
  db.sqlite
    .prepare('INSERT INTO ghigliottina_giornate (puzzle_number, ghigliottina, created_at) VALUES (?, ?, ?)')
    .run(numero, JSON.stringify(GIORNO), new Date().toISOString())
}

const stato = async (chiama: Chiama, chi: Giocatore) =>
  (await chiama<GhigliottinaStato>('GET', '/ghigliottina/state', chi)).dati

async function scegli(chiama: Chiama, chi: Giocatore, s: GhigliottinaStato, scelta: 0 | 1) {
  const r = await chiama<GhigliottinaStato>('POST', '/ghigliottina/scegli', chi, {
    versione: s.versione,
    coppia: s.corrente,
    scelta,
  })
  expect(r.status).toBe(200)
  return r.dati
}

/** Le scelte, giuste o sbagliate come dice `giuste` coppia per coppia, finché ce ne sono. */
async function scegliTutte(chiama: Chiama, chi: Giocatore, giuste: boolean[]) {
  let s = await stato(chiama, chi)
  while (s.corrente !== null && s.corrente < giuste.length) {
    const g = GIORNO.coppie[s.corrente].giusta
    s = await scegli(chiama, chi, s, giuste[s.corrente] ? g : g === 0 ? 1 : 0)
  }
  return s
}

async function finale(chiama: Chiama, chi: Giocatore, s: GhigliottinaStato) {
  const r = await chiama<GhigliottinaStato>('POST', '/ghigliottina/finale', chi, { versione: s.versione })
  expect(r.status).toBe(200)
  return r.dati
}

async function rispondi(chiama: Chiama, chi: Giocatore, s: GhigliottinaStato, parola: string) {
  const r = await chiama<GhigliottinaStato>('POST', '/ghigliottina/rispondi', chi, { versione: s.versione, parola })
  expect(r.status).toBe(200)
  return r.dati
}

describe('la classifica della Ghigliottina', () => {
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
    }) satisfies TotaliGhigliottina

  it('punti prima, poi piu’ parole indovinate, poi meno tempo, e chi non ha finito in fondo', () => {
    const righe = ordinaGhigliottina([
      g('lenta', 32, 2, 2, 50_000),
      g('aperta', 0, 0, 0, 0),
      g('veloce', 32, 2, 2, 20_000),
      g('una', 32, 1, 1, 5_000),
      g('meno', 16, 1, 1, 1_000),
    ])
    expect(righe.map((r) => r.nickname)).toEqual(['veloce', 'lenta', 'una', 'meno', 'aperta'])
  })
})

describe('la Ghigliottina del giorno, dalle API', () => {
  it('senza la partita di oggi risponde che non e’ pronta', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('anna')
    const r = await chiama<{ code: string }>('GET', '/ghigliottina/state', io)
    expect(r.status).toBe(503)
    expect(r.dati.code).toBe('GHIGLIOTTINA_ASSENTE')
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.ghigliottina).toMatchObject({ pronta: false })
  })

  it('guardare non apre niente, e di una coppia non si sa qual e’ la giusta finché non si sceglie', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    const prima = await stato(chiama, io)
    // Prima di Comincia non si vede nessuna coppia: vista prima del tempo, sarebbe tempo regalato.
    expect(prima).toMatchObject({ iniziata: false, coppie: [], coppia: null })
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM ghigliottina_partite').get()?.n).toBe(0)
    const r = await chiama<GhigliottinaStato>('POST', '/ghigliottina/inizia', io, {})
    expect(r.status).toBe(200)
    const s = r.dati
    expect(s.coppie).toHaveLength(1)
    expect(s.coppie[0]).toEqual({
      parole: ['fulmine', 'tuono'],
      scelta: null,
      scaduta: false,
      giusta: null,
      spiegazione: null,
    })
    expect(s.coppia?.inizioMs).toBeGreaterThan(PREAMBOLO_PRIMA_COPPIA_MS - 1_000)
    expect(s.coppia?.restanteMs).toBe(TEMPO_SCELTA_MS)
    expect(s.montepremi).toBe(MONTEPREMI_GHIGLIOTTINA)
    expect(s.soluzione).toBeNull()
    // Niente della soluzione e delle coppie dopo nel JSON.
    expect(JSON.stringify(s)).not.toContain('colpo')
    expect(JSON.stringify(s)).not.toContain('scena')
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM ghigliottina_partite').get()?.n).toBe(1)
  })

  it('il tempo di una coppia finito conta sbagliata e mostra la giusta, dalla scadenza e non da adesso', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = (await chiama<GhigliottinaStato>('POST', '/ghigliottina/inizia', io, {})).dati
    // Passati il tempo della prima coppia e quello della seconda: tutte e due contano sbagliate.
    const fa = Date.now() - 2 * TEMPO_SCELTA_MS - preamboloCoppia(false) - MARGINE_GHIGLIOTTINA_MS - 1_000
    db.sqlite
      .prepare('UPDATE ghigliottina_partite SET coppia_at = ? WHERE player_id = ?')
      .run(new Date(fa).toISOString(), io.id)
    // Una scelta arrivata dopo il tempo non vale: la coppia era gia' passata, e la risposta e' lo stato com'e'.
    const tardi = await chiama<GhigliottinaStato>('POST', '/ghigliottina/scegli', io, {
      versione: s.versione,
      coppia: 0,
      scelta: 0,
    })
    expect(tardi.status).toBe(200)
    s = tardi.dati
    expect(s).toMatchObject({ corrente: 2, montepremi: MONTEPREMI_GHIGLIOTTINA - 2 * ERRORE_GHIGLIOTTINA })
    expect(s.coppie[0]).toMatchObject({ scelta: null, scaduta: true, giusta: 0 })
    expect(s.coppie[1]).toMatchObject({ scelta: null, scaduta: true, giusta: 1 })
    // La terza coppia e' partita dalla scadenza della seconda: il suo tempo corre gia'.
    expect(s.coppia?.inizioMs).toBe(0)
    expect(s.coppia?.restanteMs).toBeLessThan(TEMPO_SCELTA_MS)

    // Allo scadere il telefono lo dice da solo.
    const tempo = await chiama<GhigliottinaStato>('POST', '/ghigliottina/tempo', io, {
      versione: s.versione,
      coppia: 2,
    })
    expect(tempo.status).toBe(200)
    expect(tempo.dati).toMatchObject({ corrente: 3, montepremi: MONTEPREMI_GHIGLIOTTINA - 3 * ERRORE_GHIGLIOTTINA })
    expect(tempo.dati.coppie[2]).toMatchObject({ scaduta: true, giusta: 0 })
  })

  it('chi lascia la pagina perde le coppie, e poi la finale: la partita si chiude da sola', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    await chiama('POST', '/ghigliottina/inizia', io, {})
    const fa = Date.now() - 5 * (TEMPO_SCELTA_MS + preamboloCoppia(false)) - TEMPO_FINALE_MS - 60_000
    db.sqlite
      .prepare('UPDATE ghigliottina_partite SET coppia_at = ? WHERE player_id = ?')
      .run(new Date(fa).toISOString(), io.id)
    const s = await stato(chiama, io)
    expect(s).toMatchObject({ status: 'done', indovinata: false, risposta: null, punti: PUNTI_GHIGLIOTTINA_PERSA })
    expect(s.coppie.every((c) => c.scaduta)).toBe(true)
  })

  it('una scelta sbagliata toglie dieci punti al montepremi, e la giusta si vede lo stesso', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    const giusta = await scegli(chiama, io, await stato(chiama, io), 0)
    expect(giusta.coppie[0]).toMatchObject({ scelta: 0, giusta: 0 })
    expect(giusta.montepremi).toBe(100)
    expect(giusta.coppie[1]).toMatchObject({ parole: ['sedia', 'scena'], giusta: null })
    const sbagliata = await scegli(chiama, io, giusta, 0)
    expect(sbagliata.coppie[1]).toMatchObject({ scelta: 0, giusta: 1 })
    expect(sbagliata.montepremi).toBe(90)
    // Un doppio tocco sulla stessa coppia non sceglie di nuovo.
    const r = await chiama<GhigliottinaStato>('POST', '/ghigliottina/scegli', io, {
      versione: giusta.versione,
      coppia: 1,
      scelta: 1,
    })
    expect(r.status).toBe(200)
    expect(r.dati.montepremi).toBe(90)
    // Una coppia che non e' ancora uscita non si sceglie.
    const avanti = await chiama('POST', '/ghigliottina/scegli', io, { versione: sbagliata.versione, coppia: 4, scelta: 0 })
    expect(avanti.status).toBe(409)
  })

  it('la parola vincente giusta vale il montepremi rimasto, e si vedono le espressioni', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await scegliTutte(chiama, io, [true, false, true, false, true])
    expect(s.corrente).toBeNull()
    expect(s.montepremi).toBe(80)
    expect(s.finale.aperto).toBe(false)
    s = await finale(chiama, io, s)
    expect(s.finale.aperto).toBe(true)
    expect(s.finale.restanteMs).toBeGreaterThan(TEMPO_FINALE_MS - 2_000)
    s = await rispondi(chiama, io, s, ' Colpo ')
    expect(s).toMatchObject({ status: 'done', indovinata: true, soluzione: 'colpo', punti: 80 })
    expect(s.coppie.map((c) => c.spiegazione)).toEqual(GIORNO.coppie.map((c) => c.spiegazione))

    const classifica = (await chiama<GhigliottinaLeaderboard>('GET', '/leaderboard/ghigliottina?scope=today', io)).dati
    expect(classifica.me).toMatchObject({ punti: 80, giornate: 1, indovinate: 1 })
    const generale = (await chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', io)).dati
    expect(generale.me?.perGioco.ghigliottina).toBe(80)
    expect(await puntiClassificateDi(db as unknown as D1Database, io.id, today().puzzleNumber)).toBe(80)
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.ghigliottina).toMatchObject({
      status: 'done',
      scelte: 5,
      indovinata: true,
      punti: 80,
    })
  })

  it('una parola sbagliata vale quanto un Wordle perso, e una sola risposta', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await finale(chiama, io, await scegliTutte(chiama, io, [true, true, true, true, true]))
    s = await rispondi(chiama, io, s, 'botta')
    expect(s).toMatchObject({
      status: 'done',
      indovinata: false,
      risposta: 'botta',
      soluzione: 'colpo',
      punti: PUNTI_GHIGLIOTTINA_PERSA,
    })
    const ancora = await rispondi(chiama, io, s, 'colpo')
    expect(ancora.punti).toBe(PUNTI_GHIGLIOTTINA_PERSA)
  })

  it('prima delle cinque scelte non si risponde, e il minuto finito chiude la partita come una risposta sbagliata', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await scegliTutte(chiama, io, [true, true])
    const presto = await chiama('POST', '/ghigliottina/finale', io, { versione: s.versione })
    expect(presto.status).toBe(409)
    s = await finale(chiama, io, await scegliTutte(chiama, io, [true, true, true, true, true]))
    db.sqlite
      .prepare('UPDATE ghigliottina_partite SET finale_at = ? WHERE player_id = ?')
      .run(new Date(Date.now() - TEMPO_FINALE_MS - 10_000).toISOString(), io.id)
    const tardi = await rispondi(chiama, io, s, 'colpo')
    expect(tardi).toMatchObject({ status: 'done', indovinata: false, risposta: null, punti: PUNTI_GHIGLIOTTINA_PERSA })
  })
})
