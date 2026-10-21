import type { CSSProperties } from 'react'
import { LettereAdesivo, type DatiAdesivo } from '@/components/Adesivo'
import type { EvaluatedGuess, WordleStatus } from '@shared/types'

/**
 * Quel che il Wordle dice di se' mentre si gioca e quando finisce: la riga
 * sotto la griglia, i tentativi in piccolo del riepilogo, l'adesivo della fine.
 */

/** Il titolo di una vittoria, secondo i tentativi: al primo colpo e' un'altra cosa che al sesto. */
export const TITOLI_VITTORIA = [
  'Al primo colpo!',
  'Splendido!',
  'Ottimo!',
  'Bene!',
  'Per un pelo!',
  'In extremis!',
] as const

/** La fine appena arrivata: la vittoria o la parola che non si e' trovata. */
export interface FinaleWordle {
  esito: 'won' | 'lost'
  tentativi: number
  parola: string | null
}

/** Quanto resta l'adesivo della fine, prima che si apra il riepilogo. */
export const ADESIVO_FINE_MS = 1_700

export function adesivoFine(finale: FinaleWordle, id: number): DatiAdesivo {
  if (finale.esito === 'won') {
    return {
      id,
      tono: 'vivace',
      titolo: TITOLI_VITTORIA[Math.min(finale.tentativi, 6) - 1],
      // Al primo colpo il titolo dice gia' tutto.
      sotto: finale.tentativi === 1 ? undefined : `In ${finale.tentativi} tentativi`,
      colore: 'linear-gradient(180deg, #9cf0b4, var(--wordle-tinta))',
      classe: 'wordle-adesivo',
      durata: ADESIVO_FINE_MS,
      disegno: <Stelle />,
      piede: finale.parola ? <LettereAdesivo parola={finale.parola} /> : undefined,
      suono: 'vittoria',
    }
  }
  return {
    id,
    tono: 'bordato',
    titolo: 'Peccato!',
    sotto: 'La parola era',
    colore: 'var(--roulette-tinta)',
    classe: 'wordle-adesivo',
    durata: ADESIVO_FINE_MS,
    piede: finale.parola ? <LettereAdesivo parola={finale.parola} /> : undefined,
    suono: 'sconfitta',
  }
}

/** Tre stelle che scoppiano: la vittoria del Wordle. */
function Stelle() {
  const stella = 'M0-10l2.9 6.3 6.6.8-4.9 4.6 1.3 6.6L0 5.1-5.9 8.3l1.3-6.6-4.9-4.6 6.6-.8z'
  return (
    <svg className="adesivo__disegno wordle-stelle" viewBox="0 0 120 70" aria-hidden="true">
      <path
        className="wordle-stelle__stella"
        d={stella}
        transform="translate(60 36) scale(2.4)"
        style={{ '--i': 0 } as CSSProperties}
      />
      <path
        className="wordle-stelle__stella"
        d={stella}
        transform="translate(24 44) scale(1.4)"
        style={{ '--i': 1 } as CSSProperties}
      />
      <path
        className="wordle-stelle__stella"
        d={stella}
        transform="translate(96 44) scale(1.4)"
        style={{ '--i': 2 } as CSSProperties}
      />
    </svg>
  )
}

/**
 * La riga sotto la griglia, quella che si vede: a che tentativo si e', e a
 * partita chiusa com'e' finita. Com'e' andato l'ultimo tentativo lo dice
 * `notaWordle`, a chi legge lo schermo.
 */
export function piedeWordle(
  guesses: readonly EvaluatedGuess[],
  status: WordleStatus,
  answer: string | null,
  maxAttempts: number,
): string {
  if (status === 'won') return guesses.length === 1 ? 'Indovinata al primo tentativo!' : `Indovinata in ${guesses.length} tentativi`
  if (status === 'lost') return answer ? `La parola era ${answer.toUpperCase()}` : 'Non indovinata'
  return `Tentativo ${Math.min(guesses.length + 1, maxAttempts)} di ${maxAttempts}`
}

/**
 * I tentativi in piccolo, coi loro colori: il riepilogo della partita. Le
 * lettere ci sono, perché la partita si riconosce dalle parole provate.
 */
export function MiniGriglia({ guesses }: { guesses: readonly EvaluatedGuess[] }) {
  if (guesses.length === 0) return null
  const nomi = { correct: 'al posto giusto', present: 'da spostare', absent: 'non c’è' } as const
  return (
    <div className="mini-griglia" role="img" aria-label={`I tentativi: ${guesses.map((g) => g.word.toUpperCase()).join(', ')}`}>
      {guesses.map((g, r) => (
        <div key={r} className="mini-griglia__riga" aria-hidden="true">
          {[...g.word].map((l, i) => (
            <span
              key={i}
              className={`mini-griglia__casella is-${g.pattern[i]}`}
              style={{ '--i': r * 5 + i } as CSSProperties}
              title={`${l.toUpperCase()} ${nomi[g.pattern[i]]}`}
            >
              {l.toUpperCase()}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * La riga sotto la griglia: com'e' andato l'ultimo tentativo, detto in parole —
 * quante lettere sono al posto giusto e quante da spostare. A partita chiusa,
 * la parola.
 */
export function notaWordle(guesses: readonly EvaluatedGuess[], status: WordleStatus, answer: string | null): string {
  if (status === 'won') return answer ? `Indovinata: ${answer.toUpperCase()}` : 'Indovinata!'
  if (status === 'lost') return answer ? `La parola era ${answer.toUpperCase()}` : 'Non indovinata'
  const ultima = guesses.at(-1)
  if (!ultima) return 'Cinque lettere, sei tentativi'
  const giuste = ultima.pattern.filter((t) => t === 'correct').length
  const presenti = ultima.pattern.filter((t) => t === 'present').length
  if (giuste === 0 && presenti === 0) return `${ultima.word.toUpperCase()}: nessuna lettera giusta`
  const parti = [giuste > 0 ? `${giuste} al posto giusto` : '', presenti > 0 ? `${presenti} da spostare` : ''].filter(
    Boolean,
  )
  return `${ultima.word.toUpperCase()}: ${parti.join(', ')}`
}
