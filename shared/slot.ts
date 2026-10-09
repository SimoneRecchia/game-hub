/**
 * La slot: tre rulli, tre righe in vista e una linea, quella di mezzo, come le
 * slot classiche con la leva. Si punta da `PUNTATA_MINIMA_SLOT` punto a tutto
 * il saldo, e la puntata si paga al giro, come a Crazy Time: il giro nasce con la puntata
 * persa, e una vincita la restituisce moltiplicata.
 *
 * Sulla linea pagano le ciliegie, dovunque stiano (`CILIEGIE`): una ridà la
 * puntata, due la pagano cinque volte, tre venti; e tre simboli uguali
 * (`PREMI`), dai limoni ai sette. Il punto di domanda vale dovunque nella
 * finestra, come gli scatter delle slot vere: tre in vista, uno per rullo,
 * aprono una domanda di una delle categorie del giorno — le stesse della ruota
 * di Crazy Time — che giusta paga `VINCITA_DOMANDA` volte la puntata.
 *
 * I conti sono quelli delle slot vere. Si vince un giro ogni tre, come nelle
 * slot video a piu' linee studiate sui PAR sheet ufficiali (il 33,5% dei giri
 * di Lucky Larry's Lobstermania a quindici linee, Harrigan e Dixon, 2009), e
 * quasi sempre poco: tre vincite su quattro sono una ciliegia sola, che ridà
 * la puntata, come la ciliegia sola che fa la grande parte delle vincite delle
 * slot a tre rulli. I limoni sono la tripla che si vede di piu', una volta ogni
 * sessantacinque giri; poi le arance, le prugne, le tre ciliegie, l'uva, le
 * campane, il BAR, e i sette una volta ogni sessantaquattromila. Dal ×20 in su
 * si vince una volta ogni cinquecento giri. La domanda esce una volta ogni
 * cinquanta giri e fa poco meno di un terzo della resa, come le funzioni
 * speciali delle slot video. La resa di chi risponde sempre giusto e' quella di
 * Crazy Time (`contaSlot`, 97%): nemmeno qui si batte il banco, e nessuno dei
 * giochi della Fortuna conviene piu' degli altri. I conti sono esatti, su tutte
 * le fermate dei rulli, e li tengono fermi i test.
 */

/** Un simbolo sui rulli: la frutta, la campana, il BAR, il sette e il punto di domanda. */
export type CodiceSlot = 'C' | 'L' | 'O' | 'P' | 'U' | 'B' | 'R' | '7' | 'Q'
export type SimboloClassico = Exclude<CodiceSlot, 'Q'>

/**
 * I rulli, dall'alto: quaranta fermate ciascuno. I punti di domanda sono a
 * dieci fermate l'uno dall'altro sui primi due rulli e a tredici sul terzo:
 * nella finestra di un rullo se ne vede al massimo uno. Mai due simboli uguali
 * vicini, e i piu' rari lontani fra loro.
 */
export const RULLI: readonly (readonly CodiceSlot[])[] = [
  [
    'Q', 'P', 'L', 'O', 'R', 'L', 'P', 'U', 'L', 'B', 'Q', 'P', 'L', 'C', 'O', 'L', 'U', 'R', 'L', 'O',
    'Q', 'L', 'B', 'P', 'L', 'U', 'O', 'L', 'C', 'O', 'Q', 'L', 'O', 'P', 'L', '7', 'O', 'U', 'P', 'C',
  ],
  [
    'U', 'L', 'O', 'C', 'B', 'Q', 'L', 'O', 'P', 'L', 'O', 'C', 'L', 'O', 'P', 'Q', 'L', 'C', 'B', 'L',
    'O', 'P', 'L', 'O', 'U', 'Q', 'L', 'C', '7', 'B', 'O', 'R', 'L', 'O', 'C', 'Q', 'P', 'O', 'L', 'P',
  ],
  [
    'P', 'C', 'U', 'Q', 'L', 'O', 'P', 'B', 'L', 'O', 'C', 'L', 'O', 'U', 'R', 'P', 'Q', 'O', 'C', 'L',
    'O', 'U', 'B', 'L', 'C', 'O', 'L', 'P', 'O', 'Q', 'L', 'C', 'O', 'P', 'U', 'L', 'B', '7', 'R', 'L',
  ],
]

/** Tre uguali sulla linea: quante volte la puntata. Le ciliegie hanno il loro conto. */
export const PREMI: Record<Exclude<SimboloClassico, 'C'>, number> = {
  '7': 300,
  R: 100,
  B: 50,
  U: 25,
  P: 15,
  O: 10,
  L: 5,
}

/** Le ciliegie sulla linea, dovunque: una ridà la puntata, due la pagano cinque volte, tre venti. */
export const CILIEGIE: readonly number[] = [0, 1, 5, 20]

/** Una domanda vinta: quante volte la puntata. */
export const VINCITA_DOMANDA = 15

/**
 * Si punta da uno a tutto il saldo, con le fiches di Crazy Time
 * (`src/games/fortuna/fiches.ts`): ogni tocco aggiunge il suo valore.
 */
export const PUNTATA_MINIMA_SLOT = 1

/**
 * Fra due giri: i rulli si fermano uno dopo l'altro, e un programma che tira la
 * leva a raffica consumerebbe le richieste di tutti.
 */
export const INTERVALLO_SLOT_MS = 2_000

/** La disposizione dei rulli: un giro salvato con un'altra non si mostra, perché le sue fermate sono altri simboli. */
export const DISPOSIZIONE_SLOT = 2

export const NOME_SLOT = 'Slot'

export function puntataSlotValida(puntata: unknown, saldo: number): puntata is number {
  return (
    Number.isInteger(puntata) &&
    (puntata as number) >= PUNTATA_MINIMA_SLOT &&
    (puntata as number) <= saldo
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

/**
 * Le combinazioni che pagano: una, due o tre ciliegie, o tre uguali. Ognuna
 * ha la sua animazione, quindi il nome viaggia con il premio.
 */
export type CombinazioneSlot = 'C1' | 'C2' | 'C3' | Exclude<SimboloClassico, 'C'>

export interface VincitaLinea {
  combinazione: CombinazioneSlot
  /** Quante volte la puntata. */
  premio: number
  /** I simboli che pagano, come rulli: le tre caselle, o le ciliegie. */
  simboli: number[]
}

/** Quel che paga la linea: tre uguali, o le ciliegie dovunque stiano. Null se niente. */
export function vincitaDellaLinea(linea: readonly CodiceSlot[]): VincitaLinea | null {
  const [a, b, c] = linea
  if (a === b && b === c && a !== 'C' && a !== 'Q') return { combinazione: a, premio: PREMI[a], simboli: [0, 1, 2] }
  const ciliegie = linea.flatMap((s, i) => (s === 'C' ? [i] : []))
  if (ciliegie.length === 0) return null
  const combinazione = `C${ciliegie.length}` as 'C1' | 'C2' | 'C3'
  return { combinazione, premio: CILIEGIE[ciliegie.length], simboli: ciliegie }
}

/** Quante volte la puntata paga la linea. Zero se niente. */
export function premioDellaLinea(linea: readonly CodiceSlot[]): number {
  return vincitaDellaLinea(linea)?.premio ?? 0
}

/** I simboli che pagano sulla linea, come rulli: per accenderli. */
export function simboliVincenti(linea: readonly CodiceSlot[]): number[] {
  return vincitaDellaLinea(linea)?.simboli ?? []
}

/** Dove sta il punto di domanda in ogni rullo: la riga, da 0 in alto, o -1 se nella finestra non c'e'. */
export function righeDelleDomande(fermate: readonly number[]): number[] {
  const righe = finestra(fermate)
  return [0, 1, 2].map((r) => righe.findIndex((riga) => riga[r] === 'Q'))
}

/** Tre punti di domanda in vista, uno per rullo, in una riga qualunque: si apre una domanda. */
export function apreDomanda(fermate: readonly number[]): boolean {
  return righeDelleDomande(fermate).every((riga) => riga >= 0)
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
  /** Quanti giri pagano qualcosa, linea o domanda, come frazione dei giri. */
  frequenza: number
  /** Delle vincite, quante ridanno solo la puntata. */
  pariAllaPuntata: number
  /** Quanti giri pagano dal ×20 in su. */
  grosse: number
  /** Quanti giri aprono una domanda. */
  domanda: number
  /** Ogni combinazione della linea, come frazione dei giri. */
  combinazioni: Record<CombinazioneSlot, number>
}

/**
 * La resa esatta, su tutte le fermate dei rulli: 64.000 combinazioni, tutte
 * con la stessa probabilita'. `giuste` e' la frazione delle domande
 * indovinate: 1 per chi sa tutto.
 */
export function contaSlot(giuste = 1): ConteggioSlot {
  const [n0, n1, n2] = RULLI.map((r) => r.length)
  const combinazioni = { C1: 0, C2: 0, C3: 0, L: 0, O: 0, P: 0, U: 0, B: 0, R: 0, '7': 0 }
  let linea = 0
  let vincite = 0
  let pari = 0
  let grosse = 0
  let domande = 0
  for (let a = 0; a < n0; a += 1) {
    for (let b = 0; b < n1; b += 1) {
      for (let c = 0; c < n2; c += 1) {
        const v = vincitaDellaLinea(lineaDi([a, b, c]))
        const domanda = apreDomanda([a, b, c])
        if (v) {
          linea += v.premio
          combinazioni[v.combinazione] += 1
          if (v.premio >= 20) grosse += 1
        }
        if (domanda) domande += 1
        if (v || domanda) vincite += 1
        if (v?.premio === 1 && !domanda) pari += 1
      }
    }
  }
  const tutte = n0 * n1 * n2
  return {
    resa: (linea + domande * VINCITA_DOMANDA * giuste) / tutte,
    linea: linea / tutte,
    frequenza: vincite / tutte,
    pariAllaPuntata: pari / vincite,
    grosse: grosse / tutte,
    domanda: domande / tutte,
    combinazioni: Object.fromEntries(
      Object.entries(combinazioni).map(([k, n]) => [k, n / tutte]),
    ) as Record<CombinazioneSlot, number>,
  }
}
