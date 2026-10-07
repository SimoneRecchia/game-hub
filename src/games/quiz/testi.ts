import {
  MATERIE,
  NOMI_CATEGORIE,
  NOMI_CONTINENTI,
  NOMI_MODI,
  diGeografia,
  materiaDi,
  nomeAmbito,
  nomeGenere,
  type CategoriaQuiz,
  type Continente,
  type MateriaQuiz,
  type ModoQuiz,
} from '@shared/quiz'
import { GENERI_CANZONI, NOMI_GENERI, giornoInLettere } from '@shared/quiz-cultura'
import type { AreaQuiz, IndiceQuiz, SezioneQuiz } from '@shared/quiz-domande'

/** Che cosa c'e' in una materia, in una riga: sotto il suo nome, nel menu della libera. */
export const DESCRIZIONI_MATERIE: Record<MateriaQuiz, string> = {
  geografia: 'Capitali, bandiere, mari, fiumi, città',
  storia: 'Date famose, Accadde oggi',
  cultura: 'Quadri, libri, film',
  musica: 'Pop, rock, cantautori, classica, lirica',
  scienza: 'Chimica, astronomia, animali, Nobel',
}

/**
 * Una sottocategoria nella pagina di una materia: di solito una categoria, e
 * nella scienza anche un argomento, perché la chimica e l'astronomia chiedono
 * cose diverse e non sono un filtro, come i periodi dell'arte. Nella musica le
 * voci sono i generi: quelli delle canzoni, la classica e la lirica.
 */
export interface VoceMateria {
  categoria: CategoriaQuiz
  /** L'argomento, se la voce e' uno solo: allora non si sceglie piu' sotto. */
  ambito?: string
  /** Il genere delle canzoni, per una voce della musica. */
  genere?: string
  nome: string
  /** Che cosa si chiede, se non e' la descrizione della categoria. */
  descrizione?: string
}

const perCategoria = (m: MateriaQuiz): VoceMateria[] =>
  MATERIE.find((x) => x.id === m)!.categorie.map((categoria) => ({ categoria, nome: NOMI_CATEGORIE[categoria] }))

export const VOCI_MATERIE: Record<MateriaQuiz, readonly VoceMateria[]> = {
  geografia: perCategoria('geografia'),
  storia: perCategoria('storia'),
  cultura: perCategoria('cultura'),
  // I generi si scelgono insieme, come gli argomenti della scienza: le canzoni hanno i loro, poi la classica e
  // la lirica.
  musica: [
    ...GENERI_CANZONI.map((genere) => ({ categoria: 'canzoni' as const, genere, nome: NOMI_GENERI[genere] })),
    { categoria: 'classica', nome: 'Musica classica' },
    { categoria: 'lirica', nome: 'Lirica' },
  ],
  // Gli argomenti si scelgono insieme, quanti se ne vuole: "tutta la scienza" e' sceglierli tutti.
  scienza: [
    {
      categoria: 'scienza',
      ambito: 'chimica',
      nome: 'Chimica',
      descrizione: 'I simboli degli elementi e le formule dei composti.',
    },
    {
      categoria: 'scienza',
      ambito: 'fisica',
      nome: 'Fisica',
      descrizione: 'Le unità di misura: che cosa misurano, e da chi prendono il nome.',
    },
    {
      categoria: 'scienza',
      ambito: 'astronomia',
      nome: 'Astronomia',
      descrizione: 'I pianeti, il loro ordine dal Sole, e i loro satelliti.',
    },
    {
      categoria: 'scienza',
      ambito: 'scoperte',
      nome: 'Scoperte e invenzioni',
      descrizione: 'Quando e da chi sono state fatte le grandi scoperte e invenzioni.',
    },
    {
      categoria: 'scienza',
      ambito: 'natura',
      nome: 'Animali',
      descrizione: 'A quale gruppo appartengono: mammiferi, uccelli, rettili, pesci.',
    },
    { categoria: 'nobel', nome: 'Premi Nobel' },
  ],
}

/** La voce di una scelta: quella con il suo argomento o il suo genere, se c'e', o quella della categoria. */
export function voceDi(
  materia: MateriaQuiz,
  categoria: CategoriaQuiz,
  ambito: string | undefined,
  genere?: string,
): VoceMateria | null {
  const voci = VOCI_MATERIE[materia].filter((v) => v.categoria === categoria)
  if (genere && genere !== 'tutti') return voci.find((v) => v.genere === genere) ?? null
  return (
    voci.find((v) => v.ambito === (ambito ?? 'tutti')) ??
    voci.find((v) => v.ambito === undefined && v.genere === undefined) ??
    null
  )
}

/** Cosa si chiede in una categoria, in una riga: l'introduzione della partita. */
export const DESCRIZIONI: Record<ModoQuiz, Record<CategoriaQuiz, string>> = {
  scelta: {
    capitali: 'La capitale di uno stato, o lo stato di una capitale.',
    citta: 'In che stato o regione si trova una città.',
    bandiere: 'Riconosci le bandiere degli stati.',
    stati: 'Confini e stati senza sbocco sul mare.',
    mari: 'Quali mari bagnano gli stati.',
    oceani: 'Quali oceani bagnano gli stati.',
    fiumi: 'In quali stati scorrono i fiumi.',
    laghi: 'In quali stati si trovano i laghi.',
    cartina: 'Stati, mari e oceani da trovare sulla cartina.',
    arte: 'Di chi è il quadro, come si intitola, di che corrente è.',
    libri: 'Chi ha scritto i libri, e quando.',
    cinema: 'Chi ha diretto i film, e in che anno sono usciti.',
    canzoni: 'Chi canta le canzoni, e quando sono uscite.',
    classica: 'Chi ha composto i grandi brani, e quando.',
    lirica: 'Chi ha composto le opere, e dove hanno debuttato.',
    nobel: 'In quale campo ha vinto chi ha avuto il premio Nobel.',
    storia: 'In che anno o in che secolo, e che cosa venne prima.',
    oggi: 'Quel che è successo in questo giorno, e chi è nato.',
    scienza: 'Elementi e formule, unità di misura, pianeti, scoperte, animali.',
  },
  cartina: {
    capitali: 'Trova la capitale sulla cartina.',
    citta: 'Trova la città sulla cartina.',
    bandiere: 'Trova sulla cartina lo stato della bandiera.',
    stati: 'Trova lo stato sulla cartina.',
    mari: 'Trova il mare sulla cartina.',
    oceani: 'Trova gli oceani sulla cartina.',
    fiumi: 'Trova il fiume sulla cartina.',
    laghi: 'Trova il lago sulla cartina.',
    cartina: 'Trova stati, mari e oceani sulla cartina.',
    arte: 'Di chi è il quadro, come si intitola, di che corrente è.',
    libri: 'Chi ha scritto i libri, e quando.',
    cinema: 'Chi ha diretto i film, e in che anno sono usciti.',
    canzoni: 'Chi canta le canzoni, e quando sono uscite.',
    classica: 'Chi ha composto i grandi brani, e quando.',
    lirica: 'Chi ha composto le opere, e dove hanno debuttato.',
    nobel: 'In quale campo ha vinto chi ha avuto il premio Nobel.',
    storia: 'In che anno o in che secolo, e che cosa venne prima.',
    oggi: 'Quel che è successo in questo giorno, e chi è nato.',
    scienza: 'Elementi e formule, unità di misura, pianeti, scoperte, animali.',
  },
}

export function descrizione(categoria: CategoriaQuiz, modo: ModoQuiz | null): string {
  return DESCRIZIONI[modo ?? 'scelta'][categoria]
}

/**
 * Su cosa si gioca, oltre la categoria: la zona e il modo per la geografia
 * ("Europa", "Cartina muta"), l'ambito o il giorno per le altre materie
 * ("Ottocento", "12 marzo"). Vuoto se e' tutto.
 */
export function dettagliPartita(
  s: {
    categoria: CategoriaQuiz
    modo?: ModoQuiz | null
    area?: AreaQuiz
    ambito?: string | null
    genere?: string | null
    nazione?: string | null
    giorno?: string | null
  },
  ix: IndiceQuiz | null,
): string[] {
  if (diGeografia(s.categoria)) return [NOMI_MODI[s.modo ?? 'scelta'], nomeArea(s.area ?? 'mondo', ix)]
  // Il giorno e' "03-12" per una partita, "caso" per le scelte di chi vuole un giorno a caso.
  const giorno = s.giorno === 'caso' ? 'Un giorno a caso' : s.giorno ? giornoInLettere(s.giorno) : null
  return [nomeAmbito(s.categoria, s.ambito) ?? giorno, nomeGenere(s.categoria, s.genere), s.nazione].filter(
    (x): x is string => !!x,
  )
}

/**
 * Il nome di una partita di piu' sezioni: "Città, Bandiere e Stati". Le
 * sezioni sono le voci della pagina della materia, quindi gli argomenti della
 * scienza si chiamano per nome: "Chimica e Fisica".
 */
export function nomeSezioni(materia: MateriaQuiz, sezioni: readonly SezioneQuiz[]): string {
  const nomi = sezioni.map((x) => voceDi(materia, x.categoria, x.ambito, x.genere)?.nome ?? NOMI_CATEGORIE[x.categoria])
  return nomi.length <= 1 ? (nomi[0] ?? '') : `${nomi.slice(0, -1).join(', ')} e ${nomi[nomi.length - 1]}`
}

/** Il nome di una partita o di una sfida: la categoria, o le sue sezioni. */
export function nomePartita(s: { categoria: CategoriaQuiz; sezioni?: readonly SezioneQuiz[] }): string {
  return s.sezioni?.length ? nomeSezioni(materiaDi(s.categoria), s.sezioni) : NOMI_CATEGORIE[s.categoria]
}

/** Il nome di dove si gioca: "Tutto il mondo", un continente, o un paese. */
export function nomeArea(area: AreaQuiz, ix: IndiceQuiz | null): string {
  if (area === 'mondo') return 'Tutto il mondo'
  if (area.startsWith('paese:')) return ix?.paesi.get(area.slice(6))?.n ?? '…'
  return NOMI_CONTINENTI[area as Continente]
}
