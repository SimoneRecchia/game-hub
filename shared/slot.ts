/**
 * La slot: tre rulli, tre righe in vista e una linea, quella di mezzo, come le
 * slot classiche con la leva. Si punta da `PUNTATA_MINIMA_SLOT` punto, e la
 * puntata si paga al giro, come a Crazy Time: il giro nasce con la puntata
 * persa, e una vincita la restituisce moltiplicata.
 *
 * Sulla linea pagano i simboli di sempre (`PREMI`): tre uguali, e le ciliegie
 * anche da sole, contate da sinistra. Sui rulli ci sono anche le sei categorie
 * del quiz di oggi — le stesse della ruota di Crazy Time (`categorieDelGiorno`)
 * — e valgono dovunque nella finestra, come gli scatter delle slot vere: tre
 * della stessa categoria, una per rullo, aprono una domanda, che giusta paga
 * `VINCITA_DOMANDA` volte la puntata.
 *
 * Come nelle slot vere si vince di rado e quasi sempre poco: una volta ogni sei
 * o sette giri, e piu' della meta' delle volte e' una ciliegia sola. Una tripla
 * di frutta capita ogni qualche centinaio di giri e paga venti volte e piu', i
 * sette una volta ogni ventisettemila e pagano trecento. La resa di chi
 * risponde sempre giusto e' quella di Crazy Time (`resaSlot`, 97,1%): nemmeno
 * qui si batte il banco, e nessuno dei giochi della Fortuna conviene piu' degli
 * altri. I conti sono esatti, sulle fermate dei rulli, e li tengono fermi i
 * test.
 */

/** Un simbolo sui rulli: i sette classici, e le sei categorie del giorno come cifre (in `categorieDelGiorno`). */
export type CodiceSlot = 'C' | 'L' | 'O' | 'P' | 'B' | 'R' | '7' | '0' | '1' | '2' | '3' | '4' | '5'
export type SimboloClassico = Exclude<CodiceSlot, '0' | '1' | '2' | '3' | '4' | '5'>

export const NOMI_SIMBOLI: Record<SimboloClassico, string> = {
  C: 'Ciliegia',
  L: 'Limone',
  O: 'Arancia',
  P: 'Prugna',
  B: 'Campana',
  R: 'BAR',
  '7': 'Sette',
}

/**
 * I rulli, dall'alto: trenta fermate ciascuno. Ogni categoria c'e' una volta
 * sola per rullo, a cinque fermate dalle altre: nella finestra se ne vede al
 * massimo una, e due triple insieme non possono uscire. Fra una categoria e
 * l'altra quattro simboli classici, mai due uguali vicini.
 */
export const RULLI: readonly (readonly CodiceSlot[])[] = [
  [
    '0', 'L', 'C', 'O', 'P', '1', 'L', 'R', 'O', 'C', '2', '7', 'L', 'P', 'O',
    '3', 'C', 'L', 'B', 'P', '4', 'O', 'L', 'C', 'R', '5', 'B', 'O', 'L', 'P',
  ],
  [
    '2', 'O', 'L', 'P', 'C', '4', 'L', 'B', 'O', 'P', '0', 'R', 'L', 'C', 'O',
    '5', 'P', '7', 'L', 'O', '1', 'L', 'P', 'B', 'C', '3', 'O', 'R', 'L', 'P',
  ],
  [
    '4', 'P', 'O', 'L', 'B', '0', 'O', 'L', 'R', 'P', '3', 'L', 'O', 'C', 'P',
    '1', 'O', '7', 'L', 'P', '5', 'L', 'B', 'O', 'C', '2', 'R', 'L', 'O', 'P',
  ],
]

/** Tre uguali sulla linea: quante volte la puntata. */
export const PREMI: Record<Exclude<SimboloClassico, 'C'>, number> = {
  '7': 300,
  R: 100,
  B: 50,
  P: 30,
  O: 25,
  L: 20,
}

/** Le ciliegie sulla linea, da sinistra: una paga due volte la puntata, due cinque, tre venticinque. */
export const CILIEGIE: readonly number[] = [0, 2, 5, 25]

/** Una domanda vinta: quante volte la puntata. */
export const VINCITA_DOMANDA = 30

export const PUNTATA_MINIMA_SLOT = 1
/** Le puntate dei tasti, come i gettoni di una slot: l'ultima e' il massimo. */
export const PUNTATE_SLOT: readonly number[] = [1, 2, 5, 10]
export const PUNTATA_MASSIMA_SLOT = PUNTATE_SLOT[PUNTATE_SLOT.length - 1]

/**
 * Fra due giri: i rulli si fermano uno dopo l'altro, e un programma che tira la
 * leva a raffica consumerebbe le richieste di tutti.
 */
export const INTERVALLO_SLOT_MS = 2_000

/** La disposizione dei rulli: un giro salvato con un'altra non si mostra, perché le sue fermate sono altri simboli. */
export const DISPOSIZIONE_SLOT = 1

export const NOME_SLOT = 'Slot'

export function puntataSlotValida(puntata: unknown, saldo: number): puntata is number {
  return (
    Number.isInteger(puntata) &&
    (puntata as number) >= PUNTATA_MINIMA_SLOT &&
    (puntata as number) <= Math.min(PUNTATA_MASSIMA_SLOT, saldo)
  )
}

const giro = (rullo: number, fermata: number) => {
  const n = RULLI[rullo].length
  return ((fermata % n) + n) % n
}

/** Le tre righe in vista, dall'alto: la fermata di ogni rullo sta nella riga di mezzo. */
export function finestra(fermate: readonly number[]): CodiceSlot[][] {
  return [-1, 0, 1].map((riga) => fermate.map((f, r) => RULLI[r][giro(r, f + riga)]))
}

/** La linea: i tre simboli della riga di mezzo. */
export function lineaDi(fermate: readonly number[]): CodiceSlot[] {
  return fermate.map((f, r) => RULLI[r][giro(r, f)])
}

/** Quante volte la puntata paga la linea: tre uguali, o le ciliegie da sinistra. Zero se niente. */
export function premioDellaLinea(linea: readonly CodiceSlot[]): number {
  const [a, b, c] = linea
  if (a === b && b === c && a in PREMI) return PREMI[a as keyof typeof PREMI]
  let ciliegie = 0
  while (ciliegie < linea.length && linea[ciliegie] === 'C') ciliegie += 1
  return CILIEGIE[ciliegie]
}

/** Le ciliegie che pagano, da sinistra: per accendere i simboli giusti. */
export function simboliVincenti(linea: readonly CodiceSlot[]): number[] {
  const [a, b, c] = linea
  if (a === b && b === c && a in PREMI) return [0, 1, 2]
  const vincenti: number[] = []
  for (let i = 0; i < linea.length && linea[i] === 'C'; i += 1) vincenti.push(i)
  return vincenti
}

/**
 * La categoria che fa tripla, come indice in `categorieDelGiorno`: la stessa
 * su tutti e tre i rulli, in una riga qualunque. Null se non c'e'.
 */
export function triplaDiCategoria(fermate: readonly number[]): number | null {
  const righe = finestra(fermate)
  for (let k = 0; k < 6; k += 1) {
    const codice = String(k) as CodiceSlot
    if ([0, 1, 2].every((r) => righe.some((riga) => riga[r] === codice))) return k
  }
  return null
}

/** Dove sta la categoria della tripla, rullo per rullo (la riga, da 0 in alto): per accenderla. */
export function righeDellaTripla(fermate: readonly number[], k: number): number[] {
  const righe = finestra(fermate)
  return [0, 1, 2].map((r) => righe.findIndex((riga) => riga[r] === String(k)))
}

/** Quel che un giro da' o toglie alla giornata: la vincita meno la puntata. */
export function deltaSlot(puntata: number, moltiplicatore: number): number {
  return puntata * moltiplicatore - puntata
}

export interface ConteggioSlot {
  /** La resa, con `giuste` la frazione delle domande indovinate. */
  resa: number
  /** Quanto rende la sola linea. */
  linea: number
  /** Ogni quanti giri la linea paga qualcosa, come frazione dei giri. */
  frequenza: number
  /** Ogni quanti giri esce una domanda, come frazione dei giri. */
  domanda: number
  /** La probabilita' dei tre sette. */
  sette: number
}

/**
 * La resa esatta, su tutte le fermate dei rulli: 27.000 combinazioni, tutte
 * con la stessa probabilita'. `giuste` e' la frazione delle domande
 * indovinate: 1 per chi sa tutto.
 */
export function contaSlot(giuste = 1): ConteggioSlot {
  const [n0, n1, n2] = RULLI.map((r) => r.length)
  let linea = 0
  let vincite = 0
  let domande = 0
  let sette = 0
  for (let a = 0; a < n0; a += 1) {
    for (let b = 0; b < n1; b += 1) {
      for (let c = 0; c < n2; c += 1) {
        const l = lineaDi([a, b, c])
        const premio = premioDellaLinea(l)
        linea += premio
        if (premio > 0) vincite += 1
        if (l[0] === '7' && l[1] === '7' && l[2] === '7') sette += 1
        if (triplaDiCategoria([a, b, c]) !== null) domande += 1
      }
    }
  }
  const tutte = n0 * n1 * n2
  return {
    resa: (linea + domande * VINCITA_DOMANDA * giuste) / tutte,
    linea: linea / tutte,
    frequenza: vincite / tutte,
    domanda: domande / tutte,
    sette: sette / tutte,
  }
}
