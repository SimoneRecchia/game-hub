import { ComeSiGiocaGhigliottina } from '@/games/ghigliottina/ComeSiGioca'
import { PartitaSfidaGhigliottina } from '@/games/ghigliottina/Sfida'
import { PaginaSfida } from '@/games/sfide/PaginaSfida'

/** Una sfida con un amico alla Ghigliottina: la stessa partita, dal via, ognuno sul suo telefono. */
export default function GhigliottinaSfida() {
  return <PaginaSfida gioco="ghigliottina" Partita={PartitaSfidaGhigliottina} Regole={ComeSiGiocaGhigliottina} />
}
