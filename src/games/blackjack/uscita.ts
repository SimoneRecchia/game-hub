/**
 * L'uscita dal tavolo che e' partita lasciando la pagina: la sala la aspetta
 * prima di leggere, altrimenti la risposta potrebbe arrivare prima dell'uscita
 * e la sala direbbe ancora "Torna al tavolo".
 */
let inCorso: Promise<void> | null = null

export function uscitaDalTavolo(richiesta: Promise<unknown>) {
  const questa: Promise<void> = richiesta.then(
    () => undefined,
    () => undefined,
  )
  inCorso = questa
  void questa.then(() => {
    if (inCorso === questa) inCorso = null
  })
}

export function finitaLUscita(): Promise<void> {
  return inCorso ?? Promise.resolve()
}
