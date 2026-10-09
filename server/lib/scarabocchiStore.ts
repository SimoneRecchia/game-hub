/**
 * Le stanze di Scarabocchi: chi c'e', come si gioca, e la partita.
 *
 * Come le stanze di Lupus: la partita sta intera in `scarabocchi_stanze`, con
 * le parole segrete, e si riscrive condizionata alla `versione` letta; a
 * ognuno esce solo quel che deve vedere. Non c'e' un orologio sul server: le
 * scadenze le applica la prima richiesta che arriva dopo, da chiunque venga
 * (`avanzaIndovina`, `avanzaTelefono`).
 *
 * Le cose che arrivano spesso non toccano la riga della stanza: i tratti si
 * aggiungono a pezzi in `scarabocchi_tratti`, le risposte in
 * `scarabocchi_messaggi` e i fogli del telefono senza fili in
 * `scarabocchi_fogli`. Ognuna controlla nella stessa istruzione che la stanza
 * sia ancora quella letta, o che chi scrive sia chi deve scrivere.
 *
 * Chi conta in una partita sono gli iscritti che si fanno vedere
 * (`presenti`): chi ha chiuso l'app non si aspetta, e il suo turno salta.
 */

import { PRESENZA_ONLINE_MS } from '../../shared/config'
import { semeACaso } from '../../shared/lupus-caso'
import {
  ALFABETO_CODICE_SCARABOCCHI,
  ErroreScarabocchi,
  GIOCATORI_MASSIMI_SCARABOCCHI,
  GIOCATORI_MINIMI_SCARABOCCHI,
  IMPOSTAZIONI_SCARABOCCHI,
  LIVELLI_PAROLA,
  LUNGHEZZA_CODICE_SCARABOCCHI,
  MARGINE_SCARABOCCHI_MS,
  PEZZI_MASSIMI,
  SCARABOCCHI_INVITO_MS,
  SCARABOCCHI_STANZA_FERMA_MS,
  TENTATIVO_MASSIMO,
  TESTO_MASSIMO,
  avanzaIndovina,
  avanzaTelefono,
  catenaDi,
  codiceScarabocchiValido,
  esitoTentativo,
  foglioDellaCatena,
  foglioDelTurno,
  frazioneDelTurno,
  impostazioniScarabocchiValide,
  indizio,
  nuovaPartitaIndovina,
  nuovaPartitaTelefono,
  pezzoValido,
  puntiIndovino,
  scegliParola,
  testoPulito,
  tipoDelPasso,
  turniDi,
  type AlbumScarabocchi,
  type ImpostazioniScarabocchi,
  type InvitoScarabocchi,
  type IscrittoStanzaScarabocchi,
  type MessaggioScarabocchi,
  type PartitaIndovina,
  type PartitaScarabocchi,
  type PartitaTelefono,
  type StanzaScarabocchiBreve,
  type StatoStanzaScarabocchi,
  type TrattiNuovi,
  type VistaIndovina,
  type VistaStanzaScarabocchi,
  type VistaTelefono,
} from '../../shared/scarabocchi'
import { PAROLE_SCARABOCCHI } from '../../shared/scarabocchi-parole'
import type { GiocatoreBreve, InvitoConLink } from '../../shared/types'
import { fail, newId } from './http'

interface StanzaRow {
  id: string
  codice: string
  conduttore: string
  stato: StatoStanzaScarabocchi
  impostazioni: string
  partita: string | null
  numero: number
  versione: number
  created_at: string
  updated_at: string
}

interface IscrittoRow {
  player_id: string
  entrato_at: string
  nickname: string
  display_name: string
  avatar_color: string
  visto_at: string | null
}

interface MessaggioRow {
  id: number
  player_id: string
  testo: string
  esito: 'giusta' | 'vicina' | 'no'
  punti: number
  at: string
}

interface FoglioRow {
  catena: number
  passo: number
  autore: string
  testo: string | null
  consegnato: number
}

/** Una stanza letta: la riga, e quel che c'e' dentro gia' aperto. */
interface Letta {
  row: StanzaRow
  impostazioni: ImpostazioniScarabocchi
  partita: PartitaScarabocchi | null
  iscritti: IscrittoRow[]
}

/** Quel che il telefono chiede insieme alla stanza: i tratti nuovi del foglio che guarda, le risposte nuove. */
export interface RichiestaVista {
  foglio?: string
  da?: number
  dopo?: number
}

const iso = (ms: number) => new Date(ms).toISOString()

function breve(r: Pick<IscrittoRow, 'player_id' | 'nickname' | 'display_name' | 'avatar_color'>): GiocatoreBreve {
  return {
    playerId: r.player_id,
    nickname: r.nickname,
    displayName: r.display_name || r.nickname,
    avatarColor: r.avatar_color,
  }
}

function impostazioniDi(testo: string): ImpostazioniScarabocchi {
  try {
    return impostazioniScarabocchiValide(JSON.parse(testo), IMPOSTAZIONI_SCARABOCCHI)
  } catch {
    return IMPOSTAZIONI_SCARABOCCHI
  }
}

const SELEZIONE_ISCRITTI = `SELECT i.player_id, i.entrato_at, p.nickname, p.display_name, p.avatar_color, pr.visto_at
     FROM scarabocchi_iscritti i
     JOIN players p ON p.id = i.player_id
     LEFT JOIN presenza pr ON pr.player_id = i.player_id
    WHERE i.stanza_id = ?
    ORDER BY i.entrato_at, i.player_id`

async function leggi(db: D1Database, codice: string): Promise<Letta | null> {
  const row = await db.prepare('SELECT * FROM scarabocchi_stanze WHERE codice = ?').bind(codice).first<StanzaRow>()
  if (!row) return null
  const { results } = await db.prepare(SELEZIONE_ISCRITTI).bind(row.id).all<IscrittoRow>()
  return {
    row,
    impostazioni: impostazioniDi(row.impostazioni),
    partita: row.partita ? (JSON.parse(row.partita) as PartitaScarabocchi) : null,
    iscritti: results,
  }
}

async function leggiOFallisci(db: D1Database, codice: string): Promise<Letta> {
  const l = await leggi(db, codice)
  if (!l) fail(404, 'STANZA_ASSENTE', 'Questa stanza non c’è più.')
  return l
}

const dentro = (l: Letta, io: string) => l.iscritti.some((i) => i.player_id === io)

const visto = (i: IscrittoRow | undefined) => (i?.visto_at ? Date.parse(i.visto_at) : 0)

/** Chi conta nella partita: gli iscritti che si fanno vedere. Chi chiede la stanza si fa vedere per forza. */
function presentiDi(l: Letta, io: string, adesso: number): Set<string> {
  return new Set(
    l.iscritti.filter((i) => i.player_id === io || adesso - visto(i) <= PRESENZA_ONLINE_MS).map((i) => i.player_id),
  )
}

/* ───────────────────────────  Lo stato della partita  ─────────────────────────── */

interface Giuste {
  playerId: string
  punti: number
  at: number
}

async function giusteDelTurno(db: D1Database, l: Letta, p: PartitaIndovina): Promise<Giuste[]> {
  const { results } = await db
    .prepare(
      `SELECT player_id, punti, at FROM scarabocchi_messaggi
        WHERE stanza_id = ? AND numero = ? AND turno = ? AND esito = 'giusta' ORDER BY id`,
    )
    .bind(l.row.id, l.row.numero, p.turno)
    .all<{ player_id: string; punti: number; at: string }>()
  return results.map((r) => ({ playerId: r.player_id, punti: r.punti, at: Date.parse(r.at) }))
}

async function fogliDelPasso(db: D1Database, l: Letta, passi: number[]): Promise<FoglioRow[]> {
  if (passi.length === 0) return []
  const { results } = await db
    .prepare(
      `SELECT catena, passo, autore, testo, consegnato FROM scarabocchi_fogli
        WHERE stanza_id = ? AND numero = ? AND passo IN (SELECT value FROM json_each(?))`,
    )
    .bind(l.row.id, l.row.numero, JSON.stringify(passi))
    .all<FoglioRow>()
  return results
}

interface Contesto {
  presenti: Set<string>
  giuste: Giuste[]
  fogli: FoglioRow[]
}

async function contestoDi(db: D1Database, l: Letta, io: string, adesso: number): Promise<Contesto> {
  const presenti = presentiDi(l, io, adesso)
  const p = l.partita
  if (!p || l.row.stato !== 'partita') return { presenti, giuste: [], fogli: [] }
  if (p.modo === 'indovina') return { presenti, giuste: await giusteDelTurno(db, l, p), fogli: [] }
  return { presenti, giuste: [], fogli: await fogliDelPasso(db, l, p.passo > 0 ? [p.passo - 1, p.passo] : [0]) }
}

/** La partita portata ad adesso, con le scadenze passate e chi ha gia' indovinato o consegnato. */
function avanzata(p: PartitaScarabocchi, ctx: Contesto, adesso: number): PartitaScarabocchi {
  if (p.modo === 'indovina') {
    return avanzaIndovina(p, { presenti: ctx.presenti, indovinati: ctx.giuste }, adesso)
  }
  const consegnati = new Set(ctx.fogli.filter((f) => f.passo === p.passo && f.consegnato === 1).map((f) => f.autore))
  return avanzaTelefono(p, ctx.presenti, consegnati, adesso)
}

const finita = (p: PartitaScarabocchi) => (p.modo === 'indovina' ? p.fase === 'finita' : p.fase === 'album')

/* ───────────────────────────  Quel che vede ognuno  ─────────────────────────── */

function vistaIndovina(p: PartitaIndovina, io: string, ctx: Contesto, adesso: number): VistaIndovina {
  const delTurno = new Map(ctx.giuste.map((g) => [g.playerId, g.punti]))
  const inCorso = p.fase === 'disegno'
  const disegno = p.disegnatore === io
  const chiuso = p.fase === 'rivela' || p.fase === 'finita'
  return {
    modo: 'indovina',
    giocatori: p.giocatori.map((g) => ({
      id: g.id,
      nome: g.nome,
      punti: (p.punti[g.id] ?? 0) + (inCorso ? (delTurno.get(g.id) ?? 0) : 0),
      presente: ctx.presenti.has(g.id),
      fatto: inCorso && delTurno.has(g.id),
    })),
    turno: p.turno,
    turni: turniDi(p),
    giro: Math.min(p.giri, Math.floor(p.turno / p.ordine.length) + 1),
    giri: p.giri,
    disegnatore: p.disegnatore,
    fase: p.fase,
    inizio: p.inizio,
    fine: p.fine,
    scelte:
      p.fase === 'scelta' && disegno
        ? (p.mazzo[p.turno] ?? []).map((parola, i) => ({ parola, livello: LIVELLI_PAROLA[i] }))
        : null,
    // La parola la vede chi disegna, chi l'ha gia' indovinata, e tutti a turno chiuso.
    parola: inCorso
      ? disegno || delTurno.has(io)
        ? p.parola
        : null
      : chiuso
        ? (p.parola ?? p.chiusi.at(-1)?.parola ?? null)
        : null,
    livello: inCorso || chiuso ? p.livello : null,
    indizio: inCorso && p.parola ? indizio(p.parola, frazioneDelTurno(p, adesso), p.seme + p.turno) : null,
    foglio: foglioDelTurno(p.turno),
    ultimo: chiuso ? (p.chiusi.at(-1) ?? null) : null,
  }
}

function vistaTelefono(p: PartitaTelefono, io: string, ctx: Contesto): VistaTelefono {
  const consegnati = new Set(ctx.fogli.filter((f) => f.passo === p.passo && f.consegnato === 1).map((f) => f.autore))
  const catena = p.fase === 'gioco' ? catenaDi(p, io, p.passo) : null
  let compito: VistaTelefono['compito'] = null
  if (catena !== null) {
    const tipo = tipoDelPasso(p.passo)
    const mio = ctx.fogli.find((f) => f.passo === p.passo && f.catena === catena)
    const prima = ctx.fogli.find((f) => f.passo === p.passo - 1 && f.catena === catena)
    compito = {
      catena,
      passo: p.passo,
      tipo,
      spunto:
        p.passo === 0
          ? null
          : tipo === 'disegna'
            ? { tipo: 'testo', testo: prima?.testo ?? null }
            : { tipo: 'disegno', foglio: foglioDellaCatena(catena, p.passo - 1) },
      foglio: foglioDellaCatena(catena, p.passo),
      consegnato: mio?.consegnato === 1,
      bozza: mio?.testo ?? null,
    }
  }
  return {
    modo: 'telefono',
    giocatori: p.giocatori.map((g) => ({
      id: g.id,
      nome: g.nome,
      punti: 0,
      presente: ctx.presenti.has(g.id),
      fatto: consegnati.has(g.id),
    })),
    passo: p.passo,
    passi: p.passi,
    fase: p.fase,
    tipo: tipoDelPasso(p.passo),
    inizio: p.inizio,
    fine: p.fine,
    compito,
  }
}

/** Il foglio che tutti guardano: in Indovina il disegno, quello del turno, mentre si disegna e dopo. */
function foglioInVista(p: PartitaScarabocchi | null): string | null {
  if (!p || p.modo !== 'indovina') return null
  return p.fase === 'disegno' || p.fase === 'rivela' ? foglioDelTurno(p.turno) : null
}

async function trattiNuovi(db: D1Database, l: Letta, foglio: string, da: number): Promise<TrattiNuovi> {
  const { results } = await db
    .prepare(
      `SELECT n, dati FROM scarabocchi_tratti WHERE stanza_id = ? AND numero = ? AND foglio = ? AND n >= ?
        ORDER BY n LIMIT 400`,
    )
    .bind(l.row.id, l.row.numero, foglio, da)
    .all<{ n: number; dati: string }>()
  // Un buco nella fila (un pezzo che arriva dopo il successivo) ferma la lettura: lo si riprende al giro dopo.
  const pezzi: string[] = []
  for (const r of results) {
    if (r.n !== da + pezzi.length) break
    pezzi.push(r.dati)
  }
  return { foglio, da, pezzi }
}

async function messaggiNuovi(
  db: D1Database,
  l: Letta,
  p: PartitaIndovina,
  io: string,
  dopo: number,
): Promise<MessaggioScarabocchi[]> {
  const { results } = await db
    .prepare(
      `SELECT id, player_id, testo, esito, punti, at FROM scarabocchi_messaggi
        WHERE stanza_id = ? AND numero = ? AND turno = ? AND id > ? ORDER BY id LIMIT 200`,
    )
    .bind(l.row.id, l.row.numero, p.turno, dopo)
    .all<MessaggioRow>()
  const nomi = new Map(p.giocatori.map((g) => [g.id, g.nome]))
  const chiuso = p.fase !== 'disegno'
  return results.map((r) => ({
    id: r.id,
    playerId: r.player_id,
    nome: nomi.get(r.player_id) ?? '',
    // Una risposta giusta direbbe la parola: la vede chi l'ha scritta, e tutti a turno chiuso.
    testo: r.esito === 'giusta' && r.player_id !== io && !chiuso ? null : r.testo,
    // "Ci sei quasi" lo sa solo chi l'ha scritta: per gli altri e' una risposta come un'altra.
    esito: r.esito === 'vicina' && r.player_id !== io ? 'no' : r.esito,
    punti: r.punti,
  }))
}

async function vista(
  db: D1Database,
  l: Letta,
  io: string,
  ctx: Contesto,
  adesso: number,
  richiesta: RichiestaVista,
): Promise<VistaStanzaScarabocchi> {
  const iscritti: IscrittoStanzaScarabocchi[] = l.iscritti.map((i) => ({
    ...breve(i),
    conduce: i.player_id === l.row.conduttore,
    online: adesso - visto(i) <= PRESENZA_ONLINE_MS,
  }))
  const p = l.partita
  const gioca = p?.giocatori.some((g) => g.id === io) ?? false
  const inVista = gioca ? foglioInVista(p) : null
  const [tratti, messaggi] = await Promise.all([
    inVista
      ? trattiNuovi(db, l, inVista, richiesta.foglio === inVista ? Math.max(0, richiesta.da ?? 0) : 0)
      : Promise.resolve(null),
    p && p.modo === 'indovina' && gioca && l.row.stato !== 'attesa'
      ? messaggiNuovi(db, l, p, io, Math.max(0, richiesta.dopo ?? 0))
      : Promise.resolve([]),
  ])
  return {
    codice: l.row.codice,
    stato: l.row.stato,
    io,
    conduco: l.row.conduttore === io,
    iscritti,
    impostazioni: l.impostazioni,
    numero: l.row.numero,
    partita:
      p && gioca ? (p.modo === 'indovina' ? vistaIndovina(p, io, ctx, adesso) : vistaTelefono(p, io, ctx)) : null,
    tratti,
    messaggi,
    versione: l.row.versione,
    adesso,
  }
}

/* ───────────────────────────  Le scritture della stanza  ─────────────────────────── */

interface Cambio {
  stato?: StatoStanzaScarabocchi
  partita?: PartitaScarabocchi | null
  impostazioni?: ImpostazioniScarabocchi
  numero?: number
}

/** Riscrive la stanza se nessuno l'ha cambiata da quando la si e' letta. */
async function scrivi(db: D1Database, l: Letta, c: Cambio, adesso: number): Promise<boolean> {
  const partita = 'partita' in c ? (c.partita ? JSON.stringify(c.partita) : null) : l.row.partita
  const r = await db
    .prepare(
      `UPDATE scarabocchi_stanze
          SET stato = ?, partita = ?, impostazioni = ?, numero = ?, versione = versione + 1, updated_at = ?
        WHERE id = ? AND versione = ?`,
    )
    .bind(
      c.stato ?? l.row.stato,
      partita,
      c.impostazioni ? JSON.stringify(c.impostazioni) : l.row.impostazioni,
      c.numero ?? l.row.numero,
      iso(adesso),
      l.row.id,
      l.row.versione,
    )
    .run()
  return r.meta.changes === 1
}

function dopoIlCambio(l: Letta, c: Cambio, adesso: number): Letta {
  return {
    ...l,
    row: {
      ...l.row,
      stato: c.stato ?? l.row.stato,
      numero: c.numero ?? l.row.numero,
      versione: l.row.versione + 1,
      updated_at: iso(adesso),
    },
    partita: 'partita' in c ? (c.partita ?? null) : l.partita,
    impostazioni: c.impostazioni ?? l.impostazioni,
  }
}

/** Le scadenze passate, se ce ne sono: il cambio da scrivere, o null. */
function cambioDelTempo(l: Letta, ctx: Contesto, adesso: number): Cambio | null {
  if (l.row.stato !== 'partita' || !l.partita) return null
  const dopo = avanzata(l.partita, ctx, adesso)
  if (dopo === l.partita) return null
  return { partita: dopo, ...(finita(dopo) ? { stato: 'finita' as const } : {}) }
}

/**
 * Leggi, cambia e riscrivi, finché la scrittura non passa: `cambia` riceve la
 * stanza appena letta, gia' portata ad adesso, e dice che cosa scrivere, o
 * null se non c'e' niente da scrivere. Un errore delle regole diventa un 409.
 */
async function suStanza(
  db: D1Database,
  codice: string,
  io: string,
  adesso: number,
  richiesta: RichiestaVista,
  cambia: (l: Letta) => Cambio | null,
): Promise<VistaStanzaScarabocchi> {
  for (let tentativo = 0; tentativo < 4; tentativo += 1) {
    let l = await leggiOFallisci(db, codice)
    if (!dentro(l, io)) fail(403, 'NON_ISCRITTO', 'Non sei in questa stanza.')
    let ctx = await contestoDi(db, l, io, adesso)
    const tempo = cambioDelTempo(l, ctx, adesso)
    if (tempo) {
      if (!(await scrivi(db, l, tempo, adesso))) continue
      l = dopoIlCambio(l, tempo, adesso)
      ctx = await contestoDi(db, l, io, adesso)
    }
    let c: Cambio | null
    try {
      c = cambia(l)
    } catch (e) {
      if (e instanceof ErroreScarabocchi) fail(409, 'REGOLA', e.message)
      throw e
    }
    if (!c) return vista(db, l, io, ctx, adesso, richiesta)
    if (await scrivi(db, l, c, adesso)) {
      const dopo = dopoIlCambio(l, c, adesso)
      return vista(db, dopo, io, await contestoDi(db, dopo, io, adesso), adesso, richiesta)
    }
  }
  fail(409, 'CONFLITTO', 'La stanza è cambiata mentre scrivevi: riprova.')
}

/* ───────────────────────────  La stanza  ─────────────────────────── */

function nuovoCodice(): string {
  const casuali = crypto.getRandomValues(new Uint8Array(LUNGHEZZA_CODICE_SCARABOCCHI))
  return [...casuali].map((b) => ALFABETO_CODICE_SCARABOCCHI[b % ALFABETO_CODICE_SCARABOCCHI.length]).join('')
}

async function miaStanza(db: D1Database, io: string): Promise<StanzaRow | null> {
  return db
    .prepare(
      `SELECT s.* FROM scarabocchi_iscritti i JOIN scarabocchi_stanze s ON s.id = i.stanza_id WHERE i.player_id = ?`,
    )
    .bind(io)
    .first<StanzaRow>()
}

/** Esce dalla stanza in cui si e', se ci si puo': da una partita in corso no, a meno che sia ferma da tanto. */
async function lasciaLaStanzaDiPrima(db: D1Database, io: string, tranne: string | null, adesso: number) {
  const prima = await miaStanza(db, io)
  if (!prima || prima.id === tranne) return
  const ferma = adesso - Date.parse(prima.updated_at) > SCARABOCCHI_STANZA_FERMA_MS
  if (prima.stato === 'partita' && !ferma) {
    fail(409, 'IN_PARTITA', `Sei in una partita in corso, nella stanza ${prima.codice}.`)
  }
  await esci(db, io, prima, adesso)
}

/** Le righe di una stanza che se ne va, con tutto quel che c'era dentro. */
function cancellaStanze(db: D1Database, dove: string, ...parametri: unknown[]): D1PreparedStatement[] {
  const tabelle = ['tratti', 'messaggi', 'fogli', 'inviti', 'iscritti'].map((t) => `scarabocchi_${t}`)
  return tabelle
    .map((t) =>
      db.prepare(`DELETE FROM ${t} WHERE stanza_id IN (SELECT id FROM scarabocchi_stanze WHERE ${dove})`).bind(
        ...parametri,
      ),
    )
    .concat(db.prepare(`DELETE FROM scarabocchi_stanze WHERE ${dove}`).bind(...parametri))
}

/** Esce: chi conduceva lascia il posto al primo entrato dopo di lui, e l'ultimo che esce chiude la stanza. */
async function esci(db: D1Database, io: string, stanza: StanzaRow, adesso: number): Promise<void> {
  const quando = iso(adesso)
  const vuota = `id = ? AND NOT EXISTS (SELECT 1 FROM scarabocchi_iscritti WHERE stanza_id = ?)`
  await db.batch([
    db.prepare('DELETE FROM scarabocchi_iscritti WHERE player_id = ? AND stanza_id = ?').bind(io, stanza.id),
    db
      .prepare(
        `UPDATE scarabocchi_stanze
            SET conduttore = COALESCE(
                  (SELECT player_id FROM scarabocchi_iscritti WHERE stanza_id = scarabocchi_stanze.id
                    ORDER BY entrato_at, player_id LIMIT 1),
                  conduttore),
                versione = versione + 1, updated_at = ?
          WHERE id = ?`,
      )
      .bind(quando, stanza.id),
    ...cancellaStanze(db, vuota, stanza.id, stanza.id),
  ])
}

/** Una stanza nuova, con chi la apre dentro e a condurre. Le stanze ferme da tanto se ne vanno. */
export async function creaStanza(db: D1Database, io: string, adesso: number): Promise<VistaStanzaScarabocchi> {
  await lasciaLaStanzaDiPrima(db, io, null, adesso)
  const quando = iso(adesso)
  await db.batch(cancellaStanze(db, 'updated_at < ?', iso(adesso - SCARABOCCHI_STANZA_FERMA_MS)))
  for (let tentativo = 0; tentativo < 6; tentativo += 1) {
    const id = newId('sc')
    const codice = nuovoCodice()
    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO scarabocchi_stanze
               (id, codice, conduttore, stato, impostazioni, partita, numero, versione, created_at, updated_at)
             VALUES (?, ?, ?, 'attesa', ?, NULL, 0, 1, ?, ?)`,
          )
          .bind(id, codice, io, JSON.stringify(IMPOSTAZIONI_SCARABOCCHI), quando, quando),
        db
          .prepare('INSERT INTO scarabocchi_iscritti (player_id, stanza_id, entrato_at) VALUES (?, ?, ?)')
          .bind(io, id, quando),
      ])
    } catch (e) {
      // Un codice gia' preso: se ne pesca un altro.
      if (/UNIQUE/i.test(String(e)) && tentativo < 5) continue
      throw e
    }
    return vistaStanza(db, io, codice, adesso, {})
  }
  fail(503, 'CODICI_FINITI', 'Non trovo un codice libero: riprova.')
}

/** La stanza come la vedo io, portata ad adesso, con i tratti e le risposte nuove. */
export async function vistaStanza(
  db: D1Database,
  io: string,
  codice: string,
  adesso: number,
  richiesta: RichiestaVista,
) {
  return suStanza(db, codice, io, adesso, richiesta, () => null)
}

/** Quel che si sa di una stanza prima di entrarci: chi la conduce, quanti sono e a che cosa si gioca. */
export async function infoStanza(db: D1Database, codice: string) {
  const l = await leggiOFallisci(db, codice)
  const c = l.iscritti.find((i) => i.player_id === l.row.conduttore) ?? l.iscritti[0]
  return {
    codice: l.row.codice,
    stato: l.row.stato,
    iscritti: l.iscritti.length,
    modo: l.impostazioni.modo,
    conduttore: breve(c),
  }
}

/** Una stanza vista da chi apre il suo link senza un account: chi la conduce, e se si entra ancora. */
export async function invitoScarabocchiConLink(db: D1Database, codice: string): Promise<InvitoConLink | null> {
  if (!codiceScarabocchiValido(codice)) return null
  const l = await leggi(db, codice)
  if (!l || l.iscritti.length === 0) return null
  const c = l.iscritti.find((i) => i.player_id === l.row.conduttore) ?? l.iscritti[0]
  return { codice, da: breve(c), stato: l.row.stato === 'attesa' ? 'attesa' : 'usato', gioco: 'scarabocchi' }
}

/** Entrare: solo prima della partita, e finché c'e' posto. Chi c'e' gia' rientra e basta. */
export async function entraNellaStanza(db: D1Database, io: string, codice: string, adesso: number) {
  const l = await leggiOFallisci(db, codice)
  if (dentro(l, io)) return vistaStanza(db, io, codice, adesso, {})
  if (l.row.stato !== 'attesa') fail(409, 'PARTITA_INIZIATA', 'La partita in questa stanza è già cominciata.')
  await lasciaLaStanzaDiPrima(db, io, l.row.id, adesso)
  const quando = iso(adesso)
  const [entrato] = await db.batch([
    db
      .prepare(
        `INSERT INTO scarabocchi_iscritti (player_id, stanza_id, entrato_at)
         SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM scarabocchi_stanze WHERE id = ? AND stato = 'attesa')
            AND (SELECT COUNT(*) FROM scarabocchi_iscritti WHERE stanza_id = ?) < ?`,
      )
      .bind(io, l.row.id, quando, l.row.id, l.row.id, GIOCATORI_MASSIMI_SCARABOCCHI),
    db
      .prepare('UPDATE scarabocchi_stanze SET versione = versione + 1, updated_at = ? WHERE id = ?')
      .bind(quando, l.row.id),
    db
      .prepare(`UPDATE scarabocchi_inviti SET stato = 'accettato' WHERE stanza_id = ? AND a_id = ?`)
      .bind(l.row.id, io),
  ])
  if (entrato.meta.changes !== 1) {
    const ora = await leggiOFallisci(db, codice)
    if (ora.row.stato !== 'attesa') fail(409, 'PARTITA_INIZIATA', 'La partita in questa stanza è già cominciata.')
    fail(409, 'PIENA', 'La stanza è piena.')
  }
  return vistaStanza(db, io, codice, adesso, {})
}

/** Uscire dalla stanza. Da una partita in corso si puo': i tuoi turni saltano, e la partita va avanti. */
export async function esciDallaStanza(db: D1Database, io: string, codice: string, adesso: number): Promise<void> {
  const l = await leggi(db, codice)
  if (!l || !dentro(l, io)) return
  await esci(db, io, l.row, adesso)
}

function soloChiConduce(l: Letta, io: string) {
  if (l.row.conduttore !== io) fail(403, 'NON_CONDUCI', 'Lo può fare solo chi ha aperto la stanza.')
}

function soloPrima(l: Letta) {
  if (l.row.stato === 'partita') fail(409, 'PARTITA_INIZIATA', 'La partita è già cominciata.')
}

/** Come si gioca: il modo, i giri e i tempi. Solo chi conduce, e non a partita in corso. */
export async function cambiaImpostazioni(db: D1Database, io: string, codice: string, corpo: unknown, adesso: number) {
  return suStanza(db, codice, io, adesso, {}, (l) => {
    soloChiConduce(l, io)
    soloPrima(l)
    return { impostazioni: impostazioniScarabocchiValide(corpo, l.impostazioni) }
  })
}

/** Mandare via qualcuno, prima della partita. */
export async function espelli(db: D1Database, io: string, codice: string, chi: unknown, adesso: number) {
  const l = await leggiOFallisci(db, codice)
  if (!dentro(l, io)) fail(403, 'NON_ISCRITTO', 'Non sei in questa stanza.')
  soloChiConduce(l, io)
  soloPrima(l)
  if (typeof chi !== 'string' || chi === io) fail(400, 'CHI', 'Scegli chi mandare via.')
  const quando = iso(adesso)
  await db.batch([
    db
      .prepare(
        `DELETE FROM scarabocchi_iscritti WHERE player_id = ? AND stanza_id = ?
            AND EXISTS (SELECT 1 FROM scarabocchi_stanze WHERE id = ? AND stato != 'partita')`,
      )
      .bind(chi, l.row.id, l.row.id),
    db
      .prepare(`UPDATE scarabocchi_inviti SET stato = 'rifiutato' WHERE stanza_id = ? AND a_id = ?`)
      .bind(l.row.id, chi),
    db
      .prepare('UPDATE scarabocchi_stanze SET versione = versione + 1, updated_at = ? WHERE id = ?')
      .bind(quando, l.row.id),
  ])
  return vistaStanza(db, io, codice, adesso, {})
}

/** Il via: l'ordine si mescola, le parole si pescano, e i tratti della partita di prima se ne vanno. */
export async function iniziaPartita(db: D1Database, io: string, codice: string, adesso: number) {
  const vista = await suStanza(db, codice, io, adesso, {}, (l) => {
    soloChiConduce(l, io)
    soloPrima(l)
    const n = l.iscritti.length
    const { modo } = l.impostazioni
    const minimi = GIOCATORI_MINIMI_SCARABOCCHI[modo]
    if (n < minimi) fail(409, 'POCHI', `Servono almeno ${minimi} giocatori.`)
    const giocatori = l.iscritti.map((i) => ({ id: i.player_id, nome: i.display_name || i.nickname }))
    const seme = semeACaso()
    const partita =
      modo === 'indovina'
        ? nuovaPartitaIndovina(giocatori, l.impostazioni, PAROLE_SCARABOCCHI, seme, adesso)
        : nuovaPartitaTelefono(giocatori, l.impostazioni, seme, adesso)
    return { stato: 'partita', partita, numero: l.row.numero + 1 }
  })
  // La partita di prima non serve piu': i suoi tratti, le risposte e i fogli si cancellano.
  const stanza = await db
    .prepare('SELECT id FROM scarabocchi_stanze WHERE codice = ?')
    .bind(codice)
    .first<{ id: string }>()
  if (stanza) {
    await db.batch(
      ['scarabocchi_tratti', 'scarabocchi_messaggi', 'scarabocchi_fogli'].map((t) =>
        db.prepare(`DELETE FROM ${t} WHERE stanza_id = ? AND numero < ?`).bind(stanza.id, vista.numero),
      ),
    )
  }
  return vista
}

/** Un'altra partita, con chi c'e': si torna alla stanza, con le stesse impostazioni. */
export async function unAltraPartita(db: D1Database, io: string, codice: string, adesso: number) {
  return suStanza(db, codice, io, adesso, {}, (l) => {
    soloChiConduce(l, io)
    if (l.row.stato === 'partita') fail(409, 'IN_CORSO', 'La partita è ancora in corso.')
    if (l.row.stato === 'attesa') return null
    return { stato: 'attesa', partita: null }
  })
}

/* ───────────────────────────  Indovina il disegno  ─────────────────────────── */

/** Chi disegna sceglie una delle tre parole. */
export async function scegli(db: D1Database, io: string, codice: string, indice: unknown, adesso: number) {
  return suStanza(db, codice, io, adesso, {}, (l) => {
    const p = l.partita
    if (l.row.stato !== 'partita' || !p || p.modo !== 'indovina') fail(409, 'NESSUNA_PARTITA', 'Non si sta giocando.')
    if (typeof indice !== 'number' || !Number.isInteger(indice)) fail(400, 'PAROLA', 'Scegli una delle tre parole.')
    return { partita: scegliParola(p, io, indice, adesso) }
  })
}

/**
 * Una risposta di chi indovina. Si scrive con l'ora e i punti del server, e
 * solo se la stanza e' ancora quella letta: una risposta arrivata mentre il
 * turno si chiudeva rilegge, e non vale per il turno dopo.
 */
export async function tentativo(
  db: D1Database,
  io: string,
  codice: string,
  grezzo: unknown,
  adesso: number,
  richiesta: RichiestaVista,
): Promise<VistaStanzaScarabocchi> {
  const testo = testoPulito(grezzo, TENTATIVO_MASSIMO)
  if (!testo) fail(400, 'TESTO', 'Scrivi una parola.')
  for (let prova = 0; prova < 4; prova += 1) {
    // La stanza portata ad adesso: se il turno e' scaduto, la risposta non vale piu'.
    await vistaStanza(db, io, codice, adesso, {})
    const l = await leggiOFallisci(db, codice)
    const p = l.partita
    if (l.row.stato !== 'partita' || !p || p.modo !== 'indovina' || p.fase !== 'disegno' || !p.parola) {
      fail(409, 'NON_SI_INDOVINA', 'Adesso non si indovina.')
    }
    if (!p.giocatori.some((g) => g.id === io)) fail(403, 'NON_GIOCHI', 'Non giochi questa partita.')
    if (p.disegnatore === io) fail(409, 'DISEGNI_TU', 'La parola la stai disegnando tu.')
    if (adesso > p.fine + MARGINE_SCARABOCCHI_MS) fail(409, 'TEMPO_SCADUTO', 'Il tempo è finito.')
    const giuste = await giusteDelTurno(db, l, p)
    if (giuste.some((g) => g.playerId === io)) fail(409, 'GIA_INDOVINATA', 'L’hai già indovinata.')
    const esito = esitoTentativo(p.parola, testo)
    const punti = esito === 'giusta' ? puntiIndovino(frazioneDelTurno(p, adesso)) : 0
    const r = await db
      .prepare(
        `INSERT OR IGNORE INTO scarabocchi_messaggi (stanza_id, numero, turno, player_id, testo, esito, punti, at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM scarabocchi_stanze WHERE id = ? AND versione = ?)
            AND (SELECT COUNT(*) FROM scarabocchi_messaggi
                  WHERE stanza_id = ? AND numero = ? AND turno = ? AND player_id = ?) < 80`,
      )
      .bind(
        l.row.id,
        l.row.numero,
        p.turno,
        io,
        testo,
        esito,
        punti,
        iso(adesso),
        l.row.id,
        l.row.versione,
        l.row.id,
        l.row.numero,
        p.turno,
        io,
      )
      .run()
    if (r.meta.changes === 1) return vistaStanza(db, io, codice, adesso, richiesta)
  }
  fail(409, 'CONFLITTO', 'La stanza è cambiata mentre scrivevi: riprova.')
}

/* ───────────────────────────  I tratti e i fogli  ─────────────────────────── */

/** Chi puo' disegnare su un foglio adesso: chi disegna il turno, o chi ha quel foglio del telefono senza fili. */
function puoDisegnare(l: Letta, io: string, foglio: string, adesso: number): boolean {
  const p = l.partita
  if (l.row.stato !== 'partita' || !p) return false
  if (adesso > p.fine + MARGINE_SCARABOCCHI_MS) return false
  if (p.modo === 'indovina') return p.fase === 'disegno' && p.disegnatore === io && foglio === foglioDelTurno(p.turno)
  return (
    p.fase === 'gioco' &&
    tipoDelPasso(p.passo) === 'disegna' &&
    p.autori[foglio] === io &&
    foglio.endsWith(`p${p.passo}`)
  )
}

/**
 * Un pezzo di tratti. Ogni pezzo ha il suo numero nel foglio, e riscriverlo
 * non fa niente: il telefono che non ha avuto risposta lo rimanda uguale.
 */
export async function aggiungiTratti(
  db: D1Database,
  io: string,
  codice: string,
  corpo: { numero?: unknown; foglio?: unknown; n?: unknown; dati?: unknown },
  adesso: number,
): Promise<{ ok: true }> {
  const { numero, foglio, n, dati } = corpo
  if (typeof foglio !== 'string' || !/^(?:t\d{1,3}|c\d{1,2}p\d{1,2})$/.test(foglio)) {
    fail(400, 'FOGLIO', 'Foglio sconosciuto.')
  }
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n >= PEZZI_MASSIMI) {
    fail(400, 'PEZZO', 'Pezzo fuori fila.')
  }
  if (!pezzoValido(dati)) fail(400, 'TRATTI', 'Tratti non validi.')
  const l = await leggiOFallisci(db, codice)
  if (!dentro(l, io)) fail(403, 'NON_ISCRITTO', 'Non sei in questa stanza.')
  if (numero !== l.row.numero || !puoDisegnare(l, io, foglio, adesso)) {
    fail(409, 'NON_DISEGNI', 'Adesso non disegni su questo foglio.')
  }
  await db
    .prepare(
      `INSERT OR IGNORE INTO scarabocchi_tratti (stanza_id, numero, foglio, n, dati) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(l.row.id, l.row.numero, foglio, n, dati)
    .run()
  return { ok: true }
}

/** Chi puo' vedere un foglio intero: chi ci disegna, chi lo deve descrivere, e tutti a partita finita. */
function puoVedere(l: Letta, io: string, foglio: string): boolean {
  const p = l.partita
  if (!p || !p.giocatori.some((g) => g.id === io)) return false
  if (l.row.stato === 'finita') return true
  if (p.modo === 'indovina') return foglio === foglioDelTurno(p.turno) && p.fase !== 'scelta'
  if (p.fase === 'album') return true
  const catena = catenaDi(p, io, p.passo)
  if (catena === null) return false
  return foglio === foglioDellaCatena(catena, p.passo) || foglio === foglioDellaCatena(catena, p.passo - 1)
}

/** Un foglio intero, tutti i suoi pezzi in fila: per ritrovare il proprio disegno, o per descriverne uno. */
export async function foglioIntero(
  db: D1Database,
  io: string,
  codice: string,
  foglio: string,
): Promise<{ foglio: string; pezzi: string[] }> {
  const l = await leggiOFallisci(db, codice)
  if (!dentro(l, io) || !puoVedere(l, io, foglio)) fail(403, 'NON_VEDI', 'Questo foglio non lo puoi vedere.')
  return trattiNuovi(db, l, foglio, 0)
}

/**
 * Il foglio del telefono senza fili: la frase, che si salva mentre si scrive
 * e si consegna una volta, o la consegna di un disegno. Dopo la consegna non
 * cambia piu'. Quando hanno consegnato tutti, il passo dopo parte subito.
 */
export async function scriviFoglio(
  db: D1Database,
  io: string,
  codice: string,
  corpo: { numero?: unknown; catena?: unknown; passo?: unknown; testo?: unknown; consegna?: unknown },
  adesso: number,
): Promise<VistaStanzaScarabocchi> {
  const l = await leggiOFallisci(db, codice)
  if (!dentro(l, io)) fail(403, 'NON_ISCRITTO', 'Non sei in questa stanza.')
  const p = l.partita
  const { numero, catena, passo } = corpo
  if (l.row.stato !== 'partita' || !p || p.modo !== 'telefono' || p.fase !== 'gioco' || numero !== l.row.numero) {
    fail(409, 'NESSUNA_PARTITA', 'Non si sta giocando.')
  }
  if (passo !== p.passo || typeof catena !== 'number' || catenaDi(p, io, p.passo) !== catena) {
    fail(409, 'NON_TUO', 'Questo foglio non è tuo.')
  }
  if (adesso > p.fine + MARGINE_SCARABOCCHI_MS) fail(409, 'TEMPO_SCADUTO', 'Il tempo è finito.')
  const disegno = tipoDelPasso(p.passo) === 'disegna'
  const testo = disegno ? null : (testoPulito(corpo.testo, TESTO_MASSIMO) ?? null)
  const consegna = corpo.consegna === true
  await db
    .prepare(
      `INSERT INTO scarabocchi_fogli (stanza_id, numero, catena, passo, autore, testo, consegnato, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (stanza_id, numero, catena, passo) DO UPDATE
          SET testo = CASE WHEN scarabocchi_fogli.consegnato = 1 THEN scarabocchi_fogli.testo ELSE excluded.testo END,
              consegnato = MAX(scarabocchi_fogli.consegnato, excluded.consegnato),
              updated_at = excluded.updated_at`,
    )
    .bind(l.row.id, l.row.numero, catena, p.passo, io, testo, consegna ? 1 : 0, iso(adesso))
    .run()
  return vistaStanza(db, io, codice, adesso, {})
}

/** L'album a partita finita: le catene del telefono senza fili una alla volta, o i disegni dei turni. */
export async function album(
  db: D1Database,
  io: string,
  codice: string,
  catena: number | null,
): Promise<AlbumScarabocchi> {
  const l = await leggiOFallisci(db, codice)
  const p = l.partita
  if (!dentro(l, io) || !p || !p.giocatori.some((g) => g.id === io)) {
    fail(403, 'NON_VEDI', 'Questo album non lo puoi vedere.')
  }
  if (!finita(p) && l.row.stato !== 'finita') fail(409, 'IN_CORSO', 'La partita è ancora in corso.')
  const nomi = new Map(p.giocatori.map((g) => [g.id, g]))
  const autore = (id: string) => nomi.get(id) ?? { id, nome: '' }
  if (p.modo === 'indovina') {
    return {
      modo: 'indovina',
      disegni: p.chiusi.map((t) => ({
        turno: t.turno,
        disegnatore: autore(t.disegnatore),
        parola: t.parola,
        indovinati: t.indovinati,
        foglio: foglioDelTurno(t.turno),
      })),
    }
  }
  const catene = catena === null ? Array.from({ length: p.passi }, (_, c) => c) : [catena]
  if (catene.some((c) => !Number.isInteger(c) || c < 0 || c >= p.passi)) fail(400, 'CATENA', 'Catena sconosciuta.')
  const { results: fogli } = await db
    .prepare(
      `SELECT catena, passo, autore, testo, consegnato FROM scarabocchi_fogli
        WHERE stanza_id = ? AND numero = ? AND catena IN (SELECT value FROM json_each(?))`,
    )
    .bind(l.row.id, l.row.numero, JSON.stringify(catene))
    .all<FoglioRow>()
  // I disegni si danno solo per una catena alla volta: tutti insieme sarebbero troppi.
  const tratti = new Map<string, string>()
  if (catena !== null) {
    const { results } = await db
      .prepare(
        `SELECT foglio, n, dati FROM scarabocchi_tratti WHERE stanza_id = ? AND numero = ? AND foglio LIKE ?
          ORDER BY foglio, n`,
      )
      .bind(l.row.id, l.row.numero, `c${catena}p%`)
      .all<{ foglio: string; n: number; dati: string }>()
    for (const r of results) tratti.set(r.foglio, tratti.has(r.foglio) ? `${tratti.get(r.foglio)}~${r.dati}` : r.dati)
  }
  return {
    modo: 'telefono',
    catene: catene.map((c) => ({
      catena: c,
      fogli: Array.from({ length: p.passi }, (_, passo) => {
        const f = fogli.find((x) => x.catena === c && x.passo === passo)
        const tipo = tipoDelPasso(passo)
        const foglio = foglioDellaCatena(c, passo)
        return {
          passo,
          tipo,
          autore: autore(p.autori[foglio]),
          testo: tipo === 'disegna' ? null : (f?.testo ?? null),
          tratti: tipo === 'disegna' ? (tratti.get(foglio) ?? (catena === null ? null : '')) : null,
        }
      }),
    })),
  }
}

/* ───────────────────────────  Gli inviti  ─────────────────────────── */

/** Invitare un amico nella stanza: chiunque sia dentro, prima della partita. */
export async function invitaNellaStanza(db: D1Database, io: string, codice: string, chi: unknown, adesso: number) {
  const l = await leggiOFallisci(db, codice)
  if (!dentro(l, io)) fail(403, 'NON_ISCRITTO', 'Non sei in questa stanza.')
  soloPrima(l)
  if (typeof chi !== 'string' || chi === io) fail(400, 'CHI', 'Scegli chi invitare.')
  if (dentro(l, chi)) return
  const esiste = await db.prepare('SELECT 1 AS si FROM players WHERE id = ?').bind(chi).first<{ si: number }>()
  if (!esiste) fail(404, 'GIOCATORE', 'Questo giocatore non c’è.')
  await db
    .prepare(
      `INSERT INTO scarabocchi_inviti (id, stanza_id, da_id, a_id, stato, created_at)
       VALUES (?, ?, ?, ?, 'attesa', ?)
       ON CONFLICT (stanza_id, a_id) DO UPDATE
          SET stato = 'attesa', da_id = excluded.da_id, created_at = excluded.created_at`,
    )
    .bind(newId('si'), l.row.id, io, chi, iso(adesso))
    .run()
}

export async function rifiutaInvito(db: D1Database, io: string, id: string): Promise<void> {
  await db.prepare(`UPDATE scarabocchi_inviti SET stato = 'rifiutato' WHERE id = ? AND a_id = ?`).bind(id, io).run()
}

interface InvitoRow {
  id: string
  codice: string
  created_at: string
  da_id: string
  nickname: string
  display_name: string
  avatar_color: string
  impostazioni: string
  iscritti: number
}

/** Gli inviti arrivati e ancora buoni: recenti, a una stanza che aspetta, in cui non sono gia'. */
export async function invitiRicevuti(db: D1Database, io: string, adesso: number): Promise<InvitoScarabocchi[]> {
  const { results } = await db
    .prepare(
      `SELECT v.id, s.codice, v.created_at, v.da_id, p.nickname, p.display_name, p.avatar_color, s.impostazioni,
              (SELECT COUNT(*) FROM scarabocchi_iscritti WHERE stanza_id = s.id) AS iscritti
         FROM scarabocchi_inviti v
         JOIN scarabocchi_stanze s ON s.id = v.stanza_id
         JOIN players p ON p.id = v.da_id
        WHERE v.a_id = ? AND v.stato = 'attesa' AND v.created_at >= ? AND s.stato = 'attesa'
          AND NOT EXISTS (SELECT 1 FROM scarabocchi_iscritti WHERE player_id = ? AND stanza_id = s.id)
          AND NOT EXISTS (
            SELECT 1 FROM scarabocchi_iscritti i JOIN scarabocchi_stanze m ON m.id = i.stanza_id
             WHERE i.player_id = ? AND m.stato = 'partita' AND m.updated_at >= ?)
        ORDER BY v.created_at DESC
        LIMIT 5`,
    )
    .bind(io, iso(adesso - SCARABOCCHI_INVITO_MS), io, io, iso(adesso - SCARABOCCHI_STANZA_FERMA_MS))
    .all<InvitoRow>()
  return results.map((r) => ({
    id: r.id,
    codice: r.codice,
    da: breve({ player_id: r.da_id, nickname: r.nickname, display_name: r.display_name, avatar_color: r.avatar_color }),
    iscritti: r.iscritti,
    modo: impostazioniDi(r.impostazioni).modo,
    createdAt: r.created_at,
  }))
}

/** La stanza in cui sono, in breve: per tornarci dalle Libere. Una stanza ferma da tanto non conta. */
export async function stanzaBreve(db: D1Database, io: string, adesso: number): Promise<StanzaScarabocchiBreve | null> {
  // Una lettura sola, senza la partita: la chiede il giro della presenza, ogni otto secondi.
  const s = await db
    .prepare(
      `SELECT s.codice, s.stato, s.updated_at, s.impostazioni,
              (SELECT COUNT(*) FROM scarabocchi_iscritti n WHERE n.stanza_id = s.id) AS iscritti
         FROM scarabocchi_iscritti i JOIN scarabocchi_stanze s ON s.id = i.stanza_id WHERE i.player_id = ?`,
    )
    .bind(io)
    .first<Pick<StanzaRow, 'codice' | 'stato' | 'updated_at' | 'impostazioni'> & { iscritti: number }>()
  if (!s || adesso - Date.parse(s.updated_at) > SCARABOCCHI_STANZA_FERMA_MS) return null
  return { codice: s.codice, stato: s.stato, iscritti: s.iscritti, modo: impostazioniDi(s.impostazioni).modo }
}
