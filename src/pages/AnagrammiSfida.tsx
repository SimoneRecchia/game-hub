import { ComeSiGiocaAnagrammi } from '@/games/anagrammi/ComeSiGioca'
import { PartitaSfidaAnagrammi } from '@/games/anagrammi/Sfida'
import { PaginaSfida } from '@/games/sfide/PaginaSfida'

/** Una sfida con un amico agli Anagrammi: la stessa partita, dal via, ognuno sul suo telefono. */
export default function AnagrammiSfida() {
  return <PaginaSfida gioco="anagrammi" Partita={PartitaSfidaAnagrammi} Regole={ComeSiGiocaAnagrammi} />
}
