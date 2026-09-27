import { describe, expect, it } from 'vitest'
import type { LinkBattaglia, PresenzaRisposta, VistaBattaglia } from '../../shared/types'
import { banco, type Giocatore } from './banco'

type Chiama = ReturnType<typeof banco>['chiama']

async function online(chiama: Chiama, chi: Giocatore): Promise<PresenzaRisposta> {
  return (await chiama<PresenzaRisposta>('POST', '/presenza', chi, { attivita: 'battaglia' })).dati
}

/** Una partita fra amici, aperta con il link e finita subito: chi perde si arrende. */
async function finita(chiama: Chiama, vince: Giocatore, perde: Giocatore): Promise<string> {
  const link = (await chiama<LinkBattaglia>('POST', '/battaglia/link', vince)).dati
  const { partitaId } = (await chiama<{ partitaId: string }>('POST', `/battaglia/link/${link.codice}/accetta`, perde))
    .dati
  const v = (await chiama<VistaBattaglia>('POST', `/battaglia/partite/${partitaId}/resa`, perde)).dati
  expect(v).toMatchObject({ stato: 'finita', vincitore: 'avversario' })
  return partitaId
}

describe('la rivincita fra amici', () => {
  it('la chiede uno, l’altro la vede e l’accetta, e la serie conta le vittorie', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const prima = await finita(chiama, anna, bruno)
    let perBruno = (await chiama<VistaBattaglia>('GET', `/battaglia/partite/${prima}`, bruno)).dati
    expect(perBruno.serie).toEqual({ io: 0, avversario: 0, partite: 0 })
    expect(perBruno.rivincita).toBeNull()

    // Bruno chiede la rivincita: Anna deve essere online.
    expect((await chiama('POST', `/battaglia/partite/${prima}/rivincita`, bruno)).status).toBe(409)
    await online(chiama, anna)
    const chiesta = await chiama<{ invitoId: string }>('POST', `/battaglia/partite/${prima}/rivincita`, bruno)
    expect(chiesta.status).toBe(201)
    const perAnna = (await chiama<VistaBattaglia>('GET', `/battaglia/partite/${prima}`, anna)).dati
    expect(perAnna.rivincita).toMatchObject({ da: 'avversario', stato: 'attesa' })
    expect((await online(chiama, anna)).battaglia[0]).toMatchObject({ rivincita: true, da: { displayName: 'bruno' } })

    // Anna chiede anche lei: e' un si', e la partita nuova porta la serie, contata per giocatore.
    await online(chiama, bruno)
    const accettata = await chiama<{ partitaId: string }>('POST', `/battaglia/partite/${prima}/rivincita`, anna)
    expect(accettata.status).toBe(200)
    const nuova = accettata.dati.partitaId
    expect((await chiama<VistaBattaglia>('GET', `/battaglia/partite/${nuova}`, anna)).dati.serie).toEqual({
      io: 1,
      avversario: 0,
      partite: 1,
    })
    expect((await chiama<VistaBattaglia>('GET', `/battaglia/partite/${nuova}`, bruno)).dati.serie).toEqual({
      io: 0,
      avversario: 1,
      partite: 1,
    })
    perBruno = (await chiama<VistaBattaglia>('GET', `/battaglia/partite/${prima}`, bruno)).dati
    expect(perBruno.rivincita).toMatchObject({ stato: 'accettato', partitaId: nuova })

    // La seconda la vince Bruno: nella terza la serie e' uno a uno.
    const v = (await chiama<VistaBattaglia>('POST', `/battaglia/partite/${nuova}/resa`, anna)).dati
    expect(v.vincitore).toBe('avversario')
    await online(chiama, anna)
    await chiama('POST', `/battaglia/partite/${nuova}/rivincita`, bruno)
    const terza = (await chiama<{ partitaId: string }>('POST', `/battaglia/partite/${nuova}/rivincita`, anna)).dati
    expect((await chiama<VistaBattaglia>('GET', `/battaglia/partite/${terza.partitaId}`, anna)).dati.serie).toEqual({
      io: 1,
      avversario: 1,
      partite: 2,
    })
  })

  it('si puo’ rifiutare, e non si chiede a partita in corso né contro il computer', async () => {
    const { chiama, giocatore } = banco()
    const anna = await giocatore('anna')
    const bruno = await giocatore('bruno')
    const prima = await finita(chiama, anna, bruno)
    await online(chiama, bruno)
    await chiama('POST', `/battaglia/partite/${prima}/rivincita`, anna)
    const invito = (await chiama<VistaBattaglia>('GET', `/battaglia/partite/${prima}`, bruno)).dati.rivincita!
    expect((await chiama('POST', `/battaglia/sfide/${invito.id}/rifiuta`, bruno)).status).toBe(200)
    expect((await chiama<VistaBattaglia>('GET', `/battaglia/partite/${prima}`, anna)).dati.rivincita).toMatchObject({
      da: 'io',
      stato: 'rifiutato',
    })

    const computer = (await chiama<VistaBattaglia>('POST', '/battaglia/computer', anna, { livello: 'facile' })).dati
    expect(computer.serie).toBeNull()
    expect((await chiama('POST', `/battaglia/partite/${computer.id}/rivincita`, anna)).status).toBe(409)
  })
})
