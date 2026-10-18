import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { CODE_LENGTH, CODE_TTL_MINUTES, NICKNAME_MAX, NICKNAME_OGNI_GIORNI, NICKNAME_PATTERN } from '@shared/config'
import type { CodiceMandato, Player } from '@shared/types'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { CampoCodice } from '@/components/CampoCodice'
import { Elenco, Riga, Sezione } from '@/components/Elementi'
import { Field } from '@/components/Field'
import { IconBook, IconChart, IconKey, IconLogout, IconMail, IconPeople, IconPerson } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { useAmiciOnline } from '@/games/amici/amici'
import { PannelloNotifiche } from '@/games/amici/PannelloNotifiche'
import { Persone } from '@/games/amici/Persone'
import { ApiFetchError, api } from '@/lib/api'
import { useAuth, usePlayer } from '@/lib/auth'
import { useDati } from '@/lib/dati'
import type { AdminIo } from '@shared/admin'
import { haptic } from '@/lib/haptics'
import { formatGameDate } from '@/lib/format'
import { DOVE } from '@/lib/presenza'
import { useSuoni } from '@/lib/suoni'
import { useTheme, type ThemePreference } from '@/lib/theme'
import './Profilo.css'

const TEMI: { value: ThemePreference; label: string }[] = [
  { value: 'auto', label: 'Automatico' },
  { value: 'light', label: 'Chiaro' },
  { value: 'dark', label: 'Scuro' },
]

const SUONI: { value: 'si' | 'no'; label: string }[] = [
  { value: 'si', label: 'Accesi' },
  { value: 'no', label: 'Spenti' },
]

/**
 * Il profilo, che si apre dall'avatar in alto a destra delle schede: chi sei,
 * le persone del gruppo — gli amici online, e tutte le altre da cercare: da
 * una si apre il suo profilo, e la si invita a giocare anche se non c'e' —
 * e le impostazioni. I propri punti stanno nel proprio profilo, lo stesso che
 * vedono gli altri, che si apre da qui e dalla classifica.
 */
export default function Profilo() {
  const player = usePlayer()
  const { logout } = useAuth()
  const { preference, setTheme } = useTheme()
  const [suoni, impostaSuoni] = useSuoni()
  const amici = useAmiciOnline()
  const { state } = useLocation()
  const da = (state as { da?: string } | null)?.da ?? 'Giornaliere'
  const [uscita, setUscita] = useState(false)
  const [fonti, setFonti] = useState(false)
  const [persone, setPersone] = useState(false)
  const [nickname, setNickname] = useState(false)
  const [busy, setBusy] = useState(false)
  // Il pannello di amministrazione: la riga c'e' solo per chi ne ha il ruolo, e lo chiede solo il profilo.
  const { dati: admin } = useDati<AdminIo>('/admin/io')

  return (
    <Pagina titolo="Profilo" indietro={{ a: ROTTE.home, etichetta: da }}>
      <section className="profilo-testa entra">
        <Avatar nickname={player.nickname} color={player.avatarColor} size={76} />
        <div className="profilo-testa__chi">
          <p className="profilo-testa__nome">{player.displayName}</p>
          <p className="profilo-testa__da">
            @{player.nickname} · nel gruppo dal {formatGameDate(player.createdAt.slice(0, 10))}
          </p>
        </div>
      </section>

      <Sezione>
        <Elenco>
          <Riga
            icona={<IconChart size={18} />}
            titolo="I tuoi punteggi"
            sotto="Il tuo profilo, come lo vedono gli altri"
            a={ROTTE.amico(player.nickname)}
          />
        </Elenco>
      </Sezione>

      <Sezione titolo="Persone">
        {amici === null ? (
          <div className="profilo-amici__attesa scheletro" aria-hidden="true" />
        ) : (
          <Elenco>
            {amici.map((a) => (
              <Riga
                key={a.playerId}
                icona={
                  <span className="profilo-amici__avatar">
                    <Avatar nickname={a.nickname} color={a.avatarColor} size={34} />
                    <span className="profilo-amici__online" aria-hidden="true" />
                  </span>
                }
                titolo={a.displayName}
                sotto={DOVE[a.attivita]}
                a={ROTTE.amico(a.nickname)}
              />
            ))}
            <Riga
              icona={<IconPeople size={18} />}
              titolo="Cerca una persona"
              sotto={amici.length === 0 ? 'Nessuno è online adesso' : undefined}
              onClick={() => setPersone(true)}
            />
          </Elenco>
        )}
      </Sezione>

      <Sezione titolo="Aspetto">
        <SegmentedControl ariaLabel="Tema" options={TEMI} value={preference} onChange={setTheme} />
      </Sezione>

      <Sezione titolo="Suoni">
        <SegmentedControl
          ariaLabel="Suoni"
          options={SUONI}
          value={suoni ? 'si' : 'no'}
          onChange={(v) => impostaSuoni(v === 'si')}
        />
      </Sezione>

      <PannelloNotifiche />

      <Sezione titolo="Account">
        <Elenco>
          <Riga
            icona={<IconPerson size={18} />}
            titolo="Nickname"
            valore={player.nickname}
            onClick={() => setNickname(true)}
          />
          {player.email && (
            <Riga
              icona={<IconMail size={18} />}
              titolo="Email"
              sotto={player.emailVerified ? undefined : 'Da confermare'}
              valore={<span className="profilo__email">{player.email}</span>}
            />
          )}
          <Riga icona={<IconLogout size={18} />} titolo="Esci" distruttiva onClick={() => setUscita(true)} />
        </Elenco>
      </Sezione>

      {admin?.admin && (
        <Sezione>
          <Elenco>
            <Riga icona={<IconKey size={18} />} titolo="Pannello admin" a={ROTTE.admin()} />
          </Elenco>
        </Sezione>
      )}

      <Sezione>
        <Elenco>
          <Riga icona={<IconBook size={18} />} titolo="Fonti e licenze" onClick={() => setFonti(true)} />
        </Elenco>
      </Sezione>

      <Sheet open={nickname} onClose={() => setNickname(false)} title="Cambia il nickname">
        {nickname && <CambioNickname onFatto={() => setNickname(false)} onAnnulla={() => setNickname(false)} />}
      </Sheet>

      <Sheet open={persone} onClose={() => setPersone(false)} title="Persone">
        {persone && <Persone onScelta={() => setPersone(false)} />}
      </Sheet>

      <Sheet open={fonti} onClose={() => setFonti(false)} title="Fonti e licenze">
        <Fonti />
      </Sheet>

      <Sheet open={uscita} onClose={() => setUscita(false)} title="Vuoi uscire?">
        <p className="profilo__testo">Per rientrare ti mandiamo un codice all’email.</p>
        <Button
          variant="destructive"
          size="lg"
          fullWidth
          loading={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await logout()
            } finally {
              setBusy(false)
              setUscita(false)
            }
          }}
        >
          Esci
        </Button>
        <Button variant="plain" size="lg" fullWidth onClick={() => setUscita(false)}>
          Annulla
        </Button>
      </Sheet>
    </Pagina>
  )
}

/* ─────────────────────────  Il nickname  ───────────────────────── */

/** "16 ottobre": da quando si potra' cambiare di nuovo. */
const giornoDi = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })

/**
 * Il cambio del nickname, in due passi come l'accesso: il nome nuovo, e il
 * codice che arriva all'email dell'account. Una volta a settimana: prima della
 * settimana il foglio dice soltanto da quando.
 */
function CambioNickname({ onFatto, onAnnulla }: { onFatto: () => void; onAnnulla: () => void }) {
  const player = usePlayer()
  const { apply } = useAuth()
  const toast = useToast()
  const [nuovo, setNuovo] = useState('')
  const [inviato, setInviato] = useState(false)
  const [codice, setCodice] = useState('')
  const [codiceDiProva, setCodiceDiProva] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(0)
  const [busy, setBusy] = useState(false)
  const [errore, setErrore] = useState<{ testo: string; campo: 'nickname' | 'codice' | null } | null>(null)
  const campoCodice = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (attesa <= 0) return
    const t = window.setTimeout(() => setAttesa((a) => a - 1), 1000)
    return () => window.clearTimeout(t)
  }, [attesa])
  useEffect(() => {
    if (inviato) campoCodice.current?.focus()
  }, [inviato])

  if (player.nicknameCambiabileDal) {
    return (
      <>
        <p className="profilo__testo">
          Il nickname si cambia una volta a settimana: potrai cambiarlo di nuovo dal{' '}
          <strong>{giornoDi(player.nicknameCambiabileDal)}</strong>.
        </p>
        <Button variant="plain" size="lg" fullWidth onClick={onAnnulla}>
          Chiudi
        </Button>
      </>
    )
  }

  const sbaglia = (err: unknown, altrimenti: string) => {
    haptic('error')
    if (!(err instanceof ApiFetchError)) return setErrore({ testo: altrimenti, campo: null })
    const campo = err.code.startsWith('NICKNAME') ? 'nickname' : err.code.startsWith('CODE') ? 'codice' : null
    setErrore({ testo: err.message, campo })
    if (campo === 'nickname') setInviato(false)
  }

  async function chiedi() {
    setErrore(null)
    const nome = nuovo.trim()
    if (!NICKNAME_PATTERN.test(nome)) {
      return setErrore({ testo: 'Da 3 a 16 caratteri: lettere, numeri, punto, trattino e underscore.', campo: 'nickname' })
    }
    setBusy(true)
    try {
      const r = await api<CodiceMandato>('/auth/nickname/code', { method: 'POST', body: { nickname: nome } })
      haptic('success')
      setInviato(true)
      setCodice('')
      setAttesa(r.cooldownSeconds)
      setCodiceDiProva(r.codiceDiProva ?? null)
    } catch (err) {
      sbaglia(err, 'Non riesco a mandare il codice. Riprova.')
    } finally {
      setBusy(false)
    }
  }

  async function conferma(valore: string) {
    setErrore(null)
    setBusy(true)
    try {
      const { player: aggiornato } = await api<{ player: Player }>('/auth/nickname', {
        method: 'POST',
        body: { nickname: nuovo.trim(), code: valore },
      })
      haptic('success')
      apply(aggiornato)
      toast.show(`Adesso sei @${aggiornato.nickname}`, 'success')
      onFatto()
    } catch (err) {
      sbaglia(err, 'Non riesco a cambiare il nickname. Riprova.')
      setCodice('')
      campoCodice.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  function invia(event: FormEvent) {
    event.preventDefault()
    if (!inviato) void chiedi()
    else if (codice.length === CODE_LENGTH) void conferma(codice)
  }

  return (
    <form className="profilo-nick" onSubmit={invia} noValidate>
      {!inviato ? (
        <>
          <div className="profilo-nick__campi">
            <Field
              label="Nickname nuovo"
              placeholder={player.nickname}
              value={nuovo}
              onChange={(e) => {
                setNuovo(e.target.value)
                setErrore(null)
              }}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={NICKNAME_MAX}
              autoFocus
              error={errore?.campo === 'nickname' ? errore.testo : null}
            />
          </div>
          <p className="profilo__testo">
            Ti mandiamo un codice all’email. Poi lo potrai cambiare di nuovo fra {NICKNAME_OGNI_GIORNI} giorni.
          </p>
          {errore && errore.campo === null && (
            <p className="profilo-nick__errore" role="alert">
              {errore.testo}
            </p>
          )}
          <Button type="submit" size="lg" fullWidth loading={busy} disabled={nuovo.trim().length === 0}>
            Mandami il codice
          </Button>
        </>
      ) : (
        <>
          <p className="profilo-nick__cambio" aria-live="polite">
            <span>@{player.nickname}</span>
            <span className="profilo-nick__freccia" aria-hidden="true">
              →
            </span>
            <strong>@{nuovo.trim()}</strong>
          </p>
          <p className="profilo__testo profilo-nick__dove" role="status">
            Il codice è partito per <strong>{player.email}</strong>. Vale {CODE_TTL_MINUTES} minuti.
          </p>
          <CampoCodice
            id="codice-nickname"
            ref={campoCodice}
            etichetta="Codice per cambiare il nickname"
            valore={codice}
            onCambia={(cifre) => {
              setCodice(cifre)
              setErrore(null)
            }}
            onCompleto={(cifre) => void conferma(cifre)}
            disabled={busy}
            errore={errore?.campo === 'codice'}
          />
          {codiceDiProva && <p className="profilo-nick__nota">In locale, senza la posta: il codice è {codiceDiProva}.</p>}
          {errore && (
            <p className="profilo-nick__errore" role="alert">
              {errore.testo}
            </p>
          )}
          <Button type="submit" size="lg" fullWidth loading={busy} disabled={codice.length !== CODE_LENGTH}>
            Cambia il nickname
          </Button>
          <div className="profilo-nick__azioni">
            <button type="button" className="profilo-nick__link" disabled={busy || attesa > 0} onClick={() => void chiedi()}>
              {attesa > 0 ? `Rimanda il codice fra ${attesa}s` : 'Rimanda il codice'}
            </button>
            <button
              type="button"
              className="profilo-nick__link is-tenue"
              onClick={() => {
                setInviato(false)
                setCodice('')
                setCodiceDiProva(null)
                setErrore(null)
              }}
            >
              Scegli un altro nickname
            </button>
          </div>
        </>
      )}
    </form>
  )
}

/* ─────────────────────────────  Fonti  ───────────────────────────── */

/** Da dove vengono le parole: le licenze lo chiedono, e chi gioca ha diritto di saperlo. */
function Fonti() {
  return (
    <div className="profilo-fonti">
      <p>
        <strong>Wordle.</strong> Parole da{' '}
        <a href="https://github.com/napolux/paroleitaliane" target="_blank" rel="noreferrer">
          napolux/paroleitaliane
        </a>{' '}
        (MIT), scelte per frequenza con{' '}
        <a href="https://github.com/hermitdave/FrequencyWords" target="_blank" rel="noreferrer">
          hermitdave/FrequencyWords
        </a>{' '}
        (MIT, da OpenSubtitles 2018).
      </p>
      <p>
        <strong>Scarabeo.</strong> Dizionario da napolux/paroleitaliane (MIT), con le forme del{' '}
        <a href="https://it.wiktionary.org" target="_blank" rel="noreferrer">
          Wikizionario
        </a>{' '}
        e del{' '}
        <a href="https://en.wiktionary.org" target="_blank" rel="noreferrer">
          Wiktionary
        </a>
        , estratte da{' '}
        <a href="https://kaikki.org" target="_blank" rel="noreferrer">
          kaikki.org
        </a>{' '}
        (
        <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.it" target="_blank" rel="noreferrer">
          CC BY-SA 4.0
        </a>
        ).
      </p>
      <p>
        <strong>Nomi, cose e città.</strong> Parole dal{' '}
        <a href="https://it.wiktionary.org" target="_blank" rel="noreferrer">
          Wikizionario
        </a>{' '}
        e dal{' '}
        <a href="https://en.wiktionary.org" target="_blank" rel="noreferrer">
          Wiktionary
        </a>
        , estratte da{' '}
        <a href="https://kaikki.org" target="_blank" rel="noreferrer">
          kaikki.org
        </a>{' '}
        (
        <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.it" target="_blank" rel="noreferrer">
          CC BY-SA 4.0
        </a>
        ), da{' '}
        <a href="https://www.wikidata.org" target="_blank" rel="noreferrer">
          Wikidata
        </a>{' '}
        (CC0), da napolux/paroleitaliane e da hermitdave/FrequencyWords (MIT).
      </p>
      <p>
        <strong>Cruciverba.</strong> Definizioni dal{' '}
        <a href="https://it.wiktionary.org" target="_blank" rel="noreferrer">
          Wikizionario
        </a>
        , estratte da{' '}
        <a href="https://kaikki.org/itwiktionary/" target="_blank" rel="noreferrer">
          kaikki.org
        </a>{' '}
        e accorciate. Licenza{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.it" target="_blank" rel="noreferrer">
          CC BY-SA 4.0
        </a>
        .
      </p>
      <p>
        <strong>Anagrammi.</strong> Parole da napolux/paroleitaliane e da hermitdave/FrequencyWords (MIT), con le
        definizioni del{' '}
        <a href="https://it.wiktionary.org" target="_blank" rel="noreferrer">
          Wikizionario
        </a>
        , estratte da{' '}
        <a href="https://kaikki.org/itwiktionary/" target="_blank" rel="noreferrer">
          kaikki.org
        </a>{' '}
        (
        <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.it" target="_blank" rel="noreferrer">
          CC BY-SA 4.0
        </a>
        ).
      </p>
      <p>
        <strong>Paroliere.</strong> Le parole valide sono quelle dello Scarabeo, con le stesse fonti.
      </p>
      <p>
        <strong>Ghigliottina.</strong> Le ghigliottine sono scritte a mano; il gioco è quello del finale dell’Eredità,
        su Rai 1.
      </p>
      <p>
        <strong>Catena.</strong> Le catene vengono dalle espressioni della Ghigliottina e da quelle del Wikizionario,
        con la sua licenza; il gioco è quello dell’ultima catena di Reazione a catena, su Rai 1.
      </p>
      <p>
        <strong>Scarabocchi.</strong> Le parole da disegnare sono quelle di Nomi, cose e città, con le stesse fonti.
      </p>
      <p>
        <strong>Quiz.</strong> Dati da{' '}
        <a href="https://www.wikidata.org" target="_blank" rel="noreferrer">
          Wikidata
        </a>{' '}
        (CC0), cartina da{' '}
        <a href="https://www.naturalearthdata.com" target="_blank" rel="noreferrer">
          Natural Earth
        </a>{' '}
        (pubblico dominio), bandiere da{' '}
        <a href="https://flagcdn.com" target="_blank" rel="noreferrer">
          flagcdn
        </a>
        . I quadri sono immagini di pubblico dominio di{' '}
        <a href="https://commons.wikimedia.org" target="_blank" rel="noreferrer">
          Wikimedia Commons
        </a>
        ; le spiegazioni e i fatti di «Accadde oggi» vengono da{' '}
        <a href="https://it.wikipedia.org" target="_blank" rel="noreferrer">
          Wikipedia
        </a>{' '}
        (
        <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.it" target="_blank" rel="noreferrer">
          CC BY-SA 4.0
        </a>
        ).
      </p>
      <p>
        <strong>Indovina chi.</strong> Le persone sono gli Avataaars di Pablo Stanley, disegnati da{' '}
        <a href="https://www.dicebear.com" target="_blank" rel="noreferrer">
          DiceBear
        </a>
        ; gli animali sono le{' '}
        <a href="https://github.com/microsoft/fluentui-emoji" target="_blank" rel="noreferrer">
          Fluent Emoji
        </a>{' '}
        di Microsoft (licenza MIT).
      </p>
      <p>
        <strong>Lupus.</strong> Le regole sono quelle di Lupus in Tabula, di Domenico Di Giorgio (dV Giochi), e
        dell’espansione La vendetta della Lupa Mannara, riassunte. Un gioco fra amici, non affiliato all’editore.
      </p>
      <p>
        <strong>Scacchi.</strong> I pezzi sono quelli di Colin M. L. Burnett, da{' '}
        <a href="https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces" target="_blank" rel="noreferrer">
          Wikimedia Commons
        </a>{' '}
        (licenza BSD).
      </p>
    </div>
  )
}
