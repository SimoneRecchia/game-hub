import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BASE_NOMI,
  TEMPO_NOMI_MS,
  categorieDelGiorno,
  lessicoDa,
  letteraDelGiorno,
  type CategoriaNomi,
  type FileLessicoNomi,
} from '../../shared/nomi-cose'
import { CONTI_LESSICO_NOMI } from '../../shared/nomi-cose-lessico'
import type { GeneraleLeaderboard, NomiLeaderboard, NomiStato, OggiRisposta } from '../../shared/types'
import { contoDellaGiornata, primoGiornoAperto, type PartitaLetta } from '../../scripts/nomi/conto'
import { puntiClassificateDi } from '../lib/generale'
import { ordinaNomi, type TotaliNomi } from '../lib/nomiStore'
import { today } from '../lib/wordleStore'
import { banco, type Giocatore } from './banco'

type Chiama = ReturnType<typeof banco>['chiama']
type Db = ReturnType<typeof banco>['db']

const stato = async (chiama: Chiama, chi: Giocatore) => (await chiama<NomiStato>('GET', '/nomi/state', chi)).dati

function fileDi(lettera: string): FileLessicoNomi {
  return JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'public', 'dati', 'nomi-cose', `${lettera}.json`), 'utf8'),
  ) as FileLessicoNomi
}

/** Le parole che il lessico conosce, per ogni categoria del giorno `numero`. */
function paroleDel(numero: number): { lettera: string; categorie: CategoriaNomi[]; parole: Record<string, string[]> } {
  const lettera = letteraDelGiorno(numero)
  const categorie = categorieDelGiorno(numero, CONTI_LESSICO_NOMI)
  return { lettera, categorie, parole: fileDi(lettera).categorie as Record<string, string[]> }
}

/** Porta indietro l'inizio della partita: come se fossero passati `ms` millisecondi. */
function indietro(db: Db, chi: Giocatore, ms: number) {
  db.sqlite
    .prepare('UPDATE nomi_partite SET iniziata_at = ? WHERE player_id = ?')
    .run(new Date(Date.now() - ms).toISOString(), chi.id)
}

/** Esegue il conto della notte di una giornata sul database di prova, come lo script. */
function contaLaNotte(db: Db, numero: number) {
  const g = db.sqlite
    .prepare('SELECT puzzle_number, lettera, categorie FROM nomi_giornate WHERE puzzle_number = ?')
    .get(numero) as { puzzle_number: number; lettera: string; categorie: string }
  const partite = db.sqlite
    .prepare(
      `SELECT id, risposte, tempo_ms, forme, iniziata_at, finished_at FROM nomi_partite
        WHERE puzzle_number = ? ORDER BY id`,
    )
    .all(numero) as unknown as PartitaLetta[]
  const lessico = lessicoDa(fileDi(g.lettera), JSON.parse(g.categorie))
  const conto = contoDellaGiornata(g, partite, lessico, new Date())
  db.sqlite.exec(conto.istruzioni.join('\n'))
  return conto
}

/** Una partita di ieri gia' consegnata, scritta direttamente: il giorno prima non si puo' giocare dalle API. */
function partitaDiIeri(db: Db, chi: Giocatore, numero: number, risposte: Record<string, string>, tempoMs: number) {
  const { lettera, categorie } = paroleDel(numero)
  const adesso = new Date().toISOString()
  db.sqlite
    .prepare(
      `INSERT OR IGNORE INTO nomi_giornate (puzzle_number, lettera, categorie, created_at) VALUES (?, ?, ?, ?)`,
    )
    .run(numero, lettera, JSON.stringify(categorie), adesso)
  db.sqlite
    .prepare(
      `INSERT INTO nomi_partite (id, player_id, puzzle_number, date, status, risposte, iniziata_at, tempo_ms,
         updated_at, finished_at)
       VALUES (?, ?, ?, '2026-01-01', 'done', ?, ?, ?, ?, ?)`,
    )
    .run(`nom_${chi.nickname}`, chi.id, numero, JSON.stringify(risposte), adesso, tempoMs, adesso, adesso)
}

describe('la classifica di Nomi, cose e città', () => {
  const g = (nickname: string, punti: number, giornate: number, valide: number): TotaliNomi => ({
    playerId: nickname,
    nickname,
    displayName: nickname,
    avatarColor: '#000',
    punti,
    giornate,
    valide,
    inAttesa: giornate === 0,
  })

  it('punti prima, poi piu’ risposte valide, e chi aspetta i punti in fondo', () => {
    const righe = ordinaNomi([g('poche', 40, 1, 3), g('attesa', 0, 0, 0), g('tante', 40, 1, 5), g('basso', 20, 1, 5)])
    expect(righe.map((r) => r.nickname)).toEqual(['tante', 'poche', 'basso', 'attesa'])
  })

  it('una giornata si conta solo qualche minuto dopo la mezzanotte, quando l’ultima partita e’ finita', () => {
    // 22:00 UTC del 3 ottobre e' la mezzanotte di Roma, con l'ora legale.
    const mezzanotte = Date.parse('2026-10-03T22:00:00Z')
    const giorno = today(new Date(mezzanotte - 1_000)).puzzleNumber
    expect(primoGiornoAperto(new Date(mezzanotte + 60_000))).toBe(giorno)
    expect(primoGiornoAperto(new Date(mezzanotte + 10 * 60_000))).toBe(giorno + 1)
  })
})

describe('la partita del giorno, dalle API', () => {
  it('guardare non apre niente: la lettera e le categorie si vedono quando si comincia', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('anna')
    const vuoto = await stato(chiama, io)
    expect(vuoto).toMatchObject({ status: 'nuova', lettera: null, categorie: null, restanteMs: null, ieri: null })
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.nomi).toMatchObject({ status: 'nuova', scritte: 0 })
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM nomi_partite').get()?.n).toBe(0)

    const numero = today().puzzleNumber
    const iniziata = (await chiama<NomiStato>('POST', '/nomi/inizia', io)).dati
    expect(iniziata.status).toBe('playing')
    expect(iniziata.lettera).toBe(letteraDelGiorno(numero))
    expect(iniziata.categorie).toEqual(categorieDelGiorno(numero, CONTI_LESSICO_NOMI))
    expect(iniziata.categorie).toHaveLength(5)
    expect(iniziata.restanteMs).toBeGreaterThan(TEMPO_NOMI_MS - 2_000)

    // Ricominciare non fa ripartire il tempo.
    indietro(db, io, 60_000)
    const ancora = (await chiama<NomiStato>('POST', '/nomi/inizia', io)).dati
    expect(ancora.restanteMs).toBeLessThanOrEqual(TEMPO_NOMI_MS - 59_000)
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.nomi.status).toBe('playing')
  })

  it('le risposte si salvano mentre si scrive, solo nelle categorie del giorno', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('bruno')
    const s = (await chiama<NomiStato>('POST', '/nomi/inizia', io)).dati
    const [prima, seconda] = s.categorie!
    const salvata = await chiama<NomiStato>('POST', '/nomi/risposte', io, {
      risposte: { [prima]: '  una\u0007 risposta  ', [seconda]: '' },
    })
    expect(salvata.status).toBe(200)
    expect(salvata.dati.risposte).toEqual({ [prima]: 'una risposta' })
    const altra = (['nomi', 'cose', 'citta', 'animali', 'colori', 'verbi'] as const).find(
      (c) => !s.categorie!.includes(c),
    )!
    expect((await chiama('POST', '/nomi/risposte', io, { risposte: { [altra]: 'x' } })).status).toBe(400)
    expect((await chiama('POST', '/nomi/risposte', io, { risposte: { [prima]: 3 } })).status).toBe(400)
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.nomi.scritte).toBe(1)
  })

  it('la consegna dice subito quali risposte valgono, e chiude la partita', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('carla')
    const numero = today().puzzleNumber
    const { lettera, categorie, parole } = paroleDel(numero)
    await chiama('POST', '/nomi/inizia', io)
    const risposte = Object.fromEntries(categorie.map((c) => [c, parole[c][0]]))
    // L'ultima e' inventata: comincia con la lettera, ma non e' una parola.
    risposte[categorie[4]] = `${lettera}qqxq`
    const fine = (await chiama<NomiStato>('POST', '/nomi/consegna', io, { risposte })).dati
    expect(fine.status).toBe('done')
    expect(fine.tempoMs).toBeLessThan(5_000)
    expect(fine.restanteMs).toBeNull()
    expect(fine.riconosciute).toEqual(Object.fromEntries(categorie.map((c, i) => [c, i < 4])))

    // Consegnata, non cambia piu': ne' una seconda consegna ne' un salvataggio.
    const dopo = (await chiama<NomiStato>('POST', '/nomi/consegna', io, { risposte: {} })).dati
    expect(dopo.risposte).toEqual(fine.risposte)
    const salvata = (await chiama<NomiStato>('POST', '/nomi/risposte', io, { risposte: {} })).dati
    expect(salvata.risposte).toEqual(fine.risposte)
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.nomi).toMatchObject({
      status: 'done',
      scritte: 5,
      valide: 4,
    })
  })

  it('il tempo scaduto consegna le risposte salvate, e quelle arrivate dopo non valgono', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('dario')
    const { categorie, parole } = paroleDel(today().puzzleNumber)
    await chiama('POST', '/nomi/inizia', io)
    await chiama('POST', '/nomi/risposte', io, { risposte: { [categorie[0]]: parole[categorie[0]][0] } })

    // Il riepilogo la dice finita senza toccarla; la pagina la chiude.
    indietro(db, io, TEMPO_NOMI_MS + 10_000)
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.nomi.status).toBe('done')
    const tardi = (
      await chiama<NomiStato>('POST', '/nomi/consegna', io, {
        risposte: Object.fromEntries(categorie.map((c) => [c, parole[c][0]])),
      })
    ).dati
    expect(tardi).toMatchObject({ status: 'done', tempoMs: TEMPO_NOMI_MS })
    expect(Object.keys(tardi.risposte)).toEqual([categorie[0]])
    expect(tardi.riconosciute).toEqual({ [categorie[0]]: true })
  })

  it('dentro il margine della rete la consegna vale ancora, con tutto il tempo', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('elena')
    const { categorie, parole } = paroleDel(today().puzzleNumber)
    await chiama('POST', '/nomi/inizia', io)
    indietro(db, io, TEMPO_NOMI_MS + 1_000)
    const fine = (
      await chiama<NomiStato>('POST', '/nomi/consegna', io, { risposte: { [categorie[1]]: parole[categorie[1]][0] } })
    ).dati
    expect(fine).toMatchObject({ status: 'done', tempoMs: TEMPO_NOMI_MS })
    expect(Object.keys(fine.risposte)).toEqual([categorie[1]])
  })
})

describe('il conto della notte, che vale il giorno dopo', () => {
  it('una risposta rara vale piu’ di una data da tutti, e i punti di ieri valgono oggi', async () => {
    const { chiama, giocatore, db } = banco()
    const [anna, bruno, carla, dario] = await Promise.all(['anna', 'bruno', 'carla', 'dario'].map((n) => giocatore(n)))
    const oggi = today().puzzleNumber
    const ieri = oggi - 1
    const { categorie, parole } = paroleDel(ieri)
    const [c0, c1] = categorie
    // La prima risposta l'hanno data in tre; la seconda l'ha data solo Anna.
    partitaDiIeri(db, anna, ieri, { [c0]: parole[c0][0], [c1]: parole[c1][1] }, 30_000)
    partitaDiIeri(db, bruno, ieri, { [c0]: parole[c0][0], [c1]: parole[c1][2] }, 30_000)
    partitaDiIeri(db, carla, ieri, { [c0]: parole[c0][0] }, 30_000)
    // Dario ha cominciato e non ha scritto niente: non ha giocato.
    partitaDiIeri(db, dario, ieri, {}, TEMPO_NOMI_MS)

    const conto = contaLaNotte(db, ieri)
    expect(conto.giocatori).toBe(3)
    // Contato una volta, non si riscrive: rifarlo non cambia niente.
    const punteggi = db.sqlite.prepare('SELECT player_id, score FROM nomi_partite ORDER BY player_id').all()
    contaLaNotte(db, ieri)
    expect(db.sqlite.prepare('SELECT player_id, score FROM nomi_partite ORDER BY player_id').all()).toEqual(punteggi)

    const risultato = (await stato(chiama, anna)).ieri!
    expect(risultato.giocatori).toBe(3)
    expect(risultato.risposte[c0]?.uguali).toBe(3)
    expect(risultato.risposte[c1]?.uguali).toBe(1)
    expect(risultato.risposte[c1]!.punti).toBeGreaterThan(risultato.risposte[c0]!.punti)
    expect(risultato.piuDate[c0]?.[0]).toMatchObject({ uguali: 3 })
    const annaPunti = risultato.punti
    const carlaPunti = (await stato(chiama, carla)).ieri!.punti
    expect(annaPunti).toBeGreaterThan(carlaPunti)
    expect(carlaPunti).toBeGreaterThan(BASE_NOMI)
    expect((await stato(chiama, dario)).ieri!.punti).toBe(0)

    // Oggi: in classifica, nella generale, nel saldo della Fortuna e nella carta del giorno.
    const classifica = (await chiama<NomiLeaderboard>('GET', '/leaderboard/nomi?scope=today', anna)).dati
    expect(classifica.rows.map((r) => r.nickname)).toEqual(['anna', 'bruno', 'carla', 'dario'])
    expect(classifica.me).toMatchObject({ rank: 1, punti: annaPunti, giornate: 1, valide: 2, inAttesa: false })
    const generale = (await chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', anna)).dati
    expect(generale.me?.perGioco.nomi).toBe(annaPunti)
    expect(generale.me?.partite).toBe(1)
    expect(await puntiClassificateDi(db as unknown as D1Database, anna.id, oggi)).toBe(annaPunti)
    expect((await chiama<OggiRisposta>('GET', '/oggi', anna)).dati.nomi.ieri).toBe(annaPunti)

    // Ieri, invece, quei punti non c'erano.
    const ieriClassifica = (await chiama<NomiLeaderboard>('GET', '/leaderboard/nomi?scope=today&indietro=1', anna))
      .dati
    expect(ieriClassifica.rows).toEqual([])
  })

  it('chi ha giocato oggi aspetta i punti di stanotte: in classifica a zero, e fuori dalla generale', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('franco')
    const { categorie, parole } = paroleDel(today().puzzleNumber)
    await chiama('POST', '/nomi/inizia', io)
    await chiama('POST', '/nomi/consegna', io, { risposte: { [categorie[0]]: parole[categorie[0]][0] } })
    const classifica = (await chiama<NomiLeaderboard>('GET', '/leaderboard/nomi?scope=today', io)).dati
    expect(classifica.me).toMatchObject({ punti: 0, giornate: 0, inAttesa: true })
    const generale = (await chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', io)).dati
    expect(generale.me).toBeNull()
  })
})
