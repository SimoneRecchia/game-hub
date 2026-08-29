/**
 * Feedback tattile leggero sui dispositivi che lo supportano.
 * Su iOS Safari `vibrate` non esiste: le chiamate diventano no-op.
 */

type Pattern = 'tap' | 'success' | 'error'

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 8,
  success: [12, 40, 24],
  error: [30, 50, 30],
}

export function haptic(pattern: Pattern = 'tap') {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(PATTERNS[pattern])
  } catch {
    /* alcuni browser rifiutano vibrate fuori da un gesto utente */
  }
}
