import { useState, type FormEvent } from 'react'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { SegmentedControl } from '@/components/SegmentedControl'
import { ThemeButton } from '@/components/ThemeButton'
import { useAuth } from '@/lib/auth'
import { ApiFetchError } from '@/lib/api'
import { haptic } from '@/lib/haptics'
import { NICKNAME_MAX, NICKNAME_MIN, PASSWORD_MIN } from '@shared/config'
import { InsecureContextError } from '@shared/password'
import './Welcome.css'

type Mode = 'login' | 'register'

/**
 * Schermata di ingresso: scelta del nickname e password.
 *
 * L'autenticazione e' volutamente minima — nessuna email, nessun secondo
 * fattore — perché il suo unico scopo e' legare i punteggi a una persona.
 */
export default function Welcome() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [field, setField] = useState<'nickname' | 'password' | null>(null)
  const [busy, setBusy] = useState(false)

  const isRegister = mode === 'register'

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setField(null)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setField(null)

    const name = nickname.trim()
    if (name.length < NICKNAME_MIN || name.length > NICKNAME_MAX) {
      setField('nickname')
      setError(`Il nickname deve avere fra ${NICKNAME_MIN} e ${NICKNAME_MAX} caratteri.`)
      return
    }
    if (password.length < PASSWORD_MIN) {
      setField('password')
      setError(`La password deve avere almeno ${PASSWORD_MIN} caratteri.`)
      return
    }

    setBusy(true)
    try {
      if (isRegister) await register(name, password)
      else await login(name, password)
      haptic('success')
    } catch (err) {
      haptic('error')
      if (err instanceof ApiFetchError) {
        setError(err.message)
        if (err.code.startsWith('NICKNAME')) setField('nickname')
        else if (err.code === 'BAD_CREDENTIALS') setField('password')
      } else if (err instanceof InsecureContextError) {
        // Senza questo ramo il caso arriverebbe come "qualcosa e' andato
        // storto", che non dice cosa fare.
        setError(err.message)
      } else {
        setError('Qualcosa è andato storto. Riprova.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="welcome">
      <div className="welcome__theme">
        <ThemeButton />
      </div>

      <div className="welcome__inner">
        <header className="welcome__head">
          <img className="welcome__icon" src="/icon.svg" alt="" width={84} height={84} />
          <h1 className="welcome__title">Game Hub</h1>
          <p className="welcome__lede">
            Una sfida nuova ogni giorno, la stessa per tutti. Scegli un nickname e il punteggio
            finisce in classifica.
          </p>
        </header>

        <form className="welcome__form" onSubmit={onSubmit} noValidate>
          <SegmentedControl
            ariaLabel="Accedi o registrati"
            value={mode}
            onChange={switchMode}
            options={[
              { value: 'login', label: 'Accedi' },
              { value: 'register', label: 'Registrati' },
            ]}
          />

          <div className="welcome__fields">
            <Field
              label="Nickname"
              placeholder="come ti chiamiamo"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              maxLength={NICKNAME_MAX}
              required
              error={field === 'nickname' ? error : null}
            />
            <Field
              label="Password"
              type="password"
              placeholder={isRegister ? `almeno ${PASSWORD_MIN} caratteri` : 'la tua password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              minLength={PASSWORD_MIN}
              required
              error={field === 'password' ? error : null}
              hint={
                isRegister
                  ? 'Serve solo a ritrovare i tuoi punteggi: non usare una password che usi altrove.'
                  : undefined
              }
            />
          </div>

          {error && !field && (
            <p className="welcome__error" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" fullWidth loading={busy}>
            {busy
              ? 'Un attimo…'
              : isRegister
                ? 'Crea il profilo'
                : 'Entra'}
          </Button>

          <p className="welcome__note">
            {isRegister
              ? 'Nessuna email, nessuna verifica: il profilo serve solo per la classifica.'
              : 'Il browser ti ricorda: la prossima volta entri diretto.'}
          </p>
        </form>
      </div>
    </div>
  )
}
