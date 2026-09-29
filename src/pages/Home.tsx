import type { CSSProperties } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Copertina } from '@/components/Copertina'
import { Anello, Numero, Sezione } from '@/components/Elementi'
import { IconChevronRight, IconPlay } from '@/components/Icons'
import { Pagina } from '@/components/Pagina'
import { GIOCHI, GIOCHI_DA_TAVOLO, type Gioco } from '@/games/catalog'
import { statiDiOggi, type StatoOggi } from '@/games/stato'
import { usePlayer } from '@/lib/auth'
import { useDati } from '@/lib/dati'
import { formatGameDate } from '@/lib/format'
import { gameDate } from '@shared/daily'
import type { OggiRisposta } from '@shared/types'
import './Home.css'

/**
 * La schermata iniziale: le classificate di oggi e le partite libere.
 *
 * In cima, com'e' andata la giornata: i punti fatti e la posizione nella
 * classifica generale, e un anello per gioco. Sotto, una carta per ogni
 * classificata con il bottone che ci porta dentro — un tocco per giocare —
 * piu' in basso le partite libere, che non hanno fretta, e in fondo i giochi
 * da tavolo, che non hanno classificata e si giocano con gli amici.
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

      <Sezione titolo="Partite libere" nota="Non contano per la classifica.">
        <ul className="home__libere">
          {GIOCHI.map((g, i) => (
            <li key={g.id} className="entra" style={{ '--n': i + 4 } as CSSProperties}>
              <Collegamento to={ROTTE.libera(g.id)} className="libera">
                <Copertina gioco={g.id} formato="icona" />
                <span className="libera__testo">
                  <span className="libera__nome">{g.nome}</span>
                  <span className="libera__cosa">{g.liberaBreve}</span>
                </span>
              </Collegamento>
            </li>
          ))}
        </ul>
      </Sezione>

      <Sezione titolo="Giochi da tavolo" nota="Con gli amici o contro il computer, senza classifica.">
        <ul className="home__tavolo">
          {GIOCHI_DA_TAVOLO.map((g, i) => (
            <li key={g.id} className="entra" style={{ '--n': i + 10 } as CSSProperties}>
              <Collegamento to={`/${g.slug}`} className={`tavolo tavolo--${g.id}`}>
                <Copertina gioco={g.id} formato="icona" transizione={`copertina-${g.id}`} />
                <span className="tavolo__testo">
                  <span className="tavolo__nome">{g.nome}</span>
                  <span className="tavolo__motto">{g.motto}</span>
                </span>
                <span className="tavolo__con">{g.conChi}</span>
                <IconChevronRight size={18} className="tavolo__freccia" />
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
                ? 'Gioca una classificata per entrare in classifica'
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
 * bottone che ci porta. Tutta la carta apre la pagina del gioco; il bottone
 * va dritto alla partita, perché la classificata di tutti i giorni deve stare a
 * un tocco.
 */
function CartaClassificata({ gioco, stato }: { gioco: Gioco; stato: StatoOggi | null }) {
  const fatta = stato?.fase === 'fatta'
  return (
    <article
      className={`carta carta--${gioco.id}${fatta ? ' is-fatta' : ''}`}
      style={{ '--c1': `var(--${gioco.id}-1)`, '--c2': `var(--${gioco.id}-2)` } as CSSProperties}
    >
      <Collegamento to={ROTTE.gioco(gioco.id)} className="carta__tutta" aria-label={`Apri ${gioco.nome}`} />
      <Copertina gioco={gioco.id} formato="icona" transizione={`copertina-${gioco.id}`} className="carta__icona" />
      <div className="carta__testo">
        <h3 className="carta__nome">{gioco.nome}</h3>
        {stato ? (
          <>
            <p className="carta__stato">{stato.titolo}</p>
            <p className="carta__dettaglio">{stato.dettaglio}</p>
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
          <Collegamento to={stato.a} className={`carta__bottone${fatta ? ' is-rivedi' : ''}`}>
            {!fatta && <IconPlay size={14} />}
            {stato.azione}
          </Collegamento>
        )}
        {stato && (
          <Anello valore={stato.avanzamento} dimensione={28} spessore={3.5} colore="var(--c1)" />
        )}
      </div>
    </article>
  )
}
