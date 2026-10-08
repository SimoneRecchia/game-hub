/**
 * Il tempo per mossa dei giochi al tavolo, che si sceglie nella sala: contro il
 * computer vale nel telefono, fra amici lo tiene il server e viaggia con
 * l'invito (`tavolo_partite.tempo_mossa_ms`).
 *
 * I tempi sono in secondi, e null e' senza tempo. Il tris non ce l'ha: senza
 * tempo chi ci pensa abbastanza non sbaglia mai, e finirebbe sempre patta. Il
 * primo valore di ogni gioco non e' per forza quello di sempre: quello sta in
 * `TEMPO_DI_SEMPRE`, ed e' il tempo delle partite di prima che si potesse
 * scegliere.
 */

import type { GiocoAlTavolo } from './tavolo'

export const TEMPI_MOSSA: Record<GiocoAlTavolo, readonly (number | null)[]> = {
  tris: [5, 10, 20, 30],
  forza4: [null, 10, 20, 30, 60],
  scacchi: [null, 30, 60, 120, 300],
  dama: [null, 30, 60, 120, 300],
  go: [null, 30, 60, 120, 300],
  scarabeo: [null, 60, 120, 300],
}

export const TEMPO_DI_SEMPRE: Record<GiocoAlTavolo, number | null> = {
  tris: 10,
  forza4: null,
  scacchi: null,
  dama: null,
  go: null,
  scarabeo: null,
}

/** Il tempo come lo manda il telefono, se e' fra le scelte del gioco; se no quello di sempre. */
export function tempoMossaValido(gioco: GiocoAlTavolo, valore: unknown): number | null {
  const scelte = TEMPI_MOSSA[gioco]
  return scelte.includes(valore as number | null) ? (valore as number | null) : TEMPO_DI_SEMPRE[gioco]
}

/** Come si dice un tempo: "Senza", "30 s", "2 min". */
export function nomeTempoMossa(secondi: number | null): string {
  if (secondi === null) return 'Senza'
  return secondi < 60 ? `${secondi} s` : `${secondi / 60} min`
}
