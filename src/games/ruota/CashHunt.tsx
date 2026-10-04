import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { suona } from '@/lib/suoni'
import { CASELLE_CASH_HUNT, MURO_CASH_HUNT, scriviMoltiplicatore } from '@shared/ruota'
import { IconaMoneta, IconaQuiz, Quadrifoglio, coloreDelMoltiplicatore, tempiDelConto } from './disegni'
import { PremioCheSale } from './Fortuna'
import { AUMENTO_CASH_HUNT } from './magia'
import './CashHunt.css'

/**
 * A che punto e' il Cash Hunt, per chi lo racconta: il muro scoperto, i premi
 * che salgono, le caselle che si coprono e si mescolano, la scelta, l'attesa
 * del server, la casella scelta che si gira, e tutte le altre.
 */
export type FaseCashHunt = 'scoperto' | 'sale' | 'copre' | 'mescola' | 'scegli' | 'attesa' | 'rivela' | 'fine'

/** Quanto si guarda il muro scoperto, quanto ci mettono le caselle a coprirsi, e i giri della mescolata. */
const SCOPERTO_MS = 1_700
const SCOPERTO_FORTUNATO_MS = 900
const COPRE_MS = 1_050
const GIRI_MESCOLATA = 3
const GIRO_MESCOLATA_MS = 560
/** La casella scelta che si gira e si fa grande, poi le altre, una dopo l'altra. */
const RIVELA_MS = 1_100
const ONDA_MS = 70
const TUTTE_MS = 650

/** Quando il ×5 arriva al ×10, salendo con la fortuna. */
const FINE_AUMENTO = `${AUMENTO_CASH_HUNT.conto[AUMENTO_CASH_HUNT.conto.length - 1].ms}ms`

/** I simboli delle caselle coperte, con il nome per chi non li vede: uno diverso per casella. */
const SIMBOLI: ReadonlyArray<{ nome: string; disegno: ReactNode }> = [
  { nome: 'il quadrifoglio', disegno: <Quadrifoglio lato={18.5} classe="is-verde" /> },
  { nome: 'la moneta', disegno: <IconaMoneta lato={19} /> },
  { nome: 'il fumetto', disegno: <IconaQuiz lato={21} /> },
  { nome: 'la stella', disegno: <Stella /> },
  { nome: 'il cuore', disegno: <Cuore /> },
  { nome: 'il diamante', disegno: <Diamante /> },
  { nome: 'la campana', disegno: <Campana /> },
  { nome: 'la corona', disegno: <Corona /> },
  { nome: 'il ferro di cavallo', disegno: <FerroDiCavallo /> },
  { nome: 'la fiche', disegno: <Fiche /> },
  { nome: 'il dado', disegno: <Dado /> },
  { nome: 'il sette', disegno: <Sette /> },
]

/** Una permutazione a caso dei posti: la mescolata si vede soltanto, il muro vero l'ha mescolato il server. */
function rimescola(xs: readonly number[]): number[] {
  const ys = [...xs]
  for (let i = ys.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ys[i], ys[j]] = [ys[j], ys[i]]
  }
  return ys
}

/**
 * Il Cash Hunt di Crazy Time: un muro di dodici caselle. Prima si vede
 * scoperto, con i moltiplicatori dal piu' grande; poi le caselle si girano,
 * ognuna con il suo simbolo, e si mescolano; poi se ne sceglie una, toccandola.
 *
 * Dove sta ogni moltiplicatore lo sa solo il server, che ha mescolato il muro
 * quando la ruota si e' fermata: qui si conoscono soltanto i dodici valori, e la
 * mescolata che si vede e' un modo di dirlo. Scelta la casella, il server
 * risponde con il muro intero: la casella scelta si gira e si fa grande, poi si
 * girano tutte le altre, e si vede che cosa c'era.
 *
 * Dalla ruota fortunata il muro arriva con i moltiplicatori di sempre, e
 * scoperto salgono, dal piu' piccolo; il ×5 per ultimo, contando fino al ×10.
 * Le caselle sono bottoni: si scelgono anche con la tastiera, e le frecce
 * passano da una all'altra.
 */
export function CashHunt({
  valori,
  fortunata,
  muro,
  scelta,
  via,
  subito,
  inVolo,
  onScegli,
  onFase,
  onRivelato,
}: {
  /** I dodici moltiplicatori, dal piu' grande: quelli della fortuna, se si viene da li'. */
  valori: readonly number[]
  fortunata: boolean
  /** Il muro intero, da quando si e' scelto. */
  muro: readonly number[] | null
  scelta: number | null
  /** Il muro si vede: si comincia. */
  via: boolean
  /** Una pagina riaperta: le caselle sono gia' coperte e mescolate, si sceglie. */
  subito: boolean
  /** La scelta e' andata al server. */
  inVolo: boolean
  onScegli: (casella: number) => void
  onFase: (fase: FaseCashHunt) => void
  onRivelato: () => void
}) {
  // Il muro che c'era quando il Cash Hunt e' comparso: quella scelta e' gia' stata raccontata.
  const [giaScelto] = useState(() => muro)
  const [fase, setFase] = useState<FaseCashHunt>(giaScelto ? 'fine' : subito ? 'scegli' : 'scoperto')
  /** Quale simbolo sta in ogni casella: all'inizio in fila, poi come li lascia la mescolata. */
  const [ordine, setOrdine] = useState<number[]>(() => Array.from({ length: CASELLE_CASH_HUNT }, (_, i) => i))
  /** La casella toccata, finché il server non risponde. */
  const [toccata, setToccata] = useState<number | null>(null)
  const tessere = useRef(new Map<number, HTMLButtonElement>())
  const prima = useRef<Map<number, DOMRect> | null>(null)
  const attuali = useRef({ onFase, onRivelato })
  useEffect(() => {
    attuali.current = { onFase, onRivelato }
  })
  const ridotto = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  /** Senza animazioni i premi della fortuna non salgono: ci sono gia'. */
  const [senzaMoto] = useState(ridotto)

  useEffect(() => {
    attuali.current.onFase(fase)
  }, [fase])

  // Il muro si vede: si guarda scoperto, e dalla fortuna i premi salgono; poi le caselle si coprono.
  useEffect(() => {
    if (!via || fase !== 'scoperto') return
    if (fortunata && senzaMoto) suona('magia')
    const t = window.setTimeout(
      () => setFase(fortunata && !senzaMoto ? 'sale' : 'copre'),
      fortunata && !senzaMoto ? SCOPERTO_FORTUNATO_MS : SCOPERTO_MS,
    )
    return () => window.clearTimeout(t)
  }, [via, fase, fortunata, senzaMoto])

  useEffect(() => {
    if (fase !== 'sale') return
    AUMENTO_CASH_HUNT.passi.forEach((ms, k) => suona('sale', { ritardo: ms / 1000, altezza: 1 + k * 0.1 }))
    AUMENTO_CASH_HUNT.conto
      .slice(1)
      .forEach((p, k) => suona('incasso', { ritardo: p.ms / 1000, altezza: 1 + k * 0.14 }))
    suona('magia', { ritardo: AUMENTO_CASH_HUNT.conto[AUMENTO_CASH_HUNT.conto.length - 1].ms / 1000 })
    const t = window.setTimeout(() => setFase('copre'), AUMENTO_CASH_HUNT.durata)
    return () => window.clearTimeout(t)
  }, [fase])

  // Le caselle si coprono una dopo l'altra, e poi si mescolano: tre giri, ognuno con il suo fruscio.
  useEffect(() => {
    if (fase !== 'copre') return
    if (ridotto()) {
      setFase('scegli')
      return
    }
    suona('giraCarta')
    const t = window.setTimeout(() => setFase('mescola'), COPRE_MS)
    return () => window.clearTimeout(t)
  }, [fase])

  useEffect(() => {
    if (fase !== 'mescola') return
    const attese: number[] = []
    for (let g = 0; g < GIRI_MESCOLATA; g += 1) {
      attese.push(
        window.setTimeout(() => {
          prima.current = new Map([...tessere.current].map(([s, el]) => [s, el.getBoundingClientRect()]))
          setOrdine((o) => rimescola(o))
          suona('mescola')
        }, g * GIRO_MESCOLATA_MS),
      )
    }
    attese.push(window.setTimeout(() => setFase('scegli'), GIRI_MESCOLATA * GIRO_MESCOLATA_MS + 120))
    return () => attese.forEach((t) => window.clearTimeout(t))
  }, [fase])

  // Ogni casella va dal posto di prima al suo, con le altre che le passano accanto.
  useLayoutEffect(() => {
    const da = prima.current
    prima.current = null
    if (!da) return
    for (const [s, el] of tessere.current) {
      const a = da.get(s)
      if (!a) continue
      const b = el.getBoundingClientRect()
      const dx = a.left - b.left
      const dy = a.top - b.top
      if (Math.abs(dx) + Math.abs(dy) < 1) continue
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: `translate(${dx / 2}px, ${dy / 2}px) scale(0.86) rotate(${dx > 0 ? -6 : 6}deg)`, offset: 0.5 },
          { transform: 'translate(0, 0)' },
        ],
        { duration: GIRO_MESCOLATA_MS - 60, easing: 'cubic-bezier(.45,0,.25,1)' },
      )
    }
  }, [ordine])

  // La scelta: se il server non la prende, si sceglie di nuovo.
  useEffect(() => {
    if (fase === 'attesa' && !inVolo && !muro) {
      setToccata(null)
      setFase('scegli')
    }
  }, [fase, inVolo, muro])

  // Il muro e' arrivato: la casella scelta si gira, poi tutte le altre.
  useEffect(() => {
    if (!muro || muro === giaScelto || scelta === null) return
    if (ridotto()) {
      setFase('fine')
      suona('giraCarta')
      attuali.current.onRivelato()
      return
    }
    setFase('rivela')
    suona('giraCarta')
    const tutte = window.setTimeout(() => {
      setFase('fine')
      for (let k = 0; k < CASELLE_CASH_HUNT - 1; k += 3) {
        suona('giraCarta', { ritardo: (k * ONDA_MS) / 1000, volume: 0.5 })
      }
    }, RIVELA_MS)
    const fine = window.setTimeout(
      () => attuali.current.onRivelato(),
      RIVELA_MS + (CASELLE_CASH_HUNT - 1) * ONDA_MS + TUTTE_MS,
    )
    return () => {
      window.clearTimeout(tutte)
      window.clearTimeout(fine)
    }
  }, [muro, scelta, giaScelto])

  const scegli = (casella: number) => {
    if (fase !== 'scegli') return
    suona('tocco')
    setToccata(casella)
    setFase('attesa')
    onScegli(casella)
  }

  /** Le frecce passano da una casella all'altra; Invio e lo spazio scelgono, come ogni bottone. */
  const frecce = (e: KeyboardEvent<HTMLDivElement>) => {
    const colonne = getComputedStyle(e.currentTarget).gridTemplateColumns.split(' ').length
    const passi: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: colonne, ArrowUp: -colonne }
    const passo = passi[e.key]
    if (!passo) return
    const voci = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('.ct-caccia__tessera'))
    const qui = voci.indexOf(e.target as HTMLButtonElement)
    if (qui < 0) return
    e.preventDefault()
    voci[(qui + passo + voci.length) % voci.length]?.focus()
  }

  const scoperto = fase === 'scoperto' || fase === 'sale'
  const fineScelta = fase === 'rivela' || fase === 'fine'
  const normali = fortunata ? MURO_CASH_HUNT : valori
  // Dalla fortuna il muro arriva con i premi di sempre: quelli saliti si vedono dalla magia in poi.
  const saliti = fortunata && (fase !== 'scoperto' || senzaMoto)
  const classi = ['ct-caccia', `is-${fase}`, saliti && 'is-fortunata', fase === 'sale' && 'is-aumento']
  return (
    <div className="ct-caccia__palco">
      <div
        className={classi.filter(Boolean).join(' ')}
        role="group"
        aria-label="Il muro del Cash Hunt"
        onKeyDown={frecce}
      >
        {ordine.map((s, casella) => {
          const simbolo = SIMBOLI[s]
          const scelto = casella === (scelta ?? toccata)
          const valore = fineScelta && muro ? muro[casella] : null
          const coperta = !scoperto && !(valore !== null && (scelto || fase === 'fine'))
          const massimo = AUMENTO_CASH_HUNT.massimi.includes(casella)
          const etichetta =
            valore !== null
              ? `${simbolo.nome}: ${scriviMoltiplicatore(valore)}`
              : scoperto
                ? scriviMoltiplicatore(valori[casella])
                : `Scegli ${simbolo.nome}`
          return (
            <button
              key={s}
              ref={(el) => {
                if (el) tessere.current.set(s, el)
                else tessere.current.delete(s)
              }}
              type="button"
              className={`ct-caccia__tessera${coperta ? ' is-coperta' : ''}${scelto ? ' is-scelta' : ''}${
                massimo ? ' is-massima' : ''
              }`}
              style={
                {
                  '--k': casella,
                  '--onda': `${Math.abs(casella - (scelta ?? 0)) * ONDA_MS}ms`,
                  '--ritardo': `${AUMENTO_CASH_HUNT.ritardo(casella)}ms`,
                  ...(massimo ? { '--fine': FINE_AUMENTO } : {}),
                } as CSSProperties
              }
              disabled={fase !== 'scegli'}
              aria-label={etichetta}
              onClick={() => scegli(casella)}
            >
              <span className="ct-caccia__carta" aria-hidden="true">
                <span
                  className="ct-caccia__faccia is-valore"
                  style={
                    {
                      '--colore': coloreDelMoltiplicatore(valore ?? (saliti ? valori : normali)[casella]),
                    } as CSSProperties
                  }
                >
                  {valore !== null ? (
                    <Valore m={valore} />
                  ) : scoperto || fase === 'copre' ? (
                    <>
                      <span className="ct-caccia__valore is-normale">
                        <Valore m={normali[casella]} />
                      </span>
                      {fortunata && (
                        <span className="ct-caccia__valore is-fortunata">
                          {massimo ? (
                            AUMENTO_CASH_HUNT.conto.slice(1).map((p, i) => (
                              <Valore
                                key={p.valore}
                                m={p.valore}
                                classe={`ct-conto${i === AUMENTO_CASH_HUNT.conto.length - 2 ? ' is-ultimo' : ''}`}
                                stile={tempiDelConto(AUMENTO_CASH_HUNT.conto, i + 1)}
                              />
                            ))
                          ) : (
                            <Valore m={valori[casella]} />
                          )}
                        </span>
                      )}
                    </>
                  ) : null}
                </span>
                <span className="ct-caccia__faccia is-simbolo">
                  <svg viewBox="-12 -12 24 24" className="ct-caccia__simbolo">
                    {simbolo.disegno}
                  </svg>
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {fase === 'sale' && <PremioCheSale passi={AUMENTO_CASH_HUNT.conto} />}
    </div>
  )
}

/** Il moltiplicatore di una casella scoperta: grande, nel colore di quanto vale. */
function Valore({ m, classe = '', stile }: { m: number; classe?: string; stile?: CSSProperties }) {
  return (
    <span className={`ct-caccia__numero ${classe}`} style={stile}>
      {scriviMoltiplicatore(m)}
    </span>
  )
}

/* ─────────────────────────────  I simboli  ───────────────────────────── */

/** Una stella a cinque punte, d'oro. */
function Stella() {
  const punte = Array.from({ length: 10 }, (_, k) => {
    const r = k % 2 === 0 ? 10.5 : 4.4
    const a = (k * Math.PI) / 5 - Math.PI / 2
    return `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r + 0.8).toFixed(2)}`
  })
  return <path className="ct-simbolo is-stella" d={`M${punte.join('L')}Z`} />
}

function Cuore() {
  return (
    <path
      className="ct-simbolo is-cuore"
      d="M0 9.2C-6.2 4.6-9.8 1-9.8-3c0-3.1 2.4-5.5 5.3-5.5 2 0 3.6 1.1 4.5 2.8.9-1.7 2.5-2.8 4.5-2.8
        2.9 0 5.3 2.4 5.3 5.5 0 4-3.6 7.6-9.8 12.2z"
    />
  )
}

function Diamante() {
  return (
    <g className="ct-simbolo is-diamante">
      <path d="M-10 -3.2L-5.6 -9H5.6L10 -3.2L0 9.6Z" />
      <path className="ct-simbolo__filo" d="M-10 -3.2H10M-5.6 -9L-2.4 -3.2L0 9.6L2.4 -3.2L5.6 -9" />
    </g>
  )
}

function Campana() {
  return (
    <g className="ct-simbolo is-campana">
      <path
        d="M0 -9.6c-1 0-1.7.8-1.7 1.7v.7C-5.6-6-7.4-2.6-7.4 1.2v3.6l-2.3 2.6H9.7L7.4 4.8V1.2
          c0-3.8-1.8-7.2-5.7-8.4v-.7C1.7-8.8 1-9.6 0-9.6z"
      />
      <circle cx={0} cy={9.1} r={2} />
    </g>
  )
}

function Corona() {
  return (
    <g className="ct-simbolo is-corona">
      <path d="M-10 5V-5.4l5.2 4.6L0 -9l4.8 8.2L10 -5.4V5Z" />
      <rect x={-10} y={5.8} width={20} height={3.2} rx={1} />
      <circle className="ct-simbolo__gemma" cx={0} cy={1.2} r={1.7} />
    </g>
  )
}

function FerroDiCavallo() {
  return (
    <g className="ct-simbolo is-ferro">
      <path d="M-7 -8.6V0.4a7 7 0 0 0 14 0V-8.6" />
      {[-7, 7].map((x) => (
        <circle key={x} className="ct-simbolo__chiodo" cx={x} cy={-4} r={0.9} />
      ))}
    </g>
  )
}

function Fiche() {
  return (
    <g className="ct-simbolo is-fiche">
      <circle r={10} />
      <circle className="ct-simbolo__tacche" r={8.3} />
      <circle className="ct-simbolo__centro" r={5.4} />
    </g>
  )
}

function Dado() {
  return (
    <g className="ct-simbolo is-dado">
      <rect x={-9} y={-9} width={18} height={18} rx={4} />
      {[
        [-4.4, -4.4],
        [4.4, -4.4],
        [0, 0],
        [-4.4, 4.4],
        [4.4, 4.4],
      ].map(([x, y]) => (
        <circle key={`${x},${y}`} className="ct-simbolo__punto" cx={x} cy={y} r={1.8} />
      ))}
    </g>
  )
}

function Sette() {
  return (
    <text className="ct-simbolo is-sette" y={1}>
      7
    </text>
  )
}
