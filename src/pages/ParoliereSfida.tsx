import { ComeSiGiocaParoliere } from '@/games/paroliere/ComeSiGioca'
import { PartitaSfidaParoliere } from '@/games/paroliere/Sfida'
import { PaginaSfida } from '@/games/sfide/PaginaSfida'

/** Una sfida con un amico al Paroliere: la stessa partita, dal via, ognuno sul suo telefono. */
export default function ParoliereSfida() {
  return <PaginaSfida gioco="paroliere" Partita={PartitaSfidaParoliere} Regole={ComeSiGiocaParoliere} />
}
