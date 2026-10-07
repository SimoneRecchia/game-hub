import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mulberry32 } from '../../shared/daily'
import { generaDomande, type DomandaCompleta } from '../../shared/quiz-domande'
import { MARGINE_SFIDA_MS, PAUSA_SFIDA_MS, RALLENTY, VIA_SFIDA_MS, type ImpostazioniSfida } from '../../shared/quiz-sfida'
import type { InvitoConLink, PresenzaRisposta, SalaQuiz, SfidaQuizInviata, VistaDuello } from '../../shared/types'
import { MONDO } from '../../shared/__tests__/quiz-mondo'
import { banco, type Giocatore } from './banco'

type Chiama = ReturnType<typeof banco>['chiama']

const IMPOSTAZIONI: ImpostazioniSfida = {
  categoria: 'capitali',
  modo: 'scelta',
  area: 'mondo',
  quante: 5,
  secondi: 15,
  evidenzia: true,
  soloZona: true,
  nomiPaesi: false,
  imparo: true,
}

function domande(seme = 3): DomandaCompleta[] {
  const d = generaDomande(MONDO, { categoria: 'capitali', area: 'mondo', quante: 5 }, mulberry32(seme))
  expect(d.length).toBeGreaterThanOrEqual(3)
  return d
}

const sbagliata = (d: DomandaCompleta) => d.opzioni.find((o) => o.id !== d.giusta)!.id

let adesso = Date.parse('2026-09-27T10:00:00Z')
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(adesso)
})
afterEach(() => vi.useRealTimers())
const avanza = (ms: number) => {
  adesso += ms
  vi.setSystemTime(adesso)
}

async function online(chiama: Chiama, chi: Giocatore): Promise<PresenzaRisposta> {
  const r = await chiama<PresenzaRisposta>('POST', '/presenza', chi, { attivita: 'quiz' })
  expect(r.status).toBe(200)
  return r.dati
}

/** Sfida, accettazione e i due "pronto": il duello e' in corso, e si e' al via. */
async function duello(chiama: Chiama, a: Giocatore, b: Giocatore, elenco = domande()) {
  await online(chiama, b)
  const sfida = await chiama<SfidaQuizInviata>('POST', '/quiz/sfide', a, {
    playerId: b.id,
    impostazioni: IMPOSTAZIONI,
    domande: elenco,
  })
  expect(sfida.status, JSON.stringify(sfida.dati)).toBe(201)
  const arrivate = await online(chiama, b)
  expect(arrivate.quiz).toHaveLength(1)
  expect(arrivate.quiz[0]).toMatchObject({ da: { playerId: a.id }, rivincita: false, sfida: { quante: 5 } })
  const accettata = await chiama<{ duelloId: string }>('POST', `/quiz/sfide/${sfida.dati.id}/accetta`, b)
  expect(accettata.status).toBe(200)
  const id = accettata.dati.duelloId
  const perA = await chiama<SfidaQuizInviata>('GET', `/quiz/sfide/${sfida.dati.id}`, a)
  expect(perA.dati).toMatchObject({ stato: 'accettata', duelloId: id })

  let v = (await chiama<VistaDuello>('POST', `/quiz/duelli/${id}/pronto`, a)).dati
  expect(v).toMatchObject({ stato: 'attesa', pronti: { io: true, avversario: false }, domanda: null })
  v = (await chiama<VistaDuello>('POST', `/quiz/duelli/${id}/pronto`, b)).dati
  expect(v.stato).toBe('in_corso')
  expect(v.inizioAt).toBe(adesso + VIA_SFIDA_MS)
  return { id, elenco }
}

async function rispondi(chiama: Chiama, chi: Giocatore, id: string, indice: number, scelta: string) {
  return chiama<VistaDuello>('POST', `/quiz/duelli/${id}/risposta`, chi, { indice, scelta })
}

describe('la sfida a quiz fra due', () => {
  it('il primo che risponde giusto prende il punto; chi sbaglia rallenta l’altro', async () => {
    const { chiama, giocatore } = banco()
    const a = await giocatore('anna')
    const b = await giocatore('bruno')
    const { id, elenco } = await duello(chiama, a, b)

    // Prima del via la domanda non c'e'.
    let v = (await chiama<VistaDuello>('GET', `/quiz/duelli/${id}`, a)).dati
    expect(v.domanda).toBeNull()
    expect(v.prossimaAt).toBe(v.inizioAt)

    avanza(VIA_SFIDA_MS + 2_000)
    v = (await chiama<VistaDuello>('GET', `/quiz/duelli/${id}`, a)).dati
    expect(v.domanda?.indice).toBe(0)
    // La risposta non esce dal server.
    expect(JSON.stringify(v.domanda)).not.toContain('"giusta"')
    expect(v.domanda?.lentoIo).toBeNull()

    // Bruno sbaglia: e' fuori, e il tempo di Anna va al rallentatore.
    const sbaglia = await rispondi(chiama, b, id, 0, sbagliata(elenco[0]))
    expect(sbaglia.status).toBe(200)
    expect(sbaglia.dati.domanda).toMatchObject({ mia: sbagliata(elenco[0]), avversarioFuori: false })
    // Una seconda risposta dello stesso non vale.
    expect((await rispondi(chiama, b, id, 0, elenco[0].giusta)).status).toBe(409)
    v = (await chiama<VistaDuello>('GET', `/quiz/duelli/${id}`, a)).dati
    const aperta = v.inizioAt! + 15_000
    expect(v.domanda?.avversarioFuori).toBe(true)
    expect(v.domanda?.lentoIo).toBe(adesso)
    expect(v.domanda?.scadeIo).toBe(adesso + (aperta - adesso) * RALLENTY)

    // Anna risponde giusto: il punto e' suo, e la domanda si chiude con la risposta svelata.
    avanza(1_000)
    v = (await rispondi(chiama, a, id, 0, elenco[0].giusta)).dati
    expect(v.punti).toEqual({ io: 1, avversario: 0 })
    expect(v.giri[0]).toMatchObject({ indice: 0, corretta: elenco[0].giusta, punto: 'io' })
    expect(v.giri[0].sua).toEqual({ scelta: sbagliata(elenco[0]), giusta: false })
    expect(v.domanda).toBeNull()
    expect(v.prossimaAt).toBe(adesso + PAUSA_SFIDA_MS)
    // Bruno vede lo stesso, dal suo lato; e chiedendo i giri dal primo non li riceve di nuovo.
    const perB = (await chiama<VistaDuello>('GET', `/quiz/duelli/${id}?giri=1`, b)).dati
    expect(perB.punti).toEqual({ io: 0, avversario: 1 })
    expect(perB.giri).toHaveLength(0)
  })

  it('se sbagliano tutti e due o finisce il tempo, il punto non e’ di nessuno; poi la rivincita somma la serie', async () => {
    const { chiama, giocatore } = banco()
    const a = await giocatore('anna')
    const b = await giocatore('bruno')
    const { id, elenco } = await duello(chiama, a, b)
    avanza(VIA_SFIDA_MS + 500)

    // Domanda 1: sbagliano tutti e due.
    await rispondi(chiama, a, id, 0, sbagliata(elenco[0]))
    avanza(500)
    let v = (await rispondi(chiama, b, id, 0, sbagliata(elenco[0]))).dati
    expect(v.giri[0].punto).toBeNull()
    expect(v.punti).toEqual({ io: 0, avversario: 0 })

    // Domanda 2: nessuno risponde, e il tempo finisce.
    avanza(PAUSA_SFIDA_MS + 15_000 + MARGINE_SFIDA_MS)
    v = (await chiama<VistaDuello>('GET', `/quiz/duelli/${id}`, a)).dati
    expect(v.giri.map((g) => g.punto)).toEqual([null, null])
    expect(v.giri[1].mia).toBeNull()

    // Le altre: le prende tutte Bruno. Una risposta in ritardo non vale.
    for (let i = 2; i < elenco.length; i += 1) {
      avanza(PAUSA_SFIDA_MS + 1_000)
      expect((await rispondi(chiama, b, id, i, elenco[i].giusta)).status).toBe(200)
      expect((await rispondi(chiama, a, id, i, elenco[i].giusta)).status).toBe(409)
    }
    v = (await chiama<VistaDuello>('GET', `/quiz/duelli/${id}`, a)).dati
    expect(v.stato).toBe('finito')
    expect(v.punti).toEqual({ io: 0, avversario: elenco.length - 2 })

    // La rivincita: la chiede Anna, con domande nuove; Bruno la vede nel duello e nel giro di controllo.
    const chiesta = await chiama<{ sfidaId: string }>('POST', `/quiz/duelli/${id}/rivincita`, a, { domande: domande(9) })
    expect(chiesta.status).toBe(201)
    const perB = (await chiama<VistaDuello>('GET', `/quiz/duelli/${id}`, b)).dati
    expect(perB.rivincita).toMatchObject({ da: 'avversario', stato: 'attesa' })
    expect((await online(chiama, b)).quiz[0]).toMatchObject({ rivincita: true })

    // Bruno chiede anche lui: e' un si', e il duello nuovo porta avanti la serie.
    const accettata = await chiama<{ duelloId: string }>('POST', `/quiz/duelli/${id}/rivincita`, b, { domande: domande(4) })
    expect(accettata.status).toBe(200)
    const nuovo = (await chiama<VistaDuello>('GET', `/quiz/duelli/${accettata.dati.duelloId}`, a)).dati
    expect(nuovo.serie).toEqual({ io: 0, avversario: elenco.length - 2, partite: 1 })
    expect(nuovo.stato).toBe('attesa')
    const vecchio = (await chiama<VistaDuello>('GET', `/quiz/duelli/${id}`, a)).dati
    expect(vecchio.rivincita).toMatchObject({ stato: 'accettata', duelloId: accettata.dati.duelloId })
  })

  it('chi e’ in un duello non si sfida, e chi se ne va lo chiude', async () => {
    const { chiama, giocatore } = banco()
    const a = await giocatore('anna')
    const b = await giocatore('bruno')
    const c = await giocatore('carla')
    const { id } = await duello(chiama, a, b)
    await online(chiama, a)
    const sala = (await chiama<SalaQuiz>('GET', '/quiz/sfide/sala', c)).dati
    expect(sala.giocatori.find((g) => g.playerId === a.id)?.occupato).toBe(true)
    const r = await chiama('POST', '/quiz/sfide', c, { playerId: a.id, impostazioni: IMPOSTAZIONI, domande: domande() })
    expect(r.status).toBe(409)

    const uscito = (await chiama<VistaDuello>('POST', `/quiz/duelli/${id}/esci`, b)).dati
    expect(uscito).toMatchObject({ stato: 'abbandonato', uscito: 'io' })
    expect((await chiama<VistaDuello>('GET', `/quiz/duelli/${id}`, a)).dati.uscito).toBe('avversario')
  })

  it('un invito con il link si legge senza account, e lo accetta chi lo apre', async () => {
    const { chiama, giocatore } = banco()
    const a = await giocatore('anna')
    const c = await giocatore('carla')
    const link = await chiama<SfidaQuizInviata>('POST', '/quiz/sfide/link', a, {
      impostazioni: { ...IMPOSTAZIONI, quante: 50 },
      domande: domande(),
    })
    expect(link.status).toBe(201)
    expect(link.dati.codice).toMatch(/^[a-z0-9]{10}$/)
    const visto = await chiama<InvitoConLink>('GET', `/inviti/${link.dati.codice}`, null)
    expect(visto.dati).toMatchObject({ gioco: 'quiz', stato: 'attesa', da: { playerId: a.id }, sfida: { quante: 20 } })

    const accettata = await chiama<{ duelloId: string }>('POST', `/quiz/sfide/link/${link.dati.codice}/accetta`, c)
    expect(accettata.status).toBe(200)
    // Il giro di controllo di Anna le dice che la sfida e' cominciata.
    expect((await online(chiama, a)).duello).toMatchObject({ id: accettata.dati.duelloId, stato: 'attesa' })
    // Riaprire il link porta allo stesso duello; un altro non lo puo' piu' usare.
    const ancora = await chiama<{ duelloId: string }>('POST', `/quiz/sfide/link/${link.dati.codice}/accetta`, c)
    expect(ancora.dati.duelloId).toBe(accettata.dati.duelloId)
    const altro = await giocatore('dario')
    expect((await chiama('POST', `/quiz/sfide/link/${link.dati.codice}/accetta`, altro)).status).toBe(409)
  })

  it('in una sfida di piu’ sezioni ogni domanda dice la sua, se e’ una di quelle della sfida', async () => {
    const { chiama, giocatore } = banco()
    const a = await giocatore('anna')
    const b = await giocatore('bruno')
    await online(chiama, b)
    const sezioni = [{ categoria: 'capitali' as const }, { categoria: 'bandiere' as const }]
    const elenco = [
      ...domande(3).slice(0, 2).map((d) => ({ ...d, categoria: 'capitali' as const })),
      // Una sezione che la sfida non ha: la domanda resta, la sezione no.
      ...domande(4).slice(0, 2).map((d) => ({ ...d, categoria: 'fiumi' as const })),
    ]
    const sfida = await chiama<SfidaQuizInviata>('POST', '/quiz/sfide', a, {
      playerId: b.id,
      impostazioni: { ...IMPOSTAZIONI, sezioni },
      domande: elenco,
    })
    expect(sfida.status, JSON.stringify(sfida.dati)).toBe(201)
    const arrivate = await online(chiama, b)
    expect(arrivate.quiz[0].sfida.sezioni).toEqual(sezioni)
    const { duelloId } = (await chiama<{ duelloId: string }>('POST', `/quiz/sfide/${sfida.dati.id}/accetta`, b)).dati
    await chiama('POST', `/quiz/duelli/${duelloId}/pronto`, a)
    await chiama('POST', `/quiz/duelli/${duelloId}/pronto`, b)
    avanza(VIA_SFIDA_MS + 1_000)
    const prima = (await chiama<VistaDuello>('GET', `/quiz/duelli/${duelloId}`, a)).dati
    expect(prima.impostazioni.sezioni).toEqual(sezioni)
    expect(prima.domanda?.domanda.categoria).toBe('capitali')
    // Alla terza, quella dei fiumi, la sezione non c'e'.
    for (let i = 0; i < 2; i += 1) {
      await rispondi(chiama, a, duelloId, i, elenco[i].giusta)
      avanza(PAUSA_SFIDA_MS + 1_000)
    }
    const terza = (await chiama<VistaDuello>('GET', `/quiz/duelli/${duelloId}`, a)).dati
    expect(terza.domanda?.indice).toBe(2)
    expect(terza.domanda?.domanda.categoria).toBeUndefined()
  })

  it('le domande devono essere domande, e l’altro deve arrivare', async () => {
    const { chiama, giocatore } = banco()
    const a = await giocatore('anna')
    const b = await giocatore('bruno')
    await online(chiama, b)
    const rotte = domande().map((d) => ({ ...d, opzioni: [] }))
    const r = await chiama('POST', '/quiz/sfide', a, { playerId: b.id, impostazioni: IMPOSTAZIONI, domande: rotte })
    expect(r.status).toBe(400)

    const sfida = await chiama<SfidaQuizInviata>('POST', '/quiz/sfide', a, {
      playerId: b.id,
      impostazioni: IMPOSTAZIONI,
      domande: domande(),
    })
    const { duelloId } = (await chiama<{ duelloId: string }>('POST', `/quiz/sfide/${sfida.dati.id}/accetta`, b)).dati
    await chiama('POST', `/quiz/duelli/${duelloId}/pronto`, a)
    // Bruno non arriva: dopo un minuto e mezzo il duello e' abbandonato.
    avanza(95_000)
    expect((await chiama<VistaDuello>('GET', `/quiz/duelli/${duelloId}`, a)).dati.stato).toBe('abbandonato')
  })
})
