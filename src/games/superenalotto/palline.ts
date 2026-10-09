import { DA_SCEGLIERE, NUMERI } from '@shared/superenalotto'

/**
 * Il colore di una pallina, come nelle urne vere, a gruppi di cinque: rosse,
 * gialle, verdi e blu. Lo stesso nella diretta in 3D e nelle palline della
 * pagina, cosi' un numero si riconosce dal colore.
 */
export function coloreDellaPallina(n: number): string {
  const gruppo = Math.min(3, Math.floor((n - 1) / (NUMERI / 4)))
  return ['#e5383b', '#f2a20d', '#1f9d74', '#2f6fe8'][gruppo]
}

/** Il nome di una pallina estratta, nell'ordine: "Primo estratto". */
export const ORDINALI = ['Primo', 'Secondo', 'Terzo', 'Quarto'] as const

/** Quattro numeri a caso, per la schedina: la "giocata casuale" delle ricevitorie. */
export function casuali(): number[] {
  const urna = Array.from({ length: NUMERI }, (_, i) => i + 1)
  const fuori: number[] = []
  while (fuori.length < DA_SCEGLIERE) fuori.push(urna.splice(Math.floor(Math.random() * urna.length), 1)[0])
  return fuori.sort((a, b) => a - b)
}
