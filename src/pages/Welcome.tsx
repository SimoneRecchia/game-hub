import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { CampoCodice } from '@/components/CampoCodice'
import { Field } from '@/components/Field'
import { Marchio } from '@/components/Marchio'
import { SegmentedControl } from '@/components/SegmentedControl'
import { ThemeButton } from '@/components/ThemeButton'
import { A_GIOCO } from '@/games/tavolo/nomi'
import { useAuth } from '@/lib/auth'
import { ApiFetchError, api } from '@/lib/api'
import { haptic } from '@/lib/haptics'
import { CODE_LENGTH, CODE_TTL_MINUTES, EMAIL_PATTERN, NICKNAME_MAX, NICKNAME_MIN } from '@shared/config'
import type { InvitoConLink } from '@shared/types'
import './Welcome.css'

type Mode = 'login' | 'register'
type Campo = 'nickname' | 'email' | 'identificativo' | 'codice' | null

/**
 * Schermata di ingresso: accesso o registrazione, senza password.
 *
 * Per entrare si scrive il nickname o l'email, e arriva un codice di sei cifre
 * all'email dell'account. La schermata dice sempre che il codice e' partito,
 * anche per un account che non c'e': dire il contrario direbbe chi e' iscritto.
 * Per registrarsi bastano il nickname e l'email, che si conferma con un codice
 * quando la posta e' attiva.
 *
 * Chi arriva da un **invito con un link** — a battaglia navale, a una sfida a
 * quiz, a una partita da tavolo — vede prima chi lo sta sfidando, e la
 * schermata parte dalla registrazione: e' quasi certamente la prima volta che
 * apre l'app. L'indirizzo resta quello dell'invito, quindi appena entra la
 * pagina dell'invito lo porta nella partita.
 */
export default function Welcome({ invito = null }: { invito?: string | null }) {
  const { login, register, requestCode, config } = useAuth()
  const [mode, setMode] = useState<Mode>(invito ? 'register' : 'login')
  const [sfida, setSfida] = useState<InvitoConLink | null>(null)
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [identificativo, setIdentificativo] = useState('')
  /** Il codice e' partito: si aspetta che lo si scriva. */
  const [inviato, setInviato] = useState(false)
  const [codice, setCodice] = useState('')
  /** Solo in locale, senza la posta: il codice che il server ha restituito. */
  const [codiceDiProva, setCodiceDiProva] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [field, setField] = useState<Campo>(null)
  const [busy, setBusy] = useState(false)
  const campoCodice = useRef<HTMLInputElement>(null)

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

  // Il conto alla rovescia per chiederne un altro: un tasto che non va senza dire perché e' peggio di un numero.
  useEffect(() => {
    if (attesa <= 0) return
    const id = window.setInterval(() => setAttesa((s) => Math.max(0, s - 1)), 1_000)
    return () => window.clearInterval(id)
  }, [attesa])

  useEffect(() => {
    if (inviato) campoCodice.current?.focus()
  }, [inviato])

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setField(null)
  }

  function errore(campo: Campo, testo: string) {
    setField(campo)
    setError(testo)
    haptic('error')
  }

  /** L'errore del server sul campo giusto: il nickname, l'email, il codice. */
  function erroreDalServer(err: unknown, altrimenti: string) {
    haptic('error')
    if (!(err instanceof ApiFetchError)) {
      setError(altrimenti)
      return
    }
    setError(err.message)
    if (err.code.startsWith('NICKNAME')) setField('nickname')
    else if (err.code.startsWith('EMAIL_') && err.code !== 'EMAIL_DISABLED') setField('email')
    else if (err.code.startsWith('IDENTIFIER')) setField('identificativo')
    else if (err.code.startsWith('CODE') || err.code === 'BAD_CODE_FORMAT') setField('codice')
  }

  async function chiediCodice() {
    setError(null)
    setField(null)
    if (identificativo.trim().length === 0) return errore('identificativo', 'Scrivi il nickname o l’email.')
    setBusy(true)
    try {
      const risposta = await requestCode(identificativo)
      haptic('success')
      setInviato(true)
      setCodice('')
      setAttesa(risposta.cooldownSeconds)
      // Senza un codice nuovo (l'attesa fra due invii) vale ancora quello di prima.
      setCodiceDiProva((prima) => risposta.codiceDiProva ?? prima)
    } catch (err) {
      erroreDalServer(err, 'Non riesco a mandare il codice. Riprova.')
    } finally {
      setBusy(false)
    }
  }

  async function entra(valore: string) {
    setError(null)
    setField(null)
    setBusy(true)
    try {
      await login(identificativo, valore)
      haptic('success')
    } catch (err) {
      erroreDalServer(err, 'Non riesco a entrare. Riprova.')
      setCodice('')
      campoCodice.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  async function registrati() {
    setError(null)
    setField(null)
    const name = nickname.trim()
    if (name.length < NICKNAME_MIN || name.length > NICKNAME_MAX) {
      return errore('nickname', `Il nickname deve avere fra ${NICKNAME_MIN} e ${NICKNAME_MAX} caratteri.`)
    }
    if (!EMAIL_PATTERN.test(email.trim())) return errore('email', 'Questa email non sembra valida.')
    setBusy(true)
    try {
      await register(name, email.trim())
      haptic('success')
    } catch (err) {
      erroreDalServer(err, 'Non riesco a creare il profilo. Riprova.')
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (isRegister) void registrati()
    else if (inviato) {
      if (codice.length === CODE_LENGTH) void entra(codice)
    } else void chiediCodice()
  }

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
            Wordle, Scarabeo, Cruciverba, Sudoku, Quiz, Tris e Nomi, cose e città, ogni giorno uguali per tutti. E
            battaglia navale, scacchi, dama, Forza 4, go e Indovina chi, con gli amici.
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
                    : sfida.gioco === 'nomi'
                      ? 'ti sfida a Nomi, cose e città.'
                      : sfida.gioco === 'indovina'
                      ? 'ti invita a Indovina chi.'
                      : sfida.gioco === 'scacchi' ||
                          sfida.gioco === 'dama' ||
                          sfida.gioco === 'forza4' ||
                          sfida.gioco === 'go' ||
                          sfida.gioco === 'tris'
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

          {isRegister ? (
            <>
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
                  maxLength={NICKNAME_MAX}
                  required
                  error={field === 'nickname' ? error : null}
                />
                <Field
                  label="Email"
                  type="email"
                  placeholder="ti arriva il codice per entrare"
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
              </div>
              {error && !field && (
                <p className="welcome__error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" fullWidth loading={busy}>
                {busy ? 'Un attimo…' : sfida?.stato === 'attesa' ? 'Crea il profilo e gioca' : 'Crea il profilo'}
              </Button>
              {config?.emailVerificationRequired && (
                <p className="welcome__note">Ti mandiamo un codice per confermare l’email.</p>
              )}
            </>
          ) : !inviato ? (
            <>
              <div className="welcome__fields">
                <Field
                  label="Nickname o email"
                  placeholder="come entri"
                  value={identificativo}
                  onChange={(e) => setIdentificativo(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  error={field === 'identificativo' ? error : null}
                />
              </div>
              {error && !field && (
                <p className="welcome__error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" fullWidth loading={busy}>
                {busy ? 'Un attimo…' : 'Mandami il codice'}
              </Button>
            </>
          ) : (
            <>
              <p className="welcome__codice" role="status">
                Se <strong>{identificativo.trim()}</strong> ha un account, il codice è partito per la sua
                email. Vale {CODE_TTL_MINUTES} minuti.
              </p>
              <CampoCodice
                id="codice-accesso"
                ref={campoCodice}
                etichetta="Codice per entrare"
                valore={codice}
                onCambia={(cifre) => {
                  setCodice(cifre)
                  setError(null)
                  setField(null)
                }}
                onCompleto={(cifre) => void entra(cifre)}
                disabled={busy}
                errore={field === 'codice'}
              />
              {codiceDiProva && (
                <p className="welcome__note">In locale, senza la posta: il codice è {codiceDiProva}.</p>
              )}
              {error && (
                <p className="welcome__error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" fullWidth loading={busy} disabled={codice.length !== CODE_LENGTH}>
                Entra
              </Button>
              <div className="welcome__azioni">
                <button
                  type="button"
                  className="welcome__link"
                  disabled={busy || attesa > 0}
                  onClick={() => void chiediCodice()}
                >
                  {attesa > 0 ? `Rimanda il codice fra ${attesa}s` : 'Rimanda il codice'}
                </button>
                <button
                  type="button"
                  className="welcome__link welcome__link--tenue"
                  onClick={() => {
                    setInviato(false)
                    setCodice('')
                    setCodiceDiProva(null)
                    setError(null)
                    setField(null)
                  }}
                >
                  Cambia nickname o email
                </button>
              </div>
              <p className="welcome__note">Se non lo trovi, guarda nello spam.</p>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
