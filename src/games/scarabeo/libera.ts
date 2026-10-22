/**
 * La partita libera di Scarabeo contro il computer, salvata nel browser.
 *
 * Si gioca tutta qui — il computer gira nel telefono — e quindi resta qui:
 * chiudendo l'app a meta', la si ritrova riaprendola. Si salvano il seme del
 * sacchetto, il livello e le mosse, come nella classificata: il resto si
 * ricava. A partita finita la si manda al server per le statistiche, e la si
 * dimentica.
 */

import { LIVELLI, type PartitaLibera } from '@shared/scarabeo-computer'

export const CHIAVE_SCARABEO_LIBERO = 'giochi.scarabeo.libera'

export function leggiPartitaLibera(): PartitaLibera | null {
  try {
    const grezza = localStorage.getItem(CHIAVE_SCARABEO_LIBERO)
    if (!grezza) return null
    const p = JSON.parse(grezza) as PartitaLibera
    if (!Number.isInteger(p?.seme) || !LIVELLI.includes(p.livello) || !Array.isArray(p.mosse)) return null
    return p
  } catch {
    return null
  }
}

export function salvaPartitaLibera(partita: PartitaLibera | null): void {
  try {
    if (partita) localStorage.setItem(CHIAVE_SCARABEO_LIBERO, JSON.stringify(partita))
    else localStorage.removeItem(CHIAVE_SCARABEO_LIBERO)
  } catch {
    /* Safari privato nega lo storage: la partita resta in memoria finché la pagina e' aperta */
  }
}
