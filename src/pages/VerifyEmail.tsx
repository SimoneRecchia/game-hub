import { useCallback, useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { CampoCodice } from '@/components/CampoCodice'
import { ThemeButton } from '@/components/ThemeButton'
import { useAuth } from '@/lib/auth'
import { ApiFetchError, api } from '@/lib/api'
import { haptic } from '@/lib/haptics'
import { CODE_LENGTH, CODE_TTL_MINUTES } from '@shared/config'
import type { InvitoConLink } from '@shared/types'
import './VerifyEmail.css'

/**
 * Schermata del codice, mostrata finché l'email non e' confermata.
 *
 * Il giocatore ha già una sessione: puo' farsi rimandare il codice, e finché
 * il codice vale il nickname appena scelto resta suo. Se l'ha scritto sbagliato
 * — o l'email — torna indietro, e il modulo glieli ripropone da correggere: la
 * registrazione in attesa se ne va, e nickname ed email tornano liberi. Le rotte
 * di gioco restano chiuse lato server.
 *
 * Chi si e' registrato da un invito a battaglia navale lo ritrova qui: la
 * conferma dell'email e' l'ultimo passo prima della partita, e l'indirizzo
 * resta quello dell'invito, che dopo la conferma lo porta dentro.
 */
export default function VerifyEmail({ invito = null }: { invito?: string | null }) {
  const { player, verify, resendCode, logout, annullaRegistrazione } = useAuth()
  const [sfida, setSfida] = useState<InvitoConLink | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attesa, setAttesa] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
  }, [])

  useEffect(() => {
    if (!invito) return
    let valido = true
    api<InvitoConLink>(`/inviti/${invito}`)
      .then((i) => valido && i.stato === 'attesa' && setSfida(i))
      .catch(() => {})
    return () => {
      valido = false
    }
  }, [invito])

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

  /** Il nickname o l'email sbagliati: la registrazione si annulla, e il modulo li ripropone da correggere. */
  async function correggi() {
    setBusy(true)
    setError(null)
    try {
      await annullaRegistrazione()
    } catch (err) {
      setError(err instanceof ApiFetchError ? err.message : 'Non riesco a tornare indietro. Riprova.')
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
            <strong>{player?.email ?? 'la tua email'}</strong>
            {player?.inAttesa ? (
              <>
                {' '}
                per <strong>@{player.nickname}</strong>
              </>
            ) : null}
            . Vale {CODE_TTL_MINUTES} minuti.
          </p>
        </header>

        {sfida && (
          <div className="verifica__invito" role="status">
            <Avatar nickname={sfida.da.nickname} color={sfida.da.avatarColor} size={36} />
            <p>
              Appena confermi, giochi con <strong>{sfida.da.displayName}</strong>.
            </p>
          </div>
        )}

        <CampoCodice
          id="codice"
          ref={input}
          etichetta="Codice di verifica"
          valore={code}
          onCambia={(cifre) => {
            setCode(cifre)
            setError(null)
          }}
          onCompleto={(cifre) => void invia(cifre)}
          disabled={busy}
          errore={error !== null}
        />

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
          Conferma
        </Button>

        <div className="verifica__azioni">
          <button
            type="button"
            className="verifica__link"
            onClick={() => void rimanda()}
            disabled={busy || attesa > 0}
          >
            {attesa > 0 ? `Rimanda il codice fra ${attesa}s` : 'Rimanda il codice'}
          </button>
          {player?.inAttesa ? (
            <button
              type="button"
              className="verifica__link verifica__link--tenue"
              onClick={() => void correggi()}
              disabled={busy}
            >
              Ho sbagliato nickname o email
            </button>
          ) : (
            <button type="button" className="verifica__link verifica__link--tenue" onClick={() => void logout()}>
              Esci e usa un altro account
            </button>
          )}
        </div>

        <p className="verifica__nota">Se non lo trovi, guarda nello spam.</p>
      </div>
    </div>
  )
}
