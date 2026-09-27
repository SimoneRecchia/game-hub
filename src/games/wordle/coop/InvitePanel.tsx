import { useEffect } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Sheet } from '@/components/Sheet'
import { IconCheck, IconClose } from '@/components/Icons'
import { MAX_COOP_GUESTS } from '@shared/config'
import type { CoopRoom, InvitablePlayer } from '@shared/types'
import './InvitePanel.css'

interface Props {
  open: boolean
  onClose: () => void
  room: CoopRoom | null
  players: InvitablePlayer[] | null
  busy: boolean
  error: string | null
  onInvite: (playerId: string) => void
  onRevoke: (inviteId: string) => void
  onLoadPlayers: () => void
}

/** Pannello dell'host: chi invitare, chi ha accettato, quanti posti restano. */
export function InvitePanel({
  open,
  onClose,
  room,
  players,
  busy,
  error,
  onInvite,
  onRevoke,
  onLoadPlayers,
}: Props) {
  useEffect(() => {
    if (open) onLoadPlayers()
  }, [open, onLoadPlayers])

  const invitati = room?.guests.filter((g) => g.status !== 'declined') ?? []
  const posti = MAX_COOP_GUESTS - invitati.length
  const liberi = players?.filter((p) => !p.invited) ?? []

  return (
    <Sheet open={open} onClose={onClose} title="Gioca in compagnia">
      <div className="invita">
        <p className="invita__lede">Chi accetta vede la tua griglia e può suggerirti parole.</p>

        <div className="invita__contatore">
          <span>
            {invitati.length} {invitati.length === 1 ? 'invito' : 'inviti'}
          </span>
          <span className="invita__posti">
            {posti > 0 ? `${posti} ${posti === 1 ? 'posto libero' : 'posti liberi'}` : 'al completo'}
          </span>
        </div>

        {invitati.length > 0 && (
          <ul className="invita__lista">
            {invitati.map((g) => (
              <li className="invita__riga" key={g.inviteId}>
                <Avatar nickname={g.nickname} color={g.avatarColor} size={34} />
                <span className="invita__riga-corpo">
                  <span className="invita__nome">{g.displayName}</span>
                  <span className="invita__stato">
                    {g.status === 'accepted'
                      ? g.suggestions > 0
                        ? `Sta guardando · ${g.suggestions} ${g.suggestions === 1 ? 'suggerimento' : 'suggerimenti'}`
                        : 'Sta guardando'
                      : 'In attesa di risposta'}
                  </span>
                </span>
                {g.status === 'accepted' && (
                  <span className="invita__spunta" aria-hidden="true">
                    <IconCheck size={16} />
                  </span>
                )}
                <button
                  type="button"
                  className="invita__ritira"
                  onClick={() => onRevoke(g.inviteId)}
                  disabled={busy}
                  aria-label={`Ritira l'invito a ${g.displayName}`}
                >
                  <IconClose size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="invita__errore" role="alert">
            {error}
          </p>
        )}

        {posti > 0 && (
          <div className="invita__blocco">
            <h3 className="invita__titolo">Chi vuoi invitare</h3>
            {players === null ? (
              <p className="invita__vuoto">Un attimo…</p>
            ) : liberi.length === 0 ? (
              <p className="invita__vuoto">Non c’è ancora nessun altro. Passa il link ai colleghi.</p>
            ) : (
              <ul className="invita__lista">
                {liberi.map((p) => (
                  <li className="invita__riga" key={p.playerId}>
                    <Avatar nickname={p.nickname} color={p.avatarColor} size={34} />
                    <span className="invita__riga-corpo">
                      <span className="invita__nome">{p.displayName}</span>
                      <span className={`invita__stato${p.playedToday ? '' : ' is-avviso'}`}>
                        {p.playedToday ? 'Ha già giocato oggi' : 'Non ha ancora giocato oggi'}
                      </span>
                    </span>
                    <Button
                      variant={p.playedToday ? 'tinted' : 'plain'}
                      onClick={() => onInvite(p.playerId)}
                      disabled={busy}
                    >
                      Invita
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="invita__nota">Chi non ha ancora giocato prende il tuo stesso punteggio.</p>
      </div>
    </Sheet>
  )
}
