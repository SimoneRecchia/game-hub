import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Sheet } from '@/components/Sheet'
import { useCountdown } from '@/games/wordle/useCountdown'
import { ApiFetchError, api } from '@/lib/api'
import { formatCronometro } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import { usePresenza } from '@/lib/presenza'
import { suona } from '@/lib/suoni'
import type { InvitoNomi } from '@shared/types'
import '@/games/wordle/coop/InviteAlert.css'

const DOVE_SI_GIOCA = '/nomi-cose-citta/sfida/'

/**
 * Le sfide a Nomi, cose e città, da qualunque schermata, dallo stesso giro di
 * controllo degli altri. Vengono per ultime: se c'e' gia' un altro avviso
 * aperto aspettano il loro turno, perché due avvisi insieme non si
 * leggerebbero. Una rivincita chiesta mentre si guarda la fine della sfida non
 * ha bisogno dell'avviso: la mostra la sfida stessa.
 */
export function NomiGate() {
  const { vai } = useNavigazione()
  const { pathname } = useLocation()
  const { dati, aggiorna } = usePresenza()
  const [risposte, setRisposte] = useState<Set<string>>(new Set())

  const altroAvviso =
    ((dati?.coop.length ?? 0) > 0 && !pathname.startsWith('/wordle/insieme/')) ||
    (!pathname.startsWith('/battaglia-navale/partita/') && (dati?.battaglia.length ?? 0) > 0) ||
    (!pathname.startsWith('/quiz/duello/') && (dati?.quiz.length ?? 0) > 0) ||
    (!pathname.startsWith('/indovina-chi/partita/') && (dati?.indovina.length ?? 0) > 0) ||
    (dati?.tavolo.length ?? 0) > 0
  const invito = altroAvviso
    ? null
    : (dati?.nomi.find((i) => !risposte.has(i.id) && !(i.rivincita && pathname.startsWith(DOVE_SI_GIOCA))) ?? null)

  if (!invito) return null
  return (
    <AvvisoInvito
      invito={invito}
      onAccetta={async () => {
        const { partitaId } = await api<{ partitaId: string }>(`/nomi/sfide/${invito.id}/accetta`, { method: 'POST' })
        setRisposte((prima) => new Set(prima).add(invito.id))
        aggiorna()
        vai(ROTTE.sfidaNomi(partitaId))
      }}
      onRifiuta={async () => {
        setRisposte((prima) => new Set(prima).add(invito.id))
        await api(`/nomi/sfide/${invito.id}/rifiuta`, { method: 'POST' }).catch(() => {})
        aggiorna()
      }}
    />
  )
}

function AvvisoInvito({
  invito,
  onAccetta,
  onRifiuta,
}: {
  invito: InvitoNomi
  onAccetta: () => Promise<void>
  onRifiuta: () => Promise<void>
}) {
  const [occupato, setOccupato] = useState<'accetta' | 'rifiuta' | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const restano = useCountdown(invito.scadeTraMs)

  useEffect(() => {
    haptic('success')
    suona('invito')
  }, [invito.id])

  async function rispondi(azione: 'accetta' | 'rifiuta') {
    setOccupato(azione)
    setErrore(null)
    try {
      if (azione === 'accetta') await onAccetta()
      else await onRifiuta()
    } catch (err) {
      setErrore(err instanceof ApiFetchError ? err.message : 'Risposta non inviata. Riprova.')
    } finally {
      setOccupato(null)
    }
  }

  return (
    <Sheet open onClose={() => {}} dismissible={false} title="Nomi, cose e città">
      <div className="avviso">
        <div className="avviso__testa">
          <Avatar nickname={invito.da.nickname} color={invito.da.avatarColor} size={64} />
          <p className="avviso__testo">
            <strong>{invito.da.displayName}</strong>{' '}
            {invito.rivincita ? 'vuole la rivincita.' : 'ti sfida a Nomi, cose e città.'}
          </p>
        </div>
        <p className="avviso__sereno">
          Scade fra <span className="u-tabnum">{formatCronometro(restano)}</span>.
        </p>
        {errore && <p className="avviso__errore">{errore}</p>}
        <div className="avviso__azioni">
          <Button
            size="lg"
            fullWidth
            loading={occupato === 'accetta'}
            disabled={occupato !== null || restano === 0}
            onClick={() => void rispondi('accetta')}
          >
            Gioca
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
