import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { NOMI_CHIAMATA, type ChiamataRicevuta, type GiocoChiamata } from '@shared/notifiche'
import type { GiocatoreBreve } from '@shared/types'
import { useNavigazione } from '@/app/navigazione'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { ApiFetchError, api } from '@/lib/api'
import { haptic } from '@/lib/haptics'
import { usePresenza } from '@/lib/presenza'
import { suona } from '@/lib/suoni'
import { invitaA, salaDi } from './amici'
import '@/games/wordle/coop/InviteAlert.css'

/** "3 minuti fa", "adesso". */
function quanto(iso: string): string {
  const minuti = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  if (minuti < 1) return 'adesso'
  return minuti === 1 ? 'un minuto fa' : `${minuti} minuti fa`
}

/**
 * Gli inviti arrivati quando non si era online, con la notifica: chi ti ha
 * chiamato, a che cosa, e da quanto. Rispondere manda l'invito vero del gioco
 * a chi ti ha chiamato, se c'e' ancora; se no lo richiama, e lui trovera' lo
 * stesso avviso. Viene dopo tutti gli altri avvisi, che sono inviti veri.
 */
export function ChiamataGate() {
  const { vai } = useNavigazione()
  const { pathname } = useLocation()
  const { dati, aggiorna } = usePresenza()
  const toast = useToast()
  const [risposte, setRisposte] = useState<Set<string>>(new Set())

  const altroAvviso =
    (dati?.coop.length ?? 0) > 0 ||
    (dati?.battaglia.length ?? 0) > 0 ||
    (dati?.quiz.length ?? 0) > 0 ||
    (dati?.indovina.length ?? 0) > 0 ||
    (dati?.tavolo.length ?? 0) > 0 ||
    (dati?.nomi.length ?? 0) > 0 ||
    (dati?.sequenze.length ?? 0) > 0 ||
    (dati?.sfide.length ?? 0) > 0 ||
    (dati?.lupus.length ?? 0) > 0 ||
    (dati?.scarabocchi.length ?? 0) > 0 ||
    (dati?.compagnia.length ?? 0) > 0
  // Dentro una partita no: l'invito aspetta che la si finisca.
  const inPartita = /\/(partita|duello|stanza|insieme|tavolo)\//.test(pathname)
  const chiamata = altroAvviso || inPartita ? null : (dati?.chiamate?.find((c) => !risposte.has(c.id)) ?? null)
  if (!chiamata) return null

  const risposto = () => setRisposte((prima) => new Set(prima).add(chiamata.id))

  return (
    <AvvisoChiamata
      chiamata={chiamata}
      onGioca={async () => {
        const { gioco, da, online } = await api<{ gioco: GiocoChiamata; da: GiocatoreBreve; online: boolean }>(
          `/chiamate/${chiamata.id}/rispondi`,
          { method: 'POST' },
        )
        risposto()
        if (online) {
          vai(await invitaA(gioco, da))
        } else {
          // Se n'e' andato: lo si richiama, e intanto si va nella sala del gioco.
          const { avvisato } = await api<{ avvisato: boolean }>('/chiamate', {
            method: 'POST',
            body: { playerId: da.playerId, gioco },
          })
          toast.show(
            avvisato
              ? `${da.displayName} non c’è più: gli è arrivata una notifica.`
              : `${da.displayName} non c’è più: vedrà il tuo invito quando apre l’app.`,
          )
          vai(salaDi(gioco))
        }
        aggiorna()
      }}
      onRifiuta={async () => {
        risposto()
        await api(`/chiamate/${chiamata.id}/rifiuta`, { method: 'POST' }).catch(() => {})
        aggiorna()
      }}
    />
  )
}

function AvvisoChiamata({
  chiamata,
  onGioca,
  onRifiuta,
}: {
  chiamata: ChiamataRicevuta
  onGioca: () => Promise<void>
  onRifiuta: () => Promise<void>
}) {
  const [occupato, setOccupato] = useState<'gioca' | 'rifiuta' | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    haptic('success')
    suona('invito')
  }, [chiamata.id])

  async function rispondi(azione: 'gioca' | 'rifiuta') {
    setOccupato(azione)
    setErrore(null)
    try {
      if (azione === 'gioca') await onGioca()
      else await onRifiuta()
    } catch (e) {
      setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a rispondere all’invito.')
    } finally {
      setOccupato(null)
    }
  }

  return (
    <Sheet open onClose={() => {}} dismissible={false} title="Un invito per te">
      <div className="avviso">
        <div className="avviso__testa">
          <Avatar nickname={chiamata.da.nickname} color={chiamata.da.avatarColor} size={64} />
          <p className="avviso__testo">
            <strong>{chiamata.da.displayName}</strong> ti ha invitato a <strong>{NOMI_CHIAMATA[chiamata.gioco]}</strong>.
          </p>
        </div>
        <p className="avviso__sereno">{quanto(chiamata.createdAt)[0].toUpperCase() + quanto(chiamata.createdAt).slice(1)}</p>

        {errore && (
          <p className="avviso__errore" role="alert">
            {errore}
          </p>
        )}

        <div className="avviso__azioni">
          <Button
            size="lg"
            fullWidth
            loading={occupato === 'gioca'}
            disabled={occupato !== null}
            onClick={() => void rispondi('gioca')}
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

/**
 * Una notifica toccata con l'app gia' aperta: il service worker dice dove
 * andare (`vai`, in public/sw.js), e ci si va senza ricaricare la pagina.
 */
export function AscoltaNotifiche() {
  const { vai } = useNavigazione()
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const ascolta = (e: MessageEvent) => {
      const m = e.data as { tipo?: string; url?: string } | null
      if (m?.tipo !== 'vai' || typeof m.url !== 'string') return
      const url = new URL(m.url, window.location.origin)
      if (url.origin === window.location.origin) vai(url.pathname + url.search)
    }
    navigator.serviceWorker.addEventListener('message', ascolta)
    return () => navigator.serviceWorker.removeEventListener('message', ascolta)
  }, [vai])
  return null
}
