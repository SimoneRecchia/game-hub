import { memo, useEffect, useRef, type CSSProperties } from 'react'
import { suona } from '@/lib/suoni'
import type { CategoriaQuiz } from '@shared/quiz'
import { RULLI, finestra } from '@shared/slot'
import { Simbolo } from './simboli'

/**
 * I tre rulli della slot. Girano verso il basso, come quelli veri, e si
 * fermano uno dopo l'altro sulle fermate del server.
 *
 * Il trucco delle slot sul web: mentre un rullo gira sfocato i simboli non si
 * leggono, quindi quando comincia a frenare lo si porta di colpo cinque fermate
 * prima della sua, e da li' frena con `1 - (1 - t)^3` — una curva che comincia
 * proprio alla velocita' che aveva — passando un filo oltre e tornando indietro,
 * come un rullo che si incastra. Così ogni rullo si ferma quando deve, qualunque
 * sia la sua fermata, e mai prima di quello alla sua sinistra.
 *
 * Il disegno e' fermo: a ogni fotogramma si scrive solo lo spostamento della
 * striscia di ogni rullo (tre giri dei suoi simboli), come la rotazione della
 * ruota di Crazy Time. Passare dallo stato di React ridisegnerebbe duecento
 * simboli sessanta volte al secondo.
 */

/** Simboli al secondo, a tutta velocita'. */
const VELOCITA = 26
/** Quanto ci mette a partire. */
const PARTENZA_MS = 260
/** Le fermate della frenata, e quanto la supera prima di incastrarsi. */
const FRENATA = 5
const OLTRE = 0.16
const INCASTRO_MS = 220
/** Il primo rullo si ferma almeno questo dopo la leva, gli altri questo dopo quello prima. */
const PRIMO_MS = 900
const DOPO_MS = 420
/** L'attesa del terzo rullo quando i primi due promettono una tripla o i tre sette. */
const SUSPENSE_MS = 1_100
/** Sotto questa velocita' i simboli si leggono di nuovo: niente sfocato. */
const NITIDO = 9

const COPIE = 3
const N = RULLI[0].length

type Fase = 'fermo' | 'gira' | 'frena' | 'incastra'

interface StatoRullo {
  fase: Fase
  /** La fermata sulla linea, in simboli: puo' essere frazionaria, e si legge modulo N. */
  pos: number
  velocita: number
  /** La frenata: da dove, fino a dove (oltre la fermata), quando comincia e quanto dura. */
  da: number
  a: number
  inizio: number
  durata: number
  fermata: number
}

const modulo = (x: number) => ((x % N) + N) % N

/** Lo spostamento della striscia: la riga in cima mostra la fermata meno uno, nel giro di mezzo. */
function spostamento(pos: number): string {
  const d = N + modulo(pos)
  return `translate3d(0, ${(-(d - 1) * 100) / (N * COPIE)}%, 0)`
}

/** Se i primi due rulli promettono qualcosa: la stessa categoria in vista, o due sette sulla linea. */
export function promette(fermate: readonly number[]): boolean {
  const righe = finestra(fermate)
  const linea = righe[1]
  if (linea[0] === '7' && linea[1] === '7') return true
  for (let k = 0; k < 6; k += 1) {
    const codice = String(k)
    if ([0, 1].every((r) => righe.some((riga) => riga[r] === codice))) return true
  }
  return false
}

export interface MetaRulli {
  fermate: number[]
  /** Cambia a ogni giro: un giro nuovo, anche sulle stesse fermate. */
  chiave: string
}

export const Rulli = memo(function Rulli({
  categorie,
  inMoto,
  meta,
  vincenti,
  onFermo,
  onFine,
}: {
  categorie: readonly CategoriaQuiz[]
  /** I rulli girano: si e' tirata la leva, e la meta arrivera'. */
  inMoto: boolean
  /** Dove fermarsi. Quella che c'e' quando i rulli compaiono e' dove stanno gia' fermi. */
  meta: MetaRulli | null
  /** Le caselle da accendere, a rulli fermi: [rullo, riga]. */
  vincenti: ReadonlyArray<readonly [number, number]>
  onFermo?: (rullo: number) => void
  onFine?: () => void
}) {
  const strisce = useRef<Array<HTMLDivElement | null>>([])
  const contenitori = useRef<Array<HTMLDivElement | null>>([])
  const stati = useRef<StatoRullo[]>(
    RULLI.map((_, r) => {
      const pos = meta?.fermate[r] ?? r * 7
      return { fase: 'fermo', pos, velocita: 0, da: pos, a: pos, inizio: 0, durata: 0, fermata: pos }
    }),
  )
  const avvio = useRef(0)
  const ultimaChiave = useRef(meta?.chiave ?? null)
  const chiamate = useRef({ onFermo, onFine })
  useEffect(() => {
    chiamate.current = { onFermo, onFine }
  })

  // La prima posizione, prima di qualunque fotogramma.
  useEffect(() => {
    stati.current.forEach((s, r) => {
      const el = strisce.current[r]
      if (el) el.style.transform = spostamento(s.pos)
    })
  }, [])

  // La leva: tutti e tre partono, e girano finché non arriva la meta.
  useEffect(() => {
    if (!inMoto) return
    const ridotto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (ridotto) return
    avvio.current = performance.now()
    for (const s of stati.current) {
      s.fase = 'gira'
      s.velocita = 0
    }
  }, [inMoto])

  // La meta: si pianifica la frenata di ogni rullo.
  useEffect(() => {
    if (!meta || meta.chiave === ultimaChiave.current) return
    ultimaChiave.current = meta.chiave
    const ridotto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (ridotto) {
      stati.current.forEach((s, r) => {
        s.fase = 'fermo'
        s.pos = meta.fermate[r]
        const el = strisce.current[r]
        if (el) el.style.transform = spostamento(s.pos)
      })
      chiamate.current.onFermo?.(2)
      chiamate.current.onFine?.()
      return
    }
    const adesso = performance.now()
    const suspense = promette(meta.fermate)
    let quando = Math.max(avvio.current + PRIMO_MS, adesso + 260)
    stati.current.forEach((s, r) => {
      if (r > 0) quando += DOPO_MS + (r === 2 && suspense ? SUSPENSE_MS : 0)
      s.fermata = meta.fermate[r]
      s.inizio = quando
      s.durata = ((FRENATA + OLTRE) * 3 * 1000) / VELOCITA
      if (s.fase === 'fermo') s.fase = 'gira'
    })
    const terzo = contenitori.current[2]
    if (suspense && terzo) terzo.classList.add('is-suspense')
  }, [meta])

  // Il motore: un fotogramma alla volta, per tutti e tre.
  useEffect(() => {
    let id = 0
    let prima = performance.now()
    const passo = (t: number) => {
      const dt = Math.min(0.05, (t - prima) / 1000)
      prima = t
      stati.current.forEach((s, r) => {
        const el = strisce.current[r]
        const box = contenitori.current[r]
        if (!el || s.fase === 'fermo') return
        if (s.fase === 'gira') {
          const dalla = t - avvio.current
          s.velocita = VELOCITA * Math.min(1, dalla / PARTENZA_MS) ** 2
          s.pos -= s.velocita * dt
          if (s.inizio > 0 && t >= s.inizio) {
            // Il salto, a rullo sfocato: cinque fermate prima della sua, e da li' si frena.
            s.fase = 'frena'
            s.da = s.fermata + FRENATA
            s.a = s.fermata - OLTRE
            s.pos = s.da
          }
        } else if (s.fase === 'frena') {
          const u = Math.min(1, (t - s.inizio) / s.durata)
          const e = 1 - (1 - u) ** 3
          s.pos = s.da + (s.a - s.da) * e
          s.velocita = (3 * (s.da - s.a) * (1 - u) ** 2 * 1000) / s.durata
          if (u >= 1) {
            s.fase = 'incastra'
            s.inizio = t
            chiamate.current.onFermo?.(r)
            suona('fermo', { volume: r === 2 ? 1 : 0.8 })
          }
        } else if (s.fase === 'incastra') {
          const u = Math.min(1, (t - s.inizio) / INCASTRO_MS)
          s.pos = s.a + (s.fermata - s.a) * (1 - (1 - u) ** 2)
          s.velocita = 0
          if (u >= 1) {
            s.fase = 'fermo'
            s.pos = s.fermata
            s.inizio = 0
            if (r === 2) {
              box?.classList.remove('is-suspense')
              chiamate.current.onFine?.()
            }
          }
        }
        el.style.transform = spostamento(s.pos)
        box?.classList.toggle('is-mosso', s.velocita > NITIDO)
      })
      id = requestAnimationFrame(passo)
    }
    id = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(id)
  }, [])

  // Il ticchettio mentre girano: uno ogni 90 ms, finché il terzo non si ferma.
  useEffect(() => {
    if (!inMoto) return
    const t = window.setInterval(() => {
      if (stati.current.some((s) => s.fase === 'gira' || s.fase === 'frena')) suona('rullo', { volume: 0.5 })
    }, 90)
    return () => window.clearInterval(t)
  }, [inMoto])

  return (
    <div className="slot-rulli">
      {RULLI.map((rullo, r) => (
        <div key={r} className="slot-rullo" ref={(el) => void (contenitori.current[r] = el)}>
          <div className="slot-rullo__striscia" ref={(el) => void (strisce.current[r] = el)}>
            <Striscia simboli={rullo} categorie={categorie} />
          </div>
          <span className="slot-rullo__ombra" aria-hidden="true" />
        </div>
      ))}
      <div className="slot-rulli__luci" aria-hidden="true">
        {vincenti.map(([rullo, riga]) => (
          <span
            key={`${rullo}-${riga}`}
            className="slot-rulli__luce"
            style={{ '--rullo': rullo, '--riga': riga } as CSSProperties}
          />
        ))}
      </div>
    </div>
  )
})

/** Tre giri dei simboli di un rullo, uno sotto l'altro: la striscia che scorre. */
const Striscia = memo(function Striscia({
  simboli,
  categorie,
}: {
  simboli: readonly string[]
  categorie: readonly CategoriaQuiz[]
}) {
  return (
    <>
      {Array.from({ length: COPIE }, (_, copia) =>
        simboli.map((s, i) => (
          <span key={`${copia}-${i}`} className="slot-rullo__casella">
            <Simbolo codice={s as never} categorie={categorie} />
          </span>
        )),
      )}
    </>
  )
})
