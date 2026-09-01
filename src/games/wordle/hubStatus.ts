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

  /*
   * Con cinque parole al giorno la card deve dire due cose: com'e' andata la
   * parola del giorno, e quanto resta da fare. Il punteggio e' quello della
   * giornata intera, non della sola principale.
   */
  const resta = summary.words - summary.done
  const avanzamento = resta > 0 && summary.done > 0 ? ` · ${summary.done}/${summary.words}` : ''

  switch (summary.status) {
    case 'won':
      return {
        text: insieme
          ? `In compagnia · +${summary.score ?? 0}${avanzamento}`
          : `+${summary.score ?? 0}${avanzamento || ' · tutte fatte'}`,
        tone: resta > 0 ? 'progress' : 'done',
      }
    case 'lost':
      return { text: `Non indovinata${avanzamento}`, tone: resta > 0 ? 'progress' : 'failed' }
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
