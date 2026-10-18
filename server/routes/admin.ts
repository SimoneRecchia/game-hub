import { Hono, type Context } from 'hono'
import {
  CONTENUTI_DEL_GIORNO,
  AZZERABILI,
  conteggi,
  contenuti,
  contenuto,
  database,
  fortuna,
  giocatore,
  giocatori,
  panoramica,
  statisticheGiochi,
} from '../lib/adminDati'
import {
  MASSIMO_RIGHE_SQL,
  MASSIMO_TESTO_ANNUNCIO,
  mascheraEmail,
  type AdminAnnunci,
  type AdminCodice,
  type AdminConteggi,
  type AdminErrori,
  type AdminIo,
  type AdminRegistro,
  type AdminSistema,
  type AdminSqlRisultato,
  type ContenutoDelGiorno,
  type FiltroGiocatori,
  type GiocoAzzerabile,
  type ModificaGiocatore,
  type OrdineGiocatori,
  type RuoloAdmin,
  type TonoAnnuncio,
} from '../../shared/admin'
import { CODE_RESEND_COOLDOWN_SECONDS, CODE_TTL_MINUTES, NICKNAME_MAX, POSTA_AL_GIORNO } from '../../shared/config'
import { gameDate, msToNextPuzzle, puzzleNumberFor } from '../../shared/daily'
import type { AppEnv, PlayerRow } from '../types'
import {
  emailProprietari,
  nuovoCodice,
  registra,
  requireAdmin,
  requireAmministratore,
  ruoloDi,
  sbloccaConCodice,
  sbloccato,
  voceRegistro,
} from '../lib/admin'
import { annuncioDa, TONI, type AnnuncioRow } from '../lib/annunci'
import { readCode, readEmail, readNickname } from '../lib/campi'
import { statisticheCloudflare } from '../lib/cloudflare'
import { adminMessage, daQuestoComputer, emailVerificationEnabled, sendEmail } from '../lib/email'
import { prenotaInvio, reteDi, troppeEmail } from '../lib/postino'
import { fail, newId, nowIso } from '../lib/http'
import { resolveSession } from '../lib/session'

/*
 * Il pannello di amministrazione, su /api/admin. Chi e' amministratore e come si
 * sblocca il pannello sta in server/lib/admin.ts; i numeri in adminDati.ts e,
 * per Cloudflare, in cloudflare.ts. Ogni rotta che cambia qualcosa lo scrive nel
 * registro, nello stesso batch della modifica quando c'e' un batch.
 */

async function corpoDi<T>(c: Context<AppEnv>): Promise<Partial<T>> {
  return ((await c.req.json().catch(() => ({}))) ?? {}) as Partial<T>
}

/** L'account su cui si lavora, o un 404. */
async function rigaDi(c: Context<AppEnv>, id: string): Promise<PlayerRow> {
  const riga = await c.env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(id).first<PlayerRow>()
  if (!riga) fail(404, 'GIOCATORE_ASSENTE', 'Questo giocatore non c’è.')
  return riga
}

/**
 * Chi puo' toccare chi: un amministratore non tocca il proprietario, e il
 * proprietario e' l'unico che da' e toglie il ruolo.
 */
function puoToccare(c: Context<AppEnv>, bersaglio: PlayerRow): RuoloAdmin | null {
  const suo = ruoloDi(c.env, bersaglio)
  if (suo === 'proprietario' && c.get('admin').ruolo !== 'proprietario') {
    fail(403, 'PROPRIETARIO', 'L’account del proprietario lo cambia solo lui.')
  }
  return suo
}

async function dettaglio(c: Context<AppEnv>, id: string) {
  const dati = await giocatore(c.env.DB, c.env, id)
  if (!dati) fail(404, 'GIOCATORE_ASSENTE', 'Questo giocatore non c’è.')
  return dati
}

/**
 * La lettura ammessa senza la scrittura accesa: un'istruzione sola, che
 * comincia con SELECT, WITH, EXPLAIN o PRAGMA (senza assegnazioni), e non ha
 * parole che scrivono fuori dalle stringhe — WITH puo' precedere un INSERT.
 */
export function soloLettura(sql: string): boolean {
  const senza = sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim()
  if (senza.includes(';')) return false
  if (!/^(select|with|explain|pragma)\b/i.test(senza)) return false
  if (/^pragma\b/i.test(senza) && senza.includes('=')) return false
  return !/\b(insert|update|delete|replace|drop|alter|create|attach|detach|vacuum|reindex|analyze|upsert)\b/i.test(senza)
}

/** Una cella per lo schermo: i blob non si mandano, e un testo lunghissimo si accorcia. */
function cella(v: unknown): unknown {
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    const byte = v instanceof ArrayBuffer ? v.byteLength : (v as ArrayBufferView).byteLength
    return `[${byte} byte]`
  }
  if (typeof v === 'string' && v.length > 4000) return `${v.slice(0, 4000)}…`
  return v
}

export const adminRoutes = new Hono<AppEnv>()

  /* ─────────────────────────────  L'accesso  ───────────────────────────── */

  /**
   * Chi sono per il pannello. Risponde a chiunque abbia una sessione: il
   * profilo la chiede per sapere se mostrare la riga del pannello.
   */
  .get('/io', async (c) => {
    const sessione = await resolveSession(c)
    if (!sessione) fail(401, 'NOT_AUTHENTICATED', 'Accedi per continuare.')
    const ruolo = ruoloDi(c.env, sessione.player)
    return c.json<AdminIo>({
      admin: ruolo !== null,
      ruolo,
      sbloccatoFino: ruolo && sbloccato(sessione.adminFino) ? sessione.adminFino : null,
      email: ruolo && sessione.player.email ? mascheraEmail(sessione.player.email) : null,
    })
  })

  /**
   * Il codice per sbloccare il pannello, all'email dell'amministratore. Basta
   * che la posta parta: non serve la verifica accesa. In locale, senza la
   * posta, torna nella risposta.
   */
  .post('/codice', requireAmministratore, async (c) => {
    const io = c.get('player')
    if (!io.email) fail(409, 'EMAIL_MANCANTE', 'Il tuo account non ha un’email a cui mandare il codice.')
    const posta = Boolean(c.env.RESEND_API_KEY)
    const inLocale = !posta && daQuestoComputer(c.req.url)
    if (!posta && !inLocale) fail(503, 'EMAIL_DISABLED', 'L’invio delle email non è attivo.')
    const codice = await nuovoCodice(c.env.DB, io.id)
    const risposta: AdminCodice = { ok: true, email: mascheraEmail(io.email), attesa: CODE_RESEND_COOLDOWN_SECONDS }
    if (inLocale) {
      console.log(`Il codice per il pannello di ${io.nickname} è ${codice}`)
      return c.json<AdminCodice>({ ...risposta, codiceDiProva: codice })
    }
    if (!(await prenotaInvio(c.env.DB, reteDi(c.req.header('cf-connecting-ip')), io.email))) troppeEmail()
    const esito = await sendEmail(c.env, { to: io.email, ...adminMessage(io.nickname, codice, CODE_TTL_MINUTES) })
    if (!esito.ok) {
      console.error(`Invio email fallito (${esito.reason}): ${esito.detail}`)
      fail(502, 'EMAIL_SEND_FAILED', 'Non riesco a mandare il codice. Riprova fra un minuto.')
    }
    return c.json(risposta)
  })

  .post('/sblocca', requireAmministratore, async (c) => {
    const corpo = await corpoDi<{ codice: string }>(c)
    const codice = readCode(corpo.codice)
    const { ruolo, tokenHash } = c.get('admin')
    const fino = await sbloccaConCodice(c.env.DB, c.get('player').id, tokenHash, codice)
    await registra(c, 'pannello.sblocco', null, { dispositivo: c.req.header('user-agent')?.slice(0, 120) ?? null })
    const email = c.get('player').email
    return c.json<AdminIo>({ admin: true, ruolo, sbloccatoFino: fino, email: email ? mascheraEmail(email) : null })
  })

  .post('/blocca', requireAmministratore, async (c) => {
    const { ruolo, tokenHash } = c.get('admin')
    await c.env.DB.prepare('UPDATE sessions SET admin_fino = NULL WHERE token_hash = ?').bind(tokenHash).run()
    const email = c.get('player').email
    return c.json<AdminIo>({ admin: true, ruolo, sbloccatoFino: null, email: email ? mascheraEmail(email) : null })
  })

  /* ─────────────────────────────  I numeri  ───────────────────────────── */

  .get('/panoramica', requireAdmin, async (c) => c.json(await panoramica(c.env.DB, c.env)))

  .get('/giochi', requireAdmin, async (c) => c.json(await statisticheGiochi(c.env.DB)))

  .get('/contenuti', requireAdmin, async (c) => c.json(await contenuti(c.env.DB)))

  .get('/contenuti/:contenuto/:numero', requireAdmin, async (c) => {
    const quale = c.req.param('contenuto') as ContenutoDelGiorno
    const numero = Number(c.req.param('numero'))
    if (!CONTENUTI_DEL_GIORNO.includes(quale) || !Number.isInteger(numero) || numero < 0) {
      fail(400, 'BAD_REQUEST', 'Contenuto non valido.')
    }
    const dati = await contenuto(c.env.DB, quale, numero)
    if (!dati) fail(404, 'CONTENUTO_ASSENTE', 'Per questo giorno non c’è ancora.')
    return c.json(dati)
  })

  .get('/fortuna', requireAdmin, async (c) => c.json(await fortuna(c.env.DB)))

  .get('/cloudflare', requireAdmin, async (c) =>
    c.json(await statisticheCloudflare(c.env, Date.now(), c.req.query('aggiorna') === '1')),
  )

  /* ─────────────────────────────  I giocatori  ───────────────────────────── */

  .get('/giocatori', requireAdmin, async (c) => {
    const ordini: OrdineGiocatori[] = ['recenti', 'iscritti', 'nome', 'attivi']
    const filtri: FiltroGiocatori[] = ['tutti', 'online', 'non-verificati', 'sospesi', 'amministratori']
    const ordine = ordini.includes(c.req.query('ordine') as OrdineGiocatori)
      ? (c.req.query('ordine') as OrdineGiocatori)
      : 'recenti'
    const filtro = filtri.includes(c.req.query('filtro') as FiltroGiocatori)
      ? (c.req.query('filtro') as FiltroGiocatori)
      : 'tutti'
    const pagina = Math.max(1, Math.min(10_000, Math.floor(Number(c.req.query('pagina')) || 1)))
    const q = (c.req.query('q') ?? '').slice(0, 80)
    return c.json(await giocatori(c.env.DB, c.env, { q, ordine, filtro, pagina }))
  })

  .get('/giocatori/:id', requireAdmin, async (c) => c.json(await dettaglio(c, c.req.param('id'))))

  /**
   * Le modifiche di un account, solo i campi che arrivano. Il nickname e l'email
   * restano unici; un'email cambiata va confermata di nuovo, se non si dice che
   * lo e'. Sospendere chiude tutte le sessioni.
   */
  .patch('/giocatori/:id', requireAdmin, async (c) => {
    const db = c.env.DB
    const riga = await rigaDi(c, c.req.param('id'))
    const suo = puoToccare(c, riga)
    const io = c.get('player').id
    const corpo = await corpoDi<ModificaGiocatore>(c)
    const campi: string[] = []
    const valori: unknown[] = []
    const cambi: Record<string, unknown> = {}
    const metti = (colonna: string, valore: unknown) => {
      campi.push(`${colonna} = ?`)
      valori.push(valore)
    }
    let sospendi = false

    if (corpo.nickname !== undefined) {
      const nickname = readNickname(corpo.nickname)
      if (nickname !== riga.nickname) {
        const preso = await db
          .prepare('SELECT 1 AS si FROM players WHERE nickname_lower = ? AND id != ?')
          .bind(nickname.toLowerCase(), riga.id)
          .first()
        if (preso) fail(409, 'NICKNAME_TAKEN', 'Questo nickname è già preso.')
        metti('nickname', nickname)
        metti('nickname_lower', nickname.toLowerCase())
        // Il nome che si vede segue il nickname, come quando lo si cambia dal profilo, se non e' stato scelto a parte.
        if (corpo.displayName === undefined && riga.display_name === riga.nickname) metti('display_name', nickname)
        cambi.nickname = { da: riga.nickname, a: nickname }
      }
    }
    if (corpo.displayName !== undefined) {
      const nome = typeof corpo.displayName === 'string' ? corpo.displayName.trim() : ''
      if (nome.length < 1 || nome.length > NICKNAME_MAX * 2) {
        fail(400, 'NOME_NON_VALIDO', `Il nome deve avere fra 1 e ${NICKNAME_MAX * 2} caratteri.`)
      }
      metti('display_name', nome)
      cambi.displayName = { da: riga.display_name, a: nome }
    }
    if (corpo.email !== undefined) {
      const email = corpo.email === null || corpo.email === '' ? null : readEmail(corpo.email)
      if ((email?.toLowerCase() ?? null) !== riga.email_lower) {
        if (email) {
          const presa = await db
            .prepare('SELECT 1 AS si FROM players WHERE email_lower = ? AND id != ?')
            .bind(email.toLowerCase(), riga.id)
            .first()
          if (presa) fail(409, 'EMAIL_TAKEN', 'Questa email è già di un altro account.')
        }
        metti('email', email)
        metti('email_lower', email?.toLowerCase() ?? null)
        if (corpo.emailVerificata === undefined) metti('email_verified_at', null)
        cambi.email = { da: riga.email, a: email }
      }
    }
    if (corpo.emailVerificata !== undefined) {
      metti('email_verified_at', corpo.emailVerificata ? (riga.email_verified_at ?? nowIso()) : null)
      // Confermata da qui, una registrazione in attesa non scade piu'.
      if (corpo.emailVerificata) metti('in_attesa_fino', null)
      cambi.emailVerificata = Boolean(corpo.emailVerificata)
    }
    if (corpo.ruolo !== undefined) {
      if (c.get('admin').ruolo !== 'proprietario') fail(403, 'SOLO_PROPRIETARIO', 'Il ruolo lo cambia solo il proprietario.')
      if (suo === 'proprietario') fail(409, 'PROPRIETARIO', 'Il proprietario si cambia in ADMIN_EMAILS.')
      metti('ruolo', corpo.ruolo === 'admin' ? 'admin' : null)
      cambi.ruolo = corpo.ruolo === 'admin' ? 'admin' : null
    }
    if (corpo.sospeso !== undefined) {
      if (corpo.sospeso && (suo === 'proprietario' || riga.id === io)) {
        fail(409, 'NON_SOSPENDIBILE', 'Questo account non si può sospendere.')
      }
      metti('sospeso_at', corpo.sospeso ? (riga.sospeso_at ?? nowIso()) : null)
      sospendi = Boolean(corpo.sospeso)
      cambi.sospeso = Boolean(corpo.sospeso)
    }
    if (corpo.sbloccaNickname) {
      metti('nickname_changed_at', null)
      cambi.sbloccaNickname = true
    }
    if (campi.length === 0) return c.json(await dettaglio(c, riga.id))

    try {
      await db.batch([
        db.prepare(`UPDATE players SET ${campi.join(', ')} WHERE id = ?`).bind(...valori, riga.id),
        ...(sospendi ? [db.prepare('DELETE FROM sessions WHERE player_id = ?').bind(riga.id)] : []),
        voceRegistro(db, io, 'giocatore.modifica', riga.nickname, cambi),
      ])
    } catch (e) {
      // L'indice unico sull'email o sul nickname, se qualcuno li ha presi nel frattempo.
      if (String(e).includes('UNIQUE')) fail(409, 'DUPLICATO', 'Nickname o email già di un altro account.')
      throw e
    }
    return c.json(await dettaglio(c, riga.id))
  })

  /** Esce da tutti i dispositivi: tutte le sessioni dell'account si chiudono. */
  .post('/giocatori/:id/esci', requireAdmin, async (c) => {
    const db = c.env.DB
    const riga = await rigaDi(c, c.req.param('id'))
    puoToccare(c, riga)
    await db.batch([
      db.prepare('DELETE FROM sessions WHERE player_id = ?').bind(riga.id),
      voceRegistro(db, c.get('player').id, 'giocatore.esci', riga.nickname),
    ])
    return c.json(await dettaglio(c, riga.id))
  })

  .delete('/giocatori/:id/sessioni/:sessione', requireAdmin, async (c) => {
    const db = c.env.DB
    const riga = await rigaDi(c, c.req.param('id'))
    puoToccare(c, riga)
    await db.batch([
      db
        .prepare('DELETE FROM sessions WHERE player_id = ? AND token_hash = ?')
        .bind(riga.id, c.req.param('sessione')),
      voceRegistro(db, c.get('player').id, 'giocatore.sessione', riga.nickname),
    ])
    return c.json(await dettaglio(c, riga.id))
  })

  /**
   * Azzera la giornata di un gioco: la partita si cancella, e chi la giocava la
   * ricomincia da capo. Per un errore del gioco, non per regalare un tentativo.
   */
  .post('/giocatori/:id/azzera', requireAdmin, async (c) => {
    const db = c.env.DB
    const riga = await rigaDi(c, c.req.param('id'))
    puoToccare(c, riga)
    const corpo = await corpoDi<{ gioco: GiocoAzzerabile; numero: number }>(c)
    const tabella = corpo.gioco ? AZZERABILI[corpo.gioco] : undefined
    if (!tabella) fail(400, 'GIOCO_NON_VALIDO', 'Questo gioco non si azzera.')
    const numero = corpo.numero ?? puzzleNumberFor(gameDate())
    if (!Number.isInteger(numero) || numero < 0) fail(400, 'BAD_REQUEST', 'Giornata non valida.')
    const [cancellate] = await db.batch([
      db
        .prepare(`DELETE FROM ${tabella.tabella} WHERE player_id = ? AND puzzle_number = ? AND ${tabella.filtro}`)
        .bind(riga.id, numero),
      voceRegistro(db, c.get('player').id, 'giocatore.azzera', riga.nickname, { gioco: corpo.gioco, numero }),
    ])
    if ((cancellate.meta.changes ?? 0) === 0) fail(404, 'PARTITA_ASSENTE', 'Quel giorno non aveva questa partita.')
    return c.json(await dettaglio(c, riga.id))
  })

  /**
   * Elimina l'account e tutto quel che e' suo: le partite, le giornate, le
   * sessioni (le tabelle lo seguono con ON DELETE CASCADE). Le sue voci nel
   * registro restano, senza il nome. Per sicurezza si scrive il nickname.
   */
  .delete('/giocatori/:id', requireAdmin, async (c) => {
    const db = c.env.DB
    const riga = await rigaDi(c, c.req.param('id'))
    const suo = puoToccare(c, riga)
    const corpo = await corpoDi<{ conferma: string }>(c)
    if (corpo.conferma !== riga.nickname) fail(400, 'CONFERMA', 'Scrivi il nickname per confermare.')
    if (suo === 'proprietario' || riga.id === c.get('player').id) {
      fail(409, 'NON_ELIMINABILE', 'Questo account non si può eliminare da qui.')
    }
    await db.batch([
      voceRegistro(db, c.get('player').id, 'giocatore.elimina', riga.nickname, { email: riga.email }),
      // Le parole in piu' dei giorni delle cinque parole non hanno il riferimento al giocatore.
      db.prepare('DELETE FROM wordle_parole_extra WHERE player_id = ?').bind(riga.id),
      db.prepare('DELETE FROM players WHERE id = ?').bind(riga.id),
    ])
    return c.json({ ok: true })
  })

  /* ─────────────────────────────  Il database  ───────────────────────────── */

  .get('/database', requireAdmin, async (c) => c.json(await database(c.env.DB)))

  .get('/database/righe', requireAdmin, async (c) => {
    const tabelle = (c.req.query('tabelle') ?? '').split(',').map((t) => t.trim()).filter(Boolean)
    return c.json<AdminConteggi>({ conteggi: await conteggi(c.env.DB, tabelle) })
  })

  /**
   * La console SQL. In lettura passa solo quel che non scrive; con la
   * scrittura accesa passa tutto, e finisce nel registro. Un'istruzione sola:
   * D1 non ne prepara due insieme.
   */
  .post('/sql', requireAdmin, async (c) => {
    const corpo = await corpoDi<{ sql: string; scrittura: boolean }>(c)
    const sql = typeof corpo.sql === 'string' ? corpo.sql.trim().replace(/;\s*$/, '') : ''
    if (!sql) fail(400, 'SQL_VUOTO', 'Scrivi una query.')
    if (sql.length > 20_000) fail(400, 'SQL_LUNGO', 'Questa query è troppo lunga.')
    const scrittura = corpo.scrittura === true
    if (!scrittura && !soloLettura(sql)) {
      fail(400, 'SOLO_LETTURA', 'In lettura passano solo SELECT, WITH, EXPLAIN e PRAGMA. Accendi la scrittura per modificare.')
    }
    const inizio = Date.now()
    let esito: D1Result<Record<string, unknown>>
    try {
      esito = await c.env.DB.prepare(sql).all<Record<string, unknown>>()
    } catch (e) {
      fail(400, 'SQL', e instanceof Error ? e.message.replace(/^D1_ERROR:\s*/, '') : String(e))
    }
    const meta = esito.meta as {
      rows_read?: number
      rows_written?: number
      changes?: number
      duration?: number
      size_after?: number
    }
    if (scrittura) {
      await registra(c, 'sql.scrittura', null, { sql: sql.slice(0, 2000), modifiche: meta.changes ?? 0 })
    }
    const righe = esito.results ?? []
    const colonne = righe.length > 0 ? Object.keys(righe[0]) : []
    return c.json<AdminSqlRisultato>({
      colonne,
      righe: righe.slice(0, MASSIMO_RIGHE_SQL).map((r) => colonne.map((k) => cella(r[k]))),
      troncato: righe.length > MASSIMO_RIGHE_SQL,
      meta: {
        righeLette: meta.rows_read ?? 0,
        righeScritte: meta.rows_written ?? 0,
        modifiche: meta.changes ?? 0,
        durataMs: meta.duration ?? Date.now() - inizio,
        dimensione: meta.size_after ?? null,
      },
    })
  })

  /* ─────────────────────────────  Gli annunci  ───────────────────────────── */

  .get('/annunci', requireAdmin, async (c) => c.json(await elencoAnnunci(c.env.DB)))

  .post('/annunci', requireAdmin, async (c) => {
    const db = c.env.DB
    const corpo = await corpoDi<{ testo: string; tono: TonoAnnuncio; fino: string | null }>(c)
    const testo = leggiTesto(corpo.testo)
    const tono = leggiTono(corpo.tono)
    const fino = leggiFino(corpo.fino)
    const id = newId('ann')
    await db.batch([
      db
        .prepare('INSERT INTO annunci (id, testo, tono, attivo, fino, created_at, created_by) VALUES (?, ?, ?, 1, ?, ?, ?)')
        .bind(id, testo, tono, fino, nowIso(), c.get('player').id),
      voceRegistro(db, c.get('player').id, 'annuncio.nuovo', null, { testo, tono, fino }),
    ])
    return c.json(await elencoAnnunci(db))
  })

  .patch('/annunci/:id', requireAdmin, async (c) => {
    const db = c.env.DB
    const corpo = await corpoDi<{ testo: string; tono: TonoAnnuncio; attivo: boolean; fino: string | null }>(c)
    const campi: string[] = []
    const valori: unknown[] = []
    if (corpo.testo !== undefined) {
      campi.push('testo = ?')
      valori.push(leggiTesto(corpo.testo))
    }
    if (corpo.tono !== undefined) {
      campi.push('tono = ?')
      valori.push(leggiTono(corpo.tono))
    }
    if (corpo.attivo !== undefined) {
      campi.push('attivo = ?')
      valori.push(corpo.attivo ? 1 : 0)
    }
    if (corpo.fino !== undefined) {
      campi.push('fino = ?')
      valori.push(leggiFino(corpo.fino))
    }
    if (campi.length > 0) {
      const [fatto] = await db.batch([
        db.prepare(`UPDATE annunci SET ${campi.join(', ')} WHERE id = ?`).bind(...valori, c.req.param('id')),
        voceRegistro(db, c.get('player').id, 'annuncio.modifica', null, { id: c.req.param('id'), ...corpo }),
      ])
      if ((fatto.meta.changes ?? 0) === 0) fail(404, 'ANNUNCIO_ASSENTE', 'Questo annuncio non c’è.')
    }
    return c.json(await elencoAnnunci(db))
  })

  .delete('/annunci/:id', requireAdmin, async (c) => {
    const db = c.env.DB
    await db.batch([
      db.prepare('DELETE FROM annunci WHERE id = ?').bind(c.req.param('id')),
      voceRegistro(db, c.get('player').id, 'annuncio.elimina', null, { id: c.req.param('id') }),
    ])
    return c.json(await elencoAnnunci(db))
  })

  /* ─────────────────────────────  Il registro  ───────────────────────────── */

  .get('/registro', requireAdmin, async (c) => {
    const PER_PAGINA = 50
    const pagina = Math.max(1, Math.floor(Number(c.req.query('pagina')) || 1))
    const [voci, conto] = await c.env.DB.batch([
      c.env.DB
        .prepare(
          `SELECT r.id, r.at, r.admin_id, p.nickname, r.azione, r.oggetto, r.dettagli
             FROM admin_registro r LEFT JOIN players p ON p.id = r.admin_id
            ORDER BY r.at DESC LIMIT ? OFFSET ?`,
        )
        .bind(PER_PAGINA, (pagina - 1) * PER_PAGINA),
      c.env.DB.prepare('SELECT COUNT(*) AS n FROM admin_registro'),
    ])
    return c.json<AdminRegistro>({
      voci: (
        voci.results as Array<{
          id: string
          at: string
          admin_id: string | null
          nickname: string | null
          azione: string
          oggetto: string | null
          dettagli: string | null
        }>
      ).map((v) => ({
        id: v.id,
        at: v.at,
        admin: v.admin_id && v.nickname ? { id: v.admin_id, nickname: v.nickname } : null,
        azione: v.azione,
        oggetto: v.oggetto,
        dettagli: apriJson(v.dettagli),
      })),
      totale: (conto.results[0] as { n: number }).n,
      pagina,
      perPagina: PER_PAGINA,
    })
  })

  .get('/errori', requireAdmin, async (c) => c.json(await elencoErrori(c.env.DB)))

  .delete('/errori', requireAdmin, async (c) => {
    const db = c.env.DB
    await db.batch([db.prepare('DELETE FROM errori_server'), voceRegistro(db, c.get('player').id, 'errori.svuota', null)])
    return c.json(await elencoErrori(db))
  })

  /* ─────────────────────────────  Il sistema  ───────────────────────────── */

  .get('/sistema', requireAdmin, async (c) => {
    const env = c.env
    const db = env.DB
    const proprietari = emailProprietari(env)
    const [vapid, amministratori, posta] = await db.batch([
      db.prepare("SELECT COUNT(*) AS n FROM segreti WHERE nome = 'vapid'"),
      db
        .prepare(
          `SELECT * FROM players
            WHERE ruolo = 'admin' OR email_lower IN (SELECT value FROM json_each(?)) ORDER BY nickname_lower`,
        )
        .bind(JSON.stringify(proprietari)),
      db.prepare('SELECT COUNT(*) AS n FROM invii_posta WHERE at > ?').bind(new Date(Date.now() - 86_400_000).toISOString()),
    ])
    const inviate = (posta.results[0] as { n: number }).n
    const data = gameDate()
    const cf = Boolean(env.CF_ACCOUNT_ID && env.CF_API_TOKEN)
    const configurazione: AdminSistema['configurazione'] = [
      {
        nome: 'Verifica dell’email',
        valore: emailVerificationEnabled(env) ? 'accesa' : `spenta (${env.EMAIL_VERIFICATION ?? 'off'})`,
        stato: emailVerificationEnabled(env) ? 'ok' : 'avviso',
      },
      {
        nome: 'Posta (Resend)',
        valore: env.RESEND_API_KEY ? 'configurata' : 'manca RESEND_API_KEY',
        stato: env.RESEND_API_KEY ? 'ok' : 'spento',
      },
      { nome: 'Mittente', valore: env.EMAIL_FROM ?? '—', stato: env.EMAIL_FROM ? 'ok' : 'avviso' },
      {
        nome: 'Email nelle ultime 24 ore',
        valore: `${inviate} su ${POSTA_AL_GIORNO}`,
        stato: inviate >= POSTA_AL_GIORNO * 0.8 ? 'avviso' : 'ok',
      },
      { nome: 'Dominio del cookie', valore: env.COOKIE_DOMAIN ?? '—', stato: env.COOKIE_DOMAIN ? 'ok' : 'avviso' },
      {
        nome: 'Proprietari (ADMIN_EMAILS)',
        valore: `${proprietari.length} ${proprietari.length === 1 ? 'email' : 'email'}`,
        stato: proprietari.length > 0 ? 'ok' : 'avviso',
      },
      {
        nome: 'Statistiche di Cloudflare',
        valore: cf ? 'configurate' : 'mancano CF_ACCOUNT_ID e CF_API_TOKEN',
        stato: cf ? 'ok' : 'spento',
      },
      { nome: 'Traffico del dominio (CF_ZONE_ID)', valore: env.CF_ZONE_ID ? 'sì' : 'no', stato: env.CF_ZONE_ID ? 'ok' : 'spento' },
      {
        nome: 'Web Analytics (CF_WEB_ANALYTICS_TAG)',
        valore: env.CF_WEB_ANALYTICS_TAG ? 'sì' : 'no',
        stato: env.CF_WEB_ANALYTICS_TAG ? 'ok' : 'spento',
      },
      {
        nome: 'Chiavi delle notifiche',
        valore: (vapid.results[0] as { n: number }).n > 0 ? 'create' : 'si creano alla prima iscrizione',
        stato: (vapid.results[0] as { n: number }).n > 0 ? 'ok' : 'avviso',
      },
    ]
    return c.json<AdminSistema>({
      adesso: nowIso(),
      giornata: { data, numero: puzzleNumberFor(data) },
      prossimaGiornataMs: msToNextPuzzle(),
      configurazione,
      amministratori: (amministratori.results as PlayerRow[]).map((r) => ({
        id: r.id,
        nickname: r.nickname,
        avatarColor: r.avatar_color,
        email: r.email,
        ruolo: ruoloDi(env, r) ?? 'admin',
      })),
    })
  })

function apriJson(testo: string | null): unknown {
  if (testo === null) return null
  try {
    return JSON.parse(testo)
  } catch {
    return testo
  }
}

function leggiTesto(valore: unknown): string {
  const testo = typeof valore === 'string' ? valore.trim() : ''
  if (!testo) fail(400, 'TESTO_VUOTO', 'Scrivi il testo dell’annuncio.')
  if (testo.length > MASSIMO_TESTO_ANNUNCIO) {
    fail(400, 'TESTO_LUNGO', `L’annuncio può avere al più ${MASSIMO_TESTO_ANNUNCIO} caratteri.`)
  }
  return testo
}

function leggiTono(valore: unknown): TonoAnnuncio {
  return TONI.includes(valore as TonoAnnuncio) ? (valore as TonoAnnuncio) : 'info'
}

function leggiFino(valore: unknown): string | null {
  if (valore === null || valore === undefined || valore === '') return null
  const ms = typeof valore === 'string' ? Date.parse(valore) : NaN
  if (!Number.isFinite(ms)) fail(400, 'DATA_NON_VALIDA', 'La scadenza non è una data.')
  return new Date(ms).toISOString()
}

async function elencoAnnunci(db: D1Database): Promise<AdminAnnunci> {
  const { results } = await db
    .prepare(
      `SELECT a.*, p.nickname FROM annunci a LEFT JOIN players p ON p.id = a.created_by
        ORDER BY a.created_at DESC LIMIT 100`,
    )
    .all<AnnuncioRow>()
  const adesso = Date.now()
  return { annunci: results.map((r) => annuncioDa(r, adesso)) }
}

async function elencoErrori(db: D1Database): Promise<AdminErrori> {
  const [errori, conto] = await db.batch([
    db.prepare(
      `SELECT e.*, p.nickname FROM errori_server e LEFT JOIN players p ON p.id = e.player_id
        ORDER BY e.at DESC LIMIT 200`,
    ),
    db.prepare('SELECT COUNT(*) AS n FROM errori_server'),
  ])
  return {
    errori: (
      errori.results as Array<{
        id: string
        at: string
        metodo: string
        percorso: string
        messaggio: string
        stack: string | null
        nickname: string | null
      }>
    ).map((e) => ({
      id: e.id,
      at: e.at,
      metodo: e.metodo,
      percorso: e.percorso,
      messaggio: e.messaggio,
      stack: e.stack,
      giocatore: e.nickname,
    })),
    totale: (conto.results[0] as { n: number }).n,
  }
}
