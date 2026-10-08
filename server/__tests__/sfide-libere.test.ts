import { describe, expect, it } from 'vitest'
import { SFIDE_LIBERE_VIA_MS } from '../../shared/config'
import {
  MARGINE_SFIDA_LIBERA_MS,
  PREDEFINITE,
  durataMassimaMs,
  impostazioniValide,
  vincitoreSfida,
} from '../../shared/sfide-libere'
import type { InvitoConLink, PresenzaRisposta, SalaSfidaLibera, VistaSfidaLibera } from '../../shared/types'
import { banco, type Giocatore } from './banco'

type Banco = ReturnType<typeof banco>
type Chiama = Banco['chiama']

/** Porta indietro gli orologi della sfida: come se fossero passati `ms` millisecondi. */
function passano(db: Banco['db'], id: string, ms: number) {
  for (const colonna of ['inizio_at', 'scade_at', 'partito_a', 'partito_b', 'created_at', 'updated_at']) {
    const prima = db.sqlite.prepare(`SELECT ${colonna} AS t FROM sfide_libere WHERE id = ?`).get(id)?.t
    if (!prima) continue
    const dopo = new Date(Date.parse(String(prima)) - ms).toISOString()
    db.sqlite.prepare(`UPDATE sfide_libere SET ${colonna} = ? WHERE id = ?`).run(dopo, id)
  }
}

async function online(chiama: Chiama, ...chi: Giocatore[]) {
  for (const g of chi) await chiama('POST', '/presenza', g, { attivita: 'paroliere' })
}

const vista = async (chiama: Chiama, chi: Giocatore, id: string) =>
  (await chiama<VistaSfidaLibera>('GET', `/sfide/partita/${id}`, chi)).dati

/** Anna sfida Bruno al Paroliere, lui accetta, e il via passa. */
async function sfidaCominciata(b: Banco, anna: Giocatore, bruno: Giocatore, impostazioni: unknown = {}) {
  await online(b.chiama, anna, bruno)
  const invito = await b.chiama<{ id: string }>('POST', '/sfide/paroliere', anna, { playerId: bruno.id, impostazioni })
  expect(invito.status).toBe(201)
  const arrivati = (await b.chiama<PresenzaRisposta>('POST', '/presenza', bruno, { attivita: 'hub' })).dati
  expect(arrivati.sfide.map((i) => [i.da.nickname, i.gioco])).toEqual([['anna', 'paroliere']])
  expect((await b.chiama('POST', `/sfide/partita/${invito.dati.id}/accetta`, bruno)).status).toBe(200)
  const prima = await vista(b.chiama, anna, invito.dati.id)
  expect(prima.inizioTraMs).toBeGreaterThan(0)
  expect(prima.inizioTraMs).toBeLessThanOrEqual(SFIDE_LIBERE_VIA_MS)
  // Prima del via il seme non esce, e non si gioca.
  expect(prima.seme).toBeNull()
  expect((await b.chiama('POST', `/sfide/partita/${invito.dati.id}/parti`, anna)).status).toBe(409)
  passano(b.db, invito.dati.id, SFIDE_LIBERE_VIA_MS)
  return invito.dati.id
}

async function parti(chiama: Chiama, chi: Giocatore, id: string) {
  const r = await chiama<VistaSfidaLibera>('POST', `/sfide/partita/${id}/parti`, chi)
  expect(r.status).toBe(200)
  return r.dati
}

async function avanza(chiama: Chiama, chi: Giocatore, id: string, punti: number, tempoMs: number, fine = false) {
  const r = await chiama<VistaSfidaLibera>('POST', `/sfide/partita/${id}/avanza`, chi, {
    punti,
    passo: punti,
    tempoMs,
    fine,
  })
  expect(r.status).toBe(200)
  return r.dati
}

describe('le regole delle sfide delle libere', () => {
  it('le opzioni fuori dalle scelte prendono quelle di sempre', () => {
    expect(impostazioniValide('paroliere', { lato: 5, minuti: 2 })).toEqual({ lato: 5, minuti: 2 })
    expect(impostazioniValide('paroliere', { lato: 7, minuti: 99, altro: 1 })).toEqual(PREDEFINITE.paroliere)
    expect(impostazioniValide('sudoku', null)).toEqual(PREDEFINITE.sudoku)
    expect(impostazioniValide('catena', { secondi: 30 })).toEqual({ secondi: 30 })
  })

  it('vince chi fa piu’ punti, e a pari punti chi ci ha messo meno', () => {
    expect(vincitoreSfida({ punti: 30, passo: 0, tempoMs: 9 }, { punti: 20, passo: 0, tempoMs: 1 })).toBe('a')
    expect(vincitoreSfida({ punti: 30, passo: 0, tempoMs: 9 }, { punti: 30, passo: 0, tempoMs: 1 })).toBe('b')
    expect(vincitoreSfida({ punti: 30, passo: 0, tempoMs: 5 }, { punti: 30, passo: 0, tempoMs: 5 })).toBe('pari')
  })
})

describe('la sfida fra amici delle libere, dalle API', () => {
  it('le opzioni sono quelle di chi sfida, e dal via il seme e’ lo stesso per tutti e due', async () => {
    const b = banco()
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    const id = await sfidaCominciata(b, anna, bruno, { lato: 5, minuti: 2 })
    const sua = await vista(b.chiama, anna, id)
    const mia = await vista(b.chiama, bruno, id)
    expect(sua).toMatchObject({ gioco: 'paroliere', impostazioni: { lato: 5, minuti: 2 }, stato: 'in_corso' })
    expect(sua.seme).not.toBeNull()
    expect(mia.seme).toBe(sua.seme)
    expect(mia.avversario?.nickname).toBe('anna')
    const presenza = (await b.chiama<PresenzaRisposta>('POST', '/presenza', bruno, { attivita: 'paroliere' })).dati
    expect(presenza.partitaSfida).toMatchObject({ id, gioco: 'paroliere', avversario: { nickname: 'anna' } })
  })

  it('ognuno dice fin dove e’ arrivato; quando hanno finito tutti e due vince chi ha piu’ punti', async () => {
    const b = banco()
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    const id = await sfidaCominciata(b, anna, bruno)
    await parti(b.chiama, anna, id)
    await parti(b.chiama, bruno, id)
    await avanza(b.chiama, anna, id, 12, 40_000)
    const visto = await avanza(b.chiama, bruno, id, 7, 30_000)
    expect(visto.sue).toMatchObject({ punti: 12, partito: true, finito: false })
    expect(visto.mie).toMatchObject({ punti: 7, finito: false })
    const finita = await avanza(b.chiama, anna, id, 18, 170_000, true)
    expect(finita).toMatchObject({ stato: 'in_corso', vincitore: null, mie: { finito: true } })
    // Chi ha finito non scrive piu'.
    const tardi = await b.chiama('POST', `/sfide/partita/${id}/avanza`, anna, { punti: 50, passo: 50, tempoMs: 1 })
    expect(tardi.status).toBe(409)
    const fine = await avanza(b.chiama, bruno, id, 21, 175_000, true)
    expect(fine).toMatchObject({ stato: 'finita', vincitore: 'io', serie: { mie: 1, sue: 0, partite: 1 } })
    expect((await vista(b.chiama, anna, id)).vincitore).toBe('avversario')
  })

  it('un avanzamento fuori misura non vale, e una pagina riaperta dopo il via chiude la partita', async () => {
    const b = banco()
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    const id = await sfidaCominciata(b, anna, bruno)
    // Prima di partire non si scrive.
    const presto = await b.chiama('POST', `/sfide/partita/${id}/avanza`, anna, { punti: 1, passo: 1, tempoMs: 1 })
    expect(presto.status).toBe(409)
    await parti(b.chiama, anna, id)
    const troppi = await b.chiama('POST', `/sfide/partita/${id}/avanza`, anna, { punti: 1e6, passo: 1, tempoMs: 1 })
    expect(troppi.status).toBe(400)
    const finto = await b.chiama('POST', `/sfide/partita/${id}/avanza`, anna, { punti: 'tanti', passo: 1, tempoMs: 1 })
    expect(finto.status).toBe(400)
    await avanza(b.chiama, anna, id, 9, 20_000)
    const riaperta = await parti(b.chiama, anna, id)
    expect(riaperta).toMatchObject({ riaperta: true, mie: { punti: 9, finito: true } })
  })

  it('oltre la sua durata la sfida si chiude con quel che ognuno ha detto', async () => {
    const b = banco()
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    const id = await sfidaCominciata(b, anna, bruno)
    await parti(b.chiama, anna, id)
    await avanza(b.chiama, anna, id, 5, 10_000)
    // Bruno ha accettato e poi ha chiuso l'app: non e' nemmeno partito.
    passano(b.db, id, durataMassimaMs('paroliere', PREDEFINITE.paroliere) + MARGINE_SFIDA_LIBERA_MS + 1_000)
    const chiusa = await vista(b.chiama, bruno, id)
    expect(chiusa).toMatchObject({ stato: 'finita', vincitore: 'avversario', mie: { punti: 0, partito: false } })
    // Chiusa, non tiene piu' occupati i due: si sfida di nuovo.
    await online(b.chiama, anna, bruno)
    const ancora = await b.chiama('POST', '/sfide/sudoku', bruno, { playerId: anna.id })
    expect(ancora.status).toBe(201)
  })

  it('una sfida alla volta, a tutti i giochi insieme', async () => {
    const b = banco()
    const [anna, bruno, carla] = [await b.giocatore('anna'), await b.giocatore('bruno'), await b.giocatore('carla')]
    await sfidaCominciata(b, anna, bruno)
    await online(b.chiama, carla)
    const mia = await b.chiama<{ code: string }>('POST', '/sfide/catena', anna, { playerId: carla.id })
    expect(mia.dati.code).toBe('IN_PARTITA')
    const sua = await b.chiama<{ code: string }>('POST', '/sfide/catena', carla, { playerId: anna.id })
    expect(sua.dati.code).toBe('OCCUPATO')
    const sala = (await b.chiama<SalaSfidaLibera>('GET', '/sfide/catena/sala', carla)).dati
    expect(sala.giocatori.find((g) => g.nickname === 'anna')?.occupato).toBe(true)
    expect((await b.chiama('GET', '/sfide/scopa/sala', carla)).status).toBe(404)
  })

  it('la rivincita ha lo stesso gioco e le stesse opzioni, e porta avanti la serie; il link apre la sfida', async () => {
    const b = banco()
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    const id = await sfidaCominciata(b, anna, bruno, { lato: 5, minuti: 4 })
    await parti(b.chiama, anna, id)
    await parti(b.chiama, bruno, id)
    await avanza(b.chiama, anna, id, 3, 5_000, true)
    await avanza(b.chiama, bruno, id, 3, 4_000, true)
    expect((await vista(b.chiama, bruno, id)).vincitore).toBe('io')
    await online(b.chiama, anna, bruno)
    const chiesta = await b.chiama<{ invitoId: string }>('POST', `/sfide/partita/${id}/rivincita`, anna)
    expect(chiesta.status).toBe(201)
    const arrivata = (await b.chiama<PresenzaRisposta>('POST', '/presenza', bruno, { attivita: 'paroliere' })).dati
    expect(arrivata.sfide[0]).toMatchObject({ rivincita: true, gioco: 'paroliere', impostazioni: { lato: 5 } })
    const accettata = await b.chiama<{ partitaId: string }>('POST', `/sfide/partita/${id}/rivincita`, bruno)
    expect(accettata.dati.partitaId).toBe(chiesta.dati.invitoId)
    const nuova = await vista(b.chiama, bruno, accettata.dati.partitaId)
    expect(nuova).toMatchObject({ impostazioni: { lato: 5, minuti: 4 }, serie: { mie: 1, sue: 0, partite: 1 } })

    const carla = await b.giocatore('carla')
    const link = await b.chiama<{ codice: string }>('POST', '/sfide/ghigliottina', carla, { impostazioni: { secondi: 30 } })
    const pubblico = (await b.chiama<InvitoConLink>('GET', `/inviti/${link.dati.codice}`, null)).dati
    expect(pubblico).toMatchObject({ gioco: 'ghigliottina', stato: 'attesa', da: { nickname: 'carla' } })
    const dario = await b.giocatore('dario')
    const aperta = await b.chiama<{ partitaId: string; gioco: string }>(
      'POST',
      `/sfide/link/${link.dati.codice}/accetta`,
      dario,
    )
    expect(aperta.dati.gioco).toBe('ghigliottina')
    const sala = (await b.chiama<SalaSfidaLibera>('GET', '/sfide/ghigliottina/sala', carla)).dati
    expect(sala.partita).toMatchObject({ id: aperta.dati.partitaId, gioco: 'ghigliottina' })
    expect(sala.invito).toMatchObject({ stato: 'accettato', partitaId: aperta.dati.partitaId })
  })
})
