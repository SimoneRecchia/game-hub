/**
 * Le fiches della slot e di Crazy Time: uno, cinque, dieci e venticinque. Si
 * toccano quante volte si vuole, e ogni tocco aggiunge il suo valore alla
 * puntata, fino al saldo; per azzerarla c'e' un tasto a parte.
 */
export const FICHES: readonly number[] = [1, 5, 10, 25]

/**
 * I colori dei casino': blu da uno, rossa da cinque, verde da dieci, nera da
 * venticinque. Abbastanza scuri da reggere il numero color crema (4,5:1).
 */
export const COLORE_FICHE: Readonly<Record<number, string>> = {
  1: '#2563eb',
  5: '#d62839',
  10: '#118048',
  25: '#2a2440',
}

/** Una puntata in fiches, dalle piu' grandi: la pila che torna indietro quando la si azzera. */
export function inFiches(puntata: number): number[] {
  const pezzi: number[] = []
  let resto = puntata
  for (const valore of [...FICHES].reverse()) {
    while (resto >= valore) {
      pezzi.push(valore)
      resto -= valore
    }
  }
  return pezzi
}
