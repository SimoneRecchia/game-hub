/**
 * Le regole di Forza 4: sette colonne, sei righe, e chi mette quattro dischi in
 * fila — in orizzontale, in verticale o in diagonale — vince. Un disco cade in
 * fondo alla colonna scelta, e con la griglia piena la partita e' patta.
 *
 * Le caselle vanno dal basso: la riga 0 e' quella del fondo, e l'indice di una
 * casella e' `riga * COLONNE + colonna`. E' l'ordine in cui la gravita' le
 * riempie, e rende semplice sapere dove cade un disco: sopra l'ultimo della
 * colonna.
 *
 * I due giocatori sono 0 e 1: 0 e' chi comincia. Non c'e' un tratto da
 * salvare, perché si ricava dai dischi: tocca a 0 quando ce ne sono tanti
 * dell'uno quanti dell'altro.
 */

export const COLONNE = 7
export const RIGHE = 6
export const CASELLE = COLONNE * RIGHE

/** Chi ha messo il disco: 0 chi ha cominciato, 1 l'altro. */
export type Disco = 0 | 1

export interface PosizioneForza4 {
  /** Dal basso, riga per riga: `riga * COLONNE + colonna`. */
  readonly caselle: readonly (Disco | null)[]
  readonly tratto: Disco
}

export function casellaDi(riga: number, colonna: number): number {
  return riga * COLONNE + colonna
}

export function posizioneIniziale(): PosizioneForza4 {
  return { caselle: Array<Disco | null>(CASELLE).fill(null), tratto: 0 }
}

/**
 * La posizione in testo, per salvarla: quarantadue caratteri dal basso, '.'
 * per una casella vuota, '0' e '1' per i dischi.
 */
export function scrivi(p: PosizioneForza4): string {
  return p.caselle.map((d) => (d === null ? '.' : String(d))).join('')
}

/**
 * Il testo di una posizione, o null se non puo' esistere: un disco sospeso
 * sopra una casella vuota, o dischi che non si alternano.
 */
export function leggi(testo: string): PosizioneForza4 | null {
  if (typeof testo !== 'string' || testo.length !== CASELLE || !/^[.01]+$/.test(testo)) return null
  const caselle = [...testo].map((ch) => (ch === '.' ? null : (Number(ch) as Disco)))
  for (let c = 0; c < COLONNE; c += 1) {
    for (let r = 1; r < RIGHE; r += 1) {
      if (caselle[casellaDi(r, c)] !== null && caselle[casellaDi(r - 1, c)] === null) return null
    }
  }
  const zeri = caselle.filter((d) => d === 0).length
  const uni = caselle.filter((d) => d === 1).length
  if (zeri !== uni && zeri !== uni + 1) return null
  return { caselle, tratto: zeri === uni ? 0 : 1 }
}

/** La riga dove cadrebbe un disco nella colonna, o null se e' piena. */
export function rigaDiArrivo(p: PosizioneForza4, colonna: number): number | null {
  if (!Number.isInteger(colonna) || colonna < 0 || colonna >= COLONNE) return null
  for (let r = 0; r < RIGHE; r += 1) if (p.caselle[casellaDi(r, colonna)] === null) return r
  return null
}

/** Le colonne dove si puo' ancora mettere un disco, da sinistra. */
export function colonneLibere(p: PosizioneForza4): number[] {
  const libere: number[] = []
  for (let c = 0; c < COLONNE; c += 1) if (p.caselle[casellaDi(RIGHE - 1, c)] === null) libere.push(c)
  return libere
}

/** La posizione dopo il disco nella colonna, o null se la colonna e' piena o la partita e' finita. */
export function gioca(p: PosizioneForza4, colonna: number): PosizioneForza4 | null {
  if (quattro(p)) return null
  const r = rigaDiArrivo(p, colonna)
  if (r === null) return null
  const caselle = [...p.caselle]
  caselle[casellaDi(r, colonna)] = p.tratto
  return { caselle, tratto: p.tratto === 0 ? 1 : 0 }
}

/** Le quattro direzioni di una fila: orizzontale, verticale, e le due diagonali. */
const DIREZIONI: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]

/**
 * La fila vincente, se c'e': chi l'ha fatta e tutte le sue caselle — anche
 * cinque o sei, se l'ultimo disco ha chiuso una fila piu' lunga, o due file
 * insieme: si illuminano tutte.
 */
export function quattro(p: PosizioneForza4): { disco: Disco; caselle: number[] } | null {
  const vincenti = new Set<number>()
  let disco: Disco | null = null
  for (let r = 0; r < RIGHE; r += 1) {
    for (let c = 0; c < COLONNE; c += 1) {
      const d = p.caselle[casellaDi(r, c)]
      if (d === null) continue
      for (const [dr, dc] of DIREZIONI) {
        const fila = [casellaDi(r, c)]
        let rr = r + dr
        let cc = c + dc
        while (rr >= 0 && rr < RIGHE && cc >= 0 && cc < COLONNE && p.caselle[casellaDi(rr, cc)] === d) {
          fila.push(casellaDi(rr, cc))
          rr += dr
          cc += dc
        }
        if (fila.length >= 4) {
          disco = d
          for (const k of fila) vincenti.add(k)
        }
      }
    }
  }
  return disco === null ? null : { disco, caselle: [...vincenti].sort((a, b) => a - b) }
}

export type FineForza4 = 'forza4' | 'pieno'

/** A partita finita chi ha vinto (null per la patta a griglia piena); null se si gioca ancora. */
export function esito(p: PosizioneForza4): { fine: FineForza4; vincitore: Disco | null } | null {
  const fila = quattro(p)
  if (fila) return { fine: 'forza4', vincitore: fila.disco }
  if (p.caselle.every((d) => d !== null)) return { fine: 'pieno', vincitore: null }
  return null
}
