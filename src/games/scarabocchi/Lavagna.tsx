import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import {
  ALTEZZA_LAVAGNA,
  COLORI_SCARABOCCHI,
  LARGHEZZA_LAVAGNA,
  SPESSORI_SCARABOCCHI,
  type OpTratto,
} from '@shared/scarabocchi'

export interface Strumento {
  colore: number
  spessore: number
}

export interface ComandiLavagna {
  annulla: () => void
  pulisci: () => void
}

interface Props {
  /** Le mosse da mostrare. Per chi disegna sono quelle di partenza (riaprendo la pagina): poi le tiene la lavagna. */
  ops: readonly OpTratto[]
  /** Si disegna: ogni mossa nuova arriva qui, per essere mandata. */
  onOp?: (op: OpTratto) => void
  strumento?: Strumento
  /** La lavagna di chi disegna non si tocca piu' (il tempo e' finito, o si e' consegnato). */
  ferma?: boolean
  etichetta: string
}

/** Fra due punti di un tratto almeno tre unita' della lavagna: il dito manda piu' punti di quanti ne servano. */
const PASSO_MINIMO = 3

/** Lo stato di un tratto in corso sulla tela: da dove riprende il prossimo segmento. */
interface Penna {
  colore: number
  spessore: number
  x: number
  y: number
}

function prepara(ctx: CanvasRenderingContext2D, scala: number, colore: number, spessore: number) {
  ctx.strokeStyle = COLORI_SCARABOCCHI[colore] ?? COLORI_SCARABOCCHI[0]
  ctx.fillStyle = ctx.strokeStyle
  ctx.lineWidth = (SPESSORI_SCARABOCCHI[spessore] ?? SPESSORI_SCARABOCCHI[0]) * scala
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

/** Un punto solo e' un tondo: un tocco senza trascinare lascia un segno. */
function punto(ctx: CanvasRenderingContext2D, scala: number, p: Penna) {
  prepara(ctx, scala, p.colore, p.spessore)
  ctx.beginPath()
  ctx.arc(p.x * scala, p.y * scala, ((SPESSORI_SCARABOCCHI[p.spessore] ?? 6) * scala) / 2, 0, Math.PI * 2)
  ctx.fill()
}

/** I segmenti di un tratto da `penna` in poi, lungo `punti`: la penna resta sull'ultimo. */
function segmenti(ctx: CanvasRenderingContext2D, scala: number, penna: Penna, punti: readonly number[]) {
  if (punti.length < 2) return
  prepara(ctx, scala, penna.colore, penna.spessore)
  ctx.beginPath()
  ctx.moveTo(penna.x * scala, penna.y * scala)
  for (let i = 0; i + 1 < punti.length; i += 2) {
    ctx.lineTo(punti[i] * scala, punti[i + 1] * scala)
    penna.x = punti[i]
    penna.y = punti[i + 1]
  }
  ctx.stroke()
}

/**
 * Applica le mosse da `da` in poi sulla tela, dove la penna le aveva
 * lasciate. Annulla e pulisci non si disegnano a pezzi: chiedono di rifare
 * tutto (`true`).
 */
function applica(
  ctx: CanvasRenderingContext2D,
  scala: number,
  ops: readonly OpTratto[],
  da: number,
  penna: { corrente: Penna | null },
): boolean {
  for (let i = da; i < ops.length; i += 1) {
    const op = ops[i]
    if (op.tipo === 'annulla' || op.tipo === 'pulisci') return true
    if (op.tipo === 'tratto') {
      if (op.punti.length < 2) continue
      const p: Penna = { colore: op.colore, spessore: op.spessore, x: op.punti[0], y: op.punti[1] }
      punto(ctx, scala, p)
      segmenti(ctx, scala, p, op.punti.slice(2))
      penna.corrente = p
    } else if (penna.corrente) {
      segmenti(ctx, scala, penna.corrente, op.punti)
    }
  }
  return false
}

/** Tutta la lavagna da capo: il foglio bianco, e i tratti che restano dopo annulla e pulisci. */
function rifai(
  ctx: CanvasRenderingContext2D,
  scala: number,
  ops: readonly OpTratto[],
  penna: { corrente: Penna | null },
) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  // Si tengono solo i tratti rimasti: un annulla toglie l'ultimo, un pulisci tutti.
  const rimasti: OpTratto[][] = []
  for (const op of ops) {
    if (op.tipo === 'tratto') rimasti.push([op])
    else if (op.tipo === 'segue') rimasti.at(-1)?.push(op)
    else if (op.tipo === 'annulla') rimasti.pop()
    else rimasti.length = 0
  }
  penna.corrente = null
  applica(ctx, scala, rimasti.flat(), 0, penna)
}

/**
 * La lavagna: un foglio bianco in quattro terzi, nelle unita' della partita
 * (1600 per 1200), che ogni schermo scala sulla sua larghezza. Chi guarda la
 * vede crescere: le mosse nuove si disegnano a pezzi, dove la penna era
 * rimasta, e solo annulla e pulisci rifanno tutto. Chi disegna ci disegna col
 * dito o col mouse: ogni movimento si disegna subito e diventa una mossa
 * (`onOp`), senza passare dallo stato di React, che ridisegnerebbe la pagina a
 * ogni punto.
 */
export const Lavagna = forwardRef<ComandiLavagna, Props>(function Lavagna(
  { ops, onOp, strumento = { colore: 0, spessore: 1 }, ferma = false, etichetta },
  ref,
) {
  const tela = useRef<HTMLCanvasElement>(null)
  const scala = useRef(1)
  const disegnate = useRef<OpTratto[]>([])
  const penna = useRef<{ corrente: Penna | null }>({ corrente: null })
  const tocco = useRef<{ id: number; penna: Penna } | null>(null)
  const strumentoRef = useRef(strumento)
  strumentoRef.current = strumento
  const onOpRef = useRef(onOp)
  onOpRef.current = onOp
  const modifica = onOp !== undefined

  const contesto = () => tela.current?.getContext('2d') ?? null

  const daCapo = useCallback(() => {
    const ctx = contesto()
    if (ctx) rifai(ctx, scala.current, disegnate.current, penna.current)
  }, [])

  // La misura: la tela ha i pixel dello schermo, e si rifa' quando cambia la larghezza.
  useEffect(() => {
    const t = tela.current
    if (!t) return
    const misura = () => {
      const largo = t.clientWidth
      if (largo === 0) return
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const w = Math.round(largo * dpr)
      if (t.width === w) return
      t.width = w
      t.height = Math.round((w * ALTEZZA_LAVAGNA) / LARGHEZZA_LAVAGNA)
      scala.current = w / LARGHEZZA_LAVAGNA
      daCapo()
    }
    misura()
    const ro = new ResizeObserver(misura)
    ro.observe(t)
    return () => ro.disconnect()
  }, [daCapo])

  // Le mosse che arrivano: chi guarda le riceve tutte, chi disegna solo quelle di partenza.
  useEffect(() => {
    if (modifica && disegnate.current.length > 0) return
    const prima = disegnate.current
    const continua = ops.length >= prima.length && prima.every((op, i) => op === ops[i])
    disegnate.current = [...ops]
    const ctx = contesto()
    if (!ctx) return
    if (!continua || applica(ctx, scala.current, ops, prima.length, penna.current)) daCapo()
  }, [ops, modifica, daCapo])

  const aggiungi = useCallback((op: OpTratto) => {
    disegnate.current.push(op)
    onOpRef.current?.(op)
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      annulla: () => {
        if (!disegnate.current.some((op) => op.tipo === 'tratto')) return
        aggiungi({ tipo: 'annulla' })
        daCapo()
      },
      pulisci: () => {
        aggiungi({ tipo: 'pulisci' })
        daCapo()
      },
    }),
    [aggiungi, daCapo],
  )

  /** Dove sta il puntatore, nelle unita' della lavagna. */
  const posto = (e: { clientX: number; clientY: number }) => {
    const r = tela.current!.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * LARGHEZZA_LAVAGNA
    const y = ((e.clientY - r.top) / r.height) * ALTEZZA_LAVAGNA
    return {
      x: Math.round(Math.max(0, Math.min(LARGHEZZA_LAVAGNA - 1, x))),
      y: Math.round(Math.max(0, Math.min(ALTEZZA_LAVAGNA - 1, y))),
    }
  }

  const giu = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!modifica || ferma || tocco.current || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const { x, y } = posto(e)
    const { colore, spessore } = strumentoRef.current
    const p: Penna = { colore, spessore, x, y }
    tocco.current = { id: e.pointerId, penna: p }
    const ctx = contesto()
    if (ctx) punto(ctx, scala.current, p)
    penna.current.corrente = { ...p }
    aggiungi({ tipo: 'tratto', colore, spessore, punti: [x, y] })
  }

  const muovi = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const t = tocco.current
    if (!t || t.id !== e.pointerId) return
    e.preventDefault()
    const eventi = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
    const nuovi: number[] = []
    let { x: ux, y: uy } = t.penna
    for (const ev of eventi.length > 0 ? eventi : [e.nativeEvent]) {
      const { x, y } = posto(ev)
      if (Math.hypot(x - ux, y - uy) < PASSO_MINIMO) continue
      nuovi.push(x, y)
      ux = x
      uy = y
    }
    if (nuovi.length === 0) return
    const ctx = contesto()
    if (ctx) segmenti(ctx, scala.current, t.penna, nuovi)
    penna.current.corrente = { ...t.penna }
    aggiungi({ tipo: 'segue', punti: nuovi })
  }

  const su = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tocco.current?.id === e.pointerId) tocco.current = null
  }

  // Il tempo finito a meta' tratto: il dito che resta giu' non disegna piu'.
  useEffect(() => {
    if (ferma) tocco.current = null
  }, [ferma])

  return (
    <canvas
      ref={tela}
      className={`scr-lavagna${modifica && !ferma ? ' is-attiva' : ''}`}
      role="img"
      aria-label={etichetta}
      onPointerDown={giu}
      onPointerMove={muovi}
      onPointerUp={su}
      onPointerCancel={su}
      onLostPointerCapture={su}
    />
  )
})
