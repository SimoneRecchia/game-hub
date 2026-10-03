import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta } from '@/components/Elementi'
import { IconPeople } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { Scheda } from '@/components/Scheda'
import { Suggerimenti } from '@/games/compagnia/Suggerimenti'
import { Tentativi } from '@/games/wordle/fine'
import { Board } from '@/games/wordle/Board'
import { Keyboard } from '@/games/wordle/Keyboard'
import { ApiFetchError, api } from '@/lib/api'
import { haptic } from '@/lib/haptics'
import { suona } from '@/lib/suoni'
import { COOP_POLL_VIEW_MS, MAX_ATTEMPTS, WORD_LENGTH } from '@shared/config'
import { isGameLetter, keyboardStates } from '@shared/wordle'
import type { VistaCompagnia, WordleLiberaState } from '@shared/types'
import './Wordle.css'
import './WordleInsieme.css'

/**
 * Una partita libera di Wordle di un collega, vista da chi la guarda.
 *
 * Come la stanza della classificata (`WordleInsieme`): la griglia e' quella
 * dell'host, aggiornata a polling, e il tasto d'invio dice "Suggerisci". Ma qui
 * non ci sono punti, e la partita cambia: quando l'host ne comincia un'altra,
 * chi guarda la segue.
 */
export default function WordleLiberaInsieme() {
  const { id = '' } = useParams()
  const { vai } = useNavigazione()
  const [vista, setVista] = useState<VistaCompagnia | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)
  const caricata = useRef(false)
  const timer = useRef<number | null>(null)

  const mostra = useCallback((testo: string) => {
    setMessaggio(testo)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessaggio(null), 1_800)
  }, [])
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  const carica = useCallback(async () => {
    try {
      const fresca = await api<VistaCompagnia>(`/compagnia/partita/${id}`)
      if (fresca.gioco !== 'wordle') {
        vai(ROTTE.insiemeA(fresca.gioco, id, fresca.modalita), { replace: true, direzione: 'nessuna' })
        return
      }
      caricata.current = true
      setVista(fresca)
      setErrore(null)
    } catch (err) {
      if (err instanceof ApiFetchError && (err.status === 403 || err.status === 404)) {
        // Chi guardava e la compagnia si chiude: lo si dice cosi', non come un errore.
        setErrore(caricata.current ? 'La partita non è più condivisa.' : err.message)
      } else if (!caricata.current) {
        setErrore(err instanceof ApiFetchError ? err.message : 'Non riesco a caricarla.')
      }
    }
  }, [id, vai])

  useEffect(() => {
    void carica()
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carica()
    }, COOP_POLL_VIEW_MS)
    return () => window.clearInterval(t)
  }, [carica])

  const partita: WordleLiberaState | null = vista?.gioco === 'wordle' ? vista.partita : null
  const chiusa = !partita || partita.status !== 'playing'

  // Una partita nuova dell'host: la parola che si stava scrivendo era per l'altra.
  const idPartita = partita?.id ?? null
  useEffect(() => {
    setDraft('')
  }, [idPartita])

  const festa = useFesta(partita ? !chiusa : null, partita?.status === 'won')
  useEffect(() => {
    if (festa) suona('vittoria')
  }, [festa])
  const tentativi = partita?.guesses.length ?? 0
  const visti = useRef<number | null>(null)
  useEffect(() => {
    if (visti.current !== null && tentativi > visti.current) suona('posa')
    visti.current = tentativi
  }, [tentativi])

  const suggerisci = useCallback(async () => {
    if (inviando || chiusa) return
    const parola = draft.toLowerCase()
    if (parola.length < WORD_LENGTH) {
      mostra(`Servono ${WORD_LENGTH} lettere.`)
      haptic('error')
      return
    }
    setInviando(true)
    try {
      setVista(await api<VistaCompagnia>(`/compagnia/partita/${id}/suggerisci`, { method: 'POST', body: { parola } }))
      setDraft('')
      haptic('success')
      mostra('Suggerimento inviato')
    } catch (err) {
      haptic('error')
      mostra(err instanceof ApiFetchError ? err.message : 'Non riesco a mandarlo.')
    } finally {
      setInviando(false)
    }
  }, [chiusa, draft, id, inviando, mostra])

  // La tastiera vera, come nella partita.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Enter') {
        e.preventDefault()
        void suggerisci()
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        setDraft((d) => d.slice(0, -1))
      } else if (isGameLetter(e.key.toLowerCase())) {
        e.preventDefault()
        const l = e.key.toLowerCase()
        setDraft((d) => (d.length >= WORD_LENGTH ? d : d + l))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [suggerisci])

  const host = vista?.host
  return (
    <Pagina
      titolo={host ? `Con ${host.displayName}` : 'In compagnia'}
      intera
      indietro={{ a: ROTTE.libere, etichetta: 'Libere' }}
      azioni={host && <Avatar nickname={host.nickname} color={host.avatarColor} size={32} />}
    >
      <div className="insieme">
        {errore ? (
          <div className="insieme__fallback">
            <p>{errore}</p>
            <Button variant="tinted" onClick={() => vai(ROTTE.libere, { direzione: 'indietro' })}>
              Torna alle Libere
            </Button>
          </div>
        ) : !vista || !host ? (
          <div className="insieme__fallback">
            <p>Un attimo…</p>
          </div>
        ) : !partita ? (
          <div className="insieme__fallback">
            <p>Aspetto che {host.displayName} cominci una partita…</p>
          </div>
        ) : (
          <>
            <div className="insieme__assist is-spettatore">
              <IconPeople size={14} />
              <span>La partita libera di {host.displayName}</span>
            </div>

            <Scheda
              className="wordle__tavola"
              titolo={`La parola di ${host.displayName}`}
              icona={<Avatar nickname={host.nickname} color={host.avatarColor} size={26} />}
              destra={<Tentativi guesses={partita.guesses} maxAttempts={partita.maxAttempts} status={partita.status} />}
            >
              <div className="insieme__board">
                <Board
                  guesses={partita.guesses}
                  draft=""
                  wordLength={partita.wordLength}
                  maxAttempts={partita.maxAttempts ?? MAX_ATTEMPTS}
                  revealing={null}
                  winningRow={partita.status === 'won' ? partita.guesses.length - 1 : null}
                  shakingRow={null}
                />
              </div>
              <p className="wordle__piede" aria-live="polite">
                {partita.status === 'won'
                  ? `${host.displayName} ha indovinato: ${partita.answer?.toUpperCase()}`
                  : partita.status === 'lost'
                    ? `La parola era ${partita.answer?.toUpperCase()}`
                    : `${host.displayName} sta giocando`}
              </p>
            </Scheda>

            {!chiusa && (
              <div className="insieme__proposta">
                <span className={`insieme__proposta-etichetta${messaggio ? ' is-avviso' : ''}`} aria-live="polite">
                  {messaggio ?? `Suggerisci a ${host.displayName}`}
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

            <Suggerimenti
              suggerimenti={vista.suggerimenti}
              etichetta={(s) => ({
                parola: s.proposta.gioco === 'wordle' ? s.proposta.parola.toUpperCase() : '',
                nota: '',
              })}
              onScegli={(s) => s.proposta.gioco === 'wordle' && setDraft(s.proposta.parola)}
              disabled={chiusa}
            />

            <Keyboard
              states={keyboardStates(partita.guesses)}
              onLetter={(l) => setDraft((d) => (d.length >= WORD_LENGTH ? d : d + l))}
              onEnter={() => void suggerisci()}
              onBackspace={() => setDraft((d) => d.slice(0, -1))}
              disabled={chiusa || inviando}
              enterLabel="Suggerisci"
            />
          </>
        )}
      </div>
      {festa && <Coriandoli />}
    </Pagina>
  )
}
