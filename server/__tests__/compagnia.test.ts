import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Dawg } from '../../shared/dawg'
import { leggioDa, sacchettoDelGiorno, tabelloneVuoto } from '../../shared/scarabeo'
import { mosseLegali } from '../../shared/scarabeo-motore'
import { puntiScarabeo } from '../../shared/punti'
import type {
  CompagniaHost,
  CruciverbaEsito,
  CruciverbaLeaderboard,
  CruciverbaState,
  GeneraleLeaderboard,
  InvitabileCompagnia,
  PresenzaRisposta,
  ScarabeoLeaderboard,
  ScarabeoState,
  VistaCompagnia,
} from '../../shared/types'
import { giornata as giornataCruciverba } from '../lib/cruciverbaStore'
import { puntiClassificateDi } from '../lib/generale'
import { giornata as giornataScarabeo } from '../lib/scarabeoStore'
import { banco, type Giocatore } from './banco'

type Banco = ReturnType<typeof banco>

/*
 *   C A N E
 *   A # # R
 *   S O L E
 *   A # # A
 */
const SOLUZIONE = 'canea##rsolea##a'

function conSchema(): Banco {
  const b = banco()
  b.db.sqlite
    .prepare(
      `INSERT INTO cruciverba_schemi (puzzle_number, righe, colonne, soluzione, definizioni, created_at)
       VALUES (?, 4, 4, ?, ?, '2026-09-26T00:00:00.000Z')`,
    )
    .run(giornataCruciverba().puzzleNumber, SOLUZIONE, JSON.stringify({ o0: { t: 'Il migliore amico', v: 'cane' } }))
  return b
}

/** Anna invita, Bruno accetta: la compagnia del cruciverba di oggi. */
async function insieme(b: Banco, anna: Giocatore, bruno: Giocatore, gioco = 'cruciverba'): Promise<string> {
  await b.chiama('GET', `/${gioco}/state`, anna)
  const invito = await b.chiama<CompagniaHost>('POST', `/compagnia/${gioco}/invita`, anna, { playerId: bruno.id })
  expect(invito.status).toBe(201)
  const arrivati = (await b.chiama<PresenzaRisposta>('POST', '/presenza', bruno, { attivita: 'hub' })).dati
  expect(arrivati.compagnia).toHaveLength(1)
  expect(arrivati.compagnia[0]).toMatchObject({ gioco, host: { nickname: 'anna' }, conta: true, cominciata: false })
  const accettato = await b.chiama<{ conta: boolean }>('POST', `/compagnia/partita/${invito.dati.id}/accetta`, bruno)
  expect(accettato.status).toBe(200)
  expect(accettato.dati.conta).toBe(true)
  return invito.dati.id
}

describe('il cruciverba in compagnia', () => {
  it('chi accetta guarda la griglia dell’host, suggerisce, e prende i suoi punti', async () => {
    const b = conSchema()
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    const id = await insieme(b, anna, bruno)

    // La giornata di Bruno e' quella di Anna: la sua griglia non si scrive piu'.
    const suo = (await b.chiama<CruciverbaState>('GET', '/cruciverba/state', bruno)).dati
    expect(suo.inCompagnia).toMatchObject({ id, host: { nickname: 'anna' }, punti: null })
    const scritta = await b.chiama('PUT', '/cruciverba/lettere', bruno, { lettere: SOLUZIONE, versione: suo.versione })
    expect(scritta).toMatchObject({ status: 409, dati: { code: 'GIOCATA_INSIEME' } })

    // Un suggerimento sbagliato passa come uno giusto: il server non dice se una parola e' giusta.
    const sbagliato = await b.chiama('POST', `/compagnia/partita/${id}/suggerisci`, bruno, {
      definizione: 'o0',
      parola: 'cono',
    })
    expect(sbagliato.status).toBe(201)
    const lunga = await b.chiama('POST', `/compagnia/partita/${id}/suggerisci`, bruno, {
      definizione: 'o0',
      parola: 'canetto',
    })
    expect(lunga.status).toBe(400)
    // Lo stesso invitato sulla stessa definizione: il nuovo prende il posto del vecchio.
    await b.chiama('POST', `/compagnia/partita/${id}/suggerisci`, bruno, { definizione: 'o0', parola: 'cane' })
    const host = (await b.chiama<CompagniaHost>('GET', '/compagnia/cruciverba', anna)).dati
    expect(host.ospiti).toMatchObject([{ nickname: 'bruno', stato: 'dentro', suggerimenti: 1 }])
    expect(host.suggerimenti).toHaveLength(1)
    expect(host.suggerimenti[0]).toMatchObject({
      da: { nickname: 'bruno' },
      usato: false,
      proposta: { gioco: 'cruciverba', definizione: 'o0', parola: 'cane' },
    })

    // Vista da Bruno: lo schema di Anna, senza soluzione finché non e' finito.
    const vista = (await b.chiama<VistaCompagnia>('GET', `/compagnia/partita/${id}`, bruno)).dati
    expect(vista).toMatchObject({ gioco: 'cruciverba', conta: true, mioPunteggio: null })
    expect((vista.partita as CruciverbaState).soluzione).toBeNull()

    // Anna lo completa: Bruno prende gli stessi punti, e la sua giornata si chiude con la sua.
    const anni = (await b.chiama<CruciverbaState>('GET', '/cruciverba/state', anna)).dati
    const fatto = await b.chiama<CruciverbaEsito>('PUT', '/cruciverba/lettere', anna, {
      lettere: SOLUZIONE,
      versione: anni.versione,
      tempoMs: 60_000,
    })
    expect(fatto.dati.status).toBe('done')
    const dopo = (await b.chiama<VistaCompagnia>('GET', `/compagnia/partita/${id}`, bruno)).dati
    expect(dopo.mioPunteggio).toBe(fatto.dati.punti)
    expect((dopo.partita as CruciverbaState).soluzione).toBe(SOLUZIONE)
    expect(dopo.suggerimenti[0].usato).toBe(true)

    // In classifica valgono uguale; a pari punti passa avanti chi li ha fatti da solo.
    const classifica = (await b.chiama<CruciverbaLeaderboard>('GET', '/leaderboard/cruciverba?scope=today', bruno)).dati
    expect(classifica.rows.map((r) => [r.nickname, r.punti, r.assist])).toEqual([
      ['anna', fatto.dati.punti, 0],
      ['bruno', fatto.dati.punti, fatto.dati.punti],
    ])
    const generale = (await b.chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', bruno)).dati
    expect(generale.rows.map((r) => r.nickname)).toEqual(['anna', 'bruno'])
    expect(generale.me).toMatchObject({ punti: fatto.dati.punti, assist: fatto.dati.punti })
    // La Fortuna legge gli stessi punti della generale.
    const n = giornataCruciverba().puzzleNumber
    expect(await puntiClassificateDi(b.db as unknown as D1Database, bruno.id, n)).toBe(fatto.dati.punti)
    const riepilogo = await b.chiama<{ inCompagnia: unknown; punti: number }>('GET', '/cruciverba/summary', bruno)
    expect(riepilogo.dati).toMatchObject({ punti: fatto.dati.punti, inCompagnia: { host: { nickname: 'anna' } } })
  })

  it('chi l’ha già finito guarda e suggerisce, e i suoi punti restano i suoi', async () => {
    const b = conSchema()
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    const suo = (await b.chiama<CruciverbaState>('GET', '/cruciverba/state', bruno)).dati
    await b.chiama('PUT', '/cruciverba/lettere', bruno, { lettere: SOLUZIONE, versione: suo.versione })

    await b.chiama('GET', '/cruciverba/state', anna)
    const invito = (await b.chiama<CompagniaHost>('POST', '/compagnia/cruciverba/invita', anna, { playerId: bruno.id }))
      .dati
    const arrivato = (await b.chiama<PresenzaRisposta>('POST', '/presenza', bruno, { attivita: 'hub' })).dati
    expect(arrivato.compagnia[0]).toMatchObject({ conta: false })
    const accettato = await b.chiama<{ conta: boolean }>('POST', `/compagnia/partita/${invito.id}/accetta`, bruno)
    expect(accettato.dati.conta).toBe(false)
    const vista = (await b.chiama<VistaCompagnia>('GET', `/compagnia/partita/${invito.id}`, bruno)).dati
    expect(vista).toMatchObject({ conta: false, mioPunteggio: null })
    const riepilogo = await b.chiama<{ status: string; punti: number; inCompagnia?: unknown }>(
      'GET',
      '/cruciverba/summary',
      bruno,
    )
    expect(riepilogo.dati.status).toBe('done')
    expect(riepilogo.dati.inCompagnia).toBeFalsy()
  })

  it('chi l’aveva cominciato lo sa prima di accettare, e quel che aveva fatto non conta più', async () => {
    const b = conSchema()
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    const suo = (await b.chiama<CruciverbaState>('GET', '/cruciverba/state', bruno)).dati
    const meta = 'cane' + suo.lettere.slice(4)
    await b.chiama('PUT', '/cruciverba/lettere', bruno, { lettere: meta, versione: suo.versione })

    await b.chiama('GET', '/cruciverba/state', anna)
    const invito = (await b.chiama<CompagniaHost>('POST', '/compagnia/cruciverba/invita', anna, { playerId: bruno.id }))
      .dati
    const arrivato = (await b.chiama<PresenzaRisposta>('POST', '/presenza', bruno, { attivita: 'hub' })).dati
    expect(arrivato.compagnia[0]).toMatchObject({ conta: true, cominciata: true })
    expect((await b.chiama<{ conta: boolean }>('POST', `/compagnia/partita/${invito.id}/accetta`, bruno)).dati.conta)
      .toBe(true)
  })

  it('non si entra in una partita finita, e un host non gioca in compagnia di altri', async () => {
    const b = conSchema()
    const [anna, bruno, carla] = [await b.giocatore('anna'), await b.giocatore('bruno'), await b.giocatore('carla')]
    const id = await insieme(b, anna, bruno)

    // Bruno gioca con Anna: non puo' invitare nessuno a una partita che non e' sua.
    const suo = await b.chiama('POST', '/compagnia/cruciverba/invita', bruno, { playerId: carla.id })
    expect(suo.status).toBe(409)
    // Carla non puo' invitare Bruno, che e' gia' occupato, e lo vede nell'elenco.
    await b.chiama('GET', '/cruciverba/state', carla)
    const elenco = (
      await b.chiama<{ giocatori: InvitabileCompagnia[] }>('GET', '/compagnia/cruciverba/giocatori', carla)
    ).dati.giocatori
    expect(elenco.find((g) => g.nickname === 'bruno')).toMatchObject({ occupato: true })
    // Anna ha qualcuno nella sua partita: non accetta un invito di Carla.
    expect(elenco.find((g) => g.nickname === 'anna')).toMatchObject({ occupato: true })
    const invitoCarla = await b.chiama<CompagniaHost>('POST', '/compagnia/cruciverba/invita', carla, {
      playerId: anna.id,
    })
    expect(invitoCarla.status).toBe(201)
    expect((await b.chiama('POST', `/compagnia/partita/${invitoCarla.dati.id}/accetta`, anna)).status).toBe(409)

    // Anna finisce: un invito rimasto in sospeso non si puo' piu' accettare.
    const dave = await b.giocatore('dave')
    await b.chiama('POST', '/compagnia/cruciverba/invita', anna, { playerId: dave.id })
    const anni = (await b.chiama<CruciverbaState>('GET', '/cruciverba/state', anna)).dati
    await b.chiama('PUT', '/cruciverba/lettere', anna, { lettere: SOLUZIONE, versione: anni.versione })
    const perDave = await b.chiama<PresenzaRisposta>('POST', '/presenza', dave, { attivita: 'hub' })
    expect(perDave.dati.compagnia).toEqual([])
    expect((await b.chiama('POST', `/compagnia/partita/${id}/accetta`, dave)).status).toBe(409)
    // E dopo non si suggerisce piu'.
    const tardi = await b.chiama('POST', `/compagnia/partita/${id}/suggerisci`, bruno, {
      definizione: 'o0',
      parola: 'cane',
    })
    expect(tardi.status).toBe(409)
  })

  it('solo chi e’ dentro guarda, e chi ha accettato non si manda via', async () => {
    const b = conSchema()
    const [anna, bruno, carla] = [await b.giocatore('anna'), await b.giocatore('bruno'), await b.giocatore('carla')]
    const id = await insieme(b, anna, bruno)
    expect((await b.chiama('GET', `/compagnia/partita/${id}`, carla)).status).toBe(403)
    await b.chiama('POST', '/compagnia/cruciverba/invita', anna, { playerId: carla.id })
    // Invitata ma non ancora dentro: non guarda.
    expect((await b.chiama('GET', `/compagnia/partita/${id}`, carla)).status).toBe(403)
    expect((await b.chiama('POST', '/compagnia/cruciverba/ritira', anna, { playerId: carla.id })).status).toBe(200)
    expect((await b.chiama('POST', '/compagnia/cruciverba/ritira', anna, { playerId: bruno.id })).status).toBe(409)
    const perCarla = await b.chiama<PresenzaRisposta>('POST', '/presenza', carla, { attivita: 'hub' })
    expect(perCarla.dati.compagnia).toEqual([])
  })
})

const dawg = Dawg.da(readFileSync(join(__dirname, '..', '..', 'public', 'scarabeo', 'dizionario.dawg')))

describe('lo Scarabeo in compagnia', () => {
  it('le pose suggerite si controllano, e chi gioca con l’host ha i suoi punti mossa dopo mossa', async () => {
    const b = banco()
    const numero = giornataScarabeo().puzzleNumber
    b.db.sqlite
      .prepare(`INSERT INTO scarabeo_computer (puzzle_number, punti, mosse, created_at) VALUES (?, 200, NULL, 'x')`)
      .run(numero)
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    const id = await insieme(b, anna, bruno, 'scarabeo')

    const { leggio } = leggioDa(sacchettoDelGiorno(numero), [])
    const legali = mosseLegali(dawg, tabelloneVuoto(), leggio, true).sort((x, y) => y.punti - x.punti)
    const [migliore, altra] = [legali[0], legali.find((m) => m.punti < legali[0].punti)!]

    // Una posa fuori dalla stella non si suggerisce: l'host vedrebbe una mossa che non puo' giocare.
    const storta = await b.chiama('POST', `/compagnia/partita/${id}/suggerisci`, bruno, {
      posa: migliore.posa.map((t) => ({ ...t, r: 0 })),
    })
    expect(storta.status).toBe(422)
    const buona = await b.chiama<VistaCompagnia>('POST', `/compagnia/partita/${id}/suggerisci`, bruno, {
      posa: migliore.posa,
    })
    expect(buona.status).toBe(201)
    const proposta = buona.dati.suggerimenti[0].proposta
    expect(proposta).toMatchObject({ gioco: 'scarabeo', turno: 0, punti: migliore.punti })

    // Le mosse non sono di Bruno.
    expect((await b.chiama('POST', '/scarabeo/mossa', bruno, { posa: migliore.posa })).status).toBe(409)
    expect((await b.chiama('POST', '/scarabeo/passo', bruno)).status).toBe(409)

    // Anna gioca un'altra mossa: il suggerimento del turno passato sparisce, e Bruno ha i suoi punti.
    const mossa = await b.chiama<ScarabeoState>('POST', '/scarabeo/mossa', anna, { posa: altra.posa })
    expect(mossa.status).toBe(200)
    const vista = (await b.chiama<VistaCompagnia>('GET', `/compagnia/partita/${id}`, bruno)).dati
    expect(vista.suggerimenti).toEqual([])
    expect(vista.mioPunteggio).toBe(puntiScarabeo(altra.punti, 200))
    const oggi = (await b.chiama<ScarabeoLeaderboard>('GET', '/leaderboard/scarabeo?scope=today', bruno)).dati
    expect(oggi.rows.map((r) => [r.nickname, r.punti, r.assist, r.inCorso])).toEqual([
      ['anna', puntiScarabeo(altra.punti, 200), 0, true],
      ['bruno', puntiScarabeo(altra.punti, 200), puntiScarabeo(altra.punti, 200), true],
    ])

    // Anna chiude la giornata: si chiude anche quella di Bruno.
    await b.chiama('POST', '/scarabeo/chiudi', anna)
    const chiusa = (await b.chiama<ScarabeoLeaderboard>('GET', '/leaderboard/scarabeo?scope=today', bruno)).dati
    expect(chiusa.rows.every((r) => !r.inCorso)).toBe(true)
    const riepilogo = await b.chiama<{ status: string; puntiClassifica: number }>('GET', '/scarabeo/summary', bruno)
    expect(riepilogo.dati).toMatchObject({ status: 'done', puntiClassifica: puntiScarabeo(altra.punti, 200) })
    expect(await puntiClassificateDi(b.db as unknown as D1Database, bruno.id, numero)).toBe(
      puntiScarabeo(altra.punti, 200),
    )
  })
})
