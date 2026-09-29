/**
 * Il go: le regole, le coordinate, la posizione in testo e il conteggio.
 *
 * Le regole sono quelle scelte per un'app da telefono, dove le partite si
 * giocano a pezzi e il conteggio lo fa il programma:
 *
 *  - il goban ha 9, 13 o 19 linee (il motore ne regge da 5 a 19), e muove per
 *    primo il **Nero**;
 *  - una mossa e' una pietra su un'intersezione vuota, oppure **passare**. Le
 *    pietre dell'avversario rimaste senza libertà si tolgono, poi si guardano le
 *    proprie: il **suicidio e' vietato**, cioe' non si puo' lasciare senza
 *    libertà un proprio gruppo senza catturare niente;
 *  - **ko semplice**: chi ha appena perso una pietra sola, presa da una pietra
 *    sola che ora ha quell'unica libertà, non puo' riprenderla subito, perché
 *    rifarebbe la posizione di prima. Deve giocare altrove almeno una volta;
 *  - due passaggi di fila chiudono il gioco, e si conta.
 *
 * Il punto vietato dal ko sta nella posizione, come l'en passant nel FEN degli
 * scacchi: vale per una mossa sola e si ricava dall'ultima, quindi chi riceve
 * la posizione in testo sa gia' tutto quel che serve per dire se una mossa e'
 * legale. I cicli piu' lunghi — il triplo ko, la "vita eterna" — non si possono
 * vietare guardando una mossa indietro: li ferma la **ripetizione**. Quando la
 * stessa posizione (stesse pietre, stesso tratto) compare per la terza volta
 * la partita e' patta. Per saperlo servono tutte le posizioni di prima, perché
 * nel go non c'e' una mossa dopo cui quelle vecchie non possano tornare (una
 * cattura riapre il goban): il chiamante le tiene tutte, come chiavi. La
 * chiave e' un'impronta di Zobrist a 53 bit — un intero esatto in un numero di
 * JavaScript — scritta in base 36: undici caratteri al massimo, così le tre o
 * quattrocento posizioni di una partita a 19 stanno in pochi kB.
 *
 * Il conteggio e' **ad area**, quello delle regole cinesi: ognuno ha tanti punti
 * quante sono le sue pietre vive sul goban piu' le intersezioni vuote che
 * circondano solo le sue pietre. Le pietre morte si tolgono prima di contare, e
 * il loro punto va a chi le circonda. I prigionieri non contano (si mostrano e
 * basta): con l'area riempire il proprio territorio non costa niente, e il
 * risultato non dipende da chi gioca le ultime mosse inutili o da chi si prende
 * la briga di catturare pietre gia' morte. E' anche come conta il computer alla
 * fine di ogni simulazione, quindi gioca per lo stesso punteggio. Il Bianco
 * riceve un **komi** di 7,5 punti per aver giocato per secondo: il mezzo punto
 * toglie le patte ai punti, e vince chi ne ha di piu'.
 *
 * Quali pietre sono morte non lo stabilisce con certezza nessun programma: lo
 * stima `stimaMorte` (in go-computer.ts) e i giocatori correggono la stima
 * toccando i gruppi. Qui ci sono solo il gruppo di un punto e il conteggio dato
 * l'elenco delle pietre morte.
 *
 * I punti sono numerati riga per riga dall'alto, come si disegna il goban:
 * `riga * lato + colonna`, con la riga 0 in alto e la colonna 0 a sinistra.
 * Per le persone si usano le coordinate del go: le colonne dalla A alla T senza
 * la I, le righe da 1 in basso ("D4", "K10").
 *
 * Le funzioni lavorano sulla posizione immutabile e sono pensate per il
 * server, che per ogni mossa di una partita fra amici fa `leggi`,
 * `mossaDaTesto`, `gioca`, `esito` e `chiaveRipetizione`: sul 19x19 costano
 * qualche decina di microsecondi. Il computer ha una sua rappresentazione,
 * mutabile e molto piu' veloce, in go-computer.ts.
 */

import { mulberry32 } from './daily'

export type Colore = 'nero' | 'bianco'
export type Punto = Colore | null

/** I punti del Bianco per aver giocato per secondo: con il mezzo punto non ci sono patte ai punti. */
export const KOMI = 7.5

/** I lati che l'app propone. */
export const LATI: readonly number[] = [9, 13, 19]

/** I lati che il motore accetta. */
export const LATO_MINIMO = 5
export const LATO_MASSIMO = 19

export interface Posizione {
  readonly lato: number
  /** lato*lato; indice = riga * lato + colonna; riga 0 IN ALTO, colonna 0 a sinistra. */
  readonly punti: readonly Punto[]
  readonly tratto: Colore
  /** Il punto dove il ko vieta di giocare adesso, o null. */
  readonly ko: number | null
  /** Passaggi consecutivi appena fatti: 2 chiude il gioco. */
  readonly passi: number
  /** Le pietre catturate da ciascuno finora (per mostrarle; nel conteggio ad area non contano). */
  readonly prigionieri: { readonly nero: number; readonly bianco: number }
}

export type Mossa = { readonly tipo: 'pietra'; readonly punto: number } | { readonly tipo: 'passo' }

/** Il passo: una mossa sola, sempre la stessa. */
export const PASSO: Mossa = Object.freeze({ tipo: 'passo' })

export function avversario(c: Colore): Colore {
  return c === 'nero' ? 'bianco' : 'nero'
}

export function posizioneIniziale(lato: number): Posizione {
  if (!Number.isInteger(lato) || lato < LATO_MINIMO || lato > LATO_MASSIMO) throw new Error(`Lato non valido: ${lato}`)
  return {
    lato,
    punti: Array<Punto>(lato * lato).fill(null),
    tratto: 'nero',
    ko: null,
    passi: 0,
    prigionieri: { nero: 0, bianco: 0 },
  }
}

/* ─────────────────────────────  La geometria  ───────────────────────────── */

/** Per ogni lato, i quattro vicini di ogni punto (-1 fuori dal goban): sopra, a sinistra, a destra, sotto. */
const VICINI = new Map<number, Int16Array>()

function viciniDi(lato: number): Int16Array {
  let v = VICINI.get(lato)
  if (!v) {
    v = new Int16Array(lato * lato * 4)
    for (let r = 0; r < lato; r += 1) {
      for (let c = 0; c < lato; c += 1) {
        const k = r * lato + c
        v[k * 4] = r > 0 ? k - lato : -1
        v[k * 4 + 1] = c > 0 ? k - 1 : -1
        v[k * 4 + 2] = c < lato - 1 ? k + 1 : -1
        v[k * 4 + 3] = r < lato - 1 ? k + lato : -1
      }
    }
    VICINI.set(lato, v)
  }
  return v
}

/**
 * Il gruppo che contiene la pietra in `k` e le sue libertà, ognuna contata una
 * volta sola anche se tocca piu' pietre del gruppo.
 */
function esplora(punti: readonly Punto[], lato: number, k: number): { pietre: number[]; liberta: number } {
  const v = viciniDi(lato)
  const colore = punti[k]
  // 1 = pietra del gruppo, 2 = libertà gia' contata.
  const visti = new Uint8Array(punti.length)
  const pietre = [k]
  visti[k] = 1
  let liberta = 0
  for (let i = 0; i < pietre.length; i += 1) {
    const b = pietre[i] * 4
    for (let d = 0; d < 4; d += 1) {
      const q = v[b + d]
      if (q < 0 || visti[q]) continue
      const x = punti[q]
      if (x === null) {
        visti[q] = 2
        liberta += 1
      } else if (x === colore) {
        visti[q] = 1
        pietre.push(q)
      }
    }
  }
  return { pietre, liberta }
}

/**
 * Tutti i gruppi del goban in un giro solo: per ogni punto il numero del suo
 * gruppo (-1 se e' vuoto), e per ogni gruppo le libertà. Serve quando le
 * domande sono tante — tutte le mosse legali, o una posizione da controllare —
 * e rifare il giro di un gruppo per ogni punto costerebbe il quadrato.
 */
function etichette(punti: readonly Punto[], lato: number): { gruppo: Int16Array; liberta: number[] } {
  const n = punti.length
  const v = viciniDi(lato)
  const gruppo = new Int16Array(n).fill(-1)
  // L'ultimo gruppo (piu' uno) che ha contato ogni libertà: una libertà si conta una volta per gruppo.
  const contata = new Int16Array(n)
  const coda = new Int16Array(n)
  const liberta: number[] = []
  for (let k = 0; k < n; k += 1) {
    const colore = punti[k]
    if (colore === null || gruppo[k] >= 0) continue
    const g = liberta.length
    let lib = 0
    let testa = 0
    let fine = 0
    coda[fine++] = k
    gruppo[k] = g
    while (testa < fine) {
      const b = coda[testa++] * 4
      for (let d = 0; d < 4; d += 1) {
        const q = v[b + d]
        if (q < 0) continue
        const x = punti[q]
        if (x === null) {
          if (contata[q] !== g + 1) {
            contata[q] = g + 1
            lib += 1
          }
        } else if (x === colore && gruppo[q] < 0) {
          gruppo[q] = g
          coda[fine++] = q
        }
      }
    }
    liberta.push(lib)
  }
  return { gruppo, liberta }
}

/* ─────────────────────────────  Le coordinate  ───────────────────────────── */

/** Le colonne: dalla A alla T senza la I, che si confonderebbe con la J e con l'1. */
const COLONNE = 'ABCDEFGHJKLMNOPQRST'

/** Le coordinate come si scrivono nel go: colonne A..T senza la I, righe da 1 in basso: 'D4', 'K10'. */
export function nomePunto(punto: number, lato: number): string {
  return COLONNE[punto % lato] + String(lato - Math.floor(punto / lato))
}

export function puntoDa(nome: string, lato: number): number | null {
  if (typeof nome !== 'string') return null
  const m = /^([A-HJ-T])([1-9]\d?)$/.exec(nome.toUpperCase())
  if (!m) return null
  const colonna = COLONNE.indexOf(m[1])
  const riga = Number(m[2])
  if (colonna >= lato || riga > lato) return null
  return (lato - riga) * lato + colonna
}

/** La mossa in testo, per il server e per l'elenco: 'D4', oppure 'passo'. */
export function testoMossa(m: Mossa, lato: number): string {
  return m.tipo === 'passo' ? 'passo' : nomePunto(m.punto, lato)
}

/** La mossa LEGALE che il testo descrive, o null. Accetta anche le minuscole, e 'pass' per il passo. */
export function mossaDaTesto(p: Posizione, testo: string): Mossa | null {
  if (typeof testo !== 'string') return null
  const t = testo.trim()
  let m: Mossa
  if (/^pass(o)?$/i.test(t)) m = PASSO
  else {
    const k = puntoDa(t, p.lato)
    if (k === null) return null
    m = { tipo: 'pietra', punto: k }
  }
  return legale(p, m) ? m : null
}

/* ─────────────────────────────  Le mosse  ───────────────────────────── */

/**
 * La mossa si puo' giocare? A gioco fermo (due passi) nessuna: si conta.
 *
 * Una pietra e' legale su un punto vuoto che non sia quello del ko, se dopo la
 * cattura le resta almeno una libertà: un vicino vuoto, un gruppo proprio che
 * ha un'altra libertà oltre a questa, o un gruppo dell'avversario che questa
 * gli toglieva per ultima (e quindi si cattura).
 */
export function legale(p: Posizione, m: Mossa): boolean {
  if (p.passi >= 2) return false
  if (m.tipo === 'passo') return true
  if (m.tipo !== 'pietra') return false
  const k = m.punto
  if (!Number.isInteger(k) || k < 0 || k >= p.punti.length || p.punti[k] !== null || k === p.ko) return false
  const v = viciniDi(p.lato)
  for (let d = 0; d < 4; d += 1) {
    const q = v[k * 4 + d]
    if (q < 0) continue
    const x = p.punti[q]
    if (x === null) return true
    const lib = esplora(p.punti, p.lato, q).liberta
    if (x === p.tratto ? lib >= 2 : lib === 1) return true
  }
  return false
}

/** Tutte le pietre legali, dal punto in alto a sinistra, e in fondo il passo; nessuna a gioco fermo. */
export function mosseLegali(p: Posizione): Mossa[] {
  if (p.passi >= 2) return []
  const { gruppo, liberta } = etichette(p.punti, p.lato)
  const v = viciniDi(p.lato)
  const mosse: Mossa[] = []
  for (let k = 0; k < p.punti.length; k += 1) {
    if (p.punti[k] !== null || k === p.ko) continue
    for (let d = 0; d < 4; d += 1) {
      const q = v[k * 4 + d]
      if (q < 0) continue
      const x = p.punti[q]
      const lib = x === null ? 0 : liberta[gruppo[q]]
      if (x === null || (x === p.tratto ? lib >= 2 : lib === 1)) {
        mosse.push({ tipo: 'pietra', punto: k })
        break
      }
    }
  }
  mosse.push(PASSO)
  return mosse
}

/** I gruppi dell'avversario che la pietra in `k` lascia senza libertà (la pietra e' gia' sul goban). */
function catturePer(punti: readonly Punto[], lato: number, k: number): number[] {
  const v = viciniDi(lato)
  const altro = avversario(punti[k]!)
  const tolte: number[] = []
  for (let d = 0; d < 4; d += 1) {
    const q = v[k * 4 + d]
    if (q < 0 || punti[q] !== altro || tolte.includes(q)) continue
    const { pietre, liberta } = esplora(punti, lato, q)
    if (liberta === 0) tolte.push(...pietre)
  }
  return tolte
}

/** Le pietre che la mossa cattura (per l'animazione): i punti tolti, in ordine. Nessuno se la mossa non e' legale. */
export function catturate(p: Posizione, m: Mossa): number[] {
  if (m.tipo !== 'pietra' || !legale(p, m)) return []
  const punti = p.punti.slice()
  punti[m.punto] = p.tratto
  return catturePer(punti, p.lato, m.punto).sort((a, b) => a - b)
}

/**
 * La posizione dopo la mossa, che deve essere legale: catture, ko, passi,
 * prigionieri e tratto. Una mossa illegale e' un errore di chi chiama.
 */
export function gioca(p: Posizione, m: Mossa): Posizione {
  if (!legale(p, m)) throw new Error('Mossa non legale')
  const altro = avversario(p.tratto)
  if (m.tipo === 'passo') {
    return { lato: p.lato, punti: p.punti, tratto: altro, ko: null, passi: p.passi + 1, prigionieri: p.prigionieri }
  }
  const punti = p.punti.slice()
  punti[m.punto] = p.tratto
  const tolte = catturePer(punti, p.lato, m.punto)
  for (const k of tolte) punti[k] = null
  // Il ko: una pietra sola presa da una pietra sola, che ora ha per unica libertà il punto appena liberato.
  // Riprenderla subito rifarebbe la posizione di prima.
  let ko: number | null = null
  if (tolte.length === 1) {
    const { pietre, liberta } = esplora(punti, p.lato, m.punto)
    if (pietre.length === 1 && liberta === 1) ko = tolte[0]
  }
  const prese = tolte.length
  return {
    lato: p.lato,
    punti,
    tratto: altro,
    ko,
    passi: 0,
    prigionieri:
      p.tratto === 'nero'
        ? { nero: p.prigionieri.nero + prese, bianco: p.prigionieri.bianco }
        : { nero: p.prigionieri.nero, bianco: p.prigionieri.bianco + prese },
  }
}

/* ─────────────────────────────  I gruppi  ───────────────────────────── */

/** Il gruppo di pietre (dello stesso colore, collegate) che contiene il punto, in ordine; vuoto se e' vuoto. */
export function gruppo(p: Posizione, punto: number): number[] {
  if (!Number.isInteger(punto) || punto < 0 || punto >= p.punti.length || p.punti[punto] === null) return []
  return esplora(p.punti, p.lato, punto).pietre.sort((a, b) => a - b)
}

/** Le libertà del gruppo che contiene il punto (per segnare l'atari); 0 per un punto vuoto. */
export function liberta(p: Posizione, punto: number): number {
  if (!Number.isInteger(punto) || punto < 0 || punto >= p.punti.length || p.punti[punto] === null) return 0
  return esplora(p.punti, p.lato, punto).liberta
}

/* ─────────────────────────────  Il testo  ───────────────────────────── */

/**
 * La posizione in testo, per il database: sei campi separati da due punti.
 *
 *     9:n:....x....o...:k-:p0:c0,0
 *
 * il lato; chi ha il tratto (n o b); i punti riga per riga dall'alto, '.' vuoto,
 * 'x' nero, 'o' bianco; il punto del ko ('k-' se non c'e', altrimenti il suo
 * indice); i passaggi consecutivi; le pietre catturate dal Nero e dal Bianco.
 * Il testo di una posizione e' uno solo: `scrivi(leggi(t)) === t`.
 */
export function scrivi(p: Posizione): string {
  let goban = ''
  for (const x of p.punti) goban += x === null ? '.' : x === 'nero' ? 'x' : 'o'
  const tratto = p.tratto === 'nero' ? 'n' : 'b'
  const ko = p.ko === null ? '-' : String(p.ko)
  return `${p.lato}:${tratto}:${goban}:k${ko}:p${p.passi}:c${p.prigionieri.nero},${p.prigionieri.bianco}`
}

const FORMATO = /^([1-9]\d?):([nb]):([.xo]+):k(-|0|[1-9]\d{0,2}):p([012]):c(0|[1-9]\d{0,5}),(0|[1-9]\d{0,5})$/

/**
 * Il testo di una posizione, o null se non e' valido: un lato fuori da 5..19,
 * un numero di punti sbagliato, caratteri sconosciuti, un gruppo senza libertà
 * (non puo' restare sul goban), un ko che nessuna cattura avrebbe lasciato.
 */
export function leggi(testo: string): Posizione | null {
  if (typeof testo !== 'string' || testo.length > 450) return null
  const m = FORMATO.exec(testo)
  if (!m) return null
  const lato = Number(m[1])
  if (lato < LATO_MINIMO || lato > LATO_MASSIMO || m[3].length !== lato * lato) return null
  const punti: Punto[] = Array.from(m[3], (ch) => (ch === '.' ? null : ch === 'x' ? 'nero' : 'bianco'))
  const tratto: Colore = m[2] === 'n' ? 'nero' : 'bianco'
  const ko = m[4] === '-' ? null : Number(m[4])
  const passi = Number(m[5])
  const { gruppo: gruppi, liberta: libere } = etichette(punti, lato)
  if (libere.includes(0)) return null
  if (ko !== null && !koPossibile(punti, lato, ko, tratto, passi, gruppi, libere)) return null
  return { lato, punti, tratto, ko, passi, prigionieri: { nero: Number(m[6]), bianco: Number(m[7]) } }
}

/**
 * Un ko puo' esserci solo subito dopo una cattura: il punto e' vuoto, tutti i
 * suoi vicini sono di chi ha appena giocato, e uno di loro e' una pietra sola
 * con quell'unica libertà (quella che ha catturato).
 */
function koPossibile(
  punti: readonly Punto[],
  lato: number,
  ko: number,
  tratto: Colore,
  passi: number,
  gruppi: Int16Array,
  libere: readonly number[],
): boolean {
  if (passi !== 0 || ko >= punti.length || punti[ko] !== null) return false
  const v = viciniDi(lato)
  const chiHaPreso = avversario(tratto)
  let catturante = false
  for (let d = 0; d < 4; d += 1) {
    const q = v[ko * 4 + d]
    if (q < 0) continue
    if (punti[q] !== chiHaPreso) return false
    if (libere[gruppi[q]] === 1 && esplora(punti, lato, q).pietre.length === 1) catturante = true
  }
  return catturante
}

/* ─────────────────────────────  La fine  ───────────────────────────── */

/**
 * I numeri dell'impronta: per ogni punto e colore una metà alta di 21 bit e una
 * bassa di 32, così lo xor delle due metà resta un intero di 53 bit esatto nei
 * numeri di JavaScript. Sono fissi, dal generatore del progetto con un seme
 * suo: le chiavi finiscono nel database, e una partita cominciata prima di un
 * aggiornamento deve riconoscere le sue posizioni anche dopo.
 */
const ZOBRIST = (() => {
  const caso = mulberry32(0x60_90_0b_a7)
  const t = new Int32Array((LATO_MASSIMO * LATO_MASSIMO * 2 + 1) * 2)
  for (let i = 0; i < t.length; i += 2) {
    t[i] = Math.floor(caso() * 0x20_0000)
    t[i + 1] = Math.floor(caso() * 0x1_0000_0000) | 0
  }
  return t
})()

/** Dove sta, nell'impronta, la coppia di numeri del tratto al Bianco. */
const ZOBRIST_BIANCO = LATO_MASSIMO * LATO_MASSIMO * 4

/**
 * La chiave della posizione per la ripetizione: le pietre e il tratto, non il
 * ko ne' i passi. Due posizioni con la stessa chiave sono la stessa posizione
 * a meno di una coincidenza su 2^53.
 */
export function chiaveRipetizione(p: Posizione): string {
  let alta = 0
  let bassa = 0
  for (let k = 0; k < p.punti.length; k += 1) {
    const x = p.punti[k]
    if (x === null) continue
    const i = (k * 2 + (x === 'nero' ? 0 : 1)) * 2
    alta ^= ZOBRIST[i]
    bassa ^= ZOBRIST[i + 1]
  }
  if (p.tratto === 'bianco') {
    alta ^= ZOBRIST[ZOBRIST_BIANCO]
    bassa ^= ZOBRIST[ZOBRIST_BIANCO + 1]
  }
  return (alta * 0x1_0000_0000 + (bassa >>> 0)).toString(36)
}

export type Fine = 'passi' | 'ripetizione'

/**
 * 'passi' = due passaggi: il gioco si ferma e si conta (il vincitore lo dice
 * `punteggio`); 'ripetizione' = la posizione e' comparsa per la terza volta,
 * ed e' patta. Null se si gioca. `chiaviPrecedenti` sono le chiavi di tutte le
 * posizioni di prima, l'iniziale compresa e l'attuale esclusa.
 */
export function esito(p: Posizione, chiaviPrecedenti: readonly string[]): Fine | null {
  if (p.passi >= 2) return 'passi'
  const chiave = chiaveRipetizione(p)
  let volte = 0
  for (const c of chiaviPrecedenti) {
    if (c === chiave) {
      volte += 1
      if (volte >= 2) return 'ripetizione'
    }
  }
  return null
}

export interface Conteggio {
  /** Pietre vive e territorio. */
  readonly nero: number
  /** Pietre vive, territorio e komi. */
  readonly bianco: number
  readonly vincitore: Colore
  /** Di chi e' ogni punto alla fine (null = di nessuno, dame o seki): per disegnare il territorio. */
  readonly proprietario: readonly Punto[]
}

/**
 * Il conteggio ad area, con le pietre in `morte` tolte prima di contare: le
 * pietre vive di ciascuno, piu' le zone vuote che toccano solo le sue pietre.
 * Una zona che tocca tutti e due i colori (le dame, le libertà in comune di un
 * seki) non e' di nessuno.
 */
export function punteggio(p: Posizione, morte: readonly number[]): Conteggio {
  const n = p.punti.length
  const v = viciniDi(p.lato)
  const punti = p.punti.slice()
  for (const k of morte) if (Number.isInteger(k) && k >= 0 && k < n) punti[k] = null
  const proprietario = Array<Punto>(n).fill(null)
  let nero = 0
  let bianco = 0
  const visti = new Uint8Array(n)
  const zona: number[] = []
  for (let k = 0; k < n; k += 1) {
    const x = punti[k]
    if (x !== null) {
      proprietario[k] = x
      if (x === 'nero') nero += 1
      else bianco += 1
      continue
    }
    if (visti[k]) continue
    zona.length = 0
    zona.push(k)
    visti[k] = 1
    // 1 se la zona tocca il Nero, 2 se tocca il Bianco.
    let tocca = 0
    for (let i = 0; i < zona.length; i += 1) {
      const b = zona[i] * 4
      for (let d = 0; d < 4; d += 1) {
        const q = v[b + d]
        if (q < 0) continue
        const y = punti[q]
        if (y === null) {
          if (!visti[q]) {
            visti[q] = 1
            zona.push(q)
          }
        } else tocca |= y === 'nero' ? 1 : 2
      }
    }
    if (tocca === 1 || tocca === 2) {
      const chi: Colore = tocca === 1 ? 'nero' : 'bianco'
      for (const q of zona) proprietario[q] = chi
      if (chi === 'nero') nero += zona.length
      else bianco += zona.length
    }
  }
  bianco += KOMI
  return { nero, bianco, vincitore: nero > bianco ? 'nero' : 'bianco', proprietario }
}
