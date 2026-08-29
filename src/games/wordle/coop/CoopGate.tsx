import { useLocation, useNavigate } from 'react-router-dom'
import { InviteAlert } from './InviteAlert'
import { useCoopInbox } from './useCoopInbox'

/**
 * Sorveglia gli inviti in arrivo e mostra l'avviso, da qualunque schermata.
 *
 * Sta fuori dalle rotte perché un invito può arrivare mentre si guarda la
 * classifica o il profilo, non solo dall'hub.
 */
export function CoopGate() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  /*
   * Il polling si spegne mentre si e' già dentro una partita condivisa: quello
   * e' l'unico posto dove un altro invito sarebbe solo un'interruzione.
   */
  const attivo = !pathname.startsWith('/insieme/')
  const { invites, accetta, rifiuta } = useCoopInbox(attivo)

  // Uno alla volta: due avvisi sovrapposti non si potrebbero leggere.
  const primo = invites[0] ?? null

  return (
    <InviteAlert
      invite={primo}
      onAccept={async (id) => {
        const roomId = await accetta(id)
        navigate(`/insieme/${roomId}`)
      }}
      onDecline={rifiuta}
    />
  )
}
