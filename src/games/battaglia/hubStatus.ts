import type { BattagliaSummary } from '@shared/types'
import type { HubBadge } from '@/games/wordle/hubStatus'

/**
 * L'etichetta sulla card della battaglia navale nell'hub.
 *
 * Qui non c'e' una giornata da fare: c'e' una partita aperta, o qualcuno da
 * sfidare. La card dice la cosa che serve sapere per decidere se entrare.
 */
export function battagliaBadge(summary: BattagliaSummary): HubBadge {
  const p = summary.partita
  if (p) {
    if (p.stato === 'disposizione') return { text: 'Disponi la flotta', tone: 'progress' }
    return p.tuoTurno
      ? { text: 'Tocca a te', tone: 'progress' }
      : { text: `Tocca a ${p.avversario.displayName}`, tone: 'progress' }
  }
  if (summary.online === 0) return { text: 'Nessuno online', tone: 'new' }
  return {
    text: summary.online === 1 ? '1 collega online' : `${summary.online} colleghi online`,
    tone: 'new',
  }
}
