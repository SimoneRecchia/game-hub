import { useEffect, useState, type FormEvent } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Marchio } from '@/components/Marchio'
import { SegmentedControl } from '@/components/SegmentedControl'
import { ThemeButton } from '@/components/ThemeButton'
import { A_GIOCO } from '@/games/tavolo/nomi'
import { useAuth } from '@/lib/auth'
import { ApiFetchError, api } from '@/lib/api'
import { haptic } from '@/lib/haptics'
import { EMAIL_PATTERN, NICKNAME_MAX, NICKNAME_MIN, PASSWORD_MIN } from '@shared/config'
import { InsecureContextError } from '@shared/password'
import type { InvitoConLink } from '@shared/types'
import { ForgotPassword } from './ForgotPassword'
import './Welcome.css'

type Mode = 'login' | 'register'
type Campo = 'nickname' | 'email' | 'password' | 'conferma' | null

/**
 * Schermata di ingresso: accesso o registrazione.
 *
 * In registrazione la password si scrive due volte e l'email e' obbligatoria:
 * serve al recupero, che prima non esisteva — chi dimenticava la password
 * perdeva l'account.
 *
 * Chi arriva da un **invito con un link** — a battaglia navale, a una sfida a
 * quiz, a una partita da tavolo — vede prima chi lo sta sfidando, e la schermata parte dalla
 * registrazione: e' quasi certamente la
 * prima volta che apre l'app. L'indirizzo resta quello dell'invito, quindi
 * appena entra la pagina dell'invito lo porta nella partita.
 */
export default function Welcome({ invito = null }: { invito?: string | null }) {
  const { login, register, config } = useAuth()
  const [mode, setMode] = useState<Mode>(invito ? 'register' : 'login')
  const [sfida, setSfida] = useState<InvitoConLink | null>(null)
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [conferma, setConferma] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [field, setField] = useState<Campo>(null)
  const [busy, setBusy] = useState(false)
  const [recupero, setRecupero] = useState(false)

  const isRegister = mode === 'register'

  useEffect(() => {
    if (!invito) return
    let valido = true
    api<InvitoConLink>(`/inviti/${invito}`)
      .then((i) => valido && setSfida(i))
      .catch(() => {
        /* un invito che non si legge non impedisce di entrare */
      })
    return () => {
      valido = false
    }
  }, [invito])

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setField(null)
    setConferma('')
  }

  function errore(campo: Campo, testo: string) {
    setField(campo)
    setError(testo)
    haptic('error')
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setField(null)

    const name = nickname.trim()
    if (name.length < NICKNAME_MIN || name.length > NICKNAME_MAX) {
      return errore('nickname', `Il nickname deve avere fra ${NICKNAME_MIN} e ${NICKNAME_MAX} caratteri.`)
    }
    if (isRegister && !EMAIL_PATTERN.test(email.trim())) {
      return errore('email', 'Questa email non sembra valida.')
    }
    if (password.length < PASSWORD_MIN) {
      return errore('password', `La password deve avere almeno ${PASSWORD_MIN} caratteri.`)
    }
    // Il controllo sta qui e non solo sul server: e' un refuso di battitura,
    // non serve un viaggio in rete per accorgersene.
    if (isRegister && conferma !== password) {
      return errore('conferma', 'Le due password non coincidono.')
    }

    setBusy(true)
    try {
      if (isRegister) await register(name, email.trim(), password)
      else await login(name, password)
      haptic('success')
    } catch (err) {
      haptic('error')
      if (err instanceof ApiFetchError) {
        setError(err.message)
        if (err.code.startsWith('NICKNAME')) setField('nickname')
        else if (err.code.startsWith('EMAIL')) setField('email')
        else if (err.code === 'BAD_CREDENTIALS') setField('password')
      } else if (err instanceof InsecureContextError) {
        setError(err.message)
      } else {
        setError(isRegister ? 'Non riesco a creare il profilo. Riprova.' : 'Non riesco a entrare. Riprova.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (recupero) return <ForgotPassword onDone={() => setRecupero(false)} />

  return (
    <div className="welcome">
      <div className="welcome__theme">
        <ThemeButton />
      </div>

      <div className="welcome__inner">
        <header className="welcome__head">
          <Marchio lato={96} />
          <h1 className="welcome__title">Giochi</h1>
          <p className="welcome__lede">
            Wordle, Scarabeo, Cruciverba, Sudoku, Battaglia navale e Quiz, ogni giorno uguali per tutti. E scacchi,
            dama, Forza 4, go e Indovina chi, con gli amici.
          </p>
        </header>

        {sfida && (
          <div className="welcome__invito" role="status">
            <Avatar nickname={sfida.da.nickname} color={sfida.da.avatarColor} size={44} />
            <p className="welcome__invito-testo">
              {sfida.stato === 'attesa' ? (
                <>
                  <strong>{sfida.da.displayName}</strong>{' '}
                  {sfida.gioco === 'quiz'
                    ? 'ti sfida a un quiz.'
                    : sfida.gioco === 'indovina'
                      ? 'ti invita a Indovina chi.'
                      : sfida.gioco === 'scacchi' ||
                          sfida.gioco === 'dama' ||
                          sfida.gioco === 'forza4' ||
                          sfida.gioco === 'go'
                        ? `ti invita a giocare ${A_GIOCO[sfida.gioco]}.`
                        : 'ti sfida a battaglia navale.'}{' '}
                  {isRegister ? 'Registrati e gioca subito.' : 'Entra e gioca subito.'}
                </>
              ) : (
                <>
                  L’invito di <strong>{sfida.da.displayName}</strong> non vale più. Chiedine un altro.
                </>
              )}
            </p>
          </div>
        )}

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
              placeholder={isRegister ? 'come ti chiamiamo' : 'il tuo nickname'}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={NICKNAME_MAX}
              required
              error={field === 'nickname' ? error : null}
            />

            {isRegister && (
              <Field
                label="Email"
                type="email"
                placeholder="per recuperare l’account"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="email"
                required
                error={field === 'email' ? error : null}
              />
            )}

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
            />

            {isRegister && (
              <Field
                label="Ripeti"
                type="password"
                placeholder="la stessa password"
                value={conferma}
                onChange={(e) => setConferma(e.target.value)}
                autoComplete="new-password"
                required
                error={field === 'conferma' ? error : null}
              />
            )}
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
                ? sfida?.stato === 'attesa'
                  ? 'Crea il profilo e gioca'
                  : 'Crea il profilo'
                : 'Entra'}
          </Button>

          {!isRegister && (
            <button
              type="button"
              className="welcome__link"
              onClick={() => {
                setError(null)
                setRecupero(true)
              }}
            >
              Password dimenticata
            </button>
          )}

          {isRegister && config?.emailVerificationRequired && (
            <p className="welcome__note">Ti mandiamo un codice per confermare l’email.</p>
          )}
        </form>
      </div>
    </div>
  )
}
