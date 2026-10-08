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
import type { GiocoLiberoInCompagnia, InvitoCompagnia } from '@shared/types'
import '@/games/wordle/coop/InviteAlert.css'

/** Che cosa si gioca, detto con il suo articolo: la classificata di oggi, o una libera. */
const PARTITA: Record<'classificata' | 'libera', Record<GiocoLiberoInCompagnia, string>> = {
  classificata: {
    wordle: 'il Wordle di oggi',
    cruciverba: 'il cruciverba di oggi',
    scarabeo: 'lo Scarabeo di oggi',
  },
  libera: {
    wordle: 'una partita libera di Wordle',
    cruciverba: 'un cruciverba libero',
    scarabeo: 'una partita libera di Scarabeo',
  },
}

/** Quel che costa accettare a chi aveva gia' cominciato. */
const COMINCIATA: Record<GiocoLiberoInCompagnia, string> = {
  wordle: 'I tentativi che hai già fatto non contano più.',
  cruciverba: 'Quel che hai già scritto nel tuo cruciverba non conta più.',
  scarabeo: 'Le mosse che hai già fatto non contano più.',
}

/** Che cosa si suggerisce. */
const SUGGERIMENTI: Record<GiocoLiberoInCompagnia, string> = {
  wordle: 'parole',
  cruciverba: 'parole',
  scarabeo: 'mosse',
}

/**
 * Gli inviti a giocare in compagnia il cruciverba o lo Scarabeo di qualcuno,
 * da qualunque schermata. Vengono dopo tutti gli altri avvisi: valgono per la
 * giornata intera, mentre una sfida scade in pochi minuti. Mentre si guarda
 * gia' la partita di qualcuno non arrivano: restano li' per dopo.
 */
export function CompagniaGate() {
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
    (dati?.lupus.length ?? 0) > 0 ||
    (dati?.scarabocchi.length ?? 0) > 0
  const invito =
    altroAvviso || pathname.includes('/insieme/')
      ? null
      : (dati?.compagnia.find((i) => !risposte.has(i.compagniaId)) ?? null)

  if (!invito) return null
  const risposto = () => setRisposte((prima) => new Set(prima).add(invito.compagniaId))
  return (
    <AvvisoCompagnia
      invito={invito}
      onAccetta={async () => {
        await api(`/compagnia/partita/${invito.compagniaId}/accetta`, { method: 'POST' })
        risposto()
        aggiorna()
        vai(ROTTE.insiemeA(invito.gioco, invito.compagniaId, invito.modalita))
      }}
      onRifiuta={async () => {
        risposto()
        await api(`/compagnia/partita/${invito.compagniaId}/rifiuta`, { method: 'POST' }).catch(() => {})
        aggiorna()
      }}
    />
  )
}

/**
 * L'avviso, come quello del Wordle: non si chiude toccando fuori, perché
 * l'host aspetta una risposta. Dice prima quel che accettare comporta.
 */
function AvvisoCompagnia({
  invito,
  onAccetta,
  onRifiuta,
}: {
  invito: InvitoCompagnia
  onAccetta: () => Promise<void>
  onRifiuta: () => Promise<void>
}) {
  const [occupato, setOccupato] = useState<'accetta' | 'rifiuta' | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    haptic('success')
    suona('invito')
  }, [invito.compagniaId])

  async function rispondi(azione: 'accetta' | 'rifiuta') {
    setOccupato(azione)
    setErrore(null)
    try {
      if (azione === 'accetta') await onAccetta()
      else await onRifiuta()
    } catch (e) {
      setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a rispondere all’invito.')
    } finally {
      setOccupato(null)
    }
  }

  const host = invito.host.displayName
  return (
    <Sheet open onClose={() => {}} dismissible={false} title="Un invito per te">
      <div className="avviso">
        <div className="avviso__testa">
          <Avatar nickname={invito.host.nickname} color={invito.host.avatarColor} size={64} />
          <p className="avviso__testo">
            <strong>{host}</strong> vuole giocare con te {PARTITA[invito.modalita][invito.gioco]}.
          </p>
        </div>

        {invito.modalita === 'libera' ? (
          <p className="avviso__sereno">Guardi la partita e suggerisci {SUGGERIMENTI[invito.gioco]}.</p>
        ) : invito.conta ? (
          <div className="avviso__insieme">
            <p className="avviso__insieme-titolo">Diventa la tua partita di oggi</p>
            <p>
              Prendi lo <strong>stesso punteggio</strong> di {host}.
            </p>
            {invito.cominciata && <p className="avviso__insieme-costo">{COMINCIATA[invito.gioco]}</p>}
          </div>
        ) : (
          <p className="avviso__sereno">L’hai già giocato oggi: il tuo punteggio non cambia.</p>
        )}

        {errore && (
          <p className="avviso__errore" role="alert">
            {errore}
          </p>
        )}

        <div className="avviso__azioni">
          <Button
            size="lg"
            fullWidth
            loading={occupato === 'accetta'}
            disabled={occupato !== null}
            onClick={() => void rispondi('accetta')}
          >
            Accetta
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
