/**
 * Le regole che decidono quali definizioni del Wikizionario diventano
 * definizioni di un cruciverba.
 *
 * Nessuna definizione e' scritta qui: si prende il testo della voce e lo si
 * accorcia, senza riformularlo. Quello che questo modulo fa e' **scartare**:
 * una definizione che contiene la risposta, una che e' un rimando ("variante
 * di…"), una rimasta mozza perché l'estrazione ha tolto un collegamento.
 *
 * Sta in un modulo a parte, e non dentro lo script che scarica il dump, perché
 * sono regole da provare una per una: vedi scripts/__tests__/cruciverba-definizioni.test.ts.
 */

const ACCENTI = {
  à: 'a', á: 'a', â: 'a', ä: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', ö: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
}

/** Le 21 lettere della tastiera del gioco: la stessa regola del Wordle e dello Scarabeo. */
export const RISPOSTA = /^[abcdefghilmnopqrstuvz]{2,12}$/

/** Una definizione piu' lunga di cosi' non sta in due righe sopra la tastiera. */
export const LUNGHEZZA_MASSIMA = 100

/**
 * Sotto queste misure un taglio lascia un frammento, non una definizione. Alla
 * virgola serve piu' margine: "nei confronti di un figlio o di una figlia, il
 * padre del padre…" tagliato lì lascia l'inciso e perde la definizione.
 */
const TAGLIO_MINIMO = 24
const TAGLIO_ALLA_VIRGOLA = 45

/**
 * I sensi con queste etichette non entrano: sono parole che un collega non
 * conosce (arcaiche, letterarie, regionali) o che non vuole trovarsi nello
 * schema (volgari, offensive).
 */
export const ETICHETTE_ESCLUSE = new Set([
  'archaic',
  'dialectal',
  'literary',
  'no-gloss',
  'obsolete',
  'offensive',
  'pejorative',
  'rare',
  'regional',
  'slang',
  'vulgar',
])

/** Le parti del discorso che possono essere una risposta. */
export const CATEGORIE = new Set([
  'abbrev',
  'adj',
  'adv',
  'article',
  'conj',
  'intj',
  'name',
  'noun',
  'num',
  'prep',
  'pron',
  'symbol',
  'verb',
])

/**
 * Definizioni che non definiscono. Le prime sono i segnaposto del Wikizionario,
 * poi i rimandi a un'altra voce, poi le descrizioni grammaticali delle forme
 * flesse, poi i nomi propri generici: "nome proprio di persona maschile" va bene
 * per mille risposte, quindi per nessuna.
 */
const VIETATE = [
  /definizione mancante/,
  /aggiungila tu/,
  /^vedi\b/,
  /\bvariante\b/,
  /^forma (?:alternativa|antica|arcaica|abbreviata|contratta|letteraria|poetica|tronca)\b/,
  /^(?:prima|seconda|terza) persona\b/,
  /^(?:participio|gerundio|infinito|imperativo|congiuntivo|indicativo)\b/,
  /^(?:maschile|femminile) (?:singolare|plurale)\b/,
  /^plurale\b/,
  /^nome (?:proprio|di persona|maschile|femminile|di varie|di diverse|di alcune)\b/,
  /^cognome\b/,
  /^(?:sigla|simbolo|abbreviazione|acronimo) di$/,
  /https?:|www\.|\[\[|\]\]|\{\{|\}\}|=/,
  // Rimandi al senso precedente: "le foglie delle suddette piante".
  /\bsuddett[aeio]\b/,
  // Descrizioni grammaticali dei pronomi: "in funzione di predicato nominale".
  /^in funzione di\b/,
  // Glosse rimaste in inglese: "The letter m, M" per EMME.
  /\b(?:the|of|and|letter)\b/,
]

/** Parole con cui una definizione non puo' finire: e' il segno di un collegamento tolto. */
const FINALI_MOZZI = new Set([
  'a', 'ad', 'al', 'alla', 'con', 'da', 'dal', 'dalla', 'dei', 'del', 'della', 'delle', 'di',
  'e', 'ed', 'fra', 'gli', 'i', 'il', 'in', 'la', 'le', 'lo', 'nel', 'nella', 'o', 'per', 'su',
  'tra', 'un', 'una', 'uno',
  // Un taglio alla virgola che lascia aperta una relativa: "…di una o più branche, il quale".
  'che', 'cioè', 'come', 'cui', 'dove', 'ma', 'mentre', 'oppure', 'ovvero', 'quale', 'quali',
  'quando', 'se',
  // …o una frase che aspetta il seguito: "da usare solo", "per significare".
  'anche', 'comunque', 'indicare', 'significare', 'solo', 'soltanto',
])

/** Le preposizioni con cui comincia un inciso: "…ovvero, in senso ampio". */
const INCISO = /^(?:a|ad|con|da|di|fra|in|per|su|tra)\s/i

export function senzaAccenti(testo) {
  return testo.replace(/[àáâäèéêëìíîïòóôöùúûü]/g, (c) => ACCENTI[c])
}

/** La forma che va nello schema, o `null` se non si puo' scrivere con le 21 lettere. */
export function normalizzaRisposta(parola) {
  const forma = senzaAccenti(parola.trim().toLowerCase())
  return RISPOSTA.test(forma) ? forma : null
}

/**
 * Dove accorciare una definizione troppo lunga.
 *
 * Prima all'ultima virgola che lascia una frase finita — tagliare prima di "il
 * quale" darebbe una definizione sospesa — poi, se virgole non ce ne sono,
 * prima di una relativa o di un complemento che aggiunge un dettaglio:
 * "Uccello domestico degli Anseriformi di notevoli dimensioni | con i piedi a
 * forma di pinna". Quel che resta davanti e' gia' una definizione intera.
 */
const ATTACCHI = [' la cui ', ' il cui ', ' le cui ', ' i cui ', ' che ', ' con ', ' dotat', ' in cui ', ' dove ', ' usat', ' utilizzat']

function puntoDiTaglio(d) {
  let taglio = d.lastIndexOf(', ', LUNGHEZZA_MASSIMA)
  while (taglio >= TAGLIO_ALLA_VIRGOLA) {
    const tenuto = d.slice(0, taglio)
    const ultimoPezzo = tenuto.slice(tenuto.lastIndexOf(', ') + 2)
    const inciso = tenuto.includes(', ') && ultimoPezzo.length < 20 && INCISO.test(ultimoPezzo)
    if (!finisceMozza(tenuto) && !inciso) break
    taglio = d.lastIndexOf(', ', taglio - 1)
  }
  if (taglio >= TAGLIO_ALLA_VIRGOLA) return taglio
  let migliore = -1
  for (const attacco of ATTACCHI) {
    const i = d.lastIndexOf(attacco, LUNGHEZZA_MASSIMA)
    if (i >= TAGLIO_MINIMO && i > migliore && !finisceMozza(d.slice(0, i))) migliore = i
  }
  return migliore
}

function bilanciate(testo) {
  let aperte = 0
  for (const c of testo) {
    if (c === '(') aperte += 1
    else if (c === ')') {
      aperte -= 1
      if (aperte < 0) return false
    }
  }
  return aperte === 0
}

/**
 * Accorcia una definizione del Wikizionario senza riscriverla.
 *
 * Tiene la prima proposizione — dopo il punto e virgola arrivano di solito la
 * classificazione scientifica, un esempio, una nota d'uso — e, se ancora non
 * sta in una riga, taglia all'ultima virgola utile. Restituisce `null` quando
 * il taglio lascerebbe un frammento.
 */
export function pulisciDefinizione(grezza) {
  let d = grezza
    // "In funzione di soggetto: la persona a cui si parla" — la definizione e'
    // dopo i due punti, prima c'e' la grammatica.
    .replace(/^in funzione di [^:]{1,40}:\s*/i, '')
    // Residui dei modelli: "( tassonomia)", "( approfondimento)".
    .replace(/\(\s+[^()]*\)/g, ' ')
    // Parentesi rimaste vuote, o con dentro solo un rimando.
    .replace(/\((?:\s*|di|x|\d+|vedi|vedi sotto|raro|fig\.?)\)/gi, ' ')
    .replace(/[\t\r\n]+/g, ' ')
    // La barra separa voce e testo nel file delle definizioni.
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;.:!?)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim()

  // La prima proposizione. Anche una parentesi chiusa seguita da una maiuscola
  // chiude la frase: "Dolore (nel linguaggio infantile) Forse deriva da…".
  d = d.split(/;\s*|\.\s+|(?<=\))\s+(?=[A-Z])/)[0]
  d = d.replace(/,?\s+(?:e sim|ecc|etc)\.?$/i, '')
  d = d.replace(/^[\s\-–—:,]+/, '').replace(/[\s,:;.\-–—]+$/, '')

  if (d.length > LUNGHEZZA_MASSIMA) {
    const taglio = puntoDiTaglio(d)
    if (taglio < 0) return null
    d = d.slice(0, taglio)
  }

  if (!bilanciate(d)) {
    // Il taglio e' caduto dentro una parentesi: si toglie l'inciso aperto.
    const aperta = d.lastIndexOf('(')
    if (aperta < TAGLIO_MINIMO) return null
    d = d.slice(0, aperta).replace(/[\s,:;.\-–—]+$/, '')
    if (!bilanciate(d)) return null
  }

  if (d.length < 3) return null
  return d.charAt(0).toUpperCase() + d.slice(1)
}

/**
 * La definizione contiene la risposta, o la sua radice?
 *
 * "Che regola" per REGOLATORE, "in modo irato" per IRATAMENTE: definizioni
 * giuste in un dizionario, inutili in uno schema. Per le parole corte conta
 * solo la parola intera — "re" sta dentro "regione" e non rivela niente — per
 * le altre un prefisso comune che copra piu' di meta' della risposta.
 */
export function rivelaLaRisposta(definizione, risposta) {
  const n = risposta.length
  const radice = Math.max(4, Math.ceil(n * 0.6))
  // Gli avverbi in -mente hanno per radice l'aggettivo: IRATAMENTE e' "irat-".
  const avverbio = risposta.endsWith('mente') ? risposta.slice(0, -5).replace(/[aeiou]$/, '') : null
  const parole = senzaAccenti(definizione.toLowerCase()).split(/[^a-z]+/)
  for (const p of parole) {
    if (!p) continue
    if (avverbio && avverbio.length >= 4 && p.startsWith(avverbio)) return true
    if (p === risposta) return true
    if (n <= 3) continue
    let comune = 0
    while (comune < p.length && comune < n && p[comune] === risposta[comune]) comune += 1
    if (comune >= radice) return true
    // Il plurale o il femminile: "cani" nella definizione di CANE.
    if (comune >= n - 1 && Math.abs(p.length - n) <= 1) return true
    // Anche dentro: "atomo formato da antimateria" per ANTIATOMO.
    if (p.length >= 4 && p.length * 2 >= n && risposta.includes(p)) return true
  }
  return false
}

function finisceMozza(testo) {
  const ultima = testo.toLowerCase().split(/[^a-zàèéìòù]+/).filter(Boolean).at(-1)
  if (!ultima || FINALI_MOZZI.has(ultima)) return true
  // "…un discorso che, anche estrapolata e presa a sé stante": la relativa si e'
  // aperta con un inciso e il taglio l'ha lasciata senza il suo verbo.
  return /\bche,/.test(testo)
}

/** Si puo' usare questa definizione (gia' pulita) per questa risposta? */
export function definizioneAccettabile(definizione, risposta) {
  if (!definizione) return false
  const minuscola = definizione.toLowerCase()
  if (VIETATE.some((re) => re.test(minuscola))) return false
  if (finisceMozza(definizione)) return false
  // "Pensioni per cani: luoghi" — il taglio ha lasciato dopo i due punti un
  // moncherino invece della spiegazione.
  const dopoDuePunti = definizione.split(':').slice(1).join(':').trim()
  if (definizione.includes(':') && dopoDuePunti.split(/\s+/).length < 3) return false
  return !rivelaLaRisposta(definizione, risposta)
}

/** Le voci che sono sigle: la definizione e' lo scioglimento, e va detto. */
export const SIGLE = new Set(['abbrev', 'symbol'])

/**
 * Le forme flesse di nomi e aggettivi: "plurale di ala", "femminile plurale di
 * buono". Nel cruciverba italiano sono la meta' delle parole corte — ALI, OCHE,
 * CARI — e senza di loro uno schema pieno non si riempie con parole comuni.
 *
 * La definizione pero' non e' "plurale di ala", che darebbe la risposta: e' la
 * definizione di ALA, con accanto la nota "plurale". Il solutore deve trovare la
 * parola e poi volgerla, come in un cruciverba vero.
 */
const FORMA = /^(femminile |maschile )?(singolare |plurale )?(femminile |maschile )?(?:e femminile plurali? )?di ([^\s,;]+)$/i

/** La nota di una forma flessa (`plurale`, `femminile`…), o `null` se non e' una forma che si usa. */
export function notaDellaForma(glossa) {
  const m = FORMA.exec(glossa.trim())
  if (!m) return null
  const genere = (m[1] ?? m[3] ?? '').trim().toLowerCase()
  const numero = (m[2] ?? '').trim().toLowerCase()
  const plurale = numero === 'plurale' || /plurali?/i.test(glossa)
  if (genere === 'femminile') return plurale ? 'femminile plurale' : 'femminile'
  if (plurale) return 'plurale'
  return null
}

/**
 * Le forme flesse di una voce del dump: `[{ lemma, nota, pos }]`. La parte del
 * discorso serve a prendere la definizione giusta del lemma: ORE e' il plurale
 * del nome "ora", non dell'avverbio "in questo momento".
 */
export function formeDellaVoce(voce) {
  if (voce.pos !== 'noun' && voce.pos !== 'adj') return []
  const trovate = []
  for (const senso of voce.senses ?? []) {
    if (!(senso.tags ?? []).includes('form-of')) continue
    const lemma = senso.form_of?.[0]?.word
    const glossa = senso.glosses?.[0]
    if (!lemma || !glossa) continue
    const nota = notaDellaForma(glossa)
    if (nota && !trovate.some((f) => f.lemma === lemma && f.nota === nota)) {
      trovate.push({ lemma, nota, pos: voce.pos })
    }
  }
  return trovate
}

/**
 * Tutte le definizioni utili di una voce del dump, gia' pulite.
 *
 * `voce` e' una riga di wiktextract: `{ word, pos, senses: [{ glosses, tags }] }`.
 * Ogni definizione porta una nota: "sigla" quando la risposta e' una sigla — lo
 * schema la mostra accanto al testo, come fanno i dizionari con "abbr.", perché
 * "Unione Europea" da solo farebbe cercare una parola di quattordici lettere.
 */
export function definizioniDellaVoce(voce, risposta) {
  if (!CATEGORIE.has(voce.pos)) return []
  const sigla = SIGLE.has(voce.pos)
  const trovate = []
  for (const senso of voce.senses ?? []) {
    const etichette = senso.tags ?? []
    if (etichette.includes('form-of')) continue
    if (etichette.some((t) => ETICHETTE_ESCLUSE.has(t))) continue
    const glosse = senso.glosses ?? []
    // Con due glosse la seconda e' il senso specifico, la prima l'intestazione
    // che lo introduce ("nome di varie località, tra cui:").
    const grezza = glosse.at(-1)
    if (!grezza) continue
    const pulita = pulisciDefinizione(grezza)
    if (!pulita || !definizioneAccettabile(pulita, risposta)) continue
    // Una sigla sciolta in una parola sola e' quasi sempre un'abbreviazione da
    // messaggino — "cs" per "cosa", "nn" per "non" — e come definizione
    // manderebbe a cercare la parola intera.
    if (sigla && !pulita.includes(' ')) continue
    // Una parola sola con lettere che l'italiano non usa e' una traduzione
    // inglese finita nel posto della definizione: "Hyperbaric" per IPOBARICO.
    // Una parola sola con la maiuscola e' un rimando a un nome: "Asben" per AIR.
    if (!pulita.includes(' ') && (/[jkwxy]/i.test(pulita) || /^[A-Z]/.test(grezza.trim()))) continue
    // Una definizione che e' solo una parola fra virgolette ("forte" per RUDE)
    // e' un rimando, non una definizione.
    if (/^"[^"]*"$/.test(pulita)) continue
    trovate.push({ testo: pulita, voce: voce.word, nota: sigla ? 'sigla' : '', pos: voce.pos })
  }
  return trovate
}
