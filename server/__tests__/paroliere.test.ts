import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Dawg } from '../../shared/dawg'
import { TEMPO_PAROLIERE_MS, paroleDellaGriglia, puntiParoliere } from '../../shared/paroliere'
import type {
  GeneraleLeaderboard,
  OggiRisposta,
  ParoliereLeaderboard,
  ParoliereParola,
  ParoliereStato,
} from '../../shared/types'
import { puntiClassificateDi } from '../lib/generale'
import { ordinaParoliere, type TotaliParoliere } from '../lib/paroliereStore'
import { today } from '../lib/wordleStore'
import { banco, type Giocatore } from './banco'

type Chiama = ReturnType<typeof banco>['chiama']
type Db = ReturnType<typeof banco>['db']

const comuni = Dawg.da(readFileSync(join(__dirname, '..', '..', 'public', 'scarabeo', 'dizionario.dawg'))).comuni()

/** GATO / ROSE / ALMA / QUNTI, con la "qu" in basso a sinistra. */
const GRIGLIA = ['g', 'a', 't', 'o', 'r', 'o', 's', 'e', 'a', 'l', 'm', 'a', 'qu', 'n', 't', 'i']
const TRAGUARDO = 20

function conLaGiornata(db: Db, numero = today().puzzleNumber) {
  db.sqlite
    .prepare(
      'INSERT INTO paroliere_giornate (puzzle_number, griglia, comuni, traguardo, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(
      numero,
      JSON.stringify(GRIGLIA),
      JSON.stringify(paroleDellaGriglia(GRIGLIA, comuni)),
      TRAGUARDO,
      new Date().toISOString(),
    )
}

const stato = async (chiama: Chiama, chi: Giocatore) =>
  (await chiama<ParoliereStato>('GET', '/paroliere/state', chi)).dati

async function parola(chiama: Chiama, chi: Giocatore, testo: string) {
  const r = await chiama<ParoliereParola>('POST', '/paroliere/parola', chi, { parola: testo })
  expect(r.status).toBe(200)
  return r.dati
}

describe('la classifica del Paroliere', () => {
  const g = (nickname: string, punti: number, giornate: number, punteggio: number, trovate: number) =>
    ({
      playerId: nickname,
      nickname,
      displayName: nickname,
      avatarColor: '#000',
      punti,
      giornate,
      punteggio,
      trovate,
      inCorso: giornate === 0,
    }) satisfies TotaliParoliere

  it('punti prima, poi il punteggio delle griglie oltre il traguardo, poi le parole, e chi gioca ancora in fondo', () => {
    const righe = ordinaParoliere([
      g('poche', 60, 1, 70, 30),
      g('aperta', 0, 0, 0, 0),
      g('oltre', 60, 1, 90, 40),
      g('molte', 60, 1, 70, 45),
      g('meno', 40, 1, 20, 20),
    ])
    expect(righe.map((r) => r.nickname)).toEqual(['oltre', 'molte', 'poche', 'meno', 'aperta'])
  })
})

describe('il Paroliere del giorno, dalle API', () => {
  it('senza la griglia di oggi risponde che non e’ pronta', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('anna')
    const r = await chiama<{ code: string }>('GET', '/paroliere/state', io)
    expect(r.status).toBe(503)
    expect(r.dati.code).toBe('PAROLIERE_ASSENTE')
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.paroliere).toMatchObject({ pronta: false })
  })

  it('la griglia non esce finché non si gira la clessidra, e da li’ partono i tre minuti', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    const prima = await stato(chiama, io)
    expect(prima).toMatchObject({ status: 'new', griglia: null, comuni: null, traguardo: TRAGUARDO })
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM paroliere_partite').get()?.n).toBe(0)
    const r = await chiama<ParoliereStato>('POST', '/paroliere/inizia', io)
    expect(r.dati).toMatchObject({ status: 'playing', griglia: GRIGLIA, comuni: null })
    expect(r.dati.restanteMs).toBeGreaterThan(TEMPO_PAROLIERE_MS - 2_000)
    // Girarla di nuovo non fa ripartire il tempo.
    const ancora = await chiama<ParoliereStato>('POST', '/paroliere/inizia', io)
    expect(ancora.dati.restanteMs).toBeLessThanOrEqual(r.dati.restanteMs!)
  })

  it('una parola vale se sta sulla griglia, nel dizionario, ed e’ nuova', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    await chiama('POST', '/paroliere/inizia', io)
    expect(await parola(chiama, io, 'QUANTI')).toMatchObject({ esito: 'nuova', valore: 3, punteggio: 3 })
    expect(await parola(chiama, io, 'quanti')).toMatchObject({ esito: 'gia', valore: 0, punteggio: 3 })
    expect(await parola(chiama, io, 'ma')).toMatchObject({ esito: 'corta' })
    expect(await parola(chiama, io, 'gatto')).toMatchObject({ esito: 'griglia' })
    expect(await parola(chiama, io, 'rosr')).toMatchObject({ esito: 'griglia' })
    expect(await parola(chiama, io, 'gosa')).toMatchObject({ esito: 'sconosciuta' })
    const rosa = await parola(chiama, io, 'rosa')
    expect(rosa).toMatchObject({ esito: 'nuova', valore: 1, trovate: ['quanti', 'rosa'], punteggio: 4 })
    expect(rosa.punti).toBe(puntiParoliere(4, TRAGUARDO))
  })

  it('a tempo finito non vale piu’ niente, e i punti vanno in classifica, nella generale e nel saldo', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    await chiama('POST', '/paroliere/inizia', io)
    await parola(chiama, io, 'quanti')
    await parola(chiama, io, 'rosa')
    db.sqlite
      .prepare('UPDATE paroliere_partite SET iniziata_at = ? WHERE player_id = ?')
      .run(new Date(Date.now() - TEMPO_PAROLIERE_MS - 10_000).toISOString(), io.id)
    const tardi = await parola(chiama, io, 'gola')
    expect(tardi).toMatchObject({ esito: 'tempo', status: 'done', trovate: ['quanti', 'rosa'] })
    const attesi = puntiParoliere(4, TRAGUARDO)
    expect(tardi.punti).toBe(attesi)
    expect(tardi.comuni).toEqual(expect.arrayContaining(['rosa', 'gola']))

    const classifica = (await chiama<ParoliereLeaderboard>('GET', '/leaderboard/paroliere?scope=today', io)).dati
    expect(classifica.me).toMatchObject({ punti: attesi, giornate: 1, punteggio: 4, trovate: 2 })
    const generale = (await chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', io)).dati
    expect(generale.me?.perGioco.paroliere).toBe(attesi)
    expect(await puntiClassificateDi(db as unknown as D1Database, io.id, today().puzzleNumber)).toBe(attesi)
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.paroliere).toMatchObject({
      status: 'done',
      trovate: 2,
      punti: attesi,
    })
  })

  it('"Basta" chiude la partita prima del tempo, con le parole trovate', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    await chiama('POST', '/paroliere/inizia', io)
    await parola(chiama, io, 'quanti')
    const r = await chiama<ParoliereStato>('POST', '/paroliere/fine', io)
    expect(r.dati).toMatchObject({ status: 'done', trovate: ['quanti'], punti: puntiParoliere(3, TRAGUARDO) })
    expect(r.dati.comuni?.length).toBeGreaterThan(5)
  })
})
