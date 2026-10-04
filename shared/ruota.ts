/**
 * Crazy Time: la ruota dei punti di oggi. Si punta quanto si vuole dei punti
 * della giornata, quante volte si vuole, e come al casinò la puntata si paga
 * subito: quel che esce la restituisce moltiplicata, o se la tiene il banco.
 *
 * Quindici spicchi:
 *
 * - **il banco**, sette: vince il banco, la puntata e' persa;
 * - **il triplo**, uno: la puntata torna per tre, subito;
 * - **il quiz**, tre: si gira la ruota del quiz, che si ferma su una categoria
 *   con il suo moltiplicatore, e si risponde. Giusta, la puntata torna
 *   moltiplicata; sbagliata, vince il banco, qualunque sia il moltiplicatore;
 * - **la moneta**, tre: blu vince la puntata per il moltiplicatore che porta la
 *   moneta, rosso vince il banco;
 * - **la fortuna**, uno: la ruota diventa la ruota fortunata, e si rigira con
 *   la stessa puntata.
 *
 * La ruota fortunata e' la stessa ruota con i premi saliti, spicchio per
 * spicchio: il triplo diventa ×10 e la fortuna ×5, dei sette banchi due restano,
 * due diventano ×3 e tre diventano quiz; il quiz e la moneta restano dove sono,
 * ma da li' portano i moltiplicatori della fortuna.
 *
 * La ruota del quiz ha dodici spicchi, e ognuno ha una categoria e un
 * moltiplicatore. I moltiplicatori stanno fermi: ×1,25 tre volte, ×1,5 tre,
 * ×1,75 due, ×2 due, ×3 uno e ×4 uno. Le categorie le pesca il server a ogni
 * giro, dodici fra le quattordici che hanno ancora domande da dare a chi gira.
 * Dalla ruota fortunata ogni moltiplicatore sale (`FORTUNATO`), fino al ×10.
 *
 * Come nei giochi veri vince il banco: chi risponde giusto a tutte le domande
 * riceve in media 97 punti ogni 100 puntati, quanto alla roulette, e chi
 * sbaglia ne riceve meno: 86 chi ne sbaglia una su quattro, 63 chi tira a
 * indovinare. Si puo' avere fortuna una volta; giocando a lungo si perde. Un
 * test misura la resa, con gli arrotondamenti, per chi sa, per chi sta in mezzo
 * e per chi tira a indovinare.
 *
 * Si perde al massimo la puntata, e si punta al massimo quel che si ha oggi: il
 * totale della giornata non va mai sotto zero, e i giorni passati non si
 * toccano.
 *
 * Questo file e' di tutti: il server ci decide l'esito, il browser ci disegna
 * le ruote e ci scrive le regole.
 */

import { mulberry32 } from './daily'
import { NOMI_CATEGORIE, type CategoriaQuiz } from './quiz'
import type { DomandaCompleta } from './quiz-domande'

/** Il nome del gioco, come lo leggono tutti. */
export const NOME_CRAZY_TIME = 'Crazy Time'

export type Spicchio =
  | { tipo: 'banco' }
  | { tipo: 'moneta' }
  | { tipo: 'quiz' }
  | { tipo: 'fortuna' }
  | { tipo: 'fisso'; moltiplicatore: number }

export type TipoSpicchio = Spicchio['tipo']

/** Il triplo della ruota: la puntata torna moltiplicata subito, senza minigioco. */
export const MOLTIPLICATORE_FISSO = 3

/** I due lati della moneta: il blu vince, il rosso e' del banco. */
export type LatoMoneta = 'blu' | 'rosso'

/** La puntata piu' bassa: con meno, la vincita piu' piccola (×1,25) non darebbe nemmeno un punto. */
export const PUNTATA_MINIMA = 10

/** Fra un giro e l'altro: la ruota impiega qualche secondo a fermarsi, e chi gira con un programma va fermato. */
export const INTERVALLO_GIRI_MS = 3_000

/**
 * La disposizione delle ruote, salvata con ogni giro: un giro di una
 * disposizione vecchia ha l'indice di uno spicchio che oggi e' un altro, e non
 * si mostra. La 4 e' quella con la fortuna e il quiz: chi cambia la ruota, la
 * ruota fortunata o i moltiplicatori della ruota del quiz la deve cambiare.
 */
export const DISPOSIZIONE_RUOTA = 4

const BANCO: Spicchio = { tipo: 'banco' }
const QUIZ: Spicchio = { tipo: 'quiz' }
const MONETA: Spicchio = { tipo: 'moneta' }
const FORTUNA: Spicchio = { tipo: 'fortuna' }
const PER = (moltiplicatore: number): Spicchio => ({ tipo: 'fisso', moltiplicatore })

/**
 * La ruota, dallo spicchio in cima in senso orario: il triplo in cima, dove la
 * ruota sta prima del primo giro; un banco ogni due spicchi, mai due vicini;
 * i tre quiz da una parte e le tre monete dall'altra, con la fortuna in mezzo,
 * di fronte al triplo. Lo controlla un test.
 */
export const SPICCHI_RUOTA: readonly Spicchio[] = [
  PER(MOLTIPLICATORE_FISSO), BANCO, QUIZ, BANCO, QUIZ, BANCO, QUIZ, BANCO,
  FORTUNA, BANCO, MONETA, BANCO, MONETA, BANCO, MONETA,
]

/**
 * La ruota fortunata: la stessa, con i premi saliti dove stanno. Il triplo e'
 * ×10 e la fortuna ×5; dei banchi restano quello dopo il primo quiz e quello
 * prima della fortuna, due diventano ×3 e tre diventano quiz, così due quiz non
 * si toccano mai nemmeno qui. Il quiz e la moneta di questa ruota portano i
 * moltiplicatori della fortuna.
 */
export const SPICCHI_FORTUNATI: readonly Spicchio[] = [
  PER(10), PER(3), QUIZ, BANCO, QUIZ, PER(3), QUIZ, BANCO,
  PER(5), QUIZ, MONETA, QUIZ, MONETA, QUIZ, MONETA,
]

/** Gli spicchi della ruota normale o di quella fortunata: hanno gli stessi posti. */
export const spicchiDi = (fortunata: boolean): readonly Spicchio[] => (fortunata ? SPICCHI_FORTUNATI : SPICCHI_RUOTA)

/** Dove sta la fortuna sulla ruota: e' li' che la ruota e' ferma quando diventa fortunata. */
export const POSTO_FORTUNA = SPICCHI_RUOTA.findIndex((s) => s.tipo === 'fortuna')

/** Uno spicchio che apre un minigioco, o la ruota fortunata: l'esito si sa solo dopo. */
export function eSfida(s: Spicchio): s is Extract<Spicchio, { tipo: 'moneta' | 'quiz' | 'fortuna' }> {
  return s.tipo === 'moneta' || s.tipo === 'quiz' || s.tipo === 'fortuna'
}

/**
 * La ruota del quiz, dallo spicchio in cima in senso orario: il ×4 in cima,
 * mai due moltiplicatori uguali vicini. Le categorie degli spicchi cambiano a
 * ogni giro (`categorieDelQuiz`); i moltiplicatori no.
 */
export const MOLTIPLICATORI_QUIZ: readonly number[] = [4, 1.25, 1.5, 1.75, 1.25, 2, 1.5, 3, 1.25, 1.75, 1.5, 2]

/** Quanti spicchi ha la ruota del quiz. */
export const SPICCHI_QUIZ = MOLTIPLICATORI_QUIZ.length

/**
 * Come sale un moltiplicatore della ruota del quiz quando ci si arriva dalla
 * ruota fortunata: ognuno di un gradino, il ×3 a ×5 e il ×4 a ×10.
 */
export const FORTUNATO: Readonly<Record<string, number>> = {
  '1.25': 1.5,
  '1.5': 2,
  '1.75': 2.5,
  '2': 3,
  '3': 5,
  '4': 10,
}

/** La ruota del quiz della fortuna: gli stessi posti, con i moltiplicatori saliti. */
export const MOLTIPLICATORI_QUIZ_FORTUNATI: readonly number[] = MOLTIPLICATORI_QUIZ.map((m) => FORTUNATO[String(m)])

export const moltiplicatoriQuiz = (fortunata: boolean): readonly number[] =>
  fortunata ? MOLTIPLICATORI_QUIZ_FORTUNATI : MOLTIPLICATORI_QUIZ

/** I moltiplicatori che puo' portare il blu della moneta: uno a caso, tutti con la stessa probabilita'. */
export const MOLTIPLICATORI_MONETA: readonly number[] = [1.25, 1.5, 2, 3]

/** La moneta della ruota fortunata: il blu paga di piu', il rosso e' sempre del banco. */
export const MOLTIPLICATORI_MONETA_FORTUNATA: readonly number[] = [2, 3, 4, 5]

export const moltiplicatoriMoneta = (fortunata: boolean): readonly number[] =>
  fortunata ? MOLTIPLICATORI_MONETA_FORTUNATA : MOLTIPLICATORI_MONETA

/**
 * Le categorie delle domande: quelle della classificata del quiz, sette di
 * geografia e sette delle altre materie. Manca "Accadde oggi": i fatti di un
 * giorno solo non bastano a trenta domande.
 */
export const CATEGORIE_RUOTA_GEOGRAFIA: readonly CategoriaQuiz[] = [
  'capitali', 'bandiere', 'stati', 'fiumi', 'mari', 'laghi', 'oceani',
]
export const CATEGORIE_RUOTA_ALTRE: readonly CategoriaQuiz[] = [
  'arte', 'storia', 'scienza', 'libri', 'cinema', 'nobel', 'lirica',
]
export const CATEGORIE_RUOTA: readonly CategoriaQuiz[] = [...CATEGORIE_RUOTA_GEOGRAFIA, ...CATEGORIE_RUOTA_ALTRE]

/** Mescola sul posto con il caso dato: un intero fra zero e `n` escluso. */
function mescola<T>(xs: T[], caso: (n: number) => number): T[] {
  for (let i = xs.length - 1; i > 0; i -= 1) {
    const j = caso(i + 1)
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return xs
}

/**
 * Le dodici categorie della ruota del quiz, dallo spicchio in cima: a caso fra
 * quelle che hanno ancora domande da dare (`disponibili`). Se sono meno di
 * dodici si ripetono, ognuna lo stesso numero di volte o quasi, e se sono
 * almeno due, due spicchi vicini non hanno mai la stessa categoria — le piu'
 * ripetute vanno negli spicchi pari e le altre nei dispari, poi la ruota fa un
 * giro a caso, così la prima non finisce sempre sul ×4. Senza categorie,
 * niente ruota.
 *
 * `caso` e' quello del server, un intero fra zero e `n` escluso: qui non si
 * sceglie niente da soli.
 */
export function categorieDelQuiz(disponibili: readonly CategoriaQuiz[], caso: (n: number) => number): CategoriaQuiz[] {
  const tutte = mescola([...new Set(disponibili)], caso)
  if (tutte.length === 0) return []
  const scelte = Array.from({ length: SPICCHI_QUIZ }, (_, i) => tutte[i % tutte.length])
  const volte = new Map<CategoriaQuiz, number>()
  for (const c of scelte) volte.set(c, (volte.get(c) ?? 0) + 1)
  const inFila = [...volte].sort((a, b) => b[1] - a[1]).flatMap(([c, n]) => Array<CategoriaQuiz>(n).fill(c))
  const meta = SPICCHI_QUIZ / 2
  const posti = Array.from({ length: SPICCHI_QUIZ }, (_, i) => (i < meta ? 2 * i : 2 * (i - meta) + 1))
  const ruota = new Array<CategoriaQuiz>(SPICCHI_QUIZ)
  inFila.forEach((c, i) => {
    ruota[posti[i]] = c
  })
  const giro = caso(SPICCHI_QUIZ)
  return ruota.map((_, i) => ruota[(i + giro) % SPICCHI_QUIZ])
}

/* ─────────────────────────  Le categorie della slot  ───────────────────────── */

/** Quante categorie di ogni gruppo escono ogni giorno: tre di geografia e tre delle altre. */
const PER_GRUPPO = 3

function semeDellaRuota(numero: number): number {
  return (0x6c7a_0ce5 ^ Math.imul(numero, 0x2c1b_3c6d)) >>> 0
}

/** Tre categorie a caso fra le quattro che ieri non c'erano. */
function scegliDopo(gruppo: readonly CategoriaQuiz[], ieri: readonly CategoriaQuiz[], caso: () => number) {
  const libere = gruppo.filter((c) => !ieri.includes(c))
  for (let i = libere.length - 1; i > 0; i -= 1) {
    const j = Math.floor(caso() * (i + 1))
    ;[libere[i], libere[j]] = [libere[j], libere[i]]
  }
  return libere.slice(0, PER_GRUPPO)
}

/** L'ultimo giorno calcolato da `categorieDelGiorno`, con le sue categorie. */
let calcolato: { n: number; geografia: CategoriaQuiz[]; altre: CategoriaQuiz[] } = { n: 0, geografia: [], altre: [] }

/**
 * Le sei categorie di un giorno: le domande dei punti di domanda della slot.
 * Tre di geografia e tre delle altre materie, alternate, e nessuna di quelle
 * del giorno prima. Erano anche gli spicchi delle domande della ruota di prima,
 * e il calendario e' rimasto quello: parte dal primo giorno di gioco e procede
 * un giorno alla volta, perché ogni giorno dipende da quello prima, ed e' lo
 * stesso per il server e per il browser. Costa mezzo microsecondo a giorno, e
 * l'ultimo giorno calcolato resta (`calcolato`): il server chiede quasi sempre
 * oggi, e non riparte dal primo.
 */
export function categorieDelGiorno(numero: number): CategoriaQuiz[] {
  const fino = Math.max(1, numero)
  let { n, geografia, altre } = calcolato.n <= fino ? calcolato : { n: 0, geografia: [], altre: [] }
  while (n < fino) {
    n += 1
    const caso = mulberry32(semeDellaRuota(n))
    geografia = scegliDopo(CATEGORIE_RUOTA_GEOGRAFIA, geografia, caso)
    altre = scegliDopo(CATEGORIE_RUOTA_ALTRE, altre, caso)
  }
  calcolato = { n, geografia, altre }
  return geografia.flatMap((g, i) => [g, altre[i]])
}

/* ───────────────────────────────  I conti  ─────────────────────────────── */

/**
 * Quel che restituisce una puntata vinta: la puntata per il moltiplicatore, per
 * difetto, come al banco. Si conta in centesimi: 1,25 × 13 non deve diventare
 * 16,249999.
 */
export function vincitaDi(puntata: number, moltiplicatore: number): number {
  return Math.floor((puntata * Math.round(moltiplicatore * 100)) / 100)
}

/** Quel che un giro da' o toglie alla giornata: la vincita meno la puntata, o la puntata persa. */
export function deltaDi(puntata: number, moltiplicatore: number | null): number {
  return moltiplicatore === null ? -puntata : vincitaDi(puntata, moltiplicatore) - puntata
}

/** "+120", "−105", "0": con il segno meno tipografico. */
export function conSegno(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0'
}

/** "×1,25", "×2": con la virgola, come si scrive in italiano. */
export function scriviMoltiplicatore(m: number): string {
  return `×${String(m).replace('.', ',')}`
}

/** Il nome di una categoria dove lo spazio e' poco: "Nobel" e non "Premi Nobel". */
export function nomeSullaRuota(c: CategoriaQuiz): string {
  return c === 'nobel' ? 'Nobel' : NOMI_CATEGORIE[c]
}

/** Come si scrive uno spicchio sulla ruota: "BANCO", "QUIZ", "×3". */
export function etichettaDi(s: Spicchio): string {
  switch (s.tipo) {
    case 'banco':
      return 'BANCO'
    case 'moneta':
      return 'MONETA'
    case 'quiz':
      return 'QUIZ'
    case 'fortuna':
      return 'FORTUNA'
    case 'fisso':
      return scriviMoltiplicatore(s.moltiplicatore)
  }
}

/** I moltiplicatori fissi per nome: il triplo, il quintuplo, il decuplo. */
const NOMI_FISSI: Record<number, string> = { 3: 'Triplo', 5: 'Quintuplo', 10: 'Decuplo' }

/** Come lo legge chi non vede, e come lo dice il risultato: "Banco", "Quiz", "Triplo". */
export function nomeDi(s: Spicchio): string {
  switch (s.tipo) {
    case 'banco':
      return 'Banco'
    case 'moneta':
      return 'Moneta'
    case 'quiz':
      return 'Quiz'
    case 'fortuna':
      return 'Fortuna'
    case 'fisso':
      return NOMI_FISSI[s.moltiplicatore] ?? scriviMoltiplicatore(s.moltiplicatore)
  }
}

const media = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/**
 * Quanto vale in media uno spicchio, in volte la puntata, per chi risponde
 * giusto con probabilita' `giusta`: la moneta e' blu una volta su due, e la
 * fortuna vale quanto la ruota fortunata.
 */
export function valoreDi(s: Spicchio, fortunata: boolean, giusta: number): number {
  switch (s.tipo) {
    case 'banco':
      return 0
    case 'fisso':
      return s.moltiplicatore
    case 'moneta':
      return media(moltiplicatoriMoneta(fortunata)) / 2
    case 'quiz':
      return giusta * media(moltiplicatoriQuiz(fortunata))
    case 'fortuna':
      return media(SPICCHI_FORTUNATI.map((f) => valoreDi(f, true, giusta)))
  }
}

/**
 * Quanto restituisce in media la ruota per ogni punto puntato, per chi risponde
 * giusto a una domanda con probabilita' `s`. Senza gli arrotondamenti delle
 * vincite, che possono solo abbassarla.
 */
export function resa(s: number): number {
  return media(SPICCHI_RUOTA.map((x) => valoreDi(x, false, s)))
}

/** Se una puntata si puo' fare con il saldo di oggi: un intero, fra la minima e tutto il saldo. */
export function puntataValida(puntata: unknown, saldo: number): puntata is number {
  return Number.isInteger(puntata) && (puntata as number) >= PUNTATA_MINIMA && (puntata as number) <= saldo
}

/* ──────────────────────────────  Le domande  ────────────────────────────── */

/**
 * Quante domande si preparano per ogni categoria, ogni giorno: a chi gira ne
 * tocca una che quel giorno non ha ancora visto. Si gira quanto si vuole, e
 * una categoria sta su quasi tutte le ruote del quiz ma esce uno spicchio su
 * dodici: trenta bastano a qualche centinaio di giri, e stanno in una riga di
 * D1 (una domanda d'arte, la piu' lunga, pesa un chilobyte).
 */
export const DOMANDE_PER_CATEGORIA = 30

/**
 * Il formato delle domande della ruota: le righe di un formato vecchio si
 * rifanno. Il 2 era di trenta domande per materia, il 3 per le sei categorie
 * del giorno, il 4 per tutte le quattordici, ogni giorno.
 */
export const FORMATO_DOMANDE_RUOTA = 4

/** Una domanda della ruota, come la scrive lo script della notte: con la sua categoria, per l'emblema della carta. */
export interface DomandaRuota {
  categoria: CategoriaQuiz
  domanda: DomandaCompleta
}

/**
 * L'impronta di una domanda, per non farla rivedere a chi l'ha gia' avuta quel
 * giorno: il testo e la risposta giusta, in un FNV-1a a 32 bit. Non l'indice
 * nell'elenco, che cambierebbe se l'elenco del giorno si rifacesse.
 */
export function improntaDomanda(d: Pick<DomandaCompleta, 'testo' | 'giusta'>): string {
  let h = 0x811c9dc5
  for (const c of `${d.testo}|${d.giusta}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193)
  return (h >>> 0).toString(16).padStart(8, '0')
}
