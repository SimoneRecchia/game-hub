import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { IconChevronLeft, IconPeople } from '@/components/Icons'
import { Board } from '@/games/wordle/Board'
import { Keyboard } from '@/games/wordle/Keyboard'
import { SuggestionStrip } from '@/games/wordle/coop/SuggestionStrip'
import { ApiFetchError, api } from '@/lib/api'
import { haptic } from '@/lib/haptics'
import { COOP_POLL_VIEW_MS, WORD_LENGTH } from '@shared/config'
import { keyboardStates } from '@shared/wordle'
import type { CoopView } from '@shared/types'
import './WordleInsieme.css'

/**
 * La partita di qualcun altro, vista da un invitato.
 *
 * Stessa griglia e stessi colori dell'host, aggiornati a polling. La tastiera
 * c'e', ma il tasto d'invio dice "Suggerisci": l'invitato propone una parola,
 * non la gioca.
 */
export default function WordleInsieme() {
  const { roomId = '' } = useParams()
  const navigate = useNavigate()
  const [view, setView] = useState<CoopView | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const vivo = useRef(true)
  const timers = useRef<number[]>([])

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
      for (const id of timers.current) window.clearTimeout(id)
    }
  }, [])

  const flash = useCallback((testo: string) => {
    setMessage(testo)
    const id = window.setTimeout(() => {
      if (vivo.current) setMessage(null)
    }, 1_800)
    timers.current.push(id)
  }, [])

  const carica = useCallback(async () => {
    try {
      const fresh = await api<CoopView>(`/coop/room/${roomId}/view`)
      if (vivo.current) {
        setView(fresh)
        setError(null)
      }
    } catch (err) {
      if (!vivo.current) return
      // Un errore di rete durante il polling non deve svuotare la schermata:
      // si segnala solo se non abbiamo ancora nulla da mostrare.
      if (err instanceof ApiFetchError && (err.status === 403 || err.status === 404)) {
        setError(err.message)
      } else if (view === null) {
        setError(err instanceof ApiFetchError ? err.message : 'Non riesco a caricare la partita.')
      }
    }
  }, [roomId, view])

  useEffect(() => {
    void carica()
    const id = window.setInterval(() => void carica(), COOP_POLL_VIEW_MS)
    return () => window.clearInterval(id)
    // Volutamente agganciato solo a roomId: `carica` cambia identita' a ogni
    // render (dipende da `view`), e includerla ricreerebbe l'intervallo di
    // continuo.
  }, [roomId, carica])

  const chiuso = view !== null && (!view.active || view.status !== 'playing')

  const suggerisci = useCallback(async () => {
    if (busy || chiuso) return
    const word = draft.toLowerCase()
    if (word.length < WORD_LENGTH) {
      flash(`Servono ${WORD_LENGTH} lettere.`)
      haptic('error')
      return
    }
    setBusy(true)
    try {
      const fresh = await api<CoopView>(`/coop/room/${roomId}/suggest`, {
        method: 'POST',
        body: { word },
      })
      setView(fresh)
      setDraft('')
      haptic('success')
      flash('Suggerimento inviato')
    } catch (err) {
      haptic('error')
      flash(err instanceof ApiFetchError ? err.message : 'Non riesco a inviare il suggerimento.')
    } finally {
      setBusy(false)
    }
  }, [busy, chiuso, draft, flash, roomId])

  // Tastiera fisica, come nella partita normale.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Enter') {
        e.preventDefault()
        void suggerisci()
        return
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        setDraft((d) => d.slice(0, -1))
        return
      }
      const key = e.key.toLowerCase()
      if (/^[a-z]$/.test(key) && !'jkwxy'.includes(key)) {
        e.preventDefault()
        setDraft((d) => (d.length >= WORD_LENGTH ? d : d + key))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [suggerisci])

  const titolo = view ? `Con ${view.hostName}` : 'Partita condivisa'

  return (
    <AppShell
      title={titolo}
      hideTabBar
      leading={
        <button
          type="button"
          className="navbtn"
          onClick={() => navigate('/')}
          aria-label="Torna all'hub"
        >
          <IconChevronLeft size={22} />
        </button>
      }
      trailing={
        view && <Avatar nickname={view.hostName} color={view.hostAvatarColor} size={28} />
      }
    >
      <div className="insieme">
        {error ? (
          <div className="insieme__fallback">
            <p>{error}</p>
            <Button variant="tinted" onClick={() => navigate('/')}>
              Torna all’hub
            </Button>
          </div>
        ) : view === null ? (
          <div className="insieme__fallback">
            <p>Un attimo…</p>
          </div>
        ) : (
          <>
            <div className="insieme__banner">
              {!view.active
                ? `${view.hostName} ha chiuso la partita condivisa.`
                : view.status === 'won'
                  ? `${view.hostName} ha indovinato: ${view.answer?.toUpperCase()}`
                  : view.status === 'lost'
                    ? `Niente da fare per ${view.hostName}. Era ${view.answer?.toUpperCase()}.`
                    : `Stai guardando ${view.hostName}. Puoi suggerire una parola.`}
            </div>

            {/*
              Quanto ha reso l'aiuto. Il guest non fa punti partita — la parola
              l'ha già vista — quindi questa e' l'unica cosa che gli dice che
              sta comunque giocando per qualcosa.

              Compare solo quando c'e' qualcosa da dire: l'altezza qui e'
              contata, e la griglia si dimensiona su quel che resta. Finché non
              ci sono assist, il messaggio sta nell'etichetta del suggerimento,
              che una riga la occupa comunque.
            */}
            {view.myAssists > 0 && (
              <div className="insieme__assist">
                <IconPeople size={14} />
                <span>
                  <strong>
                    {view.myAssists}{' '}
                    {view.myAssists === 1 ? 'suggerimento giocato' : 'suggerimenti giocati'}
                  </strong>
                  {' · '}
                  <strong>+{view.myAssistPoints}</strong> assist in classifica
                </span>
              </div>
            )}

            <div className="insieme__board">
              {/* Dentro l'area della griglia: si sovrappone senza spostarla. */}
              <div className="insieme__messaggio" aria-live="polite">
                {message && <span className="insieme__pillola">{message}</span>}
              </div>
              <Board
                guesses={view.guesses}
                draft=""
                wordLength={view.wordLength}
                maxAttempts={view.maxAttempts}
                revealing={null}
                winningRow={view.status === 'won' ? view.guesses.length - 1 : null}
                shakingRow={null}
              />
            </div>

            {/* La riga del suggerimento sta fuori dalla griglia dell'host: non
                è un tentativo, e mescolarla confonderebbe le due cose. */}
            {!chiuso && (
              <div className="insieme__proposta">
                <span className="insieme__proposta-etichetta">
                  {view.myAssists > 0
                    ? 'Suggerisci un’altra parola'
                    : `Suggerisci: se ${view.hostName} la gioca, fai assist`}
                </span>
                <span className="insieme__proposta-caselle">
                  {Array.from({ length: WORD_LENGTH }, (_, i) => (
                    <span className="insieme__casella" key={i}>
                      {draft[i]?.toUpperCase() ?? ''}
                    </span>
                  ))}
                </span>
              </div>
            )}

            <SuggestionStrip suggestions={view.suggestions} onPick={setDraft} disabled={chiuso} />

            <Keyboard
              states={keyboardStates(view.guesses)}
              onLetter={(l) => setDraft((d) => (d.length >= WORD_LENGTH ? d : d + l))}
              onEnter={() => void suggerisci()}
              onBackspace={() => setDraft((d) => d.slice(0, -1))}
              disabled={chiuso || busy}
              enterLabel="Suggerisci"
            />
          </>
        )}
      </div>
    </AppShell>
  )
}
