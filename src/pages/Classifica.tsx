import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { SegmentedControl } from '@/components/SegmentedControl'
import { ThemeButton } from '@/components/ThemeButton'
import { IconFlame, IconPeople } from '@/components/Icons'
import { ClassificaScarabeo } from './ClassificaScarabeo'
import { ClassificaCruciverba } from './ClassificaCruciverba'
import { ClassificaBattaglia } from './ClassificaBattaglia'
import { ApiFetchError, api } from '@/lib/api'
import { usePlayer } from '@/lib/auth'
import { formatNumber, formatPercent, pluralize } from '@/lib/format'
import type { LeaderboardResponse, LeaderboardRow, LeaderboardScope } from '@shared/types'
import './Classifica.css'

/**
 * Quale gioco. Una classifica per gioco e non una sola: vedi ClassificaScarabeo
 * — i punti dei giochi non sono commensurabili, e sommarli richiederebbe un
 * tasso di cambio inventato.
 */
type Gioco = 'wordle' | 'scarabeo' | 'cruciverba' | 'battaglia'
const GIOCHI: { value: Gioco; label: string }[] = [
  { value: 'wordle', label: 'Wordle' },
  { value: 'scarabeo', label: 'Scarabeo' },
  { value: 'cruciverba', label: 'Cruciverba' },
  { value: 'battaglia', label: 'Battaglia' },
]

const LEDE: Record<Gioco, string> = {
  wordle:
    "Cinque parole al giorno: la prima vale piena, le altre a scalare. Tocca una riga per vedere com'è fatto un punteggio.",
  scarabeo: 'Dieci mosse al giorno con le stesse tessere per tutti. Vince chi le sfrutta meglio.',
  cruciverba:
    'Cento punti a chi lo completa senza aiuti. A parità di punti passa avanti chi ci ha messo meno.',
  battaglia: 'Le battaglie vinte contro i colleghi. A parità di vittorie, passa avanti chi ne ha perse meno.',
}

function giocoDa(valore: string | null): Gioco {
  return GIOCHI.find((g) => g.value === valore)?.value ?? 'wordle'
}

/** Il periodo "month" esiste nell'API ma qui tre voci bastano e stanno larghe. */
const SCOPES: { value: LeaderboardScope; label: string }[] = [
  { value: 'today', label: 'Oggi' },
  { value: 'week', label: 'Settimana' },
  { value: 'all', label: 'Sempre' },
]

export default function Classifica() {
  const me = usePlayer()
  const [query, setQuery] = useSearchParams()
  const [gioco, setGioco] = useState<Gioco>(giocoDa(query.get('gioco')))
  const [scope, setScope] = useState<LeaderboardScope>('today')
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /*
   * Il totale e' quello che si guarda; la divisione fra punti partita e assist
   * la si va a cercare, e serve solo per capire uno spareggio. Sta quindi
   * dietro un tocco, una riga per volta.
   */
  const [aperta, setAperta] = useState<string | null>(null)

  const apri = useCallback((playerId: string) => {
    setAperta((corrente) => (corrente === playerId ? null : playerId))
  }, [])

  const load = useCallback(
    async (which: LeaderboardScope) => {
      setLoading(true)
      setError(null)
      try {
        setData(await api<LeaderboardResponse>(`/leaderboard?scope=${which}`))
      } catch (err) {
        setError(
          err instanceof ApiFetchError ? err.message : 'Non riesco a caricare la classifica.',
        )
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (gioco !== 'wordle') return
    void load(scope)
    // Cambiando periodo cambiano i numeri: tenere aperto un dettaglio di prima
    // mostrerebbe la divisione di un totale che non c'e' piu'.
    setAperta(null)
  }, [gioco, load, scope])

  const rows = data?.rows ?? []
  const podium = rows.slice(0, 3)
  const rest = rows.slice(3)
  // Se il giocatore e' fuori dalle prime posizioni gli si mostra comunque la sua riga.
  const meOutside = data?.me && data.me.rank > 3 ? data.me : null

  return (
    <AppShell title="Classifica" trailing={<ThemeButton />}>
      <header>
        <h2 className="large-title">Classifica</h2>
        <p className="page-lede">{LEDE[gioco]}</p>
      </header>

      <SegmentedControl
        ariaLabel="Gioco"
        options={GIOCHI}
        value={gioco}
        onChange={(scelto) => {
          setGioco(scelto)
          // L'indirizzo segue la scelta: così la classifica di un gioco si puo'
          // linkare, ed e' quel che fa la schermata del gioco a fine giornata.
          setQuery(scelto === 'wordle' ? {} : { gioco: scelto }, { replace: true })
        }}
      />

      <SegmentedControl
        ariaLabel="Periodo della classifica"
        options={SCOPES}
        value={scope}
        onChange={setScope}
      />

      {gioco === 'scarabeo' ? (
        <ClassificaScarabeo scope={scope} meId={me.id} />
      ) : gioco === 'cruciverba' ? (
        <ClassificaCruciverba scope={scope} meId={me.id} />
      ) : gioco === 'battaglia' ? (
        <ClassificaBattaglia scope={scope} meId={me.id} />
      ) : error ? (
        <div className="lb__fallback">
          <p>{error}</p>
          <Button variant="tinted" onClick={() => void load(scope)}>
            Riprova
          </Button>
        </div>
      ) : loading && !data ? (
        <ul className="lb__skeleton" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className="lb__fallback">
          <p>
            {scope === 'today'
              ? 'Nessuno ha ancora giocato oggi. Puoi essere il primo.'
              : 'Ancora nessuna partita in questo periodo.'}
          </p>
        </div>
      ) : (
        <>
          {podium.length >= 2 && (
            <Podium rows={podium} meId={me.id} scope={scope} aperta={aperta} onApri={apri} />
          )}

          <ol className="lb__list">
            {(podium.length >= 2 ? rest : rows).map((row) => (
              <Row
                key={row.playerId}
                row={row}
                scope={scope}
                isMe={row.playerId === me.id}
                aperta={aperta === row.playerId}
                onApri={apri}
              />
            ))}
          </ol>

          {meOutside && !rest.some((r) => r.playerId === me.id) && (
            <>
              <p className="lb__divider">La tua posizione</p>
              <ol className="lb__list">
                <Row
                  row={meOutside}
                  scope={scope}
                  isMe
                  aperta={aperta === meOutside.playerId}
                  onApri={apri}
                />
              </ol>
            </>
          )}
        </>
      )}
    </AppShell>
  )
}

/**
 * Podio: il primo al centro e più alto, come sul podio vero.
 * Con meno di due giocatori non ha senso e si mostra solo l'elenco.
 */
function Podium({
  rows,
  meId,
  scope,
  aperta,
  onApri,
}: {
  rows: LeaderboardRow[]
  meId: string
  scope: LeaderboardScope
  aperta: string | null
  onApri: (playerId: string) => void
}) {
  const [first, second, third] = rows
  const order = [second, first, third].filter(Boolean)
  const scelta = rows.find((r) => r.playerId === aperta) ?? null

  return (
    <div className="podium">
      <div className="podium__gradini">
        {order.map((row) => (
          <button
            key={row.playerId}
            type="button"
            /*
             * Anche i primi tre si aprono, ma il dettaglio esce sotto il podio
             * invece che dentro la colonna: dentro sarebbero tre strisce di
             * numeri larghe un terzo di schermo, illeggibili.
             */
            className={`podium__slot podium__slot--${row.rank}${
              row.playerId === meId ? ' is-me' : ''
            }${row.playerId === aperta ? ' is-aperta' : ''}`}
            aria-expanded={row.playerId === aperta}
            onClick={() => onApri(row.playerId)}
          >
            <Avatar
              nickname={row.nickname}
              color={row.avatarColor}
              size={row.rank === 1 ? 64 : 52}
              medal={row.rank as 1 | 2 | 3}
            />
            <span className="podium__name">
              {row.displayName}
              {row.playerId === meId && <span className="lb__you">tu</span>}
            </span>
            <span className="podium__score u-tabnum">{formatNumber(row.score)}</span>
            {/* Le stesse informazioni delle righe sotto: senza, i primi tre
                risulterebbero piu' poveri di chi li segue. */}
            <span className="podium__detail">{describeShort(row, scope)}</span>
            <span className="podium__foot">
              <span className="podium__rank">{row.rank}º</span>
              {row.currentStreak >= 2 && (
                <span className="podium__streak" title={`${row.currentStreak} giorni di fila`}>
                  <IconFlame size={12} />
                  {row.currentStreak}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {scelta && (
        <Breakdown row={scelta} scope={scope} intestazione={`Punti di ${scelta.displayName}`} />
      )}
    </div>
  )
}

/**
 * Come e' fatto un punteggio: partita, assist, totale.
 *
 * E' la ragione per cui il totale viene diviso: fra due totali uguali passa
 * avanti chi ha più assist, e senza vedere i due numeri quello spareggio
 * sembrerebbe arbitrario.
 */
function Breakdown({
  row,
  scope,
  intestazione,
}: {
  row: LeaderboardRow
  scope: LeaderboardScope
  intestazione?: string
}) {
  return (
    <div className="lb__dettaglio">
      {intestazione && <p className="lb__dettaglio-titolo">{intestazione}</p>}
      <dl className="lb__voci">
        <div className="lb__voce">
          <dt>Punti partita</dt>
          <dd className="u-tabnum">{formatNumber(row.playScore)}</dd>
        </div>
        <div className="lb__voce">
          <dt>
            <IconPeople size={13} />
            In compagnia
          </dt>
          <dd className="u-tabnum">{formatNumber(row.assistScore)}</dd>
        </div>
        <div className="lb__voce lb__voce--totale">
          <dt>Totale</dt>
          <dd className="u-tabnum">{formatNumber(row.score)}</dd>
        </div>
      </dl>
      <p className="lb__dettaglio-nota">{explainAssist(row, scope)}</p>
    </div>
  )
}

/**
 * La riga di spiegazione sotto la divisione.
 *
 * `todaySpectated` racconta solo la giornata di oggi, quindi si cita solo
 * nella vista di oggi: nella settimana spiegherebbe uno zero che nel totale
 * settimanale non c'e'.
 */
function explainAssist(row: LeaderboardRow, scope: LeaderboardScope): string {
  const oggiInsieme = scope === 'today' && row.todaySpectated === true

  if (row.assists === 0) {
    return oggiInsieme
      ? 'Oggi sta giocando la parola nella stanza di chi l’ha invitata: prenderà lo stesso punteggio.'
      : 'Una parola giocata in compagnia vale come una giocata da soli, e finisce qui.'
  }

  const quante = `${formatNumber(row.assists)} ${pluralize(row.assists, 'giornata giocata', 'giornate giocate')} in compagnia`
  const coda = oggiInsieme ? ' Anche quella di oggi.' : ''
  // Senza pronome: "le ospitava" non concorda con una giornata sola.
  return `${quante}, allo stesso punteggio di chi ospitava.${coda}`
}

function Row({
  row,
  scope,
  isMe,
  aperta,
  onApri,
}: {
  row: LeaderboardRow
  scope: LeaderboardScope
  isMe: boolean
  aperta: boolean
  onApri: (playerId: string) => void
}) {
  return (
    <li className={`lb__riga${isMe ? ' is-me' : ''}${aperta ? ' is-aperta' : ''}`}>
      <button
        type="button"
        className="lb__row"
        aria-expanded={aperta}
        onClick={() => onApri(row.playerId)}
      >
        <span className="lb__rank u-tabnum">{row.rank}</span>
        <Avatar nickname={row.nickname} color={row.avatarColor} size={36} />
        <span className="lb__body">
          <span className="lb__name">
            {row.displayName}
            {isMe && <span className="lb__you">tu</span>}
          </span>
          <span className="lb__meta">{describe(row, scope)}</span>
        </span>
        {/*
          Il pallino degli assist: dice che quel totale non viene solo dalle
          partite, ed e' l'unico invito a toccare la riga. Il numero preciso
          sta nel dettaglio, qui non ci starebbe senza togliere spazio al nome.
        */}
        {row.assistScore > 0 && (
          <span
            className="lb__assist"
            title={`${formatNumber(row.assistScore)} punti assist`}
            aria-label={`${formatNumber(row.assistScore)} punti assist`}
          >
            <IconPeople size={13} />
            {formatNumber(row.assistScore)}
          </span>
        )}
        {row.currentStreak >= 2 && (
          <span className="lb__streak" title={`${row.currentStreak} giorni di fila`}>
            <IconFlame size={14} />
            {row.currentStreak}
          </span>
        )}
        <span className="lb__score u-tabnum">{formatNumber(row.score)}</span>
      </button>

      {aperta && <Breakdown row={row} scope={scope} />}
    </li>
  )
}

/** Versione compatta del dettaglio: nel podio c'e' un terzo della larghezza. */
function describeShort(row: LeaderboardRow, scope: LeaderboardScope): string {
  if (scope === 'today') {
    if (row.todaySpectated) return 'in compagnia'
    if (row.todayStatus === 'won') {
      return `${row.todayAttempts} ${row.todayAttempts === 1 ? 'tentativo' : 'tentativi'}`
    }
    if (row.todayStatus === 'lost') return 'non indovinata'
    if (row.todayStatus === 'playing') return 'in corso'
    return '—'
  }
  return `${formatNumber(row.played)} ${row.played === 1 ? 'partita' : 'partite'}`
}

/** Riga di dettaglio sotto il nome: cambia con il periodo scelto. */
function describe(row: LeaderboardRow, scope: LeaderboardScope): string {
  if (scope === 'today') {
    /*
     * Chi gioca la giornata in compagnia non ha tentativi propri da mostrare:
     * quelli sono dell'host. Si dice dove sta giocando, che e' l'informazione
     * vera.
     */
    if (row.todaySpectated) {
      if (row.todayStatus === 'won') return 'Indovinata in compagnia'
      if (row.todayStatus === 'lost') return 'Non indovinata, in compagnia'
      return 'Sta giocando in compagnia'
    }
    if (row.todayStatus === 'won') return `Indovinata al ${row.todayAttempts}º tentativo`
    if (row.todayStatus === 'lost') return 'Non indovinata'
    if (row.todayStatus === 'playing') {
      return row.todayAttempts === 0
        ? 'Ha appena iniziato'
        : `In corso · ${row.todayAttempts} tentativi`
    }
    return 'Non ha ancora giocato'
  }

  const parts = [`${formatNumber(row.played)} ${row.played === 1 ? 'partita' : 'partite'}`]
  if (row.played > 0) parts.push(`${formatPercent(row.wins / row.played)} vinte`)
  if (row.avgAttempts !== null) parts.push(`media ${row.avgAttempts.toFixed(1)}`)
  return parts.join(' · ')
}
