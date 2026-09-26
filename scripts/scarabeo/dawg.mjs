/**
 * Costruisce il DAWG del dizionario dello Scarabeo.
 *
 * Un DAWG (grafo aciclico diretto di parole) e' un trie in cui i sottoalberi
 * uguali sono fusi: "cantare", "ballare" e "parlare" finiscono tutte nello
 * stesso nodo di "-are". Con la flessione dell'italiano la fusione fa quasi
 * tutto il lavoro: 271.055 parole diventano 153.256 archi, 613 kB in chiaro e
 * circa 300 kB compressi — abbastanza piccolo da scaricarlo nel browser, dove
 * il computer dello Scarabeo lo usa per cercare le sue mosse.
 *
 * La costruzione e' quella incrementale di Daciuk, Mihov, Watson e Watson
 * ("Incremental construction of minimal acyclic finite-state automata", 2000):
 * con le parole in ordine alfabetico, ogni ramo si minimizza appena la parola
 * successiva lo abbandona, e il registro dei nodi gia' visti trova i doppioni.
 *
 * Il formato di uscita e' un array di interi a 32 bit, un arco per elemento; gli
 * archi di un nodo sono contigui e in ordine di lettera, e la radice comincia
 * all'indice 0. Ogni arco:
 *
 *   bit 0-4   la lettera, come indice in LETTERE (0..20)
 *   bit 5     1 se e' l'ultimo arco del suo nodo
 *   bit 6     1 se la parola puo' finire dopo questa lettera
 *   bit 7-31  l'indice del primo arco del nodo di arrivo, 0 se non ha figli
 *
 * Lo 0 come "nessun figlio" e' sicuro perché nessun arco punta alla radice: il
 * grafo e' aciclico. La lettura sta in shared/dawg.ts, e le due cose devono
 * restare d'accordo: c'e' un test che costruisce il file da capo e lo confronta
 * con quello versionato.
 */

/** Le 21 lettere del gioco, nell'ordine dei loro indici. Deve coincidere con shared/dawg.ts. */
export const LETTERE = 'abcdefghilmnopqrstuvz'

const INDICE = new Map([...LETTERE].map((l, i) => [l, i]))

class Nodo {
  constructor() {
    this.finale = false
    /** @type {Map<string, Nodo>} */
    this.figli = new Map()
    this.id = -1
  }
}

/**
 * Il DAWG di un elenco di parole, come Uint32Array.
 *
 * Le parole possono arrivare in qualunque ordine: si ordinano qui, perché la
 * costruzione incrementale lo pretende e un elenco "quasi ordinato" darebbe un
 * grafo non minimo senza nessun errore visibile.
 */
export function costruisciDawg(elenco) {
  const parole = [...new Set(elenco)].sort()
  for (const p of parole) {
    for (const l of p) {
      if (!INDICE.has(l)) throw new Error(`Lettera fuori dal gioco in "${p}": ${l}`)
    }
  }

  let contatore = 0
  const registro = new Map()
  const chiave = (n) => {
    let s = n.finale ? '1' : '0'
    // Le mappe conservano l'ordine d'inserimento, che per costruzione e' alfabetico.
    for (const [l, f] of n.figli) s += l + f.id + ','
    return s
  }

  const radice = new Nodo()
  /** Il ramo della parola precedente non ancora minimizzato: [padre, lettera, figlio]. */
  const ramo = []

  const minimizza = (fino) => {
    while (ramo.length > fino) {
      const [padre, lettera, figlio] = ramo.pop()
      const k = chiave(figlio)
      const gia = registro.get(k)
      if (gia) {
        padre.figli.set(lettera, gia)
      } else {
        figlio.id = contatore++
        registro.set(k, figlio)
      }
    }
  }

  let precedente = ''
  for (const parola of parole) {
    let comune = 0
    while (comune < parola.length && comune < precedente.length && parola[comune] === precedente[comune]) {
      comune += 1
    }
    minimizza(comune)
    let nodo = ramo.length > 0 ? ramo[ramo.length - 1][2] : radice
    for (let i = comune; i < parola.length; i += 1) {
      const nuovo = new Nodo()
      nodo.figli.set(parola[i], nuovo)
      ramo.push([nodo, parola[i], nuovo])
      nodo = nuovo
    }
    nodo.finale = true
    precedente = parola
  }
  minimizza(0)

  // Posizioni: in ampiezza dalla radice, con i figli in ordine di lettera.
  const inizio = new Map()
  const ordine = []
  let posizione = 0
  const coda = [radice]
  for (let i = 0; i < coda.length; i += 1) {
    const nodo = coda[i]
    if (inizio.has(nodo)) continue
    if (nodo.figli.size === 0) {
      inizio.set(nodo, 0)
      continue
    }
    inizio.set(nodo, posizione)
    posizione += nodo.figli.size
    ordine.push(nodo)
    for (const figlio of nodo.figli.values()) if (!inizio.has(figlio)) coda.push(figlio)
  }

  if (posizione >= 2 ** 25) throw new Error('Troppi archi per il formato a 32 bit')

  const archi = new Uint32Array(posizione)
  for (const nodo of ordine) {
    let p = inizio.get(nodo)
    const figli = [...nodo.figli]
    figli.forEach(([lettera, figlio], i) => {
      const ultimo = i === figli.length - 1 ? 1 : 0
      const finale = figlio.finale ? 1 : 0
      // `>>> 0`: con l'indice nei bit alti il numero supera 2^31, e senza la
      // conversione diventerebbe negativo prima di finire nell'array.
      archi[p] = (INDICE.get(lettera) | (ultimo << 5) | (finale << 6) | (inizio.get(figlio) << 7)) >>> 0
      p += 1
    })
  }
  return archi
}

/** I byte da scrivere su disco: little endian, come li legge ogni browser. */
export function byteDelDawg(archi) {
  const vista = new DataView(new ArrayBuffer(archi.length * 4))
  archi.forEach((arco, i) => vista.setUint32(i * 4, arco, true))
  return new Uint8Array(vista.buffer)
}
