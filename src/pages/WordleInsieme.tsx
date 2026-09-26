import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { IconPeople } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { Board } from '@/games/wordle/Board'
import { Keyboard } from '@/games/wordle/Keyboard'
import { SuggestionStrip } from '@/games/wordle/coop/SuggestionStrip'
import { ApiFetchError, api } from '@/lib/api'
import { haptic } from '@/lib/haptics'
import { COOP_POLL_VIEW_MS, WORD_LENGTH } from '@shared/config'
import { isGameLetter, keyboardStates } from '@shared/wordle'
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
  const { vai } = useNavigazione()
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
      if (isGameLetter(key)) {
        e.preventDefault()
        setDraft((d) => (d.length >= WORD_LENGTH ? d : d + key))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [suggerisci])

  const titolo = view ? `Con ${view.hostName}` : 'Partita condivisa'

  return (
    <Pagina
      titolo={titolo}
      intera
      indietro={{ a: ROTTE.home, etichetta: 'Giochi' }}
      azioni={view && <Avatar nickname={view.hostName} color={view.hostAvatarColor} size={32} />}
    >
      <div className="insieme">
        {error ? (
          <div className="insieme__fallback">
            <p>{error}</p>
            <Button variant="tinted" onClick={() => vai(ROTTE.home, { direzione: 'indietro' })}>
              Torna ai giochi
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
              Che cosa vale questa partita per chi guarda.

              E' l'informazione che rende accettabile l'invito: la parola di oggi
              la sta giocando qui, e prenderà lo stesso punteggio dell'host. Chi
              invece aveva già giocato la propria vede scritto che e' qui solo
              per dare una mano, invece di aspettare punti che non arriveranno.

              La riga c'e' sempre quando la partita conta, perché il numero
              cambia il senso di tutto lo schermo; costa una riga d'altezza alla
              griglia, e in cambio dice l'unica cosa che serve sapere.
            */}
            <div className={`insieme__assist${view.counts ? '' : ' is-spettatore'}`}>
              <IconPeople size={14} />
              {view.counts ? (
                view.myScore !== null ? (
                  <span>
                    La tua parola di oggi era questa · <strong>+{view.myScore}</strong> in
                    classifica
                  </span>
                ) : (
                  <span>
                    Oggi la tua parola è questa: prendi lo <strong>stesso punteggio</strong> di{' '}
                    {view.hostName}
                  </span>
                )
              ) : (
                <span>Hai già giocato la tua parola di oggi: qui dai solo una mano</span>
              )}
            </div>

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
                  {view.counts
                    ? `Suggerisci a ${view.hostName}`
                    : `Dai una mano a ${view.hostName}`}
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
    </Pagina>
  )
}
