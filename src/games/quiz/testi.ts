import { AMBITI, NOMI_CONTINENTI, type CategoriaQuiz, type Continente, type ModoQuiz } from '@shared/quiz'
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
    storia: 'Quando sono successi i fatti della storia.',
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
    storia: 'Quando sono successi i fatti della storia.',
    oggi: 'Quel che è successo in questo giorno, e chi è nato.',
    scienza: 'Elementi e formule, unità di misura, pianeti, scoperte, specie.',
  },
}

export function descrizione(categoria: CategoriaQuiz, modo: ModoQuiz | null): string {
  return DESCRIZIONI[modo ?? 'scelta'][categoria]
}

/** Il nome dell'ambito di una materia: "Ottocento", "Fisica"; null per "tutti". */
export function nomeAmbito(categoria: CategoriaQuiz, ambito: string | undefined): string | null {
  if (!ambito || ambito === 'tutti') return null
  return AMBITI[categoria]?.find((a) => a.id === ambito)?.nome ?? null
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
