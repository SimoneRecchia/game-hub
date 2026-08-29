import type { WordleSummary } from '@shared/types'

export interface HubBadge {
  text: string
  tone: 'new' | 'progress' | 'done' | 'failed'
}

/** Etichetta mostrata sulla card del Wordle nell'hub. */
export function wordleBadge(summary: WordleSummary): HubBadge {
  switch (summary.status) {
    case 'won':
      return { text: `Fatto · +${summary.score ?? 0}`, tone: 'done' }
    case 'lost':
      return { text: 'Non indovinata', tone: 'failed' }
    case 'playing':
      return {
        text: summary.attempts === 0 ? 'Da giocare' : `In corso · ${summary.attempts}/6`,
        tone: summary.attempts === 0 ? 'new' : 'progress',
      }
    default:
      return { text: 'Nuova parola', tone: 'new' }
  }
}
