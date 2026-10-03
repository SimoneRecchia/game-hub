/**
 * Prepara il quiz: il riassunto dei dati della geografia e le domande dei
 * prossimi giorni, in D1.
 *
 * Le altre materie non hanno un riassunto in D1: i loro dati sono i file di
 * `public/dati/quiz/` (li scrive `npm run quiz:cultura`), e qui si leggono dal
 * repository per fare le domande delle giornate che sono di arte, di storia,
 * di "Accadde oggi".
 *
 * Il riassunto e' quel che serve per fare domande — paesi, capitali, confini,
 * coste, fiumi, laghi — ridotto da Wikidata e Natural Earth a un centinaio di
 * kB (vedi scripts/quiz). A parte, le linee dei fiumi e le forme dei laghi per
 * la cartina: Natural Earth le ha in file da molti mega, e qui diventano due
 * centinaia di kB semplificati. Tutto si riscrive solo se e' cambiato: di
 * solito una notte su molte. Le partite libere lo scaricano nel browser.
 *
 * Le domande della classificata si fanno qui e non nel Worker per la stessa
 * ragione del cruciverba: servono i dati interi, e i dieci millisecondi di CPU
 * di una richiesta non basterebbero a leggerli. Solo le giornate che mancano,
 * con `INSERT OR IGNORE`: le domande di un giorno, una volta scritte, non
 * cambiano piu' — sono la stessa partita per tutti. L'eccezione e' il cambio
 * di `FORMATO`: una giornata futura che nessuno ha aperto si rifà. Il seme e'
 * il numero del giorno, e i soggetti delle ultime cinque settimane della
 * stessa categoria si evitano, così la capitale della Francia non torna ogni
 * sette giorni.
 *
 *   npx vite-node scripts/genera-quiz.ts                 anteprima di oggi, senza scrivere
 *   npx vite-node scripts/genera-quiz.ts -- --local      D1 locale di wrangler
 *   npx vite-node scripts/genera-quiz.ts -- --remote     produzione
 *   … --giorni 60                                        quanti giorni da oggi
 *   … --se-manca                                         niente fonti se e' gia' tutto pronto
 *
 * `--se-manca` e' per il deploy: le fonti sono servizi di altri, e se tutto e'
 * gia' pronto non c'e' ragione di chiederle — né di fermare una pubblicazione
 * perché uno di loro non risponde.
 *
 * Qui si fanno anche le domande delle sfide di Crazy Time: trenta per ognuna
 * delle sei categorie del giorno (`ruota_domande`, `categorieDelGiorno`), con
 * lo stesso generatore e le stesse fonti, e
 * anche loro una volta scritte non cambiano — tranne quelle di un formato
 * vecchio (`FORMATO_DOMANDE_RUOTA`), che si rifanno anche per oggi: il server
 * riconosce una domanda gia' vista dalla sua impronta, non dal posto
 * nell'elenco, quindi rifare l'elenco non fa rivedere niente a nessuno.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dateForPuzzleNumber, gameDate, mulberry32, puzzleNumberFor } from '../shared/daily'
import { DOMANDE_PER_PARTITA, NOMI_CATEGORIE, NOMI_MODI, giornataDelQuiz, type CategoriaQuiz } from '../shared/quiz'
import { CATEGORIE_CULTURA, giornoDellAnno, type DatiCultura, type DatiOggi } from '../shared/quiz-cultura'
import { PARTE_REGIONI, PREFISSO_CITTA, PREFISSO_GEOMETRIE, SEZIONI_DATI, cittaInBreve, type DatiQuiz } from '../shared/quiz-dati'
import { indicizza, type DomandaCompleta } from '../shared/quiz-domande'
import { domandeDelGiornoQuiz, eCultura, generaPartita, type FontiQuiz } from '../shared/quiz-domande-cultura'
import { DOMANDE_PER_CATEGORIA, FORMATO_DOMANDE_RUOTA, categorieDelGiorno, type DomandaRuota } from '../shared/ruota'
import type { Topologia } from '../shared/topojson'
import {
  Q_ALIAS_FIUMI,
  Q_ALIAS_LAGHI,
  Q_CAPITALI,
  Q_CITTA,
  Q_CONFINI,
  Q_FIUMI,
  Q_LAGHI,
  Q_PAESI,
  Q_REGIONI_CITTA,
  Q_SENZA_MARE,
  URL_MARI,
  URL_PAESI,
  geometria,
  qAcque,
  sparql,
} from './quiz/fonti'
import { FILE_FIUMI, FILE_LAGHI, urlNaturalEarth, type RaccoltaNE } from './quiz/geometrie'
import { controllaCitta, controllaRiassunto, costruisciRiassunto, type Fonti } from './quiz/riassunto'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DB = 'game-hub-db'

/** Quanti giorni indietro guardare per non ripetere i soggetti. */
const MEMORIA_GIORNI = 35

/**
 * La forma delle domande. Una giornata di un formato vecchio, nel futuro e che
 * nessuno ha ancora aperto, si rifà: e' l'unica eccezione al "una giornata
 * scritta non cambia piu'", ed e' innocua perché nessuno l'ha vista. Il 2 e'
 * quello delle categorie con il modo — a scelta o sulla cartina — e del
 * `luogo` di ogni domanda, che la cartina mostra a risposta data; il 3 quello
 * delle altre materie, con il calendario che passa da tutte e la scheda che
 * insegna; il 4 quello di "Accadde oggi" che chiede sempre l'anno. Il 4 rifà
 * solo le giornate di "Accadde oggi" (`formatoMinimo`): quelle delle altre
 * categorie scritte col 3 sono già come le farebbe adesso.
 */
const FORMATO = 4

/** Il formato sotto il quale una giornata di una categoria va rifatta. */
const formatoMinimo = (categoria: CategoriaQuiz) => (categoria === 'oggi' ? 4 : 3)
/** Lo stesso, in SQL, sulla colonna `categoria` di `quiz_giornate`. */
const FORMATO_MINIMO = `CASE WHEN categoria = 'oggi' THEN 4 ELSE 3 END`

/** Un pezzo di geometrie per riga, sotto i cento kB di una istruzione di D1. */
const PEZZO_MASSIMO = 90_000

const argomenti = process.argv.slice(2)
function argomento(nome: string, predefinito: string): string {
  const i = argomenti.indexOf(`--${nome}`)
  return i >= 0 ? argomenti[i + 1] : predefinito
}
const REMOTO = argomenti.includes('--remote')
const LOCALE = argomenti.includes('--local')
const SCRIVE = REMOTO || LOCALE
const GIORNI = Number(argomento('giorni', REMOTO ? '60' : '14'))
const DA = Number(argomento('da', String(puzzleNumberFor(gameDate()))))
const SE_MANCA = argomenti.includes('--se-manca')

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

function semeDelGiorno(numero: number): number {
  return (0x7a1c_0de5 ^ Math.imul(numero, 0x9e37_79b1)) >>> 0
}

/** Il seme delle domande di una categoria della ruota, in un giorno: diverso da quello della classificata. */
function semeDellaRuota(numero: number, categoria: CategoriaQuiz): number {
  let h = 0x5eed_4a7a ^ Math.imul(numero, 0x85eb_ca6b)
  for (const c of categoria) h = Math.imul(h ^ c.charCodeAt(0), 0x0100_0193)
  return h >>> 0
}

/** Le categorie della ruota di un giorno che hanno gia' le loro domande, del formato di adesso. */
const ruotaPronta = (numero: number, fatte: ReadonlySet<string>) =>
  categorieDelGiorno(numero).every((c) => fatte.has(`${numero}:${c}`))

/** Una giornata che si puo' rifare: nel futuro, di un formato vecchio, e che nessuno ha aperto. */
const DA_RIFARE = (numero: number) =>
  `puzzle_number = ${numero} AND formato < ${FORMATO_MINIMO} AND puzzle_number > ${DA}
   AND NOT EXISTS (SELECT 1 FROM quiz_partite p WHERE p.puzzle_number = ${numero})`

/* ───────────────────────────────  I dati  ─────────────────────────────── */

if (SCRIVE && SE_MANCA) {
  const [giornate] = interroga<{ n: number }>(
    `SELECT COUNT(*) AS n FROM quiz_giornate g
      WHERE puzzle_number >= ${DA} AND puzzle_number < ${DA + GIORNI}
        AND (formato >= ${FORMATO_MINIMO} OR puzzle_number = ${DA}
             OR EXISTS (SELECT 1 FROM quiz_partite p WHERE p.puzzle_number = g.puzzle_number))`,
  )
  const [sezioni] = interroga<{ n: number; geo: number; citta: number }>(
    `SELECT SUM(CASE WHEN parte IN (${SEZIONI_DATI.map(cita).join(', ')}) THEN 1 ELSE 0 END) AS n,
            SUM(CASE WHEN parte LIKE '${PREFISSO_GEOMETRIE}%' THEN 1 ELSE 0 END) AS geo,
            SUM(CASE WHEN parte LIKE '${PREFISSO_CITTA}%' THEN 1 ELSE 0 END) AS citta
       FROM quiz_dati`,
  )
  const ruota = new Set(
    interroga<{ puzzle_number: number; materia: string }>(
      `SELECT puzzle_number, materia FROM ruota_domande
        WHERE puzzle_number >= ${DA} AND puzzle_number < ${DA + GIORNI} AND formato >= ${FORMATO_DOMANDE_RUOTA}`,
    ).map((r) => `${r.puzzle_number}:${r.materia}`),
  )
  const pronto =
    giornate.n === GIORNI &&
    Array.from({ length: GIORNI }, (_, i) => DA + i).every((n) => ruotaPronta(n, ruota)) &&
    sezioni.n === SEZIONI_DATI.length &&
    sezioni.geo > 0 &&
    sezioni.citta > 0
  if (pronto) {
    console.log(`Quiz: le ${GIORNI} giornate, Crazy Time, il riassunto, le geometrie e le città ci sono già`)
    process.exit(0)
  }
}

console.log('Quiz: le fonti')
/*
 * Le query una dopo l'altra: QLever risponde in pochi secondi, ma a dieci
 * richieste insieme risponde "troppe richieste". I file di Natural Earth
 * arrivano da jsDelivr, e quelli si possono chiedere insieme.
 */
const raccolte = async <F extends string>(file: readonly F[]) =>
  Object.fromEntries(await Promise.all(file.map(async (f) => [f, await geometria<RaccoltaNE>(urlNaturalEarth(f))]))) as Record<
    F,
    RaccoltaNE
  >
const geometrieNE = Promise.all([
  geometria<Topologia>(URL_PAESI),
  geometria<Fonti['mari']>(URL_MARI),
  raccolte(FILE_FIUMI),
  raccolte(FILE_LAGHI),
])
const paesi = await sparql('paesi', Q_PAESI)
const capitali = await sparql('capitali', Q_CAPITALI)
const confini = await sparql('confini', Q_CONFINI)
const citta = await sparql('citta', Q_CITTA)
const regioniCitta = await sparql('regioni-citta', Q_REGIONI_CITTA)
const fiumi = await sparql('fiumi', Q_FIUMI)
const laghi = await sparql('laghi', Q_LAGHI)
const senzaMare = await sparql('senza-mare', Q_SENZA_MARE)
const aliasFiumi = await sparql('alias-fiumi', Q_ALIAS_FIUMI)
const aliasLaghi = await sparql('alias-laghi', Q_ALIAS_LAGHI)
const [topologia, mari, fileFiumi, fileLaghi] = await geometrieNE
const idAcque = [
  ...new Set(mari.features.map((f) => String(f.properties.wikidataid ?? '')).filter((q) => /^Q\d+$/.test(q))),
]
const acque = await sparql('acque', qAcque(idAcque))

const riassunto = costruisciRiassunto({
  paesi,
  capitali,
  confini,
  citta,
  regioniCitta,
  fiumi,
  laghi,
  senzaMare,
  aliasFiumi,
  aliasLaghi,
  acque,
  topologia,
  mari,
  fileFiumi,
  fileLaghi,
})

const { dati, geometrie } = riassunto

const impronta = (testo: string) => createHash('sha1').update(testo).digest('hex').slice(0, 10)

/**
 * Un oggetto a pezzi, uno per riga di D1, ognuno sotto il limite di una
 * istruzione: `prefisso0`, `prefisso1`… Si uniscono togliendo le graffe.
 */
function aPezzi(prefisso: string, voci: Record<string, unknown>): Array<{ parte: string; json: string }> {
  const pezzi: Array<{ parte: string; json: string }> = []
  let corrente: Record<string, unknown> = {}
  let lunghezza = 2
  const chiudi = () => {
    if (Object.keys(corrente).length === 0) return
    pezzi.push({ parte: `${prefisso}${pezzi.length}`, json: JSON.stringify(corrente) })
    corrente = {}
    lunghezza = 2
  }
  for (const [id, valore] of Object.entries(voci)) {
    const voce = JSON.stringify(valore).length + id.length + 4
    if (lunghezza + voce > PEZZO_MASSIMO) chiudi()
    corrente[id] = valore
    lunghezza += voce
  }
  chiudi()
  return pezzi
}

/**
 * Le geometrie e le città a pezzi. Ognuna ha la sua versione, l'impronta del
 * tutto, e le versioni stanno anche nel riassunto: se cambiano, cambia la
 * versione del riassunto, e il browser lo sa.
 */
const pezziGeo = [
  ...aPezzi(`${PREFISSO_GEOMETRIE}fiumi:`, geometrie.fiumi),
  ...aPezzi(`${PREFISSO_GEOMETRIE}laghi:`, geometrie.laghi),
]
const regioni = Object.fromEntries(riassunto.citta.filter((c) => c.r && c.rn).map((c) => [c.r!, c.rn!]))
const pezziCitta = [
  { parte: PARTE_REGIONI, json: JSON.stringify(regioni) },
  ...aPezzi(PREFISSO_CITTA, Object.fromEntries(riassunto.citta.map((c) => [c.id, cittaInBreve(c)]))),
]
const versioneDi = (pezzi: Array<{ parte: string; json: string }>) =>
  impronta(pezzi.map((p) => `${p.parte}\n${p.json}`).join('\n'))
const versioneGeo = versioneDi(pezziGeo)
const versioneCitta = versioneDi(pezziCitta)
dati.geo = versioneGeo
dati.citta = versioneCitta

const problemi = [...controllaRiassunto(dati), ...controllaCitta(riassunto.citta)]
if (problemi.length > 0) {
  console.error(`Il riassunto non torna:\n  ${problemi.join('\n  ')}`)
  process.exit(1)
}

/** Ogni sezione in JSON, e una versione che cambia solo se cambia il contenuto. */
const sezioni = Object.fromEntries(
  SEZIONI_DATI.map((s) => [s, JSON.stringify(dati[s])]),
) as Record<(typeof SEZIONI_DATI)[number], string>
const versione = impronta([...SEZIONI_DATI.map((s) => sezioni[s]), versioneGeo, versioneCitta].join('\n'))
dati.versione = versione
console.log(
  `  ${dati.paesi.length} paesi, ${dati.acque.length} acque, ${dati.fiumi.length} fiumi, ${dati.laghi.length} laghi` +
    ` — ${SEZIONI_DATI.map((s) => `${s} ${Math.round(sezioni[s].length / 1024)} kB`).join(', ')}`,
)
const peso = (pezzi: Array<{ json: string }>) => Math.round(pezzi.reduce((n, p) => n + p.json.length, 0) / 1024)
console.log(
  `  geometrie: ${Object.keys(geometrie.fiumi).length} fiumi e ${Object.keys(geometrie.laghi).length} laghi, ` +
    `${pezziGeo.length} righe, ${peso(pezziGeo)} kB (${versioneGeo})`,
)
console.log(`  città: ${riassunto.citta.length}, ${pezziCitta.length} righe, ${peso(pezziCitta)} kB (${versioneCitta})`)

const istruzioni: string[] = []
const adesso = new Date().toISOString()

if (SCRIVE) {
  const salvate = interroga<{ parte: string; versione: string }>('SELECT parte, versione FROM quiz_dati')
  const salvata = salvate.find((r) => r.parte === 'paesi')?.versione
  if (salvata === versione) {
    console.log(`  il riassunto e' lo stesso (${versione}): non lo riscrivo`)
  } else {
    for (const s of SEZIONI_DATI) {
      istruzioni.push(
        `INSERT OR REPLACE INTO quiz_dati (parte, versione, dati, updated_at) VALUES (${cita(s)}, ${cita(versione)}, ${cita(sezioni[s])}, ${cita(adesso)});`,
      )
    }
    console.log(`  riassunto nuovo: ${salvata ?? 'nessuno'} → ${versione}`)
  }
  for (const [nome, prefisso, pezzi, nuova] of [
    ['geometrie', PREFISSO_GEOMETRIE, pezziGeo, versioneGeo],
    ['città', PREFISSO_CITTA, pezziCitta, versioneCitta],
  ] as const) {
    const vecchia = salvate.find((r) => r.parte.startsWith(prefisso))?.versione
    if (vecchia === nuova) {
      console.log(`  ${nome}: le stesse (${nuova}), non le riscrivo`)
      continue
    }
    istruzioni.push(`DELETE FROM quiz_dati WHERE parte LIKE '${prefisso}%';`)
    for (const p of pezzi) {
      istruzioni.push(
        `INSERT INTO quiz_dati (parte, versione, dati, updated_at) VALUES (${cita(p.parte)}, ${cita(nuova)}, ${cita(p.json)}, ${cita(adesso)});`,
      )
    }
    console.log(`  ${nome} nuove: ${vecchia ?? 'nessuna'} → ${nuova}`)
  }
}

/* ─────────────────────────────  Le giornate  ───────────────────────────── */

const ix = indicizza(dati as DatiQuiz)

/** I file delle altre materie, dal repository: sono gli stessi che il browser scarica per le libere. */
const CARTELLA_CULTURA = join(ROOT, 'public', 'dati', 'quiz')
function leggiJson<T>(file: string): T {
  if (!existsSync(file)) {
    console.error(`  manca ${file}: prima npm run quiz:cultura`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(file, 'utf8')) as T
}
const cultura: Partial<Omit<DatiCultura, 'oggi'>> = {}
function fontiDelGiorno(categoria: CategoriaQuiz, data: string): FontiQuiz {
  if (!eCultura(categoria)) return { geo: ix }
  if (categoria === 'oggi') {
    return { oggi: leggiJson<DatiOggi>(join(CARTELLA_CULTURA, 'oggi', `${giornoDellAnno(data)}.json`)) }
  }
  const c = categoria as Exclude<(typeof CATEGORIE_CULTURA)[number], 'oggi'>
  ;(cultura as Record<string, unknown>)[c] ??= leggiJson(join(CARTELLA_CULTURA, `${c}.json`))
  return { cultura }
}
const esistenti = new Map<number, { categoria: CategoriaQuiz; formato: number; giocata: boolean; domande: DomandaCompleta[] }>()
if (SCRIVE) {
  for (const r of interroga<{ puzzle_number: number; categoria: CategoriaQuiz; formato: number; giocata: number; domande: string }>(
    `SELECT g.puzzle_number, g.categoria, g.formato, g.domande,
            EXISTS (SELECT 1 FROM quiz_partite p WHERE p.puzzle_number = g.puzzle_number) AS giocata
       FROM quiz_giornate g
      WHERE g.puzzle_number >= ${DA - MEMORIA_GIORNI} AND g.puzzle_number < ${DA + GIORNI}`,
  )) {
    esistenti.set(r.puzzle_number, {
      categoria: r.categoria,
      formato: r.formato,
      giocata: r.giocata === 1,
      domande: JSON.parse(r.domande),
    })
  }
}
/** Una giornata resta com'e' se e' di oggi o del passato, se e' del formato giusto, o se qualcuno l'ha aperta. */
const resta = (numero: number) => {
  const g = esistenti.get(numero)
  return !!g && (numero <= DA || g.formato >= formatoMinimo(g.categoria) || g.giocata)
}
const giaFatte = [...esistenti.keys()].filter((n) => n >= DA && resta(n)).length
console.log(`Quiz: le giornate dal ${DA} al ${DA + GIORNI - 1}, ${giaFatte} già pronte`)

for (let numero = DA; numero < DA + GIORNI; numero += 1) {
  if (resta(numero)) continue
  const giornata = giornataDelQuiz(numero)
  const evitare = new Set<string>()
  for (let prima = numero - MEMORIA_GIORNI; prima < numero; prima += 1) {
    const g = esistenti.get(prima)
    if (g?.categoria === giornata.categoria) for (const d of g.domande) evitare.add(d.soggetto)
  }
  const data = dateForPuzzleNumber(numero)
  const domande = domandeDelGiornoQuiz(
    fontiDelGiorno(giornata.categoria, data),
    giornata,
    data,
    mulberry32(semeDelGiorno(numero)),
    evitare,
  )
  if (domande.length !== DOMANDE_PER_PARTITA) {
    console.error(`  #${numero} (${giornata.categoria}, ${giornata.modo}): solo ${domande.length} domande su ${DOMANDE_PER_PARTITA}`)
    process.exit(1)
  }
  if (esistenti.has(numero)) istruzioni.push(`DELETE FROM quiz_giornate WHERE ${DA_RIFARE(numero)};`)
  esistenti.set(numero, { categoria: giornata.categoria, formato: FORMATO, giocata: false, domande })
  istruzioni.push(
    'INSERT OR IGNORE INTO quiz_giornate (puzzle_number, categoria, domande, created_at, formato) VALUES (' +
      [numero, cita(giornata.categoria), cita(JSON.stringify(domande)), cita(adesso), FORMATO].join(', ') +
      ');',
  )
  console.log(
    `  #${numero} ${NOMI_CATEGORIE[giornata.categoria]} · ${NOMI_MODI[giornata.modo]}: ${domande.map((d) => d.risposta).join(', ')}`,
  )
  if (!SCRIVE) {
    for (const d of domande) {
      const opzioni = d.opzioni.map((o) => (o.id === d.giusta ? `[${o.testo}]` : o.testo)).join(' · ')
      console.log(`     ${d.testo}  ${opzioni || `→ ${d.risposta} (${d.cartina?.strato})`}`)
    }
    break
  }
}

/* ──────────────────────────  Le domande di Crazy Time  ─────────────────────────── */

/**
 * Per ogni giorno e ognuna delle sei categorie della sua ruota
 * (`categorieDelGiorno`), `DOMANDE_PER_CATEGORIA` domande a scelta: a chi gira
 * e cade su quella categoria ne tocca una che quel giorno non ha ancora avuto.
 * Non ripetono i soggetti della classificata dello stesso giorno — una sfida
 * non deve svelare il quiz di oggi — ne' quelli della stessa categoria dei
 * giorni appena prima (`MEMORIA_RUOTA`: una categoria non torna mai il giorno
 * dopo, e cosi' le domande della sua volta prima si evitano tutte). Sono fra le
 * piu' note, come al livello facile: una sfida deve essere di chi sa, non di
 * chi ha studiato la Filocalia.
 */
const MEMORIA_RUOTA = 3
const ruotaFatte = new Map<string, DomandaRuota[]>()
const chiaveRuota = (numero: number, categoria: string) => `${numero}:${categoria}`
if (SCRIVE) {
  // La colonna si chiama ancora `materia`, e porta la categoria (vedi server/lib/ruotaStore.ts).
  for (const r of interroga<{ puzzle_number: number; materia: string; domande: string; formato: number }>(
    `SELECT puzzle_number, materia, domande, formato FROM ruota_domande
      WHERE puzzle_number >= ${DA - MEMORIA_RUOTA} AND puzzle_number < ${DA + GIORNI}`,
  )) {
    // Una riga di un formato vecchio, da oggi in poi, e' da rifare: per i giorni prima conta come memoria.
    if (r.formato >= FORMATO_DOMANDE_RUOTA || r.puzzle_number < DA) {
      ruotaFatte.set(chiaveRuota(r.puzzle_number, r.materia), JSON.parse(r.domande))
    }
  }
}
const ruotaMancanti = (numero: number) =>
  categorieDelGiorno(numero).filter((c) => !ruotaFatte.has(chiaveRuota(numero, c)))
const ruotaDaFare = Array.from({ length: GIORNI }, (_, i) => ruotaMancanti(DA + i).length).reduce((a, b) => a + b, 0)
const ruotaTutte = GIORNI * categorieDelGiorno(DA).length
console.log(
  `Crazy Time: le domande dal ${DA} al ${DA + GIORNI - 1}, ` +
    `${ruotaTutte - ruotaDaFare} categorie su ${ruotaTutte} già pronte`,
)
for (let numero = DA; numero < (SCRIVE ? DA + GIORNI : DA + 1); numero += 1) {
  const data = dateForPuzzleNumber(numero)
  for (const categoria of ruotaMancanti(numero)) {
    const evitare = new Set((esistenti.get(numero)?.domande ?? []).map((d) => d.soggetto))
    for (let prima = numero - MEMORIA_RUOTA; prima < numero; prima += 1) {
      for (const d of ruotaFatte.get(chiaveRuota(prima, categoria)) ?? []) evitare.add(d.domanda.soggetto)
    }
    const caso = mulberry32(semeDellaRuota(numero, categoria))
    const domande: DomandaRuota[] = []
    for (let prova = 0; domande.length < DOMANDE_PER_CATEGORIA && prova < DOMANDE_PER_CATEGORIA * 4; prova += 1) {
      const [domanda] = generaPartita(
        fontiDelGiorno(categoria, data),
        { categoria, modo: 'scelta', area: 'mondo', quante: 1, data, notorieta: 'noti' },
        caso,
        evitare,
      )
      // Lo stesso soggetto non basta: "un'unita' di misura della massa" puo' tornare con un altro chilogrammo.
      const doppia = (d: DomandaRuota) => d.domanda.testo === domanda?.testo && d.domanda.giusta === domanda?.giusta
      if (!domanda || domande.some(doppia)) continue
      evitare.add(domanda.soggetto)
      domande.push({ categoria, domanda })
    }
    if (domande.length === 0) {
      console.error(`  #${numero} ${categoria}: nessuna domanda`)
      process.exit(1)
    }
    if (domande.length < DOMANDE_PER_CATEGORIA) console.log(`  #${numero} ${categoria}: ${domande.length} domande`)
    ruotaFatte.set(chiaveRuota(numero, categoria), domande)
    // REPLACE solo per le righe di un formato vecchio: quelle nuove qui non arrivano, perché non mancano.
    istruzioni.push(
      'INSERT OR REPLACE INTO ruota_domande (puzzle_number, materia, domande, created_at, formato) VALUES (' +
        [numero, cita(categoria), cita(JSON.stringify(domande)), cita(adesso), FORMATO_DOMANDE_RUOTA].join(', ') +
        ');',
    )
    if (!SCRIVE) {
      for (const { domanda: d } of domande) {
        const opzioni = d.opzioni.map((o) => (o.id === d.giusta ? `[${o.testo}]` : o.testo)).join(' · ')
        console.log(`  ruota ${categoria}: ${d.testo}  ${opzioni}`)
      }
    }
  }
}

if (SCRIVE && istruzioni.length > 0) {
  const cartella = join(HERE, '.cache')
  mkdirSync(cartella, { recursive: true })
  const file = join(cartella, 'quiz.sql')
  writeFileSync(file, istruzioni.join('\n'))
  const parametri = [`--file=${file}`]
  if (REMOTO) parametri.push('--yes')
  console.log(`  scrivo ${istruzioni.length} righe su ${REMOTO ? 'PRODUZIONE' : 'locale'}…`)
  wrangler(parametri)
}
