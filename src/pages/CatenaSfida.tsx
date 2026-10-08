import { ComeSiGiocaCatena } from '@/games/catena/ComeSiGioca'
import { PartitaSfidaCatena } from '@/games/catena/Sfida'
import { PaginaSfida } from '@/games/sfide/PaginaSfida'

/** Una sfida con un amico alla Catena: la stessa partita, dal via, ognuno sul suo telefono. */
export default function CatenaSfida() {
  return <PaginaSfida gioco="catena" Partita={PartitaSfidaCatena} Regole={ComeSiGiocaCatena} />
}
