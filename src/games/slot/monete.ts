/**
 * Le monete, le scintille e i fuochi delle vincite della slot, disegnati su un
 * canvas: cento elementi animati dal DOM costerebbero troppo a un telefono,
 * mentre il canvas disegna tutto in un passo. Le usano le targhe sul mobile
 * (Targa.tsx) e la festa (Festa.tsx).
 *
 * Il moto si conta in secondi e non in fotogrammi, cosi' su uno schermo a 120
 * Hz le monete non volano al doppio della velocita'; e niente e' a caso: chi
 * disegna parte da un seme fisso (`mulberry32`), quindi la stessa vincita fa
 * sempre la stessa fontana.
 */

export interface Moneta {
  x: number
  y: number
  /** In pixel al secondo. */
  vx: number
  vy: number
  /** Il giro sul suo asse, in radianti, e quanto gira al secondo. */
  giro: number
  vgiro: number
  r: number
  /** Quando e' uscita, in millisecondi dall'inizio. */
  nata: number
}

/** Un punto di luce che vola e si spegne: le scintille dei fuochi d'artificio. */
export interface Favilla {
  x: number
  y: number
  vx: number
  vy: number
  nata: number
  /** Quanto dura, in millisecondi. */
  vita: number
  colore: string
  r: number
}

/** Il canvas grande quanto si vede, alla densita' dello schermo (al piu' 2): il contesto e le misure, in pixel CSS. */
export function preparaCanvas(
  canvas: HTMLCanvasElement,
): { ctx: CanvasRenderingContext2D; W: number; H: number } | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const W = canvas.clientWidth
  const H = canvas.clientHeight
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, W, H }
}

/**
 * I fotogrammi di un canvas: `passo` riceve i millisecondi dall'inizio e i
 * secondi dall'ultimo fotogramma — al piu' un ventesimo, cosi' una pagina
 * tornata visibile non fa saltare le monete — e dice se continuare. Restituisce
 * la funzione che ferma tutto.
 */
export function anima(passo: (ms: number, dt: number) => boolean): () => void {
  let frame = 0
  let inizio = -1
  let prima = 0
  const giro = (t: number) => {
    if (inizio < 0) {
      inizio = t
      prima = t
    }
    const dt = Math.min(0.05, (t - prima) / 1000)
    prima = t
    if (passo(t - inizio, dt)) frame = requestAnimationFrame(giro)
  }
  frame = requestAnimationFrame(giro)
  return () => cancelAnimationFrame(frame)
}

/** Un passo di volo: la gravita', in pixel al secondo quadrato, tira giu'. */
export function muovi(m: { x: number; y: number; vx: number; vy: number }, dt: number, gravita: number): void {
  m.vy += gravita * dt
  m.x += m.vx * dt
  m.y += m.vy * dt
}

/** Una moneta che gira: un'ellisse d'oro che si stringe e si allarga, con il bordo piu' scuro e l'orlo chiaro. */
export function disegnaMoneta(ctx: CanvasRenderingContext2D, m: Moneta, alfa = 1): void {
  const larga = Math.max(0.12, Math.abs(Math.cos(m.giro)))
  const g = ctx.createLinearGradient(m.x - m.r, m.y - m.r, m.x + m.r, m.y + m.r)
  g.addColorStop(0, '#fff6c8')
  g.addColorStop(0.45, '#f4c430')
  g.addColorStop(1, '#a2650e')
  ctx.globalAlpha = alfa
  ctx.beginPath()
  ctx.ellipse(m.x, m.y, m.r * larga, m.r, 0, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = Math.max(1, m.r / 8)
  ctx.strokeStyle = 'rgba(120, 70, 0, 0.55)'
  ctx.stroke()
  if (larga > 0.5) {
    ctx.beginPath()
    ctx.ellipse(m.x, m.y, m.r * larga * 0.62, m.r * 0.62, 0, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 246, 200, 0.6)'
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

/** Una scintilla: una stella a quattro punte. */
export function stella(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, giro: number): void {
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

/** Le faville di un fuoco d'artificio: tutte insieme da un punto, a raggiera, ognuna con la sua velocita'. */
export function scoppia(
  x: number,
  y: number,
  adesso: number,
  quante: number,
  forza: number,
  colori: readonly string[],
  caso: () => number,
): Favilla[] {
  return Array.from({ length: quante }, (_, i) => {
    const angolo = ((i + caso() * 0.5) / quante) * Math.PI * 2
    const v = forza * (0.55 + caso() * 0.45)
    return {
      x,
      y,
      vx: Math.cos(angolo) * v,
      vy: Math.sin(angolo) * v,
      nata: adesso,
      vita: 1_000 + caso() * 600,
      colore: colori[i % colori.length],
      r: 2.2 + caso() * 2,
    }
  })
}

/**
 * Le faville in volo: frenate dall'aria, tirate giu', con una scia corta, e
 * che si spengono a fine vita. Toglie quelle spente.
 */
export function disegnaFaville(
  ctx: CanvasRenderingContext2D,
  faville: Favilla[],
  adesso: number,
  dt: number,
  gravita: number,
): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (let i = faville.length - 1; i >= 0; i -= 1) {
    const f = faville[i]
    const u = (adesso - f.nata) / f.vita
    if (u >= 1) {
      faville.splice(i, 1)
      continue
    }
    const x0 = f.x
    const y0 = f.y
    const freno = Math.exp(-1.6 * dt)
    f.vx *= freno
    f.vy *= freno
    muovi(f, dt, gravita)
    ctx.globalAlpha = (1 - u) * (1 - u)
    ctx.strokeStyle = f.colore
    ctx.lineWidth = f.r
    ctx.beginPath()
    ctx.moveTo(x0 - (f.x - x0) * 1.5, y0 - (f.y - y0) * 1.5)
    ctx.lineTo(f.x, f.y)
    ctx.stroke()
  }
  ctx.restore()
}
