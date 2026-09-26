import { useState, type CSSProperties, type ReactNode } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Copertina } from '@/components/Copertina'
import { Elenco, Numero, Riga, Sezione } from '@/components/Elementi'
import { IconBook, IconLogout, IconMail, IconPerson } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Sheet } from '@/components/Sheet'
import { GIOCHI } from '@/games/catalog'
import { StatsPanel } from '@/games/wordle/StatsPanel'
import { useAuth, usePlayer } from '@/lib/auth'
import { useDati } from '@/lib/dati'
import { formatDuration, formatGameDate, formatNumber } from '@/lib/format'
import { useTheme, type ThemePreference } from '@/lib/theme'
import type {
  BattagliaLeaderboard,
  CruciverbaLeaderboard,
  CruciverbaLiberaRisposta,
  GeneraleLeaderboard,
  GiocoClassificato,
  LobbyBattaglia,
  PlayerStats,
  ScarabeoLeaderboard,
  StatisticheScarabeoLibero,
  WordleLiberaRisposta,
} from '@shared/types'
import './Profilo.css'

const TEMI: { value: ThemePreference; label: string }[] = [
  { value: 'auto', label: 'Automatico' },
  { value: 'light', label: 'Chiaro' },
  { value: 'dark', label: 'Scuro' },
]

/**
 * Il profilo: come si sta andando, gioco per gioco, e le impostazioni.
 *
 * In cima la classifica generale da sempre — e' il numero che riassume tutto —
 * poi una riga per gioco con i suoi punti; toccandola si aprono i conti di quel
 * gioco, classificate e libere. I dettagli si chiedono al server solo lì,
 * quando si aprono: il profilo si guarda spesso, i conti di rado.
 */
export default function Profilo() {
  const player = usePlayer()
  const { logout } = useAuth()
  const { preference, setTheme } = useTheme()
  const { dati: generale } = useDati<GeneraleLeaderboard>('/leaderboard/generale?scope=all')
  const [aperto, setAperto] = useState<GiocoClassificato | null>(null)
  const [uscita, setUscita] = useState(false)
  const [fonti, setFonti] = useState(false)
  const [busy, setBusy] = useState(false)

  const io = generale?.me ?? null

  return (
    <Pagina titolo="Profilo">
      <section className="profilo-testa entra">
        <Avatar nickname={player.nickname} color={player.avatarColor} size={76} />
        <div className="profilo-testa__chi">
          <p className="profilo-testa__nome">{player.displayName}</p>
          <p className="profilo-testa__da">
            @{player.nickname} · nel gruppo dal {formatGameDate(player.createdAt.slice(0, 10))}
          </p>
        </div>
      </section>

      <section className="profilo-numeri entra" style={{ '--n': 1 } as CSSProperties}>
        <Tessera etichetta="In generale" valore={io ? `${io.rank}º` : '—'} nota={generale ? `su ${generale.rows.length}` : ' '} />
        <Tessera etichetta="Punti" valore={io ? <Numero valore={io.punti} /> : '0'} nota="da sempre" />
        <Tessera etichetta="Classificate" valore={io ? <Numero valore={io.partite} /> : '0'} nota="giocate" />
      </section>

      <Sezione titolo="I tuoi giochi" nota="Tocca un gioco per i suoi conti, classificate e libere.">
        <Elenco>
          {GIOCHI.map((g) => (
            <Riga
              key={g.id}
              icona={<Copertina gioco={g.id} formato="icona" />}
              titolo={g.nome}
              sotto={io && io.perGioco[g.id] > 0 ? 'Punti in classifica, da sempre' : 'Ancora nessuna classificata'}
              valore={<span className="u-tabnum profilo__punti">{formatNumber(io?.perGioco[g.id] ?? 0)}</span>}
              onClick={() => setAperto(g.id)}
            />
          ))}
        </Elenco>
      </Sezione>

      <Sezione titolo="Aspetto">
        <SegmentedControl ariaLabel="Tema" options={TEMI} value={preference} onChange={setTheme} />
      </Sezione>

      <Sezione
        titolo="Account"
        nota="Il browser resta collegato per un anno: non serve rifare l’accesso a ogni visita."
      >
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
          <Riga
            icona={<IconBook size={18} />}
            titolo="Fonti e licenze"
            sotto="Da dove vengono parole e definizioni"
            onClick={() => setFonti(true)}
          />
        </Elenco>
      </Sezione>

      <Sheet
        open={aperto !== null}
        onClose={() => setAperto(null)}
        title={aperto ? GIOCHI.find((g) => g.id === aperto)?.nome : undefined}
      >
        {aperto === 'wordle' && <ContiWordle />}
        {aperto === 'scarabeo' && <ContiScarabeo />}
        {aperto === 'cruciverba' && <ContiCruciverba />}
        {aperto === 'battaglia' && <ContiBattaglia />}
      </Sheet>

      <Sheet open={fonti} onClose={() => setFonti(false)} title="Fonti e licenze">
        <Fonti />
      </Sheet>

      <Sheet open={uscita} onClose={() => setUscita(false)} title="Vuoi uscire?">
        <p className="profilo__testo">I punteggi restano salvati. Per rientrare ti servono nickname e password.</p>
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

function Tessera({ etichetta, valore, nota }: { etichetta: string; valore: ReactNode; nota: string }) {
  return (
    <div className="profilo-tessera">
      <span className="profilo-tessera__etichetta">{etichetta}</span>
      <span className="profilo-tessera__valore">{valore}</span>
      <span className="profilo-tessera__nota">{nota}</span>
    </div>
  )
}

/* ─────────────────────────────  I conti di ogni gioco  ───────────────────────────── */

function Conti({ titolo, voci }: { titolo: string; voci: { etichetta: string; valore: string }[] }) {
  return (
    <div className="profilo-conti">
      <p className="profilo-conti__titolo">{titolo}</p>
      <dl className="profilo-conti__voci">
        {voci.map((v) => (
          <div key={v.etichetta} className="profilo-conti__voce">
            <dt>{v.etichetta}</dt>
            <dd className="u-tabnum">{v.valore}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function Attesa() {
  return <div className="profilo-conti__attesa scheletro" aria-hidden="true" />
}

function ContiWordle() {
  const { dati: stats } = useDati<PlayerStats>('/wordle/stats')
  const { dati: libera } = useDati<WordleLiberaRisposta>('/wordle/libera')
  return (
    <div className="profilo-sheet">
      {!stats ? (
        <Attesa />
      ) : stats.played === 0 && stats.assistScore === 0 ? (
        <p className="profilo__testo">Nessuna classificata, per ora: le cinque parole di oggi ti aspettano.</p>
      ) : (
        // Gli assist bastano a riempire il pannello: chi ha giocato solo in
        // compagnia ha punti in classifica, e vederli qui a zero sarebbe una smentita.
        <StatsPanel stats={stats} />
      )}
      {libera && libera.statistiche.giocate > 0 && (
        <Conti
          titolo="Parole libere"
          voci={[
            { etichetta: 'Giocate', valore: formatNumber(libera.statistiche.giocate) },
            { etichetta: 'Indovinate', valore: formatNumber(libera.statistiche.vinte) },
            { etichetta: 'Di fila', valore: formatNumber(libera.statistiche.serie) },
          ]}
        />
      )}
    </div>
  )
}

function ContiScarabeo() {
  const { dati } = useDati<ScarabeoLeaderboard>('/leaderboard/scarabeo?scope=all')
  const { dati: libera } = useDati<StatisticheScarabeoLibero>('/scarabeo/libera')
  const me = dati?.me
  return (
    <div className="profilo-sheet">
      {!dati ? (
        <Attesa />
      ) : (
        <Conti
          titolo="Classificate"
          voci={[
            { etichetta: 'Punti in classifica', valore: formatNumber(me?.punti ?? 0) },
            { etichetta: 'Giornate', valore: formatNumber(me?.giornate ?? 0) },
            { etichetta: 'Giornata migliore', valore: `${formatNumber(me?.migliore ?? 0)} sul tabellone` },
            { etichetta: 'Posizione', valore: me ? `${me.rank}º` : '—' },
          ]}
        />
      )}
      {libera && libera.giocate > 0 && (
        <Conti
          titolo="Contro il computer"
          voci={[
            { etichetta: 'Partite', valore: formatNumber(libera.giocate) },
            { etichetta: 'Vinte', valore: formatNumber(libera.vinte) },
            { etichetta: 'Perse', valore: formatNumber(libera.perse) },
            { etichetta: 'Miglior punteggio', valore: formatNumber(libera.migliore) },
          ]}
        />
      )}
    </div>
  )
}

function ContiCruciverba() {
  const { dati } = useDati<CruciverbaLeaderboard>('/leaderboard/cruciverba?scope=all')
  const { dati: libera } = useDati<CruciverbaLiberaRisposta>('/cruciverba/libera')
  const me = dati?.me
  return (
    <div className="profilo-sheet">
      {!dati ? (
        <Attesa />
      ) : (
        <Conti
          titolo="Classificate"
          voci={[
            { etichetta: 'Punti in classifica', valore: formatNumber(me?.punti ?? 0) },
            { etichetta: 'Schemi completati', valore: formatNumber(me?.giornate ?? 0) },
            {
              etichetta: 'Tempo medio',
              valore: me && me.giornate > 0 ? formatDuration(me.tempoMs / me.giornate) : '—',
            },
            { etichetta: 'Posizione', valore: me ? `${me.rank}º` : '—' },
          ]}
        />
      )}
      {libera && libera.completate > 0 && (
        <Conti
          titolo="Schemi liberi"
          voci={[{ etichetta: 'Completati', valore: formatNumber(libera.completate) }]}
        />
      )}
    </div>
  )
}

function ContiBattaglia() {
  const { dati } = useDati<BattagliaLeaderboard>('/leaderboard/battaglia?scope=all')
  const { dati: lobby } = useDati<LobbyBattaglia>('/battaglia/lobby')
  const me = dati?.me
  const computer = lobby ? Object.values(lobby.controComputer) : []
  const vinteComputer = computer.reduce((n, r) => n + r.vinte, 0)
  const perseComputer = computer.reduce((n, r) => n + r.perse, 0)
  return (
    <div className="profilo-sheet">
      {!dati ? (
        <Attesa />
      ) : (
        <Conti
          titolo="Classificate"
          voci={[
            { etichetta: 'Punti in classifica', valore: formatNumber(me?.punti ?? 0) },
            { etichetta: 'Battaglie', valore: formatNumber(me?.giornate ?? 0) },
            { etichetta: 'Vinte', valore: formatNumber(me?.vinte ?? 0) },
            { etichetta: 'Posizione', valore: me ? `${me.rank}º` : '—' },
          ]}
        />
      )}
      {lobby && vinteComputer + perseComputer + lobby.vinte + lobby.perse > 0 && (
        <Conti
          titolo="Partite libere"
          voci={[
            { etichetta: 'Contro il computer', valore: `${vinteComputer} vinte, ${perseComputer} perse` },
            { etichetta: 'Contro gli amici', valore: `${lobby.vinte} vinte, ${lobby.perse} perse` },
          ]}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────  Fonti  ───────────────────────────── */

/** Da dove vengono le parole: le licenze lo chiedono, e chi gioca ha diritto di saperlo. */
function Fonti() {
  return (
    <div className="profilo-fonti">
      <p>
        <strong>Wordle.</strong> Le parole vengono da{' '}
        <a href="https://github.com/napolux/paroleitaliane" target="_blank" rel="noreferrer">
          napolux/paroleitaliane
        </a>{' '}
        (MIT), scelte per frequenza d’uso con{' '}
        <a href="https://github.com/hermitdave/FrequencyWords" target="_blank" rel="noreferrer">
          hermitdave/FrequencyWords
        </a>{' '}
        (MIT, dai sottotitoli di OpenSubtitles 2018).
      </p>
      <p>
        <strong>Scarabeo.</strong> Il dizionario è l’elenco di forme italiane di napolux/paroleitaliane
        (MIT), senza nomi propri né parolacce, e senza accenti: sul tabellone non ci sono tessere
        accentate, quindi «città» si gioca CITTA.
      </p>
      <p>
        <strong>Cruciverba.</strong> Le definizioni sono del{' '}
        <a href="https://it.wiktionary.org" target="_blank" rel="noreferrer">
          Wikizionario
        </a>
        , estratte da{' '}
        <a href="https://kaikki.org/itwiktionary/" target="_blank" rel="noreferrer">
          kaikki.org
        </a>
        , sotto licenza{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.it" target="_blank" rel="noreferrer">
          CC BY-SA 4.0
        </a>
        : sono accorciate, non riscritte, e a schema finito ognuna porta alla sua voce.
      </p>
    </div>
  )
}
