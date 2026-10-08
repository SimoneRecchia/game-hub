import { ROTTE } from '@/app/rotte'
import { SalaSfida, type GiocoSfida } from '@/games/amici/SalaSfida'

const NOMI: GiocoSfida = {
  api: '/nomi/sfide',
  sfida: ROTTE.sfidaNomi,
  invito: ROTTE.invitoNomi,
  nome: 'Nomi, cose e città',
  domanda: 'Una sfida a Nomi, cose e città?',
}

/**
 * La sfida con un amico a Nomi, cose e città: la sala delle sfide fra due, con
 * le rotte di questo gioco e il tempo scelto nella libera.
 */
export function SalaAmico({ secondi }: { secondi: number }) {
  return <SalaSfida gioco={NOMI} impostazioni={{ secondi }} />
}
