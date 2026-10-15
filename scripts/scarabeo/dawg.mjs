/**
 * Costruisce il DAWG del dizionario dello Scarabeo.
 *
 * Un DAWG (grafo aciclico diretto di parole) e' un trie in cui i sottoalberi
 * uguali sono fusi: "cantare", "ballare" e "parlare" finiscono tutte nello
 * stesso nodo di "-are". Con la flessione dell'italiano la fusione fa quasi
 * tutto il lavoro, e le forme con i pronomi attaccati ancora di piu': un
 * milione e mezzo di "portarlo", "dimmelo", "andandosene" costano poche
 * decine di kB, perché finiscono tutte negli stessi nodi.
 *
 * La costruzione e' quella incrementale di Daciuk, Mihov, Watson e Watson
 * ("Incremental construction of minimal acyclic finite-state automata", 2000):
 * con le parole in ordine alfabetico, ogni ramo si minimizza appena la parola
 * successiva lo abbandona, e il registro dei nodi gia' visti trova i doppioni.
 *
 * Le parole hanno tre livelli (vedi scripts/build-dizionario.mjs e
 * scripts/build-note-scarabeo.mjs): le **note**, che gioca il computer, le
 * **comuni**, che le comprendono, e le **altre**, che valgono solo se le gioca
 * una persona. Il livello sta sul nodo in cui la parola finisce, e due nodi si
 * fondono solo se hanno anche gli stessi livelli.
 *
 * Il formato di uscita e' un array di interi a 32 bit, un arco per elemento; gli
 * archi di un nodo sono contigui e in ordine di lettera, e la radice comincia
 * all'indice 0. Ogni arco:
 *
 *   bit 0-4   la lettera, come indice in LETTERE (0..20)
 *   bit 5     1 se e' l'ultimo arco del suo nodo
 *   bit 6     1 se una parola puo' finire dopo questa lettera
 *   bit 7     1 se quella parola e' comune
 *   bit 8     1 se da questo arco passa almeno una parola comune
 *   bit 9     1 se quella parola e' nota
 *   bit 10    1 se da questo arco passa almeno una parola nota: il computer
 *             non segue gli altri, e cerca le sue mosse come se ci fossero solo
 *             le note
 *   bit 11-31 l'indice del primo arco del nodo di arrivo, 0 se non ha figli
 *
 * Lo 0 come "nessun figlio" e' sicuro perché nessun arco punta alla radice: il
 * grafo e' aciclico. La lettura sta in shared/dawg.ts, e le due cose devono
 * restare d'accordo: un test costruisce un DAWG e lo rilegge.
 */

/** Le 21 lettere del gioco, nell'ordine dei loro indici. Deve coincidere con shared/dawg.ts. */
export const LETTERE = 'abcdefghilmnopqrstuvz'

/** Il livello di una parola, com'e' scritto sul nodo in cui finisce. */
const NESSUNA = 0
const COMUNE = 1
const ALTRA = 2
/** Una parola comune e anche nota: e' una delle comuni, e il computer la gioca. */
const NOTA = 3

const INDICE = new Map([...LETTERE].map((l, i) => [l, i]))

class Nodo {
  constructor() {
    this.finale = NESSUNA
    /** @type {Map<string, Nodo>} */
    this.figli = new Map()
    this.id = -1
  }
}

/**
 * Il DAWG degli elenchi di parole, come Uint32Array: le comuni, le altre e le
 * note, che sono una parte delle comuni.
 *
 * Le parole possono arrivare in qualunque ordine e ripetute: si ordinano qui,
 * perché la costruzione incrementale lo pretende e un elenco "quasi ordinato"
 * darebbe un grafo non minimo senza nessun errore visibile. Una parola che sta
 * fra le comuni e fra le altre e' comune; una nota che non e' fra le comuni e'
 * un errore dell'elenco.
 */
export function costruisciDawg(comuni, altre = [], note = []) {
  const livello = new Map()
  for (const p of altre) livello.set(p, ALTRA)
  for (const p of comuni) livello.set(p, COMUNE)
  for (const p of note) {
    if (livello.get(p) !== COMUNE && livello.get(p) !== NOTA) throw new Error(`La parola nota "${p}" non e' fra le comuni`)
    livello.set(p, NOTA)
  }
  const parole = [...livello.keys()].sort()
  for (const p of parole) {
    for (const l of p) {
      if (!INDICE.has(l)) throw new Error(`Lettera fuori dal gioco in "${p}": ${l}`)
    }
  }

  let contatore = 0
  const registro = new Map()
  const chiave = (n) => {
    let s = String(n.finale)
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
    nodo.finale = livello.get(parola)
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

  if (posizione >= 2 ** 21) throw new Error('Troppi archi per il formato a 32 bit')

  const comune = (n) => n.finale === COMUNE || n.finale === NOTA
  const nota = (n) => n.finale === NOTA

  // Da quali nodi si arriva a una parola di un livello. Un nodo ha piu' padri,
  // a profondita' diverse: si decide dal basso, una volta per nodo.
  const raggiunge = (livelloDi) => {
    const visti = new Map()
    const ha = (nodo) => {
      let si = visti.get(nodo)
      if (si !== undefined) return si
      si = false
      for (const figlio of nodo.figli.values()) {
        if (livelloDi(figlio) || ha(figlio)) {
          si = true
          break
        }
      }
      visti.set(nodo, si)
      return si
    }
    return ha
  }
  const haComuni = raggiunge(comune)
  const haNote = raggiunge(nota)

  const archi = new Uint32Array(posizione)
  for (const nodo of ordine) {
    let p = inizio.get(nodo)
    const figli = [...nodo.figli]
    figli.forEach(([lettera, figlio], i) => {
      const ultimo = i === figli.length - 1 ? 1 : 0
      const finale = figlio.finale !== NESSUNA ? 1 : 0
      const finaleComune = comune(figlio) ? 1 : 0
      const stradaComune = finaleComune || haComuni(figlio) ? 1 : 0
      const finaleNota = nota(figlio) ? 1 : 0
      const stradaNota = finaleNota || haNote(figlio) ? 1 : 0
      // `>>> 0`: con l'indice nei bit alti il numero supera 2^31, e senza la
      // conversione diventerebbe negativo prima di finire nell'array.
      archi[p] =
        (INDICE.get(lettera) |
          (ultimo << 5) |
          (finale << 6) |
          (finaleComune << 7) |
          (stradaComune << 8) |
          (finaleNota << 9) |
          (stradaNota << 10) |
          (inizio.get(figlio) << 11)) >>>
        0
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
