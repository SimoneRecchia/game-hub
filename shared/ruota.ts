/**
 * Crazy Time: la ruota dei punti di oggi. Si punta quanto si vuole dei punti
 * della giornata, quante volte si vuole, e come al casinò la puntata si paga
 * subito: quel che esce la restituisce moltiplicata, o se la tiene il banco.
 *
 * Quindici spicchi:
 *
 * - **il banco**, sei: vince il banco, la puntata e' persa;
 * - **il triplo**, uno: la puntata torna per tre, subito;
 * - **le domande** del quiz, sei, una per categoria, e le categorie cambiano
 *   ogni giorno: si gira la ruota dei moltiplicatori, poi si risponde. Giusta,
 *   la puntata torna moltiplicata; sbagliata, vince il banco, qualunque sia il
 *   moltiplicatore;
 * - **la moneta**, due: blu vince la puntata per il moltiplicatore che porta la
 *   moneta, rosso vince il banco.
 *
 * La ruota dei moltiplicatori ha dodici spicchi: ×3 uno, ×2 due, ×1,5 quattro,
 * ×1,25 cinque. La moneta porta uno dei quattro, a caso.
 *
 * Come nei giochi veri vince il banco: chi risponde giusto a tutte le domande
 * riceve in media 97 punti ogni 100 puntati, quanto alla roulette, e chi
 * sbaglia meno ancora (81 a chi ne sbaglia una su quattro). Si puo' avere
 * fortuna una volta; giocando a lungo si perde. Un test misura la resa per chi
 * tira a indovinare, per chi sa e per chi sta in mezzo, con gli arrotondamenti.
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
  | { tipo: 'fisso'; moltiplicatore: number }
  | { tipo: 'domanda'; categoria: CategoriaQuiz }

export type TipoSpicchio = Spicchio['tipo']

/** Lo spicchio fisso: la puntata torna moltiplicata subito, senza minigioco. */
export const MOLTIPLICATORE_FISSO = 3

/** I due lati della moneta: il blu vince, il rosso e' del banco. */
export type LatoMoneta = 'blu' | 'rosso'

/** La puntata piu' bassa: con meno, la vincita piu' piccola (×1,25) non darebbe nemmeno un punto. */
export const PUNTATA_MINIMA = 10

/** Fra un giro e l'altro: la ruota impiega qualche secondo a fermarsi, e chi gira con un programma va fermato. */
export const INTERVALLO_GIRI_MS = 3_000

/**
 * La disposizione della ruota, salvata con ogni giro: un giro di una
 * disposizione vecchia ha l'indice di uno spicchio che oggi e' un altro, e non
 * si mostra. La 3 e' quella con il triplo e le categorie del giorno: chi
 * cambia la forma o il calendario delle categorie la deve cambiare.
 */
export const DISPOSIZIONE_RUOTA = 3

/**
 * La ruota, dallo spicchio in cima in senso orario: il triplo in cima, dove la
 * ruota sta prima del primo giro; i banchi sparsi, mai due vicini; le due
 * monete quasi una di fronte all'altra; e fra due domande c'e' sempre un altro
 * spicchio, così due categorie dello stesso colore non si toccano mai (lo
 * controlla un test). Al posto di `domanda` va una delle categorie del giorno.
 */
export const FORMA_RUOTA: readonly TipoSpicchio[] = [
  'fisso', 'domanda', 'banco', 'domanda', 'moneta', 'banco', 'domanda', 'banco',
  'domanda', 'banco', 'domanda', 'moneta', 'banco', 'domanda', 'banco',
]

/**
 * Le categorie delle domande della ruota: quelle della classificata del quiz,
 * sette di geografia e sette delle altre materie. Manca "Accadde oggi": i
 * fatti di un giorno solo non bastano a trenta domande.
 */
export const CATEGORIE_RUOTA_GEOGRAFIA: readonly CategoriaQuiz[] = [
  'capitali', 'bandiere', 'stati', 'fiumi', 'mari', 'laghi', 'oceani',
]
export const CATEGORIE_RUOTA_ALTRE: readonly CategoriaQuiz[] = [
  'arte', 'storia', 'scienza', 'libri', 'cinema', 'nobel', 'lirica',
]
export const CATEGORIE_RUOTA: readonly CategoriaQuiz[] = [...CATEGORIE_RUOTA_GEOGRAFIA, ...CATEGORIE_RUOTA_ALTRE]

/** Quante categorie di ogni gruppo vanno sulla ruota ogni giorno: tre di geografia e tre delle altre. */
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
 * Le sei categorie delle domande di un giorno, nell'ordine dei loro spicchi:
 * tre di geografia e tre delle altre materie, alternate, e nessuna di quelle
 * del giorno prima. Il calendario parte dal primo giorno di gioco e procede un
 * giorno alla volta, perché ogni giorno dipende da quello prima, ed e' lo
 * stesso per il server, il browser e lo script della notte. Costa mezzo
 * microsecondo a giorno, e l'ultimo giorno calcolato resta (`calcolato`): il
 * server chiede quasi sempre oggi, e non riparte dal primo.
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

/** Gli spicchi della ruota di un giorno, dallo spicchio in cima in senso orario. */
export function spicchiDelGiorno(numero: number): Spicchio[] {
  const categorie = categorieDelGiorno(numero)
  let prossima = 0
  return FORMA_RUOTA.map((tipo): Spicchio => {
    if (tipo === 'domanda') return { tipo, categoria: categorie[prossima++] }
    if (tipo === 'fisso') return { tipo, moltiplicatore: MOLTIPLICATORE_FISSO }
    return { tipo }
  })
}

/** Uno spicchio che apre un minigioco: l'esito si sa solo dopo. */
export function eSfida(s: Spicchio): s is Extract<Spicchio, { tipo: 'moneta' | 'domanda' }> {
  return s.tipo === 'moneta' || s.tipo === 'domanda'
}

/**
 * La ruota dei moltiplicatori, dallo spicchio in cima in senso orario: ×3 una
 * volta, ×2 due, ×1,5 quattro, ×1,25 cinque, e mai due uguali vicini.
 */
export const MOLTIPLICATORI: readonly number[] = [3, 1.25, 1.5, 1.25, 2, 1.25, 1.5, 1.25, 1.5, 2, 1.25, 1.5]

/** I moltiplicatori che puo' portare il blu della moneta: uno a caso, tutti con la stessa probabilita'. */
export const MOLTIPLICATORI_MONETA: readonly number[] = [1.25, 1.5, 2, 3]

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

/** Il nome di una categoria sulla ruota, dove lo spazio e' poco: "Nobel" e non "Premi Nobel". */
export function nomeSullaRuota(c: CategoriaQuiz): string {
  return c === 'nobel' ? 'Nobel' : NOMI_CATEGORIE[c]
}

/** Come si scrive uno spicchio sulla ruota: "BANCO", "MONETA", "×3", "CAPITALI". */
export function etichettaDi(s: Spicchio): string {
  switch (s.tipo) {
    case 'banco':
      return 'BANCO'
    case 'moneta':
      return 'MONETA'
    case 'fisso':
      return scriviMoltiplicatore(s.moltiplicatore)
    case 'domanda':
      return nomeSullaRuota(s.categoria).toUpperCase()
  }
}

/** Come lo legge chi non vede, e come lo dice il risultato: "Banco", "Moneta", "Triplo", "Domanda: Capitali". */
export function nomeDi(s: Spicchio): string {
  switch (s.tipo) {
    case 'banco':
      return 'Banco'
    case 'moneta':
      return 'Moneta'
    case 'fisso':
      return s.moltiplicatore === 3 ? 'Triplo' : scriviMoltiplicatore(s.moltiplicatore)
    case 'domanda':
      return `Domanda: ${NOMI_CATEGORIE[s.categoria]}`
  }
}

const media = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/**
 * Quanto restituisce in media la ruota per ogni punto puntato, per chi risponde
 * giusto a una domanda con probabilita' `s`: la moneta e' blu una volta su due.
 * Senza gli arrotondamenti delle vincite, che possono solo abbassarla.
 */
export function resa(s: number): number {
  let somma = 0
  for (const tipo of FORMA_RUOTA) {
    if (tipo === 'domanda') somma += s * media(MOLTIPLICATORI)
    else if (tipo === 'moneta') somma += media(MOLTIPLICATORI_MONETA) / 2
    else if (tipo === 'fisso') somma += MOLTIPLICATORE_FISSO
  }
  return somma / FORMA_RUOTA.length
}

/** Se una puntata si puo' fare con il saldo di oggi: un intero, fra la minima e tutto il saldo. */
export function puntataValida(puntata: unknown, saldo: number): puntata is number {
  return Number.isInteger(puntata) && (puntata as number) >= PUNTATA_MINIMA && (puntata as number) <= saldo
}

/**
 * Quante domande si preparano per ogni categoria del giorno: a chi gira ne
 * tocca una che quel giorno non ha ancora visto. Si gira quanto si vuole, e
 * una categoria esce un giro su quindici: trenta bastano a qualche centinaio
 * di giri, e stanno in una riga di D1 (una domanda d'arte, la piu' lunga, pesa
 * un chilobyte).
 */
export const DOMANDE_PER_CATEGORIA = 30

/**
 * Il formato delle domande della ruota: le righe di un formato vecchio si
 * rifanno. Il 2 era di trenta domande per materia, il 3 e' per categoria, con
 * le categorie del giorno.
 */
export const FORMATO_DOMANDE_RUOTA = 3

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
