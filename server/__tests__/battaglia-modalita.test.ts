import { describe, expect, it } from 'vitest'
import { caselleDellaNave, disponiACaso, type Nave } from '../../shared/battaglia'
import { mulberry32 } from '../../shared/daily'
import type {
  InvitoConLink,
  LinkBattaglia,
  LobbyBattaglia,
  VistaBattaglia,
} from '../../shared/types'
import { banco, type Giocatore } from './banco'

const MIA_FLOTTA: Nave[] = disponiACaso(mulberry32(7))

type Chiama = ReturnType<typeof banco>['chiama']

async function disponi(chiama: Chiama, io: Giocatore, v: VistaBattaglia): Promise<VistaBattaglia> {
  const r = await chiama<VistaBattaglia>('POST', `/battaglia/partite/${v.id}/flotta`, io, {
    navi: MIA_FLOTTA,
    versione: v.versione,
  })
  expect(r.status).toBe(200)
  return r.dati
}

async function spara(chiama: Chiama, io: Giocatore, v: VistaBattaglia, casella: number): Promise<VistaBattaglia> {
  const r = await chiama<VistaBattaglia>('POST', `/battaglia/partite/${v.id}/colpo`, io, {
    casella,
    versione: v.versione,
  })
  expect(r.status, JSON.stringify(r.dati)).toBe(200)
  return r.dati
}

describe('la battaglia non ha piu\' la classificata', () => {
  it('non si apre, e non ha classifica ne\' riepilogo per la schermata di oggi', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('anna')
    expect((await chiama('POST', '/battaglia/classificata', io)).status).toBe(404)
    expect((await chiama('GET', '/battaglia/summary', io)).status).toBe(404)
    expect((await chiama('GET', '/leaderboard/battaglia?scope=all', io)).status).toBe(404)
    const lobby = (await chiama<LobbyBattaglia>('GET', '/battaglia/lobby', io)).dati
    expect('classificata' in lobby).toBe(false)
  })

  it('una classificata rimasta aperta si finisce come una partita contro il computer, senza punti', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('bruno')
    const flottaComputer = disponiACaso(mulberry32(11))
    const adesso = new Date().toISOString()
    db.sqlite
      .prepare(
        `INSERT INTO battaglia_partite
           (id, modalita, giocatore_a, giocatore_b, livello, seme, puzzle_number, stato, flotta_b, colpi, versione,
            created_at, updated_at)
         VALUES ('bat_vecchia', 'classificata', ?, NULL, 'facile', 5, 1, 'disposizione', ?, '[]', 0, ?, ?)`,
      )
      .run(io.id, JSON.stringify(flottaComputer), adesso, adesso)

    let v = (await chiama<VistaBattaglia>('GET', '/battaglia/partite/bat_vecchia', io)).dati
    expect(v).toMatchObject({ modalita: 'classificata', livello: 'facile', stato: 'disposizione' })
    v = await disponi(chiama, io, v)
    for (const k of flottaComputer.flatMap(caselleDellaNave)) {
      v = await spara(chiama, io, v, k)
      if (v.stato === 'finita') break
    }
    expect(v).toMatchObject({ stato: 'finita', vincitore: 'io' })
    const riga = db.sqlite.prepare(`SELECT punti FROM battaglia_partite WHERE id = 'bat_vecchia'`).get()
    expect(riga?.punti).toBeNull()
  })
})

describe('la partita libera contro il computer', () => {
  it('si sceglie il livello; cambiare partita a battaglia cominciata conta come sconfitta', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('dario')
    const prima = await chiama<VistaBattaglia>('POST', '/battaglia/computer', io, { livello: 'normale' })
    expect(prima.status).toBe(201)
    expect(prima.dati).toMatchObject({ modalita: 'computer', livello: 'normale' })

    // Non ancora cominciata: si riusa, col livello nuovo.
    const riusata = (await chiama<VistaBattaglia>('POST', '/battaglia/computer', io, { livello: 'difficile' })).dati
    expect(riusata.id).toBe(prima.dati.id)
    expect(riusata.livello).toBe('difficile')

    let v = await disponi(chiama, io, riusata)
    v = await spara(chiama, io, v, 0)
    const nuova = (await chiama<VistaBattaglia>('POST', '/battaglia/computer', io, { livello: 'facile' })).dati
    expect(nuova.id).not.toBe(v.id)

    const lobby = (await chiama<LobbyBattaglia>('GET', '/battaglia/lobby', io)).dati
    expect(lobby.controComputer.difficile).toEqual({ vinte: 0, perse: 1 })
    expect(lobby.computer?.id).toBe(nuova.id)
    expect(lobby.partita).toBeNull()
    expect((await chiama('POST', '/battaglia/computer', io, { livello: 'impossibile' })).status).toBe(400)
  })

  it('le partite contro il computer non rendono occupati', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('elena')
    const altro = await giocatore('franco')
    await chiama('POST', '/battaglia/computer', io, { livello: 'facile' })
    await chiama('POST', '/presenza', altro, { attivita: 'battaglia' })
    await chiama('POST', '/presenza', io, { attivita: 'battaglia' })
    const lobby = (await chiama<LobbyBattaglia>('GET', '/battaglia/lobby', altro)).dati
    expect(lobby.giocatori.find((g) => g.nickname === 'elena')?.occupato).toBe(false)
  })
})

describe('gli inviti con un link', () => {
  it('chi apre il link vede chi lo invita anche senza account, e accettando apre la partita', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const link = (await chiama<LinkBattaglia>('POST', '/battaglia/link', anna)).dati
    expect(link.codice).toMatch(/^[a-z2-9]{10}$/)

    const visto = await chiama<InvitoConLink>('GET', `/inviti/${link.codice}`, null)
    expect(visto.status).toBe(200)
    expect(visto.dati).toMatchObject({ stato: 'attesa', da: { displayName: 'anna' } })

    const accettato = await chiama<{ partitaId: string }>('POST', `/battaglia/link/${link.codice}/accetta`, bruno)
    expect(accettato.status).toBe(200)
    // Riaprire il link porta alla stessa partita.
    const ancora = await chiama<{ partitaId: string }>('POST', `/battaglia/link/${link.codice}/accetta`, bruno)
    expect(ancora.dati.partitaId).toBe(accettato.dati.partitaId)

    const lobby = (await chiama<LobbyBattaglia>('GET', '/battaglia/lobby', anna)).dati
    expect(lobby.partita).toMatchObject({ id: accettato.dati.partitaId, modalita: 'amici', stato: 'disposizione' })
    expect(lobby.link).toBeNull()
    expect((await chiama<InvitoConLink>('GET', `/inviti/${link.codice}`, null)).dati.stato).toBe('usato')
  })

  it('vale una volta sola, non per chi l’ha creato, e scade dopo un giorno', async () => {
    const { chiama, giocatore, db } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const carla = await giocatore('carla')
    const link = (await chiama<LinkBattaglia>('POST', '/battaglia/link', anna)).dati
    expect((await chiama<{ code: string }>('POST', `/battaglia/link/${link.codice}/accetta`, anna)).dati.code).toBe('LINK_TUO')
    await chiama('POST', `/battaglia/link/${link.codice}/accetta`, bruno)
    expect((await chiama<{ code: string }>('POST', `/battaglia/link/${link.codice}/accetta`, carla)).dati.code).toBe('LINK_USATO')

    const vecchio = (await chiama<LinkBattaglia>('POST', '/battaglia/link', carla)).dati
    db.sqlite
      .prepare('UPDATE battaglia_link SET created_at = ? WHERE codice = ?')
      .run(new Date(Date.now() - 25 * 3_600_000).toISOString(), vecchio.codice)
    expect((await chiama<InvitoConLink>('GET', `/inviti/${vecchio.codice}`, null)).dati.stato).toBe('scaduto')
    expect((await chiama<{ code: string }>('POST', `/battaglia/link/${vecchio.codice}/accetta`, anna)).dati.code).toBe('LINK_SCADUTO')
    expect((await chiama('GET', '/inviti/nonesiste', null)).status).toBe(404)
  })

  it('un link nuovo annulla il vecchio, e si puo’ ritirare', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const primo = (await chiama<LinkBattaglia>('POST', '/battaglia/link', anna)).dati
    const secondo = (await chiama<LinkBattaglia>('POST', '/battaglia/link', anna)).dati
    expect((await chiama<InvitoConLink>('GET', `/inviti/${primo.codice}`, null)).dati.stato).toBe('annullato')
    await chiama('POST', '/battaglia/link/annulla', anna)
    expect((await chiama<{ code: string }>('POST', `/battaglia/link/${secondo.codice}/accetta`, bruno)).dati.code).toBe(
      'LINK_ANNULLATO',
    )
  })
})
