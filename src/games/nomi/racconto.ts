import { CATEGORIE_NOMI, type CategoriaNomi } from '@shared/nomi-cose'
import type { RisultatoNomi } from '@shared/types'
import type { RigaScritta } from './Foglio'
import { sola } from './scena'

const UN_DECIMALE = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })

/** "7,5", "8". */
export function decimale(n: number): string {
  return UN_DECIMALE.format(n)
}

/** Quanti l'hanno data, detto come si dice: "Solo tu", "In 3 su 12". */
export function quantiLaDanno(uguali: number, giocatori: number): string {
  return uguali <= 1 ? 'Solo tu' : `In ${uguali} su ${giocatori}`
}

/**
 * Le righe della partita di ieri: ogni risposta con quanti l'hanno data e i
 * suoi punti. Quella che ha dato solo lui si evidenzia: e' quella che vale di
 * piu'.
 */
export function righeDiIeri(ieri: RisultatoNomi): RigaScritta[] {
  return ieri.categorie.map((c) => {
    const r = ieri.risposte[c]
    if (!r || !r.testo) return { categoria: c, testo: '', segno: 'vuota' }
    if (r.forma === null || r.uguali === null) return { categoria: c, testo: r.testo, segno: 'sbagliata', punti: '0' }
    return {
      categoria: c,
      testo: r.testo,
      segno: 'giusta',
      nota: quantiLaDanno(r.uguali, ieri.giocatori),
      punti: `+${decimale(r.punti)}`,
      // Se ha giocato solo lui, le ha date tutte solo lui: non se ne evidenzia nessuna.
      rara: r.uguali <= 1 && ieri.giocatori > 1,
    }
  })
}

/** Un foglio al tavolo: le risposte scritte, quali valgono, e i punti di ognuna. */
export interface FoglioAlTavolo {
  testi: readonly (string | null | undefined)[]
  valide: readonly boolean[]
  punti: readonly number[]
}

/**
 * Le righe di una partita al tavolo, contro il computer o un amico: la mia
 * risposta, con il suo segno e i suoi punti, e sotto quella dell'altro. La
 * risposta che in una categoria ho scritto solo io si evidenzia.
 */
export function righeAlTavolo(
  categorie: readonly CategoriaNomi[],
  mio: FoglioAlTavolo,
  suo: FoglioAlTavolo & { nome: string },
): RigaScritta[] {
  return categorie.map((c, i) => {
    const testo = mio.testi[i]?.trim() ?? ''
    const sua = suo.testi[i]?.trim() ?? ''
    const punti = mio.punti[i] ?? 0
    return {
      categoria: c,
      testo,
      segno: !testo ? 'vuota' : mio.valide[i] ? 'giusta' : 'sbagliata',
      nota: `${suo.nome}: ${sua || '—'}${sua ? ` · ${suo.punti[i] ?? 0}` : ''}`,
      punti: punti > 0 ? `+${punti}` : testo ? '0' : undefined,
      rara: Boolean(testo) && mio.valide[i] && sola(punti),
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
