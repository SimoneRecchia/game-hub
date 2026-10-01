/**
 * La ruota del giorno: una volta al giorno si punta una parte dei punti fatti
 * nelle classificate di oggi, e si gira.
 *
 * Ventiquattro spicchi, larghi abbastanza da leggerli su un telefono, di tre
 * specie:
 *
 * - **il x2**, uno solo: raddoppia la puntata. E' l'unico spicchio che guarda
 *   la puntata, ed esce un giro su ventiquattro;
 * - **niente**, otto, sparsi: lasciano tutto com'e';
 * - **le sfide**: testa o croce, e le domande del quiz, due per materia. Ognuna
 *   ha la sua posta, da dieci a cinquanta punti, quanto una partita: tanto in
 *   piu' se va bene, tanto in meno se va male. La domanda premia chi sa, la
 *   moneta nessuno.
 *
 * Si perde al massimo la posta piu' alta, e per girare servono almeno
 * altrettanti punti di oggi (`PUNTATA_MINIMA`): il totale della giornata non va
 * mai sotto zero. In media un giro vale pochi punti: dai cinque in meno di chi
 * tira a indovinare le domande ai sedici in piu' di chi le sa tutte, piu' un
 * ventiquattresimo della puntata per il x2 (un test lo misura).
 *
 * Questo file e' di tutti: il server ci decide l'esito, il browser ci disegna
 * la ruota e ci scrive le regole.
 */

import type { CategoriaQuiz } from './quiz'
import type { DomandaCompleta } from './quiz-domande'

/** Le materie delle domande sulla ruota: due spicchi ciascuna. */
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
  | { tipo: 'moneta'; posta: number }
  | { tipo: 'domanda'; materia: MateriaRuota; posta: number }

export type LatoMoneta = 'testa' | 'croce'

/**
 * La ruota, dallo spicchio in cima in senso orario. Il x2 sta in cima, dove la
 * ruota e' ferma prima del primo giro; i "niente" uno ogni tre; due spicchi
 * vicini non hanno mai lo stesso colore, e le due domande di una materia stanno
 * lontane (lo controlla un test). "arte:30" e' una domanda d'arte da trenta
 * punti.
 */
const DISPOSIZIONE = [
  'x2', '0', 'geografia:20', 'moneta:20', '0', 'arte:30', 'storia:10', '0', 'scienza:40', 'libri:20', '0', 'moneta:50',
  'cinema:30', '0', 'geografia:40', 'arte:50', '0', 'storia:30', 'libri:40', '0', 'moneta:30', 'scienza:20', '0',
  'cinema:10',
] as const

function spicchioDa(voce: (typeof DISPOSIZIONE)[number]): Spicchio {
  if (voce === 'x2') return { tipo: 'doppio' }
  if (voce === '0') return { tipo: 'niente' }
  const [nome, posta] = voce.split(':')
  if (nome === 'moneta') return { tipo: 'moneta', posta: Number(posta) }
  return { tipo: 'domanda', materia: nome as MateriaRuota, posta: Number(posta) }
}

export const SPICCHI: readonly Spicchio[] = DISPOSIZIONE.map(spicchioDa)

/** Uno spicchio che apre una sfida: l'esito si sa solo dopo. */
export function eSfida(s: Spicchio): s is Extract<Spicchio, { tipo: 'moneta' | 'domanda' }> {
  return s.tipo === 'moneta' || s.tipo === 'domanda'
}

/** La posta piu' alta di una sfida: quanto si puo' perdere al massimo in un giro. */
export const POSTA_MASSIMA = Math.max(...SPICCHI.map((s) => (eSfida(s) ? s.posta : 0)))

/** La puntata piu' bassa, e i punti di oggi che servono per girare: quanto toglie la sfida piu' cara. */
export const PUNTATA_MINIMA = 50

/** Quel che uno spicchio da' o toglie, su una puntata: per una sfida, secondo com'e' andata. */
export function deltaDi(s: Spicchio, puntata: number, vinta = false): number {
  switch (s.tipo) {
    case 'doppio':
      return puntata
    case 'niente':
      return 0
    case 'moneta':
    case 'domanda':
      return vinta ? s.posta : -s.posta
  }
}

/** "+120", "−105", "0": con il segno meno tipografico. */
export function conSegno(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0'
}

/** Come si scrive uno spicchio sulla ruota: "x2", "0", e la posta delle sfide, accanto alla loro icona. */
export function etichettaDi(s: Spicchio): string {
  switch (s.tipo) {
    case 'doppio':
      return 'x2'
    case 'niente':
      return '0'
    case 'moneta':
    case 'domanda':
      return String(s.posta)
  }
}

/** Come lo legge chi non vede, e come lo dice il risultato: "Per due", "Domanda di arte da 30 punti". */
export function nomeDi(s: Spicchio): string {
  switch (s.tipo) {
    case 'doppio':
      return 'Per due'
    case 'niente':
      return 'Niente'
    case 'moneta':
      return `Testa o croce da ${s.posta} punti`
    case 'domanda':
      return `Domanda di ${NOMI_MATERIE_RUOTA[s.materia].toLowerCase()} da ${s.posta} punti`
  }
}

/** Se una puntata si puo' fare con i punti di oggi: un intero, fra la minima e tutti. */
export function puntataValida(puntata: unknown, puntiDiOggi: number): puntata is number {
  return Number.isInteger(puntata) && (puntata as number) >= PUNTATA_MINIMA && (puntata as number) <= puntiDiOggi
}

/**
 * Le categorie del quiz da cui vengono le domande di ogni materia della ruota.
 * La geografia le ha tutte tranne le città, come la classificata: una domanda
 * sola vale fino a cinquanta punti, e le città di un paese lontano non le sa
 * nessuno.
 */
export const CATEGORIE_DELLA_MATERIA: Record<MateriaRuota, readonly CategoriaQuiz[]> = {
  geografia: ['capitali', 'bandiere', 'stati', 'mari', 'oceani', 'fiumi', 'laghi'],
  storia: ['storia'],
  arte: ['arte'],
  libri: ['libri'],
  cinema: ['cinema'],
  scienza: ['scienza'],
}

/** Quante domande si preparano per ogni materia, ogni giorno: a chi gira ne tocca una a caso. */
export const DOMANDE_PER_MATERIA = 5

/** Una domanda della ruota, come la scrive lo script della notte: con la sua categoria, per l'emblema della carta. */
export interface DomandaRuota {
  categoria: CategoriaQuiz
  domanda: DomandaCompleta
}
