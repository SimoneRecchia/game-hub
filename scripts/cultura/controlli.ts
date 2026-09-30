/**
 * I controlli prima di scrivere i file: fatti che chiunque sa, e che se sono
 * falsi vogliono dire che una fonte e' cambiata sotto i piedi — come
 * `controllaRiassunto` per la geografia. Meglio uno script fermo che un quiz
 * che dice che la Gioconda e' di Raffaello. Poi le regole dei dati: gli
 * identificativi unici, i riferimenti che portano da qualche parte, i titoli
 * che dicono un'opera sola, gli anni che non vengono dal futuro.
 */

import {
  PERCORSO_IMMAGINE,
  type DatiArte,
  type DatiCinema,
  type DatiLibri,
  type DatiLirica,
  type DatiNobel,
  type DatiScienza,
  type DatiStoria,
  type PersonaQuiz,
} from '../../shared/quiz-cultura'
import { stessiTitoli } from './wikidata'

type Senza<T> = Omit<T, 'versione'>

export interface DatiDaControllare {
  arte?: Senza<DatiArte>
  libri?: Senza<DatiLibri>
  cinema?: Senza<DatiCinema>
  lirica?: Senza<DatiLirica>
  nobel?: Senza<DatiNobel>
  storia?: Senza<DatiStoria>
  scienza?: Senza<DatiScienza>
}

/** Quanti ne servono almeno in ogni elenco: sotto, una query ha perso pezzi. */
const MINIMI: Record<string, number> = {
  'arte.quadri': 600,
  'arte.pittori': 100,
  'arte.correnti': 40,
  'libri.libri': 900,
  'libri.autori': 300,
  'cinema.film': 1000,
  'cinema.registi': 400,
  'lirica.opere': 250,
  'lirica.compositori': 80,
  'nobel.premi': 900,
  'nobel.premiati': 850,
  'storia.eventi': 800,
  'scienza.elementi': 118,
  'scienza.composti': 100,
  'scienza.unita': 28,
  'scienza.astri': 40,
  'scienza.scoperte': 100,
  'scienza.specie': 250,
}

const ANNO_MASSIMO = new Date().getFullYear()

export function controllaCultura(d: DatiDaControllare): string[] {
  const problemi: string[] = []
  const no = (testo: string) => problemi.push(testo)

  /* ── Le regole di tutti gli elenchi ── */
  for (const [materia, dati] of Object.entries(d)) {
    for (const [nome, elenco] of Object.entries(dati as Record<string, unknown>)) {
      if (!Array.isArray(elenco)) continue
      const chiave = `${materia}.${nome}`
      if (elenco.length < (MINIMI[chiave] ?? 1)) no(`${chiave}: solo ${elenco.length}`)
      const conId = elenco.filter((x): x is { id: string } => typeof (x as { id?: unknown }).id === 'string')
      const unici = new Set(conId.map((x) => x.id)).size
      if (conId.length > 0 && unici !== conId.length) no(`${chiave}: identificativi doppi`)
      for (const x of elenco as Array<{ id?: string; f?: number; anno?: number; n?: string }>) {
        if (x.f !== undefined && !(x.f >= 0 && x.f <= 1)) no(`${chiave}: notorietà fuori scala in ${x.id}`)
        const annoSbagliato = x.anno !== undefined && (!Number.isInteger(x.anno) || x.anno > ANNO_MASSIMO)
        if (annoSbagliato) no(`${chiave}: anno ${x.anno} in ${x.id}`)
        if (x.n !== undefined && x.n.trim() === '') no(`${chiave}: nome vuoto in ${x.id}`)
      }
    }
  }

  /** I riferimenti: ogni identificativo di una persona sta nel suo elenco. */
  const riferimenti = (dove: string, ids: Iterable<string>, persone: readonly { id: string }[]) => {
    const note = new Set(persone.map((p) => p.id))
    const mancanti = [...new Set(ids)].filter((id) => !note.has(id))
    if (mancanti.length > 0) no(`${dove}: persone che non ci sono (${mancanti.slice(0, 5).join(', ')})`)
  }
  /** I titoli: uno per opera, altrimenti "chi l'ha scritto?" avrebbe due risposte. */
  const titoliUnici = (dove: string, elenco: readonly { n: string }[]) => {
    for (const gruppo of stessiTitoli(elenco, (x) => x.n)) {
      if (gruppo.length > 1) no(`${dove}: il titolo «${gruppo[0].n}» c'e' ${gruppo.length} volte`)
    }
  }
  const persona = (elenco: readonly PersonaQuiz[], nome: string) => elenco.find((p) => p.n === nome)

  /* ── L'arte ── */
  if (d.arte) {
    const { quadri, pittori, correnti } = d.arte
    riferimenti('arte', quadri.flatMap((q) => q.a), pittori)
    titoliUnici('arte', quadri)
    const idCorrenti = new Set(correnti.map((c) => c.id))
    const senzaCorrente = [...quadri.flatMap((q) => q.c ?? []), ...pittori.flatMap((p) => p.c ?? [])].filter(
      (c) => !idCorrenti.has(c),
    )
    if (senzaCorrente.length > 0) no(`arte: correnti che non ci sono (${senzaCorrente.slice(0, 5).join(', ')})`)
    for (const q of quadri) {
      if (!PERCORSO_IMMAGINE.test(q.img.f) || !(q.img.r > 0)) no(`arte: immagine sbagliata per ${q.n}`)
    }
    const leonardo = persona(pittori, 'Leonardo da Vinci')
    const gioconda = quadri.find((q) => q.n === 'La Gioconda')
    if (!gioconda || !leonardo || !gioconda.a.includes(leonardo.id)) no('manca la Gioconda di Leonardo da Vinci')
    else if (!gioconda.img.f.includes('Mona_Lisa')) no(`la Gioconda ha l'immagine ${gioconda.img.f}`)
    if (!leonardo?.it || leonardo.p !== 'Italia') no('Leonardo da Vinci non risulta italiano')
    if (persona(pittori, 'Vincent van Gogh')?.p !== 'Paesi Bassi') no('Van Gogh non risulta dei Paesi Bassi')
    if (persona(pittori, 'Rembrandt')?.p !== 'Paesi Bassi') no('Rembrandt non risulta dei Paesi Bassi')
    // L'Ultima Cena non e' un affresco: e' la domanda che si fa.
    const cena = quadri.find((q) => q.n === 'Ultima Cena')
    if (!cena) no("manca l'Ultima Cena")
    else if (cena.t === 'affresco') no("l'Ultima Cena risulta un affresco")
    const notte = quadri.find((q) => q.n === 'Notte stellata')
    if (notte?.t !== 'olio su tela') no(`la Notte stellata risulta ${notte?.t}`)
    if (!correnti.some((c) => c.n === 'Impressionismo' && c.d)) no("manca l'Impressionismo con la sua descrizione")
  }

  /* ── I libri ── */
  if (d.libri) {
    const { libri, autori } = d.libri
    riferimenti('libri', libri.flatMap((l) => l.a), autori)
    titoliUnici('libri', libri)
    const manzoni = persona(autori, 'Alessandro Manzoni')
    const sposi = libri.find((l) => l.n === 'I promessi sposi')
    if (!sposi || !manzoni || !sposi.a.includes(manzoni.id)) no('mancano I promessi sposi di Alessandro Manzoni')
    else if (!sposi.it || sposi.lingua !== 'italiano') no('I promessi sposi non risultano italiani')
    const dante = persona(autori, 'Dante Alighieri')
    const commedia = libri.find((l) => l.n === 'Divina Commedia')
    if (!dante || !commedia?.a.includes(dante.id)) no('manca la Divina Commedia di Dante')
    const marx = libri.find((l) => l.n === 'Manifesto del Partito Comunista')
    if (marx && persona(autori, 'Karl Marx')?.id !== marx.a[0]) no('il primo autore del Manifesto non risulta Marx')
    if (libri.find((l) => l.n === 'Iliade')?.lingua !== 'greco antico') no("l'Iliade non risulta in greco antico")
  }

  /* ── Il cinema ── */
  if (d.cinema) {
    const { film, registi } = d.cinema
    riferimenti('cinema', film.flatMap((f) => f.r), registi)
    titoliUnici('cinema', film)
    const coppola = persona(registi, 'Francis Ford Coppola')
    const padrino = film.find((f) => f.n === 'Il padrino')
    if (!padrino || !coppola || !padrino.r.includes(coppola.id)) no('manca Il padrino di Francis Ford Coppola')
    else {
      if (padrino.p !== 'Stati Uniti' || padrino.it) {
        no(`Il padrino risulta ${padrino.p}${padrino.it ? ', italiano' : ''}`)
      }
      if (!padrino.oscar) no('Il padrino non risulta Oscar al miglior film')
    }
    const dolceVita = film.find((f) => f.n === 'La dolce vita')
    if (!dolceVita?.it || dolceVita.p !== 'Italia') no('La dolce vita non risulta italiana')
  }

  /* ── La lirica ── */
  if (d.lirica) {
    const { opere, compositori } = d.lirica
    riferimenti('lirica', opere.flatMap((o) => o.c), compositori)
    titoliUnici('lirica', opere)
    const verdi = persona(compositori, 'Giuseppe Verdi')
    const traviata = opere.find((o) => o.n === 'La traviata')
    if (!traviata || !verdi || !traviata.c.includes(verdi.id)) no('manca La traviata di Giuseppe Verdi')
    else {
      if (traviata.anno !== 1853) no(`La traviata risulta del ${traviata.anno}`)
      if (traviata.citta !== undefined && traviata.citta !== 'Venezia') {
        no(`la prima della Traviata risulta a ${traviata.citta}`)
      }
    }
  }

  /* ── I Nobel ── */
  if (d.nobel) {
    const { premi, premiati } = d.nobel
    riferimenti('nobel', premi.map((p) => p.chi), premiati)
    const einstein = persona(premiati, 'Albert Einstein')
    if (!einstein || !premi.some((p) => p.chi === einstein.id && p.premio === 'fisica' && p.anno === 1921)) {
      no('manca il Nobel per la fisica 1921 ad Albert Einstein')
    }
    const curie = persona(premiati, 'Marie Curie')
    const suoi = premi.filter((p) => p.chi === curie?.id).map((p) => `${p.premio} ${p.anno}`)
    if (!suoi.includes('fisica 1903') || !suoi.includes('chimica 1911')) {
      no(`i Nobel di Marie Curie risultano: ${suoi.join(', ')}`)
    }
    const italiani = premiati.filter((p) => p.it).map((p) => p.n)
    for (const nome of ['Guglielmo Marconi', 'Enrico Fermi', 'Rita Levi-Montalcini', 'Dario Fo']) {
      if (!italiani.includes(nome)) no(`${nome} non risulta fra i Nobel italiani`)
    }
  }

  /* ── La storia ── */
  if (d.storia) {
    const { eventi } = d.storia
    titoliUnici('storia', eventi)
    const evento = (n: string) => eventi.find((e) => e.n === n)
    if (evento('battaglia di Waterloo')?.anno !== 1815) no('la battaglia di Waterloo non risulta del 1815')
    if (evento('battaglia di Waterloo')?.tipo !== 'battaglia') no('Waterloo non risulta una battaglia')
    if (evento('battaglia delle Termopili')?.anno !== -480) no('le Termopili non risultano del 480 a.C.')
    if (evento('trattato di Versailles')?.anno !== 1919) no('il trattato di Versailles non risulta del 1919')
    const guerra = evento('seconda guerra mondiale')
    if (guerra?.anno !== 1939 || guerra.fine !== 1945 || guerra.tipo !== 'guerra') {
      no('la seconda guerra mondiale non torna')
    }
    if (!evento('marcia su Roma')?.it) no('la marcia su Roma non risulta storia d’Italia')
    if (eventi.filter((e) => e.anno < 0).length < 20) no('troppo pochi fatti avanti Cristo')
  }

  /* ── La scienza ── */
  if (d.scienza) {
    const { elementi, composti, unita, astri, scoperte, specie } = d.scienza
    const oro = elementi.find((e) => e.n === 'oro')
    if (oro?.s !== 'Au' || oro.z !== 79) no(`l'oro risulta ${oro?.s} ${oro?.z}`)
    if (new Set(elementi.map((e) => e.z)).size !== elementi.length) no('due elementi con lo stesso numero atomico')
    if (elementi.find((e) => e.z === 2)?.g !== 'gas nobile') no("l'elio non risulta un gas nobile")
    if (composti.find((c) => c.n === 'acqua')?.formula !== 'H₂O') no("l'acqua non risulta H₂O")
    if (unita.find((u) => u.n === 'newton')?.g !== 'forza') no('il newton non risulta misurare la forza')
    if (unita.find((u) => u.n === 'newton')?.da !== 'Isaac Newton') no('il newton non risulta di Isaac Newton')
    if (unita.find((u) => u.n === 'metro')?.s !== 'm') no('il metro non risulta m')
    const titano = astri.find((a) => a.n === 'Titano')
    if (titano?.tipo !== 'satellite' || titano.di !== 'Saturno') no('Titano non risulta un satellite di Saturno')
    if (astri.find((a) => a.n === 'Luna')?.di !== 'Terra') no('la Luna non risulta della Terra')
    if (astri.find((a) => a.n === 'Mercurio')?.ordine !== 1 || astri.find((a) => a.n === 'Nettuno')?.ordine !== 8) {
      no("l'ordine dei pianeti non torna")
    }
    if (astri.filter((a) => a.tipo === 'pianeta nano').length !== 5) no('i pianeti nani non sono cinque')
    const penicillina = scoperte.find((s) => s.n === 'penicillina')
    if (!penicillina?.chi.includes('Alexander Fleming')) no('la penicillina non risulta scoperta da Alexander Fleming')
    if (specie.find((s) => s.n === 'lupo')?.sci !== 'Canis lupus') no('il lupo non risulta Canis lupus')
    if (specie.find((s) => s.n === 'lupo')?.regno !== 'animale') no('il lupo non risulta un animale')
  }
  return problemi
}
