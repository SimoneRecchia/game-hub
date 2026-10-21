import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { suona } from '@/lib/suoni'
import { CASELLE_CASH_HUNT, MURO_CASH_HUNT, scriviMoltiplicatore } from '@shared/ruota'
import { coloreDelMoltiplicatore, tempiDelConto } from './disegni'
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

/** Un cerchio come tracciato, per i simboli disegnati a linee. */
const tondo = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`

/**
 * I simboli delle caselle coperte, con il nome per chi non li vede: uno diverso
 * per casella, a linee color crema su una tessera a tinta piena, come nel mockup.
 */
const SIMBOLI: ReadonlyArray<{ nome: string; d: string }> = [
  { nome: 'la stella', d: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.1 9.5l6.1-.9z' },
  { nome: 'il cuore', d: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z' },
  { nome: 'il rombo', d: 'M12 3l7 9-7 9-7-9z' },
  { nome: 'la luna', d: 'M15 3a9 9 0 1 0 6 15A7 7 0 0 1 15 3z' },
  { nome: 'il fulmine', d: 'M13 2L5 14h6l-1 8 8-12h-6z' },
  { nome: 'la goccia', d: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z' },
  { nome: 'la foglia', d: 'M5 19C5 9 11 4 20 4c0 9-5 15-15 15z M5 19l7-7' },
  { nome: 'la corona', d: 'M4 18l-1-10 5 4 4-7 4 7 5-4-1 10z' },
  { nome: 'la campana', d: 'M12 3a5 5 0 0 1 5 5v5l2 3H5l2-3V8a5 5 0 0 1 5-5z M10 19a2 2 0 0 0 4 0' },
  { nome: 'la chiave', d: `${tondo(7.5, 12, 3.5)} M11 12h10 M18 12v3 M21 12v2` },
  { nome: 'la nota', d: 'M9 18V5l10-2v13 M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3z M19 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z' },
  {
    nome: 'il sole',
    d: `${tondo(12, 12, 4)} M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2`,
  },
]

/** Le tinte dei dorsi: sei colori pieni, che girano con i simboli. */
const DORSI = ['#e2508c', '#6c45d6', '#1b82d6', '#10a2bd', '#6cb52a', '#f3a521']

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
                <span
                  className="ct-caccia__faccia is-simbolo"
                  style={{ '--dorso': DORSI[s % DORSI.length] } as CSSProperties}
                >
                  <svg viewBox="0 0 24 24" className="ct-caccia__simbolo">
                    <path d={simbolo.d} />
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
