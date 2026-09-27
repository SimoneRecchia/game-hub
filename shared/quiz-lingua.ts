/**
 * L'italiano delle domande: articoli e preposizioni di paesi, mari, fiumi e laghi.
 *
 * "Qual è la capitale dell'Italia?", "della Francia", "dello Sri Lanka",
 * "degli Stati Uniti", "di Cuba". Il genere dei nomi dei paesi non si ricava
 * dalla desinenza — il Kenya, il Canada, lo Zambia sono maschili — e non lo dice
 * nessuna fonte: e' l'unica cosa del quiz scritta a mano, perché e' grammatica e
 * non geografia. Un paese che manca dalla tabella userebbe il nome senza
 * articolo ("di Tuvalu"), sgraziato ma mai sbagliato; e non succede, perché lo
 * script della notte si ferma se nel riassunto c'e' un paese che qui non c'e'.
 */

/**
 * m, f: singolare maschile o femminile; mp, fp: plurale; 0: senza articolo,
 * come le isole e le città-stato ("di Malta", "a Cuba").
 */
export type Genere = 'm' | 'f' | 'mp' | 'fp' | '0'

export const GENERE_PAESI: Record<string, Genere> = {
  AD: '0', AE: 'mp', AF: 'm', AG: '0', AL: 'f', AM: 'f', AO: 'f', AR: 'f', AT: 'f', AU: 'f', AZ: 'm',
  BA: 'f', BB: '0', BD: 'm', BE: 'm', BF: 'm', BG: 'f', BH: 'm', BI: 'm', BJ: 'm', BN: 'm', BO: 'f',
  BR: 'm', BS: 'fp', BT: 'm', BW: 'm', BY: 'f', BZ: 'm',
  CA: 'm', CD: 'f', CF: 'f', CG: 'f', CH: 'f', CI: 'f', CL: 'm', CM: 'm', CN: 'f', CO: 'f', CR: 'f',
  CU: '0', CV: '0', CY: '0', CZ: 'f',
  DE: 'f', DJ: '0', DK: 'f', DM: 'f', DO: 'f', DZ: 'f',
  EC: 'm', EE: 'f', EG: 'm', ER: 'f', ES: 'f', ET: 'f',
  FI: 'f', FJ: 'fp', FM: 'f', FR: 'f',
  GA: 'm', GB: 'm', GD: '0', GE: 'f', GH: 'm', GM: 'm', GN: 'f', GQ: 'f', GR: 'f', GT: 'm', GW: 'f', GY: 'f',
  HN: 'm', HR: 'f', HT: '0', HU: 'f',
  ID: 'f', IE: 'f', IL: '0', IN: 'f', IQ: 'm', IR: 'm', IS: 'f', IT: 'f',
  JM: 'f', JO: 'f', JP: 'm',
  KE: 'm', KG: 'm', KH: 'f', KI: '0', KM: 'fp', KN: '0', KP: 'f', KR: 'f', KW: 'm', KZ: 'm',
  LA: 'm', LB: 'm', LC: '0', LI: 'm', LK: 'm', LR: 'f', LS: 'm', LT: 'f', LU: 'm', LV: 'f', LY: 'f',
  MA: 'm', MC: 'm', MD: 'f', ME: 'm', MG: 'm', MH: 'fp', MK: 'f', ML: 'm', MM: 'm', MN: 'f', MR: 'f',
  MT: '0', MU: '0', MV: 'fp', MW: 'm', MX: 'm', MY: 'f', MZ: 'm',
  NA: 'f', NE: 'm', NG: 'f', NI: 'm', NL: 'mp', NO: 'f', NP: 'm', NR: '0', NZ: 'f',
  OM: 'm',
  PA: 'm', PE: 'm', PG: 'f', PH: 'fp', PK: 'm', PL: 'f', PS: 'f', PT: 'm', PW: '0', PY: 'm',
  QA: 'm',
  RO: 'f', RS: 'f', RU: 'f', RW: 'm',
  SA: 'f', SB: 'fp', SC: 'fp', SD: 'm', SE: 'f', SG: '0', SI: 'f', SK: 'f', SL: 'f', SM: '0', SN: 'm',
  SO: 'f', SR: 'm', SS: 'm', ST: '0', SV: '0', SY: 'f', SZ: 'm',
  TD: 'm', TG: 'm', TH: 'f', TJ: 'm', TL: '0', TM: 'm', TN: 'f', TO: '0', TR: 'f', TT: '0', TV: '0',
  TW: '0', TZ: 'f',
  UA: 'f', UG: 'm', US: 'mp', UY: 'm', UZ: 'm',
  VA: 'f', VC: '0', VE: 'm', VN: 'm', VU: '0',
  WS: '0',
  XK: 'm',
  YE: 'm',
  ZA: 'm', ZM: 'm', ZW: 'm',
}

/** I paesi senza articolo che vogliono "in" e non "a": "in Israele", "in El Salvador". */
const IN_SENZA_ARTICOLO = new Set(['IL', 'SV'])

const VOCALE = /^[aeiouàèéìòóù]/i
/** Le iniziali che vogliono "lo": s impura, z, gn, ps, x, y, e le semiconsonanti. */
const IMPURA = /^(s[^aeiouàèéìòóù]|z|gn|ps|x|y)/i

function articolo(genere: Exclude<Genere, '0'>, nome: string): string {
  const vocale = VOCALE.test(nome) || /^h[aeiou]/i.test(nome)
  switch (genere) {
    case 'm':
      return vocale ? 'l’' : IMPURA.test(nome) ? 'lo ' : 'il '
    case 'f':
      return vocale ? 'l’' : 'la '
    case 'mp':
      return vocale || IMPURA.test(nome) ? 'gli ' : 'i '
    case 'fp':
      return 'le '
  }
}

/** La preposizione articolata: "di" + "lo" = "dello", "in" + "le" = "nelle". */
function articolata(preposizione: 'di' | 'in' | 'da', art: string): string {
  const radice = { di: 'de', in: 'ne', da: 'da' }[preposizione]
  switch (art) {
    case 'il ':
      return preposizione === 'di' ? 'del ' : preposizione === 'in' ? 'nel ' : 'dal '
    case 'lo ':
      return `${radice}llo `
    case 'l’':
      return `${radice}ll’`
    case 'la ':
      return `${radice}lla `
    case 'i ':
      return preposizione === 'di' ? 'dei ' : preposizione === 'in' ? 'nei ' : 'dai '
    case 'gli ':
      return `${radice}gli `
    case 'le ':
      return `${radice}lle `
    default:
      return `${preposizione} `
  }
}

function genereDi(iso: string): Genere {
  return GENERE_PAESI[iso] ?? '0'
}

/** "l’Italia", "la Francia", "gli Stati Uniti", "Cuba". */
export function conArticolo(iso: string, nome: string): string {
  const g = genereDi(iso)
  return g === '0' ? nome : articolo(g, nome) + nome
}

/** "dell’Italia", "della Francia", "degli Stati Uniti", "di Cuba". */
export function diPaese(iso: string, nome: string): string {
  const g = genereDi(iso)
  return g === '0' ? `di ${nome}` : articolata('di', articolo(g, nome)) + nome
}

/**
 * "in Italia", "nel Regno Unito", "negli Stati Uniti", "a Cuba", "ad Haiti".
 *
 * Al singolare l'italiano vuole "in" senza articolo — in Francia, in Brasile —
 * tranne per i nomi che cominciano con un nome comune: il Regno, la Repubblica,
 * la Città, il Principato. Al plurale l'articolo c'e' sempre.
 */
export function inPaese(iso: string, nome: string): string {
  const g = genereDi(iso)
  if (g === '0') {
    if (IN_SENZA_ARTICOLO.has(iso)) return `in ${nome}`
    return `${VOCALE.test(nome) || /^h/i.test(nome) ? 'ad' : 'a'} ${nome}`
  }
  const conNomeComune = /^(Regno|Repubblica|Città|Principato|Stati|Isole|Emirati)\b/.test(nome)
  if (g === 'm' || g === 'f') {
    return conNomeComune ? articolata('in', articolo(g, nome)) + nome : `in ${nome}`
  }
  return articolata('in', articolo(g, nome)) + nome
}

/* ─────────────────────────────  Mari e oceani  ─────────────────────────── */

/** Mari, golfi, stretti e oceani sono maschili; la baia e la Manica femminili. */
function genereAcqua(nome: string): 'm' | 'f' {
  return /^(Baia|Manica|Laguna)\b/i.test(nome) ? 'f' : 'm'
}

/** "il Mar Nero", "l’Oceano Atlantico", "lo Stretto di Gibilterra", "la Baia di Hudson". */
export function acquaConArticolo(nome: string): string {
  return articolo(genereAcqua(nome), nome) + nome
}

/** "dal Mar Nero", "dall’Oceano Indiano", "dalla Baia di Hudson": per "bagnato da". */
export function daAcqua(nome: string): string {
  return articolata('da', articolo(genereAcqua(nome), nome)) + nome
}

/* ─────────────────────────────  Fiumi e laghi  ─────────────────────────── */

/** La prima lettera maiuscola: Wikidata scrive "lago di Garda", un'opzione "Lago di Garda". */
export function maiuscola(nome: string): string {
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

/**
 * Un fiume a meta' frase: "il fiume Senna". Il genere dei fiumi e' capriccioso —
 * la Senna, il Danubio, la Loira — e "il fiume" va bene per tutti.
 */
export function fiumeNellaFrase(nome: string): string {
  if (/^(Fiume|Rio|Río)\b/i.test(nome)) return `il ${maiuscola(nome)}`
  return `il fiume ${maiuscola(nome)}`
}

const INIZIO_LAGO = /^(lago|laghi|lough|loch|mar|mare|gran|grande|salar|laguna|bacino|serbatoio)\b/i

/** "il lago di Garda", "il lago Titicaca", "il Mar Caspio", "la laguna di Venezia". */
export function lagoNellaFrase(nome: string): string {
  if (!INIZIO_LAGO.test(nome)) return `il lago ${maiuscola(nome)}`
  if (/^lago\b/i.test(nome)) return `il ${nome.charAt(0).toLowerCase()}${nome.slice(1)}`
  if (/^laguna\b/i.test(nome)) return `la ${nome.charAt(0).toLowerCase()}${nome.slice(1)}`
  if (/^(bacino|serbatoio)\b/i.test(nome)) return `il ${nome.charAt(0).toLowerCase()}${nome.slice(1)}`
  if (/^laghi\b/i.test(nome)) return `i ${nome.charAt(0).toLowerCase()}${nome.slice(1)}`
  return `il ${maiuscola(nome)}`
}

/** "sul lago Vittoria", "sulla laguna di Venezia", "sui laghi…": per "si affaccia su". */
export function suLago(nome: string): string {
  const frase = lagoNellaFrase(nome)
  const [art, ...resto] = frase.split(' ')
  const su = { il: 'sul', la: 'sulla', i: 'sui' }[art] ?? `su ${art}`
  return `${su} ${resto.join(' ')}`
}

/** Il nome di un lago come opzione: "Lago di Garda", "Lago Titicaca", "Mar Caspio". */
export function lagoInOpzione(nome: string): string {
  return INIZIO_LAGO.test(nome) ? maiuscola(nome) : `Lago ${maiuscola(nome)}`
}

/** Una città a meta' frase: "il Cairo", "l’Avana", ma "La Paz" e "La Valletta" come sono. */
export function cittaNellaFrase(nome: string): string {
  if (/^Il /.test(nome)) return `il ${nome.slice(3)}`
  if (/^L['’]/.test(nome)) return `l’${nome.slice(2)}`
  return nome
}

/** Le regioni che non vogliono "in": "nel Lazio", "nelle Marche", "nei Paesi Baschi". */
const REGIONI_CON_ARTICOLO: Record<string, string> = {
  Lazio: 'nel Lazio',
  Marche: 'nelle Marche',
  'Paesi Baschi': 'nei Paesi Baschi',
  Asturie: 'nelle Asturie',
  Fiandre: 'nelle Fiandre',
}

/**
 * Una regione dopo "si trova": "in Puglia", "in Baviera", "in Texas", ma "nel
 * Lazio". I nomi delle regioni vanno quasi tutti senza articolo; quelli che lo
 * vogliono sono pochi, e i plurali con "Isole" lo prendono da soli.
 */
export function inRegione(nome: string): string {
  if (REGIONI_CON_ARTICOLO[nome]) return REGIONI_CON_ARTICOLO[nome]
  if (/^Isole\b/.test(nome)) return `nelle ${nome}`
  return `in ${nome}`
}

/**
 * Come si chiama la suddivisione di primo livello di un paese: gli stati degli
 * Stati Uniti, i land della Germania, i cantoni della Svizzera. Per gli altri
 * "regione" va bene.
 */
const SUDDIVISIONI: Record<string, string> = {
  US: 'stato',
  MX: 'stato',
  BR: 'stato',
  IN: 'stato',
  AU: 'stato',
  VE: 'stato',
  NG: 'stato',
  DE: 'land',
  AT: 'land',
  CH: 'cantone',
  ES: 'comunità autonoma',
  CA: 'provincia',
  AR: 'provincia',
  CN: 'provincia',
  NL: 'provincia',
  BE: 'regione',
  TR: 'provincia',
  IR: 'provincia',
  PK: 'provincia',
  ZA: 'provincia',
  KR: 'provincia',
  JP: 'prefettura',
  RU: 'soggetto federale',
  PL: 'voivodato',
}

export function suddivisione(iso: string): string {
  return SUDDIVISIONI[iso] ?? 'regione'
}
