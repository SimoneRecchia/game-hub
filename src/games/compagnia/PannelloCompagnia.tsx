import { useEffect } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { IconCheck, IconClose } from '@/components/Icons'
import { Sheet } from '@/components/Sheet'
import { MAX_COOP_GUESTS } from '@shared/config'
import type { CompagniaHost, GiocoInCompagnia, InvitabileCompagnia } from '@shared/types'
import '@/games/wordle/coop/InvitePanel.css'

/** Che cosa vede e fa chi accetta, gioco per gioco. */
const LEDE: Record<GiocoInCompagnia, string> = {
  cruciverba: 'Chi accetta vede la tua griglia e ti suggerisce parole.',
  scarabeo: 'Chi accetta vede il tuo tabellone e ti suggerisce mosse.',
}

interface Props {
  gioco: GiocoInCompagnia
  open: boolean
  onClose: () => void
  compagnia: CompagniaHost | null
  giocatori: InvitabileCompagnia[] | null
  occupato: boolean
  errore: string | null
  onInvita: (playerId: string) => void
  onRitira: (playerId: string) => void
  onCaricaGiocatori: () => void
}

/**
 * Il pannello dell'host: chi invitare, chi e' dentro, quanti posti restano. Lo
 * stesso del Wordle, con le stesse regole: chi ha accettato non si manda via,
 * perché la sua giornata e' ormai la tua partita.
 */
export function PannelloCompagnia({
  gioco,
  open,
  onClose,
  compagnia,
  giocatori,
  occupato,
  errore,
  onInvita,
  onRitira,
  onCaricaGiocatori,
}: Props) {
  useEffect(() => {
    if (open) onCaricaGiocatori()
  }, [open, onCaricaGiocatori])

  const ospiti = compagnia?.ospiti.filter((o) => o.stato !== 'rifiutato') ?? []
  const posti = MAX_COOP_GUESTS - ospiti.length
  const liberi = giocatori?.filter((g) => !g.invitato) ?? []

  return (
    <Sheet open={open} onClose={onClose} title="Gioca in compagnia">
      <div className="invita">
        <p className="invita__lede">{LEDE[gioco]}</p>

        <div className="invita__contatore">
          <span>
            {ospiti.length} {ospiti.length === 1 ? 'invito' : 'inviti'}
          </span>
          <span className="invita__posti">
            {posti > 0 ? `${posti} ${posti === 1 ? 'posto libero' : 'posti liberi'}` : 'al completo'}
          </span>
        </div>

        {ospiti.length > 0 && (
          <ul className="invita__lista">
            {ospiti.map((o) => (
              <li className="invita__riga" key={o.playerId}>
                <Avatar nickname={o.nickname} color={o.avatarColor} size={34} />
                <span className="invita__riga-corpo">
                  <span className="invita__nome">{o.displayName}</span>
                  <span className="invita__stato">
                    {o.stato === 'dentro'
                      ? o.suggerimenti > 0
                        ? `Sta guardando · ${o.suggerimenti} ${o.suggerimenti === 1 ? 'suggerimento' : 'suggerimenti'}`
                        : 'Sta guardando'
                      : 'In attesa di risposta'}
                  </span>
                </span>
                {o.stato === 'dentro' ? (
                  <span className="invita__spunta" aria-hidden="true">
                    <IconCheck size={16} />
                  </span>
                ) : (
                  <button
                    type="button"
                    className="invita__ritira"
                    onClick={() => onRitira(o.playerId)}
                    disabled={occupato}
                    aria-label={`Ritira l'invito a ${o.displayName}`}
                  >
                    <IconClose size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {errore && (
          <p className="invita__errore" role="alert">
            {errore}
          </p>
        )}

        {posti > 0 && (
          <div className="invita__blocco">
            <h3 className="invita__titolo">Chi vuoi invitare</h3>
            {giocatori === null ? (
              <p className="invita__vuoto">Un attimo…</p>
            ) : liberi.length === 0 ? (
              <p className="invita__vuoto">Non c’è ancora nessun altro.</p>
            ) : (
              <ul className="invita__lista">
                {liberi.map((g) => (
                  <li className="invita__riga" key={g.playerId}>
                    <Avatar nickname={g.nickname} color={g.avatarColor} size={34} />
                    <span className="invita__riga-corpo">
                      <span className="invita__nome">{g.displayName}</span>
                      <span className={`invita__stato${g.occupato || g.haGiocato ? '' : ' is-avviso'}`}>
                        {g.occupato
                          ? 'Gioca già in compagnia'
                          : g.haGiocato
                            ? 'Ha già giocato oggi'
                            : g.online
                              ? 'Online · non ha ancora giocato'
                              : 'Non ha ancora giocato oggi'}
                      </span>
                    </span>
                    <Button
                      variant={g.haGiocato ? 'tinted' : 'plain'}
                      onClick={() => onInvita(g.playerId)}
                      disabled={occupato || g.occupato}
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
