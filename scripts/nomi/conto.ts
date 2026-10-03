/**
 * Il conto della notte di Nomi, cose e città, senza database: dalle partite di
 * una giornata le istruzioni SQL che ne scrivono i punti. Lo usa
 * scripts/punteggi-nomi.ts, e i test del server lo eseguono sul loro D1 finto.
 */

import { gameDate, puzzleNumberFor } from '../../shared/daily'
import {
  MARGINE_NOMI_MS,
  TEMPO_NOMI_MS,
  TUTTE_LE_CATEGORIE,
  contaLaGiornata,
  type CategoriaNomi,
  type LessicoNomi,
  type PartitaDaContare,
} from '../../shared/nomi-cose'

/** Una giornata ancora da contare, come la legge lo script. */
export interface GiornataDaContare {
  puzzle_number: number
  lettera: string
  categorie: string
}

/** Una partita della giornata, come la legge lo script. */
export interface PartitaLetta {
  id: string
  risposte: string
  tempo_ms: number | null
  forme: string | null
  iniziata_at: string
  finished_at: string | null
}

/**
 * Il primo giorno che non si puo' ancora contare: quello di adesso, finché
 * non sono passati alcuni minuti dalla mezzanotte. Una partita cominciata un
 * attimo prima ha ancora il suo tempo, e il margine della rete; le giornate
 * prima di questa sono chiuse.
 */
export function primoGiornoAperto(adesso: Date): number {
  const attesa = TEMPO_NOMI_MS + MARGINE_NOMI_MS + 60_000
  return puzzleNumberFor(gameDate(new Date(adesso.getTime() - attesa)))
}

export function categorieDa(testo: string): CategoriaNomi[] {
  try {
    const valore: unknown = JSON.parse(testo)
    return Array.isArray(valore) ? valore.filter((c) => TUTTE_LE_CATEGORIE.includes(c)) : []
  } catch {
    return []
  }
}

function risposteDa(testo: string): Partial<Record<CategoriaNomi, string>> {
  try {
    const valore: unknown = JSON.parse(testo)
    if (!valore || typeof valore !== 'object' || Array.isArray(valore)) return {}
    return Object.fromEntries(Object.entries(valore).filter(([, t]) => typeof t === 'string'))
  } catch {
    return {}
  }
}

/** Le forme riconosciute alla consegna, se ci sono. */
function formeDa(testo: string | null): Partial<Record<CategoriaNomi, string | null>> | null {
  if (!testo) return null
  try {
    const valore: unknown = JSON.parse(testo)
    if (!valore || typeof valore !== 'object' || Array.isArray(valore)) return null
    return Object.fromEntries(Object.entries(valore).filter(([, f]) => f === null || typeof f === 'string'))
  } catch {
    return null
  }
}

const cita = (s: string) => `'${s.replace(/'/g, "''")}'`

/**
 * Le istruzioni che scrivono il conto di una giornata: i punti, le risposte
 * valide e i dettagli di ogni partita, poi quanti hanno giocato e le risposte
 * piu' date. La giornata per ultima: e' il segno che il conto e' fatto, quindi
 * se le istruzioni si fermano a meta' la notte dopo ricomincia. Ogni scrittura
 * e' condizionata a quel che non e' ancora scritto, e il conto e'
 * deterministico: rifarlo non cambia niente.
 *
 * Una partita rimasta aperta — chi ha chiuso l'app prima della consegna — si
 * chiude qui, con le risposte salvate e tutto il tempo.
 */
export function contoDellaGiornata(
  g: GiornataDaContare,
  partite: readonly PartitaLetta[],
  lessico: LessicoNomi,
  adesso: Date,
): { istruzioni: string[]; giocatori: number; punti: number[] } {
  const categorie = categorieDa(g.categorie)
  const daContare: PartitaDaContare[] = partite.map((p) => ({
    id: p.id,
    risposte: risposteDa(p.risposte),
    tempoMs: p.tempo_ms ?? TEMPO_NOMI_MS,
    forme: formeDa(p.forme),
  }))
  const conto = contaLaGiornata(lessico, g.lettera, categorie, daContare)
  const quando = adesso.toISOString()
  const istruzioni = conto.partite.map((c, i) => {
    const p = partite[i]
    const valide = Object.values(c.risposte).filter((r) => r?.forma).length
    const fine = new Date(Date.parse(p.iniziata_at) + TEMPO_NOMI_MS).toISOString()
    return (
      `UPDATE nomi_partite SET score = ${c.punti}, valide = ${valide}, ` +
      `dettagli = ${cita(JSON.stringify(c.risposte))}, ` +
      `status = 'done', tempo_ms = COALESCE(tempo_ms, ${TEMPO_NOMI_MS}), ` +
      `finished_at = COALESCE(finished_at, ${cita(fine)}), updated_at = ${cita(quando)} ` +
      `WHERE id = ${cita(p.id)} AND score IS NULL;`
    )
  })
  istruzioni.push(
    `UPDATE nomi_giornate SET giocatori = ${conto.giocatori}, piu_date = ${cita(JSON.stringify(conto.piuDate))} ` +
      `WHERE puzzle_number = ${g.puzzle_number} AND giocatori IS NULL;`,
  )
  return { istruzioni, giocatori: conto.giocatori, punti: conto.partite.map((c) => c.punti) }
}
