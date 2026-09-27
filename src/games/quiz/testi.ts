import { NOMI_CONTINENTI, type CategoriaQuiz, type Continente, type ModoQuiz } from '@shared/quiz'
import type { AreaQuiz, IndiceQuiz } from '@shared/quiz-domande'

/** Le parole delle categorie: cosa si chiede, in una riga, a scelta o sulla cartina. */
export const DESCRIZIONI: Record<ModoQuiz, Record<CategoriaQuiz, string>> = {
  scelta: {
    capitali: 'La capitale di uno stato, o lo stato di una capitale.',
    citta: 'In quale stato — o regione — si trova una città, e quale città sta dove.',
    bandiere: 'Di chi è una bandiera, o quale bandiera è di chi.',
    stati: 'Con chi confina uno stato, con chi no, e chi non ha il mare.',
    mari: 'Quale mare bagna uno stato, e quale stato bagna un mare.',
    oceani: 'Quale oceano bagna uno stato, e quale stato bagna un oceano.',
    fiumi: 'In quale stato scorre un fiume, e quale fiume scorre in uno stato.',
    laghi: 'In quale stato si trova un lago, e quale lago si trova in uno stato.',
    cartina: 'Un paese, un mare o un oceano da trovare sulla cartina muta.',
  },
  cartina: {
    capitali: 'Una capitale da trovare sulla cartina muta: tocca il suo pallino.',
    citta: 'Una città da trovare sulla cartina muta: tocca il suo pallino.',
    bandiere: 'Una bandiera, e lo stato da trovare sulla cartina muta.',
    stati: 'Uno stato da trovare sulla cartina muta.',
    mari: 'Un mare, un golfo o una baia da trovare sulla cartina muta.',
    oceani: 'Dove sono gli oceani, e quale bagna uno stato: si tocca sulla cartina.',
    fiumi: 'Un fiume da trovare sulla cartina muta: tocca la sua linea.',
    laghi: 'Un lago da trovare sulla cartina muta.',
    cartina: 'Un paese, un mare o un oceano da trovare sulla cartina muta.',
  },
}

export function descrizione(categoria: CategoriaQuiz, modo: ModoQuiz | null): string {
  return DESCRIZIONI[modo ?? 'scelta'][categoria]
}

/** Il nome di dove si gioca: "Tutto il mondo", un continente, o un paese. */
export function nomeArea(area: AreaQuiz, ix: IndiceQuiz | null): string {
  if (area === 'mondo') return 'Tutto il mondo'
  if (area.startsWith('paese:')) return ix?.paesi.get(area.slice(6))?.n ?? '…'
  return NOMI_CONTINENTI[area as Continente]
}
