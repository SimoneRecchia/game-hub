import {
  NOMI_CONTINENTI,
  NOMI_MODI,
  diGeografia,
  nomeAmbito,
  type CategoriaQuiz,
  type Continente,
  type ModoQuiz,
} from '@shared/quiz'
import { giornoInLettere } from '@shared/quiz-cultura'
import { NOMI_TIPI, type AreaQuiz, type IndiceQuiz, type TipoDomanda } from '@shared/quiz-domande'

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

const SULLA_CARTINA = 'Dove si trova la risposta, sulla cartina con i nomi'

/** Cosa insegna ogni categoria dopo la risposta, in una riga: sotto l'interruttore delle spiegazioni. */
export const COSA_INSEGNA: Record<CategoriaQuiz, string> = {
  capitali: SULLA_CARTINA,
  citta: SULLA_CARTINA,
  bandiere: SULLA_CARTINA,
  stati: SULLA_CARTINA,
  mari: SULLA_CARTINA,
  oceani: SULLA_CARTINA,
  fiumi: SULLA_CARTINA,
  laghi: SULLA_CARTINA,
  cartina: SULLA_CARTINA,
  arte: 'Il pittore, la corrente, la tecnica e il museo',
  libri: 'L’autore, l’anno, il genere e la lingua',
  cinema: 'La regia, l’anno, il paese e gli interpreti',
  lirica: 'La musica, il libretto e la prima',
  nobel: 'Chi è, da dove viene e la motivazione',
  storia: 'Quando, dove e di che cosa fa parte',
  oggi: 'Il fatto o la persona, in due righe',
  scienza: 'Simboli, famiglie, scopritori e nomi',
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
  const cosa = nomeAmbito(s.categoria, s.ambito) ?? (s.giorno ? giornoInLettere(s.giorno) : null)
  return cosa ? [cosa] : []
}

/** Il nome di dove si gioca: "Tutto il mondo", un continente, o un paese. */
export function nomeArea(area: AreaQuiz, ix: IndiceQuiz | null): string {
  if (area === 'mondo') return 'Tutto il mondo'
  if (area.startsWith('paese:')) return ix?.paesi.get(area.slice(6))?.n ?? '…'
  return NOMI_CONTINENTI[area as Continente]
}

/** Il nome di un tipo di domanda nelle opzioni: per gli oceani, le domande dei mari parlano di oceani. */
export function nomeTipo(tipo: TipoDomanda, categoria: CategoriaQuiz): string {
  if (categoria !== 'oceani') return NOMI_TIPI[tipo]
  if (tipo === 'stato-bagnato') return 'Quale stato si affaccia su un oceano'
  if (tipo === 'acqua-di-stato') return 'Quale oceano bagna uno stato'
  if (tipo === 'dove-acqua') return 'Dov’è un oceano'
  return NOMI_TIPI[tipo]
}
