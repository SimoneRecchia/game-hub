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
import type { InvitoIndovina, PartitaIndovinaBreve } from '@shared/types'
import '@/games/wordle/coop/InviteAlert.css'

const CHIAVE_ANNUNCIATE = 'indovina:annunciate'

function leggiAnnunciate(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(CHIAVE_ANNUNCIATE) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

/**
 * Gli inviti a Indovina chi, da qualunque schermata, come quelli della
 * battaglia e del quiz, dallo stesso giro di controllo. Vengono per ultimi:
 * se c'e' gia' un altro avviso aperto aspettano il loro turno, perché due
 * avvisi insieme non si leggerebbero.
 *
 * Una rivincita chiesta mentre si guarda la fine della partita non ha bisogno
 * dell'avviso: la mostra la partita stessa.
 */
export function IndovinaGate() {
  const { vai } = useNavigazione()
  const { pathname } = useLocation()
  const { dati, aggiorna } = usePresenza()
  const [risposte, setRisposte] = useState<Set<string>>(new Set())
  const [annunciate, setAnnunciate] = useState<Set<string>>(leggiAnnunciate)

  const inPartita = pathname.startsWith('/indovina-chi/partita/')
  const altroAvviso =
    ((dati?.coop.length ?? 0) > 0 && !pathname.startsWith('/wordle/insieme/')) ||
    (!pathname.startsWith('/battaglia-navale/partita/') && (dati?.battaglia.length ?? 0) > 0) ||
    (!pathname.startsWith('/quiz/duello/') && (dati?.quiz.length ?? 0) > 0)
  const invito = altroAvviso
    ? null
    : (dati?.indovina.find((i) => !risposte.has(i.id) && !(i.rivincita && inPartita)) ?? null)
  const partita = dati?.partitaIndovina ?? null
  const daAnnunciare =
    !invito && !altroAvviso && partita && !pathname.startsWith('/indovina-chi') && !annunciate.has(partita.id)
      ? partita
      : null

  const segnaAnnunciata = (id: string) => {
    setAnnunciate((prima) => {
      const dopo = new Set(prima).add(id)
      try {
        sessionStorage.setItem(CHIAVE_ANNUNCIATE, JSON.stringify([...dopo]))
      } catch {
        /* senza sessionStorage l'avviso ricomparira' al prossimo caricamento */
      }
      return dopo
    })
  }

  if (invito) {
    return (
      <AvvisoInvito
        invito={invito}
        onAccetta={async () => {
          const { partitaId } = await api<{ partitaId: string }>(`/indovina/inviti/${invito.id}/accetta`, {
            method: 'POST',
          })
          setRisposte((prima) => new Set(prima).add(invito.id))
          segnaAnnunciata(partitaId)
          aggiorna()
          vai(ROTTE.partitaIndovina(partitaId))
        }}
        onRifiuta={async () => {
          setRisposte((prima) => new Set(prima).add(invito.id))
          await api(`/indovina/inviti/${invito.id}/rifiuta`, { method: 'POST' }).catch(() => {})
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
          vai(ROTTE.partitaIndovina(daAnnunciare.id))
        }}
        onDopo={() => segnaAnnunciata(daAnnunciare.id)}
      />
    )
  }

  return null
}

function AvvisoInvito({
  invito,
  onAccetta,
  onRifiuta,
}: {
  invito: InvitoIndovina
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
    <Sheet open onClose={() => {}} dismissible={false} title="Indovina chi">
      <div className="avviso">
        <div className="avviso__testa">
          <Avatar nickname={invito.da.nickname} color={invito.da.avatarColor} size={64} />
          <p className="avviso__testo">
            <strong>{invito.da.displayName}</strong>{' '}
            {invito.rivincita ? 'vuole la rivincita.' : `ti invita a Indovina chi, con ${invito.set.toLowerCase()}.`}
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

function AvvisoPartita({
  partita,
  onVai,
  onDopo,
}: {
  partita: PartitaIndovinaBreve
  onVai: () => void
  onDopo: () => void
}) {
  useEffect(() => {
    suona('entra')
  }, [partita.id])
  const nome = partita.avversario.displayName
  const testo =
    partita.tocca === 'risposta'
      ? `${nome} ti ha fatto una domanda.`
      : partita.tocca === 'domanda'
        ? `${nome} aspetta la tua domanda.`
        : `La partita con ${nome} è in corso.`
  return (
    <Sheet open onClose={onDopo} title="Indovina chi">
      <div className="avviso">
        <div className="avviso__testa">
          <Avatar nickname={partita.avversario.nickname} color={partita.avversario.avatarColor} size={64} />
          <p className="avviso__testo">{testo}</p>
        </div>
        <div className="avviso__azioni">
          <Button size="lg" fullWidth onClick={onVai}>
            Alla partita
          </Button>
          <Button variant="plain" size="lg" fullWidth onClick={onDopo}>
            Più tardi
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
