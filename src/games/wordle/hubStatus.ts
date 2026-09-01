import type { WordleSummary } from '@shared/types'

export interface HubBadge {
  text: string
  tone: 'new' | 'progress' | 'done' | 'failed'
}

/** Etichetta mostrata sulla card del Wordle nell'hub. */
export function wordleBadge(summary: WordleSummary): HubBadge {
  /*
   * Se la giornata si sta giocando nella stanza di un altro, i tentativi sono
   * dell'host: "3/6" sarebbe il suo. Si dice dov'e' la partita, che e' anche
   * dove la card porta.
   */
  const insieme = summary.roomId !== null

  switch (summary.status) {
    case 'won':
      return {
        text: insieme ? `In compagnia · +${summary.score ?? 0}` : `Fatto · +${summary.score ?? 0}`,
        tone: 'done',
      }
    case 'lost':
      return { text: 'Non indovinata', tone: 'failed' }
    case 'playing':
      if (insieme) return { text: 'In corso, in compagnia', tone: 'progress' }
      return {
        text: summary.attempts === 0 ? 'Da giocare' : `In corso · ${summary.attempts}/6`,
        tone: summary.attempts === 0 ? 'new' : 'progress',
      }
    default:
      return { text: 'Nuova parola', tone: 'new' }
  }
}

/** Dove porta la card: la partita condivisa, se la giornata si gioca lì. */
export function wordleHref(summary: WordleSummary | null, fallback: string): string {
  return summary?.roomId ? `/insieme/${summary.roomId}` : fallback
}
