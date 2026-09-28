/**
 * Il banco di prova delle API: l'app vera, su un D1 finto.
 *
 * Il D1 finto e' SQLite in memoria (`node:sqlite`, in Node dalla 22) con tutte le
 * migrazioni applicate in ordine, cioe' lo stesso schema della produzione. Imita
 * del D1 quel che l'app usa: `prepare().bind()` con `first`, `all` e `run`, e
 * `batch`, che come in D1 e' atomico — se un'istruzione fallisce, non resta
 * niente delle altre.
 *
 * Non e' un file di test: lo importano i test che vogliono chiamare le rotte.
 */

import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from '../app'
import { generateSessionToken, hashSessionToken } from '../../shared/session'
import type { Bindings } from '../types'

// Vite non riconosce `node:sqlite` fra i moduli di Node e lo cercherebbe su
// disco: il require lo carica direttamente.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (percorso: string) => SqliteDb
}

interface SqliteStmt {
  get(...parametri: unknown[]): Record<string, unknown> | undefined
  all(...parametri: unknown[]): Record<string, unknown>[]
  run(...parametri: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }
}

interface SqliteDb {
  exec(sql: string): void
  prepare(sql: string): SqliteStmt
}

const MIGRAZIONI = join(__dirname, '..', '..', 'migrations')

/** Come fa D1: i booleani diventano 1 e 0, e `undefined` e' un errore del chiamante. */
function valore(v: unknown): unknown {
  if (v === undefined) throw new Error('D1_TYPE_ERROR: undefined non si può legare a un parametro')
  if (typeof v === 'boolean') return v ? 1 : 0
  return v
}

function riga<T>(r: Record<string, unknown> | undefined): T | null {
  return r ? ({ ...r } as T) : null
}

function legge(sql: string): boolean {
  return /^\s*(select|with)\b/i.test(sql) || /\breturning\b/i.test(sql)
}

class Istruzione {
  constructor(
    private readonly db: SqliteDb,
    readonly sql: string,
    private readonly parametri: unknown[] = [],
  ) {}

  bind(...parametri: unknown[]): Istruzione {
    // Come D1: al massimo cento parametri per istruzione. SQLite ne regge molti di piu', e senza questo
    // controllo una query che cresce con i giocatori passerebbe i test e fallirebbe in produzione.
    if (parametri.length > 100) throw new Error(`too many SQL variables: ${parametri.length}, D1 ne accetta 100`)
    return new Istruzione(this.db, this.sql, parametri.map(valore))
  }

  async first<T>(colonna?: string): Promise<T | null> {
    const r = this.db.prepare(this.sql).get(...this.parametri)
    if (!r) return null
    return colonna ? ((r[colonna] as T) ?? null) : riga<T>(r)
  }

  async all<T>() {
    return this.eseguiLettura<T>()
  }

  async run() {
    return this.eseguiScrittura()
  }

  eseguiLettura<T>() {
    const results = this.db.prepare(this.sql).all(...this.parametri).map((r) => ({ ...r }) as T)
    return { results, success: true, meta: { changes: 0 } }
  }

  eseguiScrittura() {
    const esito = this.db.prepare(this.sql).run(...this.parametri)
    return {
      results: [],
      success: true,
      meta: { changes: Number(esito.changes), last_row_id: Number(esito.lastInsertRowid) },
    }
  }
}

/** Le migrazioni, in ordine. */
export function migrazioni(): string[] {
  return readdirSync(MIGRAZIONI).filter((f) => f.endsWith('.sql')).sort()
}

export function applica(db: ProvaD1, file: string): void {
  db.sqlite.exec(readFileSync(join(MIGRAZIONI, file), 'utf8'))
}

export class ProvaD1 {
  readonly sqlite: SqliteDb

  /** `fino` ferma le migrazioni prima di quella indicata: serve a provarne una sui dati vecchi. */
  constructor(fino?: string) {
    this.sqlite = new DatabaseSync(':memory:')
    this.sqlite.exec('PRAGMA foreign_keys = ON')
    for (const file of migrazioni()) {
      if (fino && file >= fino) break
      applica(this, file)
    }
  }

  prepare(sql: string): Istruzione {
    return new Istruzione(this.sqlite, sql)
  }

  async batch(istruzioni: Istruzione[]) {
    this.sqlite.exec('BEGIN')
    try {
      const esiti = istruzioni.map((i) => (legge(i.sql) ? i.eseguiLettura() : i.eseguiScrittura()))
      this.sqlite.exec('COMMIT')
      return esiti
    } catch (errore) {
      this.sqlite.exec('ROLLBACK')
      throw errore
    }
  }

  async exec(sql: string) {
    this.sqlite.exec(sql)
    return { count: 0, duration: 0 }
  }
}

export interface Giocatore {
  id: string
  nickname: string
  cookie: string
}

export interface Risposta<T> {
  status: number
  dati: T
  /** Le intestazioni della risposta: la cache, il cookie. */
  intestazioni?: Headers
}

/**
 * Gli asset statici come li servono le Pages: i file di public/, e per un
 * indirizzo che non c'e' la pagina dell'app — come fanno le Pages, che la
 * danno a qualunque indirizzo sconosciuto.
 */
const PUBBLICA = join(__dirname, '..', '..', 'public')
export const ASSETS_FINTI = {
  async fetch(richiesta: RequestInfo | URL): Promise<Response> {
    const url = new URL(richiesta instanceof Request ? richiesta.url : String(richiesta))
    try {
      return new Response(readFileSync(join(PUBBLICA, decodeURIComponent(url.pathname))))
    } catch {
      return new Response('<!doctype html><title>Giochi</title>', { headers: { 'content-type': 'text/html' } })
    }
  },
} as unknown as Fetcher

/**
 * Un ambiente completo: database, app, e il modo di creare giocatori con una
 * sessione valida senza passare dalla registrazione.
 */
export function banco(variabili: Partial<Bindings> = {}) {
  const db = new ProvaD1()
  const app = createApp()
  const env = {
    DB: db as unknown as D1Database,
    ASSETS: ASSETS_FINTI,
    EMAIL_VERIFICATION: 'off',
    ...variabili,
  } as Bindings

  let contatore = 0
  async function giocatore(nickname = `g${++contatore}`): Promise<Giocatore> {
    const id = `pl_${nickname}`
    const adesso = new Date().toISOString()
    db.sqlite
      .prepare(
        `INSERT INTO players (id, nickname, nickname_lower, display_name, password_hash,
           password_salt, password_iterations, avatar_color, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, 'x', 'x', 1, '#007aff', ?, ?)`,
      )
      .run(id, nickname, nickname.toLowerCase(), nickname, adesso, adesso)
    const token = generateSessionToken()
    const scadenza = new Date(Date.now() + 86_400_000).toISOString()
    db.sqlite
      .prepare(
        `INSERT INTO sessions (token_hash, player_id, created_at, expires_at, last_used_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(await hashSessionToken(token), id, adesso, scadenza, adesso)
    return { id, nickname, cookie: `gh_session=${token}` }
  }

  async function chiama<T = Record<string, unknown>>(
    metodo: string,
    percorso: string,
    chi?: Giocatore | null,
    corpo?: unknown,
  ): Promise<Risposta<T>> {
    const risposta = await app.request(
      `http://localhost/api${percorso}`,
      {
        method: metodo,
        headers: {
          'content-type': 'application/json',
          ...(chi ? { cookie: chi.cookie } : {}),
        },
        ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      },
      env,
    )
    const testo = await risposta.text()
    return { status: risposta.status, dati: (testo ? JSON.parse(testo) : null) as T, intestazioni: risposta.headers }
  }

  return { db, app, env, giocatore, chiama }
}
