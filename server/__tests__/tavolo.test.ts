import { describe, expect, it } from 'vitest'
import type { InvitoConLink, PresenzaRisposta, SalaTavolo, VistaTavolo } from '../../shared/types'
import { banco, type Giocatore } from './banco'

type Chiama = ReturnType<typeof banco>['chiama']

async function online(chiama: Chiama, chi: Giocatore): Promise<PresenzaRisposta> {
  return (await chiama<PresenzaRisposta>('POST', '/presenza', chi, { attivita: 'forza4' })).dati
}

const vista = async (chiama: Chiama, id: string, chi: Giocatore) =>
  (await chiama<VistaTavolo>('GET', `/tavolo/partite/${id}`, chi)).dati

/** Anna invita Bruno (a Forza 4, se non si dice altro), Bruno accetta: la partita comincia. */
async function partita(chiama: Chiama, anna: Giocatore, bruno: Giocatore, gioco = 'forza4'): Promise<string> {
  await online(chiama, bruno)
  const invito = await chiama<{ id: string }>('POST', '/tavolo/inviti', anna, { gioco, playerId: bruno.id })
  expect(invito.status).toBe(201)
  const accettato = await chiama<{ partitaId: string }>('POST', `/tavolo/inviti/${invito.dati.id}/accetta`, bruno)
  expect(accettato.status).toBe(200)
  return accettato.dati.partitaId
}

/** Chi muove per primo e chi per secondo, in una partita appena aperta. */
async function colori(chiama: Chiama, id: string, anna: Giocatore, bruno: Giocatore) {
  const a = await vista(chiama, id, anna)
  return a.parte === 0 ? { primo: anna, secondo: bruno } : { primo: bruno, secondo: anna }
}

async function muovi(chiama: Chiama, id: string, chi: Giocatore, mossa: string) {
  const prima = await vista(chiama, id, chi)
  return chiama<VistaTavolo & { code?: string }>('POST', `/tavolo/partite/${id}/mossa`, chi, {
    mossa,
    versione: prima.versione,
  })
}

describe('i giochi da tavoliere fra amici, dalle API', () => {
  it('un invito arriva con il giro di controllo, e accettandolo si pesca chi muove per primo', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')

    // Non si invita chi non e' online, e non a un gioco che non c'e'.
    expect((await chiama('POST', '/tavolo/inviti', anna, { gioco: 'forza4', playerId: bruno.id })).status).toBe(409)
    await online(chiama, bruno)
    expect((await chiama('POST', '/tavolo/inviti', anna, { gioco: 'tris', playerId: bruno.id })).status).toBe(400)

    const invito = await chiama<{ id: string }>('POST', '/tavolo/inviti', anna, { gioco: 'forza4', playerId: bruno.id })
    expect((await online(chiama, bruno)).tavolo).toMatchObject([
      { id: invito.dati.id, gioco: 'forza4', da: { displayName: 'anna' }, rivincita: false },
    ])
    const sala = (await chiama<SalaTavolo>('GET', '/tavolo/sala?gioco=forza4', anna)).dati
    expect(sala.invito).toMatchObject({ stato: 'attesa', gioco: 'forza4', a: { displayName: 'bruno' } })

    // Solo l'invitato accetta.
    expect((await chiama('POST', `/tavolo/inviti/${invito.dati.id}/accetta`, anna)).status).toBe(409)
    const id = (await chiama<{ partitaId: string }>('POST', `/tavolo/inviti/${invito.dati.id}/accetta`, bruno)).dati
      .partitaId
    const perAnna = await vista(chiama, id, anna)
    const perBruno = await vista(chiama, id, bruno)
    expect(perAnna.stato).toBe('in_corso')
    expect(perAnna.posizione).toBe('.'.repeat(42))
    expect([perAnna.parte, perBruno.parte].sort()).toEqual([0, 1])
    expect(perAnna.tuoTurno).toBe(perAnna.parte === 0)
    expect(perAnna.tuoTurno).not.toBe(perBruno.tuoTurno)
    expect((await online(chiama, anna)).partitaTavolo).toMatchObject({
      id,
      gioco: 'forza4',
      avversario: { displayName: 'bruno' },
    })
    // Nel Forza 4 la patta non si propone.
    expect(perAnna.puoiProporre).toBe(false)
  })

  it('le mosse passano dal server, che le controlla e scrive chi ha vinto', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const id = await partita(chiama, anna, bruno)
    const { primo, secondo } = await colori(chiama, id, anna, bruno)

    // Non tocca a lui, una colonna che non esiste, una versione vecchia.
    expect((await muovi(chiama, id, secondo, '3')).status).toBe(409)
    expect((await muovi(chiama, id, primo, '9')).status).toBe(422)
    const vecchia = (await vista(chiama, id, primo)).versione
    expect((await muovi(chiama, id, primo, '3')).status).toBe(200)
    const doppia = await chiama('POST', `/tavolo/partite/${id}/mossa`, primo, { mossa: '3', versione: vecchia })
    expect(doppia.status).toBe(409)

    // Il primo fa quattro in fila in basso, il secondo sta sopra.
    for (const [chi, colonna] of [
      [secondo, '3'],
      [primo, '4'],
      [secondo, '4'],
      [primo, '5'],
      [secondo, '5'],
    ] as const) {
      expect((await muovi(chiama, id, chi, colonna)).status).toBe(200)
    }
    const fine = (await muovi(chiama, id, primo, '6')).dati
    expect(fine.stato).toBe('finita')
    expect(fine.vincitore).toBe('io')
    expect(fine.motivo).toBe('forza4')
    expect(fine.mosse).toEqual(['3', '3', '4', '4', '5', '5', '6'])
    expect((await vista(chiama, id, secondo)).vincitore).toBe('avversario')
    // A partita finita non si muove piu'.
    expect((await muovi(chiama, id, secondo, '0')).status).toBe(409)

    const sala = (await chiama<SalaTavolo>('GET', '/tavolo/sala?gioco=forza4', primo)).dati
    expect(sala.record).toEqual({ vinte: 1, perse: 0, patte: 0 })
  })

  it('la resa, e la rivincita con i colori scambiati e la serie che va avanti', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const id = await partita(chiama, anna, bruno)
    const { primo, secondo } = await colori(chiama, id, anna, bruno)

    const resa = (await chiama<VistaTavolo>('POST', `/tavolo/partite/${id}/resa`, secondo)).dati
    expect(resa).toMatchObject({ stato: 'finita', vincitore: 'avversario', motivo: 'resa' })

    await online(chiama, primo)
    await online(chiama, secondo)
    const chiesta = await chiama<{ invitoId: string }>('POST', `/tavolo/partite/${id}/rivincita`, secondo)
    expect(chiesta.status).toBe(201)
    // Chiederla anche dall'altra parte e' accettarla.
    const accettata = await chiama<{ partitaId: string }>('POST', `/tavolo/partite/${id}/rivincita`, primo)
    expect(accettata.dati.partitaId).toBe(chiesta.dati.invitoId)

    const nuova = await vista(chiama, accettata.dati.partitaId, secondo)
    expect(nuova.stato).toBe('in_corso')
    // Chi prima muoveva per secondo adesso comincia.
    expect(nuova.parte).toBe(0)
    expect(nuova.serie).toEqual({ io: 0, avversario: 1, partite: 1 })
  })

  it('negli scacchi il server riconosce il matto, e la patta si propone una volta per mossa', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const id = await partita(chiama, anna, bruno, 'scacchi')
    const { primo: bianco, secondo: nero } = await colori(chiama, id, anna, bruno)
    expect((await vista(chiama, id, bianco)).posizione).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')

    // Una mossa che non si puo' fare, e una scritta come la leggono le persone: il server vuole l'UCI.
    expect((await muovi(chiama, id, bianco, 'e2e5')).status).toBe(422)
    expect((await muovi(chiama, id, bianco, 'Cf3')).status).toBe(422)

    // La patta: il Bianco la propone, una volta sola a questa mossa; il Nero la rifiuta.
    const proposta = await chiama<VistaTavolo>('POST', `/tavolo/partite/${id}/patta`, bianco, { azione: 'proponi' })
    expect(proposta.dati.patta).toBe('io')
    expect((await vista(chiama, id, nero)).patta).toBe('avversario')
    expect((await chiama('POST', `/tavolo/partite/${id}/patta`, bianco, { azione: 'proponi' })).status).toBe(409)
    expect((await chiama('POST', `/tavolo/partite/${id}/patta`, bianco, { azione: 'accetta' })).status).toBe(409)
    const rifiutata = await chiama<VistaTavolo>('POST', `/tavolo/partite/${id}/patta`, nero, { azione: 'rifiuta' })
    expect(rifiutata.dati.patta).toBeNull()
    expect((await vista(chiama, id, bianco)).puoiProporre).toBe(false)

    // Il matto dell'imbecille: il server lo riconosce e chiude.
    for (const [chi, mossa] of [
      [bianco, 'f2f3'],
      [nero, 'e7e5'],
      [bianco, 'g2g4'],
    ] as const) {
      expect((await muovi(chiama, id, chi, mossa)).status).toBe(200)
    }
    const matto = (await muovi(chiama, id, nero, 'd8h4')).dati
    expect(matto).toMatchObject({ stato: 'finita', vincitore: 'io', motivo: 'matto' })
    expect(matto.mosse).toEqual(['f2f3', 'e7e5', 'g2g4', 'd8h4'])
  })

  it('nella dama la patta d’accordo chiude la partita, e muovere la lascia cadere', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const id = await partita(chiama, anna, bruno, 'dama')
    const { primo: bianco, secondo: nero } = await colori(chiama, id, anna, bruno)

    await chiama('POST', `/tavolo/partite/${id}/patta`, bianco, { azione: 'proponi' })
    // Il Nero non risponde e muove... ma non tocca a lui: tocca al Bianco, che muove e la lascia cadere.
    expect((await muovi(chiama, id, nero, '11-15')).status).toBe(409)
    expect((await muovi(chiama, id, bianco, '22-18')).status).toBe(200)
    expect((await vista(chiama, id, nero)).patta).toBeNull()

    // Adesso la propone il Nero, e il Bianco accetta.
    await chiama('POST', `/tavolo/partite/${id}/patta`, nero, { azione: 'proponi' })
    const fine = (await chiama<VistaTavolo>('POST', `/tavolo/partite/${id}/patta`, bianco, { azione: 'accetta' })).dati
    expect(fine).toMatchObject({ stato: 'finita', vincitore: null, motivo: 'patta' })
    const sala = (await chiama<SalaTavolo>('GET', '/tavolo/sala?gioco=dama', nero)).dati
    expect(sala.record).toEqual({ vinte: 0, perse: 0, patte: 1 })
    // La vittoria a tavolino non c'e' finché l'altro ha tempo, e a partita finita non serve.
    expect((await chiama('POST', `/tavolo/partite/${id}/reclama`, nero)).status).toBe(409)
  })

  it('un invito con il link si vede da fuori e si accetta aprendolo', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const carla = await giocatore('carla')
    const link = await chiama<{ codice: string }>('POST', '/tavolo/inviti', anna, { gioco: 'forza4' })
    expect(link.status).toBe(201)
    const pubblico = await chiama<InvitoConLink>('GET', `/inviti/${link.dati.codice}`, null)
    expect(pubblico.dati).toMatchObject({ stato: 'attesa', gioco: 'forza4', da: { displayName: 'anna' } })
    const aperta = await chiama<{ partitaId: string; gioco: string }>(
      'POST',
      `/tavolo/link/${link.dati.codice}/accetta`,
      carla,
    )
    expect(aperta.dati.gioco).toBe('forza4')
    expect((await vista(chiama, aperta.dati.partitaId, carla)).stato).toBe('in_corso')
    // Chi e' gia' in partita non ne apre un'altra.
    expect((await chiama('POST', '/tavolo/inviti', carla, { gioco: 'forza4' })).status).toBe(409)
  })
})
