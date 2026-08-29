#!/usr/bin/env node
/**
 * Configura e pubblica il progetto su Cloudflare, in un colpo.
 *
 * Serve `CLOUDFLARE_API_TOKEN` nell'ambiente, con i permessi elencati in
 * DEPLOY.md. Tutti i passi sono idempotenti: se una risorsa esiste già viene
 * riusata, quindi lo script si può rilanciare senza danni — è il modo più
 * rapido per ricostruire l'ambiente da zero, o per ripararlo.
 *
 *   1. verifica il token, trova account e zona
 *   2. crea il database D1 (o riusa quello esistente)
 *   3. scrive il database_id in wrangler.toml
 *   4. applica le migrazioni in remoto e verifica che le tabelle ci siano
 *   5. crea il progetto Pages (o riusa)
 *   6. build e pubblicazione
 *   7. collega i sottodomini e crea i record DNS
 *   8. attende l'attivazione e verifica /api/health su ogni host
 *
 * Il deploy di ogni giorno non passa da qui: lo fa
 * .github/workflows/deploy.yml a ogni push su main.
 *
 * Variabili facoltative: APEX_DOMAIN, SUBDOMAINS (separati da virgola).
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const TOKEN = process.env.CLOUDFLARE_API_TOKEN
if (!TOKEN) {
  console.error('Manca CLOUDFLARE_API_TOKEN nell\'ambiente.')
  process.exit(1)
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const API = 'https://api.cloudflare.com/client/v4'
const DB_NAME = 'game-hub-db'
const PROJECT = 'game-hub'
const APEX = process.env.APEX_DOMAIN ?? 'simonerecchia.com'
const SUBDOMAINS = (process.env.SUBDOMAINS ?? `giochi.${APEX},wordle.${APEX}`).split(',')
const PLACEHOLDER = 'SOSTITUISCI_CON_IL_TUO_D1_DATABASE_ID'

let step = 0
const say = (msg) => console.log(`\n[${++step}] ${msg}`)
const ok = (msg) => console.log(`    ✓ ${msg}`)
const warn = (msg) => console.log(`    ! ${msg}`)

async function cf(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok && json.success !== false, json }
}

function run(cmd, args, env = {}) {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, CLOUDFLARE_API_TOKEN: TOKEN, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024,
  })
}

// ── 1. token, account, zona ───────────────────────────────────────────────
say('Verifico il token')
const verify = await cf('/user/tokens/verify')
if (!verify.ok) {
  console.error(`    Token rifiutato (HTTP ${verify.status}):`,
    JSON.stringify(verify.json.errors ?? verify.json).slice(0, 300))
  process.exit(1)
}
ok(`token valido, stato "${verify.json.result?.status}"`)

const accounts = await cf('/accounts')
if (!accounts.ok || !accounts.json.result?.length) {
  console.error('    Il token non vede nessun account. Serve il permesso Account Settings:Read,')
  console.error('    oppure imposta CLOUDFLARE_ACCOUNT_ID a mano.')
  process.exit(1)
}
const account = accounts.json.result[0]
ok(`account: ${account.name} (${account.id})`)

const zones = await cf('/zones?per_page=50')
if (zones.ok) {
  const names = zones.json.result.map((z) => z.name)
  ok(`zone visibili: ${names.join(', ') || '(nessuna)'}`)
  if (!names.includes(APEX)) {
    warn(`la zona ${APEX} non e' fra quelle visibili: i sottodomini potrebbero non attivarsi`)
  }
} else {
  warn('non riesco a elencare le zone (manca Zone:Read): proseguo comunque')
}

// ── 2. database D1 ────────────────────────────────────────────────────────
say(`Database D1 "${DB_NAME}"`)
const dbs = await cf(`/accounts/${account.id}/d1/database?per_page=100`)
let db = dbs.ok ? dbs.json.result?.find((d) => d.name === DB_NAME) : null
if (db) {
  ok(`esiste già: ${db.uuid}`)
} else {
  const created = await cf(`/accounts/${account.id}/d1/database`, {
    method: 'POST',
    body: { name: DB_NAME },
  })
  if (!created.ok) {
    console.error('    Creazione fallita:',
      JSON.stringify(created.json.errors ?? created.json).slice(0, 300))
    process.exit(1)
  }
  db = created.json.result
  ok(`creato: ${db.uuid}`)
}

// ── 3. wrangler.toml ──────────────────────────────────────────────────────
say('Scrivo il database_id in wrangler.toml')
const tomlPath = `${ROOT}/wrangler.toml`
let toml = readFileSync(tomlPath, 'utf8')
if (toml.includes(db.uuid)) {
  ok('già presente')
} else {
  toml = toml.replace(PLACEHOLDER, db.uuid)
  if (toml.includes(PLACEHOLDER)) {
    console.error('    Segnaposto non trovato: wrangler.toml e\' stato modificato a mano?')
    process.exit(1)
  }
  writeFileSync(tomlPath, toml)
  ok(`impostato ${db.uuid}`)
}

// ── 4. migrazioni ─────────────────────────────────────────────────────────
say('Applico le migrazioni in remoto')
try {
  run('npx', ['wrangler', 'd1', 'migrations', 'apply', DB_NAME, '--remote'])
} catch (e) {
  const text = `${e.stdout ?? ''}${e.stderr ?? ''}`
  if (!/No migrations to apply/i.test(text)) {
    console.error('    Migrazioni fallite:\n' + text.slice(-1500))
    process.exit(1)
  }
}
// L'esito si controlla sulle tabelle, non sull'output di wrangler: nella prima
// stesura il messaggio non veniva riconosciuto e lo script diceva "nessuna
// migrazione da applicare" su un database appena creato.
const tabelle = run('npx', ['wrangler', 'd1', 'execute', DB_NAME, '--remote', '--json',
  '--command', "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"])
const nomi = JSON.parse(tabelle.slice(tabelle.indexOf('[')))[0].results.map((r) => r.name)
const attese = ['players', 'sessions', 'wordle_games', 'daily_puzzles']
const mancanti = attese.filter((t) => !nomi.includes(t))
if (mancanti.length) {
  console.error(`    Tabelle mancanti dopo le migrazioni: ${mancanti.join(', ')}`)
  process.exit(1)
}
ok(`tabelle presenti: ${attese.join(', ')}`)

// ── 5. progetto Pages ─────────────────────────────────────────────────────
say(`Progetto Pages "${PROJECT}"`)
const existing = await cf(`/accounts/${account.id}/pages/projects/${PROJECT}`)
if (existing.ok) {
  ok(`esiste già (branch di produzione: ${existing.json.result?.production_branch})`)
} else {
  const created = await cf(`/accounts/${account.id}/pages/projects`, {
    method: 'POST',
    body: { name: PROJECT, production_branch: 'main' },
  })
  if (!created.ok) {
    console.error('    Creazione fallita:',
      JSON.stringify(created.json.errors ?? created.json).slice(0, 400))
    process.exit(1)
  }
  ok('creato')
}

// ── 6. build e pubblicazione ──────────────────────────────────────────────
say('Build e pubblicazione')
run('npm', ['run', 'build'])
ok('build completato')
const deploy = run('npx', ['wrangler', 'pages', 'deploy', 'dist',
  '--project-name', PROJECT, '--branch', 'main', '--commit-dirty', 'true'])
const url = deploy.match(/https:\/\/[a-z0-9.-]+\.pages\.dev/i)
ok(`pubblicato: ${url ? url[0] : '(URL non trovato nell\'output)'}`)

// ── 7. sottodomini ────────────────────────────────────────────────────────
say('Collego i sottodomini')

/*
 * Il sottodominio *.pages.dev puo' non corrispondere al nome del progetto:
 * se `game-hab.pages.dev` e' già di qualcun altro, Cloudflare ne assegna uno
 * con un suffisso (game-hub-43l.pages.dev). I CNAME devono puntare a quello
 * vero, quindi va letto dal progetto e non costruito dal nome.
 */
const progetto = await cf(`/accounts/${account.id}/pages/projects/${PROJECT}`)
const pagesHost = progetto.json.result?.subdomain
if (!pagesHost) {
  console.error('    Non riesco a leggere il sottodominio pages.dev del progetto')
  process.exit(1)
}
ok(`sottodominio del progetto: ${pagesHost}`)

const zone = await cf(`/zones?name=${APEX}`)
const zoneId = zone.ok ? zone.json.result?.[0]?.id : null
if (!zoneId) warn(`zona ${APEX} non trovata: i record DNS vanno creati a mano`)

for (const host of SUBDOMAINS) {
  const attached = await cf(`/accounts/${account.id}/pages/projects/${PROJECT}/domains`, {
    method: 'POST',
    body: { name: host },
  })
  if (attached.ok) ok(`${host} collegato al progetto`)
  else {
    const err = JSON.stringify(attached.json.errors ?? attached.json)
    // 8000018 = "You have already added this custom domain": e' l'esito
    // normale di una riesecuzione, non un problema.
    if (/already added|already exists|8000018/i.test(err)) ok(`${host} già collegato al progetto`)
    else warn(`${host}: ${err.slice(0, 220)}`)
  }

  /*
   * Il record DNS non viene creato da solo: senza, il dominio resta in stato
   * "pending" e non risolve. Va un CNAME proxato verso il sottodominio del
   * progetto.
   */
  if (!zoneId) continue
  const sub = host.replace(`.${APEX}`, '')
  const esistenti = await cf(`/zones/${zoneId}/dns_records?name=${host}`)
  const record = esistenti.ok ? esistenti.json.result?.[0] : null
  if (record && record.type === 'CNAME' && record.content === pagesHost) {
    ok(`${host} DNS già a posto`)
  } else if (record) {
    warn(`${host} ha già un record ${record.type} → ${record.content}: lasciato com'e'`)
  } else {
    const creato = await cf(`/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: {
        type: 'CNAME', name: sub, content: pagesHost, proxied: true,
        comment: 'Game Hub su Cloudflare Pages',
      },
    })
    if (creato.ok) ok(`${host} CNAME → ${pagesHost}`)
    else warn(`${host} DNS: ${JSON.stringify(creato.json.errors ?? creato.json).slice(0, 200)}`)
  }
}

// I domini appena collegati restano "pending" per un po': senza attendere,
// la verifica finale fallirebbe sempre al primo giro.
say('Attendo che i domini diventino attivi')
for (let i = 1; i <= 24; i += 1) {
  const stato = await cf(`/accounts/${account.id}/pages/projects/${PROJECT}/domains`)
  const righe = (stato.json.result ?? []).map((r) => [r.name, r.status])
  if (righe.length && righe.every(([, s]) => s === 'active')) {
    ok('tutti attivi')
    break
  }
  if (i % 4 === 0) console.log(`    ${righe.map(([n, s]) => `${n}=${s}`).join(' ')}`)
  if (i === 24) warn('ancora in attesa: il certificato puo\' richiedere qualche minuto')
  else await new Promise((r) => setTimeout(r, 15_000))
}

// ── 8. verifica ───────────────────────────────────────────────────────────
say('Verifico /api/health')
const targets = [pagesHost, ...SUBDOMAINS]
for (const host of targets) {
  try {
    const res = await fetch(`https://${host}/api/health`, { redirect: 'follow' })
    const body = (await res.text()).slice(0, 160)
    console.log(`    ${host.padEnd(30)} ${res.status}  ${body}`)
  } catch (e) {
    console.log(`    ${host.padEnd(30)} non raggiungibile (${e.cause?.code ?? e.message})`)
  }
}

console.log('\nFatto. Il certificato dei sottodomini nuovi puo\' richiedere qualche minuto.')
