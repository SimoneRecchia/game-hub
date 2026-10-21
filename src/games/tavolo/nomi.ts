import type { GiocoAlTavolo, GiocoTavoliere } from '@shared/tavolo'

/**
 * I nomi dei giochi da tavoliere per chi non gioca: gli avvisi degli inviti e
 * la registrazione, che stanno nel pezzo dell'app che si scarica subito. Le
 * regole, i tavolieri e i pezzi arrivano con le pagine dei giochi.
 */

/** Come si dice giocarci: "ti invita a giocare a scacchi". */
export const A_GIOCO: Record<GiocoAlTavolo, string> = {
  scacchi: 'a scacchi',
  dama: 'a dama',
  forza4: 'a Forza 4',
  go: 'a go',
  tris: 'a tris',
  scarabeo: 'a Scarabeo',
}

/** Il nome del gioco, sopra l'avviso di un invito e accanto a una partita aperta. */
export const NOMI_AL_TAVOLO: Record<GiocoAlTavolo, string> = {
  scacchi: 'Scacchi',
  dama: 'Dama',
  forza4: 'Forza 4',
  go: 'Go',
  tris: 'Tris',
  scarabeo: 'Scarabeo',
}

/** Una variante come si legge: il goban "13 × 13". Null per i giochi che non ne hanno. */
export function nomeVariante(gioco: GiocoAlTavolo, variante: string | null | undefined): string | null {
  return gioco === 'go' && variante ? `${variante} × ${variante}` : null
}

/** Il colore del segno di ogni parte, accanto al nome: il disco, il pezzo. */
export const SEGNI: Record<GiocoTavoliere, readonly [string, string]> = {
  scacchi: ['#f6f6f4', '#2b2b2e'],
  dama: ['#fff8e8', '#3a3358'],
  forza4: ['var(--f4-rosso)', 'var(--f4-giallo)'],
  // Nel go comincia il Nero.
  go: ['#232326', '#f5f4f0'],
  tris: ['var(--tris-croce)', 'var(--tris-cerchio)'],
}
