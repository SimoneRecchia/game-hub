/**
 * Il Wordle libero: quante parole si vuole, a caso, senza punti in classifica.
 *
 * La parola la sceglie il server e resta sul server finché la partita non
 * finisce, come nella classificata: e' la stessa regola, e la stessa ragione —
 * una partita libera con la soluzione nel browser sarebbe un indovinello
 * truccato.
 *
 * La scelta ha due vincoli:
 *
 *  - **non svelare le parole del giorno.** Una parola libera che domani fosse la
 *    parola del giorno sarebbe un regalo a chi ha giocato oggi. Le parole dei
 *    prossimi sessanta giorni restano fuori;
 *  - **non ripetersi.** Le parole delle ultime trecento partite libere del
 *    giocatore restano fuori anche loro, finché ne restano altre.
 */

import { MAX_ATTEMPTS, WORD_LENGTH } from '../../shared/config'
import { solutionIndexFor } from '../../shared/daily'
import type {
  StatisticheWordleLibero,
  WordleLiberaState,
  WordleStatus,
} from '../../shared/types'
import { evaluateAll } from '../../shared/wordle'
import { SOLUTION_WORDS } from '../../shared/words/solutions'
import { newId, nowIso } from './http'

/** Quanti giorni di parole del giorno tenere fuori dalle partite libere. */
export const GIORNI_PROTETTI = 60
/** Quante partite libere del giocatore guardare per non ripetere una parola. */
const MEMORIA = 300

export interface LiberaRow {
  id: string
  player_id: string
  answer: string
  status: WordleStatus
  attempts: number
  guesses: string
  created_at: string
  finished_at: string | null
}

/** Le parole che una partita libera non puo' pescare, da oggi in avanti. */
export function paroleProtette(puzzleDiOggi: number): Set<string> {
  const protette = new Set<string>()
  for (let n = puzzleDiOggi; n < puzzleDiOggi + GIORNI_PROTETTI; n += 1) {
    protette.add(SOLUTION_WORDS[solutionIndexFor(n, SOLUTION_WORDS.length)])
  }
  return protette
}

/**
 * Una parola per una partita libera, fra quelle ammesse.
 *
 * `caso` restituisce un numero in [0, 1): nel Worker e' crypto, nei test un
 * generatore fisso. Se le esclusioni lasciassero l'elenco vuoto — non con 1.132
 * parole, ma meglio saperlo scritto — si ricade sulle sole parole protette.
 */
export function scegliParola(
  protette: ReadonlySet<string>,
  recenti: ReadonlySet<string>,
  caso: () => number,
): string {
  const libere = SOLUTION_WORDS.filter((p) => !protette.has(p) && !recenti.has(p))
  const elenco = libere.length > 0 ? libere : SOLUTION_WORDS.filter((p) => !protette.has(p))
  return elenco[Math.floor(caso() * elenco.length)]
}

export function casoCrittografico(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
}

export function paroleDi(row: LiberaRow): string[] {
  try {
    const valore = JSON.parse(row.guesses) as unknown
    return Array.isArray(valore)
      ? valore.filter((w): w is string => typeof w === 'string' && w.length === WORD_LENGTH)
      : []
  } catch {
    return []
  }
}

export function statoLibero(row: LiberaRow): WordleLiberaState {
  return {
    id: row.id,
    wordLength: WORD_LENGTH,
    maxAttempts: MAX_ATTEMPTS,
    guesses: evaluateAll(paroleDi(row), row.answer),
    status: row.status,
    answer: row.status === 'playing' ? null : row.answer,
  }
}

/** La partita libera ancora aperta, se c'e'. */
export async function liberaAperta(db: D1Database, playerId: string): Promise<LiberaRow | null> {
  return db
    .prepare(
      `SELECT * FROM wordle_libere WHERE player_id = ? AND status = 'playing'
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(playerId)
    .first<LiberaRow>()
}

export async function liberaPerId(db: D1Database, id: string, playerId: string): Promise<LiberaRow | null> {
  return db
    .prepare('SELECT * FROM wordle_libere WHERE id = ? AND player_id = ?')
    .bind(id, playerId)
    .first<LiberaRow>()
}

/**
 * Una partita nuova. Quella aperta, se ha gia' dei tentativi, conta come persa:
 * altrimenti basterebbe cambiare parola a ogni partita difficile per non
 * perderne mai una. Una partita aperta e mai toccata invece si riusa.
 */
export async function nuovaLibera(
  db: D1Database,
  playerId: string,
  puzzleDiOggi: number,
  caso: () => number = casoCrittografico,
): Promise<LiberaRow> {
  const aperta = await liberaAperta(db, playerId)
  if (aperta && aperta.attempts === 0) return aperta
  if (aperta) {
    await db
      .prepare(`UPDATE wordle_libere SET status = 'lost', finished_at = ? WHERE id = ? AND status = 'playing'`)
      .bind(nowIso(), aperta.id)
      .run()
  }

  const { results } = await db
    .prepare('SELECT answer FROM wordle_libere WHERE player_id = ? ORDER BY created_at DESC LIMIT ?')
    .bind(playerId, MEMORIA)
    .all<{ answer: string }>()
  const parola = scegliParola(paroleProtette(puzzleDiOggi), new Set(results.map((r) => r.answer)), caso)

  const row: LiberaRow = {
    id: newId('wlib'),
    player_id: playerId,
    answer: parola,
    status: 'playing',
    attempts: 0,
    guesses: '[]',
    created_at: nowIso(),
    finished_at: null,
  }
  await db
    .prepare(
      `INSERT INTO wordle_libere (id, player_id, answer, status, attempts, guesses, created_at)
       VALUES (?, ?, ?, 'playing', 0, '[]', ?)`,
    )
    .bind(row.id, row.player_id, row.answer, row.created_at)
    .run()
  return row
}

/**
 * Le statistiche delle partite libere: giocate, vinte, la serie di vittorie in
 * corso e la distribuzione dei tentativi. Sono le stesse della classificata,
 * contate a parte: le due cose non si mescolano.
 */
export async function statisticheLibere(db: D1Database, playerId: string): Promise<StatisticheWordleLibero> {
  const { results } = await db
    .prepare(
      `SELECT status, attempts FROM wordle_libere
        WHERE player_id = ? AND status != 'playing'
        ORDER BY created_at DESC LIMIT 2000`,
    )
    .bind(playerId)
    .all<{ status: WordleStatus; attempts: number }>()

  const distribuzione = new Array(MAX_ATTEMPTS).fill(0) as number[]
  let vinte = 0
  for (const r of results) {
    if (r.status === 'won') {
      vinte += 1
      distribuzione[Math.min(Math.max(r.attempts, 1), MAX_ATTEMPTS) - 1] += 1
    }
  }
  let serie = 0
  for (const r of results) {
    if (r.status !== 'won') break
    serie += 1
  }
  return { giocate: results.length, vinte, serie, distribuzione }
}
