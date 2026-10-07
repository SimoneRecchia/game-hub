/**
 * Quel che serve alle partite a turni dello Scarabeo — la classificata contro
 * il computer del giorno, la libera contro il computer o contro un amico: quanto
 * pensa il computer, e come si racconta la mossa dell'altro.
 */

import type { MossaGiocata } from '@shared/scarabeo'

/** Quanto "pensa" il computer, almeno: una risposta istantanea sembra un trucco. */
export const PENSA_ALMENO_MS = 900

/** Per quanto restano illuminate le tessere appena posate dall'altro. */
export const ILLUMINATA_MS = 2400

/** La parola da mostrare di una posa: la piu' lunga fra quelle formate, che e' quella che si e' voluta fare. */
export function parolaDi(parole: readonly string[]): string {
  return [...parole].sort((a, b) => b.length - a.length)[0] ?? ''
}

/** Quel che si dice della mossa dell'altro: "Il computer gioca CASA · +12". */
export function annuncioDi(giocata: Pick<MossaGiocata, 'tipo' | 'parole' | 'punti'> | undefined, chi: string): string {
  if (!giocata || giocata.tipo === 'passo') return `${chi} passa`
  if (giocata.tipo === 'cambio') return `${chi} cambia le tessere`
  return `${chi} gioca ${giocata.parole[0]?.toUpperCase() ?? ''} · +${giocata.punti}`
}

/** Quante tessere restano nel sacchetto, sotto il tabellino: la partita intera finisce quando finiscono. */
export function nelSacchetto(restanti: number): string {
  if (restanti === 0) return 'Sacchetto vuoto'
  return restanti === 1 ? '1 tessera nel sacchetto' : `${restanti} tessere nel sacchetto`
}
