import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Sheet } from '@/components/Sheet'
import { ApiFetchError, api } from '@/lib/api'
import { haptic } from '@/lib/haptics'
import { usePresenza } from '@/lib/presenza'
import { suona } from '@/lib/suoni'
import { NOMI_MODI_SCARABOCCHI, type InvitoScarabocchi } from '@shared/scarabocchi'
import '@/games/wordle/coop/InviteAlert.css'

/**
 * Gli inviti a una stanza di Scarabocchi, da qualunque schermata, dallo
 * stesso giro di controllo degli altri. Vengono dopo tutti gli altri avvisi,
 * Lupus compreso: due insieme non si leggerebbero. Mentre si guarda la stanza
 * dell'invito non arriva: ci si e' gia'.
 */
export function ScarabocchiGate() {
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
    (dati?.nomi.length ?? 0) > 0 ||
    (dati?.sequenze.length ?? 0) > 0 ||
    (dati?.sfide.length ?? 0) > 0 ||
    (dati?.lupus.length ?? 0) > 0
  const invito = altroAvviso
    ? null
    : (dati?.scarabocchi.find((i) => !risposte.has(i.id) && pathname !== ROTTE.stanzaScarabocchi(i.codice)) ?? null)

  if (!invito) return null
  const risposto = () => setRisposte((prima) => new Set(prima).add(invito.id))
  return (
    <AvvisoInvito
      invito={invito}
      onEntra={async () => {
        await api(`/scarabocchi/stanze/${invito.codice}/entra`, { method: 'POST' })
        risposto()
        aggiorna()
        vai(ROTTE.stanzaScarabocchi(invito.codice))
      }}
      onRifiuta={async () => {
        risposto()
        await api(`/scarabocchi/inviti/${invito.id}/rifiuta`, { method: 'POST' }).catch(() => {})
        aggiorna()
      }}
    />
  )
}

function AvvisoInvito({
  invito,
  onEntra,
  onRifiuta,
}: {
  invito: InvitoScarabocchi
  onEntra: () => Promise<void>
  onRifiuta: () => Promise<void>
}) {
  const [occupato, setOccupato] = useState<'entra' | 'rifiuta' | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    haptic('success')
    suona('invito')
  }, [invito.id])

  async function rispondi(azione: 'entra' | 'rifiuta') {
    setOccupato(azione)
    setErrore(null)
    try {
      if (azione === 'entra') await onEntra()
      else await onRifiuta()
    } catch (e) {
      setErrore(e instanceof ApiFetchError ? e.message : 'Risposta non inviata. Riprova.')
    } finally {
      setOccupato(null)
    }
  }

  return (
    <Sheet open onClose={() => {}} dismissible={false} title="Scarabocchi">
      <div className="avviso">
        <div className="avviso__testa">
          <Avatar nickname={invito.da.nickname} color={invito.da.avatarColor} size={64} />
          <p className="avviso__testo">
            <strong>{invito.da.displayName}</strong> ti invita a disegnare.
          </p>
        </div>
        <p className="avviso__sereno">
          {NOMI_MODI_SCARABOCCHI[invito.modo]} ·{' '}
          {invito.iscritti === 1 ? 'nella stanza c’è 1 giocatore' : `nella stanza ci sono ${invito.iscritti} giocatori`}
        </p>
        {errore && <p className="avviso__errore">{errore}</p>}
        <div className="avviso__azioni">
          <Button
            size="lg"
            fullWidth
            loading={occupato === 'entra'}
            disabled={occupato !== null}
            onClick={() => void rispondi('entra')}
          >
            Entra
          </Button>
          <Button
            variant="plain"
            size="lg"
            fullWidth
            loading={occupato === 'rifiuta'}
            disabled={occupato !== null}
            onClick={() => void rispondi('rifiuta')}
          >
            Non adesso
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
