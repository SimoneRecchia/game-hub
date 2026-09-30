/**
 * La notorietà come posizione in classifica, da 1 (il piu' noto) a 0: la
 * stessa regola di `perNotorieta` in scripts/quiz/riassunto.ts, che non la
 * esporta. A pari valore decide l'ordine in cui arrivano le voci, e chi la
 * chiama glielo passa gia' deterministico.
 */
export function perNotorieta<T>(voci: readonly T[], valore: (t: T) => number): Map<T, number> {
  const ordinate = [...voci].sort((a, b) => valore(b) - valore(a))
  const n = Math.max(1, ordinate.length - 1)
  return new Map(ordinate.map((t, i) => [t, Math.round((1 - i / n) * 1000) / 1000]))
}
