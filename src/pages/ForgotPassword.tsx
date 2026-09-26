import { useState, type FormEvent } from 'react'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { ThemeButton } from '@/components/ThemeButton'
import { useAuth } from '@/lib/auth'
import { ApiFetchError, api } from '@/lib/api'
import { haptic } from '@/lib/haptics'
import { CODE_LENGTH, CODE_TTL_MINUTES, PASSWORD_MIN } from '@shared/config'
import { deriveVerifier } from '@shared/password'
import type { Player } from '@shared/types'
import './VerifyEmail.css'

type Passo = 'richiesta' | 'conferma' | 'nickname' | 'nickname-inviato'

/**
 * Recupero password in due passi: si chiede il codice, poi si imposta la nuova.
 *
 * Il primo passo risponde sempre allo stesso modo anche se l'account non
 * esiste: dire "questo nickname non c'e'" trasformerebbe la schermata in un
 * modo per scoprire chi e' iscritto.
 *
 * Da qui si recupera anche il **nickname**, con l'email: senza nickname non si
 * entra e non si reimposta nemmeno la password, perché la password e' legata a
 * lui. Anche questa richiesta risponde sempre allo stesso modo.
 */
const TITOLI: Record<Passo, string> = {
  richiesta: 'Password dimenticata',
  conferma: 'Nuova password',
  nickname: 'Nickname dimenticato',
  'nickname-inviato': 'Controlla la posta',
}

export function ForgotPassword({ onDone }: { onDone: () => void }) {
  const { apply } = useAuth()
  const [passo, setPasso] = useState<Passo>('richiesta')
  const [identifier, setIdentifier] = useState('')
  /*
   * Il nickname e' un campo a parte, perché la password e' legata a lui: il
   * salt del verifier si deriva dal nickname (vedi shared/password.ts), quindi
   * derivarlo dall'email produrrebbe una password che il login rifiuta.
   * Quando al primo passo si e' scritto un nickname, questo campo e' già
   * compilato e non si nota.
   */
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [conferma, setConferma] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function chiediCodice(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (identifier.trim().length === 0) {
      setError('Scrivi il tuo nickname o la tua email.')
      return
    }
    setBusy(true)
    try {
      await api('/auth/reset/request', {
        method: 'POST',
        body: { identifier: identifier.trim() },
      })
      haptic('success')
      if (!identifier.includes('@')) setNickname(identifier.trim())
      setPasso('conferma')
    } catch (err) {
      haptic('error')
      setError(err instanceof ApiFetchError ? err.message : 'Non riesco a mandare il codice.')
    } finally {
      setBusy(false)
    }
  }

  async function chiediNickname(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const email = identifier.trim()
    if (!email.includes('@')) {
      setError('Scrivi l’email con cui ti sei registrato.')
      return
    }
    setBusy(true)
    try {
      await api('/auth/nickname/request', { method: 'POST', body: { email } })
      haptic('success')
      setPasso('nickname-inviato')
    } catch (err) {
      haptic('error')
      setError(err instanceof ApiFetchError ? err.message : 'Non riesco a mandare l’email.')
    } finally {
      setBusy(false)
    }
  }

  async function impostaPassword(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (nickname.trim().length === 0 || nickname.includes('@')) {
      setError('Scrivi il tuo nickname: la password è legata a lui, non all’email.')
      return
    }
    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code.trim())) {
      setError(`Il codice è di ${CODE_LENGTH} cifre.`)
      return
    }
    if (password.length < PASSWORD_MIN) {
      setError(`La password deve avere almeno ${PASSWORD_MIN} caratteri.`)
      return
    }
    if (password !== conferma) {
      setError('Le due password non coincidono.')
      return
    }

    setBusy(true)
    try {
      const verifier = await deriveVerifier(nickname.trim(), password)
      const { player } = await api<{ player: Player }>('/auth/reset/confirm', {
        method: 'POST',
        body: { nickname: nickname.trim(), code: code.trim(), verifier },
      })
      apply(player)
      haptic('success')
    } catch (err) {
      haptic('error')
      setError(err instanceof ApiFetchError ? err.message : 'Non riesco a impostare la password.')
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
            {passo === 'richiesta' || passo === 'nickname' ? '?' : '✉︎'}
          </span>
          <h1 className="verifica__title">{TITOLI[passo]}</h1>
          <p className="verifica__lede">
            {passo === 'richiesta'
              ? 'Scrivi il nickname (o l’email): ti mandiamo un codice all’email che hai usato per registrarti.'
              : passo === 'conferma'
                ? `Abbiamo mandato un codice di ${CODE_LENGTH} cifre. Vale ${CODE_TTL_MINUTES} minuti.`
                : passo === 'nickname'
                  ? 'Scrivi l’email con cui ti sei registrato: ti mandiamo il tuo nickname.'
                  : `Se ${identifier.trim()} è registrata, ti abbiamo appena scritto il tuo nickname. Se non arriva entro un minuto, guarda anche nello spam.`}
          </p>
        </header>

        {passo === 'nickname' ? (
          <form className="verifica__form" onSubmit={chiediNickname} noValidate>
            <div className="verifica__campi">
              <Field
                label="Email"
                type="email"
                placeholder="la tua email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </div>
            {error && (
              <p className="verifica__errore" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" fullWidth loading={busy}>
              Mandami il nickname
            </Button>
          </form>
        ) : passo === 'nickname-inviato' ? (
          <div className="verifica__form">
            <Button
              size="lg"
              fullWidth
              onClick={() => {
                setError(null)
                setPasso('richiesta')
              }}
            >
              Reimposta anche la password
            </Button>
          </div>
        ) : passo === 'richiesta' ? (
          <form className="verifica__form" onSubmit={chiediCodice} noValidate>
            <div className="verifica__campi">
              <Field
                label="Nickname"
                placeholder="nickname o email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </div>
            {error && (
              <p className="verifica__errore" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" fullWidth loading={busy}>
              Mandami il codice
            </Button>
          </form>
        ) : (
          <form className="verifica__form" onSubmit={impostaPassword} noValidate>
            <div className="verifica__campi">
              <Field
                label="Nickname"
                placeholder="il tuo nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                hint={
                  identifier.includes('@')
                    ? 'Lo trovi scritto nell’email con il codice: la password è legata al nickname.'
                    : undefined
                }
                required
              />
              <Field
                label="Codice"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={'0'.repeat(CODE_LENGTH)}
                required
              />
              <Field
                label="Password"
                type="password"
                placeholder={`almeno ${PASSWORD_MIN} caratteri`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <Field
                label="Ripeti"
                type="password"
                placeholder="la stessa password"
                value={conferma}
                onChange={(e) => setConferma(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            {error && (
              <p className="verifica__errore" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" fullWidth loading={busy}>
              Imposta la password
            </Button>
          </form>
        )}

        <div className="verifica__azioni">
          {passo === 'richiesta' && (
            <button
              type="button"
              className="verifica__link"
              onClick={() => {
                setError(null)
                setPasso('nickname')
              }}
            >
              Non ricordi il nickname?
            </button>
          )}
          {passo === 'nickname' && (
            <button
              type="button"
              className="verifica__link"
              onClick={() => {
                setError(null)
                setPasso('richiesta')
              }}
            >
              Ricordo il nickname
            </button>
          )}
          {passo === 'conferma' && (
            <button
              type="button"
              className="verifica__link"
              onClick={() => {
                setPasso('richiesta')
                setError(null)
              }}
            >
              Ho sbagliato nickname
            </button>
          )}
          <button type="button" className="verifica__link verifica__link--tenue" onClick={onDone}>
            Torna all’accesso
          </button>
        </div>
      </div>
    </div>
  )
}
