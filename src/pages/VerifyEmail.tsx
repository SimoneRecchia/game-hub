import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { ThemeButton } from '@/components/ThemeButton'
import { useAuth } from '@/lib/auth'
import { ApiFetchError } from '@/lib/api'
import { haptic } from '@/lib/haptics'
import { CODE_LENGTH, CODE_TTL_MINUTES } from '@shared/config'
import './VerifyEmail.css'

/**
 * Schermata del codice, mostrata finché l'email non e' confermata.
 *
 * Il giocatore ha già una sessione: puo' farsi rimandare il codice e non perde
 * il nickname appena scelto. Le rotte di gioco restano chiuse lato server.
 */
export default function VerifyEmail() {
  const { player, verify, resendCode, logout } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attesa, setAttesa] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
  }, [])

  // Conto alla rovescia per il rinvio: un tasto che non funziona senza dire
  // perché e' peggio di un tasto disabilitato con un numero accanto.
  useEffect(() => {
    if (attesa <= 0) return
    const id = window.setInterval(() => setAttesa((s) => Math.max(0, s - 1)), 1_000)
    return () => window.clearInterval(id)
  }, [attesa])

  const invia = useCallback(
    async (valore: string) => {
      setBusy(true)
      setError(null)
      setMessage(null)
      try {
        await verify(valore)
        haptic('success')
      } catch (err) {
        haptic('error')
        setError(err instanceof ApiFetchError ? err.message : 'Non riesco a verificare il codice.')
        setCode('')
        input.current?.focus()
      } finally {
        setBusy(false)
      }
    },
    [verify],
  )

  function onChange(valore: string) {
    const cifre = valore.replace(/\D/g, '').slice(0, CODE_LENGTH)
    setCode(cifre)
    setError(null)
    // Invio automatico appena il codice e' completo: ridigitare e poi cercare
    // il tasto e' un passaggio in più che non serve a nessuno.
    if (cifre.length === CODE_LENGTH) void invia(cifre)
  }

  async function rimanda() {
    setBusy(true)
    setError(null)
    try {
      const secondi = await resendCode()
      setAttesa(secondi)
      setMessage('Ne abbiamo mandato un altro.')
      haptic('tap')
    } catch (err) {
      if (err instanceof ApiFetchError) {
        setError(err.message)
        // Il server dice quanti secondi restano: si legge dal messaggio.
        const trovato = /(\d+)\s*second/i.exec(err.message)
        if (trovato) setAttesa(Number(trovato[1]))
      } else {
        setError('Non riesco a mandare un altro codice.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="verifica">
      <div className="verifica__theme">
        <ThemeButton />
      </div>

      <div className="verifica__inner">
        <header className="verifica__head">
          <span className="verifica__busta" aria-hidden="true">
            ✉︎
          </span>
          <h1 className="verifica__title">Controlla la posta</h1>
          <p className="verifica__lede">
            Abbiamo mandato un codice di {CODE_LENGTH} cifre a{' '}
            <strong>{player?.email ?? 'la tua email'}</strong>. Vale {CODE_TTL_MINUTES} minuti.
          </p>
        </header>

        <div className="verifica__campo">
          <label className="u-visually-hidden" htmlFor="codice">
            Codice di verifica
          </label>
          <input
            id="codice"
            ref={input}
            className="verifica__input u-tabnum"
            value={code}
            onChange={(e) => onChange(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            /* Il browser (e iOS) suggerisce il codice arrivato per posta. */
            pattern="\d*"
            maxLength={CODE_LENGTH}
            placeholder={'0'.repeat(CODE_LENGTH)}
            disabled={busy}
            aria-invalid={error !== null}
          />
        </div>

        {error && (
          <p className="verifica__errore" role="alert">
            {error}
          </p>
        )}
        {message && !error && <p className="verifica__ok">{message}</p>}

        <Button
          size="lg"
          fullWidth
          loading={busy}
          disabled={code.length !== CODE_LENGTH}
          onClick={() => void invia(code)}
        >
          Confermo
        </Button>

        <div className="verifica__azioni">
          <button
            type="button"
            className="verifica__link"
            onClick={() => void rimanda()}
            disabled={busy || attesa > 0}
          >
            {attesa > 0 ? `Rimanda il codice fra ${attesa}s` : 'Non è arrivato, rimandalo'}
          </button>
          <button type="button" className="verifica__link verifica__link--tenue" onClick={() => void logout()}>
            Esci e usa un altro account
          </button>
        </div>

        <p className="verifica__nota">
          Se non lo trovi, guarda nello spam. L’email serve anche a recuperare la password.
        </p>
      </div>
    </div>
  )
}
