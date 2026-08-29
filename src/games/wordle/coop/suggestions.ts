import type { CoopSuggestion } from '@shared/types'

/**
 * L'ultimo suggerimento di ciascun invitato, dal più recente.
 *
 * Nella striscia sopra la tastiera conta sapere cosa propongono *adesso*: se
 * qualcuno cambia idea tre volte, mostrare tutte e tre le proposte occuperebbe
 * la striscia e coprirebbe gli altri. La cronologia completa resta nel
 * pannello degli invitati.
 *
 * L'elenco in ingresso arriva dal server già ordinato dal più recente, e
 * questa funzione conserva quell'ordine.
 */
export function latestPerGuest(
  suggestions: readonly CoopSuggestion[],
  limit = 5,
): CoopSuggestion[] {
  const visti = new Set<string>()
  const out: CoopSuggestion[] = []
  for (const s of suggestions) {
    if (visti.has(s.guestId)) continue
    visti.add(s.guestId)
    out.push(s)
    if (out.length >= limit) break
  }
  return out
}
