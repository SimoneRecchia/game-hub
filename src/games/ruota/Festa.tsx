import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
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
} from '@/games/slot/monete'
import { suona, type NomeSuono } from '@/lib/suoni'
import { mulberry32 } from '@shared/daily'
import { scriviMoltiplicatore } from '@shared/ruota'
import './Festa.css'

/**
 * La festa di un premio grande di Crazy Time, come nelle sale vere: lo schermo
 * si spegne, girano i raggi, l'insegna con le lampadine impazzite porta il
 * moltiplicatore enorme, d'oro e con lo spessore, e la vincita conta da zero
 * con le monete che tintinnano sempre piu' alte, mentre una fontana di monete
 * esce dal fondo e ricade. Un tocco fa finire il conto, un secondo chiude. Sta
 * nel body, sopra a tutto, e non decide niente: la vincita e' gia' scritta, qui
 * si festeggia.
 *
 * Tre gradini, ognuno piu' grande di quello prima: dal ×3; dal ×5, con i raggi
 * che girano anche al contrario, la pioggia di monete e l'onda d'urto; dal ×10
 * — il decuplo della ruota fortunata, i ×15 e i ×30 del Pachinko — con il
 * terremoto, i fuochi d'artificio e una seconda onda. L'insegna dice il nome
 * del moltiplicatore, o quante volte, se un nome non ce l'ha. Quel che viene
 * dalla fortuna ha il verde e l'oro, e i quadrifogli che volano con le monete.
 *
 * Le monete, i quadrifogli e i fuochi sono un canvas, con un seme fisso per
 * gradino: la stessa festa e' sempre la stessa.
 */

export type LivelloFestaRuota = 'triplo' | 'cinque' | 'dieci'

/** La festa di un moltiplicatore vinto: dal ×3, e piu' grande quanto piu' vale. Sotto il ×3 basta l'adesivo. */
export function festaDi(moltiplicatore: number): LivelloFestaRuota | null {
  if (moltiplicatore >= 10) return 'dieci'
  if (moltiplicatore >= 5) return 'cinque'
  if (moltiplicatore >= 3) return 'triplo'
  return null
}

/** I moltiplicatori che hanno un nome: gli altri, come i ×15 e i ×30 del Pachinko, si dicono in volte. */
const NOMI_DEI_MOLTIPLICATORI: Record<number, string> = {
  3: 'TRIPLO',
  4: 'QUADRUPLO',
  5: 'QUINTUPLO',
  6: 'SESTUPLO',
  8: 'OTTUPLO',
  10: 'DECUPLO',
}

/** Il nome sull'insegna della festa: "TRIPLO", "DECUPLO", "15 VOLTE". */
export const nomeDellaFesta = (m: number) => NOMI_DEI_MOLTIPLICATORI[m] ?? `${String(m).replace('.', ',')} VOLTE`

export interface DatiFestaRuota {
  chiave: number
  moltiplicatore: number
  vincita: number
  /** Sotto il numero: "100 × 3", "Domanda giusta". */
  sotto?: string
  /** Dalla ruota fortunata: il verde e l'oro, e i quadrifogli. */
  fortunata: boolean
  /** Al posto del moltiplicatore e del suo nome: il numero e la puntata della roulette ("17", "PIENO"). */
  testo?: string
  nome?: string
  /**
   * La festa della roulette, come nel suo mockup: al posto dell'insegna una
   * carta gialla storta con la puntata e il numero, la vincita e quel che paga.
   */
  carta?: boolean
}

type Fase = 'conta' | 'finita'

interface Livello {
  /** Quanto conta il numero, e quanto resta in vista dopo. */
  conta: number
  resta: number
  /** Le monete al secondo dal fondo e dal cielo, e le scintille attorno all'insegna. */
  getto: number
  pioggia: number
  scintille: number
  /** Le monete che esplodono da dietro l'insegna all'arrivo. */
  scoppio: number
  /** I quadrifogli al secondo, quando la festa viene dalla fortuna. */
  trifogli: number
  fuochi: boolean
  /** Quanto sale il tintinnio del contatore alla fine: 2 e' un'ottava. */
  tono: number
  suono: NomeSuono
  seme: number
}

const LIVELLI: Record<LivelloFestaRuota, Livello> = {
  triplo: {
    conta: 1_700,
    resta: 1_200,
    getto: 110,
    pioggia: 0,
    scintille: 22,
    scoppio: 30,
    trifogli: 6,
    fuochi: false,
    tono: 1.25,
    suono: 'superVincita',
    seme: 0x3a,
  },
  cinque: {
    conta: 2_300,
    resta: 1_400,
    getto: 135,
    pioggia: 24,
    scintille: 30,
    scoppio: 56,
    trifogli: 12,
    fuochi: false,
    tono: 1.45,
    suono: 'jackpot',
    seme: 0x5c,
  },
  dieci: {
    conta: 3_300,
    resta: 2_200,
    getto: 150,
    pioggia: 44,
    scintille: 42,
    scoppio: 96,
    trifogli: 22,
    fuochi: true,
    tono: 2,
    suono: 'jackpot',
    seme: 0x10d,
  },
}

/** I colori dei fuochi d'artificio: l'oro, il verde della fortuna, il bianco e il rosa. */
const COLORI_FUOCHI = ['#fff3b0', '#ffd23f', '#5ef09a', '#ffffff', '#ff4fa3', '#7df9ff'] as const
const VITA_SCINTILLA_MS = 650

interface Trifoglio {
  x: number
  y: number
  vx: number
  vy: number
  giro: number
  vgiro: number
  r: number
}

/** Un quadrifoglio che vola: quattro foglie tonde, verdi con il filo chiaro, e il gambo. */
function disegnaTrifoglio(ctx: CanvasRenderingContext2D, t: Trifoglio) {
  ctx.save()
  ctx.translate(t.x, t.y)
  ctx.rotate(t.giro)
  ctx.lineWidth = Math.max(1, t.r * 0.12)
  ctx.strokeStyle = '#2b8a57'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(t.r * 0.35, t.r * 0.7, t.r * 0.2, t.r * 1.3)
  ctx.stroke()
  ctx.fillStyle = '#2fd17f'
  ctx.strokeStyle = '#e9fff1'
  for (let k = 0; k < 4; k += 1) {
    const a = (k * Math.PI) / 2 + Math.PI / 4
    ctx.beginPath()
    ctx.arc(Math.cos(a) * t.r * 0.46, Math.sin(a) * t.r * 0.46, t.r * 0.44, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Lo spettacolo sul canvas: la fontana di monete dal fondo, la pioggia dal
 * cielo dal quintuplo, le scintille attorno all'insegna, lo scoppio iniziale;
 * con la fortuna anche i quadrifogli, e con il decuplo i fuochi d'artificio.
 * Si ferma quando l'ultima cosa e' uscita dallo schermo.
 */
function spettacolo(canvas: HTMLCanvasElement, livello: LivelloFestaRuota, fortunata: boolean, durata: number) {
  const pronto = preparaCanvas(canvas)
  if (!pronto) return () => {}
  const { ctx, W, H } = pronto
  const liv = LIVELLI[livello]
  const caso = mulberry32(liv.seme + (fortunata ? 1 : 0))
  const gravita = H * 2.5
  const monete: Moneta[] = []
  const trifogli: Trifoglio[] = []
  const luci: Array<{ x: number; y: number; r: number; nata: number }> = []
  const faville: Favilla[] = []
  const razzi: Array<{ x: number; y: number; vx: number; vy: number }> = []
  let fondo = 0
  let cielo = 0
  let scintille = 0
  let foglie = 0
  let lanci = 0
  const getti = livello === 'triplo' ? [0.5] : livello === 'cinque' ? [0.3, 0.7] : [0.18, 0.5, 0.82]
  const getta = (adesso: number, dove: number) =>
    monete.push({
      x: W * dove + (caso() - 0.5) * 40,
      y: H + 20,
      vx: ((caso() - 0.5) * (W / 70) + (0.5 - dove) * 3) * 60,
      vy: -(H / 30) * (0.8 + caso() * 0.6) * 60,
      giro: caso() * Math.PI,
      vgiro: 7 + caso() * 13,
      r: 9 + caso() * 9,
      nata: adesso,
    })
  for (let i = 0; i < liv.scoppio; i += 1) {
    const a = (i / liv.scoppio) * Math.PI * 2 + caso() * 0.3
    const v = H * (0.55 + caso() * 0.75)
    monete.push({
      x: W / 2,
      y: H * 0.4,
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
      foglie += (fortunata ? liv.trifogli : 0) * dt
      while (fondo >= 1) {
        fondo -= 1
        getta(ms, getti[Math.floor(caso() * getti.length)])
      }
      while (cielo >= 1) {
        cielo -= 1
        monete.push({
          x: caso() * W,
          y: -30,
          vx: (caso() - 0.5) * 120,
          vy: 120 + caso() * 240,
          giro: caso() * Math.PI,
          vgiro: 6 + caso() * 12,
          r: 8 + caso() * 8,
          nata: ms,
        })
      }
      while (foglie >= 1) {
        foglie -= 1
        trifogli.push({
          x: caso() * W,
          y: -24,
          vx: (caso() - 0.5) * 90,
          vy: 60 + caso() * 120,
          giro: caso() * Math.PI * 2,
          vgiro: (caso() - 0.5) * 6,
          r: 8 + caso() * 9,
        })
      }
      while (scintille >= 1) {
        scintille -= 1
        const a = caso() * Math.PI * 2
        const d = 0.2 + caso() * 0.3
        luci.push({ x: W / 2 + Math.cos(a) * W * d, y: H * 0.4 + Math.sin(a) * W * d * 0.6, r: 6, nata: ms })
      }
      while (liv.fuochi && lanci < ms / 380) {
        lanci += 1
        const cima = H * (0.1 + caso() * 0.3)
        const vy = -Math.sqrt(2 * H * 1.2 * (H - cima))
        razzi.push({ x: W * (0.1 + caso() * 0.8), y: H + 10, vx: (caso() - 0.5) * 60, vy })
      }
    }
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = fortunata ? '#eafff2' : '#fffbe6'
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
    for (let i = razzi.length - 1; i >= 0; i -= 1) {
      const r = razzi[i]
      muovi(r, dt, H * 1.2)
      if (r.vy >= 0) {
        razzi.splice(i, 1)
        faville.push(...scoppia(r.x, r.y, ms, 60, Math.min(W, H) * 0.7, COLORI_FUOCHI, caso))
        suona('botto', { volume: 0.45 })
        continue
      }
      ctx.strokeStyle = 'rgba(255, 240, 200, 0.9)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(r.x, r.y)
      ctx.lineTo(r.x - r.vx * 0.06, r.y - r.vy * 0.06)
      ctx.stroke()
    }
    disegnaFaville(ctx, faville, ms, dt, H * 0.35)
    for (let i = trifogli.length - 1; i >= 0; i -= 1) {
      const t = trifogli[i]
      t.x += t.vx * dt
      t.y += t.vy * dt
      t.vx += Math.sin(ms / 400 + i) * 30 * dt
      t.giro += t.vgiro * dt
      if (t.y > H + 40) {
        trifogli.splice(i, 1)
        continue
      }
      disegnaTrifoglio(ctx, t)
    }
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
    return ms < durata || monete.length + luci.length + faville.length + razzi.length + trifogli.length > 0
  })
}

/** Uno scossone allo schermo, per il decuplo. */
function scuoti(el: HTMLElement | null) {
  el?.animate(
    [
      { transform: 'translate(0, 0)' },
      { transform: 'translate(-9px, 5px) rotate(-0.6deg)' },
      { transform: 'translate(8px, -4px) rotate(0.5deg)' },
      { transform: 'translate(-5px, 2px)' },
      { transform: 'translate(3px, -1px)' },
      { transform: 'translate(0, 0)' },
    ],
    { duration: 420, easing: 'linear' },
  )
}

export function FestaRuota({ dati, onFine }: { dati: DatiFestaRuota; onFine: () => void }) {
  const ridotto = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const livello = festaDi(dati.moltiplicatore) ?? 'triplo'
  const liv = LIVELLI[livello]
  const [fase, setFase] = useState<Fase>(ridotto ? 'finita' : 'conta')
  const [numero, setNumero] = useState(ridotto ? dati.vincita : 0)
  const [esce, setEsce] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const scena = useRef<HTMLDivElement>(null)
  const salta = useRef(false)
  const fine = useRef(onFine)
  useEffect(() => {
    fine.current = onFine
  })

  // L'arrivo: la fanfara, lo scossone del decuplo, e le monete che vanno avanti fin quasi alla fine.
  useEffect(() => {
    if (livello === 'dieci') suona('sirena')
    suona(liv.suono, livello === 'dieci' ? { ritardo: 0.35 } : {})
    if (ridotto || !canvas.current) return
    if (livello === 'dieci') window.setTimeout(() => scuoti(scena.current), 380)
    return spettacolo(canvas.current, livello, dati.fortunata, liv.conta + 500)
  }, [ridotto, livello, liv, dati.fortunata])

  // Il conto: comincia veloce e rallenta verso la fine, e ogni moneta suona un po' piu' alta della precedente.
  useEffect(() => {
    if (fase !== 'conta') return
    let frame = 0
    let tic = 0
    const inizio = performance.now() + 380
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
  }, [fase, liv, dati.vincita])

  // Finito il conto, resta in vista un attimo e se ne va.
  useEffect(() => {
    if (fase !== 'finita') return
    const t = window.setTimeout(() => setEsce(true), liv.resta + (ridotto ? 600 : 0))
    return () => window.clearTimeout(t)
  }, [fase, liv, ridotto])
  useEffect(() => {
    if (!esce) return
    const t = window.setTimeout(() => fine.current(), 380)
    return () => window.clearTimeout(t)
  }, [esce])

  const tocca = () => {
    if (fase === 'finita') setEsce(true)
    else salta.current = true
  }

  const testo = dati.testo ?? scriviMoltiplicatore(dati.moltiplicatore)
  const classi = [
    'ct-festa',
    `is-${livello}`,
    `is-${fase}`,
    dati.fortunata ? 'is-fortunata' : '',
    dati.carta ? 'is-carta' : '',
    esce ? 'is-esce' : '',
  ].filter(Boolean)
  return createPortal(
    <div className={classi.join(' ')} onClick={tocca} role="alert" aria-label={`${testo}: ${dati.vincita} punti`}>
      <span className="ct-festa__fondo" aria-hidden="true" />
      <div className="ct-festa__scena" ref={scena} aria-hidden="true">
        <span className="ct-festa__raggi" />
        {livello !== 'triplo' && <span className="ct-festa__raggi is-contro" />}
        <span className="ct-festa__lampo" />
        <canvas className="ct-festa__monete" ref={canvas} />
        <div className="ct-festa__centro">
          <span className="ct-festa__alone">
            <span className="ct-festa__onda" />
            {livello === 'dieci' && <span className="ct-festa__onda is-seconda" />}
          </span>
          {dati.carta ? (
            <div className="ct-festa__carta">
              <span className="ct-festa__carta-nome">
                {dati.nome ?? nomeDellaFesta(dati.moltiplicatore)} {testo}
              </span>
              <span className="ct-festa__carta-cifra u-tabnum">+{numero.toLocaleString('it-IT')}</span>
              {dati.sotto && <span className="ct-festa__carta-sotto">{dati.sotto}</span>}
            </div>
          ) : (
            <>
              <div className="ct-festa__insegna" style={{ '--lettere': testo.length } as CSSProperties}>
                <span className="ct-festa__nome">{dati.nome ?? nomeDellaFesta(dati.moltiplicatore)}</span>
                <svg className="ct-festa__numero" viewBox="0 0 420 200">
                  {/* Lo spessore, come nel mockup: due passi piu' scuri sotto la cifra d'oro piena. */}
                  <text x={210} y={160} className="ct-festa__spessore is-fondo">
                    {testo}
                  </text>
                  <text x={210} y={155} className="ct-festa__spessore">
                    {testo}
                  </text>
                  <text x={210} y={150} className="ct-festa__cifra">
                    {testo}
                  </text>
                </svg>
                {/* Nell'insegna, come nel mockup: la vincita che conta, e a conto finito l'invito a raccoglierla. */}
                <span className="ct-festa__vincita u-tabnum">+{numero.toLocaleString('it-IT')}</span>
                <span className="ct-festa__tocca">{fase === 'finita' ? 'Tocca per raccogliere' : ''}</span>
              </div>
              {dati.sotto && <div className="ct-festa__sotto">{dati.sotto}</div>}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
