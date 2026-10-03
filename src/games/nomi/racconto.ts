import { CATEGORIE_NOMI, type CategoriaNomi } from '@shared/nomi-cose'
import type { RisultatoNomi } from '@shared/types'
import type { RigaScritta } from './Foglio'

const UN_DECIMALE = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })

/** "7,5", "8". */
export function decimale(n: number): string {
  return UN_DECIMALE.format(n)
}

/** Quanti l'hanno data, detto come si dice: "Solo tu", "In 3 su 12". */
export function quantiLaDanno(uguali: number, giocatori: number): string {
  return uguali <= 1 ? 'Solo tu' : `In ${uguali} su ${giocatori}`
}

/** Le righe della partita di ieri: ogni risposta con quanti l'hanno data e i suoi punti. */
export function righeDiIeri(ieri: RisultatoNomi): RigaScritta[] {
  return ieri.categorie.map((c) => {
    const r = ieri.risposte[c]
    if (!r || !r.testo) return { categoria: c, testo: '', segno: 'vuota' }
    if (r.forma === null || r.uguali === null) return { categoria: c, testo: r.testo, segno: 'sbagliata' }
    return {
      categoria: c,
      testo: r.testo,
      segno: 'giusta',
      nota: quantiLaDanno(r.uguali, ieri.giocatori),
      punti: `+${decimale(r.punti)}`,
    }
  })
}

/** Le risposte piu' date di ieri, categoria per categoria, quelle date da piu' di uno. */
export function piuDateDi(
  ieri: RisultatoNomi,
): { categoria: CategoriaNomi; nome: string; risposte: { testo: string; uguali: number }[] }[] {
  return ieri.categorie.flatMap((c) => {
    const risposte = (ieri.piuDate[c] ?? []).filter((r) => r.uguali > 1)
    return risposte.length > 0 ? [{ categoria: c, nome: CATEGORIE_NOMI[c].nome, risposte }] : []
  })
}
