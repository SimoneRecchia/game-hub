import type { CSSProperties } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Copertina } from '@/components/Copertina'
import { Anello, Numero, Sezione } from '@/components/Elementi'
import { IconChevronRight, IconPlay } from '@/components/Icons'
import { Vetrina } from '@/components/Vetrina'
import { GIOCHI, type Gioco } from '@/games/catalog'
import { statiDiOggi, type StatoOggi } from '@/games/stato'
import { usePlayer } from '@/lib/auth'
import { useDati } from '@/lib/dati'
import { formatGameDate } from '@/lib/format'
import { gameDate } from '@shared/daily'
import type { OggiRisposta } from '@shared/types'
import './Giornaliere.css'

const OGGI_FRESCO_MS = 15_000

/**
 * Le Giornaliere, la scheda principale e quella che si apre per prima: le
 * classificate di oggi, che fanno la classifica. In cima la giornata — dove
 * sei nella generale di oggi, i punti, chi sta sul podio, e un anello per
 * gioco — che porta alla classifica; sotto una carta per gioco, che porta
 * dritta alla partita di oggi.
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

  return (
    <Vetrina
      scheda="giornaliere"
      titolo="Giornaliere"
      sopra={formatGameDate(oggi?.date ?? gameDate())}
      classifica={ROTTE.classifica()}
    >
      <Giornata io={player.id} oggi={oggi ?? null} stati={stati} />

      <Sezione titolo="Le classificate di oggi">
        <ul className="giornaliere__carte">
          {GIOCHI.map((g, i) => (
            <li key={g.id} className="entra" style={{ '--n': i + 1 } as CSSProperties}>
              <CartaClassificata
                id={g.id}
                nome={g.nome}
                a={ROTTE.classificata(g.id)}
                stato={stati?.[g.id] ?? null}
              />
            </li>
          ))}
        </ul>
      </Sezione>
    </Vetrina>
  )
}

/**
 * La giornata in una carta: il posto nella generale di oggi, grande, i punti,
 * il podio e un anello per gioco. Chi non ha ancora giocato vede i punti, che
 * sono zero, e l'invito a cominciare.
 */
function Giornata({
  io,
  oggi,
  stati,
}: {
  io: string
  oggi: OggiRisposta | null
  stati: Record<string, StatoOggi> | null
}) {
  const fatte = stati ? Object.values(stati).filter((s) => s.fase === 'fatta').length : 0
  const generale = oggi?.generale ?? null
  const posizione = generale?.posizione ?? null
  return (
    <Collegamento to={ROTTE.classifica()} stato={{ da: 'Giornaliere' }} className="eroe eroe--giornaliere giornata">
      <span className="eroe__testa">
        <span className="eroe__occhiello">La tua giornata</span>
        <span className="eroe__capsula">
          Classifica
          <IconChevronRight size={14} />
        </span>
      </span>

      <span className="giornata__corpo">
        <span className="giornata__numeri">
          <span className="giornata__numero u-tabnum">
            {posizione ? `${posizione}º` : <Numero valore={generale?.punti ?? 0} />}
            {posizione && generale && <span className="giornata__su"> su {generale.giocatori}</span>}
          </span>
          <span className="giornata__punti">
            {!generale ? (
              ' '
            ) : posizione ? (
              <>
                <Numero valore={generale.punti} /> punti oggi
              </>
            ) : fatte === 0 ? (
              'Gioca la prima classificata'
            ) : (
              'punti oggi'
            )}
          </span>
        </span>
        <Podietto podio={generale?.podio ?? []} io={io} />
      </span>

      <span
        className="giornata__anelli"
        aria-label={`${fatte} classificate su ${GIOCHI.length}`}
        style={{ '--giochi': GIOCHI.length } as CSSProperties}
      >
        {GIOCHI.map((g) => (
          <Anello
            key={g.id}
            valore={stati?.[g.id]?.avanzamento ?? 0}
            dimensione={34}
            spessore={4.5}
            colore={`var(--${g.id}-1)`}
          />
        ))}
        <span className="giornata__fatte u-tabnum">
          {fatte}/{GIOCHI.length}
        </span>
      </span>
    </Collegamento>
  )
}

const ORDINE_PODIO = [1, 0, 2] as const

/** Il podio di oggi, piccolo: il primo al centro e piu' in alto. Vuoto, restano i gradini. */
function Podietto({ podio, io }: { podio: OggiRisposta['generale']['podio']; io: string }) {
  const nomi = podio.map((p, i) => `${i + 1}º ${p.displayName}`).join(', ')
  return (
    <span className="podietto" role="img" aria-label={podio.length > 0 ? `Il podio di oggi: ${nomi}` : 'Podio vuoto'}>
      {ORDINE_PODIO.map((i) => {
        const p = podio[i]
        return (
          <span
            key={i}
            className={`podietto__posto podietto__posto--${i + 1}${p?.playerId === io ? ' is-io' : ''}`}
            style={{ '--n': i } as CSSProperties}
          >
            {p ? (
              <Avatar
                nickname={p.nickname}
                color={p.avatarColor}
                size={i === 0 ? 40 : 32}
                medal={(i + 1) as 1 | 2 | 3}
              />
            ) : (
              <span className="podietto__vuoto" />
            )}
            <span className="podietto__gradino">{i + 1}</span>
          </span>
        )
      })}
    </span>
  )
}

/**
 * La carta di una classificata: la copertina del gioco, a che punto sei, e il
 * bottone. Tutta la carta porta alla partita di oggi, come il bottone: la
 * classificata di tutti i giorni deve stare a un tocco.
 */
function CartaClassificata({
  id,
  nome,
  a,
  stato,
}: {
  id: Gioco['id']
  nome: string
  /** Dove porta finché lo stato non e' arrivato. */
  a: string
  stato: StatoOggi | null
}) {
  const fatta = stato?.fase === 'fatta'
  return (
    <Collegamento
      to={stato?.a ?? a}
      className={`carta carta--${id}${fatta ? ' is-fatta' : ''}`}
      style={{ '--c1': `var(--${id}-1)`, '--c2': `var(--${id}-2)` } as CSSProperties}
    >
      <Copertina gioco={id} formato="icona" className="carta__icona" />
      <div className="carta__testo">
        <h3 className="carta__nome">{nome}</h3>
        {stato ? (
          <>
            <p className="carta__stato">{stato.titolo}</p>
            {stato.dettaglio && <p className="carta__dettaglio">{stato.dettaglio}</p>}
          </>
        ) : (
          <>
            <p className="carta__stato scheletro scheletro--riga" />
            <p className="carta__dettaglio scheletro scheletro--riga-corta" />
          </>
        )}
      </div>
      <div className="carta__azione">
        {stato && stato.fase !== 'non-pronta' && (
          <span className={`carta__bottone${fatta ? ' is-rivedi' : ''}`}>
            {!fatta && <IconPlay size={14} />}
            {stato.azione}
          </span>
        )}
        {stato && stato.avanzamento !== null && (
          <Anello valore={stato.avanzamento} dimensione={28} spessore={3.5} colore="var(--c1)" />
        )}
      </div>
    </Collegamento>
  )
}
