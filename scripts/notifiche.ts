/**
 * Le notifiche a orario: l'estrazione del SuperEnalotto che sta per
 * cominciare, e il promemoria della sera per chi ha delle giornaliere da
 * giocare. Le altre — gli inviti, "tocca a te" — le manda il Worker con la
 * richiesta che le fa nascere (server/lib/notifiche.ts).
 *
 * Gira in CI (`.github/workflows/notifiche.yml`), con due orari per ogni invio,
 * uno per l'ora legale e uno per la solare: lo script guarda l'ora italiana e
 * manda solo se e' il momento, e una volta sola (`notifiche_inviate`). Non nel
 * Worker: cifrare una notifica per ogni dispositivo di tutti passerebbe i dieci
 * millisecondi di una richiesta.
 *
 * Le chiavi per firmare stanno in D1 (`segreti`) e lo script le legge senza
 * stamparle; se non ci sono, nessuno si e' mai iscritto.
 *
 * Uso:
 *   npx vite-node scripts/notifiche.ts -- --estrazione --remote
 *   npx vite-node scripts/notifiche.ts -- --promemoria --local
 *   … --prova                                    dice a chi manderebbe, senza mandare
 *   … --sempre                                   non guarda l'ora (per provarlo)
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GAME_TIMEZONE } from '../shared/config'
import { gameDate, puzzleNumberFor } from '../shared/daily'
import { preferenzaSql } from '../shared/notifiche'
import { DIRETTA, CHIUSURA, concorsoAperto, momentiDi } from '../shared/superenalotto'
import type { GiocoClassificato } from '../shared/types'
import { mandaPush, type ChiaviVapid, type IscrizionePush, type MessaggioPush } from '../shared/webpush'
import { unisci } from '../shared/sql'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DB = 'game-hub-db'

const argomenti = process.argv.slice(2)
const REMOTO = argomenti.includes('--remote')
const LOCALE = argomenti.includes('--local')
const PROVA = argomenti.includes('--prova')
const SEMPRE = argomenti.includes('--sempre')
const ESTRAZIONE = argomenti.includes('--estrazione')
const PROMEMORIA = argomenti.includes('--promemoria')
if ((!REMOTO && !LOCALE) || ESTRAZIONE === PROMEMORIA) {
  console.error('Uso: notifiche.ts --estrazione|--promemoria --remote|--local [--prova] [--sempre]')
  process.exit(1)
}

/** L'indirizzo dell'app, per VAPID: lo stesso di `mittente` nel Worker, dal dominio di wrangler.toml. */
const DOMINIO = /^COOKIE_DOMAIN\s*=\s*"([^"]+)"/m.exec(readFileSync(join(ROOT, 'wrangler.toml'), 'utf8'))?.[1]
const SITO = DOMINIO ? `https://giochi.${DOMINIO}` : 'https://game-hub-43l.pages.dev'

/** Quanto prima dell'estrazione si avvisa, al piu' e almeno: il workflow parte un po' prima, e a volte in ritardo. */
const ESTRAZIONE_ENTRO_MIN = { da: 3, a: 50 }
/** L'ora italiana del promemoria: dalle 19 alle 21. */
const PROMEMORIA_ORE = { da: 19, a: 21 }

/** I giochi delle Giornaliere, con la tabella delle partite e il nome per il promemoria. */
const GIORNALIERE: ReadonlyArray<readonly [GiocoClassificato, string, string]> = [
  ['wordle', 'wordle_games', 'Wordle'],
  ['cruciverba', 'cruciverba_games', 'Cruciverba'],
  ['sudoku', 'sudoku_games', 'Sudoku'],
  ['scarabeo', 'scarabeo_games', 'Scarabeo'],
  ['quiz', 'quiz_partite', 'Quiz'],
  ['nomi', 'nomi_partite', 'Nomi, cose e città'],
  ['anagrammi', 'anagrammi_partite', 'Anagrammi'],
  ['ghigliottina', 'ghigliottina_partite', 'Ghigliottina'],
  ['paroliere', 'paroliere_partite', 'Paroliere'],
  ['catena', 'catena_partite', 'Catena'],
]

function wrangler(parametri: string[]): string {
  return execFileSync('npx', ['wrangler', 'd1', 'execute', DB, REMOTO ? '--remote' : '--local', ...parametri], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  }).toString()
}

function interroga<T>(sql: string): T[] {
  const uscita = wrangler(['--json', '--command', sql])
  return JSON.parse(uscita.slice(uscita.indexOf('[')))[0].results as T[]
}

const cita = (s: string) => `'${s.replace(/'/g, "''")}'`

/** L'ora italiana, come ore e minuti. */
function oraItaliana(adesso: number): { ore: number; minuti: number } {
  const parti = new Intl.DateTimeFormat('it-IT', { timeZone: GAME_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(adesso))
  const valore = (tipo: string) => Number(parti.find((p) => p.type === tipo)?.value ?? 0)
  return { ore: valore('hour'), minuti: valore('minute') }
}

/** Segna l'invio come fatto, se non lo era: restituisce false se qualcun altro l'aveva gia' fatto. */
function primaVolta(chiave: string): boolean {
  if (interroga<{ si: number }>(`SELECT 1 AS si FROM notifiche_inviate WHERE chiave = ${cita(chiave)}`).length > 0) return false
  if (!PROVA) wrangler(['--command', `INSERT OR IGNORE INTO notifiche_inviate (chiave, created_at) VALUES (${cita(chiave)}, ${cita(new Date().toISOString())})`])
  return true
}

function chiavi(): ChiaviVapid | null {
  const [riga] = interroga<{ valore: string }>("SELECT valore FROM segreti WHERE nome = 'vapid'")
  return riga ? (JSON.parse(riga.valore) as ChiaviVapid) : null
}

type Destinatario = IscrizionePush & { player_id: string }

/** Manda a ognuno il suo messaggio, e cancella le iscrizioni che il servizio dice morte. */
async function manda(destinatari: Array<{ a: Destinatario; messaggio: MessaggioPush }>, ttl: number) {
  const k = chiavi()
  if (!k || destinatari.length === 0) {
    console.log('  nessun destinatario')
    return
  }
  if (PROVA) {
    for (const { a, messaggio } of destinatari) console.log(`  a ${a.player_id}: ${messaggio.titolo} — ${messaggio.testo}`)
    return
  }
  const morte: string[] = []
  let arrivate = 0
  // A gruppi, per non aprire cento connessioni insieme.
  for (let i = 0; i < destinatari.length; i += 20) {
    const gruppo = destinatari.slice(i, i + 20)
    const esiti = await Promise.all(gruppo.map(({ a, messaggio }) => mandaPush(a, messaggio, k, { sub: SITO, ttl })))
    esiti.forEach((e, j) => {
      if (e.morta) morte.push(gruppo[j].a.endpoint)
      else if (e.stato >= 200 && e.stato < 300) arrivate += 1
    })
  }
  console.log(`  mandate ${arrivate} su ${destinatari.length}, ${morte.length} iscrizioni scadute`)
  if (morte.length > 0) {
    wrangler(['--command', `DELETE FROM push_iscrizioni WHERE endpoint IN (${morte.map(cita).join(', ')})`])
  }
}

async function estrazione(adesso: number) {
  const data = concorsoAperto(adesso)
  if (!data) {
    console.log('SuperEnalotto: nessun concorso aperto')
    return
  }
  const { chiusura, inizio } = momentiDi(data)
  const minuti = Math.round((inizio - adesso) / 60_000)
  console.log(`SuperEnalotto: concorso del ${data}, l'estrazione fra ${minuti} minuti`)
  if (!SEMPRE && (minuti < ESTRAZIONE_ENTRO_MIN.da || minuti > ESTRAZIONE_ENTRO_MIN.a)) {
    console.log('  non e\' il momento')
    return
  }
  if (!primaVolta(`superenalotto:${data}`)) {
    console.log('  gia\' mandate')
    return
  }
  const righe = interroga<Destinatario & { schede: number }>(
    `SELECT s.endpoint, s.p256dh, s.auth, s.player_id,
            (SELECT COUNT(*) FROM enalotto_schede e WHERE e.player_id = s.player_id AND e.concorso = ${cita(data)}) AS schede
       FROM push_iscrizioni s JOIN players p ON p.id = s.player_id
      WHERE ${preferenzaSql('p.notifiche', 'superenalotto')}`,
  )
  const ora = `${DIRETTA.ore}:${String(DIRETTA.minuti).padStart(2, '0')}`
  const chiude = `${CHIUSURA.ore}:${String(CHIUSURA.minuti).padStart(2, '0')}`
  await manda(
    righe.map((r) => ({
      a: r,
      messaggio: {
        titolo: `SuperEnalotto: si estrae alle ${ora}`,
        testo:
          r.schede > 0
            ? `Hai ${r.schede === 1 ? 'una scheda' : `${r.schede} schede`} in gioco.`
            : chiusura > adesso
              ? `Si gioca fino alle ${chiude}.`
              : 'Guarda l’estrazione in diretta.',
        url: '/superenalotto',
        tag: `superenalotto-${data}`,
      },
    })),
    Math.max(60, Math.round((inizio - adesso) / 1000)),
  )
}

async function promemoria(adesso: number) {
  const { ore } = oraItaliana(adesso)
  const numero = puzzleNumberFor(gameDate(new Date(adesso)))
  console.log(`Promemoria: giornata ${numero}, sono le ${ore} in Italia`)
  if (!SEMPRE && (ore < PROMEMORIA_ORE.da || ore >= PROMEMORIA_ORE.a)) {
    console.log('  non e\' il momento')
    return
  }
  if (!primaVolta(`promemoria:${numero}`)) {
    console.log('  gia\' mandati')
    return
  }
  // Chi ha cominciato una giornaliera l'ha giocata: una partita in corso e' gia' una scelta fatta.
  const giocate = unisci(
    GIORNALIERE.map(([id, tabella]) => `SELECT '${id}' AS gioco, player_id FROM ${tabella} WHERE puzzle_number = ${numero}`),
  )
  const righe = interroga<Destinatario & { fatte: string | null }>(
    `SELECT s.endpoint, s.p256dh, s.auth, s.player_id,
            (SELECT group_concat(DISTINCT g.gioco) FROM (${giocate}) g WHERE g.player_id = s.player_id) AS fatte
       FROM push_iscrizioni s JOIN players p ON p.id = s.player_id
      WHERE ${preferenzaSql('p.notifiche', 'promemoria')}`,
  )
  const destinatari = righe.flatMap((r) => {
    const fatte = new Set((r.fatte ?? '').split(',').filter(Boolean))
    const mancano = GIORNALIERE.filter(([id]) => !fatte.has(id)).map(([, , nome]) => nome)
    if (mancano.length === 0) return []
    const testo =
      fatte.size === 0
        ? 'Le giornaliere di oggi ti aspettano.'
        : mancano.length <= 3
          ? `Ti mancano ${mancano.join(', ').replace(/, ([^,]*)$/, ' e $1')}.`
          : `Te ne mancano ${mancano.length}.`
    return [{ a: r, messaggio: { titolo: 'Le giornaliere di oggi', testo, url: '/', tag: `promemoria-${numero}` } }]
  })
  await manda(destinatari, 3 * 3600)
}

const adesso = Date.now()
if (ESTRAZIONE) await estrazione(adesso)
else await promemoria(adesso)
