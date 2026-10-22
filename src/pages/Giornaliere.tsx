import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { AvvisoATutti } from '@/components/AvvisoATutti'
import { Biglietto } from '@/components/Biglietto'
import { Sheet } from '@/components/Sheet'
import { Sezione } from '@/components/Elementi'
import { IconChevronRight, IconClock } from '@/components/Icons'
import { IconaGioco } from '@/components/IconaGioco'
import { Vetrina } from '@/components/Vetrina'
import { GIOCHI, type Gioco } from '@/games/catalog'
import { statiDiOggi, type StatoOggi } from '@/games/stato'
import { usePlayer } from '@/lib/auth'
import { useDati } from '@/lib/dati'
import { formatGameDate } from '@/lib/format'
import { suona } from '@/lib/suoni'
import { gameDate, msToNextPuzzle } from '@shared/daily'
import type { GiocoClassificato, OggiRisposta } from '@shared/types'
import './Giornaliere.css'

const OGGI_FRESCO_MS = 15_000

/** Di quanti gradi e' storto ogni adesivo: a mano, come li incollerebbe qualcuno. */
const STORTI = [-6, 5, -4, 6, -5, 4, -6, 5, -3, 6]

/**
 * Le Giornaliere, la scheda principale e quella che si apre per prima: le
 * classificate di oggi, che fanno la classifica. In cima il biglietto della
 * giornata — il podio di oggi e i timbri, uno per classificata fatta, che
 * riportano alla partita — e sotto le carte di quelle ancora da giocare, che
 * portano dritte alla partita di oggi. Quando non ne resta nessuna, la carta
 * di fine giornata.
 *
 * I dati arrivano con una richiesta sola (`/api/oggi`), e restano in memoria:
 * tornando qui dalla partita si vedono subito, e si aggiornano da soli. Per un
 * quarto di minuto non si richiedono (`OGGI_FRESCO_MS`): passando da una
 * scheda all'altra non e' cambiato niente, e una partita giocata li dimentica.
 */
export default function Giornaliere() {
  const player = usePlayer()
  const { dati: oggi } = useDati<OggiRisposta>('/oggi', { fresco: OGGI_FRESCO_MS })
  const stati = oggi ? statiDiOggi(oggi) : null
  const daFare = stati ? GIOCHI.filter((g) => stati[g.id].fase !== 'fatta') : GIOCHI
  const finita = stati !== null && daFare.length === 0
  const nuovi = useTimbriNuovi(oggi?.date ?? null, stati)
  const [riepilogo, setRiepilogo] = useState<GiocoClassificato | null>(null)
  const aperto = riepilogo && stati ? stati[riepilogo] : null

  return (
    <Vetrina
      scheda="giornaliere"
      titolo="Giornaliere"
      sopra={formatGameDate(oggi?.date ?? gameDate())}
      classifica={ROTTE.classifica()}
    >
      <AvvisoATutti annuncio={oggi?.annuncio} />
      <Giornata io={player.id} oggi={oggi ?? null} stati={stati} nuovi={nuovi} onRiepilogo={setRiepilogo} />

      {finita ? (
        <Finita punti={oggi?.generale.punti ?? 0} />
      ) : (
        <Sezione titolo="Da giocare oggi" conto={stati ? daFare.length : undefined}>
          <ul className="giornaliere__carte">
            {daFare.map((g, i) => (
              <li key={g.id} className="entra" style={{ '--n': i + 1 } as CSSProperties}>
                <CartaDaGiocare gioco={g} stato={stati?.[g.id] ?? null} />
              </li>
            ))}
          </ul>
        </Sezione>
      )}

      <Sheet open={aperto !== null} onClose={() => setRiepilogo(null)} title="Riepilogo">
        {riepilogo && aperto && <Riepilogo gioco={riepilogo} stato={aperto} onChiudi={() => setRiepilogo(null)} />}
      </Sheet>
    </Vetrina>
  )
}

/**
 * Il riepilogo di una classificata fatta, dal suo timbro: com'e' andata, i
 * punti, e da li' la partita per intero o la classifica. Si resta nelle
 * Giornaliere: il timbro e' un ricordo, non un'uscita.
 */
function Riepilogo({ gioco, stato, onChiudi }: { gioco: GiocoClassificato; stato: StatoOggi; onChiudi: () => void }) {
  const i = GIOCHI.findIndex((g) => g.id === gioco)
  const nome = GIOCHI[i]?.nome ?? gioco
  return (
    <div className="riepilogo">
      <div className="riepilogo__testa">
        <span className="album album--carta" aria-hidden="true">
          <IconaGioco gioco={gioco} lato={40} giro={STORTI[i]} />
          <span className="album__n">{numero(i)}</span>
        </span>
        <span className="riepilogo__chi">
          <span className="riepilogo__nome">{nome}</span>
          <span className="riepilogo__quando">Fatta oggi</span>
        </span>
        {stato.punti !== null && (
          <span className="riepilogo__punti u-tabnum" aria-label={`${stato.punti} punti`}>
            +{stato.punti}
          </span>
        )}
      </div>
      <dl className="riepilogo__righe">
        <div className="riepilogo__riga">
          <dt>Com'è andata</dt>
          <dd>{stato.titolo}</dd>
        </div>
        {stato.dettaglio && (
          <div className="riepilogo__riga">
            <dt>Nel dettaglio</dt>
            <dd>{stato.dettaglio}</dd>
          </div>
        )}
      </dl>
      <div className="riepilogo__tasti">
        <Collegamento to={stato.a} className="finita__tasto riepilogo__tasto" onClick={onChiudi}>
          Rivedi la partita
        </Collegamento>
        <Collegamento
          to={ROTTE.classifica(gioco)}
          stato={{ da: 'Giornaliere' }}
          className="finita__tasto riepilogo__tasto is-carta"
          onClick={onChiudi}
        >
          Classifica
        </Collegamento>
      </div>
    </div>
  )
}

/**
 * Il biglietto della giornata: il podio di oggi, e i timbri. Chi non e' sul
 * podio legge sotto dove sta; chi non ha ancora giocato, che si comincia.
 */
function Giornata({
  io,
  oggi,
  stati,
  nuovi,
  onRiepilogo,
}: {
  io: string
  oggi: OggiRisposta | null
  stati: Record<GiocoClassificato, StatoOggi> | null
  nuovi: Map<string, number>
  onRiepilogo: (gioco: GiocoClassificato) => void
}) {
  const fatte = stati ? GIOCHI.filter((g) => stati[g.id].fase === 'fatta').length : 0
  const generale = oggi?.generale ?? null
  const podio = generale?.podio ?? []
  return (
    <section aria-label="La tua giornata" className="eroe giornata">
      <Biglietto className="giornata__biglietto">
        <div className="giornata__dentro">
          <div className="giornata__testa">
            <span className="giornata__occhiello">La classifica di oggi</span>
            <Collegamento to={ROTTE.classifica()} stato={{ da: 'Giornaliere' }} className="giornata__tutti">
              {generale && generale.giocatori > 0 ? `Tutti e ${generale.giocatori}` : 'Classifica'}
              <IconChevronRight size={14} />
            </Collegamento>
          </div>

          <Podietto podio={podio} io={io} />

          {/* I propri punti si leggono sempre, anche dal podio: sono quel che si guarda per primo. */}
          {generale &&
            (fatte > 0 || generale.punti > 0 ? (
              <div className="giornata__punti">
                <span className="giornata__punti-n u-tabnum">{generale.punti}</span>
                <span className="giornata__punti-testo">
                  <span className="giornata__punti-cosa">{generale.punti === 1 ? 'punto oggi' : 'punti oggi'}</span>
                  {generale.posizione && (
                    <span className="giornata__punti-posto">
                      {generale.posizione}º su {generale.giocatori}
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <p className="giornata__io">Gioca la prima classificata e sali in classifica</p>
            ))}

          <div className="giornata__taglio" aria-hidden="true" />

          <div className="giornata__testa">
            <h2 className="giornata__titolo">I timbri di oggi</h2>
            <span className="giornata__titolo u-tabnum">
              {fatte}/{GIOCHI.length}
            </span>
          </div>
          <ul className="timbri">
            {GIOCHI.map((g, i) => {
              const stato = stati?.[g.id]
              const fatta = stato?.fase === 'fatta'
              return (
                <li key={g.id}>
                  {fatta && stato ? (
                    <button
                      type="button"
                      className={`album timbro${nuovi.has(g.id) ? ' is-nuovo' : ''}`}
                      aria-label={`${g.nome}: ${stato.titolo}. Il riepilogo`}
                      style={{ '--n': nuovi.get(g.id) ?? 0 } as CSSProperties}
                      onClick={() => onRiepilogo(g.id)}
                    >
                      <IconaGioco gioco={g.id} lato={30} giro={STORTI[i]} />
                      <span className="album__n">{numero(i)}</span>
                    </button>
                  ) : (
                    <span className="album" aria-label={`${g.nome}: da fare`}>
                      <IconaGioco gioco={g.id} lato={24} linea />
                      <span className="album__n">{numero(i)}</span>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="giornata__nota">
            {fatte > 0 ? 'Tocca un timbro per il riepilogo della partita' : 'Ogni classificata finita lascia il suo timbro'}
          </p>
        </div>
      </Biglietto>
    </section>
  )
}

const numero = (i: number) => String(i + 1).padStart(2, '0')

const ORDINE_PODIO = [1, 0, 2] as const

/** Il podio di oggi: il primo al centro e piu' in alto, con la corona. Vuoto, restano i gradini. */
function Podietto({ podio, io }: { podio: OggiRisposta['generale']['podio']; io: string }) {
  const nomi = podio.map((p, i) => `${i + 1}º ${p.displayName}, ${p.punti} punti`).join('; ')
  return (
    <div className="podietto" role="img" aria-label={podio.length > 0 ? `Il podio di oggi: ${nomi}` : 'Podio vuoto'}>
      {ORDINE_PODIO.map((i) => {
        const p = podio[i]
        return (
          <div
            key={i}
            className={`podietto__posto podietto__posto--${i + 1}${p?.playerId === io ? ' is-io' : ''}`}
            style={{ '--n': i } as CSSProperties}
          >
            <span className="podietto__faccina">
              {p ? (
                <Avatar nickname={p.nickname} color={p.avatarColor} size={40} />
              ) : (
                <span className="podietto__vuoto">?</span>
              )}
              {i === 0 && p && <Corona />}
            </span>
            <span className="podietto__nome">{p ? (p.playerId === io ? 'Tu' : p.displayName) : '—'}</span>
            <span className="podietto__punti u-tabnum">{p ? p.punti : ' '}</span>
            <span className="podietto__gradino">{i + 1}</span>
          </div>
        )
      })}
    </div>
  )
}

function Corona() {
  return (
    <svg className="podietto__corona" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
    </svg>
  )
}

/**
 * La carta di una classificata ancora da giocare, o in corso: l'adesivo del
 * gioco nel suo posto dell'album, il nome, e il tasto. Tutta la carta porta
 * alla partita di oggi, come il tasto: la classificata di tutti i giorni deve
 * stare a un tocco.
 */
function CartaDaGiocare({ gioco, stato }: { gioco: Gioco; stato: StatoOggi | null }) {
  const i = GIOCHI.findIndex((g) => g.id === gioco.id)
  const fase = stato?.fase ?? 'da-giocare'
  const inCorso = fase === 'in-corso'
  const pronta = fase !== 'non-pronta'
  const percento = Math.round((stato?.avanzamento ?? 0) * 100)
  return (
    <Collegamento
      to={stato?.a ?? ROTTE.classificata(gioco.id)}
      className={`carta-oggi is-${fase}`}
      style={{ '--carta-1': `var(--${gioco.id}-carta-1)`, '--carta-2': `var(--${gioco.id}-carta-2)` } as CSSProperties}
    >
      <span className="album album--carta">
        <IconaGioco gioco={gioco.id} lato={40} giro={STORTI[i]} fluttua={pronta} ritardo={i * 0.3} />
        <span className="album__n">{numero(i)}</span>
      </span>
      <span className="carta-oggi__testo">
        <span className="carta-oggi__nome">{gioco.nome}</span>
        {!stato ? (
          <span className="carta-oggi__motto scheletro scheletro--riga" />
        ) : inCorso ? (
          <>
            <span className="carta-oggi__barra" aria-hidden="true">
              <span style={{ width: `${Math.max(8, percento)}%` }} />
            </span>
            <span className="carta-oggi__motto">{stato.dettaglio || stato.titolo}</span>
          </>
        ) : (
          <span className="carta-oggi__motto">{pronta ? gioco.motto : stato.titolo}</span>
        )}
      </span>
      {stato && (
        <span className={`carta-oggi__tasto${inCorso ? ' is-corso' : ''}${pronta ? '' : ' is-spento'}`}>
          {inCorso ? `${percento}%` : pronta ? 'Gioca' : 'Presto'}
        </span>
      )}
    </Collegamento>
  )
}

/** La carta di fine giornata: tutte fatte, i punti di oggi, e quanto manca alle prossime. */
function Finita({ punti }: { punti: number }) {
  const [resta, setResta] = useState(() => msToNextPuzzle())
  useEffect(() => {
    const id = window.setInterval(() => setResta(msToNextPuzzle()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  const ore = Math.floor(resta / 3_600_000)
  const minuti = Math.floor((resta % 3_600_000) / 60_000)
  return (
    <section className="finita entra" aria-label="Giornata finita">
      {CORIANDOLI.map((c, i) => (
        <span key={i} className="finita__coriandolo" style={c as CSSProperties} aria-hidden="true" />
      ))}
      <div className="finita__testa">
        <IconaGioco gioco="trofeo" lato={78} giro={-5} fluttua />
        <div className="finita__testi">
          <h2 className="finita__titolo">Per oggi hai finito!</h2>
          <p className="finita__punti">
            Tutte e {GIOCHI.length} le giornaliere · {punti} punti
          </p>
          <span className="finita__prossime">
            <IconClock size={14} />
            Le prossime tra {ore} h {minuti} min
          </span>
        </div>
      </div>
      <div className="finita__tasti">
        <Collegamento to={ROTTE.libere} direzione="scheda" className="finita__tasto finita__tasto--libere">
          Gioca alle Libere
        </Collegamento>
        <Collegamento to={ROTTE.classifica()} stato={{ da: 'Giornaliere' }} className="finita__tasto">
          Classifica
        </Collegamento>
      </div>
    </section>
  )
}

/** I coriandoli della carta di fine giornata: fermi al loro posto, ondeggiano appena. */
const CORIANDOLI = [
  ['8%', '12%', '#FF8FBF', '-20deg', 0],
  ['22%', '78%', '#FFC93C', '15deg', 0.4],
  ['46%', '8%', '#6EC1FF', '35deg', 0.8],
  ['70%', '18%', '#5EDB84', '-30deg', 0.2],
  ['88%', '62%', '#B48CFF', '10deg', 0.6],
  ['60%', '86%', '#FF9A62', '-12deg', 1],
  ['94%', '10%', '#FFC93C', '40deg', 1.2],
].map(([x, y, c, r, d]) => ({ left: x, top: y, background: c, '--r': r, animationDelay: `${d}s` }))

/**
 * Quali timbri sono nuovi: le classificate finite da quando si e' guardata
 * questa pagina l'ultima volta, oggi. Arrivano col colpo del timbro; le
 * altre sono gia' al loro posto. Il ricordo sta nel telefono, e senza il
 * timbro arriva fermo.
 *
 * Il ricordo si legge una volta, quando la pagina si monta, e i nuovi si
 * contano mentre si disegna: contati in un effetto, il timbro compariva gia'
 * stampato per un attimo e solo dopo ripartiva, e in sviluppo il secondo giro
 * dell'effetto rileggeva il ricordo appena scritto e non lo trovava piu'
 * nuovo. Il valore e' l'ordine d'arrivo di ognuno, per stamparli in fila.
 */
function useTimbriNuovi(data: string | null, stati: Record<GiocoClassificato, StatoOggi> | null): Map<string, number> {
  const [ricordo] = useState(leggiTimbri)
  const fatte = stati ? GIOCHI.filter((g) => stati[g.id].fase === 'fatta').map((g) => g.id) : null
  const chiave = fatte?.join(',') ?? null
  const nuovi = useMemo(() => {
    const ordine = new Map<string, number>()
    if (!data || !chiave || ricordo === null) return ordine
    const viste = ricordo?.data === data ? ricordo.viste : []
    for (const id of chiave.split(',')) if (!viste.includes(id)) ordine.set(id, ordine.size)
    return ordine
  }, [data, chiave, ricordo])
  useEffect(() => {
    if (!data || chiave === null) return
    try {
      localStorage.setItem(CHIAVE_TIMBRI, JSON.stringify({ data, viste: chiave ? chiave.split(',') : [] }))
    } catch {
      // Senza il localStorage i timbri arrivano fermi: niente di grave.
    }
  }, [data, chiave])
  // Il colpo si sente quando il timbro tocca la carta (vedi `timbro-stampa` in Giornaliere.css).
  useEffect(() => {
    for (const k of nuovi.values()) suona('posa', { ritardo: (ATTESA_TIMBRO_MS + k * PASSO_TIMBRO_MS + COLPO_TIMBRO_MS) / 1000 })
  }, [nuovi])
  return nuovi
}

/** Il ricordo dei timbri visti: `undefined` se non c'e', `null` se il telefono non lo tiene. */
function leggiTimbri(): { data: string; viste: string[] } | undefined | null {
  try {
    return (JSON.parse(localStorage.getItem(CHIAVE_TIMBRI) ?? 'null') as { data: string; viste: string[] } | null) ?? undefined
  } catch {
    return null
  }
}

/** I tempi della stampa, uguali a quelli di `.timbro.is-nuovo` in Giornaliere.css. */
const ATTESA_TIMBRO_MS = 650
const PASSO_TIMBRO_MS = 260
const COLPO_TIMBRO_MS = 340

const CHIAVE_TIMBRI = 'giornaliere-timbri'
