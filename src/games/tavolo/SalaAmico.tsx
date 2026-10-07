import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Sezione, Vuoto } from '@/components/Elementi'
import { IconCopy, IconShare } from '@/components/Icons'
import { useToast } from '@/components/Toast'
import { useCountdown } from '@/games/wordle/useCountdown'
import { ApiFetchError, api } from '@/lib/api'
import { formatCronometro } from '@/lib/format'
import { DOVE, usePresenza } from '@/lib/presenza'
import { BATTAGLIA_POLL_LOBBY_MS } from '@shared/config'
import type { GiocoAlTavolo } from '@shared/tavolo'
import type { InvitoTavoloMandato, PartitaTavoloBreve, SalaTavolo } from '@shared/types'
import { A_GIOCO, NOMI_AL_TAVOLO, nomeVariante } from './nomi'
import '@/pages/Battaglia.css'
import '@/pages/Tavolo.css'

/** Senza niente in sospeso la sala si rilegge di rado: serve solo a vedere chi entra. */
const RITMO_TRANQUILLO_MS = 12_000

/**
 * La parte "Amico" di una sala: chi e' online, l'invito mandato e com'e'
 * andato, le partite da riprendere. E' la stessa per i tavolieri (TavoloSala)
 * e per lo Scarabeo (ScarabeoLibero), perché gli inviti stanno tutti sul tavolo
 * del server. Quando l'amico accetta, la sala porta alla partita.
 */
export function useSalaTavolo(gioco: GiocoAlTavolo, variante: string | null = null) {
  const { vai } = useNavigazione()
  const toast = useToast()
  const presenza = usePresenza()
  const [dati, setDati] = useState<SalaTavolo | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [invio, setInvio] = useState<string | null>(null)
  /** Le partite viste al giro prima: quando ne compare una nuova, perché l'altro ha accettato, ci si va. */
  const viste = useRef<Set<string> | null>(null)

  const carica = useCallback(async () => {
    try {
      const nuovi = await api<SalaTavolo>(`/tavolo/sala?gioco=${gioco}`)
      const nuova = viste.current ? nuovi.partite.find((p) => !viste.current!.has(p.id)) : undefined
      viste.current = new Set(nuovi.partite.map((p) => p.id))
      if (nuova) vai(ROTTE.partitaTavolo(gioco, nuova.id))
      setDati(nuovi)
      setErrore(null)
    } catch (e) {
      setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare la sala.')
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
      const creato = await api<{ id: string; codice: string | null }>('/tavolo/inviti', {
        method: 'POST',
        body: { gioco, playerId, variante },
      })
      if (creato.codice) await condividi(gioco, creato.codice, toast.show)
      await carica()
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Invito non mandato.', 'error')
    } finally {
      setInvio(null)
    }
  }

  const annulla = async (invito: InvitoTavoloMandato) => {
    await api(`/tavolo/inviti/${invito.id}/annulla`, { method: 'POST' }).catch(() => {})
    await carica()
  }

  const invito = dati?.invito ?? null
  // Si gioca una partita al tavolo alla volta: quella aperta, di questo gioco o di un altro, la dice il giro
  // di controllo. Una partita ferma da mezz'ora resta da riprendere, ma non tiene piu' occupati.
  const aperta = presenza.dati?.partitaTavolo ?? null
  return {
    gioco,
    dati,
    errore,
    invio,
    carica,
    invita,
    annulla,
    inAttesa: invito?.stato === 'attesa' ? invito : null,
    esito: invito && !invito.codice && (invito.stato === 'rifiutato' || invito.stato === 'scaduto') ? invito : null,
    altrove: aperta && aperta.gioco !== gioco ? aperta : null,
    occupato: aperta !== null,
  }
}

export type SalaDelTavolo = ReturnType<typeof useSalaTavolo>

/** Gli inviti: con un link, o a chi e' online. */
export function InvitaAmico({ sala }: { sala: SalaDelTavolo }) {
  const { dati, errore, invio, inAttesa, esito, occupato } = sala
  if (errore && !dati) {
    return (
      <Vuoto
        titolo="La sala non si è caricata"
        testo={errore}
        azione={
          <Button variant="tinted" onClick={() => void sala.carica()}>
            Riprova
          </Button>
        }
      />
    )
  }
  if (!dati) return <div className="bat__attesa" aria-hidden="true" />
  return (
    <Sezione titolo="Invita">
      {inAttesa?.codice ? (
        <LinkAttivo gioco={sala.gioco} invito={inAttesa} onRitira={() => void sala.annulla(inAttesa)} />
      ) : (
        <Button
          variant="tinted"
          size="lg"
          fullWidth
          onClick={() => void sala.invita(null)}
          loading={invio === 'link'}
          disabled={occupato || (invio !== null && invio !== 'link')}
        >
          <IconShare size={18} /> Invita con un link
        </Button>
      )}

      {inAttesa && !inAttesa.codice && (
        <InvitoInAttesa invito={inAttesa} onAnnulla={() => void sala.annulla(inAttesa)} />
      )}

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
                onClick={() => void sala.invita(g.playerId)}
              >
                {g.invitato ? 'Invitato' : 'Invita'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Sezione>
  )
}

/** La partita aperta con un amico: in cima, perché e' la prima cosa da fare. */
export function PartitaAperta({ partita }: { partita: PartitaTavoloBreve }) {
  const { vai } = useNavigazione()
  const nome = NOMI_AL_TAVOLO[partita.gioco]
  return (
    <button
      type="button"
      className={`bat-sala__partita tavolo-aperta tavolo-aperta--${partita.gioco}`}
      onClick={() => vai(ROTTE.partitaTavolo(partita.gioco, partita.id))}
    >
      <Avatar nickname={partita.avversario.nickname} color={partita.avversario.avatarColor} size={44} />
      <span className="bat-sala__partita-testo">
        <span className="bat-sala__partita-titolo">
          {nome}
          {partita.variante && ` ${nomeVariante(partita.gioco, partita.variante)}`} con {partita.avversario.displayName}
        </span>
        <span className="bat-sala__partita-stato">
          {partita.tuoTurno ? 'Tocca a te' : `Tocca a ${partita.avversario.displayName}`}
        </span>
      </span>
      <span className="bat-sala__riprendi">Riprendi</span>
    </button>
  )
}

function indirizzoDi(gioco: GiocoAlTavolo, codice: string): string {
  return `${window.location.origin}${ROTTE.invitoTavolo(gioco, codice)}`
}

/** Il link nel foglio di sistema, dove c'e'; altrimenti negli appunti. */
async function condividi(gioco: GiocoAlTavolo, codice: string, avvisa: (testo: string) => void) {
  const url = indirizzoDi(gioco, codice)
  if (navigator.share) {
    try {
      await navigator.share({ title: NOMI_AL_TAVOLO[gioco], text: `Una partita ${A_GIOCO[gioco]}?`, url })
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

function LinkAttivo({
  gioco,
  invito,
  onRitira,
}: {
  gioco: GiocoAlTavolo
  invito: InvitoTavoloMandato
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

function InvitoInAttesa({ invito, onAnnulla }: { invito: InvitoTavoloMandato; onAnnulla: () => void }) {
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
