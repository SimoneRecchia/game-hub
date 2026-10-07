/**
 * La composizione del mazzo: quanti personaggi di ogni tipo, dato il numero di
 * giocatori. Segue il regolamento: in otto, cinque villici, due lupi e il
 * Veggente; da nove si aggiungono i personaggi speciali nell'ordine in cui il
 * regolamento li introduce; da sedici un terzo lupo.
 *
 * Chi organizza la partita puo' anche decidere personaggio per personaggio:
 * `controllaComposizione` dice se il mazzo scelto si puo' giocare (gli errori)
 * e dove si allontana dal regolamento (gli avvisi, che non fermano niente).
 */

import { PERSONAGGI, TUTTI_I_PERSONAGGI, type IdPersonaggio } from './lupus-personaggi'

export type Composizione = Partial<Record<IdPersonaggio, number>>

export const GIOCATORI_MINIMI = 4
export const GIOCATORI_MASSIMI = 40

/** Quanti lupi per un dato numero di giocatori. */
export function lupiPer(giocatori: number): number {
  if (giocatori < 8) return 1
  if (giocatori < 16) return 2
  if (giocatori < 31) return 3
  // "un lupo ogni 10 giocatori" oltre i trenta, come dice il manuale del decennale
  return 3 + Math.ceil((giocatori - 30) / 10)
}

/** I personaggi speciali del set base, nell'ordine in cui il regolamento li introduce. */
const SPECIALI_BASE: IdPersonaggio[] = ['medium', 'indemoniato', 'guardia', 'gufo', 'massone', 'criceto', 'mitomane']

/** La composizione che il regolamento consiglia per quei giocatori. */
export function composizioneAutomatica(giocatori: number): Composizione {
  const c: Composizione = {}
  const lupi = lupiPer(giocatori)
  c.lupo = lupi
  let usate = lupi

  if (giocatori >= 5) {
    c.veggente = 1
    usate += 1
  }

  for (const id of SPECIALI_BASE) {
    const p = PERSONAGGI[id]
    if (giocatori < p.minimoGiocatori) continue
    // Almeno un villico deve restare.
    if (usate + p.inBlocchi > giocatori - 1) break
    c[id] = p.inBlocchi
    usate += p.inBlocchi
  }

  c.villico = Math.max(0, giocatori - usate)
  return c
}

export function carteTotali(c: Composizione): number {
  return Object.values(c).reduce<number>((somma, n) => somma + (n ?? 0), 0)
}

export function lupiIn(c: Composizione): number {
  return TUTTI_I_PERSONAGGI.filter((id) => PERSONAGGI[id].contaComeLupo).reduce((somma, id) => somma + (c[id] ?? 0), 0)
}

export interface ProblemaComposizione {
  livello: 'errore' | 'avviso'
  messaggio: string
}

/** Che cosa non va in una composizione per quei giocatori: gli errori la rendono ingiocabile, gli avvisi no. */
export function controllaComposizione(c: Composizione, giocatori: number): ProblemaComposizione[] {
  const problemi: ProblemaComposizione[] = []
  const totale = carteTotali(c)
  if (totale !== giocatori) {
    problemi.push({
      livello: 'errore',
      messaggio:
        totale < giocatori
          ? `Mancano ${giocatori - totale} personaggi: aggiungi villici o personaggi speciali.`
          : `Ci sono ${totale - giocatori} personaggi di troppo rispetto ai giocatori.`,
    })
  }
  const lupi = lupiIn(c)
  if (lupi === 0) {
    problemi.push({ livello: 'errore', messaggio: 'Serve almeno un lupo mannaro.' })
  }
  if (lupi >= giocatori - lupi) {
    problemi.push({
      livello: 'errore',
      messaggio: 'I lupi sarebbero già tanti quanti gli altri: la partita finirebbe subito.',
    })
  }
  for (const id of TUTTI_I_PERSONAGGI) {
    const n = c[id] ?? 0
    const p = PERSONAGGI[id]
    if (n < 0) problemi.push({ livello: 'errore', messaggio: `${p.nome}: numero non valido.` })
    if (n > p.massimo) {
      problemi.push({ livello: 'errore', messaggio: `${p.nome}: al massimo ${p.massimo}.` })
    }
    if (p.inBlocchi > 1 && n % p.inBlocchi !== 0) {
      problemi.push({ livello: 'errore', messaggio: `I ${p.plurale ?? p.nome} vanno inseriti in coppia.` })
    }
    if (n > 0 && giocatori < p.minimoGiocatori) {
      problemi.push({
        livello: 'avviso',
        messaggio: `${p.nome}: il regolamento lo consiglia da ${p.minimoGiocatori} giocatori.`,
      })
    }
  }
  if ((c.criceto ?? 0) > 0 && (c.darius ?? 0) > 0) {
    problemi.push({
      livello: 'avviso',
      messaggio: 'Criceto Mannaro e Darius sono pensati come alternativi: vincono entrambi da soli.',
    })
  }
  if ((c.medium ?? 0) > 0 && (c.purple ?? 0) > 0) {
    problemi.push({ livello: 'avviso', messaggio: 'Medium e Miss Purple sono pensati come alternativi.' })
  }
  return problemi
}

/**
 * Le carte da mescolare, nell'ordine di `PERSONAGGI`: e' da quest'ordine che
 * il seme della partita decide chi riceve che cosa.
 */
export function mazzoDi(c: Composizione): IdPersonaggio[] {
  const mazzo: IdPersonaggio[] = []
  for (const id of TUTTI_I_PERSONAGGI) {
    for (let i = 0; i < (c[id] ?? 0); i += 1) mazzo.push(id)
  }
  return mazzo
}
