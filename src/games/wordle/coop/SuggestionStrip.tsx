import { Avatar } from '@/components/Avatar'
import type { CoopSuggestion } from '@shared/types'
import { latestPerGuest } from './suggestions'
import './SuggestionStrip.css'

interface Props {
  suggestions: CoopSuggestion[]
  /** Toccare un suggerimento lo scrive nella griglia, senza inviarlo. */
  onPick: (word: string) => void
  disabled: boolean
}

/**
 * I suggerimenti arrivati all'host, sopra la tastiera.
 *
 * Toccarne uno riempie la riga ma non lo invia: la parola la decide sempre
 * l'host, altrimenti un invitato potrebbe giocargli i tentativi.
 */
export function SuggestionStrip({ suggestions, onPick, disabled }: Props) {
  if (suggestions.length === 0) return null

  const visibili = latestPerGuest(suggestions)

  return (
    <div className="suggerimenti" role="group" aria-label="Suggerimenti ricevuti">
      <ul className="suggerimenti__lista">
        {visibili.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={`suggerimento${s.usedAt ? ' is-usato' : ''}`}
              onClick={() => onPick(s.word)}
              disabled={disabled}
              title={
                s.usedAt
                  ? `${s.word.toUpperCase()}, suggerita da ${s.guestName}: giocata`
                  : `${s.guestName} suggerisce ${s.word.toUpperCase()}`
              }
            >
              <Avatar nickname={s.guestName} color={s.avatarColor} size={20} />
              <span className="suggerimento__nome">{s.guestName}</span>
              <span className="suggerimento__parola">{s.word.toUpperCase()}</span>
              {/* Giocandola gli hai fatto fare punti: vederlo qui e' il modo
                  piu' diretto di dire a cosa serve suggerire. */}
              {s.assistPoints > 0 && (
                <span className="suggerimento__assist">+{s.assistPoints}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
