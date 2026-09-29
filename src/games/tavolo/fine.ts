import type { DatiAdesivo } from '@/components/Adesivo'
import type { GiocoTavoliere, MotivoTavoliere } from '@shared/tavolo'

/** Quanto resta l'adesivo della fine: poi il piede mostra il risultato e la rivincita. */
export const ADESIVO_FINE_MS = 2_200

export type Chi = 'io' | 'avversario' | null

/**
 * Com'e' finita, in un titolo e una riga: "Hai vinto" e "Scacco matto",
 * "Patta" e "La stessa posizione tre volte". `altro` e' chi gioca contro: il
 * nome dell'amico, o "il computer".
 */
export function testoFine(motivo: MotivoTavoliere, vincitore: Chi, altro: string): { titolo: string; riga: string } {
  const Altro = altro.charAt(0).toUpperCase() + altro.slice(1)
  if (vincitore === null) {
    const righe: Partial<Record<MotivoTavoliere, string>> = {
      stallo: 'Stallo: chi deve muovere non ha mosse',
      ripetizione: 'La stessa posizione per tre volte',
      cinquanta: 'Cinquanta mosse senza prese né pedoni',
      materiale: 'Non resta abbastanza per dare matto',
      quaranta: 'Quaranta mosse a testa di sole dame',
      pieno: 'La griglia è piena',
      patta: 'D’accordo',
    }
    return { titolo: 'Patta', riga: righe[motivo] ?? '' }
  }
  const vinto = vincitore === 'io'
  const titolo = vinto ? 'Hai vinto' : `Ha vinto ${altro}`
  switch (motivo) {
    case 'matto':
      return { titolo, riga: 'Scacco matto' }
    case 'bloccato':
      return { titolo, riga: vinto ? `${Altro} non può più muovere` : 'Non puoi più muovere' }
    case 'forza4':
      return { titolo, riga: 'Quattro in fila' }
    case 'resa':
      return { titolo, riga: vinto ? `${Altro} ha abbandonato` : 'Hai abbandonato' }
    case 'assenza':
      return { titolo, riga: vinto ? `${Altro} non ha più mosso` : 'Vinta a tavolino' }
    default:
      return { titolo, riga: '' }
  }
}

const COLORE: Record<GiocoTavoliere, string> = {
  scacchi: 'linear-gradient(155deg, var(--scacchi-1), var(--scacchi-2) 80%)',
  dama: 'linear-gradient(155deg, var(--dama-1), var(--dama-2) 80%)',
  forza4: 'linear-gradient(155deg, var(--forza4-1), var(--forza4-2) 80%)',
}

const BORDO: Record<GiocoTavoliere, string> = {
  scacchi: 'var(--scacchi-2)',
  dama: 'var(--dama-2)',
  forza4: 'var(--forza4-2)',
}

/** L'adesivo della fine, nel colore del gioco: vivace per una vittoria, bordato per il resto. */
export function adesivoFine(
  gioco: GiocoTavoliere,
  motivo: MotivoTavoliere,
  vincitore: Chi,
  altro: string,
): Omit<DatiAdesivo, 'id'> {
  const { titolo, riga } = testoFine(motivo, vincitore, altro)
  if (vincitore === 'io') {
    return {
      tono: 'vivace',
      titolo: `${titolo}!`,
      sotto: riga,
      colore: COLORE[gioco],
      durata: ADESIVO_FINE_MS,
      suono: 'vittoria',
    }
  }
  return {
    tono: 'bordato',
    titolo,
    sotto: riga,
    colore: BORDO[gioco],
    durata: ADESIVO_FINE_MS,
    suono: vincitore === null ? 'pareggio' : motivo === 'resa' ? 'esce' : 'sconfitta',
  }
}
