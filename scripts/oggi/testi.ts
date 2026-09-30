/**
 * I testi di "Accadde oggi": la frase del fatto, che deve stare in piedi da
 * sola e non dire il proprio anno, e le prime frasi della voce che lo racconta.
 *
 * Le frasi del feed arrivano fino a quattrocento caratteri, e una carta del
 * quiz ne regge duecento: quelle lunghe si accorciano togliendo i pezzi che la
 * grammatica dice accessori — una coda dopo un punto e virgola, un inciso fra
 * due virgole, un complemento dopo il verbo — e mai il verbo o il nome del
 * fatto. Senza un'analisi vera della frase le regole sono prudenti: nel dubbio
 * la frase resta lunga, e un fatto con una frase lunga entra solo se serve.
 */

/** Oltre, una frase non ci sta su una carta del quiz. */
export const LUNGHEZZA_MASSIMA = 200

/** La scheda della voce: una o due frasi, fino a qui. */
export const LUNGHEZZA_SCHEDA = 300

/** Le abbreviazioni dopo cui un punto non chiude la frase. */
const ABBREVIAZIONI = new Set(
  [
    'ca c ecc etc sec secc n nn p pp s ss st sig sigg',
    'dott prof ing avv on gen col cap lett vol art mons fra geom rag arch mt mr mrs ms dr jr sr vs',
    // "Sgt. Pepper's…", "Sinfonia n. 9 op. 125", "Loving v. Virginia", "Warner Bros. Pictures".
    'op sgt lt capt magg ten serg cav comm ltd inc cfr fig pag v bros',
  ]
    .join(' ')
    .split(' '),
)

/**
 * "Attentati di Christchurch." → "Attentati di Christchurch": spazi, note fra
 * quadre, punteggiatura doppia o in fondo, e le parentesi che dicono il
 * secolo — "La Grecia adotta l'euro (iniziano XXI secolo e III millennio)" ha
 * la risposta fra parentesi.
 */
export function pulisci(testo: string): string {
  let t = testo
    .replace(/\[[^\]]{0,40}\]/g, '')
    .replace(/\s*\([^()]*\b(?:secol[oi]|millenni[oa])\b[^()]*\)/giu, '')
    .replace(/\s+/g, ' ')
    // "…del primo Giubileo ; con la bolla…", "…di Farrell , la liberazione…".
    .replace(/ ([,;:])/g, '$1')
    .replace(/ \.(?= |$)/g, '.')
    .replace(/\s*([,;:])(?:\s*[,;:])+/g, '$1')
    .trim()
  // Il punto di "a.C." in fondo resta: e' dell'abbreviazione.
  while (/[\s.;,:]$/.test(t) && !/\b[a-z]\.[A-Z]\.$/.test(t)) t = t.slice(0, -1)
  return t
}

function maiuscola(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const semplice = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Le parole di un titolo o di una frase, senza accenti, da quattro lettere in su. */
export function parole(t: string): Set<string> {
  return new Set(
    semplice(t.replace(/_/g, ' '))
      .split(' ')
      .filter((p) => p.length >= 4),
  )
}

/** Le parole che non dicono di che cosa si parla: preposizioni, pronomi, i verbi e gli aggettivi di ogni fatto. */
const VUOTE = new Set(
  [
    'dell della delle degli dello dall dalla dalle dagli dallo nell nella nelle negli nello sull sulla sulle sugli',
    'sullo alla alle agli allo come dopo prima primo prime primi ultimo ultima viene vengono sono stato stata stati',
    'essere anche questo questa quale quali tutti tutte loro suoi nuovo nuova grande esce escono dove quando',
    'mentre contro verso circa oltre ogni durante presso anni anno giorno giorni parte entra diventa',
  ]
    .join(' ')
    .split(' '),
)

/** Le parole di una frase o di un titolo che dicono di che cosa si parla. */
export function significative(t: string): Set<string> {
  return new Set([...parole(t)].filter((p) => !VUOTE.has(p)))
}

/** La stessa parola a meno della desinenza: "assassinio" e "assassinato", "sovietica" e "sovietico". */
export function simili(a: string, b: string): boolean {
  return a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5))
}

/** Parentesi e virgolette chiuse: un taglio non deve lasciarne una aperta. */
function bilanciato(t: string): boolean {
  const conta = (c: string) => t.split(c).length - 1
  return conta('(') === conta(')') && conta('«') === conta('»') && conta('"') % 2 === 0
}

/** Il punto in `i` chiude una frase? Non dopo un'abbreviazione o un'iniziale ("J. R. R. Tolkien"). */
function fineDiFrase(t: string, i: number): boolean {
  const prima = /([\p{L}.]+)$/u.exec(t.slice(0, i))?.[1] ?? ''
  if (/^\p{Lu}$/u.test(prima)) return false
  if (/\p{L}\.\p{L}$/u.test(prima) && !/^[ad]\.C$/.test(prima)) return false
  return !ABBREVIAZIONI.has(prima.toLowerCase())
}

/* ───────────────────────────────  Accorciare  ────────────────────────────── */

/** Le parole in -ando e -endo che non sono gerundi. */
const NON_GERUNDI = new Set([
  'quando',
  'comando',
  'bando',
  'contrabbando',
  'tremendo',
  'stupendo',
  'orrendo',
  'reverendo',
  'dividendo',
  'nefando',
])

const GERUNDIO = '\\p{Ll}+(?:ando|endo)\\b'
const GERUNDIO_DOPO_SPAZIO = new RegExp(`^ (${GERUNDIO})`, 'u')

/**
 * L'inizio di un inciso che si chiude alla virgola dopo: un participio (",
 * catturati a Dongo…", ", composto da ufficiali…", anche dopo un avverbio: ",
 * già asserragliato nel suo bunker"), un gerundio, una preposizione che apre un
 * complemento (", davanti a una sessione del Congresso"). Non un nome proprio:
 * in "Arabia Saudita, Egitto, Etiopia" le virgole sono di un elenco.
 */
const INCISO = new RegExp(
  // "-ette" no: "ammette", "permette" sono presenti, non participi.
  '^(?:(?:già|ormai|appena|ancora|poi|ora) )?(?:\\p{Ll}+(?:(?:at|it|ut)[aeio]|(?:ost|ess|ett|itt)[oai])\\b|' +
    `${GERUNDIO}|davanti |durante |dopo |prima |presso |mentre |nel corso |in occasione |allo scopo |` +
    'al fine |nel tentativo |in seguito |a seguito |in cambio |a causa |in risposta |secondo |sotto |oltre |' +
    'senza |tra cui |fra cui |cioè |ovvero )',
  'u',
)

/** Una relativa o una consecutiva: puo' avere dentro altre virgole, e si toglie solo fino in fondo o ai due punti. */
const RELATIVA = new RegExp(
  '^(?:che|il cui|la cui|i cui|le cui|dove|il quale|la quale|i quali|le quali|per cui|motivo per cui|' +
    'ragione per cui)\\b',
  'u',
)

/** Un complemento senza virgola dopo il verbo: "…viene arrestato dopo aver incassato una tangente…". */
const COMPLEMENTO = new RegExp(
  '^ (?:dopo aver|dopo essere|dopo che|in occasione|durante|allo scopo|al fine|nel tentativo|in seguito|a seguito|' +
    'in cambio|a causa|in risposta|mentre|prima di|prima che|per protestare|senza)\\b',
  'u',
)

/**
 * Una frase che si apre con una subordinata, o con un participio o un
 * gerundio: "Dopo aver appreso che…, Adolf Hitler ammette la sconfitta",
 * "Accompagnata al pianoforte dal jazzista Hank Jones…, Marilyn Monroe canta".
 */
const APERTURA = new RegExp(
  '^(?:(?:dopo|mentre|durante|nonostante|in seguito|a seguito|prima di|pur|nel clima|in occasione|nel corso|' +
    'al termine|subito dopo)\\b|\\p{Lu}\\p{Ll}+(?:(?:at|it|ut)[aeio]|ando|endo)\\b)',
  'iu',
)

/** Il contesto prima dei due punti, che si puo' togliere: "Seconda guerra mondiale: …". */
const CONTESTO = new RegExp(
  '^(?:(?:prima|seconda) guerra mondiale|guerr[ae] [^:,]{0,40}|dopoguerra [^:,]{0,30}|programma [^:,]{0,30})$',
  'iu',
)

/**
 * Una riga del feed che e' solo il titolo di un elenco: "Seconda guerra
 * mondiale:" sopra i fatti di quel giorno, che il feed perde tenendone le voci.
 */
export function soloContesto(testo: string): boolean {
  return /:\s*$/.test(testo) || CONTESTO.test(pulisci(testo))
}

/** La frase senza il contesto di una guerra o di un programma: "Programma Viking: la sonda Viking 1…" → "la sonda…". */
export function senzaContesto(t: string): string {
  const due = t.indexOf(': ')
  return due > 0 && CONTESTO.test(t.slice(0, due)) ? t.slice(due + 2) : t
}

/** Una frase che finisce con una preposizione o un articolo e' tagliata a meta'. */
const MONCA = new RegExp(
  '\\b(?:di|a|da|in|con|su|per|tra|fra|il|lo|la|i|gli|le|un|una|uno|e|o|ed|che|' +
    'del|dello|della|dei|degli|delle|al|allo|alla|ai|agli|alle|dal|dallo|dalla|dai|dagli|dalle|' +
    'nel|nello|nella|nei|negli|nelle|sul|sullo|sulla|sui|sugli|sulle|col|coi)$',
  'iu',
)

/** I titoli e le parentele che in un elenco si scrivono minuscoli: "Venezia, re di Napoli, duca di Savoia". */
const ELENCO = new RegExp(
  '^(?:re|regina|duca|duchessa|marchese|conte|contessa|principe|principessa|papa|presidente|imperatore|' +
    'figli[oa]|moglie|marito|fratello|sorella|padre|madre) ',
  'u',
)

/**
 * Tagliare in `i` perde un pezzo della frase principale? Si', se dopo il taglio
 * una virgola e' seguita da una parola minuscola che non apre un inciso o una
 * relativa: in "…e molti giocatori, tra cui Paolo Rossi, vengono squalificati"
 * il taglio prima di "tra cui" lascerebbe i giocatori senza verbo. Un elenco di
 * nomi ("tra cui Janis Joplin, Paul Simon…", "…da un lato, e Venezia") non
 * conta.
 */
function continua(t: string, i: number): boolean {
  const resto = t.slice(i + 1)
  for (const m of resto.matchAll(/, (?=\p{Ll})/gu)) {
    // Le virgole fra parentesi sono della parentesi.
    const prima = resto.slice(0, m.index!)
    if (prima.split('(').length > prima.split(')').length) continue
    const dopo = resto.slice(m.index! + 2)
    if (/^(?:e|ed|o|oppure) \p{Lu}/u.test(dopo) || ELENCO.test(dopo)) continue
    if (!INCISO.test(dopo) && !RELATIVA.test(dopo)) return true
  }
  return false
}

/**
 * I punti in cui una frase lunga si puo' tagliare lasciando una frase intera:
 * un punto e virgola, la fine di una frase, i due punti dopo una proposizione
 * vera (almeno otto parole: "Seconda guerra mondiale:" e' solo il contesto); e
 * se quel che segue non riprende la frase principale (`continua`), prima di
 * una relativa, di un inciso, di un complemento dopo il verbo o di un gerundio,
 * anche senza virgola ("…sulla Passeggiata degli Inglesi causando 86 morti").
 */
function tagli(t: string): number[] {
  const punti: number[] = []
  for (const m of t.matchAll(/; |\. |: /g)) {
    const i = m.index!
    if (m[0][0] === '.' && !fineDiFrase(t, i)) continue
    if (m[0][0] === ':' && t.slice(0, i).split(' ').length < 8) continue
    punti.push(i)
  }
  for (let i = 1; i < t.length; i += 1) {
    const dopo = t.slice(i + 2)
    const virgola = t.startsWith(', ', i) && (INCISO.test(dopo) || RELATIVA.test(dopo))
    const spazio = t[i] === ' ' && /\p{L}/u.test(t[i - 1])
    const g = spazio ? GERUNDIO_DOPO_SPAZIO.exec(t.slice(i)) : null
    const gerundio = g !== null && !NON_GERUNDI.has(g[1])
    const complemento = spazio && COMPLEMENTO.test(t.slice(i))
    if ((virgola || gerundio || complemento) && !continua(t, i)) punti.push(i)
  }
  return [...new Set(punti)].sort((a, b) => a - b)
}

/**
 * La virgola dopo un inciso lo chiude davvero? Non se l'inciso e' un gerundio,
 * che si porta dietro elenchi ("…uccidendo il re Birendra, la regina
 * Aishwarya…"); non se dopo viene un nome proprio, che vuol dire un elenco
 * dentro l'inciso ("stipulata tra Francesco Sforza, Firenze…"); non se dopo
 * viene una preposizione, che lo continua ("diventando il primo presidente,
 * in carica o meno, a visitare l'isola").
 */
function chiudeInciso(inciso: string, dopo: string): boolean {
  if (GERUNDIO_ALL_INIZIO.test(inciso)) return false
  return /^\p{Ll}/u.test(dopo) && !PREPOSIZIONE.test(dopo)
}

const GERUNDIO_ALL_INIZIO = new RegExp(`^${GERUNDIO}`, 'u')

const PREPOSIZIONE = new RegExp(
  '^(?:(?:di|a|da|in|con|su|per|tra|fra|al|allo|alla|ai|agli|alle|dal|dallo|dalla|dai|dagli|dalle|' +
    'del|dello|della|dei|degli|delle|nel|nello|nella|nei|negli|nelle|sul|sullo|sulla|sui|sugli|sulle) |' +
    "(?:all|dall|dell|nell|sull|d)['’])",
  'iu',
)

/**
 * Le frasi che si ottengono togliendo un pezzo: la coda da un punto di taglio,
 * un inciso fino alla virgola dopo (la frase ne perde una sola, e tutte e due
 * se dopo viene il verbo: "Clara Petacci, catturati a Dongo…, vengono fucilati"
 * → "Clara Petacci vengono fucilati"), un complemento o una relativa fino ai
 * due punti o al punto e virgola ("…viene arrestato: comincia l'inchiesta Mani
 * pulite"), la subordinata d'apertura, le parentesi.
 */
function varianti(t: string): string[] {
  const esito = new Set<string>()
  for (const i of tagli(t)) esito.add(pulisci(t.slice(0, i)))
  // Dove finisce un pezzo: una virgola, i due punti, il punto e virgola, la fine di una frase.
  const confini = [...t.matchAll(/, |: |; |\. /g)].map((m) => m.index!).filter((i) => t[i] !== '.' || fineDiFrase(t, i))
  for (let s = 1; s < t.length; s += 1) {
    const e = confini.find((x) => x > s)
    if (e === undefined) continue
    const inciso = t.startsWith(', ', s) && INCISO.test(t.slice(s + 2))
    const relativa = t.startsWith(', ', s) && RELATIVA.test(t.slice(s + 2))
    const complemento = t[s] === ' ' && /\p{L}/u.test(t[s - 1]) && COMPLEMENTO.test(t.slice(s))
    const dopo = t.slice(e + 2)
    if (t[e] !== ',' && (inciso || relativa || complemento)) {
      esito.add(pulisci(`${t.slice(0, s)}${t.slice(e)}`))
    } else if (t[e] === ',' && inciso && chiudeInciso(t.slice(s + 2), dopo)) {
      const altro = INCISO.test(dopo) || RELATIVA.test(dopo)
      esito.add(pulisci(altro ? `${t.slice(0, s)}${t.slice(e)}` : `${t.slice(0, s)} ${dopo}`))
    }
  }
  const virgola = t.indexOf(', ')
  if (APERTURA.test(t) && virgola > 0) esito.add(maiuscola(t.slice(virgola + 2)))
  /*
   * Il contesto di una guerra prima dei due punti ("Seconda guerra mondiale: …",
   * "Guerra del Vietnam: …"): aiuta, ma la frase sta in piedi anche senza. Non
   * un altro contesto: "Attentati terroristici a Oslo: nel centro della città…"
   * senza il nome non si capirebbe di che città.
   */
  if (senzaContesto(t) !== t) esito.add(maiuscola(senzaContesto(t)))
  // "…la schiavitù. (Il Delaware ratificherà…)" senza la parentesi finisce con il punto: `pulisci` lo toglie.
  esito.add(pulisci(t.replace(/ \([^()]*\)/g, '')))
  esito.delete(t)
  return [...esito]
}

/**
 * I nomi che dicono un fatto: un nome di voce vale come frase solo se comincia
 * cosi' ("Rivoluzione dei garofani", "Strage di Nizza"). "Cristo Redentore" e
 * "Programma Apollo" sono voci del fatto, ma non dicono che cosa e' successo.
 */
const NOME_DI_FATTO = new RegExp(
  '^(?:' +
    [
      'battaglia|guerra|guerre|rivoluzione|rivolta|insurrezione|moti|sommossa|ribellione|crociata',
      'strage|attentat[oi]|assassinio|omicidio|eccidio|massacro|genocidio|pogrom|rapimento|dirottamento',
      'assedio|sacco|presa|caduta|conquista|invasione|occupazione|sbarco|campagna|operazione|bombardamento',
      'trattato|pace|armistizio|accord[oi]|patto|dichiarazione|conferenza|congresso|concilio|editto',
      'terremoto|incendio|naufragio|disastro|tragedia|alluvione|eruzione|esplosione|incidente|affondamento',
      'colpo di stato|golpe|putsch|marcia|notte|crisi|scisma|processo|elezion[ei]|referendum',
      'incoronazione|proclamazione|fondazione|nascita|scoperta|spedizione|missione|giochi|finale|prima',
    ].join('|') +
    ')\\b',
  'iu',
)

/**
 * Una frase del feed pronta per il quiz, o `null` se e' troppo lunga anche
 * accorciata. Si prova a togliere un pezzo, poi due (`varianti`), e si tiene
 * la frase piu' lunga che sta nella misura e non finisce a meta'.
 *
 * `nome` e' il titolo della voce che racconta il fatto: la frase accorciata
 * non deve perderlo, se lo diceva — "…dando vita al colpo di Stato noto come
 * Rivoluzione dei garofani" tagliata prima del gerundio sarebbe
 * un'occupazione militare qualunque. Se niente va, resta il nome del fatto, se
 * e' il nome di un fatto (`NOME_DI_FATTO`) e di una voce con la data del giorno
 * (`delGiorno`): quello prima dei due punti ("Strage di Nizza: …"), o `nome`,
 * come fa il feed stesso con "Battaglia di Brandywine".
 */
export function accorcia(
  testo: string,
  { nome, delGiorno = [] }: { nome?: string; delGiorno?: readonly string[] } = {},
): string | null {
  if (testo.length <= LUNGHEZZA_MASSIMA) return testo
  // Il nome della voce senza la parentesi che la distingue: "Battaglia di Milazzo (1860)".
  const pulitoNome = nome?.replace(/ \([^()]*\)$/, '')
  const chiave = pulitoNome && semplice(testo).includes(semplice(pulitoNome)) ? semplice(pulitoNome) : null
  const buona = (v: string) =>
    v.length >= 35 &&
    v.length <= LUNGHEZZA_MASSIMA &&
    bilanciato(v) &&
    !MONCA.test(v) &&
    (chiave === null || semplice(v).includes(chiave))
  const prime = varianti(testo)
  for (const giro of [prime, prime.filter((v) => v.length > LUNGHEZZA_MASSIMA).flatMap(varianti)]) {
    const buone = giro.filter(buona).sort((a, b) => b.length - a.length || a.localeCompare(b))
    if (buone.length > 0) return buone[0]
  }
  const vale = (n: string) => NOME_DI_FATTO.test(n) && delGiorno.some((t) => semplice(t) === semplice(n))
  const due = testo.indexOf(': ')
  const prima = due > 0 ? testo.slice(0, due) : ''
  if (prima && vale(prima)) return prima
  if (chiave !== null && nome && pulitoNome && vale(nome)) return maiuscola(pulitoNome)
  return null
}

/* ─────────────────────────────  L'anno nel testo  ────────────────────────── */

/** L'anno scritto nel testo: 1969 non dentro 11969 o 1.969, 44 a.C. per gli anni avanti Cristo. */
function annoNelTesto(anno: number): RegExp {
  return anno < 0
    ? new RegExp(`(?<![\\d.,])${-anno}\\s*a\\.\\s?C\\.?`, 'u')
    : new RegExp(`(?<![\\d.,'’])${anno}(?![\\d]|[.,]\\d)`, 'u')
}

export function contieneAnno(testo: string, anno: number): boolean {
  return annoNelTesto(anno).test(testo)
}

const MESI = 'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre'

/**
 * Le parole dopo cui un anno e' parte di un nome: "il campionato mondiale di
 * calcio 2014", "il Conclave del 1721", "l'Eurovision Song Contest 1974". Non
 * una parola maiuscola qualsiasi: "Nel 1969" perderebbe l'anno e il senso.
 */
const NOMI_CON_ANNO =
  'campionato|mondiale|mondiali|europeo|europei|olimpiade|olimpiadi|giochi|contest|festival|edizione|stagione|' +
  'coppa|calcio|torneo|expo|elezioni|conclave|giubileo|concilio|premio|referendum|censimento'

/**
 * Il testo senza il proprio anno, se toglierlo e' innocuo: in un contesto prima
 * dei due punti ("Elezioni presidenziali negli Stati Uniti d'America del 2016:
 * Donald Trump viene eletto…"), fra parentesi ("il Civil Rights Act (1964)"),
 * in una data intera ("Attentato del 28 giugno 2016 all'aeroporto…"), in una
 * stagione ("Campione d'Italia 2001-2002"), dentro o in fondo a un nome ("…il
 * campionato mondiale di calcio 2014 in Brasile", "…il Campionato Alta Italia
 * 1944"), o in una coda che si puo' lasciare ("…Robert Blum e' giustiziato.
 * L'esecuzione e' vista come la fine della rivoluzione del 1848"). Altrimenti
 * `null`: la domanda "in che anno?" avrebbe la risposta nel testo.
 */
export function senzaIlProprioAnno(testo: string, anno: number): string | null {
  if (!contieneAnno(testo, anno)) return testo
  let t = testo
  const due = t.indexOf(': ')
  if (due > 0 && contieneAnno(t.slice(0, due), anno) && t.slice(0, due).split(' ').length <= 10) {
    t = maiuscola(t.slice(due + 2))
  }
  const a = annoNelTesto(anno).source
  const annoInFondo = new RegExp(`(?:\\s+(?:del|nel|di))?\\s+${a}(?=[,;:)]|$)`, 'u')
  t = pulisci(
    t
      .replace(new RegExp(`\\s*\\([^()]*${a}[^()]*\\)`, 'u'), '')
      .replace(new RegExp(`\\s+(?:del|il|nel|dal|al)?\\s*\\d{1,2}[º°]?\\s+(?:${MESI})\\s+(?:del\\s+)?${a}`, 'iu'), '')
      .replace(new RegExp(`\\s+(?:\\d{4}[-–/]${a}|${a}[-–/]\\d{2,4})`, 'u'), '')
      .replace(new RegExp(`(?<=\\b(?:${NOMI_CON_ANNO}))\\s+(?:del\\s+)?${a}(?=\\s|[,;:)]|$)`, 'iu'), '')
      .replace(annoInFondo, ''),
  )
  if (contieneAnno(t, anno)) {
    const buoni = tagli(t).filter((i) => i >= 40 && !contieneAnno(t.slice(0, i), anno) && bilanciato(t.slice(0, i)))
    if (buoni.length > 0) t = pulisci(t.slice(0, buoni[buoni.length - 1]))
  }
  return contieneAnno(t, anno) || t.length < 15 ? null : t
}

/** "Dieci anni dopo", "l'anno prima", "anniversario": un anno detto contando da un altro. */
const RELATIVO = new RegExp(
  "\\b(?:\\d+|un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|venti|trenta|quaranta|cinquanta|cento|" +
    "\\p{L}+['’])\\s*ann[io]\\s+(?:dopo|prima)\\b|\\bl['’]anno\\s+(?:dopo|prima|precedente|seguente|successivo)\\b|" +
    '\\banniversario\\b',
  'iu',
)

/**
 * Il testo senza gli anni contati da un altro fatto, quando dicono la
 * risposta: in apertura ("10 anni dopo l'attacco alle Torri Gemelle, viene
 * inaugurato il National September 11 Memorial") la frase si toglie, e accanto
 * a un altro anno ("…Sgt. Pepper's Lonely Hearts Club Band; nello stesso
 * giorno di dieci anni dopo, nel 1977…") si taglia prima. Senza un altro anno
 * ("…ottant'anni dopo essere stati uccisi dai bolscevichi") il conto chiede di
 * sapere un'altra data, e il testo resta. `null` se non si puo' togliere.
 */
export function senzaAnniRelativi(testo: string): string | null {
  const m = RELATIVO.exec(testo)
  if (!m) return testo
  const virgola = testo.indexOf(', ')
  if (m.index < 10 && virgola > m.index) {
    const resto = maiuscola(testo.slice(virgola + 2))
    if (!RELATIVO.test(resto) && resto.length >= 30) return resto
  }
  if (!/(?<![\d.,])\d{3,4}(?!\d)/.test(testo.slice(0, m.index) + testo.slice(m.index + m[0].length))) return testo
  const buoni = tagli(testo).filter((i) => i >= 40 && i <= m.index && bilanciato(testo.slice(0, i)))
  return buoni.length > 0 ? pulisci(testo.slice(0, buoni[buoni.length - 1])) : null
}

/* ───────────────────────────────  La scheda  ─────────────────────────────── */

/**
 * Le prime frasi di una voce, per la scheda della risposta: una, o due se
 * stanno nella misura. Una prima frase troppo lunga si taglia con i puntini,
 * a una virgola se ce n'e' una nell'ultimo terzo, se no all'ultima parola
 * intera, e mai dentro una parentesi o dopo un articolo ("…inviati dai…").
 */
export function primeFrasi(estratto: string | undefined): string | undefined {
  const t = (estratto ?? '').replace(/\[[^\]]{0,40}\]/g, '').replace(/\s+/g, ' ').trim()
  if (!t) return undefined
  const fini: number[] = []
  for (const m of t.matchAll(/[.!?](?= \p{Lu}| [«"(\d])/gu)) {
    if (m[0] !== '.' || fineDiFrase(t, m.index!)) fini.push(m.index! + 1)
  }
  fini.push(t.length)
  const dentro = fini.filter((i) => i <= LUNGHEZZA_SCHEDA)
  if (dentro.length > 0) return t.slice(0, dentro[Math.min(dentro.length, 2) - 1]).trim()
  const testa = t.slice(0, LUNGHEZZA_SCHEDA)
  const spazi = [...testa.matchAll(/ /g)].map((m) => m.index!).reverse()
  const intero = (i: number) => bilanciato(testa.slice(0, i))
  const virgola = spazi.find((i) => i >= LUNGHEZZA_SCHEDA * 0.66 && /[,;]$/.test(testa.slice(0, i)) && intero(i))
  const parola = spazi.find((i) => i >= LUNGHEZZA_SCHEDA / 3 && intero(i)) ?? spazi[0] ?? LUNGHEZZA_SCHEDA - 1
  const chiudi = (t: string) => t.replace(/[\s,;:]+$/, '')
  let corto = chiudi(testa.slice(0, virgola ?? parola))
  while (MONCA.test(corto) && corto.includes(' ')) corto = chiudi(corto.slice(0, corto.lastIndexOf(' ')))
  return `${corto}…`
}
