/**
 * L'uscita dal tavolo che parte lasciando la pagina: la sala la aspetta prima
 * di leggere, altrimenti la risposta potrebbe arrivare prima dell'uscita e la
 * sala direbbe ancora "Torna al tavolo" — a un tavolo che, rimasto vuoto, il
 * server ha gia' cancellato.
 *
 * La richiesta parte un giro dopo lo smontaggio, perché in sviluppo React
 * smonta e rimonta subito; ma l'attesa si segna subito, nello smontaggio:
 * segnata con la richiesta, la sala, che si monta nello stesso momento, la
 * leggeva prima che ci fosse e chiedeva i tavoli senza aspettarla.
 */
let inCorso: Promise<void> | null = null

/**
 * Esce fra un giro con `richiesta`, e intanto fa aspettare chi legge; `dopo`
 * quando la richiesta ha risposto. La funzione restituita annulla l'uscita, se
 * la pagina si rimonta prima.
 */
export function esciFraPoco(richiesta: () => Promise<unknown>, dopo?: () => void): () => void {
  let risolvi = () => {}
  const questa = new Promise<void>((r) => {
    risolvi = r
  })
  inCorso = questa
  const fine = () => {
    if (inCorso === questa) inCorso = null
    risolvi()
  }
  const timer = window.setTimeout(() => {
    const finita = () => {
      dopo?.()
      fine()
    }
    void richiesta().then(finita, finita)
  }, 0)
  return () => {
    window.clearTimeout(timer)
    fine()
  }
}

export function finitaLUscita(): Promise<void> {
  return inCorso ?? Promise.resolve()
}
