/**
 * Lettura del DAWG del dizionario dello Scarabeo.
 *
 * Il file lo scrive scripts/scarabeo/dawg.mjs, che ne spiega il formato: un
 * arco per intero a 32 bit, gli archi di un nodo contigui e in ordine di
 * lettera, la radice all'indice 0. Qui ci sono solo le operazioni che servono a
 * chi cerca parole: seguire una lettera, sapere se una parola puo' finire,
 * elencare le lettere che proseguono.
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

const INDICI: Readonly<Record<string, number>> = Object.fromEntries(
  [...LETTERE].map((l, i) => [l, i]),
)

/** L'indice di una lettera, -1 se non e' del gioco. */
export function indiceDi(lettera: string): number {
  return INDICI[lettera] ?? -1
}

export class Dawg {
  constructor(readonly archi: Uint32Array) {}

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
      if (lettera === l) return e
      if (lettera > l || (a & 32) !== 0) return -1
    }
  }

  /** Il nodo in cui porta un arco. */
  destinazione(e: number): number {
    const figlio = this.archi[e] >>> 7
    return figlio === 0 ? FOGLIA : figlio
  }

  /** La parola puo' finire dopo la lettera di questo arco? */
  finale(e: number): boolean {
    return (this.archi[e] & 64) !== 0
  }

  lettera(e: number): number {
    return this.archi[e] & 31
  }

  ultimo(e: number): boolean {
    return (this.archi[e] & 32) !== 0
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
}
