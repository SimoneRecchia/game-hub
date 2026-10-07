import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RIVELA_MS,
  SCELTA_MS,
  codificaOps,
  type AlbumScarabocchi,
  type InvitoScarabocchi,
  type VistaIndovina,
  type VistaStanzaScarabocchi,
  type VistaTelefono,
} from '../../shared/scarabocchi'
import type { InvitoConLink, PresenzaRisposta } from '../../shared/types'
import { banco, type Giocatore } from './banco'

type Banco = ReturnType<typeof banco>

let adesso = Date.parse('2026-10-08T18:00:00Z')
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

/** La pagina aperta: e' la presenza che dice chi c'e'. */
function presenti(b: Banco, ...chi: Giocatore[]) {
  for (const io of chi) {
    b.db.sqlite
      .prepare('INSERT OR REPLACE INTO presenza (player_id, visto_at, attivita) VALUES (?, ?, ?)')
      .run(io.id, new Date(adesso).toISOString(), 'scarabocchi')
  }
}

const guarda = (b: Banco, io: Giocatore, codice: string, q = '') =>
  b.chiama<VistaStanzaScarabocchi>('GET', `/scarabocchi/stanze/${codice}${q}`, io)

async function stanzaCon(b: Banco, quanti: number, modo: 'indovina' | 'telefono' = 'indovina') {
  const giocatori: Giocatore[] = []
  for (let i = 0; i < quanti; i += 1) giocatori.push(await b.giocatore(`pittore${i}`))
  const [host, ...altri] = giocatori
  const creata = await ok(b.chiama<VistaStanzaScarabocchi>('POST', '/scarabocchi/stanze', host), 201)
  for (const g of altri) {
    await ok(b.chiama<VistaStanzaScarabocchi>('POST', `/scarabocchi/stanze/${creata.codice}/entra`, g))
  }
  if (modo !== 'indovina') {
    await ok(
      b.chiama('POST', `/scarabocchi/stanze/${creata.codice}/impostazioni`, host, { impostazioni: { modo } }),
    )
  }
  presenti(b, ...giocatori)
  return { host, altri, giocatori, codice: creata.codice }
}

const perId = (gs: Giocatore[]) => new Map(gs.map((g) => [g.id, g]))

describe('la stanza di Scarabocchi', () => {
  it('si apre con un codice di cinque lettere, ci si entra, e il link dice chi la conduce', async () => {
    const b = banco()
    const { host, altri, codice } = await stanzaCon(b, 3)
    expect(codice).toMatch(/^[A-HJ-NP-Z]{5}$/)
    const v = await ok(guarda(b, host, codice))
    expect(v).toMatchObject({ stato: 'attesa', conduco: true, numero: 0 })
    expect(v.iscritti.map((i) => i.nickname)).toEqual(['pittore0', 'pittore1', 'pittore2'])
    expect((await ok(guarda(b, altri[0], codice))).conduco).toBe(false)
    const fuori = await b.giocatore('fuori')
    expect((await guarda(b, fuori, codice)).status).toBe(403)
    const link = await ok(b.chiama<InvitoConLink>('GET', `/inviti/${codice}`, null))
    expect(link).toMatchObject({ codice, gioco: 'scarabocchi', stato: 'attesa', da: { nickname: 'pittore0' } })
  })

  it('un invito arriva con la presenza, e la stanza in cui sei anche', async () => {
    const b = banco()
    const { host, codice } = await stanzaCon(b, 2)
    const amico = await b.giocatore('amico')
    await ok(b.chiama('POST', `/scarabocchi/stanze/${codice}/invita`, host, { playerId: amico.id }))
    const prima = await ok(b.chiama<PresenzaRisposta>('POST', '/presenza', amico, { attivita: 'hub' }))
    expect(prima.scarabocchi.map((i: InvitoScarabocchi) => i.codice)).toEqual([codice])
    expect(prima.scarabocchi[0]).toMatchObject({ modo: 'indovina', iscritti: 2, da: { nickname: 'pittore0' } })
    await ok(b.chiama('POST', `/scarabocchi/stanze/${codice}/entra`, amico))
    const dopo = await ok(b.chiama<PresenzaRisposta>('POST', '/presenza', amico, { attivita: 'scarabocchi' }))
    expect(dopo.scarabocchi).toEqual([])
    expect(dopo.stanzaScarabocchi).toEqual({ codice, stato: 'attesa', iscritti: 3, modo: 'indovina' })
    // L'attivita' nuova arriva com'e', e non come "altro".
    const riga = b.db.sqlite.prepare('SELECT attivita FROM presenza WHERE player_id = ?').get(amico.id)
    expect(riga?.attivita).toBe('scarabocchi')
  })

  it('il telefono senza fili vuole almeno tre giocatori', async () => {
    const b = banco()
    const { host, codice } = await stanzaCon(b, 2, 'telefono')
    expect((await b.chiama('POST', `/scarabocchi/stanze/${codice}/via`, host)).status).toBe(409)
  })
})

describe('Indovina il disegno, dalle API', () => {
  it('chi disegna sceglie, gli altri vedono solo l’indizio, e chi indovina prende i punti', async () => {
    const b = banco()
    const { host, giocatori, codice } = await stanzaCon(b, 3)
    const via = await ok(b.chiama<VistaStanzaScarabocchi>('POST', `/scarabocchi/stanze/${codice}/via`, host))
    expect(via).toMatchObject({ stato: 'partita', numero: 1 })
    const p = via.partita as VistaIndovina
    const chi = perId(giocatori).get(p.disegnatore!)!
    const altri = giocatori.filter((g) => g !== chi)

    // Le tre parole le vede solo chi disegna.
    const sue = (await ok(guarda(b, chi, codice))).partita as VistaIndovina
    expect(sue.scelte?.map((s) => s.livello)).toEqual(['facile', 'normale', 'difficile'])
    expect(((await ok(guarda(b, altri[0], codice))).partita as VistaIndovina).scelte).toBeNull()
    const parola = sue.scelte![0].parola

    // Solo chi disegna sceglie.
    expect((await b.chiama('POST', `/scarabocchi/stanze/${codice}/scegli`, altri[0], { indice: 0 })).status).toBe(409)
    const scelta = await ok(
      b.chiama<VistaStanzaScarabocchi>('POST', `/scarabocchi/stanze/${codice}/scegli`, chi, { indice: 0 }),
    )
    expect((scelta.partita as VistaIndovina).parola).toBe(parola)

    // Chi indovina non vede la parola, ne' in chiaro ne' fra le risposte degli altri.
    const vede = await ok(guarda(b, altri[0], codice))
    const pv = vede.partita as VistaIndovina
    expect(pv.parola).toBeNull()
    expect(pv.indizio).toBe('_'.repeat(parola.length))
    expect(JSON.stringify(vede)).not.toContain(`"${parola}"`)

    // I tratti di chi disegna arrivano a chi guarda, a pezzi e in fila.
    const tratto = codificaOps([{ tipo: 'tratto', colore: 0, spessore: 1, punti: [10, 10, 20, 20] }])
    const foglio = pv.foglio
    await ok(b.chiama('POST', `/scarabocchi/stanze/${codice}/tratti`, chi, { numero: 1, foglio, n: 0, dati: tratto }))
    await ok(b.chiama('POST', `/scarabocchi/stanze/${codice}/tratti`, chi, { numero: 1, foglio, n: 0, dati: tratto }))
    const suo = { numero: 1, foglio, n: 1, dati: tratto }
    expect((await b.chiama('POST', `/scarabocchi/stanze/${codice}/tratti`, altri[0], suo)).status).toBe(409)
    const coi = await ok(guarda(b, altri[0], codice, `?foglio=${foglio}&da=0`))
    expect(coi.tratti).toEqual({ foglio, da: 0, pezzi: [tratto] })
    expect((await ok(guarda(b, altri[0], codice, `?foglio=${foglio}&da=1`))).tratti?.pezzi).toEqual([])

    // Una risposta sbagliata la vedono tutti; quella giusta dice solo chi l'ha data.
    avanza(4_000)
    await ok(b.chiama('POST', `/scarabocchi/stanze/${codice}/tentativo`, altri[0], { testo: 'zzzz' }))
    const giusta = await ok(
      b.chiama<VistaStanzaScarabocchi>('POST', `/scarabocchi/stanze/${codice}/tentativo`, altri[1], {
        testo: parola.toUpperCase(),
      }),
    )
    const mio = giusta.messaggi.find((m) => m.esito === 'giusta')!
    expect(mio).toMatchObject({ playerId: altri[1].id, testo: parola.toUpperCase() })
    expect(mio.punti).toBeGreaterThan(250)
    const degliAltri = (await ok(guarda(b, altri[0], codice))).messaggi
    expect(degliAltri.find((m) => m.esito === 'giusta')?.testo).toBeNull()
    expect(degliAltri.find((m) => m.testo === 'zzzz')).toBeTruthy()
    // Chi l'ha indovinata la vede, e non risponde una seconda volta.
    expect((giusta.partita as VistaIndovina).parola).toBe(parola)
    const ancora = await b.chiama('POST', `/scarabocchi/stanze/${codice}/tentativo`, altri[1], { testo: parola })
    expect(ancora.status).toBe(409)

    // L'ultimo che indovina chiude il turno: la parola la vedono tutti, con i punti.
    avanza(2_000)
    const chiuso = await ok(
      b.chiama<VistaStanzaScarabocchi>('POST', `/scarabocchi/stanze/${codice}/tentativo`, altri[0], {
        testo: `un ${parola}`,
      }),
    )
    const pc = chiuso.partita as VistaIndovina
    expect(pc).toMatchObject({ fase: 'rivela', parola })
    expect(pc.ultimo?.indovinati).toBe(2)
    expect(pc.ultimo?.punti[chi.id]).toBeGreaterThan(0)
    expect(chiuso.messaggi.find((m) => m.playerId === altri[1].id && m.esito === 'giusta')?.testo).toBe(
      parola.toUpperCase(),
    )

    // Dopo la rivelazione tocca a un altro.
    avanza(RIVELA_MS + 10)
    presenti(b, ...giocatori)
    const dopo = (await ok(guarda(b, host, codice))).partita as VistaIndovina
    expect(dopo).toMatchObject({ turno: 1, fase: 'scelta' })
    expect(dopo.disegnatore).not.toBe(chi.id)
  })

  it('a partita finita la galleria ha tutti i disegni, e i tratti si chiedono uno alla volta', async () => {
    const b = banco()
    const { host, giocatori, codice } = await stanzaCon(b, 2)
    await ok(b.chiama('POST', `/scarabocchi/stanze/${codice}/impostazioni`, host, { impostazioni: { giri: 1 } }))
    await ok(b.chiama('POST', `/scarabocchi/stanze/${codice}/via`, host))
    // Nessuno sceglie e nessuno indovina: due turni passano da soli.
    for (let i = 0; i < 2; i += 1) {
      avanza(SCELTA_MS + 80_000 + RIVELA_MS + 100)
      presenti(b, ...giocatori)
      await ok(guarda(b, host, codice))
    }
    const fine = await ok(guarda(b, host, codice))
    expect(fine.stato).toBe('finita')
    expect((fine.partita as VistaIndovina).fase).toBe('finita')
    const album = await ok(b.chiama<AlbumScarabocchi>('GET', `/scarabocchi/stanze/${codice}/album`, host))
    expect(album.modo === 'indovina' && album.disegni.map((d) => d.foglio)).toEqual(['t0', 't1'])
    const foglio = await ok(b.chiama<{ pezzi: string[] }>('GET', `/scarabocchi/stanze/${codice}/fogli/t0`, host))
    expect(foglio.pezzi).toEqual([])
  })
})

describe('Telefono senza fili, dalle API', () => {
  it('ognuno scrive, poi disegna la frase di un altro, e l’album racconta ogni catena', async () => {
    const b = banco()
    const { host, giocatori, codice } = await stanzaCon(b, 3, 'telefono')
    const via = await ok(b.chiama<VistaStanzaScarabocchi>('POST', `/scarabocchi/stanze/${codice}/via`, host))
    expect((via.partita as VistaTelefono).tipo).toBe('scrivi')

    // Passo 0: ognuno scrive la sua frase; la bozza resta, la consegna chiude.
    const compiti = new Map<string, NonNullable<VistaTelefono['compito']>>()
    for (const g of giocatori) {
      const v = (await ok(guarda(b, g, codice))).partita as VistaTelefono
      compiti.set(g.id, v.compito!)
    }
    expect(new Set([...compiti.values()].map((c) => c.catena)).size).toBe(3)
    const [a, bb, c] = giocatori
    const bozza = await ok(
      b.chiama<VistaStanzaScarabocchi>('POST', `/scarabocchi/stanze/${codice}/foglio`, a, {
        numero: 1,
        catena: compiti.get(a.id)!.catena,
        passo: 0,
        testo: 'Un gatto ',
      }),
    )
    expect((bozza.partita as VistaTelefono).compito).toMatchObject({ bozza: 'Un gatto', consegnato: false })
    for (const g of giocatori) {
      await ok(
        b.chiama('POST', `/scarabocchi/stanze/${codice}/foglio`, g, {
          numero: 1,
          catena: compiti.get(g.id)!.catena,
          passo: 0,
          testo: `La frase di ${g.nickname}`,
          consegna: true,
        }),
      )
    }

    // Passo 1: hanno consegnato tutti, quindi si disegna subito, la frase di un altro.
    const disegno = (await ok(guarda(b, a, codice))).partita as VistaTelefono
    expect(disegno).toMatchObject({ passo: 1, tipo: 'disegna' })
    const spunto = disegno.compito!.spunto
    expect(spunto?.tipo).toBe('testo')
    expect(spunto?.tipo === 'testo' && spunto.testo).not.toBe(`La frase di ${a.nickname}`)
    const tratto = codificaOps([{ tipo: 'tratto', colore: 3, spessore: 2, punti: [100, 100, 200, 300] }])
    for (const g of giocatori) {
      const comp = ((await ok(guarda(b, g, codice))).partita as VistaTelefono).compito!
      const pezzo = { numero: 1, foglio: comp.foglio, n: 0, dati: tratto }
      await ok(b.chiama('POST', `/scarabocchi/stanze/${codice}/tratti`, g, pezzo))
      // Il foglio di un altro non si tocca.
      if (g === a) {
        const altro = comp.catena === 0 ? 'c1p1' : 'c0p1'
        const fuori = { numero: 1, foglio: altro, n: 0, dati: tratto }
        expect((await b.chiama('POST', `/scarabocchi/stanze/${codice}/tratti`, g, fuori)).status).toBe(409)
      }
      await ok(
        b.chiama('POST', `/scarabocchi/stanze/${codice}/foglio`, g, {
          numero: 1,
          catena: comp.catena,
          passo: 1,
          consegna: true,
        }),
      )
    }

    // Passo 2: si descrive il disegno di un altro, che si chiede intero.
    const descrivi = (await ok(guarda(b, bb, codice))).partita as VistaTelefono
    expect(descrivi).toMatchObject({ passo: 2, tipo: 'descrivi' })
    const daVedere = descrivi.compito!.spunto
    expect(daVedere?.tipo).toBe('disegno')
    const visto = await ok(
      b.chiama<{ pezzi: string[] }>(
        'GET',
        `/scarabocchi/stanze/${codice}/fogli/${daVedere?.tipo === 'disegno' ? daVedere.foglio : ''}`,
        bb,
      ),
    )
    expect(visto.pezzi).toEqual([tratto])
    // Il proprio disegno di prima, di un'altra catena, non lo si rivede: non e' lo spunto.
    const mioPrima = compiti.get(bb.id)!.catena
    expect(
      (await b.chiama('GET', `/scarabocchi/stanze/${codice}/fogli/c${(mioPrima + 1) % 3}p0`, bb)).status,
    ).toBe(403)

    // Il tempo finisce senza le descrizioni: l'album c'e' lo stesso.
    avanza(60_000)
    presenti(b, ...giocatori)
    const fine = await ok(guarda(b, c, codice))
    expect(fine.stato).toBe('finita')
    const album = await ok(b.chiama<AlbumScarabocchi>('GET', `/scarabocchi/stanze/${codice}/album?catena=0`, c))
    expect(album.modo).toBe('telefono')
    if (album.modo !== 'telefono') return
    const fogli = album.catene[0].fogli
    expect(fogli.map((f) => f.tipo)).toEqual(['scrivi', 'disegna', 'descrivi'])
    expect(fogli[0].testo).toMatch(/^La frase di pittore\d$/)
    expect(fogli[1].tratti).toBe(tratto)
    expect(fogli[2].testo).toBeNull()
    // Nessuno compare due volte nella stessa catena.
    expect(new Set(fogli.map((f) => f.autore.id)).size).toBe(3)
  })
})
