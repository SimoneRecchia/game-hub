import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { suona } from '@/lib/suoni'
import './Festa.css'

/**
 * La festa di una grande vincita, come nelle slot vere: lo schermo si spegne,
 * girano i raggi, arriva la scritta — BIG WIN, MEGA WIN, JACKPOT — e la
 * vincita conta da zero fino in fondo, con le monete che tintinnano, mentre
 * una fontana di monete esce dal fondo e ricade. Un tocco fa finire il conto,
 * un secondo tocco chiude. Sta nel body, sopra a tutto, e non decide niente:
 * la vincita e' gia' scritta, qui si festeggia.
 *
 * Le monete sono un canvas: cento elementi animati dal DOM costerebbero
 * troppo a un telefono, mentre il canvas disegna tutto in un passo.
 */

export type LivelloFesta = 'big' | 'mega' | 'jackpot'

export interface DatiFesta {
  chiave: number
  livello: LivelloFesta
  vincita: number
  /** Sotto il numero: "10 × 300", "Domanda giusta". */
  sotto?: string
}

const TITOLI: Record<LivelloFesta, string> = { big: 'BIG WIN', mega: 'MEGA WIN', jackpot: 'JACKPOT' }
/** Quanto conta il numero, e quanto resta in vista dopo. */
const CONTA_MS: Record<LivelloFesta, number> = { big: 1_900, mega: 2_900, jackpot: 3_800 }
const RESTA_MS = 1_300
/** Quanto ci mette la luce ad attraversare la scritta. */
const LUCE_S: Record<LivelloFesta, string> = { big: '1.8s', mega: '1.3s', jackpot: '0.9s' }
/** Le monete per fotogramma, mentre la fontana getta, e quelle che piovono dall'alto. */
const GETTO: Record<LivelloFesta, number> = { big: 2.4, mega: 3.6, jackpot: 5 }
const PIOGGIA: Record<LivelloFesta, number> = { big: 0, mega: 0.8, jackpot: 2.2 }
/** Le scintille attorno alla scritta, per fotogramma, e quanto dura ognuna. */
const SCINTILLE: Record<LivelloFesta, number> = { big: 0.35, mega: 0.6, jackpot: 0.9 }
const VITA_SCINTILLA_MS = 650

interface Moneta {
  x: number
  y: number
  vx: number
  vy: number
  giro: number
  vgiro: number
  r: number
}

interface Scintilla {
  x: number
  y: number
  r: number
  nata: number
}

/** Una scintilla: una stella a quattro punte che si accende e si spegne, girando. */
function stella(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, giro: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(giro)
  ctx.beginPath()
  for (let k = 0; k < 8; k += 1) {
    const raggio = k % 2 === 0 ? r : r * 0.2
    const a = (k * Math.PI) / 4
    ctx.lineTo(Math.cos(a) * raggio, Math.sin(a) * raggio)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/**
 * La fontana di monete: dal fondo in su a ventaglio, e giu' con la gravita';
 * per le vincite piu' grandi piovono anche dall'alto, e attorno alla scritta
 * si accendono le scintille. Si ferma quando l'ultima moneta e' uscita.
 */
function fontana(canvas: HTMLCanvasElement, livello: LivelloFesta, durata: number): () => void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const W = canvas.clientWidth
  const H = canvas.clientHeight
  canvas.width = W * dpr
  canvas.height = H * dpr
  ctx.scale(dpr, dpr)
  const monete: Moneta[] = []
  const scintille: Scintilla[] = []
  const inizio = performance.now()
  let fondo = 0
  let cielo = 0
  let luci = 0
  let frame = 0
  const getti = livello === 'jackpot' ? [0.5, 0.18, 0.82] : livello === 'mega' ? [0.5, 0.3, 0.7] : [0.5, 0.42, 0.58]
  const getta = (dove: number) => {
    const forza = H / 30
    monete.push({
      x: W * dove + (Math.random() - 0.5) * 40,
      y: H + 20,
      vx: (Math.random() - 0.5) * (W / 70) + (0.5 - dove) * 3 + (Math.random() - 0.5) * (W / 90),
      vy: -(forza * 0.8 + Math.random() * forza * 0.6),
      giro: Math.random() * Math.PI,
      vgiro: 0.12 + Math.random() * 0.22,
      r: 9 + Math.random() * 9,
    })
  }
  const piove = () =>
    monete.push({
      x: Math.random() * W,
      y: -30,
      vx: (Math.random() - 0.5) * 2,
      vy: 2 + Math.random() * 4,
      giro: Math.random() * Math.PI,
      vgiro: 0.1 + Math.random() * 0.2,
      r: 8 + Math.random() * 8,
    })
  const passo = (t: number) => {
    const da = t - inizio
    if (da < durata) {
      fondo += GETTO[livello]
      cielo += PIOGGIA[livello]
      luci += SCINTILLE[livello]
      while (fondo >= 1) {
        fondo -= 1
        getta(getti[Math.floor(Math.random() * getti.length)])
      }
      while (cielo >= 1) {
        cielo -= 1
        piove()
      }
      while (luci >= 1) {
        luci -= 1
        // Attorno alla scritta: un anello largo quanto lo schermo, un po' sopra il centro.
        const a = Math.random() * Math.PI * 2
        const d = 0.18 + Math.random() * 0.3
        scintille.push({ x: W / 2 + Math.cos(a) * W * d, y: H * 0.42 + Math.sin(a) * W * d * 0.6, r: 6, nata: t })
      }
    }
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#fffbe6'
    for (let i = scintille.length - 1; i >= 0; i -= 1) {
      const sc = scintille[i]
      const u = (t - sc.nata) / VITA_SCINTILLA_MS
      if (u >= 1) {
        scintille.splice(i, 1)
        continue
      }
      ctx.globalAlpha = Math.sin(u * Math.PI)
      stella(ctx, sc.x, sc.y, sc.r + sc.r * 1.6 * Math.sin(u * Math.PI), u * 2)
    }
    ctx.globalAlpha = 1
    for (let i = monete.length - 1; i >= 0; i -= 1) {
      const m = monete[i]
      m.vy += H / 1400
      m.x += m.vx
      m.y += m.vy
      m.giro += m.vgiro
      if (m.y > H + 40 && m.vy > 0) {
        monete.splice(i, 1)
        continue
      }
      // Una moneta che gira: un'ellisse che si stringe e si allarga, d'oro, con il bordo piu' scuro.
      const larga = Math.max(0.12, Math.abs(Math.cos(m.giro)))
      const g = ctx.createLinearGradient(m.x - m.r, m.y - m.r, m.x + m.r, m.y + m.r)
      g.addColorStop(0, '#fff6c8')
      g.addColorStop(0.45, '#f4c430')
      g.addColorStop(1, '#a2650e')
      ctx.beginPath()
      ctx.ellipse(m.x, m.y, m.r * larga, m.r, 0, 0, Math.PI * 2)
      ctx.fillStyle = g
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = 'rgba(120, 70, 0, 0.55)'
      ctx.stroke()
      if (larga > 0.5) {
        ctx.beginPath()
        ctx.ellipse(m.x, m.y, m.r * larga * 0.62, m.r * 0.62, 0, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255, 246, 200, 0.6)'
        ctx.stroke()
      }
    }
    if (da < durata || monete.length > 0 || scintille.length > 0) frame = requestAnimationFrame(passo)
  }
  frame = requestAnimationFrame(passo)
  return () => cancelAnimationFrame(frame)
}

export function FestaSlot({ dati, onFine }: { dati: DatiFesta; onFine: () => void }) {
  const ridotto = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [numero, setNumero] = useState(ridotto ? dati.vincita : 0)
  const [finita, setFinita] = useState(ridotto)
  const [esce, setEsce] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const salta = useRef(false)
  const fine = useRef(onFine)
  fine.current = onFine

  useEffect(() => {
    const durata = CONTA_MS[dati.livello]
    suona(dati.livello === 'big' ? 'vincita' : 'jackpot')
    const ferma = !ridotto && canvas.current ? fontana(canvas.current, dati.livello, durata + 400) : () => {}
    let frame = 0
    let tic = 0
    const inizio = performance.now() + 350
    const conta = (t: number) => {
      const u = salta.current ? 1 : Math.max(0, Math.min(1, (t - inizio) / durata))
      // Comincia veloce e rallenta verso la fine, come i contatori delle slot.
      setNumero(Math.round(dati.vincita * (1 - Math.pow(1 - u, 3))))
      if (t - tic > 75 && u > 0 && u < 1) {
        tic = t
        suona('incasso', { volume: 0.5 })
      }
      if (u < 1) frame = requestAnimationFrame(conta)
      else setFinita(true)
    }
    if (!ridotto) frame = requestAnimationFrame(conta)
    return () => {
      cancelAnimationFrame(frame)
      ferma()
    }
  }, [dati, ridotto])

  // Finito il conto, resta in vista un attimo e se ne va.
  useEffect(() => {
    if (!finita) return
    const t = window.setTimeout(() => setEsce(true), RESTA_MS)
    return () => window.clearTimeout(t)
  }, [finita])
  useEffect(() => {
    if (!esce) return
    const t = window.setTimeout(() => fine.current(), 380)
    return () => window.clearTimeout(t)
  }, [esce])

  const tocca = () => {
    if (!finita) salta.current = true
    else setEsce(true)
  }

  const titolo = TITOLI[dati.livello]
  return createPortal(
    <div
      className={`slot-festa is-${dati.livello}${esce ? ' is-esce' : ''}${finita ? ' is-finita' : ''}`}
      onClick={tocca}
      role="alert"
      aria-label={`${titolo}: ${dati.vincita} punti`}
    >
      <span className="slot-festa__raggi" aria-hidden="true" />
      <span className="slot-festa__lampo" aria-hidden="true" />
      <canvas className="slot-festa__monete" ref={canvas} aria-hidden="true" />
      <div className="slot-festa__centro" aria-hidden="true">
        <svg className="slot-festa__titolo" viewBox="0 0 600 150">
          <defs>
            <linearGradient id="slot-festa-oro" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fffbe0" />
              <stop offset="0.38" stopColor="#ffe066" />
              <stop offset="0.55" stopColor="#f4a90c" />
              <stop offset="1" stopColor="#fff1a8" />
            </linearGradient>
            {/* La luce che passa sulle lettere, da sinistra a destra, ogni volta piu' in fretta per le piu' grandi. */}
            <linearGradient id="slot-festa-luce" gradientUnits="userSpaceOnUse" x1={-300} y1={0} x2={-120} y2={0}>
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
              {!ridotto && (
                <>
                  <animate attributeName="x1" values="-300;700" dur={LUCE_S[dati.livello]} repeatCount="indefinite" />
                  <animate attributeName="x2" values="-120;880" dur={LUCE_S[dati.livello]} repeatCount="indefinite" />
                </>
              )}
            </linearGradient>
          </defs>
          {/* Lo spessore delle lettere: la stessa scritta, piu' scura, un passo sotto l'altra. */}
          {[10, 8, 6, 4, 2].map((d) => (
            <text key={d} x={300} y={108 + d} className="slot-festa__spessore">
              {titolo}
            </text>
          ))}
          <text x={300} y={108} className="slot-festa__lettere">
            {titolo}
          </text>
          <text x={300} y={108} className="slot-festa__luce">
            {titolo}
          </text>
        </svg>
        <div className="slot-festa__numero u-tabnum" style={{ '--n': numero } as CSSProperties}>
          {numero.toLocaleString('it-IT')}
        </div>
        {dati.sotto && <div className="slot-festa__sotto">{dati.sotto}</div>}
      </div>
    </div>,
    document.body,
  )
}

/** Da quanto vale la vincita, la festa che le spetta: nessuna sotto il ×20. */
export function livelloDi(moltiplicatore: number, sette = false): LivelloFesta | null {
  if (sette) return 'jackpot'
  if (moltiplicatore >= 100) return 'mega'
  if (moltiplicatore >= 20) return 'big'
  return null
}
