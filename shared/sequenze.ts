/**
 * Sequenze: nove cubetti sparsi su una tavola, alcuni si accendono uno dopo
 * l'altro, e si toccano nello stesso ordine. A ogni sequenza giusta la
 * prossima ha un cubetto in piu'.
 *
 * E' il test dei cubetti di Corsi (Philip Corsi, 1972), con cui gli psicologi
 * misurano la memoria visuospaziale a breve termine: la sequenza piu' lunga
 * che si ripete e' lo "span", e la media degli adulti e' cinque o sei. Il nome
 * del test non dice niente a chi gioca, e il gioco si chiama per quel che si
 * fa. I cubetti stanno sparsi e non in una griglia, come sulla tavola di
 * Corsi: in una griglia una sequenza si ricorderebbe come un disegno di righe
 * e colonne, e sarebbe un altro gioco.
 *
 * La classificata e' di cinque turni uguali per tutti: ogni turno comincia da
 * tre cubetti e cresce fino a nove, e il primo errore lo chiude. La libera va
 * avanti finché non si sbaglia, oltre i nove, da soli o con un amico.
 */

import { mulberry32 } from './daily'

export const NOME_SEQUENZE = 'Sequenze'

/** Un cubetto sulla tavola: il centro e la rotazione, in unita' di una tavola larga 100 e alta `ALTEZZA_TAVOLA`. */
export interface Cubetto {
  x: number
  y: number
  /** Di quanti gradi e' girato: i cubetti sono posati a mano, non allineati. */
  r: number
}

export const LARGHEZZA_TAVOLA = 100
export const ALTEZZA_TAVOLA = 120

/** Il lato di un cubetto, nelle stesse unita': quasi un quinto della tavola, perché il dito lo prenda bene. */
export const LATO_CUBETTO = 19

/**
 * I nove cubetti, sparsi come sulla tavola di Corsi: nessuno allineato a due
 * altri in modo da fare una riga, e fra due centri almeno trenta unita', quindi
 * fra due cubetti girati resta sempre un dito di spazio (un test lo controlla).
 */
export const CUBETTI: readonly Cubetto[] = [
  { x: 15, y: 14, r: -6 },
  { x: 57, y: 12, r: 4 },
  { x: 87, y: 33, r: -3 },
  { x: 38, y: 38, r: 7 },
  { x: 12, y: 62, r: 3 },
  { x: 66, y: 57, r: -5 },
  { x: 86, y: 84, r: 6 },
  { x: 35, y: 88, r: -4 },
  { x: 58, y: 108, r: 2 },
]

export const NUMERO_CUBETTI = CUBETTI.length

/* ─────────────────────────────  La classificata  ───────────────────────────── */

export const TURNI_SEQUENZE = 5

/** Da quanti cubetti comincia un turno, e fin dove arriva: oltre i nove un cubetto tornerebbe due volte. */
export const PRIMA_LUNGHEZZA = 3
export const ULTIMA_LUNGHEZZA = NUMERO_CUBETTI

/** Le sequenze di un turno, una per lunghezza: da tre a nove sono sette. */
export const SEQUENZE_PER_TURNO = ULTIMA_LUNGHEZZA - PRIMA_LUNGHEZZA + 1

/** I punti di una giornata finita, anche con tutti i turni sbagliati alla prima: si e' giocato. */
export const PUNTI_FINITA_SEQUENZE = 30

/** I punti di ogni sequenza ripetuta giusta. */
export const PUNTI_SEQUENZA = 2

/**
 * I punti di una giornata: trenta per averla finita, e due per ogni sequenza
 * ripetuta giusta, sette al piu' per turno. Chi arriva a cinque o sei, la
 * media, ne fa sessanta o settanta; chi si ferma a quattro cinquanta; chi
 * arriva a nove in tutti e cinque i turni il tetto, cento. Giocarla bene vale
 * il doppio di giocarla male, come in tutte le classificate.
 */
export function puntiSequenze(giusteDeiTurni: readonly number[]): number {
  return giusteDeiTurni.reduce(
    (s, giuste) => s + PUNTI_SEQUENZA * Math.max(0, Math.min(SEQUENZE_PER_TURNO, Math.floor(giuste))),
    PUNTI_FINITA_SEQUENZE,
  )
}

export const MASSIMO_SEQUENZE = PUNTI_FINITA_SEQUENZE + PUNTI_SEQUENZA * TURNI_SEQUENZE * SEQUENZE_PER_TURNO

/** La lunghezza raggiunta in un turno: l'ultima sequenza ripetuta giusta, o zero se e' sbagliata la prima. */
export function lunghezzaRaggiunta(giuste: number, prima = PRIMA_LUNGHEZZA): number {
  return giuste <= 0 ? 0 : prima - 1 + giuste
}

/* ─────────────────────────────  I tempi  ───────────────────────────── */

/** Quanto resta acceso un cubetto, e la pausa prima del seguente. */
export interface Ritmo {
  lampoMs: number
  pausaMs: number
}

/** Il ritmo della classificata e della sfida: un cubetto ogni ottocentocinquanta millisecondi. */
export const RITMO_NORMALE: Ritmo = { lampoMs: 600, pausaMs: 250 }

/** Quanto dura una sequenza, dal primo lampo alla fine dell'ultimo. */
export function durataSequenza(lunghezza: number, ritmo: Ritmo = RITMO_NORMALE): number {
  return lunghezza <= 0 ? 0 : lunghezza * ritmo.lampoMs + (lunghezza - 1) * ritmo.pausaMs
}

/* ─────────────────────────────  La libera  ───────────────────────────── */

export type LivelloSequenze = 'facile' | 'normale' | 'difficile'

export interface RegoleLivello {
  ritmo: Ritmo
  /** Da quanti cubetti si parte. */
  prima: number
  /** La sequenza si ripete al contrario, dall'ultimo cubetto al primo. */
  indietro: boolean
}

/**
 * I livelli della libera. Il facile e' piu' lento e parte da due; il normale e'
 * la classificata; il difficile la chiede al contrario, che e' la seconda meta'
 * del test di Corsi e chiede di tenere a mente la sequenza mentre la si gira.
 */
export const LIVELLI_SEQUENZE: Record<LivelloSequenze, RegoleLivello> = {
  facile: { ritmo: { lampoMs: 850, pausaMs: 350 }, prima: 2, indietro: false },
  normale: { ritmo: RITMO_NORMALE, prima: PRIMA_LUNGHEZZA, indietro: false },
  difficile: { ritmo: RITMO_NORMALE, prima: PRIMA_LUNGHEZZA, indietro: true },
}

export const LIVELLI_ORDINATI: readonly LivelloSequenze[] = ['facile', 'normale', 'difficile']

/* ─────────────────────────────  Le sequenze  ───────────────────────────── */

/**
 * Una sequenza di `lunghezza` cubetti con il generatore dato. Fino a nove un
 * cubetto non torna mai, come nel test; oltre, torna, ma mai due volte di
 * fila: lo stesso cubetto acceso due volte sembrerebbe un lampo solo.
 */
export function sequenzaACaso(lunghezza: number, caso: () => number): number[] {
  if (lunghezza <= NUMERO_CUBETTI) {
    const mazzo = CUBETTI.map((_, i) => i)
    for (let i = mazzo.length - 1; i > 0; i -= 1) {
      const j = Math.floor(caso() * (i + 1))
      ;[mazzo[i], mazzo[j]] = [mazzo[j], mazzo[i]]
    }
    return mazzo.slice(0, Math.max(0, lunghezza))
  }
  const fuori: number[] = []
  for (let i = 0; i < lunghezza; i += 1) {
    const prima = fuori[i - 1]
    let c = Math.floor(caso() * (NUMERO_CUBETTI - (prima === undefined ? 0 : 1)))
    if (prima !== undefined && c >= prima) c += 1
    fuori.push(c)
  }
  return fuori
}

/** Le sequenze di una giornata: cinque turni, e in ognuno una per lunghezza, da tre a nove. */
export function giornataACaso(caso: () => number): number[][][] {
  return Array.from({ length: TURNI_SEQUENZE }, () =>
    Array.from({ length: SEQUENZE_PER_TURNO }, (_, k) => sequenzaACaso(PRIMA_LUNGHEZZA + k, caso)),
  )
}

/** Una giornata come la salva il database: per turno, le sequenze in cifre ("4071"). */
export function giornataInTesto(giornata: readonly (readonly number[])[][]): string {
  return JSON.stringify(giornata.map((turno) => turno.map((s) => s.join(''))))
}

/** Una giornata letta dal database, o null se non ha la forma giusta. */
export function giornataDaTesto(testo: string): number[][][] | null {
  let valore: unknown
  try {
    valore = JSON.parse(testo)
  } catch {
    return null
  }
  if (!Array.isArray(valore) || valore.length !== TURNI_SEQUENZE) return null
  const turni: number[][][] = []
  for (const turno of valore) {
    if (!Array.isArray(turno) || turno.length !== SEQUENZE_PER_TURNO) return null
    const sequenze: number[][] = []
    for (let k = 0; k < turno.length; k += 1) {
      const s = turno[k]
      if (typeof s !== 'string' || s.length !== PRIMA_LUNGHEZZA + k || !/^[0-8]+$/.test(s)) return null
      sequenze.push([...s].map(Number))
    }
    turni.push(sequenze)
  }
  return turni
}

/**
 * La sequenza di un livello di una partita libera o di una sfida: dal seme
 * della partita e dal livello, cosi' i due di una sfida vedono le stesse.
 */
export function sequenzaDelLivello(seme: number, lunghezza: number): number[] {
  return sequenzaACaso(lunghezza, mulberry32((seme ^ Math.imul(lunghezza, 0x9e3779b1)) >>> 0))
}

/** L'ordine in cui vanno toccati i cubetti: quello dei lampi, o al contrario. */
export function ordineDaToccare(sequenza: readonly number[], indietro = false): number[] {
  return indietro ? [...sequenza].reverse() : [...sequenza]
}

/** Dove si e' sbagliato: l'indice del primo tocco sbagliato, o -1 se fin qui e' giusto. */
export function primoErrore(sequenza: readonly number[], tocchi: readonly number[], indietro = false): number {
  const giusto = ordineDaToccare(sequenza, indietro)
  for (let i = 0; i < tocchi.length; i += 1) if (tocchi[i] !== giusto[i]) return i
  return -1
}

/** Una risposta e' giusta se tocca tutti i cubetti, ognuno al suo posto. */
export function rispostaGiusta(sequenza: readonly number[], tocchi: readonly number[], indietro = false): boolean {
  return tocchi.length === sequenza.length && primoErrore(sequenza, tocchi, indietro) === -1
}

/** I tocchi mandati dal telefono, se sono una lista di cubetti che ci sono. */
export function leggiTocchi(valore: unknown, massimo: number): number[] | null {
  if (!Array.isArray(valore) || valore.length > massimo) return null
  const tocchi: number[] = []
  for (const t of valore) {
    if (!Number.isInteger(t) || t < 0 || t >= NUMERO_CUBETTI) return null
    tocchi.push(t)
  }
  return tocchi
}
