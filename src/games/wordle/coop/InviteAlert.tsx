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
    <Sheet open onClose={() => {}} dismissible={false} title="Un invito per te">
      <div className="avviso">
        <div className="avviso__testa">
          <Avatar nickname={invite.hostName} color={invite.hostAvatarColor} size={64} />
          <p className="avviso__testo">
            <strong>{invite.hostName}</strong> vuole giocare con te il Wordle #{invite.puzzleNumber}.
          </p>
        </div>

        {invite.wouldSpoil ? (
          <div className="avviso__insieme">
            <p className="avviso__insieme-titolo">Diventa la tua partita di oggi</p>
            <p>
              Prendi lo <strong>stesso punteggio</strong> di {invite.hostName}.
            </p>
            {invite.myAttempts > 0 && (
              <p className="avviso__insieme-costo">
                {invite.myAttempts === 1
                  ? 'Il tentativo che hai già fatto non conta più.'
                  : `I ${invite.myAttempts} tentativi che hai già fatto non contano più.`}
              </p>
            )}
          </div>
        ) : (
          <p className="avviso__sereno">Hai già giocato la parola di oggi. Il tuo punteggio non cambia.</p>
        )}

        <div className="avviso__azioni">
          <Button
            size="lg"
            fullWidth
            loading={busy === 'accetta'}
            disabled={busy !== null}
            onClick={() => void rispondi('accetta')}
          >
            Accetta
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
