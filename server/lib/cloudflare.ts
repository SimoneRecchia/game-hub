/**
 * Le statistiche di Cloudflare per il pannello: le richieste alle Pages
 * Functions (quelle che il piano gratuito conta, centomila al giorno), le
 * letture e le scritture di D1 e quanto e' grande, il traffico del dominio, le
 * visite e gli ultimi deploy.
 *
 * Le legge l'API di Cloudflare con un token in sola lettura (`CF_API_TOKEN`,
 * un secret, e `CF_ACCOUNT_ID`): le analisi dalla GraphQL, il database e i
 * deploy dalla REST. Ogni sezione e' una richiesta a parte, e una che non
 * risponde — un permesso che manca al token, un dataset che il piano non ha —
 * finisce negli `errori` senza portarsi via le altre. I valori vanno nelle
 * query scritti e non come variabili, dopo averne controllato la forma: gli
 * scalari della GraphQL di Cloudflare hanno nomi suoi (`string`, `Date`), e
 * sbagliarne uno fa fallire tutta la query.
 *
 * Un minuto di cache per isolato: il pannello si riapre spesso, e i numeri di
 * Cloudflare cambiano piu' piano.
 */

import type { AdminCloudflare } from '../../shared/admin'
import type { Bindings } from '../types'

const API = 'https://api.cloudflare.com/client/v4'
const PROGETTO = 'game-hub'
const DATABASE = 'game-hub-db'
const GIORNI = 30
const CACHE_MS = 60_000

let cache: { at: number; dati: AdminCloudflare } | null = null

const esadecimale = /^[a-f0-9]{32}$/i

function dataUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

async function graphql<T>(token: string, query: string): Promise<T> {
  const risposta = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const corpo = (await risposta.json().catch(() => null)) as {
    data?: T | null
    errors?: Array<{ message?: string }> | null
  } | null
  if (!risposta.ok || !corpo || corpo.errors?.length || !corpo.data) {
    throw new Error(corpo?.errors?.[0]?.message ?? `HTTP ${risposta.status}`)
  }
  return corpo.data
}

async function rest<T>(token: string, percorso: string): Promise<T> {
  const risposta = await fetch(`${API}${percorso}`, { headers: { authorization: `Bearer ${token}` } })
  const corpo = (await risposta.json().catch(() => null)) as {
    success?: boolean
    result?: T
    errors?: Array<{ message?: string }>
  } | null
  if (!risposta.ok || !corpo?.success || corpo.result === undefined) {
    throw new Error(corpo?.errors?.[0]?.message ?? `HTTP ${risposta.status}`)
  }
  return corpo.result
}

type Gruppi<T> = { viewer: { accounts?: Array<Record<string, T[]>>; zones?: Array<Record<string, T[]>> } }

function gruppi<T>(dati: Gruppi<T>, campo: string): T[] {
  return (dati.viewer.accounts ?? dati.viewer.zones ?? [])[0]?.[campo] ?? []
}

export async function statisticheCloudflare(env: Bindings, adesso = Date.now(), fresche = false): Promise<AdminCloudflare> {
  if (!fresche && cache && adesso - cache.at < CACHE_MS) return cache.dati
  const a = dataUtc(adesso)
  const da = dataUtc(adesso - (GIORNI - 1) * 86_400_000)
  const mancano = ['CF_ACCOUNT_ID', 'CF_API_TOKEN'].filter((k) => !env[k as keyof Bindings])
  const vuoto: AdminCloudflare = {
    configurato: false,
    mancano,
    errori: [],
    da,
    a,
    funzioni: null,
    d1: null,
    traffico: null,
    visite: null,
    deploy: null,
  }
  const conto = env.CF_ACCOUNT_ID?.trim() ?? ''
  const token = env.CF_API_TOKEN?.trim() ?? ''
  if (mancano.length > 0) return vuoto
  if (!esadecimale.test(conto)) {
    return { ...vuoto, configurato: true, errori: [{ sezione: 'Configurazione', messaggio: 'CF_ACCOUNT_ID non sembra un ID di account.' }] }
  }
  const periodo = `date_geq: "${da}", date_leq: "${a}"`
  const errori: AdminCloudflare['errori'] = []
  const prova = async <T>(sezione: string, lavoro: () => Promise<T>): Promise<T | null> => {
    try {
      return await lavoro()
    } catch (e) {
      errori.push({ sezione, messaggio: e instanceof Error ? e.message : String(e) })
      return null
    }
  }

  const zona = env.CF_ZONE_ID?.trim() ?? ''
  const sito = env.CF_WEB_ANALYTICS_TAG?.trim() ?? ''
  const [funzioni, database, deploy, traffico, visite] = await Promise.all([
    prova('Richieste', async () => {
      type Riga = {
        sum: { requests: number; errors: number }
        quantiles: { cpuTimeP50: number | null; cpuTimeP99: number | null }
        dimensions: { date: string }
      }
      const dati = await graphql<Gruppi<Riga>>(
        token,
        `{ viewer { accounts(filter: { accountTag: "${conto}" }) {
            pagesFunctionsInvocationsAdaptiveGroups(limit: 1000, filter: { ${periodo} }, orderBy: [date_ASC]) {
              sum { requests errors }
              quantiles { cpuTimeP50 cpuTimeP99 }
              dimensions { date }
            } } } }`,
      )
      // La CPU arriva in microsecondi.
      const ms = (x: number | null) => (x === null ? null : Math.round(x / 10) / 100)
      return gruppi(dati, 'pagesFunctionsInvocationsAdaptiveGroups').map((r) => ({
        data: r.dimensions.date,
        richieste: r.sum.requests,
        errori: r.sum.errors,
        cpuP50: ms(r.quantiles.cpuTimeP50),
        cpuP99: ms(r.quantiles.cpuTimeP99),
      }))
    }),
    prova('Database', async () => {
      const elenco = await rest<Array<{ uuid: string; name: string; file_size?: number; num_tables?: number }>>(
        token,
        `/accounts/${conto}/d1/database?name=${DATABASE}`,
      )
      const db = elenco.find((d) => d.name === DATABASE) ?? null
      type Riga = {
        sum: { readQueries: number; writeQueries: number; rowsRead: number; rowsWritten: number }
        dimensions: { date: string }
      }
      const filtro = db && /^[a-f0-9-]{36}$/i.test(db.uuid) ? `, databaseId: "${db.uuid}"` : ''
      const dati = await graphql<Gruppi<Riga>>(
        token,
        `{ viewer { accounts(filter: { accountTag: "${conto}" }) {
            d1AnalyticsAdaptiveGroups(limit: 1000, filter: { ${periodo}${filtro} }, orderBy: [date_ASC]) {
              sum { readQueries writeQueries rowsRead rowsWritten }
              dimensions { date }
            } } } }`,
      )
      // Senza il filtro sul database i giorni arrivano uno per database: si sommano.
      const perGiorno = new Map<string, { letture: number; scritture: number; righeLette: number; righeScritte: number }>()
      for (const r of gruppi(dati, 'd1AnalyticsAdaptiveGroups')) {
        const g = perGiorno.get(r.dimensions.date) ?? { letture: 0, scritture: 0, righeLette: 0, righeScritte: 0 }
        g.letture += r.sum.readQueries
        g.scritture += r.sum.writeQueries
        g.righeLette += r.sum.rowsRead
        g.righeScritte += r.sum.rowsWritten
        perGiorno.set(r.dimensions.date, g)
      }
      return {
        giorni: [...perGiorno].sort(([x], [y]) => x.localeCompare(y)).map(([data, g]) => ({ data, ...g })),
        dimensione: db?.file_size ?? null,
        tabelle: db?.num_tables ?? null,
      }
    }),
    prova('Deploy', async () => {
      const elenco = await rest<
        Array<{
          id: string
          url: string
          environment: string
          created_on: string
          latest_stage?: { status?: string }
          deployment_trigger?: { metadata?: { commit_hash?: string; commit_message?: string } }
        }>
      >(token, `/accounts/${conto}/pages/projects/${PROGETTO}/deployments?per_page=10`)
      return elenco.slice(0, 10).map((d) => ({
        id: d.id,
        creatoIl: d.created_on,
        stato: d.latest_stage?.status ?? 'sconosciuto',
        ambiente: d.environment,
        url: d.url,
        commit: d.deployment_trigger?.metadata?.commit_hash?.slice(0, 7) ?? null,
        messaggio: d.deployment_trigger?.metadata?.commit_message?.split('\n')[0] ?? null,
      }))
    }),
    esadecimale.test(zona)
      ? prova('Traffico', async () => {
          type Riga = {
            sum: { requests: number; pageViews: number; bytes: number }
            uniq: { uniques: number }
            dimensions: { date: string }
          }
          const dati = await graphql<Gruppi<Riga>>(
            token,
            `{ viewer { zones(filter: { zoneTag: "${zona}" }) {
                httpRequests1dGroups(limit: ${GIORNI + 1}, filter: { ${periodo} }, orderBy: [date_ASC]) {
                  sum { requests pageViews bytes }
                  uniq { uniques }
                  dimensions { date }
                } } } }`,
          )
          return gruppi(dati, 'httpRequests1dGroups').map((r) => ({
            data: r.dimensions.date,
            richieste: r.sum.requests,
            pagine: r.sum.pageViews,
            visitatori: r.uniq.uniques,
            byte: r.sum.bytes,
          }))
        })
      : null,
    esadecimale.test(sito)
      ? prova('Visite', async () => {
          type Riga = { count: number; sum: { visits: number }; dimensions: { date: string } }
          const dati = await graphql<Gruppi<Riga>>(
            token,
            `{ viewer { accounts(filter: { accountTag: "${conto}" }) {
                rumPageloadEventsAdaptiveGroups(limit: 1000, filter: { ${periodo}, siteTag: "${sito}" }, orderBy: [date_ASC]) {
                  count
                  sum { visits }
                  dimensions { date }
                } } } }`,
          )
          return gruppi(dati, 'rumPageloadEventsAdaptiveGroups').map((r) => ({
            data: r.dimensions.date,
            visite: r.sum.visits,
            pagine: r.count,
          }))
        })
      : null,
  ])
  const dati: AdminCloudflare = {
    configurato: true,
    mancano: [],
    errori,
    da,
    a,
    funzioni,
    d1: database,
    traffico,
    visite,
    deploy,
  }
  cache = { at: adesso, dati }
  return dati
}
