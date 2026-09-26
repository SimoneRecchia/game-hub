import type { CruciverbaSummary } from '@shared/types'
import type { HubBadge } from '@/games/wordle/hubStatus'

/**
 * L'etichetta sulla card del cruciverba nell'hub.
 *
 * Mentre si gioca dice quanto manca, non i punti: finché non e' completato un
 * cruciverba non vale niente, e "100 punti" su una griglia a meta' sembrerebbe
 * un punteggio gia' fatto.
 */
export function cruciverbaBadge(summary: CruciverbaSummary): HubBadge | null {
  switch (summary.status) {
    case 'assente':
      return null
    case 'new':
      return { text: 'Da giocare', tone: 'new' }
    case 'done':
      return { text: `${summary.punti} punti`, tone: 'done' }
    default: {
      const restano = summary.bianche - summary.scritte
      return {
        text: restano > 0 ? `${restano} ${restano === 1 ? 'casella' : 'caselle'} da scrivere` : 'Da controllare',
        tone: 'progress',
      }
    }
  }
}
