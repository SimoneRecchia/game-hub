import { describe, expect, it } from 'vitest'
import {
  PAROLE_ANAGRAMMI,
  PUNTI_FINITA_ANAGRAMMI,
  TEMPO_PAROLA_MS,
  puntiParola,
  type ParolaDelGiorno,
} from '../../shared/anagrammi'
import type {
  AnagrammiLeaderboard,
  AnagrammiProva,
  AnagrammiStato,
  GeneraleLeaderboard,
  OggiRisposta,
} from '../../shared/types'
import { puntiClassificateDi } from '../lib/generale'
import { ordinaAnagrammi, type TotaliAnagrammi } from '../lib/anagrammiStore'
import { today } from '../lib/wordleStore'
import { banco, type Giocatore } from './banco'

type Chiama = ReturnType<typeof banco>['chiama']
type Db = ReturnType<typeof banco>['db']

/** Le parole di una giornata di prova: una per lunghezza, con un anagramma che vale per la prima. */
const GIORNO: ParolaDelGiorno[] = [
  { parola: 'gatto', lettere: 'tgaot', risposte: ['gatto'], definizione: 'Felino domestico' },
  { parola: 'attore', lettere: 'toaret', risposte: ['attore', 'teatro'], definizione: 'Chi recita' },
  { parola: 'cammino', lettere: 'mocimna', risposte: ['cammino'], definizione: 'Strada da percorrere' },
  { parola: 'ombrello', lettere: 'llobmreo', risposte: ['ombrello'], definizione: 'Ripara dalla pioggia' },
  { parola: 'abitudine', lettere: 'ubitidena', risposte: ['abitudine'], definizione: 'Modo di fare ripetuto' },
]

function conLaGiornata(db: Db, numero = today().puzzleNumber) {
  db.sqlite
    .prepare('INSERT INTO anagrammi_giornate (puzzle_number, parole, created_at) VALUES (?, ?, ?)')
    .run(numero, JSON.stringify(GIORNO), new Date().toISOString())
}

/** Porta indietro l'apertura della parola aperta: come se fossero passati `ms` millisecondi. */
function indietro(db: Db, chi: Giocatore, ms: number) {
  const riga = db.sqlite.prepare('SELECT parole FROM anagrammi_partite WHERE player_id = ?').get(chi.id) as {
    parole: string
  }
  const parole = JSON.parse(riga.parole) as Array<{ a: number }>
  parole[parole.length - 1].a -= ms
  db.sqlite
    .prepare('UPDATE anagrammi_partite SET parole = ?, aperta_at = ? WHERE player_id = ?')
    .run(JSON.stringify(parole), new Date(parole[parole.length - 1].a).toISOString(), chi.id)
}

const stato = async (chiama: Chiama, chi: Giocatore) =>
  (await chiama<AnagrammiStato>('GET', '/anagrammi/state', chi)).dati

async function apri(chiama: Chiama, chi: Giocatore, s: AnagrammiStato) {
  const r = await chiama<AnagrammiStato>('POST', '/anagrammi/apri', chi, { versione: s.versione })
  expect(r.status).toBe(200)
  return r.dati
}

async function prova(chiama: Chiama, chi: Giocatore, s: AnagrammiStato, parola: string) {
  const r = await chiama<AnagrammiProva>('POST', '/anagrammi/prova', chi, { versione: s.versione, parola })
  expect(r.status).toBe(200)
  return r.dati
}

describe('la classifica degli Anagrammi', () => {
  const g = (nickname: string, punti: number, giornate: number, trovate: number, tempoMs: number): TotaliAnagrammi => ({
    playerId: nickname,
    nickname,
    displayName: nickname,
    avatarColor: '#000',
    punti,
    giornate,
    trovate,
    tempoMs,
    inCorso: giornate === 0,
  })

  it('punti prima, poi piu’ parole trovate, poi meno tempo, e chi non ha finito in fondo', () => {
    const righe = ordinaAnagrammi([
      g('lenta', 40, 1, 5, 300_000),
      g('aperta', 0, 0, 0, 0),
      g('veloce', 40, 1, 5, 120_000),
      g('poche', 40, 1, 4, 60_000),
      g('meno', 30, 1, 5, 10_000),
    ])
    expect(righe.map((r) => r.nickname)).toEqual(['veloce', 'lenta', 'poche', 'meno', 'aperta'])
  })
})

describe('la giornata degli Anagrammi, dalle API', () => {
  it('senza le parole di oggi risponde che non sono pronte', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('anna')
    const r = await chiama<{ code: string }>('GET', '/anagrammi/state', io)
    expect(r.status).toBe(503)
    expect(r.dati.code).toBe('ANAGRAMMI_ASSENTI')
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.anagrammi).toMatchObject({ pronta: false })
  })

  it('guardare non apre niente, e le lettere arrivano solo aprendo la parola', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    const vuoto = await stato(chiama, io)
    expect(vuoto.parole.map((p) => p.lunghezza)).toEqual([5, 6, 7, 8, 9])
    expect(vuoto.parole.every((p) => p.lettere === null && p.parola === null && p.definizione === null)).toBe(true)
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM anagrammi_partite').get()?.n).toBe(0)

    const aperta = await apri(chiama, io, vuoto)
    expect(aperta.corrente).toBe(0)
    expect(aperta.parole[0].lettere).toBe('tgaot')
    expect(aperta.parole[0].parola).toBeNull()
    expect(aperta.parole[1].lettere).toBeNull()
    expect(aperta.restanteMs).toBeGreaterThan(TEMPO_PAROLA_MS - 2_000)
    // La risposta della parola aperta non esce: nemmeno nel JSON.
    expect(JSON.stringify(aperta)).not.toContain('gatto')
    // Un doppio tocco riprende la parola aperta, non ne apre un'altra.
    const ancora = await apri(chiama, io, aperta)
    expect(ancora.corrente).toBe(0)
  })

  it('una risposta sbagliata non si scrive, una giusta chiude la parola con i suoi punti', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    const aperta = await apri(chiama, io, await stato(chiama, io))
    const sbagliata = await prova(chiama, io, aperta, 'tagot')
    expect(sbagliata.giusta).toBe(false)
    expect(sbagliata.versione).toBe(aperta.versione)
    expect(sbagliata.corrente).toBe(0)

    const giusta = await prova(chiama, io, sbagliata, 'GATTO')
    expect(giusta.giusta).toBe(true)
    expect(giusta.corrente).toBeNull()
    expect(giusta.parole[0]).toMatchObject({ esito: 'trovata', parola: 'gatto', definizione: 'Felino domestico' })
    expect(giusta.parole[0].punti).toBe(puntiParola(5, giusta.parole[0].ms!, false))
    expect(giusta.parole[0].punti).toBe(10)
  })

  it('vale un’altra parola con le stesse lettere, e la si ricorda', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await apri(chiama, io, await stato(chiama, io))
    s = await prova(chiama, io, s, 'gatto')
    s = await apri(chiama, io, s)
    const r = await prova(chiama, io, s, 'teatro')
    expect(r.giusta).toBe(true)
    expect(r.parole[1]).toMatchObject({ esito: 'trovata', parola: 'attore', risposta: 'teatro' })
  })

  it('l’aiuto mostra la definizione e costa i suoi punti; "Passo" lascia la parola', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await apri(chiama, io, await stato(chiama, io))
    s = (await chiama<AnagrammiStato>('POST', '/anagrammi/aiuto', io, { versione: s.versione })).dati
    expect(s.parole[0]).toMatchObject({ aiuto: true, definizione: 'Felino domestico', parola: null })
    const trovata = await prova(chiama, io, s, 'gatto')
    expect(trovata.parole[0].punti).toBe(puntiParola(5, trovata.parole[0].ms!, true))
    expect(trovata.parole[0].punti).toBe(7)

    s = await apri(chiama, io, trovata)
    s = (await chiama<AnagrammiStato>('POST', '/anagrammi/passo', io, { versione: s.versione })).dati
    expect(s.parole[1]).toMatchObject({ esito: 'passata', parola: 'attore', punti: 0 })
    expect(s.corrente).toBeNull()
  })

  it('una parola rimasta aperta oltre il tempo e’ persa, e una risposta tardi non vale', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    const s = await apri(chiama, io, await stato(chiama, io))
    indietro(db, io, TEMPO_PAROLA_MS + 10_000)
    const tardi = await prova(chiama, io, s, 'gatto')
    expect(tardi.giusta).toBe(false)
    expect(tardi.parole[0]).toMatchObject({ esito: 'persa', parola: 'gatto', punti: 0 })
    expect(tardi.corrente).toBeNull()
  })

  it('a giornata finita i punti vanno in classifica, nella generale e nel saldo della Fortuna', async () => {
    const { chiama, giocatore, db } = banco()
    conLaGiornata(db)
    const io = await giocatore('anna')
    let s = await stato(chiama, io)
    for (let k = 0; k < PAROLE_ANAGRAMMI; k += 1) {
      s = await apri(chiama, io, s)
      s =
        k === 4
          ? (await chiama<AnagrammiStato>('POST', '/anagrammi/passo', io, { versione: s.versione })).dati
          : await prova(chiama, io, s, GIORNO[k].parola)
    }
    expect(s.status).toBe('done')
    const attesi = PUNTI_FINITA_ANAGRAMMI + s.parole.reduce((t, p) => t + p.punti, 0)
    expect(s.punti).toBe(attesi)
    expect(s.punti).toBe(PUNTI_FINITA_ANAGRAMMI + 4 * 10)
    const r = await chiama<{ code: string }>('POST', '/anagrammi/apri', io, { versione: s.versione })
    expect(r.status).toBe(409)

    const classifica = (await chiama<AnagrammiLeaderboard>('GET', '/leaderboard/anagrammi?scope=today', io)).dati
    expect(classifica.me).toMatchObject({ punti: attesi, giornate: 1, trovate: 4 })
    const generale = (await chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', io)).dati
    expect(generale.me?.perGioco.anagrammi).toBe(attesi)
    expect(await puntiClassificateDi(db as unknown as D1Database, io.id, today().puzzleNumber)).toBe(attesi)
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.anagrammi).toMatchObject({
      status: 'done',
      trovate: 4,
      giocate: 5,
      punti: attesi,
    })
  })
})
