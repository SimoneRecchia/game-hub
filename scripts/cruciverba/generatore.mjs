/**
 * Il generatore degli schemi del cruciverba.
 *
 * Gira fuori dal Worker — in CI, o a mano — perché riempire uno schema e' una
 * ricerca con ritorni all'indietro, e i 10 ms di CPU per richiesta non bastano
 * nemmeno a costruire gli indici. Il Worker legge schemi gia' fatti da D1.
 *
 * Le regole dello schema sono quelle del cruciverba italiano classico:
 *
 *  - ogni sequenza di caselle bianche lunga almeno due, in orizzontale o in
 *    verticale, e' una parola con la sua definizione;
 *  - **ogni casella bianca sta in due parole**, una per direzione: nessuna
 *    lettera che si scrive "alla cieca", senza un secondo indizio;
 *  - le caselle nere sono isolate — mai due vicine — e senza simmetria, come
 *    negli schemi della Settimana Enigmistica;
 *  - le bianche formano un pezzo solo, e nessuna parola compare due volte.
 *
 * Il procedimento: si disegna uno schema di caselle nere a caso, lo si riempie
 * cercando prima la sequenza con meno parole possibili (con il controllo in
 * avanti sugli incroci), e se la ricerca supera il suo budget si cambia schema.
 * Si provano un certo numero di schemi e si tiene il riempimento migliore, cioe'
 * quello con le parole piu' comuni e meno sigle.
 *
 * E' **deterministico**: stesso dizionario, stesso seme, stesso schema. Il
 * budget si conta in nodi della ricerca e non in millisecondi, così una
 * macchina piu' lenta non cambia il risultato.
 */

export const ALFABETO = 'abcdefghilmnopqrstuvz'
const INDICE = Object.fromEntries([...ALFABETO].map((c, i) => [c, i]))

/** Quanto conta una parola comune rispetto al caso nell'ordine dei tentativi. */
const PESO_QUALITA = 2

/**
 * Sotto questa qualita' una parola di quattro lettere o piu' non entra: 0.05
 * vuol dire stare fra le prime 35.000 forme dell'elenco di frequenza.
 */
export const QUALITA_MINIMA = 0.05

/** Il riempimento si arrende dopo tanti nodi e si passa a un altro schema. */
const BUDGET_NODI = 4000

/**
 * Quanto scende nell'ordine dei tentativi una parola uscita di recente: piu' di
 * quel che vale la parola piu' comune, quindi torna solo se non c'e' altro che
 * incastri. Con 1,5 ATEO era uscito sei volte in un mese.
 */
const PENALITA_RECENTE = 3

/** Quanti candidati provare per sequenza prima di tornare indietro. */
const RAMI = 6

/** Piu' sigle di cosi' e lo schema diventa un quiz di acronimi. */
export const MASSIMO_SIGLE = 5

/**
 * PRNG deterministico: la stessa funzione di shared/daily.ts, copiata perché
 * gli script girano in Node senza compilare TypeScript. Un test verifica che le
 * due diano la stessa sequenza.
 */
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Dizionario
// ---------------------------------------------------------------------------

/**
 * Legge il file prodotto da scripts/build-cruciverba.mjs: una riga per
 * risposta, `parola \t rango \t voce|testo|nota …`.
 */
export function leggiDefinizioni(testo) {
  const voci = []
  for (const riga of testo.split('\n')) {
    if (!riga) continue
    const [parola, rango, ...campi] = riga.split('\t')
    const definizioni = campi.map((campo) => {
      const [voce, testoDef, nota = ''] = campo.split('|')
      return { voce, testo: testoDef, nota, sigla: nota === 'sigla' }
    })
    voci.push({ parola, rango: Number(rango), definizioni })
  }
  return voci
}

const PROVINCIA = /^sigla (automobilistica|burocratica)|^targa automobilistica/i

/** Le definizioni che dicono gia' da sole di essere una sigla. */
const GIA_SIGLA = /^(?:sigla|simbolo|abbreviazione|acronimo|targa)\b/i

/**
 * Quanto e' "da cruciverba" una parola, fra 0 e 1; negativa se non entra.
 *
 * La base e' la frequenza d'uso: una parola che si sente nei film si risolve
 * con quel che si sa. Le sigle valgono poco e solo corte, perché una sigla di
 * quattro lettere e' un indovinello; fra quelle di due lettere le province —
 * RM, MI, TO — sono il classico del cruciverba italiano e le conosce chiunque.
 */
export function qualita(voce, minima = QUALITA_MINIMA) {
  const n = voce.parola.length
  const frequenza = voce.rango > 0 ? 1 - Math.log(voce.rango) / Math.log(60000) : 0
  const soloSigle = voce.definizioni.every((d) => d.sigla)
  if (soloSigle) {
    if (n > 3) return -1
    if (n === 2) return voce.definizioni.some((d) => PROVINCIA.test(d.testo)) ? 0.12 : 0.08
    return voce.rango > 0 ? 0.08 : -1
  }
  if (n <= 3) return Math.max(frequenza, 0.06)
  // Fuori dall'elenco di frequenza: una parola da vocabolario, ammessa solo in
  // fondo all'ordine dei tentativi, quando nient'altro incastra.
  if (voce.rango === 0) return minima > 0 ? -1 : 0
  if (frequenza < minima) return -1
  return frequenza
}

/**
 * Gli indici per lunghezza: per ogni posizione e lettera, l'insieme (come
 * bitset) delle parole che hanno quella lettera in quella posizione. Il
 * controllo in avanti diventa un AND fra due array di interi.
 */
export function preparaDizionario(voci, { lunghezzaMassima = 10, qualitaMinima = QUALITA_MINIMA } = {}) {
  const perLunghezza = new Map()
  for (const voce of voci) {
    const n = voce.parola.length
    if (n < 2 || n > lunghezzaMassima) continue
    const q = qualita(voce, qualitaMinima)
    if (q < 0) continue
    if (!perLunghezza.has(n)) perLunghezza.set(n, [])
    perLunghezza.get(n).push({ ...voce, q, sigla: voce.definizioni.every((d) => d.sigla) })
  }

  const indici = new Map()
  for (const [n, parole] of perLunghezza) {
    const blocchi = (parole.length + 31) >>> 5
    const posizioni = Array.from({ length: n }, () =>
      Array.from({ length: ALFABETO.length }, () => new Uint32Array(blocchi)),
    )
    const tutte = new Uint32Array(blocchi)
    parole.forEach((p, k) => {
      tutte[k >>> 5] |= 1 << (k & 31)
      for (let i = 0; i < n; i += 1) posizioni[i][INDICE[p.parola[i]]][k >>> 5] |= 1 << (k & 31)
    })
    indici.set(n, { parole, posizioni, tutte, blocchi })
  }
  return indici
}

function contaBit(insieme) {
  let c = 0
  for (let i = 0; i < insieme.length; i += 1) {
    let v = insieme[i]
    v -= (v >>> 1) & 0x55555555
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333)
    c += (((v + (v >>> 4)) & 0xf0f0f0f) * 0x1010101) >>> 24
  }
  return c
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** La parola piu' lunga dello schema: oltre, le lunghe si incrociano fra loro e non si riempie. */
export const TRATTO_MASSIMO = 8

const VICINI = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
]

/** Le lunghezze dei tratti bianchi di una riga (o colonna) letta da `cella(i)`. */
function tratti(lunghezza, nera) {
  const risultato = []
  let corrente = 0
  for (let i = 0; i < lunghezza; i += 1) {
    if (nera(i)) {
      if (corrente > 0) risultato.push(corrente)
      corrente = 0
    } else corrente += 1
  }
  if (corrente > 0) risultato.push(corrente)
  return risultato
}

function trattiDellaRiga(nere, colonne, r) {
  return tratti(colonne, (c) => nere[r * colonne + c])
}

function trattiDellaColonna(nere, righe, colonne, c) {
  return tratti(righe, (r) => nere[r * colonne + c])
}

/** Dopo aver annerito queste caselle, la loro riga e la loro colonna restano senza lettere isolate? */
function senzaIsolate(nere, righe, colonne, caselle) {
  for (const k of caselle) {
    const r = Math.floor(k / colonne)
    const c = k % colonne
    if (trattiDellaRiga(nere, colonne, r).includes(1)) return false
    if (trattiDellaColonna(nere, righe, colonne, c).includes(1)) return false
  }
  return true
}

function toccaUnaNera(nere, righe, colonne, k, tranne) {
  const r = Math.floor(k / colonne)
  const c = k % colonne
  for (const [dr, dc] of VICINI) {
    const rr = r + dr
    const cc = c + dc
    if (rr < 0 || cc < 0 || rr >= righe || cc >= colonne) continue
    const kk = rr * colonne + cc
    if (kk !== tranne && nere[kk]) return true
  }
  return false
}

/** Prova ad annerire un gruppo di caselle; se una regola cede, le rimette bianche. */
function annerisci(nere, righe, colonne, caselle) {
  if (caselle.some((k) => nere[k])) return false
  for (const k of caselle) {
    const compagna = caselle.find((x) => x !== k) ?? -1
    if (toccaUnaNera(nere, righe, colonne, k, compagna)) return false
  }
  for (const k of caselle) nere[k] = true
  if (senzaIsolate(nere, righe, colonne, caselle)) return true
  for (const k of caselle) nere[k] = false
  return false
}

/**
 * Uno schema di caselle nere.
 *
 * Le nere sono isolate, come negli schemi classici, con un'eccezione: su ogni
 * lato una **coppia** di nere che entra dal bordo. Senza, la seconda riga non
 * potrebbe averne nessuna — una nera lì lascerebbe sopra una lettera isolata —
 * e lo stesso la penultima e le due colonne corrispondenti: ogni schema avrebbe
 * quattro parole da dieci lettere incrociate fra loro, che e' esattamente quel
 * che non si riesce a riempire con parole comuni.
 *
 * Poi nere isolate a caso fino al numero voluto, scartando quelle che lascino
 * una lettera sola in un tratto, e quelle che creano parole da due lettere con
 * una probabilita' piu' alta delle altre: nel cruciverba italiano ci sono, ma
 * poche. Alla fine ogni tratto dev'essere lungo al massimo TRATTO_MASSIMO.
 */
export function disegnaSchema(rng, righe, colonne, { minimoNere = 18, massimoNere = 22, massimoCorte = 8 } = {}) {
  const pesca = (n) => Math.floor(rng() * n)
  for (let tentativo = 0; tentativo < 300; tentativo += 1) {
    const nere = new Array(righe * colonne).fill(false)

    // Una coppia per lato, in una posizione che lasci ai lati tratti di almeno due.
    const lati = [
      () => { const c = 2 + pesca(colonne - 4); return [c, colonne + c] },
      () => { const c = 2 + pesca(colonne - 4); return [(righe - 1) * colonne + c, (righe - 2) * colonne + c] },
      () => { const r = 2 + pesca(righe - 4); return [r * colonne, r * colonne + 1] },
      () => { const r = 2 + pesca(righe - 4); return [r * colonne + colonne - 1, r * colonne + colonne - 2] },
    ]
    let lato = 0
    for (let prova = 0; prova < 40 && lato < lati.length; prova += 1) {
      if (annerisci(nere, righe, colonne, lati[lato]())) lato += 1
    }
    if (lato < lati.length) continue

    const voluto = minimoNere + pesca(massimoNere - minimoNere + 1)
    let messe = 8
    for (let giro = 0; giro < 3000 && messe < voluto; giro += 1) {
      const k = pesca(righe * colonne)
      if (!annerisci(nere, righe, colonne, [k])) continue
      const r = Math.floor(k / colonne)
      const c = k % colonne
      const corta =
        trattiDellaRiga(nere, colonne, r).includes(2) || trattiDellaColonna(nere, righe, colonne, c).includes(2)
      if (corta && rng() < 0.7) {
        nere[k] = false
        continue
      }
      messe += 1
    }
    if (messe < voluto) continue

    let lunghe = false
    for (let r = 0; r < righe && !lunghe; r += 1) {
      if (Math.max(...trattiDellaRiga(nere, colonne, r)) > TRATTO_MASSIMO) lunghe = true
    }
    for (let c = 0; c < colonne && !lunghe; c += 1) {
      if (Math.max(...trattiDellaColonna(nere, righe, colonne, c)) > TRATTO_MASSIMO) lunghe = true
    }
    if (lunghe || !connesso(nere, righe, colonne)) continue
    if (sequenzeDi(nere, righe, colonne).filter((q) => q.caselle.length === 2).length > massimoCorte) continue
    return nere
  }
  return null
}

/** Quante coppie di nere si toccano: poche fanno uno schema, troppe un disegno. */
function coppie(nere, righe, colonne) {
  let n = 0
  for (let r = 0; r < righe; r += 1) {
    for (let c = 0; c < colonne; c += 1) {
      if (!nere[r * colonne + c]) continue
      if (c + 1 < colonne && nere[r * colonne + c + 1]) n += 1
      if (r + 1 < righe && nere[(r + 1) * colonne + c]) n += 1
    }
  }
  return n
}

function connesso(nere, righe, colonne) {
  const bianche = nere.reduce((n, x) => n + (x ? 0 : 1), 0)
  const inizio = nere.findIndex((x) => !x)
  if (inizio < 0) return false
  const visto = new Uint8Array(nere.length)
  const pila = [inizio]
  visto[inizio] = 1
  let raggiunte = 1
  while (pila.length) {
    const k = pila.pop()
    const r = Math.floor(k / colonne)
    const c = k % colonne
    for (const [dr, dc] of VICINI) {
      const rr = r + dr
      const cc = c + dc
      if (rr < 0 || cc < 0 || rr >= righe || cc >= colonne) continue
      const kk = rr * colonne + cc
      if (nere[kk] || visto[kk]) continue
      visto[kk] = 1
      raggiunte += 1
      pila.push(kk)
    }
  }
  return raggiunte === bianche
}

/**
 * Le sequenze da riempire: ogni tratto bianco di almeno due caselle.
 *
 * La chiave e' direzione piu' indice della prima casella (`o12`, `v3`): e' la
 * stessa che calcola shared/cruciverba.ts dalla griglia, ed e' così che le
 * definizioni salvate ritrovano la loro casella.
 */
export function sequenzeDi(nere, righe, colonne) {
  const sequenze = []
  for (let r = 0; r < righe; r += 1) {
    for (let c = 0; c < colonne; c += 1) {
      const k = r * colonne + c
      if (nere[k]) continue
      if ((c === 0 || nere[k - 1]) && c + 1 < colonne && !nere[k + 1]) {
        const caselle = []
        for (let cc = c; cc < colonne && !nere[r * colonne + cc]; cc += 1) caselle.push(r * colonne + cc)
        sequenze.push({ chiave: `o${k}`, caselle })
      }
      if ((r === 0 || nere[k - colonne]) && r + 1 < righe && !nere[k + colonne]) {
        const caselle = []
        for (let rr = r; rr < righe && !nere[rr * colonne + c]; rr += 1) caselle.push(rr * colonne + c)
        sequenze.push({ chiave: `v${k}`, caselle })
      }
    }
  }
  return sequenze
}

// ---------------------------------------------------------------------------
// Riempimento
// ---------------------------------------------------------------------------

/**
 * Riempie uno schema. Restituisce le parole scelte per ogni sequenza, o `null`
 * se il budget finisce prima.
 */
export function riempi(nere, righe, colonne, indici, rng, { evita = new Set(), budget = BUDGET_NODI } = {}) {
  const sequenze = sequenzeDi(nere, righe, colonne)
  for (const s of sequenze) if (!indici.has(s.caselle.length)) return null

  // Per ogni casella di ogni sequenza, la sequenza che la incrocia e in che posizione.
  const doveSta = new Map()
  sequenze.forEach((s, si) =>
    s.caselle.forEach((k, i) => {
      if (!doveSta.has(k)) doveSta.set(k, [])
      doveSta.get(k).push([si, i])
    }),
  )
  const incroci = sequenze.map((s, si) =>
    s.caselle.map((k) => doveSta.get(k).find(([sj]) => sj !== si) ?? null),
  )

  const domini = sequenze.map((s) => indici.get(s.caselle.length).tutte.slice())
  const scelte = new Array(sequenze.length).fill(-1)
  const usate = new Set()

  // Un rumore per parola, fisso per tutto il riempimento: l'ordine dei tentativi
  // cambia da uno schema all'altro, e dentro lo stesso schema resta coerente.
  const rumore = new Map()
  for (const [n, { parole }] of indici) {
    rumore.set(
      n,
      Float64Array.from(parole, (p) => rng() - (evita.has(p.parola) ? PENALITA_RECENTE : 0)),
    )
  }

  let nodi = 0

  function migliori(si) {
    const n = sequenze[si].caselle.length
    const { parole } = indici.get(n)
    const r = rumore.get(n)
    const dominio = domini[si]
    const scelti = []
    for (let b = 0; b < dominio.length; b += 1) {
      let v = dominio[b]
      while (v) {
        const bit = 31 - Math.clz32(v & -v)
        v &= v - 1
        const k = (b << 5) + bit
        const punti = parole[k].q * PESO_QUALITA + r[k]
        if (scelti.length < RAMI) {
          scelti.push([punti, k])
          scelti.sort((x, y) => y[0] - x[0])
        } else if (punti > scelti[RAMI - 1][0]) {
          scelti[RAMI - 1] = [punti, k]
          scelti.sort((x, y) => y[0] - x[0])
        }
      }
    }
    return scelti.map(([, k]) => k)
  }

  function passo() {
    nodi += 1
    if (nodi > budget) return false

    // La sequenza con meno parole possibili: e' quella che fallirebbe prima.
    let scelta = -1
    let minimo = Infinity
    for (let si = 0; si < sequenze.length; si += 1) {
      if (scelte[si] >= 0) continue
      const quante = contaBit(domini[si])
      if (quante < minimo) {
        minimo = quante
        scelta = si
      }
    }
    if (scelta < 0) return true
    if (minimo === 0) return false

    const n = sequenze[scelta].caselle.length
    const { parole } = indici.get(n)
    for (const k of migliori(scelta)) {
      const parola = parole[k].parola
      if (usate.has(parola)) continue

      const ripristino = []
      let tiene = true
      for (let i = 0; i < n && tiene; i += 1) {
        const incrocio = incroci[scelta][i]
        if (!incrocio) continue
        const [sj, j] = incrocio
        if (scelte[sj] >= 0) continue
        const maschera = indici.get(sequenze[sj].caselle.length).posizioni[j][INDICE[parola[i]]]
        const prima = domini[sj]
        const dopo = new Uint32Array(prima.length)
        let vuoto = true
        for (let t = 0; t < prima.length; t += 1) {
          dopo[t] = prima[t] & maschera[t]
          if (dopo[t]) vuoto = false
        }
        ripristino.push([sj, prima])
        domini[sj] = dopo
        if (vuoto) tiene = false
      }

      if (tiene) {
        const dominioPrima = domini[scelta]
        const solo = new Uint32Array(dominioPrima.length)
        solo[k >>> 5] = 1 << (k & 31)
        domini[scelta] = solo
        scelte[scelta] = k
        usate.add(parola)
        if (passo()) return true
        usate.delete(parola)
        scelte[scelta] = -1
        domini[scelta] = dominioPrima
      }
      for (let t = ripristino.length - 1; t >= 0; t -= 1) domini[ripristino[t][0]] = ripristino[t][1]
      if (nodi > budget) return false
    }
    return false
  }

  if (!passo()) return null
  return sequenze.map((s, si) => ({ ...s, voce: indici.get(s.caselle.length).parole[scelte[si]] }))
}

/**
 * Quanto e' buono un riempimento: la qualita' media delle parole, pesata sulla
 * lunghezza — una parola lunga e comune e' il cuore di uno schema — meno le
 * sigle e le parole gia' uscite nei giorni prima.
 */
export function valuta(riempimento, evita = new Set()) {
  let somma = 0
  let peso = 0
  let sigle = 0
  let ripetute = 0
  for (const { voce } of riempimento) {
    const n = voce.parola.length
    somma += voce.q * n
    peso += n
    if (voce.sigla) sigle += 1
    if (n >= 3 && evita.has(voce.parola)) ripetute += 1
  }
  return { punti: somma / peso - 0.02 * sigle - 0.08 * ripetute, sigle, ripetute }
}

/** Da quanto e' comune una parola da cui nasce una definizione da enigmista: fra le prime seimila. */
const QUALITA_ENIGMISTA = 0.2

/** Fra quante definizioni da enigmista, dalle parole piu' comuni, si pesca. */
const SCELTA_ENIGMISTA = 8

/** Le definizioni da enigmista: non le ha il dizionario, e `correggiDefinizioni` le lascia stare. */
export const DA_ENIGMISTA = /^(?:Inizio di|Fine di|Il cuore di|Le vocali di|Le consonanti di|Le lettere (?:pari|dispari) di) [a-z]+$/

const comuniPerIndici = new WeakMap()

/**
 * Le parole da cui nascono le definizioni da enigmista: lemmi senza accenti,
 * da quattro a nove lettere, fra le piu' comuni, dalla piu' comune.
 */
function comuniDi(indici) {
  let comuni = comuniPerIndici.get(indici)
  if (!comuni) {
    comuni = []
    for (const [n, { parole }] of indici) {
      if (n < 4 || n > 9) continue
      for (const p of parole) {
        if (p.q >= QUALITA_ENIGMISTA && !p.sigla && p.definizioni.some((d) => d.voce === p.parola)) comuni.push(p)
      }
    }
    comuni = comuni.sort((a, b) => b.q - a.q).map((p) => p.parola)
    comuniPerIndici.set(indici, comuni)
  }
  return comuni
}

const VOCALI = 'aeiou'

/**
 * Le definizioni da enigmista di una parola corta, come nei cruciverba della
 * Settimana Enigmistica: "Il cuore di Milano" per LA, "Inizio di tavolo" per
 * TA, "Le vocali di farina" per AIA. Sono giuste per costruzione — la parola e'
 * dentro la parola che le da' — e ce ne sono a centinaia: le parole di due e tre
 * lettere sono meno di seicento, ne servono una ventina a schema, e con le sole
 * definizioni del Wikizionario IL era "Articolo determinativo maschile singolare"
 * tredici volte in un mese. Dalla parola piu' comune.
 */
export function definizioniDaEnigmista(parola, comuni) {
  const n = parola.length
  const vocali = (x) => [...x].filter((c) => VOCALI.includes(c)).join('')
  const consonanti = (x) => [...x].filter((c) => !VOCALI.includes(c)).join('')
  const pari = (x) => [...x].filter((_, i) => i % 2 === 1).join('')
  const dispari = (x) => [...x].filter((_, i) => i % 2 === 0).join('')
  const tutteVocali = vocali(parola) === parola
  const tutteConsonanti = consonanti(parola) === parola
  const trovate = []
  for (const x of comuni) {
    const resto = x.length - n
    if (x.startsWith(parola)) trovate.push(`Inizio di ${x}`)
    if (x.endsWith(parola)) trovate.push(`Fine di ${x}`)
    if (resto >= 2 && resto % 2 === 0 && x.slice(resto / 2, resto / 2 + n) === parola) trovate.push(`Il cuore di ${x}`)
    if (tutteVocali && vocali(x) === parola) trovate.push(`Le vocali di ${x}`)
    if (tutteConsonanti && consonanti(x) === parola) trovate.push(`Le consonanti di ${x}`)
    if (pari(x) === parola) trovate.push(`Le lettere pari di ${x}`)
    if (dispari(x) === parola) trovate.push(`Le lettere dispari di ${x}`)
  }
  return trovate
}

/**
 * Sceglie la definizione di ogni parola: la prima del Wikizionario che la
 * parola non ha avuto di recente, e il senso principale viene prima.
 * "Macchina da assedio usata nel medioevo" e' un senso vero di GATTO, ma in uno
 * schema e' un tranello — e pescare a caso fra i sensi dava a OCA quello
 * figurato e a IO la grammatica del predicato nominale —; dopo i primi sensi
 * vengono i sinonimi ("Micio"), poi gli altri.
 *
 * `recenti` sono le definizioni che ogni parola ha avuto negli schemi dei giorni
 * prima (parola → testi in minuscolo): una parola che torna prende la prossima.
 * Una parola corta che le ha avute tutte prende una definizione da enigmista
 * (`definizioniDaEnigmista`), pescata con `rng` fra le prime; una lunga, che
 * torna di rado, riparte dalla prima. Due definizioni uguali nello stesso schema
 * ("Qui, in questo luogo" per CI e per VI) non ci sono mai.
 */
export function scegliDefinizioni(riempimento, { recenti = new Map(), rng = () => 0, comuni = [] } = {}) {
  const gia = new Set()
  const nelloSchema = new Set(riempimento.map(({ voce }) => voce.parola))
  const definizioni = {}
  for (const { chiave, voce } of riempimento) {
    const dette = recenti.get(voce.parola)
    const libera = (t) => !gia.has(t.toLowerCase()) && !dette?.has(t.toLowerCase())
    const proprie = voce.definizioni.filter((d) => !d.sigla)
    const elenco = proprie.length > 0 ? proprie : voce.definizioni
    let d = elenco.find((x) => libera(x.testo))
    if (!d && voce.parola.length <= 3) {
      const scelte = definizioniDaEnigmista(voce.parola, comuni).filter(
        (t) => libera(t) && !nelloSchema.has(t.slice(t.lastIndexOf(' ') + 1)),
      )
      if (scelte.length > 0) {
        const testo = scelte[Math.floor(rng() * Math.min(SCELTA_ENIGMISTA, scelte.length))]
        d = { testo, voce: elenco[0].voce, nota: '' }
      }
    }
    d ??= elenco.find((x) => !gia.has(x.testo.toLowerCase())) ?? elenco[0]
    gia.add(d.testo.toLowerCase())
    // "Sigla automobilistica di Sassari (sigla)" direbbe due volte la stessa cosa.
    const nota = d.nota === 'sigla' && GIA_SIGLA.test(d.testo) ? '' : d.nota
    definizioni[chiave] = { testo: d.testo, voce: d.voce, nota }
  }
  return definizioni
}

/**
 * Le definizioni di uno schema gia' scritto, rimesse d'accordo con il
 * dizionario di adesso. Una definizione che il dizionario non ha piu' — il
 * filtro l'ha scartata dopo, come "L'universalità dei, ovverosia…" per EREDITÀ
 * — lascia il posto a quella che sceglierebbe `scegliDefinizioni`. La griglia
 * non cambia, e nemmeno le altre definizioni.
 *
 * `salvate` e' il JSON della colonna (`{ o20: { t, v, n } }`), `perParola` la
 * mappa parola → voce di `leggiDefinizioni`. Restituisce le definizioni
 * corrette e quel che e' cambiato, o `null` se non c'e' niente da correggere.
 */
export function correggiDefinizioni(soluzione, righe, colonne, salvate, perParola) {
  const nere = [...soluzione].map((c) => c === '#')
  const gia = new Set(Object.values(salvate).map((d) => d.t.toLowerCase()))
  let definizioni = null
  const cambiate = []
  for (const { chiave, caselle } of sequenzeDi(nere, righe, colonne)) {
    const salvata = salvate[chiave]
    const parola = caselle.map((k) => soluzione[k]).join('')
    const voce = perParola.get(parola)
    if (!salvata || !voce) continue
    if (DA_ENIGMISTA.test(salvata.t)) continue
    if (voce.definizioni.some((d) => d.testo.toLowerCase() === salvata.t.toLowerCase())) continue
    const proprie = voce.definizioni.filter((d) => !d.sigla)
    const elenco = proprie.length > 0 ? proprie : voce.definizioni
    const d = elenco.find((x) => !gia.has(x.testo.toLowerCase())) ?? elenco[0]
    if (!d) continue
    gia.add(d.testo.toLowerCase())
    const nota = d.nota === 'sigla' && GIA_SIGLA.test(d.testo) ? '' : d.nota
    definizioni ??= { ...salvate }
    definizioni[chiave] = nota ? { t: d.testo, v: d.voce, n: nota } : { t: d.testo, v: d.voce }
    cambiate.push({ chiave, parola, prima: salvata.t, dopo: d.testo })
  }
  return definizioni && { definizioni, cambiate }
}

/**
 * Lo schema di un giorno.
 *
 * `evita` sono le parole uscite di recente: non sono vietate — le parole corte
 * tornano per forza — ma scendono in fondo all'ordine dei tentativi, e un
 * riempimento che ne usa molte perde il confronto con gli altri. `recenti` le
 * definizioni che le parole hanno avuto di recente (vedi `scegliDefinizioni`).
 */
export function generaCruciverba({
  indici,
  seme,
  righe = 10,
  colonne = 10,
  schemi = 100,
  evita = new Set(),
  recenti = new Map(),
  forma = {},
}) {
  const rng = mulberry32(seme)
  let migliore = null
  for (let i = 0; i < schemi; i += 1) {
    const schema = disegnaSchema(rng, righe, colonne, forma)
    if (!schema) continue
    const riempimento = riempi(schema, righe, colonne, indici, rng, { evita })
    if (!riempimento) continue
    const voto = valuta(riempimento, evita)
    if (voto.sigle > MASSIMO_SIGLE) continue
    if (!migliore || voto.punti > migliore.voto.punti) migliore = { schema, riempimento, voto }
  }
  if (!migliore) return null

  const griglia = migliore.schema.map((nera) => (nera ? '#' : ''))
  for (const { caselle, voce } of migliore.riempimento) {
    caselle.forEach((k, i) => {
      griglia[k] = voce.parola[i]
    })
  }
  return {
    righe,
    colonne,
    griglia: griglia.join(''),
    definizioni: scegliDefinizioni(migliore.riempimento, { recenti, rng, comuni: comuniDi(indici) }),
    parole: migliore.riempimento.map(({ voce }) => voce.parola),
    voto: migliore.voto,
  }
}

// ---------------------------------------------------------------------------
// Per lo script che scrive in D1
// ---------------------------------------------------------------------------

/** Il seme di una giornata: fisso, così lo stesso giorno da' sempre lo stesso schema. */
export function semeDelGiorno(numero) {
  return (0xc40c1 ^ Math.imul(numero, 0x9e3779b1)) >>> 0
}

/**
 * Il seme di uno schema libero: una sequenza sua, con un altro moltiplicatore,
 * perché lo schema libero numero 30 non sia il cruciverba del giorno 30.
 */
export function semeLibero(numero) {
  return (0x11be7a ^ Math.imul(numero, 0x85ebca6b)) >>> 0
}

/**
 * Le parole di una soluzione salvata, per tenerle lontane dagli schemi dei
 * giorni dopo. Solo quelle da quattro lettere in su: le corte tornano per
 * forza, e contarle come ripetizioni vorrebbe dire non poter usare "re".
 */
export function paroleDellaSoluzione(soluzione, righe, colonne, minima = 4) {
  const nere = [...soluzione].map((c) => c === '#')
  return sequenzeDi(nere, righe, colonne)
    .map((s) => s.caselle.map((k) => soluzione[k]).join(''))
    .filter((p) => p.length >= minima)
}

/** Le parole di uno schema gia' scritto con la loro definizione: `[parola, testo]`. */
export function definizioniDellaSoluzione(soluzione, righe, colonne, salvate) {
  const nere = [...soluzione].map((c) => c === '#')
  return sequenzeDi(nere, righe, colonne)
    .filter((s) => salvate[s.chiave])
    .map((s) => [s.caselle.map((k) => soluzione[k]).join(''), salvate[s.chiave].t])
}

/** Le definizioni come le salva D1: `{ o12: { t, v, n } }`. */
function definizioniSalvate(cruciverba) {
  const definizioni = {}
  for (const [chiave, d] of Object.entries(cruciverba.definizioni)) {
    definizioni[chiave] = d.nota ? { t: d.testo, v: d.voce, n: d.nota } : { t: d.testo, v: d.voce }
  }
  return definizioni
}

const cita = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * L'istruzione SQL che salva uno schema. `INSERT OR IGNORE`: uno schema scritto
 * non cambia. `libero` lo scrive fra gli schemi liberi, col suo numero; uno del
 * giorno porta il suo `formato`.
 */
export function istruzioneSql(numero, cruciverba, adesso, libero = false, formato = null) {
  const colonne = ['righe', 'colonne', 'soluzione', 'definizioni', 'created_at']
  const valori = [
    numero,
    cruciverba.righe,
    cruciverba.colonne,
    cita(cruciverba.griglia),
    cita(JSON.stringify(definizioniSalvate(cruciverba))),
    cita(adesso),
  ]
  if (!libero && formato !== null) {
    colonne.push('formato')
    valori.push(formato)
  }
  return (
    (libero
      ? 'INSERT OR IGNORE INTO cruciverba_schemi_liberi (id, '
      : 'INSERT OR IGNORE INTO cruciverba_schemi (puzzle_number, ') +
    colonne.join(', ') +
    ') VALUES (' +
    valori.join(', ') +
    ');'
  )
}

/**
 * L'istruzione che rifa' uno schema del giorno di un formato vecchio: solo se e'
 * ancora di quel formato e nessuno l'ha aperto, cosi' una partita cominciata nel
 * frattempo tiene lo schema che ha visto.
 */
export function istruzioneRifai(numero, cruciverba, adesso, formato = 2) {
  return (
    `UPDATE cruciverba_schemi SET righe = ${cruciverba.righe}, colonne = ${cruciverba.colonne}, ` +
    `soluzione = ${cita(cruciverba.griglia)}, definizioni = ${cita(JSON.stringify(definizioniSalvate(cruciverba)))}, ` +
    `formato = ${formato}, created_at = ${cita(adesso)} ` +
    `WHERE puzzle_number = ${numero} AND formato < ${formato} ` +
    `AND NOT EXISTS (SELECT 1 FROM cruciverba_games WHERE puzzle_number = ${numero});`
  )
}
