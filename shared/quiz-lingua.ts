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

/* ─────────────────────────────  I nomi comuni  ─────────────────────────── */

/**
 * Il genere delle parole con cui cominciano i nomi delle altre materie:
 * "battaglia di Waterloo", "trattato di Versailles", "anidride carbonica",
 * "pascal". Wikidata li scrive senza articolo, e il genere non lo dice: la
 * tabella ha le parole che si incontrano davvero, e per le altre si guarda la
 * desinenza solo dove non sbaglia mai. Se non si sa, la domanda usa il nome fra
 * virgolette, senza articolo: sgraziato, ma non sbagliato.
 */
const GENERE_PAROLE: Record<string, Exclude<Genere, '0'>> = {
  // La storia.
  battaglia: 'f', battaglie: 'fp', guerra: 'f', guerre: 'fp', assedio: 'm', trattato: 'm', trattati: 'mp',
  pace: 'f', rivoluzione: 'f', rivolta: 'f', insurrezione: 'f', moti: 'mp', assassinio: 'm', omicidio: 'm',
  strage: 'f', massacro: 'm', eccidio: 'm', genocidio: 'm', terremoto: 'm', eruzione: 'f', naufragio: 'm',
  incendio: 'm', epidemia: 'f', pandemia: 'f', peste: 'f', carestia: 'f', alluvione: 'f', uragano: 'm',
  maremoto: 'm', tsunami: 'm', scoperta: 'f', caduta: 'f', sacco: 'm', presa: 'f', conquista: 'f',
  spedizione: 'f', spedizioni: 'fp', crociata: 'f', crociate: 'fp', campagna: 'f', incoronazione: 'f',
  congresso: 'm', concilio: 'm', editto: 'm', unificazione: 'f', riunificazione: 'f', proclamazione: 'f',
  fondazione: 'f', crisi: 'f', sbarco: 'm', attacco: 'm', attentato: 'm', attentati: 'mp', disastro: 'm',
  esplosione: 'f', incidente: 'm', crollo: 'm', invasione: 'f', occupazione: 'f', marcia: 'f', riforma: 'f',
  scisma: 'm', dichiarazione: 'f', armistizio: 'm', accordo: 'm', accordi: 'mp', conferenza: 'f',
  vespri: 'mp', colpo: 'm', putsch: 'm', olocausto: 'm', affondamento: 'm', disfatta: 'f', ritirata: 'f',
  sconfitta: 'f', vittoria: 'f', notte: 'f', giornate: 'fp', primavera: 'f', processo: 'm', rogo: 'm',
  patto: 'm', convenzione: 'f', capitolazione: 'f', resa: 'f', sollevazione: 'f', secessione: 'f',
  restaurazione: 'f', ammutinamento: 'm', traversata: 'f', viaggio: 'm', allunaggio: 'm', missione: 'f',
  incursione: 'f', bombardamento: 'm', bombardamenti: 'mp', blocco: 'm', rapimento: 'm', esecuzione: 'f',
  conflitto: 'm', offensiva: 'f', volo: 'm', fronte: 'm', morte: 'f', statuto: 'm', ribellione: 'f',
  protocollo: 'm', carta: 'f', congiura: 'f', unione: 'f', massacri: 'mp', intervento: 'm', patti: 'mp',
  holodomor: 'm', reconquista: 'f', protesta: 'f', proteste: 'fp', terremoti: 'mp', euromaidan: 'm',
  assalto: 'm', ciclone: 'm', acquisto: 'm', nakba: 'f', tregua: 'f', porrajmos: 'm', indipendenza: 'f',
  memorandum: 'm', golpe: 'm', storia: 'f', entente: 'f', teatro: 'm', scioglimento: 'm', disordini: 'mp',
  decabrismo: 'm', jacquerie: 'f', deportazioni: 'fp', invasioni: 'fp', era: 'f', fronda: 'f',
  interregno: 'm', esplosioni: 'fp', rivolte: 'fp', atto: 'm', fine: 'f', calca: 'f', cesaricidio: 'm',
  raid: 'm', lega: 'f', bagno: 'm', conquiste: 'fp', concili: 'mp', anni: 'mp',
  // La Comune di Parigi, che e' femminile.
  comune: 'f',
  // Le scienze.
  acqua: 'f', anidride: 'f', ammoniaca: 'f', acido: 'm', cloruro: 'm', metano: 'm', etanolo: 'm',
  glucosio: 'm', saccarosio: 'm', ozono: 'm', ossido: 'm', biossido: 'm', monossido: 'm', idrossido: 'm',
  perossido: 'm', carbonato: 'm', bicarbonato: 'm', solfato: 'm', nitrato: 'm', benzene: 'm', propano: 'm',
  butano: 'm', etilene: 'm', acetilene: 'm', urea: 'f', caffeina: 'f', nicotina: 'f', aspirina: 'f',
  paracetamolo: 'm', cloroformio: 'm', fruttosio: 'm', lattosio: 'm', idrogenocarbonato: 'm', solfuro: 'm',
  radio: 'f', dinamite: 'f', lampadina: 'f', penicillina: 'f', insulina: 'f', vaccino: 'm', teoria: 'f',
  legge: 'f', leggi: 'fp', principio: 'm', equazione: 'f', relatività: 'f', telefono: 'm', telegrafo: 'm',
  televisione: 'f', stampa: 'f', macchina: 'f', motore: 'm', pila: 'f', batteria: 'f', computer: 'm',
  aeroplano: 'm', aereo: 'm', automobile: 'f', bicicletta: 'f', fonografo: 'm', cinematografo: 'm',
  microscopio: 'm', telescopio: 'm', termometro: 'm', barometro: 'm', parafulmine: 'm', elettrone: 'm',
  protone: 'm', neutrone: 'm', raggi: 'mp', radioattività: 'f', vaccinazione: 'f', anestesia: 'f',
  pastorizzazione: 'f', calcolatrice: 'f', ascensore: 'm', frigorifero: 'm', transistor: 'm', laser: 'm',
  // Le grandezze e le unità di misura.
  lunghezza: 'f', massa: 'f', tempo: 'm', durata: 'f', temperatura: 'f', intensità: 'f', quantità: 'f',
  energia: 'f', lavoro: 'm', calore: 'm', potenza: 'f', forza: 'f', pressione: 'f', frequenza: 'f',
  tensione: 'f', carica: 'f', resistenza: 'f', capacità: 'f', induttanza: 'f', flusso: 'm', campo: 'm',
  attività: 'f', dose: 'f', illuminamento: 'm', velocità: 'f', accelerazione: 'f', area: 'f', volume: 'm',
  superficie: 'f', angolo: 'm', densità: 'f', conduttanza: 'f', differenza: 'f',
  mole: 'f', candela: 'f',
  // Le scoperte, i composti e le specie che non finiscono in -o o in -a, o che non ne seguono la regola.
  pianoforte: 'm', pallacanestro: 'f', pallavolo: 'f', big: 'm', browser: 'm', mouse: 'm', condensatore: 'm',
  principi: 'mp', eritrocita: 'm', bluetooth: 'm', hypertext: 'm', aspirapolvere: 'm', sudoku: 'm',
  positrone: 'm', barbie: 'f', testosterone: 'm', bikini: 'm', pulsar: 'f', snooker: 'm', catalisi: 'f',
  emoji: 'mp', googol: 'm', ibuprofene: 'm', ethernet: 'm', caesar: 'f', antiprotone: 'm', vermut: 'm',
  muone: 'm', quaternione: 'm', sinapsi: 'f', prione: 'm', lego: 'm', bios: 'm', grafene: 'm', napalm: 'm',
  lavastoviglie: 'f', hovercraft: 'm', auricolari: 'mp', turchese: 'm', sildenafil: 'm', trinitrotoluene: 'm',
  acetone: 'm', formaldeide: 'f', opale: 'm', glucagone: 'm', borace: 'm', sarin: 'm', toluene: 'm',
  zircone: 'm', propilene: 'm', leone: 'm', tigre: 'f', volpe: 'f', cinghiale: 'm', mais: 'm', girasole: 'm',
  cetrioli: 'mp', olivi: 'mp', spinaci: 'mp', ceci: 'mp', anacardi: 'mp', struzzi: 'mp', cormorani: 'mp',
  alce: 'm', gru: 'f', carvi: 'm', anice: 'm', melone: 'm', pavone: 'm', procione: 'm', ghiottone: 'm',
  sparviere: 'm', barbagianni: 'm', coyote: 'm', jackfruit: 'm', aardvark: 'm', litchi: 'm', alopex: 'm',
  carcarodonte: 'm', codone: 'm', rondine: 'f', ailuridi: 'mp', neanderthal: 'm', lisosoma: 'm',
}

/**
 * Le parole che non vogliono l'articolo: "a chi si deve Internet?". Per loro
 * `nomeConArticolo` da' il nome com'e', e `diNome` "di Internet".
 */
const SENZA_ARTICOLO = new Set(['internet'])

/**
 * Gli aggettivi all'inizio di un nome concordano con il nome dopo: la
 * desinenza ne dice il genere e il numero ("Seconda guerra balcanica", "Lunga
 * marcia", "Primi vespri"). I numeri e "grande" no: il genere e' della parola
 * che segue ("Cinque giornate", "Grande carestia").
 */
const CONCORDANO = new RegExp(
  '^(?:prim|second|terz|quart|quint|sest|settim|ottav|non|decim|' +
    'ultim|nuov|lung|stran|glorios|antic|sant|sacr|piccol)[oaie]$',
)
const NON_DICONO = new Set([
  'grande',
  'grandi',
  'due',
  'tre',
  'quattro',
  'cinque',
  'sei',
  'sette',
  'otto',
  'nove',
  'dieci',
  'undici',
  'dodici',
  'tredici',
  'quattordici',
  'quindici',
  'venti',
  'cento',
  'mille',
])

function daDesinenza(parola: string): Exclude<Genere, '0'> {
  const fine = parola.charAt(parola.length - 1)
  return fine === 'o' ? 'm' : fine === 'a' ? 'f' : fine === 'i' ? 'mp' : 'fp'
}

/**
 * Per le cose che si chiamano con un nome comune — un'invenzione, un
 * composto, una specie — le desinenze che non sbagliano quasi mai: -o
 * maschile e -a femminile, tolte le eccezioni che si incontrano. Le altre non
 * si indovinano: le -e sono dei due generi, e le -i singolari o plurali.
 */
const MASCHILI_IN_A = new Set([
  'sistema',
  'problema',
  'programma',
  'teorema',
  'diagramma',
  'telegramma',
  'cinema',
  'clima',
  'panorama',
  'schema',
  'pianeta',
  'poeta',
  'pilota',
  'koala',
  'puma',
  'lama',
  'gorilla',
  'panda',
  'cobra',
  'capibara',
])
const FEMMINILI_IN_O = new Set(['mano', 'radio', 'foto', 'moto', 'auto', 'dinamo', 'biro'])

function indovinato(parola: string): Exclude<Genere, '0'> | null {
  if (parola.endsWith('o')) return FEMMINILI_IN_O.has(parola) ? 'f' : 'm'
  if (parola.endsWith('a')) return MASCHILI_IN_A.has(parola) ? 'm' : 'f'
  return null
}

/** Le parole di un nome, senza apostrofi. */
function parole(nome: string): string[] {
  return nome.trim().toLowerCase().split(/[\s'’]+/).filter(Boolean)
}

/**
 * La parola che regge un nome, saltati gli aggettivi e i numeri davanti: la
 * "guerra" della seconda guerra balcanica. Serve al verbo della domanda.
 */
export function testaDelNome(nome: string): string {
  const tutte = parole(nome)
  const i = tutte.findIndex((p) => !CONCORDANO.test(p) && !NON_DICONO.has(p))
  return tutte[i >= 0 ? i : 0] ?? ''
}

/**
 * Il genere di un nome che comincia con un nome comune, dalla prima parola:
 * null se non si sa. "battaglia di Waterloo" → f, "pascal" → m (le unità
 * di misura sono maschili, tranne mole e candela, che sono in tabella).
 */
export function genereNome(
  nome: string,
  predefinito: Exclude<Genere, '0'> | null = null,
  /** Per le cose con un nome comune: prova anche con le desinenze (vedi `indovinato`). */
  indovina = false,
): Exclude<Genere, '0'> | null {
  const [prima, ...resto] = parole(nome)
  if (!prima) return predefinito
  if (GENERE_PAROLE[prima]) return GENERE_PAROLE[prima]
  if (CONCORDANO.test(prima)) return daDesinenza(prima)
  if (NON_DICONO.has(prima) && resto.length > 0) return genereNome(resto.join(' '), predefinito, indovina)
  if (/(zione|sione|tà|ite)$/.test(prima)) return 'f'
  return (indovina ? indovinato(prima) : null) ?? predefinito
}

const senzaArticolo = (nome: string) => SENZA_ARTICOLO.has(parole(nome)[0] ?? '')

/** "la battaglia di Waterloo", "l’anidride carbonica", "i vespri siciliani": null se il genere non si sa. */
export function nomeConArticolo(nome: string, genere = genereNome(nome)): string | null {
  if (senzaArticolo(nome)) return nome
  return genere ? articolo(genere, nome) + nome : null
}

/** "della battaglia di Waterloo", "dell’acqua", "del ferro": null se il genere non si sa. */
export function diNome(nome: string, genere = genereNome(nome)): string | null {
  if (senzaArticolo(nome)) return `di ${nome}`
  return genere ? articolata('di', articolo(genere, nome)) + nome : null
}

/** Se il nome e' plurale: "i vespri siciliani ci furono", non "ci fu". */
export function plurale(genere: Exclude<Genere, '0'>): boolean {
  return genere === 'mp' || genere === 'fp'
}

/** Gli elementi chimici sono tutti maschili: "del ferro", "dell’oro", "dello zinco", "dello iodio". */
export function diElemento(nome: string): string {
  const art = /^i[aeiou]/i.test(nome) ? 'lo ' : articolo('m', nome)
  return articolata('di', art) + nome
}
