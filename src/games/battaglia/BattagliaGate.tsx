import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Sheet } from '@/components/Sheet'
import { useCountdown } from '@/games/wordle/useCountdown'
import { ApiFetchError, api } from '@/lib/api'
import { formatCronometro } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import { usePresenza } from '@/lib/presenza'
import type { InvitoBattaglia, PartitaBreve } from '@shared/types'
import { ROTTE } from '@/app/rotte'
import '@/games/wordle/coop/InviteAlert.css'

const CHIAVE_ANNUNCIATE = 'battaglia:annunciate'

function leggiAnnunciate(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(CHIAVE_ANNUNCIATE) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

/**
 * Le sfide a battaglia navale, da qualunque schermata.
 *
 * Sta fuori dalle rotte come l'avviso del Wordle in compagnia, e ne legge lo
 * stesso giro di controllo. Due avvisi insieme non si leggerebbero: se c'e' un
 * invito del Wordle aperto, la sfida aspetta il suo turno.
 *
 * Mostra anche la partita cominciata mentre si era altrove — chi sfida e poi
 * torna all'hub deve sapere che l'altro ha accettato — una volta sola per
 * partita e per sessione.
 */
export function BattagliaGate() {
  const { vai } = useNavigazione()
  const { pathname } = useLocation()
  const { dati, aggiorna } = usePresenza()
  const [risposte, setRisposte] = useState<Set<string>>(new Set())
  const [annunciate, setAnnunciate] = useState<Set<string>>(leggiAnnunciate)

  const inBattaglia = pathname.startsWith('/battaglia-navale')
  const coopAperto = (dati?.coop.length ?? 0) > 0 && !pathname.startsWith('/wordle/insieme/')
  const sfida =
    !pathname.startsWith('/battaglia-navale/partita/') && !coopAperto
      ? (dati?.battaglia.find((s) => !risposte.has(s.id)) ?? null)
      : null
  const partita = dati?.partita ?? null
  const daAnnunciare =
    !sfida && !coopAperto && partita && !inBattaglia && !annunciate.has(partita.id) ? partita : null

  const segnaAnnunciata = (id: string) => {
    setAnnunciate((prima) => {
      const dopo = new Set(prima).add(id)
      try {
        sessionStorage.setItem(CHIAVE_ANNUNCIATE, JSON.stringify([...dopo]))
      } catch {
        /* senza sessionStorage l'avviso ricomparira' al prossimo caricamento: pazienza */
      }
      return dopo
    })
  }

  if (sfida) {
    return (
      <AvvisoSfida
        sfida={sfida}
        onAccetta={async () => {
          const { partitaId } = await api<{ partitaId: string }>(`/battaglia/sfide/${sfida.id}/accetta`, {
            method: 'POST',
          })
          setRisposte((prima) => new Set(prima).add(sfida.id))
          segnaAnnunciata(partitaId)
          aggiorna()
          vai(ROTTE.partitaBattaglia(partitaId))
        }}
        onRifiuta={async () => {
          setRisposte((prima) => new Set(prima).add(sfida.id))
          await api(`/battaglia/sfide/${sfida.id}/rifiuta`, { method: 'POST' }).catch(() => {})
          aggiorna()
        }}
      />
    )
  }

  if (daAnnunciare) {
    return (
      <AvvisoPartita
        partita={daAnnunciare}
        onVai={() => {
          segnaAnnunciata(daAnnunciare.id)
          vai(ROTTE.partitaBattaglia(daAnnunciare.id))
        }}
        onDopo={() => segnaAnnunciata(daAnnunciare.id)}
      />
    )
  }

  return null
}

function AvvisoSfida({
  sfida,
  onAccetta,
  onRifiuta,
}: {
  sfida: InvitoBattaglia
  onAccetta: () => Promise<void>
  onRifiuta: () => Promise<void>
}) {
  const [occupato, setOccupato] = useState<'accetta' | 'rifiuta' | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const restano = useCountdown(sfida.scadeTraMs)

  // Una vibrazione quando arriva, non a ogni giro di controllo.
  useEffect(() => {
    haptic('success')
  }, [sfida.id])

  async function rispondi(azione: 'accetta' | 'rifiuta') {
    setOccupato(azione)
    setErrore(null)
    try {
      if (azione === 'accetta') await onAccetta()
      else await onRifiuta()
    } catch (err) {
      setErrore(err instanceof ApiFetchError ? err.message : 'Non sono riuscito a rispondere.')
    } finally {
      setOccupato(null)
    }
  }

  return (
    <Sheet open onClose={() => {}} dismissible={false} title="Battaglia navale">
      <div className="avviso">
        <div className="avviso__testa">
          <Avatar nickname={sfida.da.nickname} color={sfida.da.avatarColor} size={64} />
          <p className="avviso__testo">
            <strong>{sfida.da.displayName}</strong> ti sfida a battaglia navale: cinque navi a testa,
            un colpo per volta.
          </p>
        </div>
        <p className="avviso__sereno">
          La sfida scade fra <span className="u-tabnum">{formatCronometro(restano)}</span>. Se ora
          non puoi, rifiuta: {sfida.da.displayName} lo vede subito e non resta ad aspettare.
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
            Accetta la sfida
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

function AvvisoPartita({
  partita,
  onVai,
  onDopo,
}: {
  partita: PartitaBreve
  onVai: () => void
  onDopo: () => void
}) {
  const testo =
    partita.stato === 'disposizione'
      ? `${partita.avversario.displayName} ha accettato la sfida: è ora di disporre la flotta.`
      : partita.tuoTurno
        ? `La battaglia con ${partita.avversario.displayName} è in corso, e tocca a te.`
        : `La battaglia con ${partita.avversario.displayName} è in corso.`
  return (
    <Sheet open onClose={onDopo} title="Battaglia navale">
      <div className="avviso">
        <div className="avviso__testa">
          <Avatar nickname={partita.avversario.nickname} color={partita.avversario.avatarColor} size={64} />
          <p className="avviso__testo">{testo}</p>
        </div>
        <div className="avviso__azioni">
          <Button size="lg" fullWidth onClick={onVai}>
            Alla battaglia
          </Button>
          <Button variant="plain" size="lg" fullWidth onClick={onDopo}>
            Più tardi
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
