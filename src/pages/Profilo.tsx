import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Elenco, Riga, Sezione } from '@/components/Elementi'
import { IconBook, IconLogout, IconMail, IconPeople, IconPerson } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Sheet } from '@/components/Sheet'
import { useAmiciOnline } from '@/games/amici/amici'
import { useAuth, usePlayer } from '@/lib/auth'
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
 * gli amici online — toccandone uno se ne apre il profilo, da cui lo si
 * invita a giocare — e le impostazioni. I punti e i conti di ogni gioco stanno
 * nella classifica, che e' dove si guarda come si sta andando.
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
  const [busy, setBusy] = useState(false)

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

      <Sezione titolo="Amici online">
        {amici === null ? (
          <div className="profilo-amici__attesa scheletro" aria-hidden="true" />
        ) : amici.length === 0 ? (
          <div className="profilo-amici__nessuno">
            <IconPeople size={22} />
            <span>Nessun amico online adesso</span>
          </div>
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

      <Sezione titolo="Account">
        <Elenco>
          <Riga icona={<IconPerson size={18} />} titolo="Nickname" valore={player.nickname} />
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

      <Sezione>
        <Elenco>
          <Riga icona={<IconBook size={18} />} titolo="Fonti e licenze" onClick={() => setFonti(true)} />
        </Elenco>
      </Sezione>

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
        <strong>Scacchi.</strong> I pezzi sono quelli di Colin M. L. Burnett, da{' '}
        <a href="https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces" target="_blank" rel="noreferrer">
          Wikimedia Commons
        </a>{' '}
        (licenza BSD).
      </p>
    </div>
  )
}
