import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { IconCopy, IconLink, IconShare } from '@/components/Icons'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { useCountdown } from '@/games/wordle/useCountdown'
import { ApiFetchError, api } from '@/lib/api'
import { formatCronometro } from '@/lib/format'
import { DOVE } from '@/lib/presenza'
import { SFIDA_POLL_ATTESA_MS } from '@shared/config'
import { NOMI_CATEGORIE, diGeografia } from '@shared/quiz'
import type { GiocatoreOnline, SalaQuiz, SfidaQuizInviata } from '@shared/types'
import { useIndiceQuiz } from '../dati'
import { dettagliPartita } from '../testi'
import type { ImpostazioniLibera } from '../usePartita'
import { conIlGiorno, domandePerSfida, sfidaDalleScelte } from './domande'
import '@/pages/Battaglia.css'
import './Duello.css'

/** Quanto spesso si guarda la sala a foglio aperto, se non si aspetta una risposta. */
const POLL_SALA_MS = 3_000

/**
 * Sfida qualcuno alla partita scelta: a chi e' online, o con un link.
 *
 * Le domande le fa questo telefono, adesso, con le scelte della libera — ma
 * da duello: sempre a tempo, al massimo venti domande, senza aiuti. Quando
 * l'altro accetta si va al duello; il link lo usa il primo che lo apre.
 */
export function SfidaQuiz({
  open,
  onClose,
  scelte,
}: {
  open: boolean
  onClose: () => void
  scelte: ImpostazioniLibera
}) {
  const { vai } = useNavigazione()
  const toast = useToast()
  const ix = useIndiceQuiz(open && diGeografia(scelte.categoria))
  const imp = useMemo(() => sfidaDalleScelte(scelte), [scelte])
  const [sala, setSala] = useState<SalaQuiz | null>(null)
  const [invio, setInvio] = useState<string | null>(null)
  const [avviso, setAvviso] = useState<string | null>(null)

  const carica = useCallback(async () => {
    try {
      setSala(await api<SalaQuiz>('/quiz/sfide/sala'))
    } catch {
      /* la sala si riprova al giro dopo */
    }
  }, [])

  const inAttesa = sala?.sfida?.stato === 'attesa' ? sala.sfida : null
  useEffect(() => {
    if (!open) return
    void carica()
    const t = setInterval(() => void carica(), inAttesa ? SFIDA_POLL_ATTESA_MS : POLL_SALA_MS)
    return () => clearInterval(t)
  }, [open, carica, inAttesa])

  // Accettata: si va al duello, tutti e due.
  const duello = sala?.sfida?.stato === 'accettata' ? sala.sfida.duelloId : null
  useEffect(() => {
    if (open && duello) vai(ROTTE.duelloQuiz(duello))
  }, [open, duello, vai])

  async function manda(a: GiocatoreOnline | 'link') {
    setInvio(a === 'link' ? 'link' : a.playerId)
    setAvviso(null)
    try {
      const impostazioni = await conIlGiorno(imp, scelte.giorno)
      const domande = await domandePerSfida(impostazioni)
      const corpo = { impostazioni, domande }
      if (a === 'link') await api<SfidaQuizInviata>('/quiz/sfide/link', { method: 'POST', body: corpo })
      else await api<SfidaQuizInviata>('/quiz/sfide', { method: 'POST', body: { ...corpo, playerId: a.playerId } })
      await carica()
    } catch (e) {
      setAvviso(e instanceof ApiFetchError || e instanceof Error ? e.message : 'La sfida non è partita.')
    } finally {
      setInvio(null)
    }
  }

  async function annulla(s: SfidaQuizInviata) {
    await api(`/quiz/sfide/${s.id}/annulla`, { method: 'POST' }).catch(() => {})
    await carica()
  }

  const riassunto = [
    NOMI_CATEGORIE[imp.categoria],
    ...dettagliPartita(imp, ix),
    imp.categoria === 'oggi' && scelte.giorno === 'caso' ? 'un giorno a caso' : null,
    `${imp.quante} domande`,
    `${imp.secondi * (imp.modo === 'cartina' ? 2 : 1)} s a domanda`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Sheet open={open} onClose={onClose} title="Sfida un amico">
      <div className="quiz-sfida">
        <p className="quiz-sfida__cosa">{riassunto}</p>
        <p className="quiz-sfida__regole">Il primo che risponde giusto prende il punto.</p>

        {inAttesa && inAttesa.codice ? (
          <LinkInAttesa sfida={inAttesa} onRitira={() => void annulla(inAttesa)} avvisa={toast.show} />
        ) : inAttesa && inAttesa.a ? (
          <SfidaInAttesa sfida={inAttesa} onAnnulla={() => void annulla(inAttesa)} />
        ) : (
          <div className="bat-link">
            <div className="bat-link__riga">
              <span className="bat-link__icona" aria-hidden="true">
                <IconLink size={22} />
              </span>
              <div className="bat-link__testo">
                <p className="bat-link__titolo">Invita con un link</p>
                <p className="bat-link__nota">Anche a chi non ha un account. Vale un’ora.</p>
              </div>
            </div>
            <Button
              variant="tinted"
              fullWidth
              onClick={() => void manda('link')}
              loading={invio === 'link'}
              disabled={invio !== null && invio !== 'link'}
            >
              <IconShare size={18} /> Crea il link
            </Button>
          </div>
        )}

        {sala?.sfida?.stato === 'rifiutata' && sala.sfida.a && (
          <p className="bat-sala__esito">{sala.sfida.a.displayName} ha rifiutato la sfida.</p>
        )}
        {avviso && <p className="bat-sala__avviso">{avviso}</p>}

        <p className="bat-sala__titolo">Chi è online adesso</p>
        {!sala ? (
          <p className="bat-sala__vuoto">Cerco chi è online…</p>
        ) : sala.giocatori.length === 0 ? (
          <p className="bat-sala__vuoto">Nessuno online in questo momento.</p>
        ) : (
          <ul className="bat-sala__elenco">
            {sala.giocatori.map((g) => (
              <li key={g.playerId} className="bat-sala__giocatore">
                <Avatar nickname={g.nickname} color={g.avatarColor} size={40} />
                <span className="bat-sala__chi">
                  <span className="bat-sala__nome">{g.displayName}</span>
                  <span className="bat-sala__dove">{g.occupato ? 'è in una sfida' : DOVE[g.attivita]}</span>
                </span>
                <Button
                  variant={g.invitato ? 'plain' : 'tinted'}
                  disabled={g.occupato || g.invitato || invio !== null || !!inAttesa}
                  loading={invio === g.playerId}
                  onClick={() => void manda(g)}
                >
                  {g.invitato ? 'Sfidato' : 'Sfida'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  )
}

function SfidaInAttesa({ sfida, onAnnulla }: { sfida: SfidaQuizInviata; onAnnulla: () => void }) {
  const restano = useCountdown(sfida.scadeTraMs)
  return (
    <div className="bat-sala__in-attesa" aria-live="polite">
      <span className="bat-sala__onde" aria-hidden="true" />
      <p className="bat-sala__in-attesa-testo">
        Hai sfidato <strong>{sfida.a?.displayName}</strong>. Aspetta la risposta…
        <span className="bat-sala__scadenza u-tabnum"> {formatCronometro(restano)}</span>
      </p>
      <Button variant="plain" onClick={onAnnulla}>
        Annulla
      </Button>
    </div>
  )
}

function indirizzoDi(codice: string): string {
  return `${window.location.origin}${ROTTE.invitoQuiz(codice)}`
}

async function copia(url: string, avvisa: (testo: string) => void) {
  try {
    await navigator.clipboard.writeText(url)
    avvisa('Link copiato')
  } catch {
    avvisa('Non riesco a copiare: tieni premuto il link.')
  }
}

/** Condivide con il foglio di sistema, dove c'e', e altrimenti copia. */
async function condividi(url: string, avvisa: (testo: string) => void) {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Sfida a quiz', text: 'Ti sfido a un quiz!', url })
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
  }
  await copia(url, avvisa)
}

function LinkInAttesa({
  sfida,
  onRitira,
  avvisa,
}: {
  sfida: SfidaQuizInviata
  onRitira: () => void
  avvisa: (testo: string) => void
}) {
  const restano = useCountdown(sfida.scadeTraMs)
  const url = indirizzoDi(sfida.codice ?? '')
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
        <Button onClick={() => void condividi(url, avvisa)}>
          <IconShare size={18} /> Condividi
        </Button>
        <Button variant="tinted" onClick={() => void copia(url, avvisa)}>
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
