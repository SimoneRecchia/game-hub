import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { suona, type NomeSuono } from '@/lib/suoni'
import { mulberry32 } from '@shared/daily'
import type { LivelloFesta } from './momenti'
import {
  anima,
  disegnaFaville,
  disegnaMoneta,
  muovi,
  preparaCanvas,
  scoppia,
  stella,
  type Favilla,
  type Moneta,
} from './monete'
import './Festa.css'

/**
 * La festa di una grande vincita, come nelle slot vere: lo schermo si spegne,
 * girano i raggi, arriva la scritta e la vincita conta da zero fino in fondo,
 * con le monete che tintinnano sempre piu' alte, mentre una fontana di monete
 * esce dal fondo e ricade. Un tocco fa finire il conto, un secondo tocco
 * chiude. Sta nel body, sopra a tutto, e non decide niente: la vincita e' gia'
 * scritta, qui si festeggia.
 *
 * Quattro gradini, ognuno piu' grande di quello prima: BIG WIN dal ×20, SUPER
 * WIN per le campane, con l'alone e i raggi che girano anche al contrario,
 * MEGA WIN per il BAR, con il terremoto e la pioggia di monete. Il JACKPOT dei
 * sette, una volta ogni sessantaquattromila giri, e' un'altra cosa: la sala si
 * spegne e restano accesi solo i rulli, con i sette che bruciano; dalla cima
 * del mobile si alza il faro, e i suoi fasci spazzano il buio mentre squilla
 * il campanello; le lettere cadono una alla volta, e a ogni colpo lo schermo
 * trema; poi il lampo, i raggi, i fuochi d'artificio, la pioggia di monete, e
 * un conto lungo che sale di tono fino alla fine.
 *
 * Le monete e i fuochi sono un canvas, con un seme fisso per gradino: la
 * stessa festa e' sempre la stessa.
 */

export interface DatiFesta {
  chiave: number
  livello: LivelloFesta
  vincita: number
  /** Sotto il numero: "10 × 300", "Domanda giusta". */
  sotto?: string
  /** Il jackpot: dove stanno i rulli sullo schermo, che restano accesi nel buio. */
  rulli?: { x: number; y: number; r: number }
  /** Il jackpot: la cima del mobile, da dove si alza il faro. */
  faro?: { x: number; y: number }
}

type Fase = 'buio' | 'lettere' | 'conta' | 'finita'

interface Livello {
  titolo: string
  /** Quanto conta il numero, e quanto resta in vista dopo. */
  conta: number
  resta: number
  /** Quanto ci mette la luce ad attraversare la scritta. */
  luce: string
  /** Le monete al secondo dalle fontane e dal cielo, e le scintille attorno alla scritta. */
  getto: number
  pioggia: number
  scintille: number
  /** Le monete che esplodono da dietro la scritta quando parte il conto. */
  scoppio: number
  /** Dove escono le fontane, in frazioni della larghezza. */
  getti: readonly number[]
  /** Quanto sale il tintinnio del contatore alla fine: 2 e' un'ottava. */
  tono: number
  suono: NomeSuono
  /** Il seme delle monete: la stessa festa, sempre uguale. */
  seme: number
}

const LIVELLI: Record<LivelloFesta, Livello> = {
  big: {
    titolo: 'BIG WIN',
    conta: 1_900,
    resta: 1_300,
    luce: '1.8s',
    getto: 120,
    pioggia: 0,
    scintille: 20,
    scoppio: 0,
    getti: [0.42, 0.5, 0.58],
    tono: 1.15,
    suono: 'vincita',
    seme: 0xb16,
  },
  super: {
    titolo: 'SUPER WIN',
    conta: 2_400,
    resta: 1_400,
    luce: '1.5s',
    getto: 135,
    pioggia: 20,
    scintille: 28,
    scoppio: 0,
    getti: [0.34, 0.5, 0.66],
    tono: 1.3,
    suono: 'superVincita',
    seme: 0x50e,
  },
  mega: {
    titolo: 'MEGA WIN',
    conta: 2_900,
    resta: 1_500,
    luce: '1.2s',
    getto: 150,
    pioggia: 36,
    scintille: 34,
    scoppio: 36,
    getti: [0.3, 0.5, 0.7],
    tono: 1.5,
    suono: 'jackpot',
    seme: 0x3e6a,
  },
  jackpot: {
    titolo: 'JACKPOT',
    conta: 5_200,
    resta: 2_600,
    luce: '0.9s',
    getto: 90,
    pioggia: 40,
    scintille: 40,
    scoppio: 80,
    getti: [0.16, 0.5, 0.84],
    tono: 2,
    suono: 'jackpot',
    seme: 0x777,
  },
}

/** Il jackpot: quanto dura il buio con il faro, ogni quanto cade una lettera, e quando parte il conto. */
const BUIO_MS = 1_500
const PASSO_LETTERA_MS = 120
const LETTERE = [...'JACKPOT']
const CONTA_JACKPOT_MS = BUIO_MS + LETTERE.length * PASSO_LETTERA_MS + 420
/** I colori dei fuochi d'artificio. */
const COLORI_FUOCHI = ['#fff3b0', '#ffd23f', '#ff5a3c', '#ff4fa3', '#ffffff', '#7df9ff'] as const
const VITA_SCINTILLA_MS = 650

/** Uno scossone allo schermo: piu' forte a ogni lettera. */
function scuoti(el: HTMLElement | null, forza: number) {
  if (!el) return
  const d = 7 * forza
  el.animate(
    [
      { transform: 'translate(0, 0)' },
      { transform: `translate(${-d}px, ${d * 0.6}px) rotate(-0.5deg)` },
      { transform: `translate(${d * 0.7}px, ${-d * 0.4}px) rotate(0.4deg)` },
      { transform: `translate(${-d * 0.3}px, ${d * 0.2}px)` },
      { transform: 'translate(0, 0)' },
    ],
    { duration: 190, easing: 'linear' },
  )
}

/**
 * La fontana di monete: dal fondo in su a ventaglio, e giu' con la gravita';
 * dal SUPER WIN piovono anche dall'alto, e attorno alla scritta si accendono le
 * scintille. Il jackpot ha anche i fuochi d'artificio: razzi che salgono dal
 * fondo e si aprono in faville. Si ferma quando l'ultima moneta e' uscita.
 */
function spettacolo(canvas: HTMLCanvasElement, livello: LivelloFesta, durata: number): () => void {
  const pronto = preparaCanvas(canvas)
  if (!pronto) return () => {}
  const { ctx, W, H } = pronto
  const liv = LIVELLI[livello]
  const caso = mulberry32(liv.seme)
  const gravita = H * 2.57
  const monete: Moneta[] = []
  const luci: Array<{ x: number; y: number; r: number; nata: number }> = []
  const faville: Favilla[] = []
  const razzi: Array<{ x: number; y: number; vx: number; vy: number }> = []
  const lampi: Array<{ x: number; y: number; nata: number }> = []
  const fuochi = livello === 'jackpot'
  let fondo = 0
  let cielo = 0
  let scintille = 0
  let lanci = 0
  const getta = (adesso: number, dove: number) =>
    monete.push({
      x: W * dove + (caso() - 0.5) * 40,
      y: H + 20,
      vx: ((caso() - 0.5) * (W / 70) + (0.5 - dove) * 3 + (caso() - 0.5) * (W / 90)) * 60,
      vy: -(H / 30) * (0.8 + caso() * 0.6) * 60,
      giro: caso() * Math.PI,
      vgiro: 7 + caso() * 13,
      r: 9 + caso() * 9,
      nata: adesso,
    })
  const piove = (adesso: number) =>
    monete.push({
      x: caso() * W,
      y: -30,
      vx: (caso() - 0.5) * 120,
      vy: 120 + caso() * 240,
      giro: caso() * Math.PI,
      vgiro: 6 + caso() * 12,
      r: 8 + caso() * 8,
      nata: adesso,
    })
  // Quando parte il conto, dal MEGA WIN, una manciata di monete esplode da dietro la scritta e ricade.
  for (let i = 0; i < liv.scoppio; i += 1) {
    const a = (i / liv.scoppio) * Math.PI * 2 + caso() * 0.3
    const v = H * (0.55 + caso() * 0.75)
    monete.push({
      x: W / 2,
      y: H * 0.42,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - H * 0.5,
      giro: caso() * Math.PI,
      vgiro: 7 + caso() * 13,
      r: 9 + caso() * 10,
      nata: 0,
    })
  }
  return anima((ms, dt) => {
    if (ms < durata) {
      fondo += liv.getto * dt
      cielo += liv.pioggia * dt
      scintille += liv.scintille * dt
      while (fondo >= 1) {
        fondo -= 1
        getta(ms, liv.getti[Math.floor(caso() * liv.getti.length)])
      }
      while (cielo >= 1) {
        cielo -= 1
        piove(ms)
      }
      while (scintille >= 1) {
        scintille -= 1
        // Attorno alla scritta: un anello largo quanto lo schermo, un po' sopra il centro.
        const a = caso() * Math.PI * 2
        const d = 0.18 + caso() * 0.3
        luci.push({ x: W / 2 + Math.cos(a) * W * d, y: H * 0.42 + Math.sin(a) * W * d * 0.6, r: 6, nata: ms })
      }
      // Un razzo ogni quattro decimi di secondo, da un punto a caso del fondo, fino a un terzo dell'altezza.
      while (fuochi && lanci < ms / 400) {
        lanci += 1
        const cima = H * (0.12 + caso() * 0.3)
        const x = W * (0.12 + caso() * 0.76)
        razzi.push({ x, y: H + 10, vx: (caso() - 0.5) * 60, vy: -Math.sqrt(2 * H * 1.2 * (H - cima)) })
      }
    }
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#fffbe6'
    for (let i = luci.length - 1; i >= 0; i -= 1) {
      const sc = luci[i]
      const u = (ms - sc.nata) / VITA_SCINTILLA_MS
      if (u >= 1) {
        luci.splice(i, 1)
        continue
      }
      ctx.globalAlpha = Math.sin(u * Math.PI)
      stella(ctx, sc.x, sc.y, sc.r + sc.r * 1.6 * Math.sin(u * Math.PI), u * 2)
    }
    ctx.globalAlpha = 1
    // I razzi: una scintilla con la scia che sfuma, e rallenta salendo; in cima si apre, con un lampo.
    ctx.lineCap = 'round'
    for (let i = razzi.length - 1; i >= 0; i -= 1) {
      const r = razzi[i]
      muovi(r, dt, H * 1.2)
      if (r.vy >= 0) {
        razzi.splice(i, 1)
        faville.push(...scoppia(r.x, r.y, ms, 60, Math.min(W, H) * 0.7, COLORI_FUOCHI, caso))
        lampi.push({ x: r.x, y: r.y, nata: ms })
        suona('botto', { volume: 0.45 })
        continue
      }
      const scia = ctx.createLinearGradient(r.x, r.y, r.x - r.vx * 0.06, r.y - r.vy * 0.06)
      scia.addColorStop(0, 'rgba(255, 246, 210, 0.95)')
      scia.addColorStop(1, 'rgba(255, 140, 40, 0)')
      ctx.strokeStyle = scia
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(r.x, r.y)
      ctx.lineTo(r.x - r.vx * 0.06, r.y - r.vy * 0.06)
      ctx.stroke()
    }
    for (let i = lampi.length - 1; i >= 0; i -= 1) {
      const l = lampi[i]
      const u = (ms - l.nata) / 280
      if (u >= 1) {
        lampi.splice(i, 1)
        continue
      }
      const raggio = Math.min(W, H) * (0.08 + u * 0.12)
      const luce = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, raggio)
      luce.addColorStop(0, 'rgba(255, 250, 230, 0.9)')
      luce.addColorStop(1, 'rgba(255, 200, 120, 0)')
      ctx.globalAlpha = 1 - u
      ctx.fillStyle = luce
      ctx.fillRect(l.x - raggio, l.y - raggio, raggio * 2, raggio * 2)
    }
    ctx.globalAlpha = 1
    disegnaFaville(ctx, faville, ms, dt, H * 0.35)
    for (let i = monete.length - 1; i >= 0; i -= 1) {
      const m = monete[i]
      muovi(m, dt, gravita)
      m.giro += m.vgiro * dt
      if (m.y > H + 40 && m.vy > 0) {
        monete.splice(i, 1)
        continue
      }
      disegnaMoneta(ctx, m)
    }
    return ms < durata || monete.length + luci.length + faville.length + razzi.length + lampi.length > 0
  })
}

export function FestaSlot({ dati, onFine }: { dati: DatiFesta; onFine: () => void }) {
  const ridotto = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const liv = LIVELLI[dati.livello]
  const jackpot = dati.livello === 'jackpot'
  const [fase, setFase] = useState<Fase>(ridotto ? 'finita' : jackpot ? 'buio' : 'conta')
  const [numero, setNumero] = useState(ridotto ? dati.vincita : 0)
  /** Toccata prima che finisse il buio o le lettere: tutto al suo posto, subito. */
  const [saltata, setSaltata] = useState(false)
  const [esce, setEsce] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const scena = useRef<HTMLDivElement>(null)
  const salta = useRef(false)
  const fine = useRef(onFine)
  fine.current = onFine

  // Il jackpot comincia al buio: il faro e il campanello, poi le lettere una alla volta, e a ogni colpo lo schermo
  // trema. Poi il conto.
  useEffect(() => {
    if (!jackpot || ridotto) return
    suona('sirena')
    const attese = [
      window.setTimeout(() => setFase((f) => (f === 'buio' ? 'lettere' : f)), BUIO_MS),
      ...LETTERE.map((_, i) =>
        window.setTimeout(() => {
          if (salta.current) return
          suona('schianto', { volume: 0.7 + i * 0.05 })
          scuoti(scena.current, 1 + i * 0.15)
        }, BUIO_MS + i * PASSO_LETTERA_MS),
      ),
      window.setTimeout(() => setFase((f) => (f === 'lettere' ? 'conta' : f)), CONTA_JACKPOT_MS),
    ]
    return () => attese.forEach((t) => window.clearTimeout(t))
  }, [jackpot, ridotto])

  // Dal conto in poi: la fanfara, e le monete che vanno avanti fin quasi alla fine. Parte una volta sola.
  const iniziata = fase === 'conta' || fase === 'finita'
  useEffect(() => {
    if (!iniziata) return
    suona(liv.suono)
    if (ridotto || !canvas.current) return
    return spettacolo(canvas.current, dati.livello, jackpot ? liv.conta + liv.resta - 600 : liv.conta + 400)
  }, [iniziata, ridotto, dati.livello, jackpot, liv])

  // Il conto: comincia veloce e rallenta verso la fine, come i contatori delle slot, e ogni moneta suona un po' piu'
  // alta della precedente.
  useEffect(() => {
    if (fase !== 'conta') return
    let frame = 0
    let tic = 0
    const inizio = performance.now() + (jackpot ? 120 : 350)
    const conta = (t: number) => {
      const u = salta.current ? 1 : Math.max(0, Math.min(1, (t - inizio) / liv.conta))
      setNumero(Math.round(dati.vincita * (1 - Math.pow(1 - u, 3))))
      if (t - tic > 75 && u > 0 && u < 1) {
        tic = t
        suona('incasso', { volume: 0.5, altezza: 1 + (liv.tono - 1) * u })
      }
      if (u < 1) frame = requestAnimationFrame(conta)
      else setFase('finita')
    }
    frame = requestAnimationFrame(conta)
    return () => cancelAnimationFrame(frame)
  }, [fase, jackpot, liv, dati.vincita])

  // Finito il conto, resta in vista un attimo e se ne va.
  useEffect(() => {
    if (fase !== 'finita') return
    const t = window.setTimeout(() => setEsce(true), liv.resta)
    return () => window.clearTimeout(t)
  }, [fase, liv])
  useEffect(() => {
    if (!esce) return
    const t = window.setTimeout(() => fine.current(), 380)
    return () => window.clearTimeout(t)
  }, [esce])

  const tocca = () => {
    if (fase === 'finita') {
      setEsce(true)
      return
    }
    salta.current = true
    if (fase === 'conta') return
    setSaltata(true)
    setNumero(dati.vincita)
    setFase('finita')
  }

  const { titolo } = liv
  const stile = {
    ...(dati.rulli && {
      '--rulli-x': `${dati.rulli.x.toFixed(0)}px`,
      '--rulli-y': `${dati.rulli.y.toFixed(0)}px`,
      '--rulli-r': `${dati.rulli.r.toFixed(0)}px`,
    }),
    ...(dati.faro && { '--faro-x': `${dati.faro.x.toFixed(0)}px`, '--faro-y': `${dati.faro.y.toFixed(0)}px` }),
  } as CSSProperties
  const classi = [
    'slot-festa',
    `is-${dati.livello}`,
    `is-${fase}`,
    saltata ? 'is-saltata' : '',
    esce ? 'is-esce' : '',
    dati.rulli ? 'ha-rulli' : '',
  ]
  return createPortal(
    <div
      className={classi.filter(Boolean).join(' ')}
      style={stile}
      onClick={tocca}
      role="alert"
      aria-label={`${titolo}: ${dati.vincita} punti`}
    >
      {jackpot && <span className="slot-festa__buio" aria-hidden="true" />}
      <span className="slot-festa__fondo" aria-hidden="true" />
      {jackpot && (
        <span className="slot-festa__faro" aria-hidden="true">
          <span className="slot-festa__fasci" />
          <span className="slot-festa__lampada" />
        </span>
      )}
      <div className="slot-festa__scena" ref={scena} aria-hidden="true">
        <span className="slot-festa__raggi" />
        {dati.livello !== 'big' && <span className="slot-festa__raggi is-contro" />}
        <span className="slot-festa__lampo" />
        <canvas className="slot-festa__monete" ref={canvas} />
        <div className="slot-festa__centro">
          {dati.livello !== 'big' && (
            <span className="slot-festa__alone">
              <span className="slot-festa__onda" />
              {dati.livello !== 'super' && <span className="slot-festa__onda is-seconda" />}
            </span>
          )}
          <svg className="slot-festa__titolo" viewBox="0 0 600 150">
            <defs>
              <linearGradient id="slot-festa-oro" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fffbe0" />
                <stop offset="0.38" stopColor="#ffe066" />
                <stop offset="0.55" stopColor="#f4a90c" />
                <stop offset="1" stopColor="#fff1a8" />
              </linearGradient>
              {/* La luce che passa sulle lettere, da sinistra a destra: piu' in fretta per le piu' grandi. */}
              <linearGradient id="slot-festa-luce" gradientUnits="userSpaceOnUse" x1={-300} y1={0} x2={-120} y2={0}>
                <stop offset="0" stopColor="#fff" stopOpacity="0" />
                <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
                {!ridotto && (
                  <>
                    <animate attributeName="x1" values="-300;700" dur={liv.luce} repeatCount="indefinite" />
                    <animate attributeName="x2" values="-120;880" dur={liv.luce} repeatCount="indefinite" />
                  </>
                )}
              </linearGradient>
            </defs>
            {jackpot ? (
              // Le lettere del jackpot, ognuna per conto suo: cadono una alla volta, ognuna con la sua onda.
              LETTERE.map((l, i) => {
                const x = 300 + (i - 3) * 80
                return (
                  <g key={i} className="slot-festa__lettera" style={{ '--i': i } as CSSProperties}>
                    <circle className="slot-festa__colpo" cx={x} cy={74} r={44} />
                    {[10, 7, 4].map((d) => (
                      <text key={d} x={x} y={108 + d} className="slot-festa__spessore">
                        {l}
                      </text>
                    ))}
                    <text x={x} y={108} className="slot-festa__lettere">
                      {l}
                    </text>
                    <text x={x} y={108} className="slot-festa__luce">
                      {l}
                    </text>
                  </g>
                )
              })
            ) : (
              <>
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
              </>
            )}
          </svg>
          <div className="slot-festa__numero u-tabnum">{numero.toLocaleString('it-IT')}</div>
          {dati.sotto && <div className="slot-festa__sotto">{dati.sotto}</div>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
