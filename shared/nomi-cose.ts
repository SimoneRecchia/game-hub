/**
 * Nomi, cose e città: una lettera, cinque categorie, e per ognuna una parola
 * che comincia con quella lettera, prima che finisca il tempo.
 *
 * La classificata e' una al giorno, la stessa per tutti: la lettera viene da
 * giri di diciannove giorni (`letteraDelGiorno`), le cinque categorie si
 * pescano ogni giorno fra quelle che con quella lettera hanno abbastanza
 * parole (`categorieDelGiorno`). Il tempo parte quando si comincia, e la
 * lettera la si vede solo allora.
 *
 * Una risposta vale se il lessico della sua categoria la conosce
 * (`riconosci`): elenchi costruiti dal Wikizionario e da Wikidata
 * (scripts/genera-lessico-nomi.ts), una lettera per file. Si accetta anche con
 * l'articolo davanti, al plurale o al femminile: "le arance" e' "arancia".
 *
 * I punti si fanno alla fine della giornata, quando si conoscono le risposte
 * di tutti, e valgono nella classifica del giorno dopo. Una risposta valida
 * vale di piu' quanto meno l'hanno data gli altri, e non zero quando l'hanno
 * data in tanti: la rarita' e' il logaritmo di quanti giocatori l'hanno
 * scritta rispetto a quanti hanno giocato (`rarita`), quindi con due
 * giocatori e con cinquemila una risposta che ha scritto solo uno vale il
 * massimo, una che hanno scritto tutti il minimo, e in mezzo la scala
 * dipende dalla proporzione. Il tempo moltiplica: consegnare subito vale
 * tutto, all'ultimo secondo tre quarti (`fattoreTempo`). Quindici punti per
 * aver giocato, da quattro a nove per ogni risposta valida: sessanta al
 * massimo, il tetto del gioco (shared/punti.ts).
 */

import { mulberry32 } from './daily'

/** Le lettere del gioco: niente H, J, K, Q, W, X, Y, con cui le categorie resterebbero vuote. */
export const LETTERE_NOMI = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'i',
  'l',
  'm',
  'n',
  'o',
  'p',
  'r',
  's',
  't',
  'u',
  'v',
  'z',
] as const
export type LetteraNomi = (typeof LETTERE_NOMI)[number]

export type CategoriaNomi =
  | 'nomi'
  | 'cose'
  | 'citta'
  | 'animali'
  | 'piante'
  | 'frutta'
  | 'cibi'
  | 'mestieri'
  | 'paesi'
  | 'acque'
  | 'sport'
  | 'strumenti'
  | 'colori'
  | 'vestiti'
  | 'corpo'
  | 'verbi'
  | 'aggettivi'

/** Le categorie, in ordine: il nome, e un esempio per chi non ha capito che cosa chiede. */
export const CATEGORIE_NOMI: Readonly<Record<CategoriaNomi, { nome: string; esempio: string }>> = {
  nomi: { nome: 'Nomi', esempio: 'Anna, Bruno' },
  cose: { nome: 'Cose', esempio: 'armadio, bottiglia' },
  citta: { nome: 'Città', esempio: 'Ancona, Berlino' },
  animali: { nome: 'Animali', esempio: 'aquila, balena' },
  piante: { nome: 'Piante e fiori', esempio: 'abete, begonia' },
  frutta: { nome: 'Frutta e verdura', esempio: 'albicocca, broccolo' },
  cibi: { nome: 'Cibi e piatti', esempio: 'arrosto, biscotto' },
  mestieri: { nome: 'Mestieri', esempio: 'architetto, barbiere' },
  paesi: { nome: 'Paesi del mondo', esempio: 'Austria, Brasile' },
  acque: { nome: 'Fiumi, laghi e mari', esempio: 'Adige, Baltico' },
  sport: { nome: 'Sport', esempio: 'atletica, baseball' },
  strumenti: { nome: 'Strumenti musicali', esempio: 'arpa, batteria' },
  colori: { nome: 'Colori', esempio: 'azzurro, bianco' },
  vestiti: { nome: 'Abbigliamento', esempio: 'anello, berretto' },
  corpo: { nome: 'Parti del corpo', esempio: 'ascella, braccio' },
  verbi: { nome: 'Verbi', esempio: 'amare, bere' },
  aggettivi: { nome: 'Aggettivi', esempio: 'alto, bello' },
}

export const TUTTE_LE_CATEGORIE = Object.keys(CATEGORIE_NOMI) as CategoriaNomi[]

/** Le categorie di una partita. */
export const CATEGORIE_PER_PARTITA = 5

/** Le parole che una categoria deve avere con una lettera per uscire con quella lettera. */
export const PAROLE_MINIME = 12

/** Il tempo di una partita, da quando si comincia. */
export const SECONDI_NOMI = 180
export const TEMPO_NOMI_MS = SECONDI_NOMI * 1_000

/** Quanti caratteri si possono scrivere in una risposta. */
export const LUNGHEZZA_MASSIMA_RISPOSTA = 40

/**
 * Quanto il server aspetta oltre il tempo, per la rete, come nel quiz: la
 * consegna partita all'ultimo secondo arriva un po' dopo.
 */
export const MARGINE_NOMI_MS = 3_000

/* ─────────────────────────────  Le risposte  ─────────────────────────────── */

/**
 * Il testo di una risposta per confrontarla: minuscolo, senza accenti, senza
 * spazi, apostrofi e trattini. "Sant'Agata" e "santagata" sono la stessa.
 */
export function normalizza(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Gli articoli che si tolgono davanti: "il gatto" vale "gatto". */
const ARTICOLO = /^\s*(?:(?:il|lo|la|i|gli|le|un|uno|una)\s+|(?:l|un|dell|all|nell)\s*['’]\s*)/i

/** Le parole che stanno davanti al nome di un'acqua e non ne fanno parte: "il lago di Garda" e' "Garda". */
const DAVANTI_ACQUE = new RegExp(
  '^\\s*(?:(?:il|lo|la|l[\'’])\\s*)?(?:fiume|torrente|lago|laghi|mar|mare|oceano|golfo|canale|stretto)\\s+' +
    '(?:(?:di|del|della|dello|dei|degli|delle|d[\'’])\\s*)?',
  'i',
)

/** La risposta senza articolo davanti, cosi' com'e' scritta. */
export function senzaArticolo(testo: string): string {
  return testo.replace(ARTICOLO, '')
}

/**
 * Le forme al singolare e al maschile che una parola puo' avere, se e' un
 * plurale o un femminile: "arance" puo' essere "arancia", "maestre"
 * "maestra" e "maestro", "pittrice" "pittore". Sono solo candidati: vale
 * quello che il lessico conosce.
 */
export function formeBase(parola: string): string[] {
  const forme = new Set<string>()
  const piu = (radice: string, ...finali: string[]) => {
    for (const f of finali) if (radice.length >= 2) forme.add(radice + f)
  }
  const via = (n: number) => parola.slice(0, parola.length - n)
  if (parola.endsWith('chi')) piu(via(3), 'co', 'ca')
  if (parola.endsWith('ghi')) piu(via(3), 'go', 'ga')
  if (parola.endsWith('che')) piu(via(3), 'ca')
  if (parola.endsWith('ghe')) piu(via(3), 'ga')
  if (parola.endsWith('ci')) piu(via(2), 'co', 'cio', 'ce')
  if (parola.endsWith('gi')) piu(via(2), 'go', 'gio', 'ge')
  if (parola.endsWith('ce')) piu(via(2), 'cia', 'ca')
  if (parola.endsWith('ge')) piu(via(2), 'gia', 'ga')
  if (parola.endsWith('ie')) piu(via(2), 'ia')
  if (parola.endsWith('i')) piu(via(1), 'o', 'e', 'a', 'io')
  if (parola.endsWith('e')) piu(via(1), 'a', 'o')
  if (parola.endsWith('trice')) piu(via(5), 'tore')
  if (parola.endsWith('trici')) piu(via(5), 'tore')
  if (parola.endsWith('essa')) piu(via(4), 'e', 'o', 'a')
  if (parola.endsWith('esse')) piu(via(4), 'e', 'o', 'essa')
  if (parola.endsWith('a')) piu(via(1), 'o', 'e')
  forme.delete(parola)
  return [...forme]
}

/**
 * Le forme in cui cercare una risposta nel lessico, dalla piu' fedele: come
 * e' scritta, senza articolo, senza "lago di" per le acque, e poi al
 * singolare e al maschile. Tutte normalizzate.
 */
export function candidati(testo: string, categoria: CategoriaNomi): string[] {
  const scritti = [testo, senzaArticolo(testo)]
  if (categoria === 'acque') scritti.push(testo.replace(DAVANTI_ACQUE, ''))
  const visti = new Set<string>()
  const ordine: string[] = []
  const aggiungi = (forma: string) => {
    if (forma && !visti.has(forma)) {
      visti.add(forma)
      ordine.push(forma)
    }
  }
  const pieni = scritti.map(normalizza).filter(Boolean)
  for (const p of pieni) aggiungi(p)
  for (const p of pieni) for (const f of formeBase(p)) aggiungi(f)
  return ordine
}

/** Il lessico di una lettera come lo legge il gioco: per categoria, le forme normalizzate. */
export type LessicoNomi = ReadonlyMap<CategoriaNomi, ReadonlySet<string>>

/** Il file di una lettera, come sta in public/dati/nomi-cose. */
export interface FileLessicoNomi {
  versione: string
  lettera: LetteraNomi
  categorie: Partial<Record<CategoriaNomi, string[]>>
  /**
   * Le parole note di ogni categoria, come le scriverebbe una persona
   * ("Ancona", "dente di leone"), dalle piu' comuni: il computer della libera
   * scrive queste.
   */
  note?: Partial<Record<CategoriaNomi, string[]>>
}

/** Il lessico di un file, di tutte le categorie o solo di quelle che servono: il Worker ne usa cinque. */
export function lessicoDa(file: FileLessicoNomi, solo?: readonly CategoriaNomi[]): LessicoNomi {
  const m = new Map<CategoriaNomi, ReadonlySet<string>>()
  for (const [c, parole] of Object.entries(file.categorie) as Array<[CategoriaNomi, string[]]>) {
    if (!solo || solo.includes(c)) m.set(c, new Set(parole))
  }
  return m
}

/**
 * La forma con cui il lessico conosce una risposta, o null se non la conosce
 * o non comincia con la lettera. E' anche la forma con cui si contano le
 * risposte uguali: "le arance" e "arancia" sono la stessa risposta.
 */
export function riconosci(
  lessico: LessicoNomi,
  categoria: CategoriaNomi,
  lettera: string,
  testo: string,
): string | null {
  const parole = lessico.get(categoria)
  if (!parole || testo.length > LUNGHEZZA_MASSIMA_RISPOSTA) return null
  for (const forma of candidati(testo, categoria)) {
    if (forma.startsWith(lettera) && parole.has(forma)) return forma
  }
  return null
}

/* ─────────────────────────────  I punti  ─────────────────────────────── */

/** Quel che vale aver giocato: almeno una risposta scritta. */
export const BASE_NOMI = 15
/** Una risposta valida che non ha scritto nessun altro. */
export const PUNTI_RARA = 9
/** Una risposta valida che hanno scritto tutti. */
export const PUNTI_COMUNE = 4
/** Quanto toglie il tempo, al massimo: consegnare all'ultimo secondo vale tre quarti. */
export const PESO_TEMPO = 0.25

/**
 * Quanto e' rara una risposta fra i giocatori del giorno, da 0 (l'hanno
 * scritta tutti) a 1 (solo uno): il logaritmo di quanti hanno giocato su
 * quanti l'hanno scritta, rispetto al logaritmo di quanti hanno giocato. Con
 * mille giocatori dieci risposte uguali sono ancora rare (2/3), cinquecento
 * no (1/10); con tre giocatori due risposte uguali stanno a un terzo.
 */
export function rarita(uguali: number, giocatori: number): number {
  if (giocatori <= 1 || uguali <= 1) return 1
  const k = Math.min(uguali, giocatori)
  return Math.log(giocatori / k) / Math.log(giocatori)
}

/** I punti di una risposta valida, prima del tempo. */
export function puntiRisposta(uguali: number, giocatori: number): number {
  return PUNTI_COMUNE + (PUNTI_RARA - PUNTI_COMUNE) * rarita(uguali, giocatori)
}

/** Il moltiplicatore del tempo: 1 a consegna immediata, tre quarti a tempo scaduto. */
export function fattoreTempo(tempoMs: number): number {
  return 1 - PESO_TEMPO * Math.min(1, Math.max(0, tempoMs) / TEMPO_NOMI_MS)
}

/**
 * I punti di una partita: la base, se ha scritto almeno una risposta, piu'
 * le risposte valide, ognuna per la sua rarita', tutte per il tempo.
 * `uguali` e' null per una risposta non valida o vuota.
 */
export function puntiNomi(
  risposte: ReadonlyArray<{ scritta: boolean; uguali: number | null }>,
  giocatori: number,
  tempoMs: number,
): number {
  if (!risposte.some((r) => r.scritta)) return 0
  const tempo = fattoreTempo(tempoMs)
  const valide = risposte.reduce((s, r) => s + (r.uguali === null ? 0 : puntiRisposta(r.uguali, giocatori)), 0)
  return Math.round(BASE_NOMI + valide * tempo)
}

/** Il massimo: tutte le risposte valide e rare, consegnate subito. */
export const MASSIMO_NOMI = BASE_NOMI + CATEGORIE_PER_PARTITA * PUNTI_RARA

/** Una risposta come la conta la notte: la forma riconosciuta, quanti l'hanno data, i punti. */
export interface RispostaContata {
  testo: string
  /** La forma con cui il lessico la conosce; null se non la conosce. */
  forma: string | null
  /** Quanti giocatori del giorno l'hanno data, lui compreso; null se non vale. */
  uguali: number | null
  /** I punti della risposta, tempo compreso, con un decimale. */
  punti: number
}

/** Una partita da contare: le risposte scritte e il tempo della consegna. */
export interface PartitaDaContare {
  id: string
  risposte: Partial<Record<CategoriaNomi, string>>
  tempoMs: number
  /**
   * Le forme riconosciute alla consegna, se il server le ha scritte: valgono
   * quelle, perché sono quel che il giocatore ha visto valere, anche se nel
   * frattempo il lessico e' cambiato.
   */
  forme?: Partial<Record<CategoriaNomi, string | null>> | null
}

export interface PartitaContata {
  id: string
  punti: number
  risposte: Partial<Record<CategoriaNomi, RispostaContata>>
}

/** Le risposte piu' date di una categoria: come le ha scritte chi le ha date di piu', e quanti. */
export type PiuDate = Partial<Record<CategoriaNomi, { testo: string; uguali: number }[]>>

/** Quante risposte piu' date si tengono per categoria, per il riassunto della giornata. */
const PIU_DATE = 3

/**
 * La giornata contata: i punti di ogni partita, quanti hanno giocato e le
 * risposte piu' date. Gioca chi ha scritto almeno una risposta; due risposte
 * sono uguali se il lessico le riconosce nella stessa forma ("le arance" e
 * "arancia"), e ognuno conta una volta.
 */
export function contaLaGiornata(
  lessico: LessicoNomi,
  lettera: string,
  categorie: readonly CategoriaNomi[],
  partite: readonly PartitaDaContare[],
): { partite: PartitaContata[]; giocatori: number; piuDate: PiuDate } {
  const testi = partite.map((p) =>
    Object.fromEntries(categorie.map((c) => [c, (p.risposte[c] ?? '').trim()])) as Record<CategoriaNomi, string>,
  )
  const forme = testi.map((t, i) => {
    const giaViste = partite[i].forme
    return Object.fromEntries(
      categorie.map((c) => {
        if (!t[c]) return [c, null]
        if (giaViste && c in giaViste) return [c, giaViste[c] ?? null]
        return [c, riconosci(lessico, c, lettera, t[c])]
      }),
    ) as Record<CategoriaNomi, string | null>
  })
  const giocatori = testi.filter((t) => categorie.some((c) => t[c] !== '')).length
  // Per categoria e per forma: quanti l'hanno data, e come l'ha scritta ognuno.
  const conti = new Map<CategoriaNomi, Map<string, string[]>>()
  for (const c of categorie) conti.set(c, new Map())
  forme.forEach((f, i) => {
    for (const c of categorie) {
      const forma = f[c]
      if (!forma) continue
      const scritte = conti.get(c)!.get(forma) ?? []
      scritte.push(senzaArticolo(testi[i][c]))
      conti.get(c)!.set(forma, scritte)
    }
  })

  const contate = partite.map((p, i): PartitaContata => {
    const tempo = fattoreTempo(p.tempoMs)
    const risposte: Partial<Record<CategoriaNomi, RispostaContata>> = {}
    const perPunti: { scritta: boolean; uguali: number | null }[] = []
    for (const c of categorie) {
      const testo = testi[i][c]
      const forma = forme[i][c]
      const uguali = forma ? conti.get(c)!.get(forma)!.length : null
      perPunti.push({ scritta: testo !== '', uguali })
      if (testo === '') continue
      const punti = uguali === null ? 0 : Math.round(puntiRisposta(uguali, giocatori) * tempo * 10) / 10
      risposte[c] = { testo, forma, uguali, punti }
    }
    return { id: p.id, punti: puntiNomi(perPunti, giocatori, p.tempoMs), risposte }
  })

  const piuDate: PiuDate = {}
  for (const c of categorie) {
    piuDate[c] = [...conti.get(c)!.values()]
      .map((scritte) => ({ testo: piuScritta(scritte), uguali: scritte.length }))
      .sort((a, b) => b.uguali - a.uguali || a.testo.localeCompare(b.testo, 'it'))
      .slice(0, PIU_DATE)
  }
  return { partite: contate, giocatori, piuDate }
}

/** Come l'hanno scritta i piu', fra le scritture di una stessa risposta: "Ancona", non "ancona". */
function piuScritta(scritte: readonly string[]): string {
  const volte = new Map<string, number>()
  for (const s of scritte) volte.set(s, (volte.get(s) ?? 0) + 1)
  return [...volte].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it'))[0][0]
}

/* ─────────────────────────────  La sfida  ─────────────────────────────── */

/**
 * I punti di una partita fra pochi, come si contano al tavolo: venti a chi e'
 * l'unico a scrivere una risposta valida in una categoria, dieci per una
 * risposta valida che nessun altro ha dato, cinque per una che ha dato anche
 * qualcun altro, zero per una sbagliata o vuota.
 */
export const PUNTI_SFIDA = { sola: 20, diversa: 10, uguale: 5 } as const

/**
 * I punti di ogni giocatore per ogni categoria, dalle forme riconosciute: una
 * riga per giocatore, una colonna per categoria, null per una risposta che non
 * vale. Due risposte sono uguali se il lessico le riconosce nella stessa forma.
 */
export function puntiSfida(forme: ReadonlyArray<ReadonlyArray<string | null>>): number[][] {
  const colonne = Math.max(0, ...forme.map((f) => f.length))
  const punti = forme.map(() => Array.from({ length: colonne }, () => 0))
  for (let c = 0; c < colonne; c += 1) {
    const valide = forme.map((f) => f[c] ?? null)
    const quante = valide.filter((v) => v !== null).length
    valide.forEach((v, g) => {
      if (v === null) return
      if (quante === 1) punti[g][c] = PUNTI_SFIDA.sola
      else punti[g][c] = valide.filter((w) => w === v).length > 1 ? PUNTI_SFIDA.uguale : PUNTI_SFIDA.diversa
    })
  }
  return punti
}

/* ─────────────────────────────  La giornata  ─────────────────────────────── */

/** Il seme di un giro di lettere. */
const semeDelGiro = (giro: number) => (0x6e6f_6d69 ^ Math.imul(giro + 1, 0x9e37_79b1)) >>> 0

/** L'ordine delle lettere di un giro: mescolate, e mai la stessa a cavallo di due giri. */
function letterePerGiro(giro: number): LetteraNomi[] {
  const ordine = [...LETTERE_NOMI]
  const rng = mulberry32(semeDelGiro(giro))
  for (let i = ordine.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[ordine[i], ordine[j]] = [ordine[j], ordine[i]]
  }
  if (giro > 0) {
    const prima = letterePerGiro(giro - 1)
    if (prima[prima.length - 1] === ordine[0]) [ordine[0], ordine[1]] = [ordine[1], ordine[0]]
  }
  return ordine
}

const giri = new Map<number, LetteraNomi[]>()

/**
 * La lettera del giorno: giri di diciannove giorni, una lettera per giorno,
 * in un ordine mescolato ogni giro. Una lettera torna dopo almeno qualche
 * giorno, e in un giro escono tutte.
 */
export function letteraDelGiorno(numero: number): LetteraNomi {
  const indice = Math.max(0, numero - 1)
  const giro = Math.floor(indice / LETTERE_NOMI.length)
  let ordine = giri.get(giro)
  if (!ordine) {
    ordine = letterePerGiro(giro)
    giri.set(giro, ordine)
  }
  return ordine[indice % LETTERE_NOMI.length]
}

/**
 * Le categorie che possono uscire con una lettera: quelle che ne hanno
 * almeno `PAROLE_MINIME`, secondo i conti del lessico.
 */
export function categorieIdonee(
  lettera: LetteraNomi,
  conti: Readonly<Record<string, Partial<Record<CategoriaNomi, number>>>>,
): CategoriaNomi[] {
  return TUTTE_LE_CATEGORIE.filter((c) => (conti[lettera]?.[c] ?? 0) >= PAROLE_MINIME)
}

/** Cinque categorie a caso fra quelle idonee, con il generatore che si passa. */
export function pescaCategorie(idonee: readonly CategoriaNomi[], rng: () => number): CategoriaNomi[] {
  const mazzo = [...idonee]
  for (let i = mazzo.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[mazzo[i], mazzo[j]] = [mazzo[j], mazzo[i]]
  }
  const scelte = mazzo.slice(0, CATEGORIE_PER_PARTITA)
  // Nell'ordine dell'elenco: i nomi prima delle cose, e le cose prima delle citta', come sul foglio.
  return scelte.sort((a, b) => TUTTE_LE_CATEGORIE.indexOf(a) - TUTTE_LE_CATEGORIE.indexOf(b))
}

/** Le categorie del giorno: pescate col seme del giorno fra le idonee alla sua lettera. */
export function categorieDelGiorno(
  numero: number,
  conti: Readonly<Record<string, Partial<Record<CategoriaNomi, number>>>>,
): CategoriaNomi[] {
  const lettera = letteraDelGiorno(numero)
  const rng = mulberry32((0x6361_7465 ^ Math.imul(numero, 0x2c1b_3c6d)) >>> 0)
  return pescaCategorie(categorieIdonee(lettera, conti), rng)
}
