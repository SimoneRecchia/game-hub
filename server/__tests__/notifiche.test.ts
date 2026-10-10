import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PRESENZA_ONLINE_MS } from '../../shared/config'
import { CHIAMATA_MS, preferenzeDa, type StatoNotifiche } from '../../shared/notifiche'
import type { PresenzaRisposta, VistaTavolo } from '../../shared/types'
import { base64url, chiavePubblicaValida } from '../../shared/webpush'
import { banco, type Giocatore } from './banco'

type Chiama = ReturnType<typeof banco>['chiama']

let adesso = Date.parse('2026-10-10T18:00:00Z')
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(adesso)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const avanza = (ms: number) => {
  adesso += ms
  vi.setSystemTime(adesso)
}

const online = async (chiama: Chiama, chi: Giocatore) =>
  (await chiama<PresenzaRisposta>('POST', '/presenza', chi, { attivita: 'hub' })).dati

/** Un dispositivo vero, con le sue chiavi: il server ci deve cifrare sopra. */
async function dispositivo(endpoint = `https://push.example.com/${Math.random().toString(36).slice(2)}`) {
  const k = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  return {
    endpoint,
    keys: {
      p256dh: base64url(new Uint8Array((await crypto.subtle.exportKey('raw', k.publicKey)) as ArrayBuffer)),
      auth: base64url(crypto.getRandomValues(new Uint8Array(16))),
    },
  }
}

/** Il servizio di notifiche finto: registra quel che riceve, e risponde `stato`. */
function servizio(stato = 201) {
  const ricevute: Array<{ url: string; intestazioni: Record<string, string> }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      ricevute.push({ url, intestazioni: init.headers as Record<string, string> })
      return new Response(null, { status: stato })
    }),
  )
  return ricevute
}

describe('le notifiche, dalle API', () => {
  it('la chiave si crea una volta, e un dispositivo si iscrive e si toglie', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const prima = await chiama<StatoNotifiche>('GET', '/notifiche', anna)
    expect(prima.status).toBe(200)
    expect(chiavePubblicaValida(prima.dati.chiave)).toBe(true)
    expect(prima.dati.dispositivi).toBe(0)
    expect(prima.dati.preferenze).toEqual({ inviti: true, turno: true, superenalotto: true, promemoria: false })
    expect((await chiama<StatoNotifiche>('GET', '/notifiche', anna)).dati.chiave).toBe(prima.dati.chiave)

    const telefono = await dispositivo()
    expect((await chiama('POST', '/notifiche/iscrizione', anna, telefono)).status).toBe(200)
    // Iscriversi di nuovo non ne fa due.
    await chiama('POST', '/notifiche/iscrizione', anna, telefono)
    expect((await chiama<StatoNotifiche>('GET', '/notifiche', anna)).dati.dispositivi).toBe(1)
    expect(
      (await chiama('POST', '/notifiche/iscrizione', anna, { ...telefono, endpoint: 'http://non-sicuro.example.com' })).status,
    ).toBe(400)
    expect(
      (await chiama('POST', '/notifiche/iscrizione', anna, { ...telefono, keys: { ...telefono.keys, auth: 'x' } })).status,
    ).toBe(400)

    await chiama('POST', '/notifiche/disiscrizione', anna, { endpoint: telefono.endpoint })
    expect((await chiama<StatoNotifiche>('GET', '/notifiche', anna)).dati.dispositivi).toBe(0)
  })

  it('un telefono passa a chi ci entra dopo', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const telefono = await dispositivo()
    await chiama('POST', '/notifiche/iscrizione', anna, telefono)
    await chiama('POST', '/notifiche/iscrizione', bruno, telefono)
    expect((await chiama<StatoNotifiche>('GET', '/notifiche', anna)).dati.dispositivi).toBe(0)
    expect((await chiama<StatoNotifiche>('GET', '/notifiche', bruno)).dati.dispositivi).toBe(1)
  })

  it('le preferenze si cambiano una per volta, e le altre restano', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    await chiama('POST', '/notifiche/preferenze', anna, { promemoria: true, inesistente: true })
    await chiama('POST', '/notifiche/preferenze', anna, { turno: false, inviti: 'no' })
    expect((await chiama<StatoNotifiche>('GET', '/notifiche', anna)).dati.preferenze).toEqual({
      inviti: true,
      turno: false,
      superenalotto: true,
      promemoria: true,
    })
    expect(preferenzeDa('non json')).toEqual({ inviti: true, turno: true, superenalotto: true, promemoria: false })
  })
})

describe('gli inviti a chi non e’ online', () => {
  it('arrivano con la notifica e con il giro di controllo, e rispondere dice se chi chiama c’e’ ancora', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const ricevute = servizio()
    const telefono = await dispositivo()
    await chiama('POST', '/notifiche/iscrizione', bruno, telefono)

    expect((await chiama('POST', '/chiamate', anna, { playerId: bruno.id, gioco: 'briscola' })).status).toBe(400)
    expect((await chiama('POST', '/chiamate', anna, { playerId: anna.id, gioco: 'scacchi' })).status).toBe(400)
    const chiamata = await chiama<{ id: string; avvisato: boolean }>('POST', '/chiamate', anna, {
      playerId: bruno.id,
      gioco: 'scacchi',
    })
    expect(chiamata.status).toBe(201)
    expect(chiamata.dati.avvisato).toBe(true)
    // La notifica e' partita, cifrata e firmata, verso il servizio del telefono.
    expect(ricevute).toHaveLength(1)
    expect(ricevute[0].url).toBe(telefono.endpoint)
    expect(ricevute[0].intestazioni['Content-Encoding']).toBe('aes128gcm')
    expect(ricevute[0].intestazioni.Authorization).toMatch(/^vapid t=.+, k=.+$/)

    // Una seconda chiamata della stessa persona prende il posto della prima.
    await online(chiama, anna)
    const seconda = await chiama<{ id: string }>('POST', '/chiamate', anna, { playerId: bruno.id, gioco: 'dama' })
    const visto = await online(chiama, bruno)
    expect(visto.chiamate).toMatchObject([{ id: seconda.dati.id, gioco: 'dama', da: { displayName: 'anna' } }])

    const risposta = await chiama<{ gioco: string; online: boolean; da: { playerId: string } }>(
      'POST',
      `/chiamate/${seconda.dati.id}/rispondi`,
      bruno,
    )
    expect(risposta.dati).toMatchObject({ gioco: 'dama', online: true, da: { playerId: anna.id } })
    expect((await online(chiama, bruno)).chiamate).toEqual([])
    // Solo chi e' stato chiamato risponde.
    expect((await chiama('POST', `/chiamate/${seconda.dati.id}/rispondi`, anna)).status).toBe(404)
  })

  it('senza dispositivi non parte niente, e passata mezz’ora l’invito non c’e’ piu’', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const ricevute = servizio()
    const chiamata = await chiama<{ avvisato: boolean }>('POST', '/chiamate', anna, { playerId: bruno.id, gioco: 'go' })
    expect(chiamata.dati.avvisato).toBe(false)
    expect(ricevute).toHaveLength(0)
    expect((await online(chiama, bruno)).chiamate).toHaveLength(1)
    avanza(CHIAMATA_MS + 1_000)
    expect((await online(chiama, bruno)).chiamate).toEqual([])
  })

  it('chi ha spento gli inviti non li riceve, e un’iscrizione che il servizio dice morta si cancella', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const carla = await giocatore('carla')
    servizio(410)
    await chiama('POST', '/notifiche/iscrizione', bruno, await dispositivo())
    await chiama('POST', '/notifiche/iscrizione', carla, await dispositivo())
    await chiama('POST', '/notifiche/preferenze', carla, { inviti: false })

    expect((await chiama<{ avvisato: boolean }>('POST', '/chiamate', anna, { playerId: carla.id, gioco: 'go' })).dati.avvisato).toBe(false)
    expect((await chiama<{ avvisato: boolean }>('POST', '/chiamate', anna, { playerId: bruno.id, gioco: 'go' })).dati.avvisato).toBe(true)
    expect((await chiama<StatoNotifiche>('GET', '/notifiche', bruno)).dati.dispositivi).toBe(0)
  })
})

describe('tocca a te', () => {
  async function partita(chiama: Chiama, anna: Giocatore, bruno: Giocatore) {
    await online(chiama, bruno)
    const invito = await chiama<{ id: string }>('POST', '/tavolo/inviti', anna, { gioco: 'forza4', playerId: bruno.id })
    const id = (await chiama<{ partitaId: string }>('POST', `/tavolo/inviti/${invito.dati.id}/accetta`, bruno)).dati.partitaId
    const vista = (await chiama<VistaTavolo>('GET', `/tavolo/partite/${id}`, anna)).dati
    return { id, primo: vista.parte === 0 ? anna : bruno, secondo: vista.parte === 0 ? bruno : anna }
  }

  it('dopo una mossa, a chi ha chiuso l’app arriva la notifica; a chi e’ online no', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const ricevute = servizio()
    const { id, primo, secondo } = await partita(chiama, anna, bruno)
    await chiama('POST', '/notifiche/iscrizione', secondo, await dispositivo())

    // L'altro e' online: niente notifica.
    await online(chiama, secondo)
    const v1 = (await chiama<VistaTavolo>('GET', `/tavolo/partite/${id}`, primo)).dati
    await chiama('POST', `/tavolo/partite/${id}/mossa`, primo, { mossa: '3', versione: v1.versione })
    expect(ricevute).toHaveLength(0)

    // L'altro muove, poi chiude l'app: alla mossa dopo gli arriva.
    const v2 = (await chiama<VistaTavolo>('GET', `/tavolo/partite/${id}`, secondo)).dati
    await chiama('POST', `/tavolo/partite/${id}/mossa`, secondo, { mossa: '3', versione: v2.versione })
    avanza(PRESENZA_ONLINE_MS + 1_000)
    await online(chiama, primo)
    const v3 = (await chiama<VistaTavolo>('GET', `/tavolo/partite/${id}`, primo)).dati
    const mossa = await chiama('POST', `/tavolo/partite/${id}/mossa`, primo, { mossa: '4', versione: v3.versione })
    expect(mossa.status).toBe(200)
    expect(ricevute).toHaveLength(1)
  })
})
