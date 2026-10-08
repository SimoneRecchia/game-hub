import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Sezione, Vuoto } from '@/components/Elementi'
import { IconCopy, IconShare } from '@/components/Icons'
import { useToast } from '@/components/Toast'
import { useCountdown } from '@/games/wordle/useCountdown'
import { ApiFetchError, api } from '@/lib/api'
import { formatCronometro } from '@/lib/format'
import { DOVE } from '@/lib/presenza'
import { BATTAGLIA_POLL_LOBBY_MS } from '@shared/config'
import type { InvitoNomiMandato, SalaNomi, SfidaNomiBreve } from '@shared/types'
import '@/pages/Battaglia.css'

/** Senza niente in sospeso la sala si rilegge di rado: serve solo a vedere chi entra. */
const RITMO_TRANQUILLO_MS = 12_000

/**
 * Il gioco della sala: dove stanno le sue sfide sul server e nell'app, e come
 * si chiama nel foglio di condivisione.
 */
export interface GiocoSfida {
  /** Le rotte delle sfide sul server, come `/nomi/sfide`. */
  api: string
  /** Dove stanno le sfide una per una, se non sotto `api`: `/sfide/partita` per le libere da soli. */
  partite?: string
  sfida: (id: string) => string
  invito: (codice: string) => string
  nome: string
  /** La riga del messaggio con il link: "Una sfida a Nomi, cose e città?". */
  domanda: string
}

const indirizzoDi = (gioco: GiocoSfida, codice: string) => `${window.location.origin}${gioco.invito(codice)}`

/** Il link nel foglio di sistema, dove c'e'; altrimenti negli appunti. */
async function condividi(gioco: GiocoSfida, codice: string, avvisa: (testo: string) => void) {
  const url = indirizzoDi(gioco, codice)
  if (navigator.share) {
    try {
      await navigator.share({ title: gioco.nome, text: gioco.domanda, url })
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
  }
  await copia(url, avvisa)
}

async function copia(url: string, avvisa: (testo: string) => void) {
  try {
    await navigator.clipboard.writeText(url)
    avvisa('Link copiato')
  } catch {
    avvisa('Non riesco a copiare: tieni premuto il link.')
  }
}

/**
 * La sfida con un amico, nella libera dei giochi che si giocano in due nello
 * stesso momento — Nomi, cose e città, le Sequenze, e le libere da soli: chi
 * e' online, con un invito a testa, o un link da mandare. Le opzioni scelte
 * viaggiano con l'invito. Quando l'altro accetta, la sala porta tutti e due
 * alla sfida.
 */
export function SalaSfida({ gioco, impostazioni }: { gioco: GiocoSfida; impostazioni?: unknown }) {
  const { vai } = useNavigazione()
  const toast = useToast()
  const [dati, setDati] = useState<SalaNomi | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [invio, setInvio] = useState<string | null>(null)
  /** L'ultimo invito visto in attesa: quando diventa accettato, si va alla sfida. */
  const atteso = useRef<string | null>(null)

  const carica = useCallback(async () => {
    try {
      const nuovi = await api<SalaNomi>(`${gioco.api}/sala`)
      const invito = nuovi.invito
      if (invito?.stato === 'attesa') atteso.current = invito.id
      else if (invito?.stato === 'accettato' && invito.partitaId && atteso.current === invito.id) {
        atteso.current = null
        vai(gioco.sfida(invito.partitaId))
      }
      setDati(nuovi)
      setErrore(null)
    } catch (e) {
      setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare chi c’è.')
    }
  }, [gioco, vai])

  const aspetto = dati?.invito?.stato === 'attesa'
  useEffect(() => {
    void carica()
    const ritmo = aspetto ? BATTAGLIA_POLL_LOBBY_MS : RITMO_TRANQUILLO_MS
    const giro = () => {
      if (document.visibilityState === 'visible') void carica()
    }
    const t = setInterval(giro, ritmo)
    document.addEventListener('visibilitychange', giro)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', giro)
    }
  }, [carica, aspetto])

  const invita = async (playerId: string | null) => {
    setInvio(playerId ?? 'link')
    try {
      const creato = await api<{ id: string; codice: string | null }>(gioco.api, {
        method: 'POST',
        body: { playerId, impostazioni },
      })
      atteso.current = creato.id
      if (creato.codice) await condividi(gioco, creato.codice, toast.show)
      await carica()
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Invito non mandato.', 'error')
    } finally {
      setInvio(null)
    }
  }

  const annulla = async (invito: InvitoNomiMandato) => {
    await api(`${gioco.partite ?? gioco.api}/${invito.id}/annulla`, { method: 'POST' }).catch(() => {})
    await carica()
  }

  if (errore && !dati) {
    return (
      <Vuoto
        titolo="Non riesco a vedere chi c’è"
        testo={errore}
        azione={
          <Button variant="tinted" onClick={() => void carica()}>
            Riprova
          </Button>
        }
      />
    )
  }
  if (!dati) return <div className="bat__attesa" aria-hidden="true" />

  const invito = dati.invito
  const inAttesa = invito?.stato === 'attesa' ? invito : null
  const esito = invito && !invito.codice && (invito.stato === 'rifiutato' || invito.stato === 'scaduto') ? invito : null
  const occupato = dati.partita !== null

  return (
    <>
      {dati.partita && <SfidaAperta partita={dati.partita} rotta={gioco.sfida} />}
      <Sezione titolo="Sfida">
        {inAttesa?.codice ? (
          <LinkAttivo gioco={gioco} invito={inAttesa} onRitira={() => void annulla(inAttesa)} />
        ) : (
          <Button
            variant="tinted"
            size="lg"
            fullWidth
            onClick={() => void invita(null)}
            loading={invio === 'link'}
            disabled={occupato || (invio !== null && invio !== 'link')}
          >
            <IconShare size={18} /> Sfida con un link
          </Button>
        )}

        {inAttesa && !inAttesa.codice && <InvitoInAttesa invito={inAttesa} onAnnulla={() => void annulla(inAttesa)} />}

        {esito && (
          <p className="bat-sala__esito">
            {esito.stato === 'rifiutato'
              ? `${esito.a?.displayName} non può giocare adesso.`
              : `${esito.a?.displayName} non ha risposto in tempo.`}
          </p>
        )}

        <p className="bat-sala__titolo">Online</p>
        {dati.giocatori.length === 0 ? (
          <p className="bat-sala__vuoto">Nessuno online.</p>
        ) : (
          <ul className="bat-sala__elenco">
            {dati.giocatori.map((g) => (
              <li key={g.playerId} className="bat-sala__giocatore">
                <Avatar nickname={g.nickname} color={g.avatarColor} size={40} />
                <span className="bat-sala__chi">
                  <span className="bat-sala__nome">{g.displayName}</span>
                  <span className="bat-sala__dove">{g.occupato ? 'sta già giocando' : DOVE[g.attivita]}</span>
                </span>
                <Button
                  variant={g.invitato ? 'plain' : 'tinted'}
                  disabled={g.occupato || g.invitato || occupato || invio !== null}
                  loading={invio === g.playerId}
                  onClick={() => void invita(g.playerId)}
                >
                  {g.invitato ? 'Sfidato' : 'Sfida'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Sezione>
    </>
  )
}

/** La sfida aperta: in cima, perché e' la prima cosa da fare. */
function SfidaAperta({ partita, rotta }: { partita: SfidaNomiBreve; rotta: (id: string) => string }) {
  const { vai } = useNavigazione()
  return (
    <button type="button" className="bat-sala__partita" onClick={() => vai(rotta(partita.id))}>
      <Avatar nickname={partita.avversario.nickname} color={partita.avversario.avatarColor} size={44} />
      <span className="bat-sala__partita-testo">
        <span className="bat-sala__partita-titolo">La sfida con {partita.avversario.displayName}</span>
        <span className="bat-sala__partita-stato">In corso</span>
      </span>
      <span className="bat-sala__riprendi">Riprendi</span>
    </button>
  )
}

function LinkAttivo({
  gioco,
  invito,
  onRitira,
}: {
  gioco: GiocoSfida
  invito: InvitoNomiMandato
  onRitira: () => void
}) {
  const toast = useToast()
  const restano = useCountdown(invito.scadeTraMs)
  const url = indirizzoDi(gioco, invito.codice!)
  return (
    <div className="bat-link bat-link--attivo" aria-live="polite">
      <div className="bat-link__riga">
        <span className="bat-sala__onde" aria-hidden="true" />
        <p className="bat-link__titolo">Aspetto che qualcuno apra il link…</p>
      </div>
      <p className="bat-link__url" title={url}>
        {url.replace(/^https?:\/\//, '')}
      </p>
      <div className="bat-link__azioni">
        <Button onClick={() => void condividi(gioco, invito.codice!, toast.show)}>
          <IconShare size={18} /> Condividi
        </Button>
        <Button variant="tinted" onClick={() => void copia(url, toast.show)}>
          <IconCopy size={18} /> Copia
        </Button>
      </div>
      <p className="bat-link__nota">
        Scade fra {formatCronometro(restano)}.{' '}
        <button type="button" className="bat-link__ritira" onClick={onRitira}>
          Ritira il link
        </button>
      </p>
    </div>
  )
}

function InvitoInAttesa({ invito, onAnnulla }: { invito: InvitoNomiMandato; onAnnulla: () => void }) {
  const restano = useCountdown(invito.scadeTraMs)
  return (
    <div className="bat-sala__in-attesa" aria-live="polite">
      <span className="bat-sala__onde" aria-hidden="true" />
      <p className="bat-sala__in-attesa-testo">
        Aspetto la risposta di <strong>{invito.a?.displayName}</strong>…
        <span className="bat-sala__scadenza u-tabnum"> {formatCronometro(restano)}</span>
      </p>
      <Button variant="plain" onClick={onAnnulla}>
        Annulla
      </Button>
    </div>
  )
}
