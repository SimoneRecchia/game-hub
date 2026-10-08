/**
 * Le regole del tris: tre per tre, e chi mette tre segni in fila — in
 * orizzontale, in verticale o in diagonale — vince. Con la griglia piena e
 * nessuna fila, la partita e' patta.
 *
 * Le caselle vanno da sinistra a destra e dall'alto in basso, da 0 a 8. I due
 * giocatori sono 0 e 1, come nel Forza 4: 0 e' chi comincia, e si disegna con
 * la X. Il tratto non si salva: si ricava dai segni, perché tocca a 0 quando
 * ce ne sono tanti dell'uno quanti dell'altro.
 *
 * Ogni mossa ha un tempo (`SECONDI_MOSSA_TRIS`): chi lo lascia passare perde
 * la partita. Il tris si gioca a memoria in pochi secondi, e senza il tempo
 * chi ci pensa abbastanza non sbaglia mai.
 */

export const LATO = 3
export const CASELLE = LATO * LATO

/** Chi ha messo il segno: 0 chi ha cominciato (la X), 1 l'altro (il cerchio). */
export type Segno = 0 | 1

export interface PosizioneTris {
  /** Riga per riga, dall'alto: `riga * LATO + colonna`. */
  readonly caselle: readonly (Segno | null)[]
  readonly tratto: Segno
}

/** I secondi per ogni mossa: allo scadere la partita e' persa. */
export const SECONDI_MOSSA_TRIS = 10
export const TEMPO_MOSSA_TRIS_MS = SECONDI_MOSSA_TRIS * 1_000

/** Le otto file: tre righe, tre colonne e le due diagonali. */
export const FILE: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

export function posizioneIniziale(): PosizioneTris {
  return { caselle: Array<Segno | null>(CASELLE).fill(null), tratto: 0 }
}

/** La posizione in testo, per salvarla: nove caratteri dall'alto, '.' per una casella vuota, '0' e '1' per i segni. */
export function scrivi(p: PosizioneTris): string {
  return p.caselle.map((s) => (s === null ? '.' : String(s))).join('')
}

/**
 * Il testo di una posizione, o null se non puo' esistere: segni che non si
 * alternano, o una mossa giocata dopo la fine della partita.
 */
export function leggi(testo: string): PosizioneTris | null {
  if (typeof testo !== 'string' || testo.length !== CASELLE || !/^[.01]+$/.test(testo)) return null
  const caselle = [...testo].map((ch) => (ch === '.' ? null : (Number(ch) as Segno)))
  const zeri = caselle.filter((s) => s === 0).length
  const uni = caselle.filter((s) => s === 1).length
  if (zeri !== uni && zeri !== uni + 1) return null
  const p: PosizioneTris = { caselle, tratto: zeri === uni ? 0 : 1 }
  // Una fila sola, di chi ha appena mosso: chi ha fatto tris non ha lasciato muovere l'altro.
  const fila = tris(p)
  if (fila && fila.segno === p.tratto) return null
  if (fila && FILE.some((f) => f.every((k) => caselle[k] === (fila.segno === 0 ? 1 : 0)))) return null
  return p
}

/** Le caselle libere, in ordine. Nessuna, a partita finita. */
export function caselleLibere(p: PosizioneTris): number[] {
  if (esito(p)) return []
  const libere: number[] = []
  for (let k = 0; k < CASELLE; k += 1) if (p.caselle[k] === null) libere.push(k)
  return libere
}

/** La posizione dopo il segno nella casella, o null se la casella e' presa o la partita e' finita. */
export function gioca(p: PosizioneTris, casella: number): PosizioneTris | null {
  if (!Number.isInteger(casella) || casella < 0 || casella >= CASELLE) return null
  if (p.caselle[casella] !== null || esito(p)) return null
  const caselle = [...p.caselle]
  caselle[casella] = p.tratto
  return { caselle, tratto: p.tratto === 0 ? 1 : 0 }
}

/** La posizione dopo una serie di mosse dall'inizio, o null se una non vale. */
export function rigioca(mosse: readonly number[]): PosizioneTris | null {
  let p: PosizioneTris | null = posizioneIniziale()
  for (const m of mosse) {
    p = gioca(p, m)
    if (!p) return null
  }
  return p
}

/** La fila fatta, se c'e': di chi e', e le sue caselle (anche due file insieme, con l'ultimo segno). */
export function tris(p: PosizioneTris): { segno: Segno; caselle: number[] } | null {
  const vincenti = new Set<number>()
  let segno: Segno | null = null
  for (const fila of FILE) {
    const s = p.caselle[fila[0]]
    if (s === null || p.caselle[fila[1]] !== s || p.caselle[fila[2]] !== s) continue
    segno = s
    for (const k of fila) vincenti.add(k)
  }
  return segno === null ? null : { segno, caselle: [...vincenti].sort((a, b) => a - b) }
}

export type FineTris = 'tris' | 'pieno'

/** A partita finita chi ha vinto (null per la patta a griglia piena); null se si gioca ancora. */
export function esito(p: PosizioneTris): { fine: FineTris; vincitore: Segno | null } | null {
  const fila = tris(p)
  if (fila) return { fine: 'tris', vincitore: fila.segno }
  if (p.caselle.every((s) => s !== null)) return { fine: 'pieno', vincitore: null }
  return null
}

/** Le caselle dove chi ha il tratto fa tris subito. */
export function vincentiSubito(p: PosizioneTris, chi: Segno = p.tratto): number[] {
  const vincenti: number[] = []
  for (const [a, b, c] of FILE) {
    const fila = [a, b, c]
    const suoi = fila.filter((k) => p.caselle[k] === chi).length
    const vuote = fila.filter((k) => p.caselle[k] === null)
    if (suoi === 2 && vuote.length === 1 && !vincenti.includes(vuote[0])) vincenti.push(vuote[0])
  }
  return vincenti.sort((x, y) => x - y)
}
