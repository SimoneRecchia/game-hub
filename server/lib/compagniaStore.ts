/**
 * La compagnia del cruciverba e dello Scarabeo: la stanza del Wordle
 * (`coopStore.ts`) per i giochi venuti dopo.
 *
 * Le regole sono le sue. La giornata di un giocatore e' una sola: la propria
 * partita, o quella di chi lo ha invitato. Chi accetta prima di aver finito la
 * propria la lega a quella dell'host (`in_compagnia`), che chiude la sua — e'
 * lo stesso schema, la stessa sacca di tessere, e guardando la vedrebbe fatta —
 * e ne prende lo **stesso punteggio** (`assist_score`). Chi l'aveva gia' finita
 * guarda e suggerisce, e i suoi punti restano i suoi.
 *
 * Tre cose chiudono i buchi della stanza del Wordle: si entra solo in una
 * partita ancora in corso (un host che ha finito non pagherebbe piu' nessuno),
 * un host non puo' giocare in compagnia di qualcun altro, e chi e' dentro non
 * si manda via, perché la sua giornata e' ormai quella.
 */

import { MAX_COOP_GUESTS, PRESENZA_ONLINE_MS } from '../../shared/config'
import type {
  CompagniaBreve,
  CompagniaHost,
  GiocatoreBreve,
  GiocoInCompagnia,
  GiocoLiberoInCompagnia,
  InvitabileCompagnia,
  InvitoCompagnia,
  ModalitaCompagnia,
  OspiteCompagnia,
  PropostaCompagnia,
  StatoOspite,
  SuggerimentoCompagnia,
} from '../../shared/types'
import { fail, newId, nowIso } from './http'

export const GIOCHI_IN_COMPAGNIA: readonly GiocoInCompagnia[] = ['cruciverba', 'scarabeo']
export const GIOCHI_LIBERI_IN_COMPAGNIA: readonly GiocoLiberoInCompagnia[] = ['wordle', 'cruciverba', 'scarabeo']

/**
 * Quanto vale un invito a una libera: si gioca adesso, e un invito di stamattina
 * a guardare una partita di allora non vuol dire piu' niente.
 */
const INVITO_LIBERO_MS = 2 * 60 * 60 * 1000

/** Quanti suggerimenti si mostrano: bastano gli ultimi. */
const SUGGERIMENTI_MOSTRATI = 30

/** Le partite del giorno di ogni gioco. Vengono da un tipo chiuso: interpolarle nelle query e' sicuro. */
const TABELLA: Record<GiocoInCompagnia, 'cruciverba_games' | 'scarabeo_games'> = {
  cruciverba: 'cruciverba_games',
  scarabeo: 'scarabeo_games',
}

/**
 * Quando una partita e' cominciata: una lettera scritta, un aiuto chiesto, una
 * mossa. Aprirla soltanto non conta, perché la schermata la crea al primo
 * accesso.
 */
const COMINCIATA: Record<GiocoInCompagnia, string> = {
  cruciverba: "(TRIM(REPLACE(lettere, '#', '')) != '' OR svelate != '[]' OR errori > 0)",
  scarabeo: '(turns > 0)',
}

export function leggiGioco(valore: string | undefined): GiocoInCompagnia {
  if (!GIOCHI_IN_COMPAGNIA.includes(valore as GiocoInCompagnia)) {
    fail(404, 'GIOCO_SCONOSCIUTO', 'Questo gioco non si gioca in compagnia.')
  }
  return valore as GiocoInCompagnia
}

export function leggiGiocoLibero(valore: string | undefined): GiocoLiberoInCompagnia {
  if (!GIOCHI_LIBERI_IN_COMPAGNIA.includes(valore as GiocoLiberoInCompagnia)) {
    fail(404, 'GIOCO_SCONOSCIUTO', 'Questo gioco non si gioca in compagnia.')
  }
  return valore as GiocoLiberoInCompagnia
}

export interface CompagniaRow {
  id: string
  gioco: GiocoLiberoInCompagnia
  modalita: ModalitaCompagnia
  host_id: string
  /** La giornata, nella classificata; null nelle libere. */
  puzzle_number: number | null
  /** La partita dell'host: quella del giorno, o la libera che sta giocando. */
  partita_id: string | null
  /** Lo Scarabeo libero dell'host, che sta nel suo telefono: le mosse, in JSON. */
  stato: string | null
  versione: number
  created_at: string
  updated_at: string | null
  chiusa_at: string | null
}

/** Una compagnia della classificata: ha sempre la sua giornata, e un gioco che si gioca in compagnia. */
export type CompagniaDelGiorno = CompagniaRow & {
  gioco: GiocoInCompagnia
  modalita: 'classificata'
  puzzle_number: number
}

const dellaClassificata = (gioco: GiocoLiberoInCompagnia): gioco is GiocoInCompagnia =>
  GIOCHI_IN_COMPAGNIA.includes(gioco as GiocoInCompagnia)

export function delGiorno(c: CompagniaRow): c is CompagniaDelGiorno {
  return c.modalita === 'classificata' && c.puzzle_number !== null && dellaClassificata(c.gioco)
}

/** La giornata di un giocatore in un gioco: quel che serve a sapere se puo' giocare in compagnia. */
export interface Giornata {
  id: string
  status: 'playing' | 'done'
  in_compagnia: string | null
  assist_score: number | null
  cominciata: boolean
}

export async function giornataDi(
  db: D1Database,
  gioco: GiocoInCompagnia,
  playerId: string,
  numero: number,
): Promise<Giornata | null> {
  const riga = await db
    .prepare(
      `SELECT id, status, in_compagnia, assist_score, ${COMINCIATA[gioco]} AS cominciata
         FROM ${TABELLA[gioco]} WHERE player_id = ? AND puzzle_number = ?`,
    )
    .bind(playerId, numero)
    .first<Omit<Giornata, 'cominciata'> & { cominciata: number }>()
  return riga ? { ...riga, cominciata: riga.cominciata === 1 } : null
}

export async function compagniaPerId(db: D1Database, id: string): Promise<CompagniaRow | null> {
  return db.prepare('SELECT * FROM compagnie WHERE id = ?').bind(id).first<CompagniaRow>()
}

/** La compagnia dell'host per la giornata, se c'e'. Non la crea. */
export async function compagniaDelGiorno(
  db: D1Database,
  gioco: GiocoInCompagnia,
  hostId: string,
  numero: number,
): Promise<CompagniaDelGiorno | null> {
  return db
    .prepare(
      `SELECT * FROM compagnie
        WHERE gioco = ? AND modalita = 'classificata' AND host_id = ? AND puzzle_number = ?`,
    )
    .bind(gioco, hostId, numero)
    .first<CompagniaDelGiorno>()
}

/** La compagnia dell'host, creata al primo invito. */
export async function apriCompagnia(
  db: D1Database,
  gioco: GiocoInCompagnia,
  hostId: string,
  numero: number,
  partitaId: string,
): Promise<CompagniaDelGiorno> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO compagnie (id, gioco, modalita, host_id, puzzle_number, partita_id, created_at)
       VALUES (?, ?, 'classificata', ?, ?, ?, ?)`,
    )
    .bind(newId('cmp'), gioco, hostId, numero, partitaId, nowIso())
    .run()
  const riga = await compagniaDelGiorno(db, gioco, hostId, numero)
  if (!riga) throw new Error('Compagnia non trovata subito dopo la creazione')
  return riga
}

/** La compagnia delle libere dell'host per un gioco, se c'e' ed e' aperta. */
export async function compagniaLibera(
  db: D1Database,
  gioco: GiocoLiberoInCompagnia,
  hostId: string,
): Promise<CompagniaRow | null> {
  return db
    .prepare(
      `SELECT * FROM compagnie
        WHERE gioco = ? AND modalita = 'libera' AND host_id = ? AND chiusa_at IS NULL`,
    )
    .bind(gioco, hostId)
    .first<CompagniaRow>()
}

/**
 * La compagnia delle libere, creata o riaperta al primo invito: una per host
 * e gioco, che segue la partita libera che l'host sta giocando.
 */
export async function apriCompagniaLibera(
  db: D1Database,
  gioco: GiocoLiberoInCompagnia,
  hostId: string,
): Promise<CompagniaRow> {
  const adesso = nowIso()
  await db
    .prepare(
      `INSERT INTO compagnie (id, gioco, modalita, host_id, created_at, updated_at)
            VALUES (?, ?, 'libera', ?, ?, ?)
       ON CONFLICT (gioco, host_id) WHERE modalita = 'libera'
       DO UPDATE SET chiusa_at = NULL, updated_at = excluded.updated_at
                WHERE compagnie.chiusa_at IS NOT NULL`,
    )
    .bind(newId('cmp'), gioco, hostId, adesso, adesso)
    .run()
  const riga = await compagniaLibera(db, gioco, hostId)
  if (!riga) throw new Error('Compagnia libera non trovata subito dopo la creazione')
  return riga
}

/**
 * La partita che l'host sta giocando, perché chi guarda la segua: l'indirizzo
 * della libera sul server, o le mosse dello Scarabeo libero, che sta nel suo
 * telefono. Ogni scrittura alza la versione.
 *
 * Una partita nuova — un'altra libera, o uno Scarabeo con un altro seme — porta
 * via i suggerimenti della vecchia: erano per quella, e una parola provata la'
 * qui sembrerebbe ancora da provare. Il `DELETE` viene prima nel batch perché
 * confronta la partita di prima con quella nuova.
 */
export async function aggiornaLibera(
  db: D1Database,
  compagniaId: string,
  partita: { partitaId: string | null; stato: string | null },
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `DELETE FROM compagnie_suggerimenti WHERE compagnia_id = ?1 AND EXISTS (
           SELECT 1 FROM compagnie WHERE id = ?1
             AND (partita_id IS NOT ?2 OR json_extract(stato, '$.seme') IS NOT json_extract(?3, '$.seme')))`,
      )
      .bind(compagniaId, partita.partitaId, partita.stato),
    db
      .prepare(
        `UPDATE compagnie SET partita_id = ?, stato = ?, versione = versione + 1, updated_at = ?
          WHERE id = ? AND chiusa_at IS NULL`,
      )
      .bind(partita.partitaId, partita.stato, nowIso(), compagniaId),
  ])
}

/**
 * Chiude la compagnia delle libere: chi guardava smette, e con lui inviti e
 * suggerimenti. Riaprendola si ricomincia da capo.
 */
export async function chiudiCompagnia(db: D1Database, compagniaId: string): Promise<void> {
  await db.batch([
    db.prepare('UPDATE compagnie SET chiusa_at = ? WHERE id = ?').bind(nowIso(), compagniaId),
    db.prepare('DELETE FROM compagnie_ospiti WHERE compagnia_id = ?').bind(compagniaId),
    db.prepare('DELETE FROM compagnie_suggerimenti WHERE compagnia_id = ?').bind(compagniaId),
  ])
}

interface RigaGiocatore {
  id: string
  nickname: string
  display_name: string
  avatar_color: string
}

function breve(r: RigaGiocatore): GiocatoreBreve {
  return {
    playerId: r.id,
    nickname: r.nickname,
    displayName: r.display_name || r.nickname,
    avatarColor: r.avatar_color,
  }
}

export async function giocatoreBreve(db: D1Database, id: string): Promise<GiocatoreBreve> {
  const r = await db
    .prepare('SELECT id, nickname, display_name, avatar_color FROM players WHERE id = ?')
    .bind(id)
    .first<RigaGiocatore>()
  return r ? breve(r) : { playerId: id, nickname: '?', displayName: '?', avatarColor: '#8e8e93' }
}

/** La compagnia in cui gioca la giornata un invitato, per la sua schermata e la carta del giorno. */
export async function compagniaBreve(
  db: D1Database,
  compagniaId: string,
  punti: number | null,
): Promise<CompagniaBreve | null> {
  const compagnia = await compagniaPerId(db, compagniaId)
  if (!compagnia) return null
  return { id: compagnia.id, host: await giocatoreBreve(db, compagnia.host_id), punti }
}

/* ─────────────────────────────  Gli invitati  ─────────────────────────── */

export async function ospitiDi(db: D1Database, compagniaId: string): Promise<OspiteCompagnia[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.nickname, p.display_name, p.avatar_color, o.stato,
              (SELECT COUNT(*) FROM compagnie_suggerimenti s
                WHERE s.compagnia_id = o.compagnia_id AND s.guest_id = o.guest_id) AS suggerimenti
         FROM compagnie_ospiti o
         JOIN players p ON p.id = o.guest_id
        WHERE o.compagnia_id = ?
        ORDER BY o.created_at ASC`,
    )
    .bind(compagniaId)
    .all<RigaGiocatore & { stato: StatoOspite; suggerimenti: number }>()
  return results.map((r) => ({ ...breve(r), stato: r.stato, suggerimenti: r.suggerimenti }))
}

export async function statoOspite(
  db: D1Database,
  compagniaId: string,
  guestId: string,
): Promise<StatoOspite | null> {
  const r = await db
    .prepare('SELECT stato FROM compagnie_ospiti WHERE compagnia_id = ? AND guest_id = ?')
    .bind(compagniaId, guestId)
    .first<{ stato: StatoOspite }>()
  return r?.stato ?? null
}

/**
 * Un invito nuovo, o di nuovo a chi l'aveva rifiutato. Chi l'ha gia', o e'
 * gia' dentro, non ne riceve un secondo: due tocchi ravvicinati sullo stesso
 * nome non fanno due inviti.
 */
export async function invita(db: D1Database, compagniaId: string, guestId: string): Promise<boolean> {
  const esito = await db
    .prepare(
      `INSERT INTO compagnie_ospiti (compagnia_id, guest_id, stato, created_at)
            VALUES (?, ?, 'invito', ?)
       ON CONFLICT (compagnia_id, guest_id) DO UPDATE
            SET stato = 'invito', created_at = excluded.created_at, risposto_at = NULL
          WHERE compagnie_ospiti.stato = 'rifiutato'`,
    )
    .bind(compagniaId, guestId, nowIso())
    .run()
  return esito.meta.changes === 1
}

/** Quanti posti sono presi: gli inviti in attesa e chi e' dentro. */
export async function postiOccupati(db: D1Database, compagniaId: string): Promise<number> {
  const r = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM compagnie_ospiti
        WHERE compagnia_id = ? AND stato IN ('invito', 'dentro')`,
    )
    .bind(compagniaId)
    .first<{ n: number }>()
  return r?.n ?? 0
}

/** Ritira un invito non ancora accettato. Chi e' dentro resta: la sua giornata e' ormai questa. */
export async function ritira(db: D1Database, compagniaId: string, guestId: string): Promise<boolean> {
  const esito = await db
    .prepare(
      `DELETE FROM compagnie_ospiti
        WHERE compagnia_id = ? AND guest_id = ? AND stato IN ('invito', 'rifiutato')`,
    )
    .bind(compagniaId, guestId)
    .run()
  return esito.meta.changes === 1
}

export async function rispondi(
  db: D1Database,
  compagniaId: string,
  guestId: string,
  stato: 'dentro' | 'rifiutato',
): Promise<void> {
  await db
    .prepare(
      `UPDATE compagnie_ospiti SET stato = ?, risposto_at = ?
        WHERE compagnia_id = ? AND guest_id = ? AND stato != 'dentro'`,
    )
    .bind(stato, nowIso(), compagniaId, guestId)
    .run()
}

/**
 * La giornata dell'invitato diventa quella dell'host.
 *
 * Condizionata, in un'istruzione sola: la sua partita non e' finita e non e'
 * gia' in un'altra compagnia, e quella dell'host e' ancora in corso e non e' a
 * sua volta in compagnia. Se l'host finisse nello stesso istante, l'invitato
 * resterebbe legato a una partita che non paga piu' nessuno; cosi' invece non
 * cambia niente, e chi chiama lo dice.
 */
export async function entraNellaGiornata(
  db: D1Database,
  compagnia: CompagniaDelGiorno,
  guestId: string,
): Promise<boolean> {
  const t = TABELLA[compagnia.gioco]
  const esito = await db
    .prepare(
      `UPDATE ${t} SET in_compagnia = ?1
        WHERE player_id = ?2 AND puzzle_number = ?3 AND status = 'playing'
          AND (in_compagnia IS NULL OR in_compagnia = ?1)
          AND EXISTS (SELECT 1 FROM ${t} h
                       WHERE h.player_id = ?4 AND h.puzzle_number = ?3
                         AND h.status = 'playing' AND h.in_compagnia IS NULL)`,
    )
    .bind(compagnia.id, guestId, compagnia.puzzle_number, compagnia.host_id)
    .run()
  return esito.meta.changes === 1
}

/**
 * Il punteggio dell'host passa a chi gioca la giornata con lui.
 *
 * Nel cruciverba si chiama a partita completata; nello Scarabeo a ogni mossa,
 * perché lì anche una partita in corso ha i suoi punti in classifica, e chi
 * gioca con l'host deve vedere gli stessi. Quando l'host finisce, le giornate
 * degli invitati si chiudono con la sua. Scrive un valore e non lo somma,
 * quindi due richieste ravvicinate non pagano due volte; e non tocca chi e'
 * gia' chiuso.
 */
export async function pagaOspiti(
  db: D1Database,
  gioco: GiocoInCompagnia,
  hostId: string,
  numero: number,
  punti: number,
  finita: boolean,
): Promise<number> {
  const esito = await db
    .prepare(
      `UPDATE ${TABELLA[gioco]}
          SET assist_score = ?1,
              status = CASE WHEN ?2 = 1 THEN 'done' ELSE status END,
              finished_at = CASE WHEN ?2 = 1 THEN COALESCE(finished_at, ?3) ELSE finished_at END
        WHERE puzzle_number = ?4 AND status = 'playing'
          AND in_compagnia = (SELECT id FROM compagnie
                               WHERE gioco = ?5 AND modalita = 'classificata'
                                 AND host_id = ?6 AND puzzle_number = ?4)`,
    )
    .bind(punti, finita ? 1 : 0, nowIso(), numero, gioco, hostId)
    .run()
  return esito.meta.changes
}

/* ──────────────────────────  Chi si puo' invitare  ───────────────────────── */

export async function invitabili(
  db: D1Database,
  gioco: GiocoInCompagnia,
  hostId: string,
  numero: number,
  compagniaId: string | null,
  adesso: number,
): Promise<InvitabileCompagnia[]> {
  const t = TABELLA[gioco]
  const { results } = await db
    .prepare(
      `SELECT p.id, p.nickname, p.display_name, p.avatar_color,
              EXISTS (SELECT 1 FROM ${t} g
                       WHERE g.player_id = p.id AND g.puzzle_number = ?1
                         AND g.status = 'done' AND g.in_compagnia IS NULL)            AS ha_giocato,
              (EXISTS (SELECT 1 FROM ${t} g
                        WHERE g.player_id = p.id AND g.puzzle_number = ?1
                          AND g.in_compagnia IS NOT NULL
                          AND g.in_compagnia != COALESCE(?2, ''))
               OR EXISTS (SELECT 1 FROM compagnie c
                            JOIN compagnie_ospiti o ON o.compagnia_id = c.id
                           WHERE c.gioco = ?5 AND c.modalita = 'classificata' AND c.host_id = p.id
                             AND c.puzzle_number = ?1 AND o.stato = 'dentro'))        AS occupato,
              CASE WHEN ?2 IS NULL THEN 0 ELSE EXISTS (
                SELECT 1 FROM compagnie_ospiti o
                 WHERE o.compagnia_id = ?2 AND o.guest_id = p.id
                   AND o.stato IN ('invito', 'dentro')) END                          AS invitato,
              COALESCE(pr.visto_at >= ?4, 0)                                         AS online
         FROM players p
         LEFT JOIN presenza pr ON pr.player_id = p.id
        WHERE p.id != ?3
        ORDER BY online DESC, p.last_seen_at DESC
        LIMIT 100`,
    )
    .bind(numero, compagniaId, hostId, new Date(adesso - PRESENZA_ONLINE_MS).toISOString(), gioco)
    .all<RigaGiocatore & { ha_giocato: number; occupato: number; invitato: number; online: number }>()
  return results.map((r) => ({
    ...breve(r),
    haGiocato: r.ha_giocato === 1,
    occupato: r.occupato === 1,
    invitato: r.invitato === 1,
    online: r.online === 1,
  }))
}

/**
 * Chi si puo' invitare a guardare una libera: tutti, perché non ci sono punti
 * da proteggere. Chi ha l'app aperta per primo, che e' chi risponde adesso.
 */
export async function invitabiliLiberi(
  db: D1Database,
  hostId: string,
  compagniaId: string | null,
  adesso: number,
): Promise<InvitabileCompagnia[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.nickname, p.display_name, p.avatar_color,
              CASE WHEN ?1 IS NULL THEN 0 ELSE EXISTS (
                SELECT 1 FROM compagnie_ospiti o
                 WHERE o.compagnia_id = ?1 AND o.guest_id = p.id
                   AND o.stato IN ('invito', 'dentro')) END AS invitato,
              COALESCE(pr.visto_at >= ?3, 0)                AS online
         FROM players p
         LEFT JOIN presenza pr ON pr.player_id = p.id
        WHERE p.id != ?2
        ORDER BY online DESC, p.last_seen_at DESC
        LIMIT 100`,
    )
    .bind(compagniaId, hostId, new Date(adesso - PRESENZA_ONLINE_MS).toISOString())
    .all<RigaGiocatore & { invitato: number; online: number }>()
  return results.map((r) => ({
    ...breve(r),
    haGiocato: false,
    occupato: false,
    invitato: r.invitato === 1,
    online: r.online === 1,
  }))
}

/* ──────────────────────────  Gli inviti arrivati  ───────────────────────── */

/**
 * Gli inviti da accettare o rifiutare, per il giro di controllo: quelli della
 * classificata di oggi, e quelli delle libere delle ultime ore.
 *
 * Della classificata non ci sono quelli di un gioco che si gioca gia' in
 * compagnia — accettarne un altro non darebbe un secondo punteggio — ne'
 * quelli di un host che ha gia' finito, perché non si entra in una partita
 * chiusa.
 */
export async function invitiRicevuti(
  db: D1Database,
  guestId: string,
  numero: number,
  adesso = Date.now(),
): Promise<InvitoCompagnia[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id AS compagnia_id, c.gioco, c.modalita, c.puzzle_number, c.host_id, o.created_at,
              p.id, p.nickname, p.display_name, p.avatar_color
         FROM compagnie_ospiti o
         JOIN compagnie c ON c.id = o.compagnia_id
         JOIN players p ON p.id = c.host_id
        WHERE o.guest_id = ?1 AND o.stato = 'invito' AND c.chiusa_at IS NULL
          AND ((c.modalita = 'classificata' AND c.puzzle_number = ?2)
            OR (c.modalita = 'libera' AND o.created_at >= ?3))
        ORDER BY o.created_at DESC`,
    )
    .bind(guestId, numero, new Date(adesso - INVITO_LIBERO_MS).toISOString())
    .all<
      RigaGiocatore & {
        compagnia_id: string
        gioco: GiocoLiberoInCompagnia
        modalita: ModalitaCompagnia
        puzzle_number: number | null
        host_id: string
        created_at: string
      }
    >()
  if (results.length === 0) return []

  const liberi: InvitoCompagnia[] = results
    .filter((r) => r.modalita === 'libera' && GIOCHI_LIBERI_IN_COMPAGNIA.includes(r.gioco))
    .map((r) => ({
      compagniaId: r.compagnia_id,
      gioco: r.gioco,
      modalita: 'libera',
      puzzleNumber: null,
      host: breve(r),
      createdAt: r.created_at,
      conta: false,
      cominciata: false,
    }))

  const validi = results.flatMap((r) =>
    r.modalita === 'classificata' && r.puzzle_number !== null && dellaClassificata(r.gioco)
      ? [{ ...r, gioco: r.gioco, puzzle_number: r.puzzle_number }]
      : [],
  )
  const mie = new Map<GiocoInCompagnia, Giornata | null>()
  await Promise.all(
    [...new Set(validi.map((r) => r.gioco))].map(async (g) => mie.set(g, await giornataDi(db, g, guestId, numero))),
  )
  const host = await Promise.all(validi.map((r) => giornataDi(db, r.gioco, r.host_id, numero)))

  const delGiorno = validi.flatMap((r, i): InvitoCompagnia[] => {
    const mia = mie.get(r.gioco) ?? null
    const suaInCorso = host[i]?.status === 'playing' && host[i]?.in_compagnia === null
    if (!suaInCorso || mia?.in_compagnia) return []
    const finita = mia?.status === 'done'
    return [
      {
        compagniaId: r.compagnia_id,
        gioco: r.gioco,
        modalita: 'classificata',
        puzzleNumber: r.puzzle_number,
        host: breve(r),
        createdAt: r.created_at,
        conta: !finita,
        cominciata: !finita && !!mia?.cominciata,
      },
    ]
  })
  return [...delGiorno, ...liberi]
}

/* ────────────────────────────  I suggerimenti  ─────────────────────────── */

/** Un suggerimento nuovo, o al posto di quello che l'invitato aveva dato sulla stessa chiave. */
export async function suggerisci(
  db: D1Database,
  compagniaId: string,
  guestId: string,
  chiave: string,
  proposta: PropostaCompagnia,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO compagnie_suggerimenti (id, compagnia_id, guest_id, chiave, dati, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (compagnia_id, guest_id, chiave) DO UPDATE
            SET dati = excluded.dati, created_at = excluded.created_at`,
    )
    .bind(newId('sug'), compagniaId, guestId, chiave, JSON.stringify(proposta), nowIso())
    .run()
}

/**
 * I suggerimenti di una compagnia, dal piu' recente. Se sono gia' nella
 * partita dell'host non lo dice una colonna ma la partita stessa (`usato`):
 * la parola scritta nella griglia, la posa sul tabellone. `visibile` scarta
 * quelli che non servono piu', come le pose di un turno passato.
 */
export async function suggerimentiDi(
  db: D1Database,
  compagniaId: string,
  usato: (p: PropostaCompagnia) => boolean,
  visibile: (p: PropostaCompagnia, usato: boolean) => boolean = () => true,
): Promise<SuggerimentoCompagnia[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id AS sid, s.dati, s.created_at, p.id, p.nickname, p.display_name, p.avatar_color
         FROM compagnie_suggerimenti s
         JOIN players p ON p.id = s.guest_id
        WHERE s.compagnia_id = ?
        ORDER BY s.created_at DESC
        LIMIT ?`,
    )
    .bind(compagniaId, SUGGERIMENTI_MOSTRATI)
    .all<RigaGiocatore & { sid: string; dati: string; created_at: string }>()
  return results.flatMap((r) => {
    let proposta: PropostaCompagnia
    try {
      proposta = JSON.parse(r.dati) as PropostaCompagnia
    } catch {
      return []
    }
    const fatto = usato(proposta)
    if (!visibile(proposta, fatto)) return []
    return [{ id: r.sid, da: breve(r), createdAt: r.created_at, usato: fatto, proposta }]
  })
}

/** Quel che vede l'host: chi ha invitato e che cosa gli suggeriscono. */
export async function vistaHost(
  db: D1Database,
  compagnia: CompagniaRow,
  suggerimenti: SuggerimentoCompagnia[],
): Promise<CompagniaHost> {
  return {
    id: compagnia.id,
    gioco: compagnia.gioco,
    modalita: compagnia.modalita,
    puzzleNumber: compagnia.puzzle_number,
    maxOspiti: MAX_COOP_GUESTS,
    ospiti: await ospitiDi(db, compagnia.id),
    suggerimenti,
  }
}
