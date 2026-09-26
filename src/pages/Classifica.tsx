import { useState, type ReactNode } from 'react'
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE, SLUG, giocoDaSlug } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Copertina } from '@/components/Copertina'
import { Etichetta, Numero, Vuoto } from '@/components/Elementi'
import { IconFlame, IconPeople, IconTrophy } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Sheet } from '@/components/Sheet'
import { percorsoClassifica, type ChiaveClassifica } from '@/games/classifiche'
import { usePlayer } from '@/lib/auth'
import { useDati } from '@/lib/dati'
import { formatDuration, formatNumber, formatPercent } from '@/lib/format'
import type {
  BattagliaLeaderboard,
  CruciverbaLeaderboard,
  GeneraleLeaderboard,
  GiocoClassificato,
  LeaderboardResponse,
  LeaderboardScope,
  ScarabeoLeaderboard,
} from '@shared/types'
import './Classifica.css'

/**
 * Le classifiche: la generale, che somma le classificate di tutti i giochi, e
 * quella di ogni gioco.
 *
 * Si possono sommare perché ogni classificata vale al massimo cento punti
 * (vedi shared/punti.ts); ogni gioco tiene comunque la sua, con i suoi
 * spareggi, perché chi gioca solo al cruciverba vuole sapere come va lì.
 *
 * Quale classifica lo dice l'indirizzo — /classifica, /classifica/scarabeo —
 * così la si puo' linkare, ed e' quel che fanno le schermate di fine partita.
 */

const SCHEDE: { chiave: ChiaveClassifica; nome: string }[] = [
  { chiave: 'generale', nome: 'Generale' },
  { chiave: 'wordle', nome: 'Wordle' },
  { chiave: 'scarabeo', nome: 'Scarabeo' },
  { chiave: 'cruciverba', nome: 'Cruciverba' },
  { chiave: 'battaglia', nome: 'Battaglia' },
]

const PERIODI: { value: LeaderboardScope; label: string }[] = [
  { value: 'today', label: 'Oggi' },
  { value: 'week', label: 'Settimana' },
  { value: 'month', label: 'Mese' },
  { value: 'all', label: 'Sempre' },
]

const LEDE: Record<ChiaveClassifica, string> = {
  generale: 'Tutte le classificate insieme: ognuna vale fino a cento punti.',
  wordle: 'Una parola al giorno: cento punti al primo tentativo, cinquanta al sesto.',
  scarabeo: 'Il tuo punteggio contro quello del computer, con le stesse tessere.',
  cruciverba: 'Cento punti a chi lo completa senza aiuti.',
  battaglia: 'La battaglia del giorno contro il computer: meno colpi, più punti.',
}

function periodoDa(valore: string | null): LeaderboardScope {
  return PERIODI.find((p) => p.value === valore)?.value ?? 'today'
}

export default function Classifica() {
  const { gioco: slug } = useParams()
  const [query] = useSearchParams()
  const { pathname } = useLocation()

  // I vecchi link: /classifica?gioco=scarabeo.
  const vecchio = query.get('gioco')
  if (vecchio && pathname === '/classifica') {
    const g = (Object.keys(SLUG) as GiocoClassificato[]).find((k) => k === vecchio)
    return <Navigate to={g ? ROTTE.classifica(g) : ROTTE.classifica()} replace />
  }

  const chiave: ChiaveClassifica = slug ? (giocoDaSlug(slug) ?? 'generale') : 'generale'
  return <Tabella chiave={chiave} periodo={periodoDa(query.get('periodo'))} />
}

function Tabella({ chiave, periodo }: { chiave: ChiaveClassifica; periodo: LeaderboardScope }) {
  const { vai } = useNavigazione()
  const me = usePlayer()
  const { dati, errore, ricarica } = useDati<Risposta>(percorsoClassifica(chiave, periodo))
  const [aperta, setAperta] = useState<Voce | null>(null)

  const vaiA = (nuova: ChiaveClassifica, nuovoPeriodo: LeaderboardScope) => {
    const base = ROTTE.classifica(nuova)
    vai(nuovoPeriodo === 'today' ? base : `${base}?periodo=${nuovoPeriodo}`, { replace: true, direzione: 'nessuna' })
  }

  const voci = dati ? vociDi(chiave, dati, periodo) : null
  const mia = dati?.me ? vociDi(chiave, { ...dati, rows: [dati.me] } as Risposta, periodo)[0] : null
  // Il podio e' per chi ha fatto punti: una partita appena aperta vale zero, e
  // metterla sul gradino sembrerebbe un errore.
  const conPunti = voci ? voci.filter((v) => v.punti > 0).length : 0
  const podio = voci && conPunti >= 2 ? voci.slice(0, Math.min(3, conPunti)) : []
  const resto = voci ? voci.slice(podio.length) : []
  const fuori = mia && voci && !voci.some((v) => v.playerId === mia.playerId) ? mia : null

  return (
    <Pagina titolo="Classifica" sotto={LEDE[chiave]}>
      <div className="cl-schede" role="tablist" aria-label="Quale classifica">
        {SCHEDE.map((s) => (
          <button
            key={s.chiave}
            type="button"
            role="tab"
            aria-selected={s.chiave === chiave}
            className={`cl-scheda${s.chiave === chiave ? ' is-attiva' : ''}`}
            onClick={() => vaiA(s.chiave, periodo)}
          >
            <Copertina gioco={s.chiave} formato="icona" />
            {s.nome}
          </button>
        ))}
      </div>

      <SegmentedControl
        ariaLabel="Periodo"
        options={PERIODI}
        value={periodo}
        onChange={(p) => vaiA(chiave, p)}
      />

      {errore && !dati ? (
        <Vuoto
          titolo="La classifica non si è caricata"
          testo={errore}
          azione={
            <Button variant="tinted" onClick={() => void ricarica()}>
              Riprova
            </Button>
          }
        />
      ) : !voci ? (
        <ul className="cl-scheletro" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="scheletro" />
          ))}
        </ul>
      ) : voci.length === 0 ? (
        <Vuoto
          icona={<IconTrophy size={28} />}
          titolo={periodo === 'today' ? 'Nessuno ha ancora giocato oggi' : 'Ancora nessuna partita'}
          testo={periodo === 'today' ? 'Puoi essere il primo.' : 'In questo periodo non ha giocato nessuno.'}
        />
      ) : (
        <div className="cl" key={`${chiave}-${periodo}`}>
          {podio.length > 0 && <Podio voci={podio} meId={me.id} onApri={setAperta} />}

          {resto.length > 0 && (
            <ol className="cl-elenco">
              {resto.map((v, i) => (
                <RigaVoce key={v.playerId} voce={v} io={v.playerId === me.id} indice={i} onApri={setAperta} />
              ))}
            </ol>
          )}

          {fuori && (
            <>
              <p className="cl-divisore">La tua posizione</p>
              <ol className="cl-elenco">
                <RigaVoce voce={fuori} io indice={0} onApri={setAperta} />
              </ol>
            </>
          )}
        </div>
      )}

      <Sheet open={aperta !== null} onClose={() => setAperta(null)} title={aperta?.displayName}>
        {aperta && <Dettaglio voce={aperta} />}
      </Sheet>
    </Pagina>
  )
}

/* ─────────────────────────────  Podio e righe  ───────────────────────────── */

/** Il primo al centro e più in alto, come sul podio vero. */
function Podio({ voci, meId, onApri }: { voci: Voce[]; meId: string; onApri: (v: Voce) => void }) {
  const [primo, secondo, terzo] = voci
  const ordine = [secondo, primo, terzo].filter(Boolean)
  return (
    <div className="cl-podio">
      {ordine.map((v) => (
        <button
          key={v.playerId}
          type="button"
          className={`cl-podio__posto cl-podio__posto--${v.rank}${v.playerId === meId ? ' is-io' : ''}`}
          onClick={() => onApri(v)}
        >
          <Avatar
            nickname={v.nickname}
            color={v.avatarColor}
            size={v.rank === 1 ? 68 : 54}
            medal={(v.rank <= 3 ? v.rank : null) as 1 | 2 | 3 | null}
          />
          <span className="cl-podio__nome">{v.displayName}</span>
          <span className="cl-podio__punti">
            <Numero valore={v.punti} />
          </span>
          <span className="cl-podio__breve">{v.breve}</span>
          <span className="cl-podio__gradino" aria-hidden="true">
            {v.rank}
          </span>
        </button>
      ))}
    </div>
  )
}

function RigaVoce({
  voce,
  io,
  indice,
  onApri,
}: {
  voce: Voce
  io: boolean
  indice: number
  onApri: (v: Voce) => void
}) {
  return (
    <li className={`cl-riga${io ? ' is-io' : ''}`} style={{ animationDelay: `${Math.min(indice, 10) * 30}ms` }}>
      <button type="button" className="cl-riga__tocca" onClick={() => onApri(voce)}>
        <span className="cl-riga__rank u-tabnum">{voce.rank}</span>
        <Avatar nickname={voce.nickname} color={voce.avatarColor} size={38} />
        <span className="cl-riga__chi">
          <span className="cl-riga__nome">
            {voce.displayName}
            {io && <span className="cl-tu">tu</span>}
          </span>
          <span className="cl-riga__sotto">{voce.sotto}</span>
        </span>
        {voce.segni}
        <span className="cl-riga__punti u-tabnum">{formatNumber(voce.punti)}</span>
      </button>
    </li>
  )
}

function Dettaglio({ voce }: { voce: Voce }) {
  return (
    <div className="cl-dettaglio">
      <div className="cl-dettaglio__testa">
        <Avatar nickname={voce.nickname} color={voce.avatarColor} size={56} />
        <div>
          <p className="cl-dettaglio__punti u-tabnum">{formatNumber(voce.punti)} punti</p>
          <p className="cl-dettaglio__rank">{voce.rank}º in classifica</p>
        </div>
      </div>
      <dl className="cl-dettaglio__voci">
        {voce.dettaglio.map((d) => (
          <div key={d.etichetta} className={`cl-dettaglio__voce${d.forte ? ' is-forte' : ''}`}>
            <dt>{d.etichetta}</dt>
            <dd className="u-tabnum">{d.valore}</dd>
          </div>
        ))}
      </dl>
      {voce.nota && <p className="cl-dettaglio__nota">{voce.nota}</p>}
    </div>
  )
}

/* ─────────────────────────────  Le righe di ogni gioco  ───────────────────────────── */

type Risposta =
  | GeneraleLeaderboard
  | LeaderboardResponse
  | ScarabeoLeaderboard
  | CruciverbaLeaderboard
  | BattagliaLeaderboard

/** Una riga di qualunque classifica, pronta da mostrare: ogni gioco dice le sue cose a modo suo. */
interface Voce {
  rank: number
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
  /** Sotto il nome, nell'elenco. */
  sotto: string
  /** Sotto i punti, nel podio: c'e' un terzo della larghezza. */
  breve: string
  /** A destra del nome: la serie, gli assist, "in corso". */
  segni?: ReactNode
  dettaglio: { etichetta: string; valore: string; forte?: boolean }[]
  nota?: string
}

const NOMI_GIOCHI: Record<GiocoClassificato, string> = {
  wordle: 'Wordle',
  scarabeo: 'Scarabeo',
  cruciverba: 'Cruciverba',
  battaglia: 'Battaglia navale',
}

const partite = (n: number) => `${formatNumber(n)} ${n === 1 ? 'partita' : 'partite'}`
const giornate = (n: number) => `${formatNumber(n)} ${n === 1 ? 'giornata' : 'giornate'}`

function vociDi(chiave: ChiaveClassifica, risposta: Risposta, periodo: LeaderboardScope): Voce[] {
  const oggi = periodo === 'today'
  switch (chiave) {
    case 'generale':
      return (risposta as GeneraleLeaderboard).rows.map((r) => {
        const giochi = (Object.keys(NOMI_GIOCHI) as GiocoClassificato[]).filter((g) => r.perGioco[g] > 0)
        return {
          ...r,
          sotto:
            giochi.length > 0
              ? giochi.map((g) => `${NOMI_GIOCHI[g].split(' ')[0]} ${r.perGioco[g]}`).join(' · ')
              : 'In corso',
          breve: partite(r.partite),
          segni:
            r.assist > 0 ? (
              <span className="cl-segno" title={`${r.assist} punti in compagnia`}>
                <IconPeople size={13} />
                {r.assist}
              </span>
            ) : undefined,
          dettaglio: [
            ...(Object.keys(NOMI_GIOCHI) as GiocoClassificato[]).map((g) => ({
              etichetta: NOMI_GIOCHI[g],
              valore: formatNumber(r.perGioco[g]),
            })),
            { etichetta: 'Totale', valore: formatNumber(r.punti), forte: true },
            { etichetta: 'Di cui in compagnia', valore: formatNumber(r.assist) },
            { etichetta: 'Partite classificate', valore: formatNumber(r.partite) },
          ],
          nota: 'A pari punti passa avanti chi ne ha fatti meno giocando il Wordle in compagnia, poi chi ci è arrivato con meno partite.',
        }
      })

    case 'wordle':
      return (risposta as LeaderboardResponse).rows.map((r) => ({
        ...r,
        punti: r.score,
        sotto: descriviWordle(r, oggi),
        breve: oggi ? descriviWordleBreve(r) : partite(r.played),
        segni: (
          <>
            {r.assistScore > 0 && (
              <span className="cl-segno" title={`${r.assistScore} punti in compagnia`}>
                <IconPeople size={13} />
                {r.assistScore}
              </span>
            )}
            {r.currentStreak >= 2 && (
              <span className="cl-segno cl-segno--serie" title={`${r.currentStreak} giorni di fila`}>
                <IconFlame size={13} />
                {r.currentStreak}
              </span>
            )}
          </>
        ),
        dettaglio: [
          { etichetta: 'Punti giocando da sé', valore: formatNumber(r.playScore) },
          { etichetta: 'Punti in compagnia', valore: formatNumber(r.assistScore) },
          { etichetta: 'Totale', valore: formatNumber(r.score), forte: true },
          { etichetta: 'Giornate giocate', valore: formatNumber(r.played) },
          ...(r.played > 0 ? [{ etichetta: 'Parole del giorno indovinate', valore: formatPercent(r.wins / r.played) }] : []),
          ...(r.avgAttempts !== null ? [{ etichetta: 'Media tentativi', valore: r.avgAttempts.toFixed(1) }] : []),
          { etichetta: 'Serie attuale', valore: formatNumber(r.currentStreak) },
        ],
        nota:
          r.assists > 0
            ? `${giornate(r.assists)} in compagnia, allo stesso punteggio di chi ospitava. A pari totale passa avanti chi ne ha fatti meno in compagnia.`
            : 'Una giornata giocata in compagnia vale come una giocata da soli. A pari totale passa avanti chi ne ha fatti meno in compagnia.',
      }))

    case 'scarabeo':
      return (risposta as ScarabeoLeaderboard).rows.map((r) => ({
        ...r,
        sotto: oggi
          ? r.inCorso
            ? `In corso · ${formatNumber(r.punteggio)} sul tabellone`
            : `${formatNumber(r.punteggio)} sul tabellone`
          : `${giornate(r.giornate)} · migliore ${formatNumber(r.migliore)}`,
        breve: oggi ? `${formatNumber(r.punteggio)} sul tabellone` : giornate(r.giornate),
        segni: r.inCorso ? <Etichetta tono="arancio">in corso</Etichetta> : undefined,
        dettaglio: [
          { etichetta: 'Punti in classifica', valore: formatNumber(r.punti), forte: true },
          { etichetta: 'Punteggio sul tabellone', valore: formatNumber(r.punteggio) },
          { etichetta: 'Giornate', valore: formatNumber(r.giornate) },
          { etichetta: 'Giornata migliore', valore: formatNumber(r.migliore) },
        ],
        nota: 'Pareggiare il computer, che gioca le stesse tessere, vale cento punti. A pari punti conta il punteggio sul tabellone.',
      }))

    case 'cruciverba':
      return (risposta as CruciverbaLeaderboard).rows.map((r) => ({
        ...r,
        sotto: r.inCorso && r.giornate === 0 ? 'In corso' : `${r.giornate} completati · ${formatDuration(r.tempoMs)}`,
        breve: r.giornate > 0 ? formatDuration(r.tempoMs) : 'in corso',
        segni: r.inCorso ? <Etichetta tono="arancio">in corso</Etichetta> : undefined,
        dettaglio: [
          { etichetta: 'Punti', valore: formatNumber(r.punti), forte: true },
          { etichetta: 'Schemi completati', valore: formatNumber(r.giornate) },
          { etichetta: 'Tempo', valore: formatDuration(r.tempoMs) },
        ],
        nota: 'Tre punti in meno per ogni lettera svelata, uno per ogni errore trovato da un controllo. A pari punti passa avanti chi ci ha messo meno.',
      }))

    case 'battaglia':
      return (risposta as BattagliaLeaderboard).rows.map((r) => ({
        ...r,
        sotto: r.inCorso
          ? 'In corso'
          : `${r.vinte} ${r.vinte === 1 ? 'vinta' : 'vinte'} su ${r.giornate}${r.vinte > 0 ? ` · ${r.colpi} colpi` : ''}`,
        breve: r.inCorso ? 'in corso' : `${r.vinte}/${r.giornate} vinte`,
        segni: r.inCorso ? <Etichetta tono="arancio">in corso</Etichetta> : undefined,
        dettaglio: [
          { etichetta: 'Punti', valore: formatNumber(r.punti), forte: true },
          { etichetta: 'Battaglie', valore: formatNumber(r.giornate) },
          { etichetta: 'Vinte', valore: formatNumber(r.vinte) },
          { etichetta: 'Colpi nelle vittorie', valore: formatNumber(r.colpi) },
        ],
        nota: 'Vincendo, cento punti meno uno ogni due colpi in acqua; perdendo, tre per ogni casella colpita. A pari punti passa avanti chi ha sparato meno.',
      }))
  }
}

function descriviWordle(r: LeaderboardResponse['rows'][number], oggi: boolean): string {
  if (oggi) {
    // In compagnia i tentativi sono dell'host: si dice dove sta giocando.
    if (r.todaySpectated) {
      if (r.todayStatus === 'won') return 'Indovinata in compagnia'
      if (r.todayStatus === 'lost') return 'Non indovinata, in compagnia'
      return 'Sta giocando in compagnia'
    }
    if (r.todayStatus === 'won') return `Indovinata al ${r.todayAttempts}º tentativo`
    if (r.todayStatus === 'lost') return 'Non indovinata'
    if (r.todayStatus === 'playing') return r.todayAttempts ? `In corso · ${r.todayAttempts} tentativi` : 'Ha appena iniziato'
    return 'Non ha ancora giocato'
  }
  const pezzi = [partite(r.played)]
  if (r.played > 0) pezzi.push(`${formatPercent(r.wins / r.played)} vinte`)
  if (r.avgAttempts !== null) pezzi.push(`media ${r.avgAttempts.toFixed(1)}`)
  return pezzi.join(' · ')
}

function descriviWordleBreve(r: LeaderboardResponse['rows'][number]): string {
  if (r.todaySpectated) return 'in compagnia'
  if (r.todayStatus === 'won') return `${r.todayAttempts} ${r.todayAttempts === 1 ? 'tentativo' : 'tentativi'}`
  if (r.todayStatus === 'lost') return 'non indovinata'
  if (r.todayStatus === 'playing') return 'in corso'
  return '—'
}
