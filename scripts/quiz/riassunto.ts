/**
 * Il riassunto dei dati del quiz, da Wikidata e da Natural Earth.
 *
 * Quasi tutto viene dalle fonti; quel che e' scritto qui sono le correzioni che
 * le fonti non possono dare: il nome con cui un paese si dice in italiano ("Paesi
 * Bassi", non "Regno dei Paesi Bassi"), quale capitale chiedere dove ce ne sono
 * due, in quale continente cercare sulla cartina un paese che sta a cavallo.
 * Poche, e ognuna con il suo perché.
 */

import type { Continente } from '../../shared/quiz'
import { GENERE_PAESI } from '../../shared/quiz-lingua'
import {
  OCEANI,
  codificaLinea,
  type AcquaQuiz,
  type CittaQuiz,
  type CorsoQuiz,
  type DatiQuiz,
  type GeometrieQuiz,
  type PaeseQuiz,
  type TipoAcqua,
} from '../../shared/quiz-dati'
import { forme, poligoniGeoJson, rettangolo, type Poligono, type Punto, type Topologia } from '../../shared/topojson'
import { Griglia, costeDi, partiPrincipali } from './coste'
import type { Riga } from './fonti'
import {
  FILE_FIUMI,
  FILE_LAGHI,
  TOLLERANZA_LAGHI,
  geometrieFiumi,
  geometrieLaghi,
  semplifica,
  type Cercato,
  type RaccoltaNE,
} from './geometrie'

/** I nomi che Wikidata dice in modo ufficiale e l'italiano di tutti i giorni no. */
const NOMI: Record<string, string> = {
  NL: 'Paesi Bassi',
  PS: 'Palestina',
  FM: 'Micronesia',
  US: 'Stati Uniti',
  CZ: 'Repubblica Ceca',
}

/**
 * Le capitali da chiedere dove Wikidata ne ha piu' d'una in carica: quella che
 * dice la costituzione, o quella che si studia. Le altre non compaiono mai come
 * risposta sbagliata dello stesso paese.
 */
const CAPITALI: Record<string, string> = {
  BO: 'Sucre',
  BJ: 'Porto-Novo',
  ID: 'Giacarta',
  MY: 'Kuala Lumpur',
  NL: 'Amsterdam',
  PK: 'Islamabad',
  SZ: 'Mbabane',
  YE: 'Sana’a',
  ZA: 'Pretoria',
  IL: 'Gerusalemme',
  PS: 'Ramallah',
  LK: 'Sri Jayawardenepura Kotte',
}

const CONTINENTI: Record<string, Continente> = {
  Q15: 'af',
  Q46: 'eu',
  Q48: 'as',
  Q49: 'na',
  Q18: 'sa',
  Q538: 'oc',
  Q55643: 'oc',
}

/**
 * Il continente in cui cercare sulla cartina i paesi a cavallo: la Russia in
 * Europa, dove si vede la sua parte abitata, la Turchia in Asia.
 */
const PRIMO_CONTINENTE: Record<string, Continente> = {
  RU: 'eu',
  TR: 'as',
  KZ: 'as',
  AZ: 'as',
  GE: 'as',
  AM: 'as',
  CY: 'eu',
  EG: 'af',
  PA: 'na',
  ID: 'as',
  TL: 'as',
  PG: 'oc',
  TT: 'na',
}

/** I tipi di acqua di Natural Earth che diventano domande. */
const TIPI_ACQUA: Record<string, TipoAcqua> = {
  ocean: 'oceano',
  sea: 'mare',
  gulf: 'golfo',
  bay: 'baia',
  strait: 'stretto',
  channel: 'canale',
  sound: 'stretto',
}

/** I nomi degli oceani come si studiano: Natural Earth li scrive in minuscolo e a pezzi. */
const NOMI_OCEANI: Record<string, string> = {
  Q97: 'Oceano Atlantico',
  Q98: 'Oceano Pacifico',
  Q1239: 'Oceano Indiano',
  Q788: 'Oceano Artico',
  Q7354: 'Oceano Antartico',
}

function numero(v: string | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** La notorietà come posizione in classifica, da 1 (il piu' noto) a 0. */
function perNotorieta<T>(voci: T[], valore: (t: T) => number): Map<T, number> {
  const ordinate = [...voci].sort((a, b) => valore(b) - valore(a))
  const n = Math.max(1, ordinate.length - 1)
  return new Map(ordinate.map((t, i) => [t, Math.round((1 - i / n) * 1000) / 1000]))
}

const arrotonda = (x: number) => Math.round(x * 10) / 10

function maiuscolaIniziale(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "mar Tirreno" → "Mar Tirreno", "la Manica" → "Manica", "golfo del Bengala" → "Golfo del Bengala". */
function nomeAcqua(id: string, nome: string): string {
  if (NOMI_OCEANI[id]) return NOMI_OCEANI[id]
  return maiuscolaIniziale(nome.replace(/^la /i, '').replace(/^Mmare/, 'Mare').trim())
}

const semplice = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/**
 * Una città fa da trabocchetto solo se e' davvero un'altra città: non una delle
 * capitali, e non un nome che contiene la capitale o ne e' contenuto — Delhi
 * per Nuova Delhi sarebbe una risposta giusta a meta'.
 */
function trabocchettoBuono(citta: string, capitale: string, capitali: string[]): boolean {
  const c = semplice(citta)
  return [capitale, ...capitali].every((x) => {
    const y = semplice(x)
    return y !== '' && !c.includes(y) && !y.includes(c)
  })
}

/** Le etichette che non sono nomi da quiz: aree metropolitane, voci in altre lingue. */
const NON_UN_NOME = /metropolitan|^grande |^municipalit|^area |^regione |^zona |rivière|\briver\b|^\?/i

/** Il Mar Caspio: per Natural Earth un mare, per chiunque un lago. Non da' lo sbocco sul mare. */
const CASPIO = 'Q5484'

/**
 * I laghi che Natural Earth divide in pezzi con un identificativo loro: il lago
 * d'Aral si e' ritirato in due, e la forma del lago sono le due insieme.
 */
const PARTI_DEI_LAGHI: Record<string, string[]> = {
  Q35883: ['Q276776', 'Q3358037'],
}

/** "POINT(12.4964 41.9028)", come lo scrive Wikidata, in [longitudine, latitudine] al centesimo. */
function punto(wkt: string | undefined): [number, number] | null {
  const m = /POINT\(\s*([-\d.e+]+)\s+([-\d.e+]+)\s*\)/i.exec(wkt ?? '')
  if (!m) return null
  const lon = Number(m[1])
  const lat = Number(m[2])
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return [Math.round(lon * 100) / 100, Math.round(lat * 100) / 100]
}

export interface Fonti {
  paesi: Riga[]
  capitali: Riga[]
  confini: Riga[]
  citta: Riga[]
  fiumi: Riga[]
  laghi: Riga[]
  /** I paesi senza sbocco sul mare per Wikidata: la geometria da sola non basta. */
  senzaMare: Riga[]
  /** La regione di ogni città, per la categoria delle città. */
  regioniCitta: Riga[]
  /** Gli altri nomi inglesi di fiumi e laghi, per ritrovarli in Natural Earth. */
  aliasFiumi: Riga[]
  aliasLaghi: Riga[]
  acque: Riga[]
  topologia: Topologia
  mari: RaccoltaNE
  /** I file di Natural Earth con i fiumi e i laghi (vedi scripts/quiz/geometrie.ts). */
  fileFiumi: Record<(typeof FILE_FIUMI)[number], RaccoltaNE>
  fileLaghi: Record<(typeof FILE_LAGHI)[number], RaccoltaNE>
}

export interface Riassunto {
  dati: DatiQuiz
  geometrie: GeometrieQuiz
  citta: CittaQuiz[]
}

/**
 * Quante città tenere per paese, al massimo: le principali. L'Italia ne tiene
 * di piu', perché il quiz e' italiano e i capoluoghi di provincia sono piu' di
 * cento: da noi Isernia si studia, negli Stati Uniti la quarantesima città no.
 */
const CITTA_PER_PAESE = 40
const CITTA_IN_ITALIA = 120

/**
 * Le città della categoria delle città: per ogni paese le piu' popolose, fino
 * a cento, con il nome italiano (o quello di tutti, o l'inglese) e la regione.
 * La notorietà e' fra tutte quelle del mondo, dalle voci di Wikipedia: Parigi
 * e' piu' nota di Lione ovunque la si chieda.
 */
function costruisciCitta(righe: Riga[], regioni: Riga[], perId: Map<string, PaeseQuiz>): CittaQuiz[] {
  const nomeDi = (r: Riga) => r.nome ?? r.nomeMul ?? r.nomeEn
  const regioneDi = new Map<string, { id: string; nome: string }>()
  for (const r of regioni) {
    const nome = nomeDi(r)
    if (!r.citta || !r.regione || !nome || regioneDi.has(r.citta)) continue
    regioneDi.set(r.citta, { id: r.regione, nome: nome.replace(/'/g, '’') })
  }
  const perPaese = new Map<string, Riga[]>()
  for (const r of righe) {
    const nome = nomeDi(r)
    if (!r.citta || !r.iso2 || !perId.has(r.iso2) || !nome || NON_UN_NOME.test(nome) || !punto(r.punto)) continue
    const elenco = perPaese.get(r.iso2) ?? []
    // Due città con lo stesso nome nello stesso paese: resta la piu' popolosa.
    if (elenco.some((x) => semplice(nomeDi(x)!) === semplice(nome))) continue
    if (elenco.length < (r.iso2 === 'IT' ? CITTA_IN_ITALIA : CITTA_PER_PAESE)) elenco.push(r)
    perPaese.set(r.iso2, elenco)
  }
  const tutte = [...perPaese.values()].flat()
  const fama = perNotorieta(tutte, (r) => numero(r.voci) + Math.log10(numero(r.abitanti) + 10) * 6)
  return tutte.map((r) => {
    const nome = nomeDi(r)!.replace(/'/g, '’')
    const regione = regioneDi.get(r.citta!)
    // Berlino e' un land, e Vienna pure: "in quale land si trova Berlino?" non si chiede.
    const conRegione = regione && semplice(regione.nome) !== semplice(nome) ? regione : undefined
    return {
      id: r.citta!,
      n: nome,
      p: r.iso2!,
      ...(conRegione ? { r: conRegione.id, rn: conRegione.nome } : {}),
      pt: punto(r.punto)!,
      f: fama.get(r) ?? 0,
    }
  })
}

/**
 * I confinanti dalla cartina: due paesi con un arco in comune in world-atlas.
 * `tutti` guarda ogni pezzo di ogni paese — la Guyana francese confina con il
 * Brasile — e `principali` solo le parti principali, le stesse delle coste: il
 * corpo del paese, le parti grandi e quelle vicine. L'Irlanda del Nord e
 * Kaliningrad ci sono, la Guyana no.
 */
function confinantiSullaCartina(topologia: Topologia): { tutti: Map<string, Set<string>>; principali: Map<string, Set<string>> } {
  const perArco = { tutti: new Map<number, Set<string>>(), principali: new Map<number, Set<string>>() }
  for (const forma of forme(topologia, 'countries')) {
    const principali = new Set(partiPrincipali(forma.poligoni))
    forma.archi.forEach((archi, i) => {
      for (const arco of archi) {
        for (const [chi, vale] of [['tutti', true], ['principali', principali.has(forma.poligoni[i])]] as const) {
          if (!vale) continue
          const qui = perArco[chi].get(arco) ?? new Set<string>()
          qui.add(forma.id)
          perArco[chi].set(arco, qui)
        }
      }
    })
  }
  const vicini = (m: Map<number, Set<string>>) => {
    const esito = new Map<string, Set<string>>()
    for (const chi of m.values()) {
      for (const a of chi) {
        for (const b of chi) {
          if (a === b) continue
          const s = esito.get(a) ?? new Set<string>()
          s.add(b)
          esito.set(a, s)
        }
      }
    }
    return esito
  }
  return { tutti: vicini(perArco.tutti), principali: vicini(perArco.principali) }
}

export function costruisciRiassunto(f: Fonti): Riassunto {
  /* ── I paesi ── */
  const nomeDi = (r: Riga) => r.nome ?? r.nomeMul ?? r.nomeEn
  const righePaesi = f.paesi.filter((r) => r.iso2 && nomeDi(r))
  const notorieta = perNotorieta(righePaesi, (r) => numero(r.voci) + Math.log10(numero(r.abitanti) + 10) * 40)

  const capitaliDi = new Map<string, Array<{ nome: string; voci: number; punto: [number, number] | null }>>()
  for (const r of f.capitali) {
    const nome = nomeDi(r)
    if (!r.iso2 || !nome) continue
    const elenco = capitaliDi.get(r.iso2) ?? []
    elenco.push({ nome, voci: numero(r.voci), punto: punto(r.punto) })
    capitaliDi.set(r.iso2, elenco)
  }

  const confiniDi = new Map(f.confini.map((r) => [r.iso2 ?? '', (r.confini ?? '').split(' ').filter(Boolean)]))

  const piuGrande = new Map<string, { nome: string; abitanti: number }>()
  for (const r of f.citta) {
    if (!r.iso2 || !r.nome || NON_UN_NOME.test(r.nome)) continue
    const abitanti = numero(r.abitanti)
    const prima = piuGrande.get(r.iso2)
    if (!prima || abitanti > prima.abitanti) piuGrande.set(r.iso2, { nome: r.nome, abitanti })
  }

  const paesi: PaeseQuiz[] = righePaesi.map((r) => {
    const id = r.iso2!
    const capitali = (capitaliDi.get(id) ?? []).sort((a, b) => b.voci - a.voci)
    const cap = CAPITALI[id] ?? capitali[0]?.nome ?? ''
    // Il punto della capitale che si chiede: con due capitali, quella scelta sopra.
    const suoPunto = capitali.find((c) => semplice(c.nome) === semplice(cap))?.punto ?? null
    const grande = piuGrande.get(id)
    let k = [...new Set((r.continenti ?? '').split(' ').map((q) => CONTINENTI[q]).filter(Boolean))] as Continente[]
    if ((r.continenti ?? '').includes('Q5401')) k = [...new Set<Continente>([...k, 'eu', 'as'])]
    const primo = PRIMO_CONTINENTE[id]
    if (primo) k = [primo, ...k.filter((c) => c !== primo)]
    return {
      id,
      n: (NOMI[id] ?? nomeDi(r)!).replace(/'/g, '’'),
      cap: cap.replace(/'/g, '’'),
      ...(grande && trabocchettoBuono(grande.nome, cap, capitali.map((c) => c.nome))
        ? { trap: grande.nome.replace(/'/g, '’') }
        : {}),
      k: k.length > 0 ? k : ['as'],
      ...(r.numerico ? { num: r.numerico.padStart(3, '0') } : {}),
      a: Math.round(numero(r.superficie)),
      f: notorieta.get(r) ?? 0,
      conf: (confiniDi.get(id) ?? []).filter((c) => c !== id),
      ...(suoPunto ? { cc: suoPunto } : {}),
      bagna: [],
      peso: [],
      vicine: [],
    }
  })
  const perId = new Map(paesi.map((p) => [p.id, p]))
  // I confini valgono nei due sensi: se Wikidata ne dice uno solo, si completa.
  for (const p of paesi) {
    for (const c of p.conf) {
      const altro = perId.get(c)
      if (altro && !altro.conf.includes(p.id)) altro.conf.push(p.id)
    }
  }
  /*
   * Poi la cartina. Un confinante sicuro — una risposta di "con chi confina" —
   * lo e' per Wikidata e sulla cartina, con i pezzi grandi: Wikidata conta
   * anche i confini in mare, e la cartina da sola i pezzi d'oltremare. Per
   * escludere, invece, vale l'uno o l'altra: nel dubbio un paese non fa da
   * risposta sbagliata.
   */
  const sullaCartina = confinantiSullaCartina(f.topologia)
  const isoDelNumero = new Map(paesi.filter((p) => p.num).map((p) => [p.num!, p.id]))
  const iso = (numeri: Set<string> | undefined) =>
    [...(numeri ?? [])].map((n) => isoDelNumero.get(n)).filter((x): x is string => !!x)
  for (const p of paesi) {
    const tutti = iso(p.num ? sullaCartina.tutti.get(p.num) : undefined)
    const principali = new Set(iso(p.num ? sullaCartina.principali.get(p.num) : undefined))
    const wikidata = new Set(p.conf)
    p.conf = [...new Set([...p.conf, ...tutti])].filter((c) => perId.has(c) && c !== p.id).sort()
    const sicuri = [...principali].filter((c) => wikidata.has(c)).sort()
    if (sicuri.length > 0) p.cm = sicuri
  }

  /* ── Le acque ── */
  const infoAcque = new Map<string, { voci: number; nome?: string; antenati: Set<string> }>()
  for (const r of f.acque) {
    if (!r.acqua) continue
    const info = infoAcque.get(r.acqua) ?? { voci: numero(r.voci), nome: r.nome, antenati: new Set<string>() }
    if (r.antenato && r.antenato !== r.acqua) info.antenati.add(r.antenato)
    infoAcque.set(r.acqua, info)
  }

  /** Le acque come le ha Natural Earth, raccolte per identificativo: l'Atlantico sono due poligoni. */
  const poligoniAcque = new Map<string, { tipo: TipoAcqua; nome: string; poligoni: Poligono[] }>()
  for (const feature of f.mari.features) {
    const p = feature.properties
    const id = String(p.wikidataid ?? '')
    const tipo = TIPI_ACQUA[String(p.featurecla ?? '')]
    if (!id || !tipo || !feature.geometry) continue
    const acqua = poligoniAcque.get(id) ?? { tipo, nome: String(p.name_it ?? p.name ?? id), poligoni: [] }
    acqua.poligoni.push(...poligoniGeoJson(feature.geometry))
    poligoniAcque.set(id, acqua)
  }

  const idAcque = [...poligoniAcque.keys()]
  const notorietaAcque = perNotorieta(idAcque, (id) => infoAcque.get(id)?.voci ?? 0)

  /** Il padre diretto: fra gli antenati che conosciamo, quello che non contiene gli altri. */
  const padreDi = (id: string): string | undefined => {
    const antenati = [...(infoAcque.get(id)?.antenati ?? [])].filter((a) => poligoniAcque.has(a))
    return antenati.find((a) => antenati.every((b) => b === a || !(infoAcque.get(b)?.antenati.has(a) ?? false)))
  }

  const acque: AcquaQuiz[] = idAcque.map((id) => {
    const a = poligoniAcque.get(id)!
    const padre = padreDi(id)
    const bb = rettangolo(a.poligoni).map(arrotonda) as [number, number, number, number]
    return {
      id,
      n: nomeAcqua(id, a.nome),
      t: OCEANI.includes(id) ? 'oceano' : a.tipo,
      ...(padre ? { p: padre } : {}),
      bb,
      f: notorietaAcque.get(id) ?? 0,
    }
  })
  const acquaPerId = new Map(acque.map((a) => [a.id, a]))

  /* ── Le coste: chi tocca cosa ── */
  const chiusi = new Set(f.senzaMare.map((r) => r.iso2 ?? ''))
  const griglia = new Griglia()
  idAcque.forEach((id, indice) => {
    for (const poligono of poligoniAcque.get(id)!.poligoni) griglia.dipingi(poligono, indice + 1)
  })
  const formePerNumero = new Map(forme(f.topologia, 'countries').map((forma) => [forma.id, forma]))

  /** Un'acqua e tutto quel che ha sopra. */
  const risali = (id: string): string[] => {
    const catena: string[] = []
    for (let a = acquaPerId.get(id)?.p; a && !catena.includes(a); a = acquaPerId.get(a)?.p) catena.push(a)
    return catena
  }

  for (const p of paesi) {
    const forma = p.num ? formePerNumero.get(p.num) : undefined
    if (!forma) continue
    const { contatti, vicine, sfiorate } = costeDi(griglia, partiPrincipali(forma.poligoni))
    /*
     * Senza mare: nessun mare a portata di costa, nemmeno per un tratto — a parte
     * il Caspio, che e' un lago — e Wikidata d'accordo. I mari di Natural Earth
     * non arrivano a ogni costa: da soli, il Benin e il Togo sembravano senza mare.
     */
    if (![...sfiorate].some((i) => idAcque[i] !== CASPIO) && chiusi.has(p.id)) p.ch = 1
    /*
     * Il peso di ogni acqua per il paese: la sua costa, in rapporto alla piu'
     * lunga dello stesso tipo — gli oceani fra loro, i mari fra loro. Il Cile
     * tocca il Pacifico per 1800 punti e l'Atlantico per 190, in fondo alla
     * Terra del Fuoco: l'Atlantico lo bagna, ma non e' la risposta a "quale
     * oceano bagna il Cile?".
     */
    const oceano = (id: string) => acquaPerId.get(id)?.t === 'oceano'
    const massimi = { oceano: 1, mare: 1 }
    for (const [i, n] of contatti) {
      const tipo = oceano(idAcque[i]) ? 'oceano' : 'mare'
      massimi[tipo] = Math.max(massimi[tipo], n)
    }
    const pesi = new Map<string, number>()
    for (const [i, n] of contatti) {
      const id = idAcque[i]
      pesi.set(id, Math.round((100 * n) / massimi[oceano(id) ? 'oceano' : 'mare']))
    }
    const grigie = new Set([...vicine].map((i) => idAcque[i]))
    /*
     * Chi e' bagnato dall'Adriatico e' bagnato dal Mediterraneo: i mari che
     * contengono un mare che lo bagna lo bagnano anche loro, con lo stesso peso.
     * Gli oceani no — il Mediterraneo e' parte dell'Atlantico, per Wikidata, e
     * l'Italia non la direbbe nessuno bagnata dall'Atlantico — e restano grigi.
     */
    for (const [id, peso] of [...pesi]) {
      for (const sopra of risali(id)) {
        if (oceano(sopra)) grigie.add(sopra)
        else pesi.set(sopra, Math.max(pesi.get(sopra) ?? 0, peso))
      }
    }
    for (const id of [...grigie]) for (const sopra of risali(id)) grigie.add(sopra)
    for (const id of pesi.keys()) grigie.delete(id)
    const ordinate = [...pesi].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    p.bagna = ordinate.map(([id]) => id)
    p.peso = ordinate.map(([, peso]) => peso)
    p.vicine = [...grigie].sort()
  }

  /* ── Fiumi e laghi ── */
  const scelte = new Map<string, Riga>()
  const corsi = (righe: Riga[], chiave: 'fiume' | 'lago', valido: (r: Riga) => boolean): CorsoQuiz[] => {
    const nomeCorso = (r: Riga) => r.nome ?? r.nomeMul
    const buoni = righe.filter(
      (r) =>
        r[chiave] &&
        nomeCorso(r) &&
        !NON_UN_NOME.test(nomeCorso(r)!) &&
        valido(r) &&
        (r.paesi ?? '').split(' ').some((id) => perId.has(id)),
    )
    // Due fiumi con lo stesso nome (il Reno e il Reno emiliano): resta il piu' noto.
    const perNome = new Map<string, Riga>()
    for (const r of buoni.sort((a, b) => numero(b.voci) - numero(a.voci))) {
      const nome = nomeCorso(r)!.toLowerCase()
      if (!perNome.has(nome)) perNome.set(nome, r)
    }
    const unici = [...perNome.values()]
    for (const r of unici) scelte.set(r[chiave]!, r)
    const fama = perNotorieta(unici, (r) => numero(r.voci))
    return unici.map((r) => ({
      id: r[chiave]!,
      n: nomeCorso(r)!.replace(/'/g, '’'),
      p: [...new Set((r.paesi ?? '').split(' ').filter((id) => perId.has(id)))].sort(),
      f: fama.get(r) ?? 0,
    }))
  }

  const fiumi = corsi(f.fiumi, 'fiume', () => true)
  const laghi = corsi(f.laghi, 'lago', (r) => numero(r.superficie) >= 10 && !/^(laguna|porto|piscina|bocche|corno)\b/i.test(r.nome ?? r.nomeMul ?? ''))

  /* ── Le linee dei fiumi e le forme dei laghi ── */
  const riquadri = new Map<string, readonly [number, number, number, number]>()
  for (const p of paesi) {
    const forma = p.num ? formePerNumero.get(p.num) : undefined
    if (forma) riquadri.set(p.id, rettangolo(partiPrincipali(forma.poligoni)))
  }
  const alias = (righe: Riga[], chiave: 'fiume' | 'lago') =>
    new Map(righe.map((r) => [r[chiave] ?? '', (r.altri ?? '').split('|').filter(Boolean)]))
  const aliasFiumi = alias(f.aliasFiumi, 'fiume')
  const aliasLaghi = alias(f.aliasLaghi, 'lago')
  const cercati = (elenco: CorsoQuiz[], altri: Map<string, string[]>): Cercato[] =>
    elenco.map((c) => {
      const r = scelte.get(c.id)
      return {
        id: c.id,
        nomi: [r?.nomeEn, ...(altri.get(c.id) ?? []), r?.nome, r?.nomeMul].filter((n): n is string => !!n),
        punto: punto(r?.punto),
        riquadri: c.p.map((id) => riquadri.get(id)).filter((b): b is readonly [number, number, number, number] => !!b),
      }
    })
  const lineeFiumi = geometrieFiumi(cercati(fiumi, aliasFiumi), f.fileFiumi)
  const formeLaghi = geometrieLaghi(cercati(laghi, aliasLaghi), f.fileLaghi)
  // Un lago che Natural Earth disegna fra i mari (il Caspio) prende la forma da lì.
  const formaDaMare = (id: string): number[][] =>
    (poligoniAcque.get(id)?.poligoni ?? [])
      .map((p) => codificaLinea(semplifica(p[0] as Punto[], TOLLERANZA_LAGHI)))
      .filter((c) => c.length >= 8)
  for (const l of laghi) {
    if (formeLaghi.has(l.id)) continue
    const daMare = formaDaMare(l.id)
    const daParti = (PARTI_DEI_LAGHI[l.id] ?? []).flatMap((q) => formeLaghi.get(q) ?? [])
    const forma = daMare.length > 0 ? daMare : daParti
    if (forma.length > 0) formeLaghi.set(l.id, forma)
  }
  for (const c of fiumi) if (lineeFiumi.has(c.id)) c.g = 1
  for (const l of laghi) {
    if (formeLaghi.has(l.id)) {
      l.g = 1
    } else {
      const pt = punto(scelte.get(l.id)?.punto)
      if (pt) l.pt = pt
    }
  }
  const ordinate = (m: Map<string, number[][]>, voci: CorsoQuiz[]) =>
    Object.fromEntries(voci.filter((v) => m.has(v.id)).map((v) => [v.id, m.get(v.id)!]))

  return {
    dati: {
      versione: '',
      paesi: paesi.sort((a, b) => a.id.localeCompare(b.id)),
      acque: acque.sort((a, b) => a.id.localeCompare(b.id)),
      fiumi: fiumi.sort((a, b) => b.f - a.f),
      laghi: laghi.sort((a, b) => b.f - a.f),
    },
    geometrie: { versione: '', fiumi: ordinate(lineeFiumi, fiumi), laghi: ordinate(formeLaghi, laghi) },
    citta: costruisciCitta(f.citta, f.regioniCitta, perId),
  }
}

/**
 * I controlli prima di pubblicare: fatti che chiunque sa, e che se sono falsi
 * vogliono dire che una fonte e' cambiata sotto i piedi. Meglio uno script
 * fermo — le domande dei prossimi due mesi ci sono gia' — che un quiz che dice
 * che l'Italia non ha il mare.
 */
export function controllaRiassunto(d: DatiQuiz): string[] {
  const problemi: string[] = []
  const paese = (id: string) => d.paesi.find((p) => p.id === id)
  const acqua = (nome: string) => d.acque.find((a) => a.n === nome)
  const bagnato = (id: string, nome: string) => {
    const a = acqua(nome)
    if (!a) return problemi.push(`manca l'acqua ${nome}`)
    if (!paese(id)?.bagna.includes(a.id)) problemi.push(`${id} non risulta bagnato da ${nome}`)
  }
  if (d.paesi.length < 190) problemi.push(`solo ${d.paesi.length} paesi`)
  if (d.paesi.filter((p) => p.cap).length < 185) problemi.push('troppi paesi senza capitale')
  for (const [id, cap] of [['IT', 'Roma'], ['FR', 'Parigi'], ['AU', 'Canberra'], ['DK', 'Copenaghen'], ['NG', 'Abuja']]) {
    if (paese(id)?.cap !== cap) problemi.push(`la capitale di ${id} risulta ${paese(id)?.cap}`)
  }
  for (const nome of ['Mar Tirreno', 'Mare Adriatico', 'Mar Ionio', 'Mar Mediterraneo']) bagnato('IT', nome)
  bagnato('GR', 'Mar Egeo')
  bagnato('ES', 'Oceano Atlantico')
  bagnato('CL', 'Oceano Pacifico')
  bagnato('DE', 'Mar Baltico')
  if (paese('AT')?.bagna.length) problemi.push(`l'Austria risulta bagnata da ${paese('AT')!.bagna.join(', ')}`)
  for (const id of ['CH', 'AT', 'HU', 'BO', 'KZ']) if (!paese(id)?.ch) problemi.push(`${id} non risulta senza sbocco sul mare`)
  for (const id of ['IT', 'BA', 'SI', 'CD', 'BJ', 'TG', 'JO']) if (paese(id)?.ch) problemi.push(`${id} risulta senza sbocco sul mare`)
  if (paese('IT')?.bagna.includes('Q97')) problemi.push("l'Italia risulta bagnata dall'Atlantico")
  if (!paese('IT')?.conf.includes('FR')) problemi.push("l'Italia non confina con la Francia")
  if (!d.fiumi.find((f) => f.n === 'Danubio')?.p.includes('AT')) problemi.push('il Danubio non passa per Vienna')
  if (!d.laghi.find((l) => l.n.toLowerCase() === 'lago di garda')?.p.includes('IT')) problemi.push('il lago di Garda non è in Italia')
  // La cartina: i confinanti sicuri, le capitali al loro posto, fiumi e laghi disegnati.
  for (const vicino of ['FR', 'CH', 'AT', 'SI']) {
    if (!paese('IT')?.cm?.includes(vicino)) problemi.push(`l'Italia non risulta confinare con certezza con ${vicino}`)
  }
  if (paese('FR')?.cm?.includes('BR')) problemi.push('il Brasile risulta un confinante principale della Francia')
  if (!paese('FR')?.conf.includes('BR')) problemi.push('la Francia non risulta toccare il Brasile, dalla Guyana')
  const roma = paese('IT')?.cc
  if (!roma || Math.abs(roma[0] - 12.5) > 0.3 || Math.abs(roma[1] - 41.9) > 0.3) problemi.push(`Roma risulta in ${roma}`)
  if (d.paesi.filter((p) => p.cap && p.cc).length < 185) problemi.push('troppe capitali senza coordinate')
  for (const nome of ['Danubio', 'Po', 'Nilo', 'Tevere']) {
    if (!d.fiumi.find((f) => f.n === nome)?.g) problemi.push(`il fiume ${nome} non ha la linea`)
  }
  for (const nome of ['lago di Garda', 'lago Vittoria', 'Titicaca']) {
    if (!d.laghi.find((l) => l.n.toLowerCase() === nome.toLowerCase())?.g) problemi.push(`il ${nome} non ha la forma`)
  }
  if (d.fiumi.filter((f) => f.g).length < 350) problemi.push(`solo ${d.fiumi.filter((f) => f.g).length} fiumi con la linea`)
  if (d.laghi.filter((l) => l.g).length < 180) problemi.push(`solo ${d.laghi.filter((l) => l.g).length} laghi con la forma`)
  const senzaArticolo = d.paesi.filter((p) => !GENERE_PAESI[p.id]).map((p) => `${p.id} ${p.n}`)
  if (senzaArticolo.length) problemi.push(`senza articolo in shared/quiz-lingua.ts: ${senzaArticolo.join(', ')}`)
  if (d.fiumi.length < 300) problemi.push(`solo ${d.fiumi.length} fiumi`)
  if (d.laghi.length < 150) problemi.push(`solo ${d.laghi.length} laghi`)
  return problemi
}

/** I controlli delle città: che ci siano, e che le piu' note stiano dove stanno. */
export function controllaCitta(citta: readonly CittaQuiz[]): string[] {
  const problemi: string[] = []
  const trova = (nome: string, paese: string) => citta.find((c) => c.n === nome && c.p === paese)
  if (citta.length < 2000) problemi.push(`solo ${citta.length} città`)
  const milano = trova('Milano', 'IT')
  if (!milano) problemi.push('manca Milano')
  else if (milano.rn !== 'Lombardia') problemi.push(`Milano risulta in ${milano.rn ?? 'nessuna regione'}`)
  if (!trova('Lione', 'FR')) problemi.push('manca Lione')
  if (!trova('Roma', 'IT') || Math.abs(trova('Roma', 'IT')!.pt[1] - 41.9) > 0.3) problemi.push('Roma non è al suo posto')
  const italiane = citta.filter((c) => c.p === 'IT')
  if (italiane.length < 60) problemi.push(`solo ${italiane.length} città italiane`)
  if (italiane.filter((c) => c.rn).length < italiane.length * 0.8) problemi.push('troppe città italiane senza regione')
  return problemi
}
