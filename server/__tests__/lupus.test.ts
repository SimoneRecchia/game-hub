import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvitoLupus, VistaStanzaLupus } from '../../shared/lupus-stanza'
import type { InvitoConLink, PresenzaRisposta } from '../../shared/types'
import { banco, type Giocatore } from './banco'

type Banco = ReturnType<typeof banco>

let adesso = Date.parse('2026-10-07T18:00:00Z')
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(adesso)
})
afterEach(() => vi.useRealTimers())
const avanza = (ms: number) => {
  adesso += ms
  vi.setSystemTime(adesso)
}

async function ok<T>(p: Promise<{ status: number; dati: T }>, atteso = 200): Promise<T> {
  const r = await p
  expect(r.status, JSON.stringify(r.dati)).toBe(atteso)
  return r.dati
}

/** La pagina aperta: e' la presenza che dice chi c'e', e se chi conduce si fa vedere. */
function presente(b: Banco, io: Giocatore) {
  b.db.sqlite
    .prepare('INSERT OR REPLACE INTO presenza (player_id, visto_at, attivita) VALUES (?, ?, ?)')
    .run(io.id, new Date(adesso).toISOString(), 'lupus')
}

const guarda = (b: Banco, io: Giocatore, codice: string) =>
  b.chiama<VistaStanzaLupus>('GET', `/lupus/stanze/${codice}`, io)
const azione = (b: Banco, io: Giocatore, codice: string, a: unknown) =>
  b.chiama<VistaStanzaLupus>('POST', `/lupus/stanze/${codice}/azione`, io, { azione: a })

/** Una stanza con chi la apre e gli altri entrati, nell'ordine: `lupo0`, `lupo1`... o con un altro nome. */
async function stanzaCon(b: Banco, quanti: number, nome = 'lupo') {
  const giocatori: Giocatore[] = []
  for (let i = 0; i < quanti; i += 1) giocatori.push(await b.giocatore(`${nome}${i}`))
  const [host, ...altri] = giocatori
  const creata = await ok(b.chiama<VistaStanzaLupus>('POST', '/lupus/stanze', host), 201)
  for (const g of altri) await ok(b.chiama<VistaStanzaLupus>('POST', `/lupus/stanze/${creata.codice}/entra`, g))
  return { host, altri, giocatori, codice: creata.codice }
}

describe('la stanza di Lupus', () => {
  it('si apre con un codice, ci si entra, e chi non c’e’ non la vede', async () => {
    const b = banco()
    const { host, altri, codice } = await stanzaCon(b, 4)
    expect(codice).toMatch(/^[A-HJ-NP-Z]{4}$/)
    const v = await ok(guarda(b, host, codice))
    expect(v.stato).toBe('attesa')
    expect(v.conduco).toBe(true)
    expect(v.iscritti.map((i) => i.nickname)).toEqual(['lupo0', 'lupo1', 'lupo2', 'lupo3'])
    expect(v.iscritti[0].conduce).toBe(true)
    expect((await ok(guarda(b, altri[0], codice))).conduco).toBe(false)

    const fuori = await b.giocatore('fuori')
    expect((await guarda(b, fuori, codice)).status).toBe(403)
    type Info = { iscritti: number; conduttore: { nickname: string } }
    const info = await ok(b.chiama<Info>('GET', `/lupus/stanze/${codice}/info`, fuori))
    expect(info).toMatchObject({ iscritti: 4, conduttore: { nickname: 'lupo0' } })
    expect((await guarda(b, host, 'ZZZZ')).status).toBe(404)
  })

  it('il link di una stanza dice chi la conduce a chi non ha ancora un account', async () => {
    const b = banco()
    const { host, codice } = await stanzaCon(b, 4)
    const link = await ok(b.chiama<InvitoConLink>('GET', `/inviti/${codice}`, null))
    expect(link).toMatchObject({ codice, gioco: 'lupus', stato: 'attesa', da: { nickname: 'lupo0' } })
    await ok(b.chiama('POST', `/lupus/stanze/${codice}/via`, host))
    expect((await ok(b.chiama<InvitoConLink>('GET', `/inviti/${codice}`, null))).stato).toBe('usato')
    expect((await b.chiama('GET', '/inviti/ZZZZ', null)).status).toBe(404)
  })

  it('il via vuole almeno quattro giocatori, e ognuno vede solo il suo ruolo', async () => {
    const b = banco()
    const tre = await stanzaCon(b, 3, 'tre')
    const r = await b.chiama('POST', `/lupus/stanze/${tre.codice}/via`, tre.host)
    expect(r.status).toBe(409)

    const { host, altri, giocatori, codice } = await stanzaCon(b, 4)
    expect((await b.chiama('POST', `/lupus/stanze/${codice}/via`, altri[0])).status).toBe(403)
    const v = await ok(b.chiama<VistaStanzaLupus>('POST', `/lupus/stanze/${codice}/via`, host))
    expect(v.stato).toBe('partita')
    expect(v.partita?.fase).toBe('ruoli')
    // Il mazzo del regolamento in quattro: un lupo e tre villici.
    const ruoli = []
    for (const g of giocatori) {
      const mia = await ok(guarda(b, g, codice))
      ruoli.push(mia.partita!.tu.ruolo)
      // Degli altri il ruolo non si sa.
      expect(mia.partita!.giocatori.every((x) => x.ruolo === undefined)).toBe(true)
      expect(JSON.stringify(mia)).not.toContain('"segreti":{')
    }
    expect(ruoli.filter((x) => x === 'lupo')).toHaveLength(1)
    expect(ruoli.filter((x) => x === 'villico')).toHaveLength(3)
    // A partita cominciata non entra piu' nessuno.
    const tardi = await b.giocatore('tardi')
    expect((await b.chiama('POST', `/lupus/stanze/${codice}/entra`, tardi)).status).toBe(409)
  })

  it('l’azione e’ di chi la manda, "avanti" e’ di chi conduce finché si fa vedere', async () => {
    const b = banco()
    const { host, altri, giocatori, codice } = await stanzaCon(b, 4)
    await ok(b.chiama('POST', `/lupus/stanze/${codice}/via`, host))
    presente(b, host)
    // Anche a nome di un altro, il ruolo visto e' il mio.
    const v = await ok(azione(b, altri[0], codice, { tipo: 'ruolo_visto', giocatore: host.id }))
    expect(v.partita?.fatto).toBe(true)
    expect((await ok(guarda(b, host, codice))).partita?.fatto).toBe(false)
    expect((await azione(b, altri[0], codice, { tipo: 'avanti' })).status).toBe(400)
    expect((await azione(b, altri[0], codice, { tipo: 'boh' })).status).toBe(400)
    // Una regola che non torna: votare di notte.
    expect((await azione(b, altri[1], codice, { tipo: 'voto', bersaglio: host.id })).status).toBe(409)

    for (const g of giocatori) await ok(azione(b, g, codice, { tipo: 'ruolo_visto' }))
    expect((await ok(guarda(b, host, codice))).partita?.fase).toBe('notte')
    // Chi conduce sparisce: dopo un po' la partita la manda avanti chiunque.
    avanza(120_000)
    const assente = await ok(guarda(b, altri[0], codice))
    expect(assente.conduttoreAssente).toBe(true)
    expect((await azione(b, altri[0], codice, { tipo: 'avanti' })).status).toBe(200)
  })

  it('una partita intera: la notte, il giorno, i tempi che scadono, il linciaggio e un’altra partita', async () => {
    const b = banco()
    const { host, giocatori, codice } = await stanzaCon(b, 4)
    presente(b, host)
    await ok(b.chiama('POST', `/lupus/stanze/${codice}/via`, host))
    for (const g of giocatori) await ok(azione(b, g, codice, { tipo: 'ruolo_visto' }))

    const viste = async () =>
      Promise.all(giocatori.map(async (g) => ({ g, v: (await ok(guarda(b, g, codice))).partita! })))
    const lupo = (await viste()).find((x) => x.v.tu.ruolo === 'lupo')!.g

    // La prima notte il branco si riconosce soltanto: il lupo legge, ed e' l'alba.
    const notte = await ok(guarda(b, lupo, codice))
    expect(notte.partita?.richiesta.tipo).toBe('notizia')
    await ok(azione(b, lupo, codice, { tipo: 'notte', scelta: { tipo: 'letto' } }))
    expect((await ok(guarda(b, host, codice))).partita?.fase).toBe('alba')

    // L'alba la chiude chi conduce; la discussione finisce da sola quando scade il tempo.
    presente(b, host)
    const discussione = await ok(azione(b, host, codice, { tipo: 'avanti' }))
    expect(discussione.partita?.fase).toBe('discussione')
    expect(discussione.partita?.fineFase).toBe(adesso + 180_000)
    avanza(181_000)
    presente(b, host)
    expect((await ok(guarda(b, giocatori[1], codice))).partita?.fase).toBe('nomine')

    // Le nomine: tutti sul lupo, e il lupo su un altro.
    const altro = giocatori.find((g) => g.id !== lupo.id)!
    for (const g of giocatori) {
      const r = (await ok(guarda(b, g, codice))).partita!.richiesta
      if (r.tipo !== 'vota') continue
      const bersaglio = g.id === lupo.id ? altro.id : lupo.id
      await ok(azione(b, g, codice, { tipo: 'voto', bersaglio }))
    }
    const arringhe = await ok(guarda(b, host, codice))
    expect(arringhe.partita?.fase).toBe('arringhe')
    expect(arringhe.partita?.indiziati).toContain(lupo.id)
    presente(b, host)
    await ok(azione(b, host, codice, { tipo: 'avanti' }))

    // Il ballottaggio: chi puo' vota il lupo, il lupo si astiene.
    for (const g of giocatori) {
      const r = (await ok(guarda(b, g, codice))).partita!.richiesta
      if (r.tipo !== 'vota') continue
      const bersaglio = g.id === lupo.id || !r.bersagli.includes(lupo.id) ? null : lupo.id
      await ok(azione(b, g, codice, { tipo: 'voto', bersaglio }))
    }
    const fine = await ok(guarda(b, host, codice))
    expect(fine.stato).toBe('finita')
    expect(fine.partita?.fase).toBe('finita')
    expect(fine.partita?.esito?.vincitore).toBe('villaggio')
    // A partita finita i ruoli li vedono tutti.
    expect(fine.partita?.giocatori.find((x) => x.id === lupo.id)?.ruolo).toBe('lupo')

    expect((await b.chiama('POST', `/lupus/stanze/${codice}/ancora`, giocatori[1])).status).toBe(403)
    const ancora = await ok(b.chiama<VistaStanzaLupus>('POST', `/lupus/stanze/${codice}/ancora`, host))
    expect(ancora.stato).toBe('attesa')
    expect(ancora.partita).toBeNull()
    expect(ancora.iscritti).toHaveLength(4)
  })

  it('le impostazioni le cambia chi conduce, e un mazzo sbagliato non parte', async () => {
    const b = banco()
    const { host, altri, codice } = await stanzaCon(b, 4)
    const corpo = { impostazioni: { regole: { fantasmiVotano: false }, composizione: { lupo: 2, villico: 1 } } }
    expect((await b.chiama('POST', `/lupus/stanze/${codice}/impostazioni`, altri[0], corpo)).status).toBe(403)
    const v = await ok(b.chiama<VistaStanzaLupus>('POST', `/lupus/stanze/${codice}/impostazioni`, host, corpo))
    expect(v.impostazioni.regole.fantasmiVotano).toBe(false)
    expect(v.impostazioni.composizione).toEqual({ lupo: 2, villico: 1 })
    const via = await b.chiama<{ code: string }>('POST', `/lupus/stanze/${codice}/via`, host)
    expect(via.status).toBe(409)
    expect(via.dati.code).toBe('MAZZO')
    // Il mazzo del regolamento torna con null, e allora si parte.
    await ok(b.chiama('POST', `/lupus/stanze/${codice}/impostazioni`, host, { impostazioni: { composizione: null } }))
    expect((await b.chiama('POST', `/lupus/stanze/${codice}/via`, host)).status).toBe(200)
  })

  it('si sta in una stanza alla volta, chi conduce passa la mano uscendo, e l’ultimo chiude', async () => {
    const b = banco()
    const prima = await stanzaCon(b, 2)
    const seconda = await ok(b.chiama<VistaStanzaLupus>('POST', '/lupus/stanze', await b.giocatore('altra')), 201)
    // Entrare in un'altra stanza fa uscire dalla prima.
    await ok(b.chiama('POST', `/lupus/stanze/${seconda.codice}/entra`, prima.altri[0]))
    expect((await ok(guarda(b, prima.host, prima.codice))).iscritti).toHaveLength(1)

    // Chi conduce esce: conduce il primo entrato dopo di lui.
    const terza = await stanzaCon(b, 3, 'terza')
    await ok(b.chiama('POST', `/lupus/stanze/${terza.codice}/esci`, terza.host))
    const dopo = await ok(guarda(b, terza.altri[0], terza.codice))
    expect(dopo.conduco).toBe(true)
    expect(dopo.iscritti.map((i) => i.nickname)).not.toContain(terza.host.nickname)
    // Escono tutti: la stanza non c'e' piu'.
    for (const g of terza.altri) await ok(b.chiama('POST', `/lupus/stanze/${terza.codice}/esci`, g))
    expect((await guarda(b, terza.altri[0], terza.codice)).status).toBe(404)

    // Da una partita in corso non si apre un'altra stanza.
    const quattro = await stanzaCon(b, 4, 'quattro')
    await ok(b.chiama('POST', `/lupus/stanze/${quattro.codice}/via`, quattro.host))
    const r = await b.chiama<{ code: string }>('POST', '/lupus/stanze', quattro.altri[1])
    expect(r.status).toBe(409)
    expect(r.dati.code).toBe('IN_PARTITA')
  })

  it('chi conduce manda via, e chi e’ stato mandato via non vede piu’ la stanza', async () => {
    const b = banco()
    const { host, altri, codice } = await stanzaCon(b, 3)
    const via = `/lupus/stanze/${codice}/espelli`
    expect((await b.chiama('POST', via, altri[0], { playerId: altri[1].id })).status).toBe(403)
    const v = await ok(b.chiama<VistaStanzaLupus>('POST', via, host, { playerId: altri[1].id }))
    expect(v.iscritti).toHaveLength(2)
    expect((await guarda(b, altri[1], codice)).status).toBe(403)
  })

  it('un invito arriva con la presenza, e se ne va quando si entra o si dice di no', async () => {
    const b = banco()
    const { host, codice } = await stanzaCon(b, 2)
    const amico = await b.giocatore('amico')
    const altro = await b.giocatore('altro')
    await ok(b.chiama('POST', `/lupus/stanze/${codice}/invita`, host, { playerId: amico.id }))
    await ok(b.chiama('POST', `/lupus/stanze/${codice}/invita`, host, { playerId: altro.id }))

    const inviti = async (g: Giocatore) =>
      (await ok(b.chiama<PresenzaRisposta>('POST', '/presenza', g, { attivita: 'hub' }))).lupus as InvitoLupus[]
    const arrivati = await inviti(amico)
    expect(arrivati).toHaveLength(1)
    expect(arrivati[0]).toMatchObject({ codice, iscritti: 2, da: { nickname: host.nickname } })

    await ok(b.chiama('POST', `/lupus/stanze/${codice}/entra`, amico))
    expect(await inviti(amico)).toEqual([])
    const presenza = await ok(b.chiama<PresenzaRisposta>('POST', '/presenza', amico, { attivita: 'lupus' }))
    expect(presenza.stanzaLupus).toEqual({ codice, stato: 'attesa', iscritti: 3 })

    const [suo] = await inviti(altro)
    await ok(b.chiama('POST', `/lupus/inviti/${suo.id}/rifiuta`, altro))
    expect(await inviti(altro)).toEqual([])
  })
})
