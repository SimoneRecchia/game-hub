import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { AvvisoSfida } from '@/games/amici/AvvisoSfida'
import { api } from '@/lib/api'
import { usePresenza } from '@/lib/presenza'
import { SFIDE_LIBERE, descriviOpzioni } from './giochi'

/**
 * Le sfide al sudoku, agli Anagrammi, al Paroliere, alla Ghigliottina e alla
 * Catena, da qualunque schermata, dallo stesso giro di controllo degli altri.
 * Vengono dopo quelle delle Sequenze: se c'e' gia' un altro avviso aperto
 * aspettano il loro turno. L'avviso dice anche le opzioni, perché si accetta
 * una partita precisa. Una rivincita chiesta mentre si guarda la fine della
 * sfida non ha bisogno dell'avviso: la mostra la sfida stessa.
 */
export function SfideGate() {
  const { vai } = useNavigazione()
  const { pathname } = useLocation()
  const { dati, aggiorna } = usePresenza()
  const [risposte, setRisposte] = useState<Set<string>>(new Set())

  const altroAvviso =
    ((dati?.coop.length ?? 0) > 0 && !pathname.startsWith('/wordle/insieme/')) ||
    (!pathname.startsWith('/battaglia-navale/partita/') && (dati?.battaglia.length ?? 0) > 0) ||
    (!pathname.startsWith('/quiz/duello/') && (dati?.quiz.length ?? 0) > 0) ||
    (!pathname.startsWith('/indovina-chi/partita/') && (dati?.indovina.length ?? 0) > 0) ||
    (dati?.tavolo.length ?? 0) > 0 ||
    (!pathname.startsWith('/nomi-cose-citta/sfida/') && (dati?.nomi.length ?? 0) > 0) ||
    (!pathname.startsWith('/sequenze/sfida/') && (dati?.sequenze.length ?? 0) > 0)
  const invito = altroAvviso
    ? null
    : (dati?.sfide.find((i) => !risposte.has(i.id) && !(i.rivincita && pathname.includes('/libera/sfida/'))) ??
      null)

  if (!invito) return null
  const info = SFIDE_LIBERE[invito.gioco]
  return (
    <AvvisoSfida
      invito={invito}
      gioco={info.nome}
      sfida={`${info.sfida.replace(/\.$/, '')}: ${descriviOpzioni(invito.gioco, invito.impostazioni).toLowerCase()}.`}
      onAccetta={async () => {
        const { partitaId } = await api<{ partitaId: string }>(`/sfide/partita/${invito.id}/accetta`, {
          method: 'POST',
        })
        setRisposte((prima) => new Set(prima).add(invito.id))
        aggiorna()
        vai(ROTTE.sfidaLibera(invito.gioco, partitaId))
      }}
      onRifiuta={async () => {
        setRisposte((prima) => new Set(prima).add(invito.id))
        await api(`/sfide/partita/${invito.id}/rifiuta`, { method: 'POST' }).catch(() => {})
        aggiorna()
      }}
    />
  )
}
