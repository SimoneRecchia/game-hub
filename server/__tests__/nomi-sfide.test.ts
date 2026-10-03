import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NOMI_SFIDA_VIA_MS } from '../../shared/config'
import { MARGINE_NOMI_MS, PUNTI_SFIDA, TEMPO_NOMI_MS, type FileLessicoNomi } from '../../shared/nomi-cose'
import type { InvitoConLink, PresenzaRisposta, SalaNomi, VistaSfidaNomi } from '../../shared/types'
import { banco, type Giocatore } from './banco'

type Banco = ReturnType<typeof banco>

/** Porta indietro gli orologi della sfida: come se fossero passati `ms` millisecondi. */
function passano(db: Banco['db'], id: string, ms: number) {
  for (const colonna of ['inizio_at', 'stop_at', 'created_at']) {
    const prima = db.sqlite.prepare(`SELECT ${colonna} AS t FROM nomi_sfide WHERE id = ?`).get(id)?.t
    if (!prima) continue
    const dopo = new Date(Date.parse(String(prima)) - ms).toISOString()
    db.sqlite.prepare(`UPDATE nomi_sfide SET ${colonna} = ? WHERE id = ?`).run(dopo, id)
  }
}

function paroleDi(lettera: string): Record<string, string[]> {
  const file = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'public', 'dati', 'nomi-cose', `${lettera}.json`), 'utf8'),
  ) as FileLessicoNomi
  return file.categorie as Record<string, string[]>
}

async function online(chiama: Banco['chiama'], ...chi: Giocatore[]) {
  for (const g of chi) await chiama('POST', '/presenza', g, { attivita: 'nomi' })
}

/** Anna sfida Bruno, che accetta: la sfida aperta, con il via fra un attimo. */
async function sfidaAccettata(b: Banco, anna: Giocatore, bruno: Giocatore): Promise<string> {
  await online(b.chiama, anna, bruno)
  const invito = await b.chiama<{ id: string }>('POST', '/nomi/sfide', anna, { playerId: bruno.id })
  expect(invito.status).toBe(201)
  const arrivati = (await b.chiama<PresenzaRisposta>('POST', '/presenza', bruno, { attivita: 'hub' })).dati
  expect(arrivati.nomi.map((i) => i.da.nickname)).toEqual(['anna'])
  expect((await b.chiama('POST', `/nomi/sfide/${invito.dati.id}/accetta`, bruno)).status).toBe(200)
  return invito.dati.id
}

describe('la sfida a Nomi, cose e città fra amici', () => {
  it('la lettera si vede solo dal via, uguale per tutti e due', async () => {
    const b = banco()
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    const id = await sfidaAccettata(b, anna, bruno)
    const prima = (await b.chiama<VistaSfidaNomi>('GET', `/nomi/sfide/${id}`, anna)).dati
    expect(prima).toMatchObject({ stato: 'in_corso', lettera: null, categorie: null, restanteMs: null })
    expect(prima.inizioTraMs).toBeGreaterThan(0)
    expect(prima.inizioTraMs).toBeLessThanOrEqual(NOMI_SFIDA_VIA_MS)

    passano(b.db, id, NOMI_SFIDA_VIA_MS)
    const sua = (await b.chiama<VistaSfidaNomi>('GET', `/nomi/sfide/${id}`, anna)).dati
    const mia = (await b.chiama<VistaSfidaNomi>('GET', `/nomi/sfide/${id}`, bruno)).dati
    expect(sua.lettera).toMatch(/^[a-z]$/)
    expect(sua.categorie).toHaveLength(5)
    expect(mia.lettera).toBe(sua.lettera)
    expect(mia.categorie).toEqual(sua.categorie)
    expect(sua.restanteMs).toBeGreaterThan(TEMPO_NOMI_MS - 3_000)
    // Mentre si gioca, nella presenza e' la sfida aperta di tutti e due.
    const presenza = (await b.chiama<PresenzaRisposta>('POST', '/presenza', bruno, { attivita: 'nomi' })).dati
    expect(presenza.partitaNomi).toMatchObject({ id, avversario: { nickname: 'anna' } })
  })

  it('chi dice stop ferma l’altro; a margine passato si contano i punti come al tavolo', async () => {
    const b = banco()
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    const id = await sfidaAccettata(b, anna, bruno)
    passano(b.db, id, NOMI_SFIDA_VIA_MS)
    const v = (await b.chiama<VistaSfidaNomi>('GET', `/nomi/sfide/${id}`, anna)).dati
    const [c0, c1, c2] = v.categorie!
    const parole = paroleDi(v.lettera!)

    // Bruno scrive due risposte; Anna le vede contate, non lette.
    await b.chiama('POST', `/nomi/sfide/${id}/risposte`, bruno, {
      risposte: { [c0]: parole[c0][0], [c1]: parole[c1][1] },
    })
    const durante = (await b.chiama<VistaSfidaNomi>('GET', `/nomi/sfide/${id}`, anna)).dati
    expect(durante.scritteAvversario).toBe(2)
    expect(durante.sue).toBeNull()

    // Anna dice stop: una risposta uguale a quella di Bruno, una che ha solo lei.
    const stop = await b.chiama<VistaSfidaNomi>('POST', `/nomi/sfide/${id}/stop`, anna, {
      risposte: { [c0]: parole[c0][0], [c2]: parole[c2][0] },
    })
    expect(stop.dati.stop).toMatchObject({ di: 'io' })
    const vistoDaBruno = (await b.chiama<VistaSfidaNomi>('GET', `/nomi/sfide/${id}`, bruno)).dati
    expect(vistoDaBruno.stop?.di).toBe('avversario')
    expect(vistoDaBruno.restanteMs).toBeNull()
    // Nel margine il foglio di Bruno arriva ancora.
    await b.chiama('POST', `/nomi/sfide/${id}/risposte`, bruno, {
      risposte: { [c0]: parole[c0][0], [c1]: parole[c1][1] },
    })

    passano(b.db, id, MARGINE_NOMI_MS + 1_000)
    // Dopo il margine non si scrive piu': questa risposta non conta.
    await b.chiama('POST', `/nomi/sfide/${id}/risposte`, bruno, {
      risposte: { [c0]: parole[c0][0], [c1]: parole[c1][1], [c2]: parole[c2][1] },
    })
    const fine = (await b.chiama<VistaSfidaNomi>('GET', `/nomi/sfide/${id}`, anna)).dati
    expect(fine.stato).toBe('finita')
    // c0 uguale (5 a testa), c1 solo di Bruno (20), c2 solo di Anna (20).
    expect(fine.mie.punti!.slice(0, 3)).toEqual([PUNTI_SFIDA.uguale, 0, PUNTI_SFIDA.sola])
    expect(fine.sue!.punti!.slice(0, 3)).toEqual([PUNTI_SFIDA.uguale, PUNTI_SFIDA.sola, 0])
    expect(fine.mie.totale).toBe(25)
    expect(fine.sue!.totale).toBe(25)
    expect(fine.vincitore).toBe('pari')
    expect(fine.serie).toEqual({ mie: 0, sue: 0, partite: 1 })
  })

  it('senza stop la chiude il tempo, e il foglio dell’altro si vede solo alla fine', async () => {
    const b = banco()
    const [anna, bruno] = [await b.giocatore('anna'), await b.giocatore('bruno')]
    const id = await sfidaAccettata(b, anna, bruno)
    passano(b.db, id, NOMI_SFIDA_VIA_MS)
    const v = (await b.chiama<VistaSfidaNomi>('GET', `/nomi/sfide/${id}`, bruno)).dati
    const parole = paroleDi(v.lettera!)
    const c0 = v.categorie![0]
    await b.chiama('POST', `/nomi/sfide/${id}/risposte`, bruno, { risposte: { [c0]: parole[c0][0] } })
    passano(b.db, id, TEMPO_NOMI_MS + MARGINE_NOMI_MS + 1_000)
    const fine = (await b.chiama<VistaSfidaNomi>('GET', `/nomi/sfide/${id}`, bruno)).dati
    expect(fine).toMatchObject({ stato: 'finita', vincitore: 'io', stop: { di: 'tempo' } })
    expect(fine.sue?.risposte).toEqual({})
  })

  it('un invito con il link si apre anche senza sessione, e aprirlo e’ accettarlo', async () => {
    const b = banco()
    const [anna, carla] = [await b.giocatore('anna'), await b.giocatore('carla')]
    const invito = (await b.chiama<{ id: string; codice: string }>('POST', '/nomi/sfide', anna, {})).dati
    expect(invito.codice).toMatch(/^[a-z0-9]+$/)
    const pubblico = await b.chiama<InvitoConLink>('GET', `/inviti/${invito.codice}`, null)
    expect(pubblico.dati).toMatchObject({ gioco: 'nomi', stato: 'attesa', da: { nickname: 'anna' } })
    const sala = (await b.chiama<SalaNomi>('GET', '/nomi/sfide/sala', anna)).dati
    expect(sala.invito).toMatchObject({ codice: invito.codice, stato: 'attesa' })
    const aperta = await b.chiama<{ partitaId: string }>('POST', `/nomi/sfide/link/${invito.codice}/accetta`, carla)
    expect(aperta.dati.partitaId).toBe(invito.id)
    expect((await b.chiama<SalaNomi>('GET', '/nomi/sfide/sala', anna)).dati.invito?.stato).toBe('accettato')
  })

  it('chi e’ in una sfida non si sfida, e la rivincita chiesta da tutti e due riparte con la serie', async () => {
    const b = banco()
    const [anna, bruno, carla] = [await b.giocatore('anna'), await b.giocatore('bruno'), await b.giocatore('carla')]
    const id = await sfidaAccettata(b, anna, bruno)
    await online(b.chiama, carla)
    expect((await b.chiama('POST', '/nomi/sfide', carla, { playerId: anna.id })).status).toBe(409)

    passano(b.db, id, NOMI_SFIDA_VIA_MS)
    const v = (await b.chiama<VistaSfidaNomi>('GET', `/nomi/sfide/${id}`, anna)).dati
    const parole = paroleDi(v.lettera!)
    const c0 = v.categorie![0]
    await b.chiama('POST', `/nomi/sfide/${id}/stop`, anna, { risposte: { [c0]: parole[c0][0] } })
    passano(b.db, id, MARGINE_NOMI_MS + 1_000)
    expect((await b.chiama<VistaSfidaNomi>('GET', `/nomi/sfide/${id}`, anna)).dati.vincitore).toBe('io')

    await online(b.chiama, anna, bruno)
    const chiesta = await b.chiama<{ invitoId: string }>('POST', `/nomi/sfide/${id}/rivincita`, bruno)
    expect(chiesta.status).toBe(201)
    const vista = (await b.chiama<VistaSfidaNomi>('GET', `/nomi/sfide/${id}`, anna)).dati
    expect(vista.rivincita).toMatchObject({ mia: false, stato: 'invito' })
    const accettata = await b.chiama<{ partitaId: string }>('POST', `/nomi/sfide/${id}/rivincita`, anna)
    expect(accettata.dati.partitaId).toBe(chiesta.dati.invitoId)
    const nuova = (await b.chiama<VistaSfidaNomi>('GET', `/nomi/sfide/${accettata.dati.partitaId}`, anna)).dati
    expect(nuova.serie).toEqual({ mie: 1, sue: 0, partite: 1 })
  })
})
