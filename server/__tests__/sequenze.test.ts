import { describe, expect, it } from 'vitest'
import { SEQUENZE_SFIDA_FERMA_MS, SEQUENZE_SFIDA_VIA_MS } from '../../shared/config'
import { PRIMA_LUNGHEZZA } from '../../shared/sequenze'
import type {
  GeneraleLeaderboard,
  InvitoConLink,
  MossaSfidaSequenze,
  OggiRisposta,
  PresenzaRisposta,
  SalaSequenze,
  VistaSfidaSequenze,
} from '../../shared/types'
import { puntiClassificateDi } from '../lib/generale'
import { today } from '../lib/wordleStore'
import { banco, type Giocatore } from './banco'

type Banco = ReturnType<typeof banco>
type Chiama = Banco['chiama']

/** Una risposta sbagliata alla sequenza data: il primo cubetto giusto, poi uno che non c'entra. */
function sbagliata(sequenza: number[]): number[] {
  const altro = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((c) => c !== sequenza[1])!
  return [sequenza[0], altro]
}

/**
 * La classificata delle Sequenze c'e' stata fino al 15 ottobre 2026: le
 * giornate di allora restano nella generale, in una colonna a parte, e le rotte
 * della giornata non ci sono piu'.
 */
describe('le Sequenze senza classificata', () => {
  it('le giornate di allora restano nella generale e nel saldo, e la giornata non si gioca piu’', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('anna')
    const n = today().puzzleNumber
    const adesso = new Date().toISOString()
    db.sqlite
      .prepare(
        `INSERT INTO sequenze_partite
           (id, player_id, puzzle_number, date, status, giuste, migliore, tempo_ms, score, started_at, updated_at)
         VALUES ('s1', ?, ?, 'x', 'done', 18, 8, 120000, 66, ?, ?)`,
      )
      .run(io.id, n, adesso, adesso)
    const generale = (await chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', io)).dati
    expect(generale.me).toMatchObject({ punti: 66, sequenze: 66, partite: 1 })
    expect(Object.keys(generale.me!.perGioco)).not.toContain('sequenze')
    expect(await puntiClassificateDi(db as unknown as D1Database, io.id, n)).toBe(66)

    expect((await chiama('GET', '/sequenze/state', io)).status).toBe(404)
    expect((await chiama('POST', '/sequenze/turno', io, { versione: 0 })).status).toBe(404)
    expect((await chiama('GET', '/leaderboard/sequenze?scope=today', io)).status).toBe(404)
    expect(Object.keys((await chiama<OggiRisposta>('GET', '/oggi', io)).dati)).not.toContain('sequenze')
  })
})

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

  it('il livello lo sceglie chi sfida: il facile parte da due, il difficile si tocca al contrario', async () => {
    const b = banco()
    const [anna, bruno, carla] = [await b.giocatore('anna'), await b.giocatore('bruno'), await b.giocatore('carla')]
    await online(b.chiama, anna, bruno)
    const invito = await b.chiama<{ id: string }>('POST', '/sequenze/sfide', anna, {
      playerId: bruno.id,
      impostazioni: { livello: 'difficile' },
    })
    await b.chiama('POST', `/sequenze/sfide/${invito.dati.id}/accetta`, bruno)
    const id = invito.dati.id
    passano(b.db, id, SEQUENZE_SFIDA_VIA_MS)
    expect((await b.chiama<VistaSfidaSequenze>('GET', `/sequenze/sfide/${id}`, bruno)).dati.livello).toBe('difficile')
    const m = await apri(b.chiama, anna, id, 0)
    expect(m.sequenza).toHaveLength(PRIMA_LUNGHEZZA)
    // Nell'ordine dei lampi e' sbagliata; al contrario e' giusta.
    const giusta = await rispondi(b.chiama, anna, id, 0, [...m.sequenza!].reverse())
    expect(giusta.giusta).toBe(true)
    const n = await apri(b.chiama, bruno, id, 0)
    expect((await rispondi(b.chiama, bruno, id, 0, n.sequenza!)).giusta).toBe(false)

    // Anna e' gia' piu' avanti di Bruno, che ha finito: la sfida e' chiusa. La rivincita resta al contrario.
    expect((await b.chiama<VistaSfidaSequenze>('GET', `/sequenze/sfide/${id}`, anna)).dati.vincitore).toBe('io')
    await online(b.chiama, anna, bruno)
    const chiesta = await b.chiama<{ invitoId: string }>('POST', `/sequenze/sfide/${id}/rivincita`, bruno)
    await b.chiama('POST', `/sequenze/sfide/${id}/rivincita`, anna)
    const nuova = (await b.chiama<VistaSfidaSequenze>('GET', `/sequenze/sfide/${chiesta.dati.invitoId}`, anna)).dati
    expect(nuova.livello).toBe('difficile')

    // Il facile parte da due; un livello che non c'e' e' il normale.
    const facile = await b.chiama<{ codice: string; id: string }>('POST', '/sequenze/sfide', carla, {
      impostazioni: { livello: 'facile' },
    })
    const dario = await b.giocatore('dario')
    await b.chiama('POST', `/sequenze/sfide/link/${facile.dati.codice}/accetta`, dario)
    passano(b.db, facile.dati.id, SEQUENZE_SFIDA_VIA_MS)
    expect((await apri(b.chiama, dario, facile.dati.id, 0)).sequenza).toHaveLength(2)
    const elio = await b.giocatore('elio')
    const strano = await b.chiama<{ id: string }>('POST', '/sequenze/sfide', elio, { impostazioni: { livello: 'x' } })
    expect(b.db.sqlite.prepare('SELECT livello FROM sequenze_sfide WHERE id = ?').get(strano.dati.id)?.livello).toBe(
      'normale',
    )
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
