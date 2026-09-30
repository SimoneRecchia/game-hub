/**
 * Quanto e' noto un fatto del feed, da Wikidata.
 *
 * La misura e' quella del resto del quiz, in quante Wikipedia c'e' una voce,
 * ma di quale voce: un fatto nomina di tutto, e "Il Kuwait aderisce alla Lega
 * araba" varrebbe quanto il Kuwait. Le voci di un fatto si dividono cosi':
 *
 * - le sue, quelle che hanno una data in quel giorno (l'attentato, la
 *   battaglia, la morte di chi e' morto, la fondazione del partito) o che sono
 *   durate poco e ci passano sopra (l'Apollo 11, dal lancio all'ammaraggio);
 * - il contesto, quelle lunghe che lo contengono senza cominciare o finire quel
 *   giorno (la seconda guerra mondiale per una battaglia, il programma Apollo,
 *   la guerra fredda per il muro di Berlino): non contano;
 * - le comparse, tutte le altre: contano quanto una voce propria se le loro
 *   prime righe ne citano l'anno — per Colombo il 1492 e' l'anno che conta, e
 *   "Primo viaggio di Cristoforo Colombo" ha solo 14 Wikipedia — e poco se no:
 *   la Luna per l'Apollo 11, Chirac per un attentato fallito del 2002;
 * - i luoghi (paesi, città, regioni) e le classi di cose ("Sonda spaziale",
 *   "Musical", i giorni, gli elenchi) non dicono niente di quanto sia noto il
 *   fatto. Un luogo con una data quel giorno conta, ma poco: il Maine diventa
 *   uno stato il 15 marzo 1820, e i suoi 216 Wikipedia non sono del fatto.
 *
 * Il punteggio e' la voce che vale di piu', piu' un quarto della seconda; le
 * cose italiane valgono una volta e mezza, perché il quiz e' italiano e un
 * fatto di storia d'Italia ha meno Wikipedia di quanto sia noto qui.
 *
 * Contano solo le voci di cui la frase parla (`visibile`): il feed a volte
 * attacca a una riga le voci di un'altra, e una frase accorciata perde quelle
 * del pezzo tolto.
 */

import type { EventoFeed, PaginaFeed } from './eventi'
import { senzaContesto, significative, simili } from './testi'
import type { DataVoce, Genere, Voce } from './voci'

export type Legame = 'giorno' | 'anno' | 'dentro' | 'lungo' | null

/** Quanto conta una voce, secondo che cosa e' per il fatto. */
export const PESI = {
  giorno: 1,
  anno: 0.8,
  /**
   * Una voce breve che ci passa sopra: l'Apollo 11 quasi come una sua, una
   * guerra di sette mesi per un episodio meno (vedi `pesoDentro`).
   */
  dentro: 0.8,
  /** Un luogo con una data quel giorno (il Maine, la Colombia): quel che vale e' del luogo, non del fatto. */
  luogoGiorno: 0.1,
  luogoAnno: 0.05,
  /** Una comparsa che nelle prime righe cita l'anno del fatto, o no. */
  citata: 0.6,
  comparsa: 0.08,
  /** Una cosa che passa di li' e non cita l'anno: la Luna per l'Apollo 11, la Terra, il dollaro. */
  cosa: 0.03,
  /** Quanto conta la seconda voce del fatto. */
  seconda: 0.25,
  italiana: 1.5,
} as const

/** Quanto puo' durare una voce che "ci passa sopra": piu' a lungo e' contesto. */
const DURATA_BREVE = 400

/** Il peso di una voce che contiene il giorno: pieno per pochi giorni, un quarto verso i 400. */
function pesoDentro(durata: number): number {
  return PESI.dentro * Math.max(0.25, 1 - durata / DURATA_BREVE)
}

const INIZI = new Set(['P580', 'P571', 'P619', 'P1619'])
const FINI = new Set(['P582', 'P576', 'P620', 'P3999'])

/** Il giorno come numero, nel calendario gregoriano prolettico, con l'anno del feed (senza lo zero). */
function numeroDelGiorno(anno: number, mese: number, giorno: number): number {
  const d = new Date(0)
  d.setUTCFullYear(anno > 0 ? anno : anno + 1, mese - 1, giorno)
  return Math.round(d.getTime() / 86_400_000)
}

/**
 * Quanti giorni il gregoriano e' avanti al giuliano in quell'anno: 10 nel
 * Cinquecento, 13 nel Novecento, due indietro al tempo di Cesare. Wikipedia
 * mette i fatti di prima della riforma, e quelli di Russia e Grecia fino al
 * 1918 e al 1923, al giorno del calendario di allora; Wikidata li converte.
 */
function scartoGiuliano(anno: number): number {
  const a = anno > 0 ? anno : anno + 1
  return Math.floor(a / 100) - Math.floor(a / 400) - 2
}

function fineDel(d: DataVoce): number {
  if (d.precisione === 9) return numeroDelGiorno(d.anno, 12, 31)
  if (d.precisione === 10) return numeroDelGiorno(d.anno, d.mese, 28)
  return numeroDelGiorno(d.anno, d.mese, d.giorno)
}

/**
 * Che cosa ha a che fare una voce con un giorno. Un giorno di scarto sempre
 * (un fatto della notte americana e' del giorno dopo da noi), piu' lo scarto
 * fra i calendari prima del 1924. Un anno scritto senza giorno vale "anno",
 * e un 1906 con la precisione del giorno che non e' quel giorno non vale:
 * e' un'altra cosa successa quell'anno.
 */
export function legame(v: Voce, anno: number, mese: number, giorno: number): { tipo: Legame; durata: number } {
  const qui = numeroDelGiorno(anno, mese, giorno)
  const scarti = anno < 1924 ? [0, scartoGiuliano(anno)] : [0]
  let tipo: Legame = null
  for (const d of v.date) {
    if (d.precisione >= 11) {
      const n = numeroDelGiorno(d.anno, d.mese, d.giorno)
      if (scarti.some((s) => Math.abs(n - qui - s) <= 1)) return { tipo: 'giorno', durata: 0 }
    } else if (d.anno === anno && (d.precisione === 9 || d.mese === mese)) {
      tipo = 'anno'
    }
  }
  const inizi = v.date.filter((d) => INIZI.has(d.p))
  const fini = v.date.filter((d) => FINI.has(d.p))
  if (inizi.length > 0 && fini.length > 0) {
    const a = Math.min(...inizi.map((d) => numeroDelGiorno(d.anno, d.mese, d.giorno)))
    const b = Math.max(...fini.map(fineDel))
    const margine = Math.max(...scarti) + 1
    if (qui >= a - margine && qui <= b + margine) {
      return b - a <= DURATA_BREVE ? { tipo: 'dentro', durata: b - a } : { tipo: tipo ?? 'lungo', durata: b - a }
    }
  }
  return { tipo, durata: 0 }
}

/** Le prime righe di una voce citano l'anno? Solo per gli anni dal 100: "9" o "44" sono troppo comuni. */
export function citaAnno(testo: string | undefined, anno: number): boolean {
  if (!testo) return false
  if (anno < 0) return new RegExp(`(?<![\\d.,])${-anno}\\s*a\\.\\s?C\\.`, 'u').test(testo)
  if (anno < 100) return false
  return new RegExp(`(?<![\\d.,'’])${anno}(?![\\d]|[.,]\\d|\\s*a\\.\\s?C\\.)`, 'u').test(testo)
}

/** Il titolo come si legge, senza la parentesi che distingue la voce: "Mortaio (arma)" → "Mortaio". */
function titoloDi(p: PaginaFeed): string {
  return (p.titles?.normalized ?? p.normalizedtitle ?? p.title).replace(/_/g, ' ').replace(/ \([^()]*\)$/, '')
}

/** Quante parole del titolo stanno nella frase, a meno della desinenza. */
function inFrase(p: PaginaFeed, testo: string): number {
  const nel = [...significative(testo)]
  return [...significative(titoloDi(p))].filter((t) => nel.some((w) => simili(t, w))).length
}

function intera(s: string, flag: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\d])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, flag)
}

/**
 * La frase nomina la voce? Con una parola del titolo, o con una sigla che la
 * voce usa ("l'ONU" per l'Organizzazione delle Nazioni Unite). Un titolo senza
 * parole lunghe ("Rai") si cerca intero.
 */
export function nominata(p: PaginaFeed, testo: string): boolean {
  if (inFrase(p, testo) > 0) return true
  const titolo = titoloDi(p)
  if (significative(titolo).size === 0 && intera(titolo, 'iu').test(testo)) return true
  const sigle = testo.match(/(?<![\p{L}\d])\p{Lu}[\p{Lu}\d-]*[\p{Lu}\d](?![\p{L}\d])/gu) ?? []
  const altrove = `${titolo} ${p.description ?? ''} ${p.extract ?? ''}`
  return sigle.some((s) => !/^[IVXLCDM]+$/.test(s) && intera(s, 'u').test(altrove))
}

/**
 * La voce parla di quel che dice la frase anche senza esserne nominata: le sue
 * prime righe hanno almeno due parole della frase. "Operazione Power Pack" per
 * "Forze militari USA invadono la Repubblica Dominicana"; non "Loving contro
 * Virginia" per il lancio della Venera 4, che il feed attacca alla riga
 * sbagliata.
 */
function affine(p: PaginaFeed, testo: string): boolean {
  const sue = [...significative(`${p.description ?? ''} ${p.extract ?? ''}`)]
  return [...significative(testo)].filter((w) => sue.some((s) => simili(s, w))).length >= 2
}

/**
 * La voce e' del fatto come lo dice la frase mostrata (`finale`)? Si', se la
 * nomina. No, se la nominava la frase del feed (`originale`) e il pezzo e'
 * stato tolto: "Adolf Hitler" non e' dell'inaugurazione della stazione
 * Ostiense senza "…per la visita di Adolf Hitler". Una voce che la frase non
 * ha mai nominato, un collegamento con un'altra etichetta, e' del fatto se ne
 * parla (`affine`), o se e' una cosa con la data del giorno: "Operazione
 * Hurricane" per "Il Regno Unito testa con successo un'arma nucleare".
 */
export function visibile(x: VoceValutata, originale: string, finale: string): boolean {
  if (nominata(x.pagina, finale)) return true
  if (nominata(x.pagina, originale)) return false
  const cosa = !['persona', 'luogo', 'generico'].includes(x.voce.genere)
  return affine(x.pagina, finale) || (x.legame === 'giorno' && cosa)
}

/** Le pagine che contano: voci vere (non pagine di servizio, non disambigue) con la loro voce di Wikidata. */
export function pagineDi(e: EventoFeed, voci: ReadonlyMap<string, Voce>): Array<{ pagina: PaginaFeed; voce: Voce }> {
  const esito: Array<{ pagina: PaginaFeed; voce: Voce }> = []
  for (const pagina of e.pages ?? []) {
    const voce = pagina.wikibase_item ? voci.get(pagina.wikibase_item) : undefined
    // "Aiuto:Giapponese" e simili: pagine di servizio, non voci.
    if ((pagina.namespace?.id ?? 0) !== 0 || pagina.type === 'disambiguation' || !voce) continue
    esito.push({ pagina, voce })
  }
  return esito
}

export interface VoceValutata {
  pagina: PaginaFeed
  voce: Voce
  legame: Legame
  citata: boolean
  valore: number
}

export interface Valutazione {
  punteggio: number
  voci: VoceValutata[]
  /** La voce che racconta il fatto, per la scheda della risposta. */
  principale?: VoceValutata
}

function valore(v: Voce, l: Legame, durata: number, citata: boolean): number {
  if (v.genere === 'generico' || l === 'lungo') return 0
  let peso: number
  if (propria(l)) {
    if (v.genere === 'luogo') peso = l === 'giorno' ? PESI.luogoGiorno : PESI.luogoAnno
    else peso = l === 'dentro' ? pesoDentro(durata) : PESI[l]
  } else if (v.genere === 'luogo') {
    return 0
  } else if (!citata) {
    // Chi passa di li' senza citare l'anno non e' il fatto: niente spinta italiana, Dante non fa noto un terremoto.
    return v.sitelink * v.peso * (v.genere === 'fatto' || v.genere === 'altro' ? PESI.cosa : PESI.comparsa)
  } else {
    peso = PESI.citata
  }
  return v.sitelink * v.peso * peso * (v.italiana ? PESI.italiana : 1)
}

/** L'ordine in cui una voce propria racconta il fatto: prima il fatto stesso, poi le opere, i gruppi, le persone. */
const PREFERENZA: readonly Genere[] = [
  'fatto',
  'opera',
  'gruppo',
  'altro',
  'costruzione',
  'persona',
  'luogo',
  'generico',
]

/** Una voce che ha una data quel giorno, o che ci passa sopra: e' del fatto, non una comparsa. */
export function propria(l: Legame): l is 'giorno' | 'anno' | 'dentro' {
  return l === 'giorno' || l === 'anno' || l === 'dentro'
}

/**
 * Il fatto con la frase del feed, o con quella che si mostra (`finale`, se e'
 * stata accorciata): contano le voci di cui parla, e se non parla di nessuna
 * delle sue il feed le ha prese da un'altra riga, e non ne conta nessuna.
 */
export function valuta(
  e: EventoFeed,
  giorno: string,
  voci: ReadonlyMap<string, Voce>,
  finale: string = e.text ?? '',
): Valutazione {
  const [mese, numero] = giorno.split('-').map(Number)
  const originale = e.text ?? ''
  const pagine = (e.pages ?? []).filter((p) => (p.namespace?.id ?? 0) === 0)
  if (!pagine.some((p) => nominata(p, originale) || affine(p, originale))) return { punteggio: 0, voci: [] }
  const valutate = pagineDi(e, voci)
    .map(({ pagina, voce }): VoceValutata => {
      const { tipo, durata } = legame(voce, e.year, mese, numero)
      const citata = citaAnno(pagina.extract, e.year) || citaAnno(pagina.description, e.year)
      return { pagina, voce, legame: tipo, citata, valore: valore(voce, tipo, durata, citata) }
    })
    .filter((x) => visibile(x, originale, finale))
  const valori = valutate.map((v) => v.valore).sort((a, b) => b - a)
  const punteggio = (valori[0] ?? 0) + PESI.seconda * (valori[1] ?? 0)
  return { punteggio: Math.round(punteggio * 10) / 10, voci: valutate, principale: scheda(valutate, finale, e.year) }
}

/** Quanti giorni dura una voce che ha un inizio e una fine: la Rivoluzione francese dieci anni. */
function durataDi(v: Voce): number {
  const inizi = v.date.filter((d) => INIZI.has(d.p))
  const fini = v.date.filter((d) => FINI.has(d.p))
  if (inizi.length === 0 || fini.length === 0) return 0
  return Math.max(...fini.map(fineDel)) - Math.min(...inizi.map((d) => numeroDelGiorno(d.anno, d.mese, d.giorno)))
}

/**
 * La voce della scheda. Prima una del fatto con la data del giorno, poi una
 * dell'anno o che ci passa sopra: un fatto prima di un'opera, di un gruppo, di
 * una persona, una cosa breve prima di una che quel giorno comincia soltanto
 * ("Presa della Bastiglia", non "Rivoluzione francese"), quella il cui titolo
 * sta nella frase ("…un referendum istituzionale…" → "Referendum istituzionale
 * del 1946"), e poi la meno nota; fra le persone la piu' nota (dei sette
 * medici impiccati il 2 giugno 1948, Karl Brandt). Poi una cosa con una data
 * di quell'anno, anche di un altro giorno (gli Universal Studios per la loro
 * fondazione, non Carl Laemmle che li fonda); poi la comparsa che la frase
 * nomina di piu', o che vale di piu' (dopo il contesto dei due punti:
 * "Programma Viking: la sonda Viking 1…" e' di "Viking 1"); poi un luogo che
 * quell'anno nasce o finisce; poi il contesto, anche un luogo (il Concilio
 * Vaticano II per la sua seconda fase, il campo di Auschwitz). Un luogo
 * qualsiasi mai, e un luogo del fatto dopo chi lo fa: per le dimissioni di
 * Gorbačëv Gorbačëv, non l'Unione Sovietica che finisce il giorno dopo.
 */
function scheda(voci: readonly VoceValutata[], testo: string, anno: number): VoceValutata | undefined {
  const quellAnno = (v: VoceValutata) => v.voce.date.some((d) => d.anno === anno)
  const classe = (v: VoceValutata): number => {
    if (v.voce.genere === 'luogo') return propria(v.legame) || quellAnno(v) ? 4 : v.legame === 'lungo' ? 5 : 6
    if (v.legame === 'giorno') return 0
    if (propria(v.legame)) return 1
    if (v.legame === 'lungo') return 5
    return v.voce.genere !== 'persona' && quellAnno(v) ? 2 : 3
  }
  const frase = senzaContesto(testo)
  const quanto = (v: VoceValutata) => inFrase(v.pagina, frase)
  const lunga = (v: VoceValutata) => Number(durataDi(v.voce) > DURATA_BREVE)
  const nota = (a: VoceValutata, b: VoceValutata) =>
    a.voce.genere === 'persona' ? b.voce.sitelink - a.voce.sitelink : a.voce.sitelink - b.voce.sitelink
  return voci
    .filter((v) => v.voce.genere !== 'generico' && classe(v) < 6)
    .sort((a, b) => {
      const c = classe(a)
      if (c !== classe(b)) return c - classe(b)
      if (c <= 1) {
        const genere = PREFERENZA.indexOf(a.voce.genere) - PREFERENZA.indexOf(b.voce.genere)
        return genere || lunga(a) - lunga(b) || quanto(b) - quanto(a) || nota(a, b)
      }
      if (c <= 3) return quanto(b) - quanto(a) || b.valore - a.valore
      return quanto(b) - quanto(a) || a.voce.sitelink - b.voce.sitelink
    })[0]
}
