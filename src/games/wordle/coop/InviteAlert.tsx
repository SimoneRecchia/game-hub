import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Sheet } from '@/components/Sheet'
import type { CoopInvite } from '@shared/types'
import './InviteAlert.css'

interface Props {
  invite: CoopInvite | null
  onAccept: (inviteId: string) => Promise<void>
  onDecline: (inviteId: string) => Promise<void>
}

/**
 * L'avviso che compare quando arriva un invito.
 *
 * Non e' chiudibile con un tap fuori: la scelta va fatta, altrimenti l'invito
 * resterebbe in sospeso e l'host aspetterebbe a vuoto.
 */
export function InviteAlert({ invite, onAccept, onDecline }: Props) {
  const [busy, setBusy] = useState<'accetta' | 'rifiuta' | null>(null)

  if (!invite) return null

  async function rispondi(azione: 'accetta' | 'rifiuta') {
    setBusy(azione)
    try {
      if (azione === 'accetta') await onAccept(invite!.inviteId)
      else await onDecline(invite!.inviteId)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet open onClose={() => {}} dismissible={false} title="Ti hanno invitato">
      <div className="avviso">
        <div className="avviso__testa">
          <Avatar nickname={invite.hostName} color={invite.hostAvatarColor} size={64} />
          <p className="avviso__testo">
            <strong>{invite.hostName}</strong> sta giocando il Wordle #{invite.puzzleNumber} e ti
            chiede una mano.
          </p>
        </div>

        {invite.wouldSpoil ? (
          <div className="avviso__insieme">
            <p className="avviso__insieme-titolo">La parola di oggi la giocate insieme</p>
            <p>
              La parola è la stessa per tutti, quindi diventa quella la tua di oggi: la tua
              griglia si chiude e prendi lo <strong>stesso punteggio</strong> che fa{' '}
              {invite.hostName}. Giocare in compagnia non vale meno che giocare da soli.
            </p>
            {invite.myAttempts > 0 && (
              <p className="avviso__insieme-costo">
                Hai già {invite.myAttempts}{' '}
                {invite.myAttempts === 1 ? 'tentativo' : 'tentativi'} sulla tua griglia:
                accettando {invite.myAttempts === 1 ? 'lo lasci' : 'li lasci'} lì.
              </p>
            )}
          </div>
        ) : (
          <p className="avviso__sereno">
            Hai già giocato la tua parola di oggi, quindi il punteggio è al sicuro. Qui puoi dare
            una mano a {invite.hostName}, senza fare altri punti.
          </p>
        )}

        <div className="avviso__azioni">
          <Button
            size="lg"
            fullWidth
            loading={busy === 'accetta'}
            disabled={busy !== null}
            onClick={() => void rispondi('accetta')}
          >
            {invite.wouldSpoil ? 'Giochiamo insieme' : 'Vado a dare una mano'}
          </Button>
          <Button
            variant="plain"
            size="lg"
            fullWidth
            loading={busy === 'rifiuta'}
            disabled={busy !== null}
            onClick={() => void rispondi('rifiuta')}
          >
            Non adesso
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
