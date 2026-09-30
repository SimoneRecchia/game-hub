import {
  MATERIE,
  NOMI_CATEGORIE,
  NOMI_CONTINENTI,
  NOMI_MODI,
  diGeografia,
  nomeAmbito,
  type CategoriaQuiz,
  type Continente,
  type MateriaQuiz,
  type ModoQuiz,
} from '@shared/quiz'
import { giornoInLettere } from '@shared/quiz-cultura'
import type { AreaQuiz, IndiceQuiz } from '@shared/quiz-domande'

/** Che cosa c'e' in una materia, in una riga: sotto il suo nome, nel menu della libera. */
export const DESCRIZIONI_MATERIE: Record<MateriaQuiz, string> = {
  geografia: 'Capitali, bandiere, mari, fiumi, città',
  storia: 'Date famose, Accadde oggi',
  cultura: 'Quadri, libri, film, lirica',
  scienza: 'Chimica, astronomia, natura, Nobel',
}

/**
 * Una sottocategoria nella pagina di una materia: di solito una categoria, e
 * nella scienza anche un argomento, perché la chimica e l'astronomia chiedono
 * cose diverse e non sono un filtro, come i periodi dell'arte.
 */
export interface VoceMateria {
  categoria: CategoriaQuiz
  /** L'argomento, se la voce e' uno solo: allora non si sceglie piu' sotto. */
  ambito?: string
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
  scienza: [
    { categoria: 'scienza', ambito: 'tutti', nome: 'Tutta la scienza' },
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
      descrizione: 'Chi ha fatto le grandi scoperte e le grandi invenzioni.',
    },
    {
      categoria: 'scienza',
      ambito: 'natura',
      nome: 'Animali e piante',
      descrizione: 'Il nome scientifico delle specie.',
    },
    { categoria: 'nobel', nome: 'Premi Nobel' },
  ],
}

/** La voce di una scelta: quella con il suo argomento, se c'e', o quella della categoria. */
export function voceDi(materia: MateriaQuiz, categoria: CategoriaQuiz, ambito: string | undefined): VoceMateria | null {
  const voci = VOCI_MATERIE[materia].filter((v) => v.categoria === categoria)
  return voci.find((v) => v.ambito === (ambito ?? 'tutti')) ?? voci.find((v) => v.ambito === undefined) ?? null
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
    lirica: 'Chi ha composto le opere, e dove hanno debuttato.',
    nobel: 'Chi ha vinto il premio Nobel, in quale campo, e quando.',
    storia: 'In che anno o in che secolo, e che cosa venne prima.',
    oggi: 'Quel che è successo in questo giorno, e chi è nato.',
    scienza: 'Elementi e formule, unità di misura, pianeti, scoperte, specie.',
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
    lirica: 'Chi ha composto le opere, e dove hanno debuttato.',
    nobel: 'Chi ha vinto il premio Nobel, in quale campo, e quando.',
    storia: 'In che anno o in che secolo, e che cosa venne prima.',
    oggi: 'Quel che è successo in questo giorno, e chi è nato.',
    scienza: 'Elementi e formule, unità di misura, pianeti, scoperte, specie.',
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
    giorno?: string | null
  },
  ix: IndiceQuiz | null,
): string[] {
  if (diGeografia(s.categoria)) return [NOMI_MODI[s.modo ?? 'scelta'], nomeArea(s.area ?? 'mondo', ix)]
  // Il giorno e' "03-12" per una partita, "caso" per le scelte di chi vuole un giorno a caso.
  const giorno = s.giorno === 'caso' ? 'Un giorno a caso' : s.giorno ? giornoInLettere(s.giorno) : null
  const cosa = nomeAmbito(s.categoria, s.ambito) ?? giorno
  return cosa ? [cosa] : []
}

/** Il nome di dove si gioca: "Tutto il mondo", un continente, o un paese. */
export function nomeArea(area: AreaQuiz, ix: IndiceQuiz | null): string {
  if (area === 'mondo') return 'Tutto il mondo'
  if (area.startsWith('paese:')) return ix?.paesi.get(area.slice(6))?.n ?? '…'
  return NOMI_CONTINENTI[area as Continente]
}
