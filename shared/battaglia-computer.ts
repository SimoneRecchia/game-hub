/**
 * Il computer della battaglia navale: dove spara, e la flotta del giorno.
 *
 * Il computer sa quel che saprebbe un giocatore al tavolo: i propri colpi, com'e'
 * andato ciascuno, e il nome della nave quando la affonda. Da lì ragiona con le
 * stesse regole del gioco su carta, e in particolare con quella che le navi
 * **non si toccano**, nemmeno d'angolo. E' la regola che rende la battaglia
 * all'italiana un gioco di deduzione:
 *
 *  - accanto a una nave affondata, in tutte le otto direzioni, c'e' acqua;
 *  - in diagonale rispetto a un colpo andato a segno c'e' acqua, perché le navi
 *    sono dritte e due navi diverse non possono toccarsi.
 *
 * Tre livelli, che differiscono in quanto usano di tutto questo. Misurati su
 * duemila flotte a caso, i colpi che servono in media per affondarle tutte:
 *
 *  - **facile** (62) spara a caso, e dopo un colpo a segno prova le caselle
 *    accanto, seguendo la direzione quando ne ha colpite due in fila;
 *  - **normale** (50) sa anche che attorno a una nave affondata c'e' acqua, e
 *    non ci spreca colpi;
 *  - **difficile** (39) conta, per ogni casella, in quanti modi le navi rimaste
 *    ci potrebbero passare, e spara dove la conta e' piu' alta: e' la strategia
 *    della "densita' di probabilita'", la piu' forte che si conosca.
 *
 * I tre livelli distano una decina di colpi l'uno dall'altro, che e' la
 * differenza fra chi vince quasi sempre e chi vince una volta su due. Nella
 * classificata il computer e' il facile: la sfida del giorno e' affondare la sua
 * flotta con meno colpi possibile, e un avversario che vince spesso la
 * trasformerebbe in una lotteria.
 *
 * Tutto e' deterministico dal generatore che riceve: nella classificata il
 * computer e' lo stesso per tutti, e a parita' di colpi ricevuti fa le stesse
 * scelte.
 */

import { mulberry32 } from './daily'
import {
  CASELLE,
  FLOTTA,
  LATO,
  casella,
  disponiACaso,
  type Esito,
  type IdNave,
  type Nave,
} from './battaglia'

export type LivelloBattaglia = 'facile' | 'normale' | 'difficile'

export const LIVELLI_BATTAGLIA: readonly LivelloBattaglia[] = ['facile', 'normale', 'difficile']

/** Un colpo come lo ricorda chi l'ha sparato. */
export interface ColpoNoto {
  casella: number
  esito: Esito
  /** La nave, solo se affondata: e' l'unico momento in cui si annuncia. */
  nave: IdNave | null
}

/** Seme della flotta del giorno: suo, indipendente da quelli degli altri giochi. */
const SEME_FLOTTA = 0x0b47_7a61

/**
 * La flotta del computer nella classificata: la stessa per tutti, ogni giorno
 * diversa. Deterministica dal numero del puzzle, come il sacchetto dello
 * Scarabeo, quindi non serve salvarla.
 */
export function flottaDelGiorno(puzzleNumber: number): Nave[] {
  return disponiACaso(mulberry32((SEME_FLOTTA ^ Math.imul(puzzleNumber, 0x9e37_79b9)) >>> 0))
}

/** Il seme del computer della classificata, per il giorno: anche lui uguale per tutti. */
export function semeDelGiorno(puzzleNumber: number): number {
  return (SEME_FLOTTA ^ Math.imul(puzzleNumber + 7919, 0x85eb_ca6b)) >>> 0
}

/** Il generatore per il colpo numero `indice`: dipende dal seme e dal turno, non dalla storia. */
export function casoDelColpo(seme: number, indice: number): () => number {
  return mulberry32((seme ^ Math.imul(indice + 1, 0x9e37_79b1)) >>> 0)
}

const IGNOTA = 0
const ACQUA = 1
const COLPITA = 2
const AFFONDATA = 3

interface Conoscenza {
  stato: Uint8Array
  /** Le lunghezze delle navi non ancora affondate. */
  rimaste: number[]
}

function vicine(k: number, diagonali: boolean): number[] {
  const r = Math.floor(k / LATO)
  const c = k % LATO
  const fuori: number[] = []
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue
      if (!diagonali && dr !== 0 && dc !== 0) continue
      const rr = r + dr
      const cc = c + dc
      if (rr >= 0 && cc >= 0 && rr < LATO && cc < LATO) fuori.push(casella(rr, cc))
    }
  }
  return fuori
}

/** Il gruppo di colpi a segno attaccati a `k`: finché la nave non e' a fondo, e' un pezzo di una nave sola. */
function gruppo(stato: Uint8Array, k: number, valore: number): number[] {
  const visti = new Set([k])
  const coda = [k]
  for (let i = 0; i < coda.length; i += 1) {
    for (const v of vicine(coda[i], false)) {
      if (stato[v] === valore && !visti.has(v)) {
        visti.add(v)
        coda.push(v)
      }
    }
  }
  return coda
}

/**
 * Quel che si sa del mare avversario dopo questi colpi.
 *
 * `deduce` dice se usare le regole del "non si toccano": il computer facile non
 * le usa, ed e' una delle cose che lo rendono facile.
 */
function conosci(colpi: readonly ColpoNoto[], deduce: boolean): Conoscenza {
  const stato = new Uint8Array(CASELLE)
  const affondate = new Set<IdNave>()
  for (const colpo of colpi) {
    if (colpo.esito === 'acqua') stato[colpo.casella] = ACQUA
    else stato[colpo.casella] = COLPITA
    if (colpo.esito === 'affondato') {
      // La nave affondata e' il gruppo di colpi a segno che contiene quest'ultimo.
      for (const k of gruppo(stato, colpo.casella, COLPITA)) stato[k] = AFFONDATA
      if (colpo.nave) affondate.add(colpo.nave)
    }
  }

  if (deduce) {
    for (let k = 0; k < CASELLE; k += 1) {
      if (stato[k] === AFFONDATA) {
        for (const v of vicine(k, true)) if (stato[v] === IGNOTA) stato[v] = ACQUA
      } else if (stato[k] === COLPITA) {
        for (const v of vicine(k, true)) {
          const diagonale = Math.floor(v / LATO) !== Math.floor(k / LATO) && v % LATO !== k % LATO
          if (diagonale && stato[v] === IGNOTA) stato[v] = ACQUA
        }
      }
    }
  }

  const rimaste = FLOTTA.filter((t) => !affondate.has(t.id)).map((t) => t.lunghezza)
  return { stato, rimaste }
}

function aCaso<T>(elenco: readonly T[], caso: () => number): T {
  return elenco[Math.floor(caso() * elenco.length)]
}

/**
 * In quanti modi le navi rimaste passano per ogni casella.
 *
 * Una posizione conta se non tocca acqua o navi affondate e, quando ci sono
 * colpi a segno ancora aperti, se ne copre almeno uno: in quel caso si cerca il
 * resto di una nave gia' trovata, non una nave nuova.
 */
function densita(conoscenza: Conoscenza): Float64Array {
  const { stato, rimaste } = conoscenza
  const conta = new Float64Array(CASELLE)
  const aperte = stato.some((s) => s === COLPITA)
  for (const lunghezza of rimaste) {
    for (const verticale of [false, true]) {
      for (let r = 0; r < LATO; r += 1) {
        for (let c = 0; c < LATO; c += 1) {
          const caselle: number[] = []
          let libera = true
          let copre = 0
          for (let i = 0; i < lunghezza; i += 1) {
            const rr = verticale ? r + i : r
            const cc = verticale ? c : c + i
            if (rr >= LATO || cc >= LATO) {
              libera = false
              break
            }
            const k = casella(rr, cc)
            if (stato[k] === ACQUA || stato[k] === AFFONDATA) {
              libera = false
              break
            }
            if (stato[k] === COLPITA) copre += 1
            caselle.push(k)
          }
          if (!libera) continue
          if (aperte && copre === 0) continue
          // Coprire piu' colpi a segno insieme e' molto piu' probabile: pesa di piu'.
          const peso = aperte ? 1 + copre * 20 : 1
          for (const k of caselle) if (stato[k] === IGNOTA) conta[k] += peso
        }
      }
    }
  }
  return conta
}

/** Le caselle da provare attorno ai colpi a segno ancora aperti, seguendo la direzione se si conosce. */
function candidateAttorno(stato: Uint8Array): number[] {
  const candidate = new Set<number>()
  const visti = new Set<number>()
  for (let k = 0; k < CASELLE; k += 1) {
    if (stato[k] !== COLPITA || visti.has(k)) continue
    const pezzo = gruppo(stato, k, COLPITA)
    for (const x of pezzo) visti.add(x)

    if (pezzo.length >= 2) {
      const righe = new Set(pezzo.map((x) => Math.floor(x / LATO)))
      const orizzontale = righe.size === 1
      const ordinati = [...pezzo].sort((a, b) => a - b)
      const passo = orizzontale ? 1 : LATO
      const primo = ordinati[0]
      const ultimo = ordinati[ordinati.length - 1]
      const prima = primo - passo
      const dopo = ultimo + passo
      const stessaLinea = (x: number) =>
        orizzontale ? Math.floor(x / LATO) === Math.floor(primo / LATO) : x >= 0 && x < CASELLE
      if (prima >= 0 && stessaLinea(prima) && stato[prima] === IGNOTA) candidate.add(prima)
      if (dopo < CASELLE && stessaLinea(dopo) && stato[dopo] === IGNOTA) candidate.add(dopo)
    } else {
      for (const x of pezzo) {
        for (const v of vicine(x, false)) if (stato[v] === IGNOTA) candidate.add(v)
      }
    }
  }
  return [...candidate].sort((a, b) => a - b)
}

/**
 * Dove spara il computer, dati i colpi che ha gia' sparato su quel mare.
 *
 * Restituisce sempre una casella non ancora colpita, finché ce n'e' una.
 */
export function colpoDelComputer(
  colpi: readonly ColpoNoto[],
  livello: LivelloBattaglia,
  caso: () => number,
): number {
  const conoscenza = conosci(colpi, livello !== 'facile')
  const { stato } = conoscenza
  const ignote: number[] = []
  const sparate = new Set(colpi.map((c) => c.casella))
  for (let k = 0; k < CASELLE; k += 1) if (stato[k] === IGNOTA && !sparate.has(k)) ignote.push(k)
  if (ignote.length === 0) {
    // Non dovrebbe succedere: la flotta affonda prima. Ma una casella libera c'e'.
    for (let k = 0; k < CASELLE; k += 1) if (!sparate.has(k)) return k
    return 0
  }

  if (livello === 'difficile') {
    const conta = densita(conoscenza)
    let massimo = -1
    let migliori: number[] = []
    for (const k of ignote) {
      if (conta[k] > massimo) {
        massimo = conta[k]
        migliori = [k]
      } else if (conta[k] === massimo) migliori.push(k)
    }
    return aCaso(migliori, caso)
  }

  const attorno = candidateAttorno(stato)
  if (attorno.length > 0) return aCaso(attorno, caso)
  return aCaso(ignote, caso)
}
