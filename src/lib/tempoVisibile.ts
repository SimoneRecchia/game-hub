/**
 * Un orologio che si ferma a pagina nascosta, per i tempi delle libere.
 *
 * Una libera lasciata a meta' — un'altra app, il telefono in tasca — resta in
 * sospeso, e il suo tempo deve ripartire da dove era: non e' una classificata,
 * e non c'e' una classifica da proteggere. Spostare le scadenze al ritorno non
 * basterebbe, perché i timer di una pagina nascosta girano ancora (piu' piano),
 * e un anello avrebbe dato il tempo finito prima che la pagina se ne
 * accorgesse. Con questo orologio il tempo nascosto non passa: le scadenze si
 * scrivono e si leggono su di lui, e da nascosta la pagina e' ferma all'istante
 * in cui e' sparita.
 *
 * Vale finché la pagina resta caricata: chi salva una partita ne salva quanto
 * manca, non l'ora della scadenza.
 */

/** Il tempo passato a pagina nascosta, da quando la pagina e' caricata. */
let fermo = 0
let nascostaDa: number | null = null
let installato = false

function installa(): void {
  if (installato || typeof document === 'undefined') return
  installato = true
  if (document.hidden) nascostaDa = Date.now()
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      nascostaDa ??= Date.now()
    } else if (nascostaDa !== null) {
      fermo += Date.now() - nascostaDa
      nascostaDa = null
    }
  })
}

/** L'ora per i tempi delle libere: come `Date.now()`, senza il tempo passato a pagina nascosta. */
export function adessoVisibile(): number {
  installa()
  return (nascostaDa ?? Date.now()) - fermo
}
