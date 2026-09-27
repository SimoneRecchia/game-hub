import { describe, expect, it } from 'vitest'
import {
  MARGINE_SFIDA_MS,
  PAUSA_SFIDA_MS,
  RALLENTY,
  impostazioniSfida,
  limiteMs,
  puoRispondere,
  secondiMostrati,
  statoSfida,
  type RispostaSfida,
} from '../quiz-sfida'

const L = 15_000
const limiti = [L, L, L]
const r = (i: number, lato: 'a' | 'b', t: number, giusta: boolean): RispostaSfida => ({
  i,
  lato,
  scelta: giusta ? 'IT' : 'FR',
  t,
  giusta,
})

describe('il giro del tempo della sfida', () => {
  it('prima dell’inizio la prima domanda aspetta', () => {
    const s = statoSfida(1_000, limiti, [], 500)
    expect(s.corrente).toBe(0)
    expect(s.prossimaAt).toBe(1_000)
    expect(s.giri).toHaveLength(0)
  })

  it('il primo che risponde giusto prende il punto, e la domanda si chiude', () => {
    const s = statoSfida(0, limiti, [r(0, 'b', 4_000, true)], 5_000)
    expect(s.giri[0].punto).toBe('b')
    expect(s.giri[0].chiusaAt).toBe(4_000)
    expect(s.punti).toEqual({ a: 0, b: 1 })
    // La prossima si apre dopo la pausa.
    expect(s.corrente).toBe(1)
    expect(s.prossimaAt).toBe(4_000 + PAUSA_SFIDA_MS)
  })

  it('a pari istante vince l’ordine di arrivo', () => {
    const s = statoSfida(0, limiti, [r(0, 'a', 3_000, true), r(0, 'b', 3_000, true)], 3_500)
    expect(s.giri[0].punto).toBe('a')
  })

  it('chi sbaglia rallenta l’altro: il tempo che gli resta dura il doppio', () => {
    const s = statoSfida(0, limiti, [r(0, 'a', 5_000, false)], 6_000)
    const giro = s.giri[0]
    expect(giro.chiusaAt).toBeNull()
    expect(giro.lentoDa).toEqual({ a: null, b: 5_000 })
    // Restavano dieci secondi: ora sono venti.
    expect(giro.scade.b).toBe(5_000 + (L - 5_000) * RALLENTY)
    expect(giro.scade.a).toBe(L)
    expect(puoRispondere(giro, 'a', 6_000)).toBe(false)
    expect(puoRispondere(giro, 'b', 6_000)).toBe(true)
  })

  it('se l’altro poi risponde giusto, il punto e’ suo', () => {
    const s = statoSfida(0, limiti, [r(0, 'a', 5_000, false), r(0, 'b', 20_000, true)], 21_000)
    expect(s.giri[0].punto).toBe('b')
  })

  it('se sbagliano tutti e due il punto non e’ di nessuno, e si va avanti subito', () => {
    const s = statoSfida(0, limiti, [r(0, 'a', 5_000, false), r(0, 'b', 7_000, false)], 8_000)
    expect(s.giri[0].punto).toBeNull()
    expect(s.giri[0].chiusaAt).toBe(7_000)
    expect(s.prossimaAt).toBe(7_000 + PAUSA_SFIDA_MS)
  })

  it('se il tempo finisce, nessun punto: la domanda si chiude alla scadenza piu’ il margine', () => {
    const aperta = statoSfida(0, limiti, [], L + MARGINE_SFIDA_MS - 1)
    expect(aperta.giri[0].chiusaAt).toBeNull()
    const chiusa = statoSfida(0, limiti, [], L + MARGINE_SFIDA_MS)
    expect(chiusa.giri[0].chiusaAt).toBe(L + MARGINE_SFIDA_MS)
    expect(chiusa.giri[0].punto).toBeNull()
    expect(puoRispondere(aperta.giri[0], 'a', L + 500)).toBe(true)
    expect(puoRispondere(aperta.giri[0], 'a', L + MARGINE_SFIDA_MS + 1)).toBe(false)
  })

  it('con il rallenty la domanda aspetta la scadenza lunga di chi e’ rimasto', () => {
    const s = statoSfida(0, limiti, [r(0, 'a', 10_000, false)], 15_500)
    expect(s.giri[0].chiusaAt).toBeNull()
    expect(s.giri[0].scade.b).toBe(20_000)
  })

  it('a fine domande il duello e’ finito, con i punti di tutti i giri', () => {
    const risposte = [r(0, 'a', 1_000, true), r(1, 'b', 1_000 + PAUSA_SFIDA_MS + 2_000, true)]
    const apre2 = 1_000 + PAUSA_SFIDA_MS + 2_000 + PAUSA_SFIDA_MS
    const s = statoSfida(0, limiti, [...risposte, r(2, 'a', apre2 + 3_000, true)], apre2 + 10_000)
    expect(s.finito).toBe(true)
    expect(s.punti).toEqual({ a: 2, b: 1 })
  })
})

describe('le impostazioni di una sfida', () => {
  it('prendono il valore ammesso piu’ vicino, e scartano quel che non si gioca', () => {
    const imp = impostazioniSfida({ categoria: 'capitali', modo: 'scelta', area: 'eu', quante: 50, secondi: 30 })
    expect(imp).toMatchObject({ quante: 20, secondi: 20, area: 'eu', imparo: true })
    expect(impostazioniSfida({ categoria: 'nessuna', modo: 'scelta' })).toBeNull()
    expect(impostazioniSfida({ categoria: 'citta', modo: 'cartina', area: 'paese:IT' })?.area).toBe('paese:IT')
    expect(impostazioniSfida({ categoria: 'fiumi', modo: 'cartina', area: 'marte' })).toBeNull()
  })

  it('sulla cartina il tempo e’ il doppio', () => {
    expect(limiteMs({ secondi: 15 }, false)).toBe(15_000)
    expect(limiteMs({ secondi: 15 }, true)).toBe(30_000)
  })
})

describe('l’orologio al rallentatore', () => {
  it('mostra gli stessi secondi, che scendono alla meta’', () => {
    expect(secondiMostrati(8_000, false)).toBe(8)
    // Otto secondi al rallentatore sono sedici veri: l'orologio segna ancora otto.
    expect(secondiMostrati(16_000, true)).toBe(8)
    expect(secondiMostrati(15_000, true)).toBe(8)
    expect(secondiMostrati(-5, true)).toBe(0)
  })
})
