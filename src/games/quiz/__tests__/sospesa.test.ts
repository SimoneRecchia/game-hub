import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({ api: vi.fn(async () => null) }))

import { lasciaSospesa, segnaSospesa, sospesaDi } from '@/games/sospese/registro'
import type { DomandaCompleta } from '@shared/quiz-domande'
import { CHIAVE_PARTITA, lasciaPartitaQuiz, leggiPartitaQuiz, salvaPartitaQuiz, type PartitaSalvata } from '../sospesa'

/** Il localStorage del browser, in memoria: nei test gira Node, che non ce l'ha. */
function memoria(): Storage {
  const dati = new Map<string, string>()
  return {
    get length() {
      return dati.size
    },
    clear: () => dati.clear(),
    getItem: (k) => dati.get(k) ?? null,
    key: (i) => [...dati.keys()][i] ?? null,
    removeItem: (k) => void dati.delete(k),
    setItem: (k, v) => void dati.set(k, String(v)),
  }
}

const A = '/quiz/libera?categoria=bandiere&domande=10'

const domanda = (n: number) =>
  ({
    testo: `Domanda ${n}`,
    opzioni: [{ id: 'a', testo: 'A' }],
    giusta: 'a',
    risposta: 'A',
  }) as unknown as DomandaCompleta

const partita = (a = A): PartitaSalvata => ({
  v: 1,
  a,
  data: '2026-10-22',
  giorno: null,
  domande: [domanda(1), domanda(2), domanda(3)],
  risposte: [{ scelta: 'a', ms: 4200 }],
  indice: 1,
  ripassoDa: null,
  finita: false,
  aiutiRimasti: 0,
  trascorsoMs: 3000,
  restanteMs: 12000,
})

beforeEach(() => {
  vi.stubGlobal('localStorage', memoria())
  vi.stubGlobal('window', new EventTarget())
})

describe('il quiz libero in sospeso', () => {
  it('si ritrova con il tempo che restava, all’indirizzo da cui la si riprende', () => {
    segnaSospesa('quiz', { a: A, chiavi: [CHIAVE_PARTITA] })
    salvaPartitaQuiz(partita())
    expect(leggiPartitaQuiz(A)).toEqual(partita())
    // Un'altra partita non e' questa, e non la tocca.
    expect(leggiPartitaQuiz('/quiz/libera?categoria=capitali&domande=10')).toBeNull()
    expect(localStorage.getItem(CHIAVE_PARTITA)).not.toBeNull()
  })

  it('lasciata dalle Libere non c’e’ piu', () => {
    segnaSospesa('quiz', { a: A, chiavi: [CHIAVE_PARTITA] })
    salvaPartitaQuiz(partita())
    lasciaSospesa('quiz')
    expect(localStorage.getItem(CHIAVE_PARTITA)).toBeNull()
    expect(leggiPartitaQuiz(A)).toBeNull()
  })

  it('senza il suo biglietto non e’ una partita, e se ne va', () => {
    salvaPartitaQuiz(partita())
    expect(leggiPartitaQuiz(A)).toBeNull()
    expect(localStorage.getItem(CHIAVE_PARTITA)).toBeNull()
  })

  it('un biglietto senza la partita si toglie', () => {
    segnaSospesa('quiz', { a: A, chiavi: [CHIAVE_PARTITA] })
    localStorage.setItem(CHIAVE_PARTITA, '{"v":1}')
    expect(leggiPartitaQuiz(A)).toBeNull()
    expect(sospesaDi('quiz')).toBeNull()
  })

  it('cominciarne un’altra la lascia', () => {
    segnaSospesa('quiz', { a: A, chiavi: [CHIAVE_PARTITA] })
    salvaPartitaQuiz(partita())
    lasciaPartitaQuiz()
    expect(sospesaDi('quiz')).toBeNull()
    expect(localStorage.getItem(CHIAVE_PARTITA)).toBeNull()
  })
})
