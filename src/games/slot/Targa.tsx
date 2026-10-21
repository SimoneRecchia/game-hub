import { useEffect, useId, useRef, type CSSProperties } from 'react'
import { suona } from '@/lib/suoni'
import { mulberry32 } from '@shared/daily'
import type { MomentoMobile } from './momenti'
import { anima, disegnaMoneta, muovi, preparaCanvas, stella, type Moneta } from './monete'
import './Targa.css'

/**
 * Le vincite piccole e di mezzo, sul mobile: l'adesivo dei giochi fatto
 * insegna da casino'. Una targa laccata con la foglia d'oro, le lampadine che
 * le corrono attorno e la luce che passa sulle lettere, che salta fuori davanti
 * all'insegna in cima al mobile: li' non copre mai la linea, e i simboli che
 * pagano si vedono mentre ballano.
 *
 * Tre gradini, come la rarita'. La targhetta della ciliegia sola e' piccola e
 * corta, perché esce un giro ogni quattro e la leva deve tornare pronta presto.
 * La targa di due ciliegie e dei limoni e' piu' grande, e da dietro le saltano
 * fuori le monete. Il palco delle arance e delle prugne ha i raggi che girano
 * dietro il mobile, la fontana di monete e le lampadine che corrono il doppio.
 *
 * Le monete sono un canvas, con un seme fisso: la stessa vincita fa sempre la
 * stessa fontana. Senza animazioni la targa compare e se ne va, e basta.
 */

export interface DatiTarga {
  chiave: number
  momento: MomentoMobile
  /** Il nome della combinazione: "Ciliegia", "Limoni". */
  nome: string
  vincita: number
}

/** Quanto resta ogni targa, in millisecondi: le animazioni in Targa.css sono frazioni di questa durata. */
export const DURATA_TARGA: Record<MomentoMobile, number> = { targhetta: 1_250, targa: 1_750, palco: 2_650 }

/** Quanto e' larga, in centesimi del mobile. */
const LARGA: Record<MomentoMobile, number> = { targhetta: 64, targa: 80, palco: 92 }

/** Il disegno: la targa, e dentro l'orlo la fascia dove stanno le lampadine. */
const LATO = { w: 320, h: 104 }
const FASCIA = { x: 15, y: 15, w: 290, h: 70, r: 12 }
const LAMPADINE = 30
/** Il passo fra due lampadine lungo la fascia: il perimetro di un rettangolo dagli angoli tondi, diviso per quante. */
const PASSO = (2 * (FASCIA.w + FASCIA.h) - 2 * (4 - Math.PI) * FASCIA.r) / LAMPADINE

/** Dove sta la targa nel canvas, e quanto e' grande: in pixel, senza le trasformazioni dell'entrata. */
interface Posto {
  cx: number
  cy: number
  larga: number
  alta: number
}

/** Quel che salta fuori da dietro la targa: monete a manciate, o una fontana dai due capi. */
function monete(canvas: HTMLCanvasElement, piastra: Posto, momento: 'targa' | 'palco'): () => void {
  const pronto = preparaCanvas(canvas)
  if (!pronto) return () => {}
  const { ctx, W, H } = pronto
  const { cx, cy } = piastra
  // Un centesimo del mobile, in pixel: le misure delle monete e dei voli seguono la sua grandezza.
  const u = piastra.larga / LARGA[momento]
  const caso = mulberry32(momento === 'targa' ? 0x5107 : 0xa1ca)
  const gravita = 290 * u
  const tutte: Moneta[] = []
  // Le monete escono dalla meta' esterna della targa e volano in fuori abbastanza da ricadere oltre i fianchi del
  // mobile: davanti ai rulli coprirebbero la linea.
  const nasce = (adesso: number, lato: number, alta: boolean) => {
    const dove = momento === 'palco' ? 0.44 + caso() * 0.04 : 0.2 + caso() * 0.26
    tutte.push({
      x: cx + lato * dove * piastra.larga,
      y: cy - piastra.alta * (0.1 + caso() * 0.25),
      vx: lato * (alta ? 26 + caso() * 16 : 40 + caso() * 42) * u,
      vy: -(alta ? 135 + caso() * 40 : 80 + caso() * 70) * u,
      giro: caso() * Math.PI,
      vgiro: 7 + caso() * 9,
      r: (1.9 + caso() * 1.3) * u,
      nata: adesso,
    })
  }
  if (momento === 'targa') {
    for (let i = 0; i < 18; i += 1) nasce(0, i % 2 === 0 ? -1 : 1, false)
  }
  // La fontana del palco: un getto da ogni capo della targa, una moneta ogni trenta millisecondi, una su cinque
  // piu' alta e piu' dritta; e attorno alla targa le stelle che si accendono e si spengono.
  const FINE_GETTO = 1_450
  let uscite = 0
  const stelle: Array<{ x: number; y: number; nata: number }> = []
  let accese = 0
  return anima((ms, dt) => {
    if (momento === 'palco' && ms > 120 && ms < FINE_GETTO) {
      while (uscite < (ms - 120) / 30) {
        uscite += 1
        nasce(ms, uscite % 2 === 0 ? -1 : 1, uscite % 5 === 0)
      }
      while (accese < (ms - 120) / 90) {
        accese += 1
        const a = caso() * Math.PI * 2
        stelle.push({ x: cx + Math.cos(a) * piastra.larga * 0.58, y: cy + Math.sin(a) * piastra.alta * 0.9, nata: ms })
      }
    }
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#fffbe6'
    for (let i = stelle.length - 1; i >= 0; i -= 1) {
      const s = stelle[i]
      const v = (ms - s.nata) / 600
      if (v >= 1) {
        stelle.splice(i, 1)
        continue
      }
      ctx.globalAlpha = Math.sin(v * Math.PI)
      stella(ctx, s.x, s.y, u * (1.2 + 2.4 * Math.sin(v * Math.PI)), v * 2)
    }
    ctx.globalAlpha = 1
    for (let i = tutte.length - 1; i >= 0; i -= 1) {
      const m = tutte[i]
      muovi(m, dt, gravita)
      m.giro += m.vgiro * dt
      const eta = ms - m.nata
      // Una moneta che ricade davanti ai rulli si spegne prima di arrivarci: la linea resta sempre libera.
      const davanti = m.vy > 0 && Math.abs(m.x - cx) < 47 * u ? (m.y - cy - 16 * u) / (8 * u) : 0
      const alfa = Math.min(1, (2_200 - eta) / 400, 1 - davanti)
      if (m.y > H + m.r * 2 || alfa <= 0) {
        tutte.splice(i, 1)
        continue
      }
      disegnaMoneta(ctx, m, alfa)
    }
    return ms < FINE_GETTO || tutte.length > 0 || stelle.length > 0
  })
}

export function Targa({ dati }: { dati: DatiTarga }) {
  const id = useId().replace(/:/g, '')
  const canvas = useRef<HTMLCanvasElement>(null)
  const piastra = useRef<HTMLDivElement>(null)
  const { momento } = dati

  useEffect(() => {
    if (momento === 'targa') suona('manciata', { ritardo: 0.12 })
    if (momento === 'palco') suona('fanfara', { ritardo: 0.3 })
    const ridotto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const c = canvas.current
    const p = piastra.current
    if (ridotto || momento === 'targhetta' || !c || !p) return
    // Le misure del disegno, non quelle di adesso: la targa sta entrando piccola e storta. Canvas e targa stanno
    // tutti e due nel mobile, e la targa e' spostata indietro di meta' (`translate`): il suo angolo e' il centro.
    const posto = {
      cx: p.offsetLeft - c.offsetLeft,
      cy: p.offsetTop - c.offsetTop,
      larga: p.offsetWidth,
      alta: p.offsetHeight,
    }
    return monete(c, posto, momento)
  }, [momento])

  const testo = `+${dati.vincita.toLocaleString('it-IT')}`
  const stile = {
    '--durata': `${DURATA_TARGA[momento]}ms`,
    '--larga': LARGA[momento],
    '--passo': `${PASSO.toFixed(3)}px`,
  } as CSSProperties
  /*
   * La targa del mockup: un cartello giallo pieno, con il filo d'inchiostro,
   * l'anello nel colore della vincita e l'ombra secca sotto; dentro l'orlo le
   * lampadine, e la luce che passa una volta.
   */
  return (
    <>
      {momento === 'palco' && <span className="slot-targa__raggi" style={stile} aria-hidden="true" />}
      {momento !== 'targhetta' && <canvas className="slot-targa__monete" ref={canvas} aria-hidden="true" />}
      <div className={`slot-targa is-${momento}`} style={stile} ref={piastra} aria-hidden="true">
        <svg className="slot-targa__disegno" viewBox={`0 0 ${LATO.w} ${LATO.h}`}>
          <defs>
            <linearGradient id={`${id}-giallo`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff3b0" />
              <stop offset="1" stopColor="#f4c430" />
            </linearGradient>
            <linearGradient id={`${id}-luce`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.75" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <clipPath id={`${id}-forma`}>
              <rect x={8} y={7} width={304} height={84} rx={18} />
            </clipPath>
          </defs>
          <rect x={2} y={9} width={316} height={92} rx={23} className="slot-targa__ombra" />
          <rect x={2} y={2} width={316} height={94} rx={23} className="slot-targa__anello" />
          <rect x={6.5} y={5.5} width={307} height={87} rx={19} fill={`url(#${id}-giallo)`} className="slot-targa__piastra" />
          <rect x={10} y={8.5} width={300} height={10} rx={5} fill="#fff" opacity={0.45} />
          <rect
            className="slot-targa__spente"
            x={FASCIA.x}
            y={FASCIA.y}
            width={FASCIA.w}
            height={FASCIA.h}
            rx={FASCIA.r}
            strokeDasharray={`0 ${PASSO.toFixed(3)}`}
          />
          <rect
            className="slot-targa__accese"
            x={FASCIA.x}
            y={FASCIA.y}
            width={FASCIA.w}
            height={FASCIA.h}
            rx={FASCIA.r}
            strokeDasharray={`0 ${(PASSO * 3).toFixed(3)}`}
          />
          <text x={160} y={52} className="slot-targa__nome">
            {dati.nome}
          </text>
          <text x={160} y={76} className="slot-targa__importo">
            {testo}
          </text>
          <g clipPath={`url(#${id}-forma)`}>
            <rect className="slot-targa__luce" x={-110} y={-20} width={70} height={150} fill={`url(#${id}-luce)`} />
          </g>
        </svg>
      </div>
    </>
  )
}
