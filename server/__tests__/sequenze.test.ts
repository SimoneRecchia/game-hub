import { describe, expect, it } from 'vitest'
import { SEQUENZE_SFIDA_FERMA_MS, SEQUENZE_SFIDA_VIA_MS } from '../../shared/config'
import {
  MASSIMO_SEQUENZE,
  PRIMA_LUNGHEZZA,
  PUNTI_FINITA_SEQUENZE,
  SEQUENZE_PER_TURNO,
  TURNI_SEQUENZE,
  giornataDaTesto,
} from '../../shared/sequenze'
import type {
  GeneraleLeaderboard,
  InvitoConLink,
  MossaSfidaSequenze,
  OggiRisposta,
  PresenzaRisposta,
  SalaSequenze,
  SequenzeLeaderboard,
  SequenzeMossa,
  SequenzeStato,
  VistaSfidaSequenze,
} from '../../shared/types'
import { puntiClassificateDi } from '../lib/generale'
import { ordinaSequenze, type TotaliSequenze } from '../lib/sequenzeStore'
import { today } from '../lib/wordleStore'
import { banco, type Giocatore } from './banco'

type Banco = ReturnType<typeof banco>
type Chiama = Banco['chiama']

const stato = async (chiama: Chiama, chi: Giocatore) =>
  (await chiama<SequenzeStato>('GET', '/sequenze/state', chi)).dati

async function turno(chiama: Chiama, chi: Giocatore, s: SequenzeStato) {
  const r = await chiama<SequenzeMossa>('POST', '/sequenze/turno', chi, { versione: s.versione })
  expect(r.status).toBe(200)
  return r.dati
}

async function risposta(chiama: Chiama, chi: Giocatore, s: SequenzeStato, tocchi: number[]) {
  const r = await chiama<SequenzeMossa>('POST', '/sequenze/risposta', chi, { versione: s.versione, tocchi })
  expect(r.status).toBe(200)
  return r.dati
}

/** Una risposta sbagliata alla sequenza data: il primo cubetto giusto, poi uno che non c'entra. */
function sbagliata(sequenza: number[]): number[] {
  const altro = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((c) => c !== sequenza[1])!
  return [sequenza[0], altro]
}

/** Gioca un turno ripetendo giuste le prime `giuste` sequenze, e sbagliando la seguente se ce n'e' una. */
async function giocaTurno(chiama: Chiama, chi: Giocatore, s: SequenzeStato, giuste: number) {
  let m = await turno(chiama, chi, s)
  for (let k = 0; k < giuste; k += 1) {
    expect(m.sequenza).toHaveLength(PRIMA_LUNGHEZZA + k)
    m = await risposta(chiama, chi, m, m.sequenza!)
    expect(m.giusta).toBe(true)
  }
  if (giuste < SEQUENZE_PER_TURNO) {
    m = await risposta(chiama, chi, m, sbagliata(m.sequenza!))
    expect(m.giusta).toBe(false)
  }
  expect(m.sequenza).toBeNull()
  return m
}

describe('la classifica delle Sequenze', () => {
  const g = (nickname: string, punti: number, giornate: number, migliore: number, tempoMs: number): TotaliSequenze => ({
    playerId: nickname,
    nickname,
    displayName: nickname,
    avatarColor: '#000',
    punti,
    giornate,
    migliore,
    tempoMs,
    inCorso: giornate === 0,
  })

  it('punti prima, poi la sequenza piu’ lunga, poi meno tempo, e chi non ha finito in fondo', () => {
    const righe = ordinaSequenze([
      g('lenta', 40, 1, 8, 300_000),
      g('aperta', 0, 0, 0, 0),
      g('veloce', 40, 1, 8, 120_000),
      g('corta', 40, 1, 7, 60_000),
      g('meno', 30, 1, 9, 10_000),
    ])
    expect(righe.map((r) => r.nickname)).toEqual(['veloce', 'lenta', 'corta', 'meno', 'aperta'])
  })
})

describe('la giornata delle Sequenze, dalle API', () => {
  it('guardare non apre niente; il primo turno manda una sequenza di tre, e fissa la giornata per tutti', async () => {
    const { chiama, giocatore, db } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const vuoto = await stato(chiama, anna)
    expect(vuoto).toMatchObject({ turni: [], corrente: null, punti: 0, totaleTurni: TURNI_SEQUENZE })
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM sequenze_partite').get()?.n).toBe(0)
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM sequenze_giornate').get()?.n).toBe(0)

    const sua = await turno(chiama, anna, vuoto)
    expect(sua.sequenza).toHaveLength(PRIMA_LUNGHEZZA)
    expect(sua.corrente).toBe(0)
    const mia = await turno(chiama, bruno, await stato(chiama, bruno))
    expect(mia.sequenza).toEqual(sua.sequenza)
    const salvata = db.sqlite.prepare('SELECT sequenze FROM sequenze_giornate').get() as { sequenze: string }
    expect(giornataDaTesto(salvata.sequenze)?.[0][0]).toEqual(sua.sequenza)
    // Lo stato non porta mai la sequenza.
    expect(JSON.stringify(await stato(chiama, bruno))).not.toContain('sequenza')
  })

  it('un turno cresce di un cubetto a ogni giusta, e il primo errore lo chiude', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('anna')
    let m = await turno(chiama, io, await stato(chiama, io))
    m = await risposta(chiama, io, m, m.sequenza!)
    expect(m).toMatchObject({ giusta: true, corrente: 0 })
    expect(m.sequenza).toHaveLength(PRIMA_LUNGHEZZA + 1)
    m = await risposta(chiama, io, m, sbagliata(m.sequenza!))
    expect(m).toMatchObject({ giusta: false, sequenza: null, corrente: null, punti: 1 })
    expect(m.turni[0]).toMatchObject({ giuste: 1, raggiunta: PRIMA_LUNGHEZZA, chiuso: true, riaperto: false })
    // Una risposta senza sequenza aperta, o con una versione vecchia, non vale.
    const r = await chiama<{ code: string }>('POST', '/sequenze/risposta', io, { versione: m.versione, tocchi: [0] })
    expect(r.dati.code).toBe('NESSUNA_SEQUENZA')
  })

  it('un doppio tocco non risponde due volte, e un turno aperto non si ricomincia', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('anna')
    const aperto = await turno(chiama, io, await stato(chiama, io))
    const ancora = await chiama<{ code: string }>('POST', '/sequenze/turno', io, { versione: aperto.versione })
    expect(ancora.dati.code).toBe('TURNO_APERTO')
    const prima = await risposta(chiama, io, aperto, aperto.sequenza!)
    const doppia = await chiama<{ code: string }>('POST', '/sequenze/risposta', io, {
      versione: aperto.versione,
      tocchi: aperto.sequenza,
    })
    expect(doppia.status).toBe(409)
    expect(doppia.dati.code).toBe('CONFLITTO')
    expect((await stato(chiama, io)).turni[0].giuste).toBe(prima.turni[0].giuste)
  })

  it('una sequenza si vede una volta: riaprendo la pagina il turno conta chiuso', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('anna')
    let m = await turno(chiama, io, await stato(chiama, io))
    m = await risposta(chiama, io, m, m.sequenza!)
    const riaperta = await stato(chiama, io)
    expect(riaperta.corrente).toBeNull()
    expect(riaperta.turni[0]).toMatchObject({ giuste: 1, chiuso: true, riaperto: true })
    const tardi = await chiama<{ code: string }>('POST', '/sequenze/risposta', io, {
      versione: riaperta.versione,
      tocchi: m.sequenza,
    })
    expect(tardi.dati.code).toBe('NESSUNA_SEQUENZA')
  })

  it('cinque turni fanno la giornata: i punti vanno in classifica, nella generale e nel saldo della Fortuna', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('anna')
    const giuste = [SEQUENZE_PER_TURNO, 3, 0, 4, 2]
    let s: SequenzeStato = await stato(chiama, io)
    for (const g of giuste) s = await giocaTurno(chiama, io, s, g)
    expect(s.status).toBe('done')
    const attesi = PUNTI_FINITA_SEQUENZE + giuste.reduce((a, b) => a + b, 0)
    expect(s.punti).toBe(attesi)
    const altro = await chiama<{ code: string }>('POST', '/sequenze/turno', io, { versione: s.versione })
    expect(altro.dati.code).toBe('GIORNATA_FINITA')

    const classifica = (await chiama<SequenzeLeaderboard>('GET', '/leaderboard/sequenze?scope=today', io)).dati
    expect(classifica.me).toMatchObject({ punti: attesi, giornate: 1, migliore: PRIMA_LUNGHEZZA - 1 + 7 })
    const generale = (await chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', io)).dati
    expect(generale.me?.perGioco.sequenze).toBe(attesi)
    expect(await puntiClassificateDi(db as unknown as D1Database, io.id, today().puzzleNumber)).toBe(attesi)
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.sequenze).toMatchObject({
      status: 'done',
      giocati: TURNI_SEQUENZE,
      migliore: 9,
      punti: attesi,
    })
  })

  it('tutti giusti fino a nove in ogni turno fanno il tetto', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('anna')
    let s: SequenzeStato = await stato(chiama, io)
    for (let t = 0; t < TURNI_SEQUENZE; t += 1) s = await giocaTurno(chiama, io, s, SEQUENZE_PER_TURNO)
    expect(s.punti).toBe(MASSIMO_SEQUENZE)
  })

  it('una giornata cominciata e’ "in corso" in classifica, a zero', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('anna')
    await giocaTurno(chiama, io, await stato(chiama, io), 2)
    const classifica = (await chiama<SequenzeLeaderboard>('GET', '/leaderboard/sequenze?scope=today', io)).dati
    expect(classifica.me).toMatchObject({ punti: 0, giornate: 0, inCorso: true })
  })
})

/* ─────────────────────────────  La sfida fra amici  ───────────────────────────── */

/** Porta indietro gli orologi della sfida: come se fossero passati `ms` millisecondi. */
function passano(db: Banco['db'], id: string, ms: number) {
  for (const colonna of ['inizio_at', 'aperta_a', 'aperta_b', 'created_at', 'updated_at']) {
    const prima = db.sqlite.prepare(`SELECT ${colonna} AS t FROM sequenze_sfide WHERE id = ?`).get(id)?.t
    if (!prima) continue
    const dopo = new Date(Date.parse(String(prima)) - ms).toISOString()
    db.sqlite.prepare(`UPDATE sequenze_sfide SET ${colonna} = ? WHERE id = ?`).run(dopo, id)
  }
}

async function online(chiama: Chiama, ...chi: Giocatore[]) {
  for (const g of chi) await chiama('POST', '/presenza', g, { attivita: 'sequenze' })
}

/** Anna sfida Bruno, che accetta, e il via passa. */
async function sfidaCominciata(b: Banco, anna: Giocatore, bruno: Giocatore): Promise<string> {
  await online(b.chiama, anna, bruno)
  const invito = await b.chiama<{ id: string }>('POST', '/sequenze/sfide', anna, { playerId: bruno.id })
  expect(invito.status).toBe(201)
  const arrivati = (await b.chiama<PresenzaRisposta>('POST', '/presenza', bruno, { attivita: 'hub' })).dati
  expect(arrivati.sequenze.map((i) => i.da.nickname)).toEqual(['anna'])
  expect((await b.chiama('POST', `/sequenze/sfide/${invito.dati.id}/accetta`, bruno)).status).toBe(200)
  const prima = (await b.chiama<VistaSfidaSequenze>('GET', `/sequenze/sfide/${invito.dati.id}`, anna)).dati
  expect(prima.inizioTraMs).toBeGreaterThan(0)
  expect(prima.inizioTraMs).toBeLessThanOrEqual(SEQUENZE_SFIDA_VIA_MS)
  passano(b.db, invito.dati.id, SEQUENZE_SFIDA_VIA_MS)
  return invito.dati.id
}

async function apri(chiama: Chiama, chi: Giocatore, id: string, livello: number) {
  const r = await chiama<MossaSfidaSequenze>('POST', `/sequenze/sfide/${id}/apri`, chi, { livello })
  expect(r.status).toBe(200)
  return r.dati
}

async function rispondi(chiama: Chiama, chi: Giocatore, id: string, livello: number, tocchi: number[]) {
  const r = await chiama<MossaSfidaSequenze>('POST', `/sequenze/sfide/${id}/risposta`, chi, { livello, tocchi })
  expect(r.status).toBe(200)
  return r.dati
}

/** Ripete giuste `giuste` sequenze e poi sbaglia, se `sbaglia`: com'e' la sfida dopo. */
async function arrivaA(chiama: Chiama, chi: Giocatore, id: string, giuste: number, sbaglia = true) {
  let m = await apri(chiama, chi, id, 0)
  for (let k = 0; k < giuste; k += 1) m = await rispondi(chiama, chi, id, k, m.sequenza!)
  if (sbaglia && m.sequenza) m = await rispondi(chiama, chi, id, giuste, sbagliata(m.sequenza))
  return m
}

describe('la sfida a Sequenze fra amici', () => {
  it('le sequenze sono le stesse per tutti e due, e vanno oltre i nove cubetti', async () => {
    const b = banco()
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    const id = await sfidaCominciata(b, anna, bruno)
    const sua = await apri(b.chiama, anna, id, 0)
    const mia = await apri(b.chiama, bruno, id, 0)
    expect(sua.sequenza).toHaveLength(PRIMA_LUNGHEZZA)
    expect(mia.sequenza).toEqual(sua.sequenza)
    // Il seme non esce: ne' nella vista ne' nella mossa.
    expect(JSON.stringify(sua)).not.toContain('seme')

    let m = sua
    for (let k = 0; k < 9; k += 1) m = await rispondi(b.chiama, anna, id, k, m.sequenza!)
    expect(m.sequenza).toHaveLength(PRIMA_LUNGHEZZA + 9)
    expect(m.mie).toMatchObject({ giuste: 9, finito: false, aperta: true })
    const vista = (await b.chiama<VistaSfidaSequenze>('GET', `/sequenze/sfide/${id}`, bruno)).dati
    expect(vista.sue).toEqual({ giuste: 9, finito: false })
    const presenza = (await b.chiama<PresenzaRisposta>('POST', '/presenza', bruno, { attivita: 'sequenze' })).dati
    expect(presenza.partitaSequenze).toMatchObject({ id, avversario: { nickname: 'anna' } })
  })

  it('vince chi arriva piu’ lontano, e la sfida si chiude appena lo ha superato', async () => {
    const b = banco()
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    const id = await sfidaCominciata(b, anna, bruno)
    const finitaBruno = await arrivaA(b.chiama, bruno, id, 2)
    expect(finitaBruno.mie).toMatchObject({ giuste: 2, finito: true, aperta: false })
    expect(finitaBruno.stato).toBe('in_corso')

    let m = await apri(b.chiama, anna, id, 0)
    m = await rispondi(b.chiama, anna, id, 0, m.sequenza!)
    m = await rispondi(b.chiama, anna, id, 1, m.sequenza!)
    expect(m.stato).toBe('in_corso')
    m = await rispondi(b.chiama, anna, id, 2, m.sequenza!)
    expect(m).toMatchObject({ stato: 'finita', vincitore: 'io', sequenza: null, giusta: true })
    expect(m.serie).toEqual({ mie: 1, sue: 0, partite: 1 })
    const sua = (await b.chiama<VistaSfidaSequenze>('GET', `/sequenze/sfide/${id}`, bruno)).dati
    expect(sua).toMatchObject({ vincitore: 'avversario', mie: { giuste: 2 }, sue: { giuste: 3, finito: true } })
  })

  it('allo stesso livello e’ pari; chi chiede due volte la stessa sequenza ha finito', async () => {
    const b = banco()
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    const id = await sfidaCominciata(b, anna, bruno)
    await arrivaA(b.chiama, anna, id, 1)
    const m = await apri(b.chiama, bruno, id, 0)
    await rispondi(b.chiama, bruno, id, 0, m.sequenza!)
    // La pagina si e' riaperta: la sequenza era gia' uscita, e chiederla di nuovo costa la partita.
    const riaperta = await apri(b.chiama, bruno, id, 1)
    expect(riaperta).toMatchObject({ sequenza: null, giusta: false, stato: 'finita', vincitore: 'pari' })
  })

  it('un doppio tocco non risponde due volte', async () => {
    const b = banco()
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    const id = await sfidaCominciata(b, anna, bruno)
    const m = await apri(b.chiama, anna, id, 0)
    await rispondi(b.chiama, anna, id, 0, m.sequenza!)
    const doppia = await b.chiama<{ code: string }>('POST', `/sequenze/sfide/${id}/risposta`, anna, {
      livello: 0,
      tocchi: m.sequenza,
    })
    expect(doppia.status).toBe(409)
    expect(doppia.dati.code).toBe('MOSSA_VECCHIA')
  })

  it('prima del via non si gioca, e chi resta fermo troppo a lungo ha finito', async () => {
    const b = banco()
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    await online(b.chiama, anna, bruno)
    const invito = await b.chiama<{ id: string }>('POST', '/sequenze/sfide', anna, { playerId: bruno.id })
    await b.chiama('POST', `/sequenze/sfide/${invito.dati.id}/accetta`, bruno)
    const presto = await b.chiama<{ code: string }>('POST', `/sequenze/sfide/${invito.dati.id}/apri`, anna, {
      livello: 0,
    })
    expect(presto.dati.code).toBe('NON_COMINCIATA')
    passano(b.db, invito.dati.id, SEQUENZE_SFIDA_VIA_MS)

    const id = invito.dati.id
    const m = await apri(b.chiama, anna, id, 0)
    await rispondi(b.chiama, anna, id, 0, m.sequenza!)
    // Bruno non ha mai cominciato, e Anna ha chiuso l'app: passato il tempo, hanno finito tutti e due.
    passano(b.db, id, SEQUENZE_SFIDA_FERMA_MS + 1_000)
    const vista = (await b.chiama<VistaSfidaSequenze>('GET', `/sequenze/sfide/${id}`, bruno)).dati
    expect(vista).toMatchObject({ stato: 'finita', vincitore: 'avversario', sue: { giuste: 1 } })
  })

  it('la rivincita porta avanti la serie, e il link apre la sfida a chi lo riceve', async () => {
    const b = banco()
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    const id = await sfidaCominciata(b, anna, bruno)
    await arrivaA(b.chiama, bruno, id, 0)
    await arrivaA(b.chiama, anna, id, 1, false)
    const chiesta = await b.chiama<{ invitoId: string }>('POST', `/sequenze/sfide/${id}/rivincita`, bruno)
    expect(chiesta.status).toBe(201)
    const accettata = await b.chiama<{ partitaId: string }>('POST', `/sequenze/sfide/${id}/rivincita`, anna)
    expect(accettata.dati.partitaId).toBe(chiesta.dati.invitoId)
    const nuova = (await b.chiama<VistaSfidaSequenze>('GET', `/sequenze/sfide/${accettata.dati.partitaId}`, anna))
      .dati
    expect(nuova.serie).toEqual({ mie: 1, sue: 0, partite: 1 })

    const carla = await b.giocatore('carla')
    const link = await b.chiama<{ codice: string }>('POST', '/sequenze/sfide', carla, {})
    expect(link.dati.codice).toBeTruthy()
    const pubblico = (await b.chiama<InvitoConLink>('GET', `/inviti/${link.dati.codice}`, null)).dati
    expect(pubblico).toMatchObject({ gioco: 'sequenze', stato: 'attesa', da: { nickname: 'carla' } })
    const dario = await b.giocatore('dario')
    const aperta = await b.chiama<{ partitaId: string }>(
      'POST',
      `/sequenze/sfide/link/${link.dati.codice}/accetta`,
      dario,
    )
    expect(aperta.status).toBe(200)
    const sala = (await b.chiama<SalaSequenze>('GET', '/sequenze/sfide/sala', carla)).dati
    expect(sala.partita).toMatchObject({ id: aperta.dati.partitaId, avversario: { nickname: 'dario' } })
    expect(sala.invito).toMatchObject({ stato: 'accettato', partitaId: aperta.dati.partitaId })
  })
})
