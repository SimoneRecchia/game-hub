import type { CSSProperties } from 'react'
import { LettereAdesivo, type DatiAdesivo } from '@/components/Adesivo'
import { IconaScheda, Pillola } from '@/components/Scheda'
import type { EvaluatedGuess, WordleStatus } from '@shared/types'

/**
 * Quel che il Wordle dice di se' mentre si gioca e quando finisce: i tentativi
 * nella testata, la riga sotto la griglia, l'adesivo della fine.
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
      colore: 'linear-gradient(155deg, var(--wordle-1), var(--wordle-2) 80%)',
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
    colore: 'var(--brand)',
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
 * I tentativi nella testata: sei caselline, piene quelle usate, quella in corso
 * che respira. A partita chiusa diventano l'esito.
 */
export function Tentativi({
  guesses,
  maxAttempts,
  status,
}: {
  guesses: readonly EvaluatedGuess[]
  maxAttempts: number
  status: WordleStatus
}) {
  if (status === 'won') {
    return (
      <Pillola tono="buona">{guesses.length === 1 ? 'Al primo tentativo' : `In ${guesses.length} tentativi`}</Pillola>
    )
  }
  if (status === 'lost') return <Pillola tono="cattiva">Non indovinata</Pillola>
  return (
    <span className="tentativi" aria-label={`Tentativo ${guesses.length + 1} di ${maxAttempts}`}>
      {Array.from({ length: maxAttempts }, (_, i) => {
        const riga = guesses[i]
        const stato = riga
          ? riga.pattern.includes('correct')
            ? 'vicina'
            : 'usata'
          : i === guesses.length
            ? 'corrente'
            : 'libera'
        return <span key={i} className={`tentativi__casella is-${stato}`} />
      })}
      <span className="tentativi__conto u-tabnum" aria-hidden="true">
        {Math.min(guesses.length + 1, maxAttempts)}/{maxAttempts}
      </span>
    </span>
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

/** L'icona del Wordle nelle testate: una casella verde con la W. */
export function IconaWordle() {
  return (
    <IconaScheda colore="linear-gradient(150deg, var(--wordle-1), var(--wordle-2))">
      <span className="wordle-icona">W</span>
    </IconaScheda>
  )
}
