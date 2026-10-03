import { describe, expect, it } from 'vitest'
import { PARTITE_TRIS, TEMPO_MOSSA_TRIS_MS, puntiTris, rigioca, vincentiSubito } from '../../shared/tris'
import { valoriDelleMosse } from '../../shared/tris-computer'
import type { GeneraleLeaderboard, OggiRisposta, TrisLeaderboard, TrisStato } from '../../shared/types'
import { puntiClassificateDi } from '../lib/generale'
import { ordinaTris, type TotaliTris } from '../lib/trisStore'
import { today } from '../lib/wordleStore'
import { banco, type Giocatore } from './banco'

type Chiama = ReturnType<typeof banco>['chiama']

const stato = async (chiama: Chiama, chi: Giocatore) => (await chiama<TrisStato>('GET', '/tris/state', chi)).dati

/** La mossa migliore per chi gioca: vince se puo', subito se puo', altrimenti tiene la patta. */
function mossaBuona(mosse: number[]): number {
  const p = rigioca(mosse)!
  const valori = valoriDelleMosse(p)
  const subito = vincentiSubito(p)
  if (subito.length > 0) return subito[0]
  const migliore = Math.max(...valori.values())
  return [...valori].find(([, v]) => v === migliore)![0]
}

/** Gioca bene tutta la partita in corso, mossa per mossa, e restituisce lo stato alla fine. */
async function giocaLaPartita(chiama: Chiama, chi: Giocatore, s: TrisStato): Promise<TrisStato> {
  let adesso = s
  for (;;) {
    const corrente = adesso.partite[adesso.partite.length - 1]
    if (corrente.esito !== null) return adesso
    const r = await chiama<TrisStato>('POST', '/tris/mossa', chi, {
      versione: adesso.versione,
      casella: mossaBuona(corrente.mosse),
    })
    expect(r.status).toBe(200)
    adesso = r.dati
  }
}

/** Porta indietro l'orologio della mossa: come se fossero passati `ms` millisecondi. */
function indietro(db: ReturnType<typeof banco>['db'], chi: Giocatore, ms: number) {
  db.sqlite
    .prepare('UPDATE tris_partite SET mossa_at = ? WHERE player_id = ?')
    .run(new Date(Date.now() - ms).toISOString(), chi.id)
}

describe('la classifica del tris', () => {
  const g = (nickname: string, punti: number, giornate: number, vinte: number): TotaliTris => ({
    playerId: nickname,
    nickname,
    displayName: nickname,
    avatarColor: '#000',
    punti,
    giornate,
    vinte,
    patte: 0,
    inCorso: giornate === 0,
  })

  it('punti prima, poi chi ha vinto di piu’, e chi non ha finito in fondo', () => {
    const righe = ordinaTris([g('patte', 30, 1, 0), g('aperto', 0, 0, 0), g('vittorie', 30, 1, 2), g('poco', 18, 1, 1)])
    expect(righe.map((r) => r.nickname)).toEqual(['vittorie', 'patte', 'poco', 'aperto'])
  })
})

describe('la serie del giorno, dalle API', () => {
  it('guardare non apre niente: la serie nasce con la prima partita', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('anna')
    const vuoto = await stato(chiama, io)
    expect(vuoto).toMatchObject({ status: 'playing', partite: [], versione: 0, totale: PARTITE_TRIS, restanteMs: null })
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.tris).toMatchObject({ status: 'new', esiti: [] })
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM tris_partite').get()?.n).toBe(0)

    const prima = (await chiama<TrisStato>('POST', '/tris/partita', io, { versione: 0 })).dati
    // La prima la comincia chi gioca, con la X: nessuna mossa, e il tempo che corre.
    expect(prima.partite).toEqual([{ mosse: [], segno: 0, esito: null, tempo: false }])
    expect(prima.restanteMs).toBeGreaterThan(TEMPO_MOSSA_TRIS_MS - 2_000)
    expect(prima.restanteMs).toBeLessThanOrEqual(TEMPO_MOSSA_TRIS_MS)
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.tris.status).toBe('playing')
  })

  it('la mossa ha la risposta del computer, e una mossa sbagliata o vecchia non passa', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('bruno')
    const s = (await chiama<TrisStato>('POST', '/tris/partita', io, { versione: 0 })).dati
    expect((await chiama('POST', '/tris/mossa', io, { versione: s.versione, casella: 9 })).status).toBe(400)
    expect((await chiama('POST', '/tris/mossa', io, { versione: s.versione, casella: '4' })).status).toBe(400)
    const dopo = await chiama<TrisStato>('POST', '/tris/mossa', io, { versione: s.versione, casella: 4 })
    expect(dopo.status).toBe(200)
    expect(dopo.dati.partite[0].mosse).toHaveLength(2)
    expect(dopo.dati.partite[0].mosse[0]).toBe(4)
    // Il doppio tocco: la stessa versione una seconda volta.
    expect((await chiama('POST', '/tris/mossa', io, { versione: s.versione, casella: 0 })).status).toBe(409)
    // Una casella gia' presa.
    const presa = dopo.dati.partite[0].mosse[1]
    expect((await chiama('POST', '/tris/mossa', io, { versione: dopo.dati.versione, casella: presa })).status).toBe(400)
  })

  it('cinque partite giocate bene: la serie si chiude con i suoi punti, in classifica e nella generale', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('carla')
    let s = await stato(chiama, io)
    for (let k = 0; k < PARTITE_TRIS; k += 1) {
      const r = await chiama<TrisStato>('POST', '/tris/partita', io, { versione: s.versione })
      expect(r.status).toBe(200)
      // Nella seconda e nella quarta comincia il computer: la sua mossa e' gia' li'.
      expect(r.dati.partite[k].mosse).toHaveLength(k % 2 === 0 ? 0 : 1)
      expect(r.dati.partite[k].segno).toBe(k % 2 === 0 ? 0 : 1)
      s = await giocaLaPartita(chiama, io, r.dati)
      expect(s.restanteMs).toBeNull()
    }
    // Chi gioca bene non perde mai.
    expect(s.partite.every((p) => p.esito !== 'persa')).toBe(true)
    const vinte = s.partite.filter((p) => p.esito === 'vinta').length
    const patte = s.partite.filter((p) => p.esito === 'patta').length
    expect(s.status).toBe('done')
    expect(s.punti).toBe(puntiTris(vinte, patte))
    // Una sesta no.
    expect((await chiama('POST', '/tris/partita', io, { versione: s.versione })).status).toBe(409)

    const classifica = (await chiama<TrisLeaderboard>('GET', '/leaderboard/tris?scope=today', io)).dati
    expect(classifica.me).toMatchObject({ rank: 1, punti: s.punti, giornate: 1, vinte, patte, inCorso: false })
    const generale = (await chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', io)).dati
    expect(generale.me?.perGioco.tris).toBe(s.punti)
    expect(generale.me?.partite).toBe(1)
    expect(await puntiClassificateDi(db as unknown as D1Database, io.id, today().puzzleNumber)).toBe(s.punti)
    expect((await chiama<OggiRisposta>('GET', '/oggi', io)).dati.tris).toMatchObject({
      status: 'done',
      punti: s.punti,
      esiti: s.partite.map((p) => p.esito),
    })
  })

  it('il tempo scaduto perde la partita: la chiude la prima richiesta, e la mossa tardi non vale', async () => {
    const { chiama, giocatore, db } = banco()
    const io = await giocatore('dario')
    const s = (await chiama<TrisStato>('POST', '/tris/partita', io, { versione: 0 })).dati

    // Dentro il margine della rete la mossa vale ancora.
    indietro(db, io, TEMPO_MOSSA_TRIS_MS + 1_000)
    const inTempo = await chiama<TrisStato>('POST', '/tris/mossa', io, { versione: s.versione, casella: 4 })
    expect(inTempo.dati.partite[0].mosse).toHaveLength(2)

    // Oltre, no: la partita e' persa per il tempo e la mossa non c'e'.
    indietro(db, io, TEMPO_MOSSA_TRIS_MS + 10_000)
    const tardi = await chiama<TrisStato>('POST', '/tris/mossa', io, { versione: inTempo.dati.versione, casella: 0 })
    expect(tardi.status).toBe(200)
    expect(tardi.dati.partite[0]).toMatchObject({ esito: 'persa', tempo: true })
    expect(tardi.dati.partite[0].mosse).toHaveLength(2)
    expect(tardi.dati.restanteMs).toBeNull()

    // Una partita lasciata a meta' la chiude anche solo guardare.
    const seconda = (await chiama<TrisStato>('POST', '/tris/partita', io, { versione: tardi.dati.versione })).dati
    indietro(db, io, TEMPO_MOSSA_TRIS_MS * 10)
    expect((await stato(chiama, io)).partite[1]).toMatchObject({ esito: 'persa', tempo: true })
    expect(seconda.partite[1].mosse).toHaveLength(1)
  })

  it('chi gioca puo’ dire che il suo tempo e’ finito, senza aspettare il margine', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('elena')
    const s = (await chiama<TrisStato>('POST', '/tris/partita', io, { versione: 0 })).dati
    const fine = (await chiama<TrisStato>('POST', '/tris/tempo', io, { versione: s.versione })).dati
    expect(fine.partite[0]).toMatchObject({ esito: 'persa', tempo: true })
    // Detto due volte, la seconda non tocca niente.
    const ancora = (await chiama<TrisStato>('POST', '/tris/tempo', io, { versione: s.versione })).dati
    expect(ancora.versione).toBe(fine.versione)
  })

  it('una serie non finita non da’ punti in classifica, e chi la sta giocando e’ in corso', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('franco')
    const s = (await chiama<TrisStato>('POST', '/tris/partita', io, { versione: 0 })).dati
    await giocaLaPartita(chiama, io, s)
    const classifica = (await chiama<TrisLeaderboard>('GET', '/leaderboard/tris?scope=today', io)).dati
    expect(classifica.me).toMatchObject({ punti: 0, giornate: 0, inCorso: true })
    const generale = (await chiama<GeneraleLeaderboard>('GET', '/leaderboard/generale?scope=today', io)).dati
    expect(generale.me?.perGioco.tris ?? 0).toBe(0)
  })
})
