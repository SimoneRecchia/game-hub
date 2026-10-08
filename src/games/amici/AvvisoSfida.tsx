import { useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Sheet } from '@/components/Sheet'
import { useCountdown } from '@/games/wordle/useCountdown'
import { ApiFetchError } from '@/lib/api'
import { formatCronometro } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import { suona } from '@/lib/suoni'
import type { InvitoNomi } from '@shared/types'
import '@/games/wordle/coop/InviteAlert.css'

/**
 * L'avviso di una sfida arrivata, per i giochi che si giocano in due nello
 * stesso momento: chi sfida, quanto manca alla scadenza, Gioca o Non adesso.
 * Non si chiude toccando fuori: la risposta e' una delle due.
 */
export function AvvisoSfida({
  invito,
  gioco,
  sfida,
  onAccetta,
  onRifiuta,
}: {
  invito: InvitoNomi
  /** Il titolo del foglio: il nome del gioco. */
  gioco: string
  /** Cosa chiede chi invita: "ti sfida a Nomi, cose e città." */
  sfida: string
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
    <Sheet open onClose={() => {}} dismissible={false} title={gioco}>
      <div className="avviso">
        <div className="avviso__testa">
          <Avatar nickname={invito.da.nickname} color={invito.da.avatarColor} size={64} />
          <p className="avviso__testo">
            <strong>{invito.da.displayName}</strong>{' '}
            {invito.rivincita ? 'vuole la rivincita.' : sfida}
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
