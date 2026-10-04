import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { suona } from '@/lib/suoni'
import { FILE_PACHINKO, MOLTIPLICATORI_PACHINKO, bucaDi, scriviMoltiplicatore } from '@shared/ruota'
import { tempiDelConto } from './disegni'
import { PremioCheSale } from './Fortuna'
import { AUMENTO_PACHINKO } from './magia'
import './Pachinko.css'

/**
 * A che punto e' il Pachinko, per chi lo racconta: i premi che salgono, la
 * pallina pronta, il lancio chiesto al server, la caduta, la buca.
 */
export type FasePachinko = 'sale' | 'pronta' | 'carica' | 'cade' | 'caduta'

/** Le misure del tabellone, in unita' del disegno: fra due colonne di pioli ce ne sono dieci. */
const PASSO = 10
const PRIMA_FILA = 16
const FRA_FILE = 9.4
const RAGGIO_PIOLO = 1.35
const RAGGIO_PALLINA = 2.75
const BUCHE = { y: 88, alte: 18, larghe: 8.6 }
const PARTENZA = { x: 0, y: 4 }
const VISTA = { x: -50, y: -5, larghezza: 100, altezza: 115 }

/** I tempi della caduta: fino al primo piolo, da un piolo al prossimo, dall'ultimo alla buca, e l'assestamento. */
const CADUTA_MS = 340
const SALTO_MS = 178
const ULTIMO_MS = 400
const ASSESTA_MS = 280
/** Quanto si guarda la pallina in buca prima che la vincita parta. */
const IN_BUCA_MS = 520

/** Quando i due ×15 arrivano al ×30, salendo con la fortuna. */
const FINE_AUMENTO = `${AUMENTO_PACHINKO.conto[AUMENTO_PACHINKO.conto.length - 1].ms}ms`

const yFila = (r: number) => PRIMA_FILA + r * FRA_FILE
const xBuca = (k: number) => (k - FILE_PACHINKO / 2) * PASSO

/**
 * I pioli: tre nella fila in cima e uno in piu' a ogni fila, dieci in fondo,
 * dove fanno da sponde alle buche. La pallina tocca sempre quelli di dentro: a
 * ogni fila e' sopra uno dei pioli, a sinistra o a destra di quello di prima.
 */
const PIOLI = Array.from({ length: FILE_PACHINKO }, (_, r) =>
  Array.from({ length: r + 3 }, (_, k) => ({ r, k, x: (k - (r + 2) / 2) * PASSO, y: yFila(r) })),
).flat()

interface Strada {
  /** Dove la pallina tocca ogni fila, e quando, dall'inizio della caduta. */
  tocchi: Array<{ x: number; y: number; ms: number; piolo: string }>
  fondo: { x: number; y: number }
  /** Quando arriva in buca, e quando smette di muoversi. */
  inBuca: number
  fine: number
}

/** La strada della pallina: sopra il piolo di ogni fila, a sinistra o a destra di quello di prima, poi la buca. */
function stradaDi(percorso: readonly number[]): Strada {
  const sopra = RAGGIO_PIOLO + RAGGIO_PALLINA
  let destre = 0
  const tocchi = percorso.map((verso, r) => {
    const tocco = {
      x: (destre - r / 2) * PASSO,
      y: yFila(r) - sopra,
      ms: CADUTA_MS + r * SALTO_MS,
      piolo: `${r}-${destre + 1}`,
    }
    destre += verso
    return tocco
  })
  const inBuca = CADUTA_MS + (FILE_PACHINKO - 1) * SALTO_MS + ULTIMO_MS
  // In fondo alla buca, sotto il moltiplicatore: la pallina non lo copre.
  const fondo = { x: xBuca(bucaDi(percorso)), y: BUCHE.y + BUCHE.alte - RAGGIO_PALLINA - 1.6 }
  return { tocchi, fondo, inBuca, fine: inBuca + ASSESTA_MS }
}

/**
 * La caduta in due animazioni dello stesso tempo, una per asse: di lato la
 * pallina va dritta da un piolo all'altro, in alto e in basso rimbalza e
 * ricade, come una cosa che cade davvero.
 */
function animaCaduta(lato: SVGGElement, alto: SVGGElement, s: Strada) {
  const dove = (ms: number) => ms / s.fine
  const x: Keyframe[] = [{ transform: `translateX(${PARTENZA.x}px)`, offset: 0 }]
  const y: Keyframe[] = [{ transform: `translateY(${PARTENZA.y}px)`, offset: 0, easing: 'cubic-bezier(.5,0,.9,.6)' }]
  s.tocchi.forEach((t, r) => {
    const prossimo = s.tocchi[r + 1] ?? s.fondo
    const durata = r + 1 < s.tocchi.length ? SALTO_MS : ULTIMO_MS
    const rimbalzo = r + 1 < s.tocchi.length ? 3.4 - r * 0.18 : 2.4
    x.push({ transform: `translateX(${t.x}px)`, offset: dove(t.ms) })
    y.push({ transform: `translateY(${t.y}px)`, offset: dove(t.ms), easing: 'cubic-bezier(.25,.6,.45,1)' })
    y.push({
      transform: `translateY(${Math.min(t.y, prossimo.y) - rimbalzo}px)`,
      offset: dove(t.ms + durata * 0.34),
      easing: 'cubic-bezier(.55,0,.85,.45)',
    })
  })
  x.push({ transform: `translateX(${s.fondo.x}px)`, offset: dove(s.inBuca) })
  x.push({ transform: `translateX(${s.fondo.x}px)`, offset: 1 })
  y.push({ transform: `translateY(${s.fondo.y}px)`, offset: dove(s.inBuca), easing: 'cubic-bezier(.2,.7,.4,1)' })
  y.push({ transform: `translateY(${s.fondo.y - 2.2}px)`, offset: dove(s.inBuca + ASSESTA_MS * 0.4) })
  y.push({ transform: `translateY(${s.fondo.y}px)`, offset: 1 })
  const tempo = { duration: s.fine, fill: 'forwards' as const }
  return [lato.animate(x, tempo), alto.animate(y, tempo)]
}

/**
 * Il Pachinko di Crazy Time: un triangolo di pioli d'oro, otto file, e in fondo
 * nove buche con il loro moltiplicatore. La pallina aspetta in cima; si lancia
 * toccando il tabellone o il bottone, e la sua strada la decide il server: a
 * ogni fila a sinistra o a destra, una volta su due. Qui la si fa cadere lungo
 * quella strada, piolo dopo piolo — ognuno si accende e suona quando lo tocca
 * — finché non entra nella sua buca, che si accende. Prima del lancio la strada
 * non esiste da nessuna parte.
 *
 * Dalla ruota fortunata il tabellone arriva con i moltiplicatori di sempre, e
 * appena si vede salgono, dal piu' piccolo; i due ×15 ai lati per ultimi,
 * contando fino al ×30. Solo dopo si lancia. Senza animazioni la pallina e' gia'
 * nella sua buca, e i premi sono gia' saliti.
 */
export function Pachinko({
  moltiplicatori,
  fortunata,
  percorso,
  via,
  subito,
  inVolo,
  lanciabile,
  onLancia,
  onFase,
  onArrivo,
}: {
  /** Le buche, da sinistra: quelle della fortuna, se si viene da li'. */
  moltiplicatori: readonly number[]
  fortunata: boolean
  /** La strada della pallina: c'e' da quando il server l'ha fatta cadere. */
  percorso: readonly number[] | null
  /** Il tabellone si vede: i premi della fortuna possono salire. */
  via: boolean
  /** Una pagina riaperta: niente premi che salgono, sono gia' saliti. */
  subito: boolean
  /** Il lancio e' chiesto al server. */
  inVolo: boolean
  lanciabile: boolean
  onLancia: () => void
  onFase: (fase: FasePachinko) => void
  onArrivo: () => void
}) {
  // La strada che c'era quando il tabellone e' comparso: quella pallina e' gia' in buca.
  const [giaCaduta] = useState(() => percorso)
  const [modo, setModo] = useState<'normale' | 'aumento' | 'fortunata'>(
    fortunata && (subito || giaCaduta) ? 'fortunata' : 'normale',
  )
  const [caduta, setCaduta] = useState<'no' | 'cade' | 'si'>(giaCaduta ? 'si' : 'no')
  const lato = useRef<SVGGElement>(null)
  const alto = useRef<SVGGElement>(null)
  const attuali = useRef({ onFase, onArrivo })
  useEffect(() => {
    attuali.current = { onFase, onArrivo }
  })

  // Dalla fortuna, appena il tabellone si vede: i premi salgono, con i loro suoni.
  useEffect(() => {
    if (!via || modo !== 'normale' || !fortunata) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setModo('fortunata')
      suona('magia')
      return
    }
    setModo('aumento')
    AUMENTO_PACHINKO.passi.forEach((ms, k) => suona('sale', { ritardo: ms / 1000, altezza: 1 + k * 0.1 }))
    AUMENTO_PACHINKO.conto
      .slice(1)
      .forEach((p, k) => suona('incasso', { ritardo: p.ms / 1000, altezza: 1 + k * 0.14 }))
    suona('magia', { ritardo: AUMENTO_PACHINKO.conto[AUMENTO_PACHINKO.conto.length - 1].ms / 1000 })
  }, [via, modo, fortunata])

  // Saliti tutti, la pallina si puo' lanciare.
  useEffect(() => {
    if (modo !== 'aumento') return
    const t = window.setTimeout(() => setModo('fortunata'), AUMENTO_PACHINKO.durata)
    return () => window.clearTimeout(t)
  }, [modo])

  // La strada e' arrivata: la pallina cade, piolo dopo piolo, e quando e' in buca lo si dice.
  useEffect(() => {
    if (!percorso || percorso === giaCaduta) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !lato.current || !alto.current) {
      setCaduta('si')
      suona('buca')
      attuali.current.onArrivo()
      return
    }
    const s = stradaDi(percorso)
    setCaduta('cade')
    const animazioni = animaCaduta(lato.current, alto.current, s)
    s.tocchi.forEach((t, r) => suona('pallina', { ritardo: t.ms / 1000, altezza: 1 + r * 0.045 }))
    suona('buca', { ritardo: s.inBuca / 1000 })
    const fine = window.setTimeout(() => setCaduta('si'), s.fine)
    const arrivo = window.setTimeout(() => attuali.current.onArrivo(), s.fine + IN_BUCA_MS)
    return () => {
      window.clearTimeout(fine)
      window.clearTimeout(arrivo)
      animazioni.forEach((a) => a.cancel())
    }
  }, [percorso, giaCaduta])

  const fase: FasePachinko =
    caduta === 'si' ? 'caduta' : caduta === 'cade' ? 'cade' : inVolo ? 'carica' : modo === 'aumento' ? 'sale' : 'pronta'
  useEffect(() => {
    attuali.current.onFase(fase)
  }, [fase])

  const strada = percorso ? stradaDi(percorso) : null
  const buca = percorso ? bucaDi(percorso) : null
  const colpiti = new Map(strada?.tocchi.map((t) => [t.piolo, t.ms]) ?? [])
  const pronta = fase === 'pronta' && lanciabile
  const lancia = () => {
    if (pronta) onLancia()
  }
  const normali = fortunata ? MOLTIPLICATORI_PACHINKO : moltiplicatori
  const vista = `${VISTA.x} ${VISTA.y} ${VISTA.larghezza} ${VISTA.altezza}`
  const ferma = caduta === 'si' && strada ? strada.fondo : PARTENZA
  return (
    <div
      className={`ct-pachinko is-${fase}${modo !== 'normale' ? ' is-fortunata' : ''}${
        modo === 'aumento' ? ' is-aumento' : ''
      }`}
      onClick={lancia}
    >
      <svg className="ct-pachinko__svg" viewBox={vista} role="img" aria-label={descrizione(moltiplicatori, buca)}>
        <defs>
          <radialGradient id="ct-pachinko-pallina" cx="35%" cy="30%" r="75%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.55" stopColor="#dfe6f2" />
            <stop offset="1" stopColor="#7d8aa3" />
          </radialGradient>
        </defs>
        <rect className="ct-pachinko__fondo" x={-49} y={-4} width={98} height={113} rx={9} />
        <path className="ct-pachinko__imbuto" d="M-9 -4L-3.6 9.4H3.6L9 -4" />
        {PIOLI.map((p) => {
          const ms = colpiti.get(`${p.r}-${p.k}`)
          return (
            <circle
              key={`${p.r}-${p.k}`}
              className={`ct-pachinko__piolo${ms !== undefined && caduta === 'cade' ? ' is-colpito' : ''}`}
              cx={p.x}
              cy={p.y}
              r={RAGGIO_PIOLO}
              style={ms !== undefined ? ({ '--colpo': `${ms}ms` } as CSSProperties) : undefined}
            />
          )
        })}
        {moltiplicatori.map((m, k) => {
          const massimo = AUMENTO_PACHINKO.massimi.includes(k)
          return (
            <g
              key={k}
              className={`ct-pachinko__buca is-${Math.abs(k - FILE_PACHINKO / 2)}${
                buca === k && caduta === 'si' ? ' is-uscita' : ''
              }${massimo ? ' is-massima' : ''}`}
              transform={`translate(${xBuca(k)} ${BUCHE.y})`}
              style={
                {
                  '--ritardo': `${AUMENTO_PACHINKO.ritardo(k)}ms`,
                  ...(massimo ? { '--fine': FINE_AUMENTO } : {}),
                } as CSSProperties
              }
            >
              <rect
                className="ct-pachinko__vano"
                x={-BUCHE.larghe / 2}
                width={BUCHE.larghe}
                height={BUCHE.alte}
                rx={2}
              />
              <g className="ct-pachinko__valore is-normale">
                <ValoreBuca m={normali[k]} />
              </g>
              {fortunata && (
                <g className="ct-pachinko__valore is-fortunata">
                  {massimo ? (
                    AUMENTO_PACHINKO.conto.slice(1).map((p, i) => (
                      <ValoreBuca
                        key={p.valore}
                        m={p.valore}
                        classe={`ct-conto${i === AUMENTO_PACHINKO.conto.length - 2 ? ' is-ultimo' : ''}`}
                        stile={tempiDelConto(AUMENTO_PACHINKO.conto, i + 1)}
                      />
                    ))
                  ) : (
                    <ValoreBuca m={m} />
                  )}
                </g>
              )}
            </g>
          )
        })}
        <g ref={lato} className="ct-pachinko__lato" style={{ transform: `translateX(${ferma.x}px)` }}>
          <g ref={alto} className="ct-pachinko__alto" style={{ transform: `translateY(${ferma.y}px)` }}>
            <g className="ct-pachinko__pallina">
              <circle r={RAGGIO_PALLINA} fill="url(#ct-pachinko-pallina)" />
              <circle className="ct-pachinko__luce" cx={-0.9} cy={-1} r={0.8} />
            </g>
          </g>
        </g>
      </svg>
      {modo === 'aumento' && <PremioCheSale passi={AUMENTO_PACHINKO.conto} />}
    </div>
  )
}

/** Il moltiplicatore scritto nella buca: grande, con la virgola stretta. */
function ValoreBuca({ m, classe = '', stile }: { m: number; classe?: string; stile?: CSSProperties }) {
  const testo = scriviMoltiplicatore(m)
  return (
    <text
      className={`ct-pachinko__testo ${classe}`}
      y={BUCHE.alte / 3}
      fontSize={testo.length > 3 ? 3.5 : 4.2}
      style={stile}
    >
      {testo}
    </text>
  )
}

/** Il tabellone per chi non lo vede: le buche, e dove e' caduta la pallina. */
function descrizione(moltiplicatori: readonly number[], buca: number | null): string {
  const buche = moltiplicatori.map(scriviMoltiplicatore).join(', ')
  return buca === null
    ? `Il Pachinko: nove buche, da sinistra ${buche}`
    : `La pallina è nella buca del ${scriviMoltiplicatore(moltiplicatori[buca])}`
}
