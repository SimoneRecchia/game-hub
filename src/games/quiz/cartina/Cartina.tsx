import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as EventoPuntatore,
  type WheelEvent as EventoRotella,
} from 'react'
import type { VistaCartina } from '@shared/quiz'
import { caricaAcque, caricaPaesi, proiezione, tracciato, type Luogo } from './geometria'
import './Cartina.css'

export interface EsitoCartina {
  giusta: string
  /** I posti che valevano come giusti: il Tirreno, per il Mediterraneo. */
  accettate: string[]
  /** Il posto toccato, se c'e' stato. */
  scelta: string | null
}

interface Props {
  vista: VistaCartina
  /** Cosa si tocca: i paesi, o i mari. */
  strato: 'paesi' | 'acque'
  scelta: string | null
  /** Senza, la cartina si guarda e basta: e' la risposta gia' data. */
  onScegli?: (id: string) => void
  esito?: EsitoCartina | null
  etichetta: string
}

interface Trasformazione {
  k: number
  x: number
  y: number
}

const ZOOM_MASSIMO = 10
/** Sotto questi pixel un dito che si sposta tocca, non trascina. */
const SOGLIA_TRASCINA = 7

/**
 * La cartina muta: i paesi senza nomi, e da trovare con un dito.
 *
 * Si ingrandisce con due dita (o la rotella), si sposta trascinando, e un tocco
 * sceglie. Un tocco nel mare vicino a un paese piccolo lo sceglie lo stesso: la
 * cartina guarda attorno al dito, perché il Lussemburgo su un telefono e' un
 * punto. Il posto scelto si colora e resta finché non se ne tocca un altro; la
 * conferma sta fuori, nella domanda.
 *
 * A risposta data il posto giusto si accende di verde — con i mari che valevano
 * come lui — e quello sbagliato di rosso, e la cartina ci va sopra da sola se e'
 * piccolo.
 */
export function Cartina({ vista, strato, scelta, onScegli, esito, etichetta }: Props) {
  const [paesi, setPaesi] = useState<Luogo[] | null>(null)
  const [acque, setAcque] = useState<Luogo[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [tentativo, setTentativo] = useState(0)

  useEffect(() => {
    let vivo = true
    setErrore(null)
    caricaPaesi()
      .then((p) => vivo && setPaesi(p))
      .catch((e: Error) => vivo && setErrore(e.message))
    if (strato === 'acque') {
      caricaAcque()
        .then((a) => vivo && setAcque(a))
        .catch((e: Error) => vivo && setErrore(e.message))
    }
    return () => {
      vivo = false
    }
  }, [strato, tentativo])

  const contenitore = useRef<HTMLDivElement>(null)
  const [misura, setMisura] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const nodo = contenitore.current
    if (!nodo) return
    const osserva = new ResizeObserver(([voce]) => {
      const { width, height } = voce.contentRect
      setMisura({ w: Math.round(width), h: Math.round(height) })
    })
    osserva.observe(nodo)
    return () => osserva.disconnect()
  }, [])

  const p = useMemo(() => proiezione(vista), [vista])
  const base = misura.w > 0 && misura.h > 0 ? Math.min(misura.w / p.larghezza, misura.h / p.altezza) : 1
  const centrata = useCallback(
    (): Trasformazione => ({ k: 1, x: (misura.w - p.larghezza * base) / 2, y: (misura.h - p.altezza * base) / 2 }),
    [misura.w, misura.h, p, base],
  )
  const [t, setT] = useState<Trasformazione>({ k: 1, x: 0, y: 0 })
  const [animata, setAnimata] = useState(false)
  useEffect(() => setT(centrata()), [centrata])

  // I tracciati si calcolano una volta per vista e grandezza: la tolleranza e'
  // mezzo pixel allo zoom di tre, dove la cartina si guarda da vicino.
  const tolleranza = misura.w > 0 ? 0.5 / (base * 3) : 0.05
  const tracciatiPaesi = useMemo(
    () => (paesi ?? []).map((l) => ({ id: l.id, d: tracciato(l, p, tolleranza) })).filter((x) => x.d),
    [paesi, p, tolleranza],
  )
  const tracciatiAcque = useMemo(
    () => (acque ?? []).map((l) => ({ id: l.id, d: tracciato(l, p, tolleranza) })).filter((x) => x.d),
    [acque, p, tolleranza],
  )

  /* ── Toccare, trascinare, ingrandire ── */

  const puntatori = useRef(new Map<number, { x: number; y: number }>())
  const gesto = useRef<{
    inizio: { x: number; y: number }
    trascina: boolean
    pizzico: { distanza: number; centro: { x: number; y: number }; t: Trasformazione } | null
    t: Trasformazione
  } | null>(null)

  const limita = useCallback(
    (n: Trasformazione): Trasformazione => {
      const k = Math.min(ZOOM_MASSIMO, Math.max(1, n.k))
      const larga = p.larghezza * base * k
      const alta = p.altezza * base * k
      // La cartina non scappa dallo schermo: al piu' mezzo schermo di mare oltre il bordo.
      const x = Math.min(misura.w / 2, Math.max(misura.w / 2 - larga, n.x))
      const y = Math.min(misura.h / 2, Math.max(misura.h / 2 - alta, n.y))
      return { k, x, y }
    },
    [p, base, misura.w, misura.h],
  )

  /** Ingrandisce di `fattore` tenendo fermo il punto dello schermo (px, py). */
  const ingrandisci = useCallback(
    (da: Trasformazione, fattore: number, px: number, py: number): Trasformazione => {
      const k = Math.min(ZOOM_MASSIMO, Math.max(1, da.k * fattore))
      const f = k / da.k
      return limita({ k, x: px - (px - da.x) * f, y: py - (py - da.y) * f })
    },
    [limita],
  )

  const luogoSotto = useCallback(
    (cx: number, cy: number): string | null => {
      const cerca = (x: number, y: number) => {
        for (const el of document.elementsFromPoint(x, y)) {
          if (!(el instanceof SVGElement) || !contenitore.current?.contains(el)) continue
          if (el.dataset.strato === strato && el.dataset.luogo) return el.dataset.luogo
        }
        return null
      }
      const diretto = cerca(cx, cy)
      if (diretto) return diretto
      // Attorno al dito: il posto che compare piu' spesso in due giri di punti.
      const voti = new Map<string, number>()
      for (const raggio of [9, 16]) {
        for (let i = 0; i < 12; i += 1) {
          const a = (i / 12) * Math.PI * 2
          const id = cerca(cx + Math.cos(a) * raggio, cy + Math.sin(a) * raggio)
          if (id) voti.set(id, (voti.get(id) ?? 0) + (raggio === 9 ? 2 : 1))
        }
      }
      let migliore: string | null = null
      let piu = 0
      for (const [id, n] of voti) {
        if (n > piu) {
          piu = n
          migliore = id
        }
      }
      return migliore
    },
    [strato],
  )

  const giu = (e: EventoPuntatore<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const rett = e.currentTarget.getBoundingClientRect()
    puntatori.current.set(e.pointerId, { x: e.clientX - rett.left, y: e.clientY - rett.top })
    setAnimata(false)
    const punti = [...puntatori.current.values()]
    if (punti.length === 1) {
      gesto.current = { inizio: punti[0], trascina: false, pizzico: null, t }
    } else if (punti.length === 2 && gesto.current) {
      const [a, b] = punti
      gesto.current.pizzico = {
        distanza: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        centro: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        t,
      }
      gesto.current.trascina = true
    }
  }

  const muovi = (e: EventoPuntatore<HTMLDivElement>) => {
    if (!puntatori.current.has(e.pointerId) || !gesto.current) return
    const rett = e.currentTarget.getBoundingClientRect()
    puntatori.current.set(e.pointerId, { x: e.clientX - rett.left, y: e.clientY - rett.top })
    const punti = [...puntatori.current.values()]
    const g = gesto.current
    if (g.pizzico && punti.length >= 2) {
      const [a, b] = punti
      const distanza = Math.hypot(a.x - b.x, a.y - b.y)
      const centro = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const z = ingrandisci(g.pizzico.t, distanza / g.pizzico.distanza, g.pizzico.centro.x, g.pizzico.centro.y)
      setT(limita({ ...z, x: z.x + centro.x - g.pizzico.centro.x, y: z.y + centro.y - g.pizzico.centro.y }))
      return
    }
    const [p0] = punti
    const dx = p0.x - g.inizio.x
    const dy = p0.y - g.inizio.y
    if (!g.trascina && Math.hypot(dx, dy) > SOGLIA_TRASCINA) g.trascina = true
    if (g.trascina) setT(limita({ ...g.t, x: g.t.x + dx, y: g.t.y + dy }))
  }

  const su = (e: EventoPuntatore<HTMLDivElement>) => {
    const g = gesto.current
    puntatori.current.delete(e.pointerId)
    if (puntatori.current.size === 1 && g?.pizzico) {
      // Da due dita a una: si riparte a trascinare da dov'e' adesso.
      const [resto] = puntatori.current.values()
      gesto.current = { inizio: resto, trascina: true, pizzico: null, t }
      return
    }
    if (puntatori.current.size > 0) return
    gesto.current = null
    if (!g || g.trascina || !onScegli) return
    const id = luogoSotto(e.clientX, e.clientY)
    if (id) onScegli(id)
  }

  const rotella = (e: EventoRotella<HTMLDivElement>) => {
    const rett = e.currentTarget.getBoundingClientRect()
    setAnimata(false)
    setT((da) => ingrandisci(da, Math.exp(-e.deltaY * 0.0016), e.clientX - rett.left, e.clientY - rett.top))
  }

  const bottone = (fattore: number) => {
    setAnimata(true)
    setT((da) => (fattore === 0 ? centrata() : ingrandisci(da, fattore, misura.w / 2, misura.h / 2)))
  }

  // A risposta data, se il posto giusto e' piccolo la cartina ci va sopra.
  const giustoRef = useRef<SVGPathElement>(null)
  useEffect(() => {
    if (!esito || !giustoRef.current || misura.w === 0) return
    const box = giustoRef.current.getBBox()
    const lato = Math.max(box.width, box.height) * base
    if (lato > Math.min(misura.w, misura.h) * 0.25) return
    const k = Math.min(6, Math.max(1, (Math.min(misura.w, misura.h) * 0.3) / Math.max(lato, 1)))
    const cx = (box.x + box.width / 2) * base * k
    const cy = (box.y + box.height / 2) * base * k
    setAnimata(true)
    setT(limita({ k, x: misura.w / 2 - cx, y: misura.h / 2 - cy }))
  }, [esito, base, misura.w, misura.h, limita])

  const classe = (id: string, livello: 'paesi' | 'acque') => {
    const c = [`cartina__${livello === 'paesi' ? 'paese' : 'acqua'}`]
    if (esito) {
      if (id === esito.giusta) c.push('is-giusta')
      else if (esito.accettate.includes(id)) c.push('is-accettata')
      else if (id === esito.scelta) c.push('is-sbagliata')
    } else if (id === scelta) {
      c.push('is-scelta')
    }
    return c.join(' ')
  }

  const pronta = paesi && (strato === 'paesi' || acque) && misura.w > 0
  const s = base * t.k

  return (
    <div
      ref={contenitore}
      className={`cartina cartina--${strato}${onScegli ? ' is-attiva' : ''}`}
      role="application"
      aria-label={etichetta}
      onPointerDown={giu}
      onPointerMove={muovi}
      onPointerUp={su}
      onPointerCancel={su}
      onWheel={rotella}
    >
      {errore ? (
        <div className="cartina__avviso">
          <p>{errore}</p>
          <button type="button" className="cartina__riprova" onClick={() => setTentativo((n) => n + 1)}>
            Riprova
          </button>
        </div>
      ) : !pronta ? (
        <div className="cartina__avviso is-attesa" aria-live="polite">
          Apro la cartina…
        </div>
      ) : (
        <svg className="cartina__svg" viewBox={`0 0 ${misura.w} ${misura.h}`} width={misura.w} height={misura.h}>
          <g
            className={`cartina__mondo${animata ? ' is-animata' : ''}`}
            style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${s})` }}
          >
            {strato === 'acque' &&
              tracciatiAcque.map((a) => (
                <path
                  key={a.id}
                  ref={esito?.giusta === a.id ? giustoRef : undefined}
                  d={a.d}
                  className={classe(a.id, 'acque')}
                  data-luogo={a.id}
                  data-strato="acque"
                />
              ))}
            {tracciatiPaesi.map((l) => (
              <path
                key={l.id}
                ref={esito?.giusta === l.id ? giustoRef : undefined}
                d={l.d}
                className={classe(l.id, 'paesi')}
                data-luogo={l.id}
                data-strato="paesi"
              />
            ))}
          </g>
        </svg>
      )}
      {pronta && (
        <div className="cartina__zoom" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" aria-label="Ingrandisci" onClick={() => bottone(1.8)}>
            +
          </button>
          <button type="button" aria-label="Rimpicciolisci" onClick={() => bottone(1 / 1.8)}>
            −
          </button>
          {t.k > 1.05 && (
            <button type="button" aria-label="Torna alla vista intera" onClick={() => bottone(0)}>
              ⤢
            </button>
          )}
        </div>
      )}
    </div>
  )
}
