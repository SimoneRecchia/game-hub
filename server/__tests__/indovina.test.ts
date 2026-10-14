import { describe, expect, it } from 'vitest'
import { PERSONE, VOCI_MINIME } from '../../shared/indovina'
import type { InvitoConLink, PresenzaRisposta, SalaIndovina, VistaIndovina } from '../../shared/types'
import { banco, type Giocatore } from './banco'

type Chiama = ReturnType<typeof banco>['chiama']

async function online(chiama: Chiama, chi: Giocatore): Promise<PresenzaRisposta> {
  return (await chiama<PresenzaRisposta>('POST', '/presenza', chi, { attivita: 'indovina' })).dati
}

const vista = async (chiama: Chiama, id: string, chi: Giocatore) =>
  (await chiama<VistaIndovina>('GET', `/indovina/partite/${id}`, chi)).dati

/** Anna invita Bruno con le persone, Bruno accetta: la partita comincia. */
async function partita(chiama: Chiama, anna: Giocatore, bruno: Giocatore): Promise<string> {
  await online(chiama, bruno)
  const invito = await chiama<{ id: string }>('POST', '/indovina/inviti', anna, {
    playerId: bruno.id,
    personaggi: { set: 'persone' },
  })
  expect(invito.status).toBe(201)
  const accettato = await chiama<{ partitaId: string }>('POST', `/indovina/inviti/${invito.dati.id}/accetta`, bruno)
  expect(accettato.status).toBe(200)
  return accettato.dati.partitaId
}

/** Chi ha il turno, e chi no, in una partita appena aperta. */
async function turni(chiama: Chiama, id: string, anna: Giocatore, bruno: Giocatore) {
  const a = await vista(chiama, id, anna)
  return a.tuoTurno ? { chiede: anna, risponde: bruno } : { chiede: bruno, risponde: anna }
}

describe('Indovina chi, dalle API', () => {
  it('un invito arriva con il giro di controllo, e accettandolo si pescano i due segreti', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')

    // Non si invita chi non e' online.
    const offline = await chiama('POST', '/indovina/inviti', anna, { playerId: bruno.id, personaggi: { set: 'persone' } })
    expect(offline.status).toBe(409)

    await online(chiama, bruno)
    const sala = (await chiama<SalaIndovina>('GET', '/indovina/sala', anna)).dati
    expect(sala.giocatori.map((g) => g.displayName)).toEqual(['bruno'])

    const invito = await chiama<{ id: string }>('POST', '/indovina/inviti', anna, {
      playerId: bruno.id,
      personaggi: { set: 'animali' },
    })
    const arrivati = (await online(chiama, bruno)).indovina
    expect(arrivati).toMatchObject([{ id: invito.dati.id, da: { displayName: 'anna' }, set: 'Animali', quanti: 24 }])
    expect((await chiama<SalaIndovina>('GET', '/indovina/sala', anna)).dati.invito).toMatchObject({
      stato: 'attesa',
      a: { displayName: 'bruno' },
    })

    // Solo l'invitato accetta, e una volta sola.
    expect((await chiama('POST', `/indovina/inviti/${invito.dati.id}/accetta`, anna)).status).toBe(409)
    const id = (await chiama<{ partitaId: string }>('POST', `/indovina/inviti/${invito.dati.id}/accetta`, bruno)).dati
      .partitaId
    const perAnna = await vista(chiama, id, anna)
    const perBruno = await vista(chiama, id, bruno)
    expect(perAnna.stato).toBe('in_corso')
    expect(perAnna.mioSegreto).toBeGreaterThanOrEqual(0)
    expect(perAnna.mioSegreto).toBeLessThan(24)
    // Il segreto dell'altro non si vede finché non e' finita.
    expect(perAnna.suoSegreto).toBeNull()
    expect(perBruno.suoSegreto).toBeNull()
    expect(perAnna.tuoTurno).not.toBe(perBruno.tuoTurno)
    expect((await online(chiama, anna)).partitaIndovina).toMatchObject({ id, avversario: { displayName: 'bruno' } })
  })

  it('domanda, risposta, facce abbassate e turno che passa', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const id = await partita(chiama, anna, bruno)
    const { chiede, risponde } = await turni(chiama, id, anna, bruno)

    let v = await vista(chiama, id, chiede)
    // Chi non ha il turno non chiede, e chi ha chiesto non risponde a se stesso.
    expect((await chiama('POST', `/indovina/partite/${id}/domanda`, risponde, { testo: 'Ha gli occhiali?', versione: v.versione })).status).toBe(409)
    expect((await chiama('POST', `/indovina/partite/${id}/domanda`, chiede, { testo: '   ', versione: v.versione })).status).toBe(400)
    v = (
      await chiama<VistaIndovina>('POST', `/indovina/partite/${id}/domanda`, chiede, {
        testo: '  Ha   gli occhiali? ',
        versione: v.versione,
      })
    ).dati
    expect(v.domanda).toEqual({ mia: true, testo: 'Ha gli occhiali?' })
    expect(v.tuoTurno).toBe(false)
    // Una seconda domanda con la stessa versione — un doppio tocco — non passa.
    expect((await chiama('POST', `/indovina/partite/${id}/domanda`, chiede, { testo: 'E il cappello?', versione: v.versione - 1 })).status).toBe(409)

    const perChiRisponde = await vista(chiama, id, risponde)
    expect(perChiRisponde.domanda).toEqual({ mia: false, testo: 'Ha gli occhiali?' })
    expect((await chiama('POST', `/indovina/partite/${id}/risposta`, chiede, { risposta: 'si', versione: perChiRisponde.versione })).status).toBe(409)
    expect((await chiama('POST', `/indovina/partite/${id}/risposta`, risponde, { risposta: 'forse!', versione: perChiRisponde.versione })).status).toBe(400)
    const dopo = (
      await chiama<VistaIndovina>('POST', `/indovina/partite/${id}/risposta`, risponde, {
        risposta: 'no',
        versione: perChiRisponde.versione,
      })
    ).dati
    // Chi ha risposto adesso ha il turno.
    expect(dopo.tuoTurno).toBe(true)
    expect(dopo.domanda).toBeNull()
    expect(dopo.mosse.map((m) => [m.t, m.mia])).toEqual([
      ['d', false],
      ['r', true],
    ])

    // Le facce abbassate sono di chi le abbassa; l'altro ne vede solo il conto.
    expect((await chiama('PUT', `/indovina/partite/${id}/abbassate`, chiede, { abbassate: [3, 1, 3, 30] })).status).toBe(400)
    expect((await chiama('PUT', `/indovina/partite/${id}/abbassate`, chiede, { abbassate: [3, 1, 3, 7] })).status).toBe(200)
    expect((await vista(chiama, id, chiede)).abbassate).toEqual([1, 3, 7])
    expect((await vista(chiama, id, risponde)).sueInPiedi).toBe(21)
    // Abbassare non cambia la versione: la mossa dell'altro, nello stesso momento, passa lo stesso.
    expect((await vista(chiama, id, risponde)).versione).toBe(dopo.versione)
  })

  it('chi indovina vince, chi sbaglia perde, e alla fine si vedono i due segreti', async () => {
    const { chiama, giocatore, db } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')

    for (const indovina of [true, false]) {
      const id = await partita(chiama, anna, bruno)
      const { chiede, risponde } = await turni(chiama, id, anna, bruno)
      const v = await vista(chiama, id, chiede)
      const riga = db.sqlite.prepare('SELECT segreto_a, segreto_b, giocatore_a FROM indovina_partite WHERE id = ?').get(id) as {
        segreto_a: number
        segreto_b: number
        giocatore_a: string
      }
      const suo = chiede.id === riga.giocatore_a ? riga.segreto_b : riga.segreto_a
      const k = indovina ? suo : (suo + 1) % PERSONE.length
      const fine = (await chiama<VistaIndovina>('POST', `/indovina/partite/${id}/ipotesi`, chiede, { k, versione: v.versione })).dati
      expect(fine).toMatchObject({
        stato: 'finita',
        vincitore: indovina ? 'io' : 'avversario',
        motivo: indovina ? 'indovinato' : 'sbagliato',
        suoSegreto: suo,
      })
      expect((await vista(chiama, id, risponde)).vincitore).toBe(indovina ? 'avversario' : 'io')
    }
  })

  it('un link si accetta aprendolo, anche da chi non e’ online, e dice di chi e’', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const carla = await giocatore('carla')
    const invito = await chiama<{ id: string; codice: string }>('POST', '/indovina/inviti', anna, {
      personaggi: { set: 'persone' },
    })
    expect(invito.dati.codice).toMatch(/^[a-z2-9]{10}$/)
    const pubblico = await chiama<InvitoConLink>('GET', `/inviti/${invito.dati.codice}`, null)
    expect(pubblico.dati).toMatchObject({ gioco: 'indovina', set: 'Persone', stato: 'attesa', da: { displayName: 'anna' } })

    expect((await chiama('POST', `/indovina/link/${invito.dati.codice}/accetta`, anna)).status).toBe(409)
    const id = (await chiama<{ partitaId: string }>('POST', `/indovina/link/${invito.dati.codice}/accetta`, bruno)).dati.partitaId
    // Riaprirlo e' idempotente per chi l'ha usato, e chiuso per tutti gli altri.
    expect((await chiama<{ partitaId: string }>('POST', `/indovina/link/${invito.dati.codice}/accetta`, bruno)).dati.partitaId).toBe(id)
    expect((await chiama('POST', `/indovina/link/${invito.dati.codice}/accetta`, carla)).status).toBe(409)
    expect((await chiama<InvitoConLink>('GET', `/inviti/${invito.dati.codice}`, null)).dati.stato).toBe('usato')
  })

  it('un set proprio porta nomi e impronte, niente foto; e va controllato', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const voci = Array.from({ length: VOCI_MINIME }, (_, i) => ({ nome: `Collega ${i}`, img: `${i}`.repeat(32) }))
    const buono = await chiama('POST', '/indovina/inviti', anna, { personaggi: { set: 'mio', nome: 'Ufficio', voci } })
    expect(buono.status).toBe(201)
    // Anche solo con i nomi, o con la foto di alcuni: chi non ce l'ha si gioca con il nome.
    const soliNomi = await chiama('POST', '/indovina/inviti', anna, {
      personaggi: { set: 'mio', nome: 'Calcetto', voci: voci.map(({ nome }, i) => (i === 0 ? voci[0] : { nome })) },
    })
    expect(soliNomi.status).toBe(201)

    const male = [
      { set: 'mio', nome: 'Pochi', voci: voci.slice(1) },
      { set: 'mio', nome: 'Doppi', voci: [...voci.slice(1), { ...voci[1] }] },
      { set: 'mio', nome: 'Foto vera', voci: voci.map((v) => ({ ...v, img: 'data:image/jpeg;base64,AAAA' })) },
      { set: 'altro' },
    ]
    for (const personaggi of male) {
      expect((await chiama('POST', '/indovina/inviti', anna, { personaggi })).status, personaggi.set).toBe(400)
    }
  })

  it('il canale delle foto: l’offerta di chi le chiede e la risposta di chi le ha, per lo stesso tentativo', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const id = await partita(chiama, anna, bruno)
    await chiama('POST', `/indovina/partite/${id}/segnale`, bruno, { tipo: 'offerta', sdp: 'v=0 offerta', n: 1 })
    expect((await vista(chiama, id, anna)).segnale).toEqual({
      offerta: { da: 'b', sdp: 'v=0 offerta', n: 1 },
      risposta: null,
    })
    // Una risposta a un tentativo vecchio non si scrive.
    expect((await chiama<{ ok: boolean }>('POST', `/indovina/partite/${id}/segnale`, anna, { tipo: 'risposta', sdp: 'v=0 vecchia', n: 7 })).dati.ok).toBe(false)
    await chiama('POST', `/indovina/partite/${id}/segnale`, anna, { tipo: 'risposta', sdp: 'v=0 risposta', n: 1 })
    expect((await vista(chiama, id, bruno)).segnale.risposta).toEqual({ da: 'a', sdp: 'v=0 risposta', n: 1 })
    // Un tentativo nuovo ricomincia da capo.
    await chiama('POST', `/indovina/partite/${id}/segnale`, bruno, { tipo: 'offerta', sdp: 'v=0 di nuovo', n: 2 })
    expect((await vista(chiama, id, anna)).segnale).toEqual({ offerta: { da: 'b', sdp: 'v=0 di nuovo', n: 2 }, risposta: null })
    expect((await chiama('POST', `/indovina/partite/${id}/segnale`, bruno, { tipo: 'offerta', sdp: 'x'.repeat(20_000), n: 3 })).status).toBe(400)
  })

  it('la rivincita: la chiede uno, chiederla anche l’altro e’ accettarla, e la serie continua', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const prima = await partita(chiama, anna, bruno)
    // Anna si arrende: vince Bruno.
    expect((await chiama<VistaIndovina>('POST', `/indovina/partite/${prima}/resa`, anna)).dati).toMatchObject({
      stato: 'finita',
      vincitore: 'avversario',
      motivo: 'resa',
    })
    await online(chiama, anna)
    const chiesta = await chiama<{ invitoId: string }>('POST', `/indovina/partite/${prima}/rivincita`, bruno)
    expect(chiesta.status).toBe(201)
    expect((await vista(chiama, prima, anna)).rivincita).toMatchObject({ da: 'avversario', stato: 'attesa' })
    expect((await online(chiama, anna)).indovina[0]).toMatchObject({ rivincita: true, da: { displayName: 'bruno' } })

    await online(chiama, bruno)
    const accettata = await chiama<{ partitaId: string }>('POST', `/indovina/partite/${prima}/rivincita`, anna)
    expect(accettata.status).toBe(200)
    const nuova = accettata.dati.partitaId
    expect((await vista(chiama, nuova, bruno)).serie).toEqual({ io: 1, avversario: 0, partite: 1 })
    expect((await vista(chiama, nuova, anna)).serie).toEqual({ io: 0, avversario: 1, partite: 1 })
    expect((await vista(chiama, prima, bruno)).rivincita).toMatchObject({ stato: 'accettato', partitaId: nuova })
  })

  it('chi e’ in una partita non riceve inviti e non ne manda', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const carla = await giocatore('carla')
    await partita(chiama, anna, bruno)
    await online(chiama, carla)
    expect((await chiama('POST', '/indovina/inviti', anna, { playerId: carla.id, personaggi: { set: 'persone' } })).status).toBe(409)
    expect((await chiama('POST', '/indovina/inviti', carla, { playerId: bruno.id, personaggi: { set: 'persone' } })).status).toBe(409)
    await online(chiama, anna)
    const sala = (await chiama<SalaIndovina>('GET', '/indovina/sala', carla)).dati
    expect(sala.giocatori.find((g) => g.displayName === 'anna')?.occupato).toBe(true)
    // E la presenza non gli porta inviti: non potrebbe accettarli.
    expect((await online(chiama, bruno)).indovina).toEqual([])
  })
})
