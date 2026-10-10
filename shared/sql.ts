/**
 * D1 accetta al massimo cinque termini in un SELECT composto (SQLite, di suo,
 * cinquecento): le parti si uniscono con `UNION ALL` a gruppi di cinque, e i
 * gruppi fra loro, uno dentro l'altro. Il banco dei test ha lo stesso limite.
 * La usano la classifica generale (server/lib/generale.ts) e il promemoria
 * della sera (scripts/notifiche.ts).
 */
const TERMINI_PER_UNIONE = 5

export function unisci(parti: readonly string[]): string {
  if (parti.length <= TERMINI_PER_UNIONE) return parti.join('\nUNION ALL\n')
  const gruppi: string[] = []
  for (let i = 0; i < parti.length; i += TERMINI_PER_UNIONE) {
    gruppi.push(`SELECT * FROM (${unisci(parti.slice(i, i + TERMINI_PER_UNIONE))})`)
  }
  return unisci(gruppi)
}
