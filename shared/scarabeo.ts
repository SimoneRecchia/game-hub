/**
 * Regole dello Scarabeo, condivise fra client e server.
 *
 * Qui non c'e' niente di specifico del browser né del Worker: tabellone,
 * tessere, sacchetto della giornata, validazione di una posa e punteggio sono
 * funzioni pure. Il server le usa come verita' — un punteggio calcolato dal
 * client non vale niente — e il client le usa per mostrare in anteprima quanto
 * vale una posa mentre la si compone. Essendo le stesse funzioni, i due numeri
 * non possono divergere.
 *
 * Il dizionario **non** sta qui: 261.437 parole italiane sono 2,8 MB, che non
 * entrano nel bundle del Worker (1 MiB compresso sul piano gratuito) e che
 * comunque costerebbero piu' dei 10 ms di CPU solo per costruire l'insieme a
 * ogni avvio a freddo. Sta in una tabella D1, e `validaPosa` restituisce le
 * parole formate perché sia chi la chiama a verificarle.
 */

import { mulberry32 } from './daily'

/** Lato del tabellone: quindici caselle, come il gioco da tavolo. */
export const LATO = 15
/** Riga e colonna della casella centrale, dove deve passare la prima posa. */
export const CENTRO = 7
/** Tessere sul leggio. Lo Scarabeo italiano ne usa otto, non sette. */
export const TESSERE_LEGGIO = 8

/**
 * Mosse in una giornata.
 *
 * Un limite serve, e non e' un ripiego: senza, la partita finisce quando il
 * sacchetto e' vuoto — centoventi tessere, un'ora di gioco — e due giocatori
 * che si fermano a punti diversi non sono confrontabili. Dieci mosse sono una
 * pausa caffe' e riempiono una buona parte del tabellone.
 */
export const MOSSE_PER_GIORNATA = 10

/** Bonus per aver usato tutte e otto le tessere in una mossa: e' "scarabeo". */
export const BONUS_SCARABEO = 100

/** La tessera jolly, che vale zero e prende la lettera che si vuole. */
export const JOLLY = '*'

export type Premio = 'tp' | 'dp' | 'tl' | 'dl' | 'centro'

/**
 * Il tabellone, una riga per stringa.
 *
 * Scritto per esteso invece di generato da un quadrante: dodici righe di
 * simboli si leggono e si correggono a vista, mentre una generazione per
 * simmetria nasconde l'errore dentro l'algoritmo. Le simmetrie e i conteggi
 * (8 parola tripla, 17 doppia col centro, 12 lettera tripla, 24 doppia) sono
 * verificati da un test.
 *
 *   3 = parola tripla   2 = parola doppia
 *   t = lettera tripla  d = lettera doppia   * = centro
 */
const DISEGNO = [
  '3..d...3...d..3',
  '.2...t...t...2.',
  '..2...d.d...2..',
  'd..2...d...2..d',
  '....2.....2....',
  '.t...t...t...t.',
  '..d...d.d...d..',
  '3..d...*...d..3',
  '..d...d.d...d..',
  '.t...t...t...t.',
  '....2.....2....',
  'd..2...d...2..d',
  '..2...d.d...2..',
  '.2...t...t...2.',
  '3..d...3...d..3',
] as const

const SIMBOLI: Record<string, Premio | null> = {
  '3': 'tp',
  '2': 'dp',
  t: 'tl',
  d: 'dl',
  '*': 'centro',
  '.': null,
}

/** I premi di ogni casella, indicizzati come il tabellone: `r * LATO + c`. */
export const PREMI: readonly (Premio | null)[] = DISEGNO.flatMap((riga) =>
  [...riga].map((ch) => SIMBOLI[ch] ?? null),
)

export function premioDi(r: number, c: number): Premio | null {
  return PREMI[r * LATO + c]
}

/**
 * Valore di ogni lettera.
 *
 * Sono i valori dello Scarabeo italiano: le vocali e le consonanti frequenti
 * valgono uno, e la scala sale fino alla Q. Rispetto all'inglese la H vale
 * molto (otto) perché in italiano non sta quasi mai da sola.
 */
export const VALORI: Readonly<Record<string, number>> = {
  a: 1,
  b: 5,
  c: 3,
  d: 5,
  e: 1,
  f: 5,
  g: 8,
  h: 8,
  i: 1,
  l: 3,
  m: 3,
  n: 3,
  o: 1,
  p: 5,
  q: 10,
  r: 2,
  s: 2,
  t: 2,
  u: 3,
  v: 5,
  z: 8,
}

/**
 * Quante tessere per lettera: centoventi in tutto, jolly compresi.
 *
 * Le vocali sono il 47% delle lettere, che e' quel che rende giocabile una
 * lingua piena di vocali: con la dotazione inglese il leggio si riempirebbe di
 * consonanti impossibili da collocare.
 */
export const DISTRIBUZIONE: readonly (readonly [string, number])[] = [
  ['a', 14],
  ['b', 3],
  ['c', 6],
  ['d', 3],
  ['e', 11],
  ['f', 3],
  ['g', 2],
  ['h', 2],
  ['i', 12],
  ['l', 5],
  ['m', 5],
  ['n', 5],
  ['o', 14],
  ['p', 3],
  ['q', 2],
  ['r', 6],
  ['s', 6],
  ['t', 6],
  ['u', 5],
  ['v', 3],
  ['z', 2],
  [JOLLY, 2],
]

export const TESSERE_TOTALI = 120

/** Seme del sacchetto: suo, indipendente da quello delle parole del Wordle. */
const SEME_SACCHETTO = 0x5ca2_ab30

/**
 * Il sacchetto della giornata, mescolato.
 *
 * Deterministico dal numero del puzzle, quindi **uguale per tutti** senza
 * bisogno di salvarlo: due giocatori che aprono il gioco a ore diverse pescano
 * le stesse tessere nello stesso ordine, ed e' l'unica cosa che rende
 * confrontabili due punteggi. La parola del giorno del Wordle viene invece
 * salvata, ma per un motivo che qui non esiste: quella dipende da un elenco di
 * parole che potrebbe essere rigenerato, questa da una tabella di costanti.
 */
export function sacchettoDelGiorno(puzzleNumber: number): string[] {
  return sacchettoDaSeme((SEME_SACCHETTO ^ (puzzleNumber * 0x9e37_79b9)) >>> 0)
}

/**
 * Un sacchetto mescolato da un seme qualunque: quello delle partite libere.
 *
 * E' lo stesso mescolamento del sacchetto del giorno — la giornata e' solo un
 * seme ricavato dal numero del puzzle — quindi una partita libera si rigioca
 * dalle sole mosse, esattamente come quella classificata.
 */
export function sacchettoDaSeme(seme: number): string[] {
  const tessere: string[] = []
  for (const [lettera, quante] of DISTRIBUZIONE) {
    for (let i = 0; i < quante; i += 1) tessere.push(lettera)
  }

  // Fisher-Yates col PRNG condiviso: stesso seme, stesso ordine.
  const random = mulberry32(seme >>> 0)
  for (let i = tessere.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[tessere[i], tessere[j]] = [tessere[j], tessere[i]]
  }
  return tessere
}

/**
 * La chiave del secchio del dizionario per una parola: lunghezza e prime due
 * lettere, "casa" → "4:ca".
 *
 * Il dizionario sta in D1 raggruppato così (vedi migrations/0008_scarabeo.sql
 * per il perché). Questa regola deve restare d'accordo con quella di
 * `scripts/seed-dizionario.mjs`, che scrive i secchi: se cambia, il dizionario
 * va ricaricato, e c'e' un test che fissa il formato perché il cambio non passi
 * inosservato.
 */
export function chiaveDizionario(parola: string): string {
  return `${parola.length}:${parola.slice(0, 2)}`
}

/* ─────────────────────────────  Il tabellone  ───────────────────────────── */

export interface Casella {
  /** La lettera che si legge sulla casella (per un jolly, quella scelta). */
  lettera: string
  /** true se e' un jolly: conta per la parola ma vale zero punti. */
  jolly: boolean
}

/** Il tabellone come array piatto di 225 caselle, `r * LATO + c`. */
export type Tabellone = readonly (Casella | null)[]

export interface Posa {
  r: number
  c: number
  /** La lettera da mostrare. Per un jolly e' quella scelta dal giocatore. */
  lettera: string
  jolly: boolean
}

/**
 * Una mossa registrata.
 *
 * Contiene **solo la decisione del giocatore**, non le sue conseguenze: punti e
 * parole formate si ricalcolano rigiocando le mosse, come i colori delle
 * caselle del Wordle si ricalcolano dalle parole. Salvarli vorrebbe dire solo
 * poterli avere incoerenti con le regole.
 */
export type Mossa =
  | { tipo: 'posa'; posa: Posa[] }
  | { tipo: 'passo' }
  | { tipo: 'cambio'; tessere: string[] }

export function tabelloneVuoto(): (Casella | null)[] {
  return Array.from({ length: LATO * LATO }, () => null)
}

/** Il tabellone dopo una sequenza di mosse. */
export function tabelloneDa(mosse: readonly Mossa[]): (Casella | null)[] {
  const tab = tabelloneVuoto()
  for (const mossa of mosse) {
    if (mossa.tipo !== 'posa') continue
    for (const p of mossa.posa) tab[p.r * LATO + p.c] = { lettera: p.lettera, jolly: p.jolly }
  }
  return tab
}

export interface StatoLeggio {
  /** Le tessere in mano, nell'ordine in cui sono state pescate. */
  leggio: string[]
  /** Quante tessere restano nel sacchetto. */
  restanti: number
}

/**
 * Il leggio dopo una sequenza di mosse, ricostruito dal sacchetto.
 *
 * Il leggio non si salva: e' una funzione del sacchetto della giornata (che e'
 * deterministico) e delle mosse fatte (che sono salvate). Cosi' non esiste il
 * caso in cui la riga dice una mano e le mosse ne implicano un'altra.
 *
 * Un cambio rimette le tessere **in fondo alla coda** invece di rimescolarle:
 * rimescolare richiederebbe di salvare un nuovo stato del generatore, mentre
 * la coda resta una funzione delle sole mosse. Chi cambia paga la mossa e
 * rivedra' quelle tessere solo a sacchetto quasi finito, che e' l'effetto che
 * ha anche il rimescolamento.
 */
export function leggioDa(sacchetto: readonly string[], mosse: readonly Mossa[]): StatoLeggio {
  const { leggii, restanti } = leggiiDa(sacchetto, mosse, 1)
  return { leggio: leggii[0], restanti }
}

/**
 * I leggii di una partita a piu' giocatori che pescano dallo stesso sacchetto.
 *
 * Le mosse si alternano: la mossa `i` e' del giocatore `i % giocatori`. Alla
 * partenza pesca per primo chi gioca per primo, poi gli altri, otto tessere a
 * testa — come al tavolo. Da lì valgono le stesse regole del leggio singolo: si
 * pesca dopo ogni posa e dopo ogni cambio, e le tessere cambiate tornano in
 * fondo alla coda.
 */
export function leggiiDa(
  sacchetto: readonly string[],
  mosse: readonly Mossa[],
  giocatori: number,
): { leggii: string[][]; restanti: number } {
  const coda = [...sacchetto]
  let prossima = 0
  const leggii: string[][] = Array.from({ length: giocatori }, () => [])

  const pesca = (leggio: string[]) => {
    while (leggio.length < TESSERE_LEGGIO && prossima < coda.length) {
      leggio.push(coda[prossima])
      prossima += 1
    }
  }

  const togli = (leggio: string[], tessera: string) => {
    const i = leggio.indexOf(tessera)
    if (i >= 0) leggio.splice(i, 1)
  }

  for (const leggio of leggii) pesca(leggio)
  mosse.forEach((mossa, i) => {
    const leggio = leggii[i % giocatori]
    if (mossa.tipo === 'posa') {
      for (const p of mossa.posa) togli(leggio, p.jolly ? JOLLY : p.lettera)
      pesca(leggio)
    } else if (mossa.tipo === 'cambio') {
      for (const t of mossa.tessere) {
        if (leggio.includes(t)) {
          togli(leggio, t)
          coda.push(t)
        }
      }
      pesca(leggio)
    }
  })

  return { leggii, restanti: coda.length - prossima }
}

/* ────────────────────────  Validazione e punteggio  ───────────────────── */

export type CodicePosa =
  | 'POSA_VUOTA'
  | 'TROPPE_TESSERE'
  | 'FUORI_TABELLONE'
  | 'CASELLA_OCCUPATA'
  | 'CASELLA_DOPPIA'
  | 'NON_ALLINEATA'
  | 'CON_BUCHI'
  | 'SENZA_CENTRO'
  | 'STACCATA'
  | 'PAROLA_CORTA'
  | 'LETTERA_NON_VALIDA'

export interface ParolaFormata {
  parola: string
  punti: number
  /** Le caselle che la compongono, per poterla evidenziare. */
  celle: { r: number; c: number }[]
}

export type EsitoPosa =
  | { ok: true; parole: ParolaFormata[]; punti: number; scarabeo: boolean }
  | { ok: false; codice: CodicePosa; errore: string }

function dentro(r: number, c: number): boolean {
  return r >= 0 && r < LATO && c >= 0 && c < LATO
}

/**
 * Controlla una posa e ne calcola i punti.
 *
 * Non conosce il dizionario di proposito: restituisce le parole formate e sta a
 * chi la chiama dire se esistono. Cosi' questa funzione resta pura e provabile
 * senza database, e il controllo del dizionario resta una query.
 */
export function validaPosa(
  tab: Tabellone,
  posa: readonly Posa[],
  primaMossa: boolean,
): EsitoPosa {
  const no = (codice: CodicePosa, errore: string): EsitoPosa => ({ ok: false, codice, errore })

  if (posa.length === 0) return no('POSA_VUOTA', 'Non hai posato nessuna tessera.')
  if (posa.length > TESSERE_LEGGIO) {
    return no('TROPPE_TESSERE', `Non puoi posare più di ${TESSERE_LEGGIO} tessere.`)
  }

  const viste = new Set<number>()
  for (const p of posa) {
    if (!dentro(p.r, p.c)) return no('FUORI_TABELLONE', 'Una tessera è fuori dal tabellone.')
    const i = p.r * LATO + p.c
    if (viste.has(i)) return no('CASELLA_DOPPIA', 'Due tessere sulla stessa casella.')
    viste.add(i)
    if (tab[i]) return no('CASELLA_OCCUPATA', 'Quella casella è già occupata.')
    if (!(p.lettera in VALORI)) {
      return no('LETTERA_NON_VALIDA', `"${p.lettera}" non è una lettera del gioco.`)
    }
  }

  const righe = new Set(posa.map((p) => p.r))
  const colonne = new Set(posa.map((p) => p.c))
  if (righe.size > 1 && colonne.size > 1) {
    return no('NON_ALLINEATA', 'Metti le tessere su una sola riga o colonna.')
  }

  // Una tessera sola: la si tratta come orizzontale, e la parola verticale
  // arriva comunque dalle trasversali.
  const orizzontale = righe.size === 1

  const pieno: (Casella | null)[] = [...tab]
  for (const p of posa) pieno[p.r * LATO + p.c] = { lettera: p.lettera, jolly: p.jolly }

  // Nessun buco fra la prima e l'ultima tessera posata.
  const fisso = orizzontale ? posa[0].r : posa[0].c
  const mobili = posa.map((p) => (orizzontale ? p.c : p.r))
  const da = Math.min(...mobili)
  const a = Math.max(...mobili)
  for (let k = da; k <= a; k += 1) {
    const r = orizzontale ? fisso : k
    const c = orizzontale ? k : fisso
    if (!pieno[r * LATO + c]) {
      return no('CON_BUCHI', 'Non lasciare caselle vuote fra le tessere.')
    }
  }

  if (primaMossa) {
    if (!posa.some((p) => p.r === CENTRO && p.c === CENTRO)) {
      return no('SENZA_CENTRO', 'La prima parola deve passare dalla casella centrale.')
    }
  } else {
    const attaccata = posa.some((p) =>
      [
        [p.r - 1, p.c],
        [p.r + 1, p.c],
        [p.r, p.c - 1],
        [p.r, p.c + 1],
      ].some(([r, c]) => dentro(r, c) && tab[r * LATO + c]),
    )
    if (!attaccata) {
      return no('STACCATA', 'Attacca la parola alle tessere già posate.')
    }
  }

  const nuove = new Set(posa.map((p) => p.r * LATO + p.c))

  /** Legge la parola che passa per (r,c) lungo un asse, con i suoi punti. */
  const leggi = (r: number, c: number, oriz: boolean): ParolaFormata | null => {
    let rr = r
    let cc = c
    while (dentro(oriz ? rr : rr - 1, oriz ? cc - 1 : cc) && pieno[(oriz ? rr : rr - 1) * LATO + (oriz ? cc - 1 : cc)]) {
      if (oriz) cc -= 1
      else rr -= 1
    }

    const celle: { r: number; c: number }[] = []
    let lettere = ''
    let somma = 0
    let moltiplicatore = 1

    while (dentro(rr, cc) && pieno[rr * LATO + cc]) {
      const i = rr * LATO + cc
      const casella = pieno[i]!
      lettere += casella.lettera
      celle.push({ r: rr, c: cc })

      let valore = casella.jolly ? 0 : VALORI[casella.lettera]
      // I premi valgono **solo per le caselle appena coperte**: una parola che
      // passa su una tripla già usata non la riusa, altrimenti la stessa
      // casella pagherebbe per tutta la partita.
      if (nuove.has(i)) {
        const premio = PREMI[i]
        if (premio === 'dl') valore *= 2
        else if (premio === 'tl') valore *= 3
        else if (premio === 'dp' || premio === 'centro') moltiplicatore *= 2
        else if (premio === 'tp') moltiplicatore *= 3
      }
      somma += valore

      if (oriz) cc += 1
      else rr += 1
    }

    if (lettere.length < 2) return null
    return { parola: lettere, punti: somma * moltiplicatore, celle }
  }

  const parole: ParolaFormata[] = []
  const principale = leggi(posa[0].r, posa[0].c, orizzontale)
  if (principale) parole.push(principale)
  for (const p of posa) {
    const trasversale = leggi(p.r, p.c, !orizzontale)
    if (trasversale) parole.push(trasversale)
  }

  if (parole.length === 0) {
    return no('PAROLA_CORTA', 'Una tessera da sola non forma una parola.')
  }

  const scarabeo = posa.length === TESSERE_LEGGIO
  const punti =
    parole.reduce((somma, p) => somma + p.punti, 0) + (scarabeo ? BONUS_SCARABEO : 0)

  return { ok: true, parole, punti, scarabeo }
}

/**
 * Il punteggio di una giornata, rigiocando le mosse.
 *
 * E' la funzione che il server usa per scrivere il totale e il client per
 * mostrare la cronologia: una sola definizione di "quanto vale questa partita".
 */
export interface MossaGiocata {
  numero: number
  tipo: Mossa['tipo']
  parole: string[]
  punti: number
  scarabeo: boolean
}

export function rigioca(mosse: readonly Mossa[]): {
  tabellone: (Casella | null)[]
  giocate: MossaGiocata[]
  punti: number
} {
  const tab = tabelloneVuoto()
  const giocate: MossaGiocata[] = []
  let punti = 0
  let primaMossa = true

  mosse.forEach((mossa, indice) => {
    if (mossa.tipo !== 'posa') {
      giocate.push({ numero: indice + 1, tipo: mossa.tipo, parole: [], punti: 0, scarabeo: false })
      return
    }

    const esito = validaPosa(tab, mossa.posa, primaMossa)
    for (const p of mossa.posa) tab[p.r * LATO + p.c] = { lettera: p.lettera, jolly: p.jolly }
    primaMossa = false

    if (esito.ok) {
      punti += esito.punti
      giocate.push({
        numero: indice + 1,
        tipo: 'posa',
        parole: esito.parole.map((x) => x.parola),
        punti: esito.punti,
        scarabeo: esito.scarabeo,
      })
    } else {
      // Una mossa salvata e' già stata validata quando e' stata giocata: se
      // rigiocandola non torna, e' cambiata una regola. Vale zero e non fa
      // cadere la partita.
      giocate.push({ numero: indice + 1, tipo: 'posa', parole: [], punti: 0, scarabeo: false })
    }
  })

  return { tabellone: tab, giocate, punti }
}
