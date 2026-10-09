/**
 * Il saldo della Fortuna: i punti delle classificate di oggi, piu' quel che
 * Crazy Time, la slot, il blackjack, la roulette e il SuperEnalotto hanno dato
 * o tolto oggi. E'
 * uno solo per tutti: quel che si vince alla slot si puo' puntare al blackjack.
 *
 * Ogni gioco lo controlla dentro la sua scrittura — l'`INSERT` del giro o della
 * puntata, con `nettoFortunaSql` — sulle righe gia' scritte di tutti, così
 * due puntate partite insieme, anche a due giochi diversi, non vanno oltre quel
 * che c'e'. Ogni gioco riscrive il suo conto della giornata nello stesso batch
 * della giocata (`ruota_giornate` per Crazy Time, `fortuna_giornate` per gli
 * altri), quindi i conti sono sempre quelli delle giocate.
 *
 * Le domande della slot sono quelle di Crazy Time: le stesse trenta domande
 * per categoria (`ruota_domande`), di tutte le quattordici categorie alla
 * ruota del quiz e delle sei del giorno alla slot, e chi ne ha avuta una a un
 * gioco non la rivede all'altro.
 */

import { MARGINE_RETE_MS } from '../../shared/quiz'
import type { DomandaCompleta } from '../../shared/quiz-domande'
import { improntaDomanda, type DomandaRuota } from '../../shared/ruota'
import type { GiocoFortuna } from '../../shared/types'
import { puntiClassificateDi } from './generale'
import { fail } from './http'
import { limiteMs } from './quizStore'

export interface SaldoFortuna {
  classificate: number
  /** Quel che ogni gioco ha dato o tolto oggi. */
  netti: Record<GiocoFortuna, number>
  /** Quante giocate oggi: i giri della ruota, della slot e della roulette, le mani del blackjack, le schede. */
  giocate: Record<GiocoFortuna, number>
  /** Le classificate piu' i netti: quel che si puo' puntare. Mai sotto zero. */
  saldo: number
}

/**
 * Quel che i giochi della Fortuna hanno dato o tolto in una giornata, in SQL:
 * per il controllo del saldo dentro un `INSERT`. `giocatore` e `giorno` sono i
 * segnaposti dell'istruzione che lo usa ("?1", "?2").
 */
export function nettoFortunaSql(giocatore: string, giorno: string): string {
  return `(COALESCE((SELECT netto FROM ruota_giornate
                      WHERE player_id = ${giocatore} AND puzzle_number = ${giorno}), 0)
         + COALESCE((SELECT SUM(netto) FROM fortuna_giornate
                      WHERE player_id = ${giocatore} AND puzzle_number = ${giorno}), 0))`
}

/** Il saldo di un giocatore in una giornata, con il conto di ogni gioco. */
export async function saldoDi(db: D1Database, playerId: string, numero: number): Promise<SaldoFortuna> {
  const [classificate, { results }] = await Promise.all([
    puntiClassificateDi(db, playerId, numero),
    db
      .prepare(
        `SELECT 'ruota' AS gioco, netto, giri AS giocate FROM ruota_giornate
          WHERE player_id = ?1 AND puzzle_number = ?2
         UNION ALL
         SELECT gioco, netto, giocate FROM fortuna_giornate
          WHERE player_id = ?1 AND puzzle_number = ?2`,
      )
      .bind(playerId, numero)
      .all<{ gioco: GiocoFortuna; netto: number; giocate: number }>(),
  ])
  const netti: Record<GiocoFortuna, number> = { ruota: 0, slot: 0, blackjack: 0, roulette: 0, superenalotto: 0 }
  const giocate: Record<GiocoFortuna, number> = { ruota: 0, slot: 0, blackjack: 0, roulette: 0, superenalotto: 0 }
  for (const r of results) {
    netti[r.gioco] += r.netto
    giocate[r.gioco] += r.giocate
  }
  const totale = Object.values(netti).reduce((s, n) => s + n, 0)
  return { classificate, netti, giocate, saldo: Math.max(0, classificate + totale) }
}

/** Le domande che un giocatore ha gia' avuto oggi, alla ruota o alla slot, come "categoria:impronta". */
export async function domandeViste(db: D1Database, playerId: string, numero: number): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT domanda FROM ruota_giocate
        WHERE player_id = ?1 AND puzzle_number = ?2 AND domanda IS NOT NULL
       UNION ALL
       SELECT domanda FROM slot_giri
        WHERE player_id = ?1 AND puzzle_number = ?2 AND domanda IS NOT NULL`,
    )
    .bind(playerId, numero)
    .all<{ domanda: string }>()
  return results.map((r) => r.domanda)
}

/**
 * Le categorie che oggi hanno domande che il giocatore non ha ancora avuto: una
 * categoria senza domande, o con tutte gia' viste, non va sulla ruota del quiz,
 * e alla slot i punti di domanda non la pescano. La colonna di `ruota_domande`
 * si chiama ancora `materia`, da quando le domande erano per materia, e porta
 * la categoria.
 */
export async function categorieDisponibili(db: D1Database, playerId: string, numero: number): Promise<Set<string>> {
  const [{ results }, viste] = await Promise.all([
    db
      .prepare('SELECT materia, json_array_length(domande) AS quante FROM ruota_domande WHERE puzzle_number = ?')
      .bind(numero)
      .all<{ materia: string; quante: number }>(),
    domandeViste(db, playerId, numero),
  ])
  const usate = new Map<string, number>()
  for (const v of viste) {
    const categoria = v.slice(0, v.indexOf(':'))
    usate.set(categoria, (usate.get(categoria) ?? 0) + 1)
  }
  return new Set(results.filter((r) => r.quante > (usate.get(r.materia) ?? 0)).map((r) => r.materia))
}

/**
 * Una domanda di una categoria di oggi che il giocatore non ha ancora avuto, a
 * caso, con la chiave da salvare nel giro. Finite quelle nuove — due giri
 * partiti insieme — se ne ripete una piuttosto che lasciare la sfida aperta.
 */
export async function domandaNuova(
  db: D1Database,
  playerId: string,
  numero: number,
  categoria: string,
  caso: (n: number) => number,
): Promise<{ domanda: DomandaCompleta; chiave: string }> {
  const [voce, viste] = await Promise.all([
    db
      .prepare('SELECT domande FROM ruota_domande WHERE puzzle_number = ? AND materia = ?')
      .bind(numero, categoria)
      .first<{ domande: string }>(),
    domandeViste(db, playerId, numero),
  ])
  const domande = voce ? (JSON.parse(voce.domande) as DomandaRuota[]) : []
  if (domande.length === 0) fail(503, 'DOMANDE_ASSENTI', 'Le domande di oggi non sono ancora pronte.')
  const giaViste = new Set(viste)
  const chiave = (d: DomandaRuota) => `${categoria}:${improntaDomanda(d.domanda)}`
  const nuove = domande.filter((d) => !giaViste.has(chiave(d)))
  const fra = nuove.length > 0 ? nuove : domande
  const scelta = fra[caso(fra.length)]
  return { domanda: scelta.domanda, chiave: chiave(scelta) }
}

/** Una domanda aperta e' scaduta quando e' passato il suo tempo, piu' il margine della rete. */
export function domandaScaduta(apertaAt: string | null, d: DomandaCompleta, adesso: number): boolean {
  return apertaAt !== null && adesso > Date.parse(apertaAt) + limiteMs(d) + MARGINE_RETE_MS
}
