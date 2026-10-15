/**
 * Lettura del DAWG del dizionario dello Scarabeo.
 *
 * Il file lo scrive scripts/scarabeo/dawg.mjs, che ne spiega il formato: un
 * arco per intero a 32 bit, gli archi di un nodo contigui e in ordine di
 * lettera, la radice all'indice 0. Qui ci sono solo le operazioni che servono a
 * chi cerca parole: seguire una lettera, sapere se una parola puo' finire,
 * elencare le lettere che proseguono.
 *
 * Il dizionario ha tre livelli: le parole note, che gioca il computer, le
 * comuni, che le comprendono, e le altre, che valgono quando le gioca una
 * persona. `Dawg.da` le legge tutte; `comuni()` e `note()` danno lo stesso
 * dizionario a quel livello, in cui gli archi che portano solo a parole degli
 * altri non esistono. `note()` e' il dizionario del computer.
 *
 * Un nodo si indica con l'indice del suo primo arco. `FOGLIA` e' il nodo senza
 * figli: da lì non si prosegue.
 */

/** Le 21 lettere del gioco, nell'ordine dei loro indici. Deve coincidere con lo script. */
export const LETTERE = 'abcdefghilmnopqrstuvz'
export const NUMERO_LETTERE = LETTERE.length
/** Tutte le lettere ammesse, come maschera di bit. */
export const TUTTE = (1 << NUMERO_LETTERE) - 1

/** Il nodo da cui non esce nessun arco. */
export const FOGLIA = -1
export const RADICE = 0

const ULTIMO = 1 << 5
const FINALE = 1 << 6
const FINALE_COMUNE = 1 << 7
const STRADA_COMUNE = 1 << 8
const FINALE_NOTA = 1 << 9
const STRADA_NOTA = 1 << 10
const SPOSTAMENTO_FIGLIO = 11

/** Quali parole si leggono: tutte, le comuni, o le sole note. */
export type LivelloDawg = 'tutte' | 'comuni' | 'note'

const INDICI: Readonly<Record<string, number>> = Object.fromEntries(
  [...LETTERE].map((l, i) => [l, i]),
)

/** L'indice di una lettera, -1 se non e' del gioco. */
export function indiceDi(lettera: string): number {
  return INDICI[lettera] ?? -1
}

export class Dawg {
  /** Il bit che dice se una parola finisce, per questo livello. */
  private readonly fine: number
  /** Il bit che un arco deve avere per esistere, per questo livello: nessuno, se si leggono tutte. */
  private readonly strada: number

  constructor(
    readonly archi: Uint32Array,
    /** Le parole che si leggono; le note sono il dizionario del computer. */
    readonly livello: LivelloDawg = 'tutte',
  ) {
    this.fine = livello === 'note' ? FINALE_NOTA : livello === 'comuni' ? FINALE_COMUNE : FINALE
    this.strada = livello === 'note' ? STRADA_NOTA : livello === 'comuni' ? STRADA_COMUNE : 0
  }

  /** Da un file letto per intero, per esempio con `fetch(...).arrayBuffer()`. */
  static da(buffer: ArrayBuffer | ArrayBufferView): Dawg {
    const byte =
      buffer instanceof ArrayBuffer
        ? new Uint8Array(buffer)
        : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    // I browser e Node sono little endian, come il file: la lettura diretta e'
    // corretta. La copia serve solo se il buffer non e' allineato a quattro byte.
    const allineato =
      byte.byteOffset % 4 === 0 ? byte : new Uint8Array(byte)
    return new Dawg(new Uint32Array(allineato.buffer, allineato.byteOffset, allineato.byteLength / 4))
  }

  /** Lo stesso dizionario con le sole parole comuni, senza copiarlo. */
  comuni(): Dawg {
    return this.livello === 'comuni' ? this : new Dawg(this.archi, 'comuni')
  }

  /** Lo stesso dizionario con le sole parole note: quello del computer. */
  note(): Dawg {
    return this.livello === 'note' ? this : new Dawg(this.archi, 'note')
  }

  /**
   * L'arco che esce da `nodo` con la lettera `l`, oppure -1.
   *
   * Gli archi sono in ordine di lettera: la ricerca si ferma appena la lettera
   * letta supera quella cercata.
   */
  arco(nodo: number, l: number): number {
    if (nodo === FOGLIA) return -1
    const archi = this.archi
    for (let e = nodo; ; e += 1) {
      const a = archi[e]
      const lettera = a & 31
      if (lettera === l) return (a & this.strada) === this.strada ? e : -1
      if (lettera > l || (a & ULTIMO) !== 0) return -1
    }
  }

  /**
   * L'arco esiste a questo livello? Chi scorre tutti gli archi di un nodo salta
   * quelli che non lo sono: per il computer portano solo a parole che non usa.
   */
  percorribile(e: number): boolean {
    return (this.archi[e] & this.strada) === this.strada
  }

  /** Il nodo in cui porta un arco. */
  destinazione(e: number): number {
    const figlio = this.archi[e] >>> SPOSTAMENTO_FIGLIO
    return figlio === 0 ? FOGLIA : figlio
  }

  /** La parola puo' finire dopo la lettera di questo arco? */
  finale(e: number): boolean {
    return (this.archi[e] & this.fine) !== 0
  }

  lettera(e: number): number {
    return this.archi[e] & 31
  }

  ultimo(e: number): boolean {
    return (this.archi[e] & ULTIMO) !== 0
  }

  /** Il nodo raggiunto leggendo una sequenza di indici di lettera, o FOGLIA. */
  segui(nodo: number, lettere: ArrayLike<number>, da = 0, a = lettere.length): number {
    let n = nodo
    for (let i = da; i < a; i += 1) {
      const e = this.arco(n, lettere[i])
      if (e < 0) return FOGLIA
      n = this.destinazione(e)
      if (i < a - 1 && n === FOGLIA) return FOGLIA
    }
    return n
  }

  /** La parola e' nel dizionario? */
  contiene(parola: string): boolean {
    if (parola.length === 0) return false
    let nodo = RADICE
    for (let i = 0; i < parola.length; i += 1) {
      const l = indiceDi(parola[i])
      if (l < 0 || nodo === FOGLIA) return false
      const e = this.arco(nodo, l)
      if (e < 0) return false
      if (i === parola.length - 1) return this.finale(e)
      nodo = this.destinazione(e)
    }
    return false
  }

  /** Quante parole ha, a questo livello: serve ai test, per dire che non ce n'e' una in piu'. */
  quante(): number {
    const conti = new Map<number, number>()
    const conta = (nodo: number): number => {
      if (nodo === FOGLIA) return 0
      const noto = conti.get(nodo)
      if (noto !== undefined) return noto
      let n = 0
      for (let e = nodo; ; e += 1) {
        if (this.percorribile(e)) n += (this.finale(e) ? 1 : 0) + conta(this.destinazione(e))
        if (this.ultimo(e)) break
      }
      conti.set(nodo, n)
      return n
    }
    return conta(RADICE)
  }
}
