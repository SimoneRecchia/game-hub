import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { IconChevronLeft } from './Icons'
import './Pagina.css'
import './BottoneTondo.css'

interface Indietro {
  /** Dove tornare se si e' entrati direttamente da qui, senza una schermata prima. */
  a: string
  /** Il nome della schermata di prima, accanto alla freccia: "Giochi", "Wordle". */
  etichetta: string
}

interface Props {
  titolo: string
  /** Una riga sopra il titolo grande. */
  sopra?: ReactNode
  /** Sopra al titolo grande: la copertina nella pagina di un gioco. */
  eroe?: ReactNode
  /** Sotto al titolo grande. */
  sotto?: ReactNode
  indietro?: Indietro
  /** A destra nella barra: i bottoni tondi della schermata. */
  azioni?: ReactNode
  /** A sinistra, al posto del tasto indietro: l'avatar della schermata iniziale. */
  sinistra?: ReactNode
  /**
   * Schermo intero, per giocare: niente tab bar, niente titolo grande, la
   * schermata non scorre e il contenuto prende l'altezza che resta.
   */
  intera?: boolean
  /** Contenuto piu' largo su computer: il cruciverba mette le definizioni accanto alla griglia. */
  larga?: boolean
  children: ReactNode
}

/**
 * Lo scheletro di una schermata, come in iOS.
 *
 * Le schermate di sezione hanno il **titolo grande** in cima al contenuto: si
 * legge per primo, e scorrendo scivola sotto la barra, dove ricompare piccolo
 * al centro mentre la barra si fa di vetro. Le schermate di gioco hanno solo la
 * barra, compatta, e il resto e' del gioco.
 *
 * La freccia indietro torna alla schermata di prima con la transizione del
 * pop; se non ce n'e' una — si e' aperto l'indirizzo da un link — va a `a`.
 */
export function Pagina({
  titolo,
  sopra,
  eroe,
  sotto,
  indietro,
  azioni,
  sinistra,
  intera = false,
  larga = false,
  children,
}: Props) {
  const { indietro: torna } = useNavigazione()
  const sentinella = useRef<HTMLDivElement>(null)
  const [scorsa, setScorsa] = useState(intera)

  useEffect(() => {
    if (intera) return
    const nodo = sentinella.current
    if (!nodo || typeof IntersectionObserver === 'undefined') return
    // Il titolo grande e' uscito da sotto la barra: la barra prende il titolo piccolo.
    const osservatore = new IntersectionObserver(([voce]) => setScorsa(!voce.isIntersecting), {
      rootMargin: '-52px 0px 0px 0px',
    })
    osservatore.observe(nodo)
    return () => osservatore.disconnect()
  }, [intera])

  useEffect(() => {
    document.title = titolo === 'Giochi' ? 'Giochi' : `${titolo} · Giochi`
  }, [titolo])

  return (
    <div className={`pagina${intera ? ' pagina--intera' : ''}${larga ? ' pagina--larga' : ''}`}>
      <header className={`pagina__barra${scorsa ? ' is-scorsa' : ''}`}>
        <div className="pagina__barra-dentro">
          <div className="pagina__lato">
            {sinistra ??
              (indietro && (
                <button
                  type="button"
                  className="pagina__indietro"
                  onClick={() => torna(indietro.a)}
                  aria-label={`Indietro: ${indietro.etichetta}`}
                >
                  <IconChevronLeft size={24} />
                  <span className="pagina__indietro-nome">{indietro.etichetta}</span>
                </button>
              ))}
          </div>
          <h1 className="pagina__titolo-barra" aria-hidden={!intera && !scorsa}>
            {titolo}
          </h1>
          <div className="pagina__lato pagina__lato--destra">{azioni}</div>
        </div>
      </header>

      <main className="pagina__corpo">
        {!intera && (
          <div className="pagina__testa">
            {eroe}
            {sopra && <p className="pagina__sopra">{sopra}</p>}
            <h1 className="pagina__titolo">{titolo}</h1>
            {sotto && <p className="pagina__sotto">{sotto}</p>}
            <div ref={sentinella} className="pagina__sentinella" aria-hidden="true" />
          </div>
        )}
        {children}
      </main>
    </div>
  )
}

/** Un bottone tondo della barra: info, invita, statistiche. */
export function BottoneBarra({
  etichetta,
  onClick,
  children,
  badge,
}: {
  etichetta: string
  onClick: () => void
  children: ReactNode
  badge?: number
}) {
  return (
    <button type="button" className="bottone-barra" onClick={onClick} aria-label={etichetta} title={etichetta}>
      {children}
      {badge !== undefined && badge > 0 && <span className="bottone-barra__badge">{badge}</span>}
    </button>
  )
}
