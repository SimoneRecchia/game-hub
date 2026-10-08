import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { AvvisoSfida } from '@/games/amici/AvvisoSfida'
import { api } from '@/lib/api'
import { usePresenza } from '@/lib/presenza'

const DOVE_SI_GIOCA = '/sequenze/sfida/'

/**
 * Le sfide a Sequenze, da qualunque schermata, dallo stesso giro di controllo
 * degli altri. Vengono dopo quelle di Nomi, cose e città: se c'e' gia' un
 * altro avviso aperto aspettano il loro turno, perché due avvisi insieme non
 * si leggerebbero. Una rivincita chiesta mentre si guarda la fine della sfida
 * non ha bisogno dell'avviso: la mostra la sfida stessa.
 */
export function SequenzeGate() {
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
    (!pathname.startsWith('/nomi-cose-citta/sfida/') && (dati?.nomi.length ?? 0) > 0)
  const invito = altroAvviso
    ? null
    : (dati?.sequenze.find((i) => !risposte.has(i.id) && !(i.rivincita && pathname.startsWith(DOVE_SI_GIOCA))) ?? null)

  if (!invito) return null
  return (
    <AvvisoSfida
      invito={invito}
      gioco="Sequenze"
      sfida="ti sfida a Sequenze."
      onAccetta={async () => {
        const { partitaId } = await api<{ partitaId: string }>(`/sequenze/sfide/${invito.id}/accetta`, {
          method: 'POST',
        })
        setRisposte((prima) => new Set(prima).add(invito.id))
        aggiorna()
        vai(ROTTE.sfidaSequenze(partitaId))
      }}
      onRifiuta={async () => {
        setRisposte((prima) => new Set(prima).add(invito.id))
        await api(`/sequenze/sfide/${invito.id}/rifiuta`, { method: 'POST' }).catch(() => {})
        aggiorna()
      }}
    />
  )
}
