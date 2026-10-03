import { CILIEGIE, PREMI } from '@shared/slot'

/**
 * Quanto si festeggia una vincita della slot: piu' e' rara, piu' e' grande,
 * un gradino alla volta. Sulla slot la scala dei premi sale con la rarita'
 * (lo tiene `shared/__tests__/slot.test.ts`), quindi il premio basta a dire il
 * gradino, e un test verifica che l'ordine dei momenti sia quello delle
 * frequenze vere, su tutte le combinazioni dei rulli.
 *
 * I primi tre stanno sul mobile e non coprono mai la linea: la targhetta della
 * ciliegia sola, che esce un giro ogni quattro e deve rendere presto la leva;
 * la targa di due ciliegie e dei limoni, con le monete che saltano fuori; il
 * palco delle arance e delle prugne, con i raggi dietro l'insegna e la
 * fontana. Dal ×20 la festa prende lo schermo (`FestaSlot`): BIG WIN, SUPER WIN
 * per le campane, MEGA WIN per il BAR, e il JACKPOT dei sette, una volta ogni
 * sessantaquattromila giri, che non somiglia a nessun altro.
 */

export type LivelloFesta = 'big' | 'super' | 'mega' | 'jackpot'
export type MomentoMobile = 'targhetta' | 'targa' | 'palco'
export type Momento = MomentoMobile | LivelloFesta

/** I momenti in fila, dal piu' frequente al piu' raro. */
export const MOMENTI: readonly Momento[] = ['targhetta', 'targa', 'palco', 'big', 'super', 'mega', 'jackpot']

/** Il momento di una vincita della linea, da quante volte paga la puntata: nessuno se non paga. */
export function momentoDi(premio: number): Momento | null {
  if (premio <= 0) return null
  if (premio >= PREMI['7']) return 'jackpot'
  if (premio >= PREMI.R) return 'mega'
  if (premio >= PREMI.B) return 'super'
  if (premio >= CILIEGIE[3]) return 'big'
  if (premio >= PREMI.O) return 'palco'
  if (premio >= PREMI.L) return 'targa'
  return 'targhetta'
}

/** Dal ×20 la vincita ha la festa, che prende lo schermo. */
export function eFesta(momento: Momento): momento is LivelloFesta {
  return MOMENTI.indexOf(momento) >= MOMENTI.indexOf('big')
}
