import type { ScarabeoSummary } from '@shared/types'
import type { HubBadge } from '@/games/wordle/hubStatus'

/**
 * L'etichetta sulla card dello Scarabeo nell'hub.
 *
 * Dice due cose e non una: quanti punti e a che punto sei. Il punteggio da solo
 * non distinguerebbe "300 punti e ho finito" da "300 punti con sei mosse
 * ancora in mano", che per chi guarda la classifica sono situazioni diverse.
 */
export function scarabeoBadge(summary: ScarabeoSummary): HubBadge {
  const restano = summary.mosseTotali - summary.mosseUsate

  if (summary.status === 'new') return { text: 'Da giocare', tone: 'new' }
  if (summary.status === 'done') return { text: `${summary.punti} punti`, tone: 'done' }
  return {
    // "restano" e non "6 mosse": quest'ultimo si leggeva come "sei mosse
    // giocate", che e' il contrario.
    text: `${summary.punti} punti · restano ${restano}`,
    tone: 'progress',
  }
}
