import type { CSSProperties } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Copertina } from '@/components/Copertina'
import { Anello, Numero, Sezione } from '@/components/Elementi'
import { IconChevronRight, IconPlay } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { GIOCHI, GIOCHI_DA_TAVOLO, type Gioco, type GiocoTavolo } from '@/games/catalog'
import { statiDiOggi, type StatoOggi } from '@/games/stato'
import { usePlayer } from '@/lib/auth'
import { useDati } from '@/lib/dati'
import { formatGameDate } from '@/lib/format'
import { gameDate } from '@shared/daily'
import type { OggiRisposta } from '@shared/types'
import './Home.css'

/**
 * Le partite che non contano: la libera di ogni gioco e i giochi da tavolo, che
 * portano alla scelta della partita. Solo i giochi da tavolo hanno una
 * copertina che si allarga nella pagina dove arrivano: le libere dei sei giochi
 * hanno la stessa copertina delle carte qui sopra, e due nomi uguali
 * fermerebbero la transizione.
 */
const LIBERE: ReadonlyArray<{ id: Gioco['id'] | GiocoTavolo['id']; nome: string; a: string; transizione?: string }> = [
  ...GIOCHI.map((g) => ({ id: g.id, nome: g.nome, a: ROTTE.libera(g.id) })),
  ...GIOCHI_DA_TAVOLO.map((g) => ({ id: g.id, nome: g.nome, a: `/${g.slug}`, transizione: `copertina-${g.id}` })),
]

/**
 * La schermata iniziale: le classificate di oggi e le partite libere.
 *
 * In cima, com'e' andata la giornata: i punti fatti e la posizione nella
 * classifica generale, e un anello per gioco. Sotto, una carta per ogni
 * classificata, che porta dritta alla partita di oggi: un tocco per giocare. In
 * fondo le partite che non contano, le libere dei sei giochi e i giochi da
 * tavolo insieme, che portano a scegliere la partita.
 *
 * I dati arrivano con una richiesta sola (`/api/oggi`), e restano in memoria:
 * tornando qui dalla partita si vedono subito, e si aggiornano da soli.
 */
export default function Home() {
  const player = usePlayer()
  const { dati: oggi } = useDati<OggiRisposta>('/oggi')
  const stati = oggi ? statiDiOggi(oggi) : null

  return (
    <Pagina
      titolo="Giochi"
      sopra={formatGameDate(oggi?.date ?? gameDate())}
      azioni={
        <Collegamento to={ROTTE.profilo} direzione="scheda" className="home__io" aria-label="Il tuo profilo">
          <Avatar nickname={player.nickname} color={player.avatarColor} size={36} />
        </Collegamento>
      }
    >
      <Riepilogo nome={player.displayName} oggi={oggi ?? null} stati={stati} />

      <Sezione titolo="Le classificate di oggi">
        <ul className="home__carte">
          {GIOCHI.map((g, i) => (
            <li key={g.id} className="entra" style={{ '--n': i } as CSSProperties}>
              <CartaClassificata gioco={g} stato={stati?.[g.id] ?? null} />
            </li>
          ))}
        </ul>
      </Sezione>

      <Sezione titolo="Partite libere">
        <ul className="home__libere">
          {LIBERE.map((l, i) => (
            <li key={l.id} className="entra" style={{ '--n': i + GIOCHI.length } as CSSProperties}>
              <Collegamento to={l.a} className="libera">
                <Copertina gioco={l.id} formato="icona" transizione={l.transizione} />
                <span className="libera__nome">{l.nome}</span>
              </Collegamento>
            </li>
          ))}
        </ul>
      </Sezione>
    </Pagina>
  )
}

/** La giornata in una carta: i punti, la posizione, e un anello per gioco. */
function Riepilogo({
  nome,
  oggi,
  stati,
}: {
  nome: string
  oggi: OggiRisposta | null
  stati: Record<string, StatoOggi> | null
}) {
  const fatte = stati ? Object.values(stati).filter((s) => s.fase === 'fatta').length : 0
  const posizione = oggi?.generale.posizione ?? null
  return (
    <Collegamento to={ROTTE.classifica()} direzione="scheda" className="riepilogo entra">
      <Copertina gioco="generale" formato="carta" className="riepilogo__fondo" />
      <span className="riepilogo__testo">
        <span className="riepilogo__ciao">Ciao {nome}</span>
        <span className="riepilogo__punti">
          <Numero valore={oggi?.generale.punti ?? 0} />
          <span className="riepilogo__unita"> punti oggi</span>
        </span>
        <span className="riepilogo__posto">
          {!oggi
            ? ' '
            : posizione
              ? `${posizione}º su ${oggi.generale.giocatori} in classifica`
              : fatte === 0
                ? 'Non sei ancora in classifica'
                : 'In classifica fra poco'}
        </span>
      </span>
      <span
        className="riepilogo__anelli"
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
      </span>
      <IconChevronRight size={20} className="riepilogo__freccia" />
    </Collegamento>
  )
}

/**
 * La carta di una classificata: la copertina del gioco, a che punto sei, e il
 * bottone. Tutta la carta porta alla partita di oggi, come il bottone: la
 * classificata di tutti i giorni deve stare a un tocco.
 */
function CartaClassificata({ gioco, stato }: { gioco: Gioco; stato: StatoOggi | null }) {
  const fatta = stato?.fase === 'fatta'
  return (
    <Collegamento
      to={stato?.a ?? ROTTE.classificata(gioco.id)}
      className={`carta carta--${gioco.id}${fatta ? ' is-fatta' : ''}`}
      style={{ '--c1': `var(--${gioco.id}-1)`, '--c2': `var(--${gioco.id}-2)` } as CSSProperties}
    >
      <Copertina gioco={gioco.id} formato="icona" className="carta__icona" />
      <div className="carta__testo">
        <h3 className="carta__nome">{gioco.nome}</h3>
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
        {stato && <Anello valore={stato.avanzamento} dimensione={28} spessore={3.5} colore="var(--c1)" />}
      </div>
    </Collegamento>
  )
}
