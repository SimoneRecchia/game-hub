import { ROTTE } from '@/app/rotte'
import { SalaSfida, type GiocoSfida } from '@/games/amici/SalaSfida'

const NOMI: GiocoSfida = {
  api: '/nomi/sfide',
  sfida: ROTTE.sfidaNomi,
  invito: ROTTE.invitoNomi,
  nome: 'Nomi, cose e città',
  domanda: 'Una sfida a Nomi, cose e città?',
}

/** La sfida con un amico a Nomi, cose e città: la sala delle sfide fra due, con le rotte di questo gioco. */
export function SalaAmico() {
  return <SalaSfida gioco={NOMI} />
}
