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
  const barra = useRef<HTMLElement>(null)
  const cima = useRef<HTMLDivElement>(null)
  const sentinella = useRef<HTMLDivElement>(null)
  // Due momenti diversi: qualcosa scorre sotto la barra (e la barra si fa vetro), e il titolo grande
  // e' passato del tutto (e la barra prende il titolo piccolo).
  const [velata, setVelata] = useState(intera)
  const [scorsa, setScorsa] = useState(intera)

  useEffect(() => {
    if (intera) return
    const inCima = cima.current
    const titoloFinito = sentinella.current
    if (!inCima || !titoloFinito || typeof IntersectionObserver === 'undefined') return
    // L'altezza vera della barra, con l'area sicura in cima di un'app installata.
    const altezza = Math.round(barra.current?.getBoundingClientRect().height ?? 52)
    const margine = { rootMargin: `-${altezza}px 0px 0px 0px` }
    const osservaCima = new IntersectionObserver(([voce]) => setVelata(!voce.isIntersecting), margine)
    const osservaTitolo = new IntersectionObserver(([voce]) => setScorsa(!voce.isIntersecting), margine)
    osservaCima.observe(inCima)
    osservaTitolo.observe(titoloFinito)
    return () => {
      osservaCima.disconnect()
      osservaTitolo.disconnect()
    }
  }, [intera])

  useEffect(() => {
    document.title = titolo === 'Giochi' ? 'Giochi' : `${titolo} · Giochi`
  }, [titolo])

  return (
    <div className={`pagina${intera ? ' pagina--intera' : ''}${larga ? ' pagina--larga' : ''}`}>
      <header ref={barra} className={`pagina__barra${velata ? ' is-velata' : ''}${scorsa ? ' is-scorsa' : ''}`}>
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

      {!intera && <div ref={cima} className="pagina__cima" aria-hidden="true" />}
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
