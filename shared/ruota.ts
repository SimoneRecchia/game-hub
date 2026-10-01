/**
 * Crazy Time: la ruota dei punti di oggi. Si punta quanto si vuole dei punti
 * della giornata, quante volte si vuole, e la ruota decide che cosa ne resta.
 *
 * Come nei giochi veri, vince il banco: ogni spicchio da' o toglie una parte
 * della puntata, quindi il conto e' lo stesso a qualunque puntata, e in media
 * la ruota restituisce meno di quel che riceve — circa il 95% per chi risponde
 * giusto a tre domande su quattro, come il Crazy Time vero (dal 94 al 96%).
 * Si puo' avere fortuna una volta; giocando a lungo si perde.
 *
 * Ventiquattro spicchi, larghi abbastanza da leggerli su un telefono:
 *
 * - **il x2**, uno solo: raddoppia la puntata;
 * - **lo 0**, undici: lascia tutto com'e';
 * - **la ✕**, tre: la puntata e' persa;
 * - **testa o croce**, tre: indovinato il lato la puntata raddoppia,
 *   sbagliato e' persa;
 * - **le domande** del quiz, una per materia: un quarto della puntata in piu'
 *   se si risponde giusto, in meno se si sbaglia. Solo un quarto perché chi sa
 *   non batta il banco: con la puntata intera chi conosce le risposte
 *   guadagnerebbe a ogni giro, e qui nemmeno lui ci arriva (97,9%).
 *
 * Si perde al massimo la puntata, e si punta al massimo quel che si ha oggi: il
 * totale della giornata non va mai sotto zero, e i giorni passati non si
 * toccano. Un test misura la resa per chi tira a indovinare, per chi sa e per
 * chi sta in mezzo.
 *
 * Questo file e' di tutti: il server ci decide l'esito, il browser ci disegna
 * la ruota e ci scrive le regole.
 */

import type { CategoriaQuiz } from './quiz'
import type { DomandaCompleta } from './quiz-domande'

/** Il nome del gioco, come lo leggono tutti. */
export const NOME_CRAZY_TIME = 'Crazy Time'

/** Le materie delle domande sulla ruota: uno spicchio ciascuna. */
export type MateriaRuota = 'geografia' | 'storia' | 'arte' | 'libri' | 'cinema' | 'scienza'

export const MATERIE_RUOTA: readonly MateriaRuota[] = ['geografia', 'storia', 'arte', 'libri', 'cinema', 'scienza']

export const NOMI_MATERIE_RUOTA: Record<MateriaRuota, string> = {
  geografia: 'Geografia',
  storia: 'Storia',
  arte: 'Arte',
  libri: 'Libri',
  cinema: 'Cinema',
  scienza: 'Scienza',
}

export type Spicchio =
  | { tipo: 'doppio' }
  | { tipo: 'niente' }
  | { tipo: 'perdi' }
  | { tipo: 'moneta' }
  | { tipo: 'domanda'; materia: MateriaRuota }

export type LatoMoneta = 'testa' | 'croce'

/** La puntata piu' bassa: con meno, un quarto della puntata — la posta di una domanda — sarebbe zero. */
export const PUNTATA_MINIMA = 10

/** Fra un giro e l'altro: la ruota ne impiega sei a fermarsi, e chi la fa girare con un programma va fermato. */
export const INTERVALLO_GIRI_MS = 3_000

/**
 * La ruota, dallo spicchio in cima in senso orario. Il x2 sta in cima, dove la
 * ruota e' ferma prima del primo giro; gli 0 a uno sì e uno no; due spicchi
 * vicini non hanno mai lo stesso colore, e le monete e le ✕ stanno lontane fra
 * loro (lo controlla un test).
 */
const DISPOSIZIONE = [
  'x2', '0', 'geografia', '0', 'perdi', '0', 'moneta', 'storia', '0', 'arte', '0', 'perdi', '0', 'scienza', '0',
  'moneta', '0', 'libri', '0', 'perdi', 'cinema', '0', 'moneta', '0',
] as const

function spicchioDa(voce: (typeof DISPOSIZIONE)[number]): Spicchio {
  if (voce === 'x2') return { tipo: 'doppio' }
  if (voce === '0') return { tipo: 'niente' }
  if (voce === 'perdi') return { tipo: 'perdi' }
  if (voce === 'moneta') return { tipo: 'moneta' }
  return { tipo: 'domanda', materia: voce }
}

export const SPICCHI: readonly Spicchio[] = DISPOSIZIONE.map(spicchioDa)

/** Uno spicchio che apre una sfida: l'esito si sa solo dopo. */
export function eSfida(s: Spicchio): s is Extract<Spicchio, { tipo: 'moneta' | 'domanda' }> {
  return s.tipo === 'moneta' || s.tipo === 'domanda'
}

/**
 * Quanto vale una sfida su una puntata: la moneta tutta, la domanda un quarto,
 * per difetto — un quarto arrotondato per eccesso, alle puntate piccole, darebbe
 * a chi sa piu' di quel che toglie a chi sbaglia.
 */
export function postaDi(s: Spicchio, puntata: number): number {
  if (s.tipo === 'moneta') return puntata
  if (s.tipo === 'domanda') return Math.floor(puntata / 4)
  return 0
}

/** Quel che uno spicchio da' o toglie, su una puntata: per una sfida, secondo com'e' andata. */
export function deltaDi(s: Spicchio, puntata: number, vinta = false): number {
  switch (s.tipo) {
    case 'doppio':
      return puntata
    case 'niente':
      return 0
    case 'perdi':
      return -puntata
    case 'moneta':
    case 'domanda':
      return vinta ? postaDi(s, puntata) : -postaDi(s, puntata)
  }
}

/** "+120", "−105", "0": con il segno meno tipografico. */
export function conSegno(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0'
}

/** Come si scrive uno spicchio sulla ruota: "x2", "0", "✕". Le sfide hanno solo la loro icona. */
export function etichettaDi(s: Spicchio): string {
  switch (s.tipo) {
    case 'doppio':
      return 'x2'
    case 'niente':
      return '0'
    case 'perdi':
      return '✕'
    case 'moneta':
    case 'domanda':
      return ''
  }
}

/** Come lo legge chi non vede, e come lo dice il risultato: "Per due", "Persa", "Domanda di arte". */
export function nomeDi(s: Spicchio): string {
  switch (s.tipo) {
    case 'doppio':
      return 'Per due'
    case 'niente':
      return 'Niente'
    case 'perdi':
      return 'Puntata persa'
    case 'moneta':
      return 'Testa o croce'
    case 'domanda':
      return `Domanda di ${NOMI_MATERIE_RUOTA[s.materia].toLowerCase()}`
  }
}

/**
 * Quanto restituisce in media la ruota per ogni punto puntato, per chi risponde
 * giusto a una domanda con probabilita' `s`: la moneta va bene una volta su
 * due. Senza gli arrotondamenti della posta delle domande, che possono solo
 * abbassarla.
 */
export function resa(s: number): number {
  let somma = 0
  for (const sp of SPICCHI) {
    const vale = (vinta: boolean) => (sp.tipo === 'domanda' ? (vinta ? 0.25 : -0.25) : deltaDi(sp, 1, vinta))
    if (sp.tipo === 'domanda') somma += s * vale(true) + (1 - s) * vale(false)
    else if (sp.tipo === 'moneta') somma += (vale(true) + vale(false)) / 2
    else somma += vale(false)
  }
  return 1 + somma / SPICCHI.length
}

/** Se una puntata si puo' fare con il saldo di oggi: un intero, fra la minima e tutto il saldo. */
export function puntataValida(puntata: unknown, saldo: number): puntata is number {
  return Number.isInteger(puntata) && (puntata as number) >= PUNTATA_MINIMA && (puntata as number) <= saldo
}

/**
 * Le categorie del quiz da cui vengono le domande di ogni materia della ruota.
 * La geografia le ha tutte tranne le città, come la classificata: le città di
 * un paese lontano non le sa nessuno.
 */
export const CATEGORIE_DELLA_MATERIA: Record<MateriaRuota, readonly CategoriaQuiz[]> = {
  geografia: ['capitali', 'bandiere', 'stati', 'mari', 'oceani', 'fiumi', 'laghi'],
  storia: ['storia'],
  arte: ['arte'],
  libri: ['libri'],
  cinema: ['cinema'],
  scienza: ['scienza'],
}

/**
 * Quante domande si preparano per ogni materia, ogni giorno: a chi gira ne
 * tocca una che quel giorno non ha ancora visto. Si gira quanto si vuole, e una
 * domanda su quattro giri: trenta per materia bastano a qualche centinaio di
 * giri, e stanno in una riga di D1 (una domanda d'arte, la piu' lunga, pesa un
 * chilobyte).
 */
export const DOMANDE_PER_MATERIA = 30

/** Il formato delle domande della ruota: le righe di un formato vecchio si rifanno (erano cinque per materia). */
export const FORMATO_DOMANDE_RUOTA = 2

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
