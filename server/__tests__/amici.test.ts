import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PRESENZA_ONLINE_MS } from '../../shared/config'
import type { AmiciRisposta, ProfiloAmico } from '../../shared/types'
import { banco, type Giocatore } from './banco'

type Chiama = ReturnType<typeof banco>['chiama']

let adesso = Date.parse('2026-10-02T18:00:00Z')
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(adesso)
})
afterEach(() => vi.useRealTimers())
const avanza = (ms: number) => {
  adesso += ms
  vi.setSystemTime(adesso)
}

const online = (chiama: Chiama, chi: Giocatore, attivita = 'hub') => chiama('POST', '/presenza', chi, { attivita })

describe('gli amici, dalle API', () => {
  it('online sono gli altri visti di recente, in ordine di nome, con quel che fanno', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const carla = await giocatore('carla')
    await giocatore('dario')

    await online(chiama, carla, 'wordle')
    await online(chiama, bruno, 'scacchi')
    await online(chiama, anna)
    const r = await chiama<AmiciRisposta>('GET', '/amici', anna)
    expect(r.status).toBe(200)
    // Chi guarda non c'e', e nemmeno Dario, che non si e' mai visto.
    expect(r.dati.online.map((a) => [a.displayName, a.attivita])).toEqual([
      ['bruno', 'scacchi'],
      ['carla', 'wordle'],
    ])

    // Passato il tempo della presenza, chi non si e' piu' fatto vivo non e' online.
    avanza(PRESENZA_ONLINE_MS - 5_000)
    await online(chiama, carla, 'quiz')
    avanza(10_000)
    expect((await chiama<AmiciRisposta>('GET', '/amici', anna)).dati.online.map((a) => a.displayName)).toEqual([
      'carla',
    ])
  })

  it('il profilo di un amico si apre dal nickname, e dice se e dove e’ online', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('Bruno')

    const fuori = await chiama<ProfiloAmico>('GET', '/amici/bruno', anna)
    expect(fuori.status).toBe(200)
    expect(fuori.dati).toMatchObject({ playerId: bruno.id, nickname: 'Bruno', online: false, attivita: null })
    expect(fuori.dati.createdAt).toEqual(expect.any(String))

    await online(chiama, bruno, 'dama')
    expect((await chiama<ProfiloAmico>('GET', '/amici/BRUNO', anna)).dati).toMatchObject({
      online: true,
      attivita: 'dama',
    })

    const nessuno = await chiama<{ code: string }>('GET', '/amici/zorro', anna)
    expect(nessuno.status).toBe(404)
    expect(nessuno.dati.code).toBe('GIOCATORE_NON_TROVATO')
  })

  it('senza sessione non si vede nessuno', async () => {
    const { chiama } = banco()
    expect((await chiama('GET', '/amici', null)).status).toBe(401)
  })
})
