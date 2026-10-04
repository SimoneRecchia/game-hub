import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '@/lib/haptics'
import { suona } from '@/lib/suoni'
import { LETTERE_NOMI } from '@shared/nomi-cose'
import { movimentoRidotto } from './Foglio'
import { fermataDi, inizioFrenata } from './scena'
import './Rullo.css'

/**
 * Il rullo delle lettere: come al tavolo, dove uno dice l'alfabeto a mente e
 * un altro lo ferma, le lettere del gioco corrono in ordine dentro la
 * finestra di un tondo giallo, con l'alfabeto inciso sul bordo che gira
 * insieme, e si fermano sulla lettera della partita.
 *
 * Gira appena si comincia, prima che la lettera si sappia — come i rulli della
 * slot aspettano il server — e quando arriva frena: un salto che non si vede,
 * a lettere sfocate, `FRENATA` lettere prima della sua, e da li' `1 - (1 - t)^3`,
 * una curva che comincia proprio alla velocita' che aveva, un filo oltre e
 * indietro. Ogni lettera che passa scatta, sempre piu' piano. Ferma, la
 * lettera timbra: i raggi, l'onda, il suono; poi resta un attimo, e chi usa il
 * rullo la fa volare sul foglio (`VoloLettera`).
 *
 * Il disegno e' fermo: a ogni fotogramma si scrivono solo lo spostamento della
 * striscia e la rotazione del bordo, come la ruota di Crazy Time.
 */

const N = LETTERE_NOMI.length
const COPIE = 3
/** Lettere al secondo, a tutta velocita'. */
const VELOCITA = 16
const PARTENZA_MS = 220
/** Quanto gira almeno, anche se la lettera arriva subito: e' lo spettacolo. */
const GIRO_MINIMO_MS = 420
/** Le lettere della frenata, e quanto la supera prima di incastrarsi. */
const FRENATA = 4
const OLTRE = 0.16
const INCASTRO_MS = 190
/** Quanto resta ferma la lettera, prima di volare sul foglio. */
const TIENI_MS = 340
/** Sotto questa velocita' le lettere si leggono: niente sfocato. */
const NITIDO = 6
/** Fra uno scatto e l'altro, a rullo veloce: sarebbe un ronzio. */
const SCATTO_MS = 60

type Fase = 'fermo' | 'gira' | 'frena' | 'incastra' | 'arrivato'

const modulo = (x: number) => ((x % N) + N) % N

/** Lo spostamento della striscia: nella finestra la lettera `pos`, nel giro di mezzo. */
function spostamento(pos: number): string {
  return `translate3d(0, ${(-(N + modulo(pos)) * 100) / (N * COPIE)}%, 0)`
}

/** La rotazione del bordo: la lettera `pos` sotto la tacca in cima. */
function rotazione(pos: number): string {
  return `rotate(${(-modulo(pos) * 360) / N}deg)`
}

export const RulloLettera = memo(function RulloLettera({
  lettera,
  gira,
  faccia = '?',
  onArrivato,
}: {
  /** La lettera della partita, quando si sa. */
  lettera: string | null
  /** Si e' cominciato: il rullo gira finche' la lettera non arriva, e poi si ferma su quella. */
  gira: boolean
  /** Nella finestra a rullo fermo: il punto di domanda, o i secondi del tre-due-uno. */
  faccia?: ReactNode
  /** La lettera e' ferma e si e' vista: dove sta il tondo, per farla volare. */
  onArrivato?: (tondo: Tondo) => void
}) {
  const [fase, setFase] = useState<Fase>('fermo')
  const box = useRef<HTMLSpanElement>(null)
  const tondo = useRef<HTMLSpanElement>(null)
  const striscia = useRef<HTMLSpanElement>(null)
  const anello = useRef<HTMLSpanElement>(null)
  const meta = useRef(lettera)
  meta.current = lettera
  const arrivato = useRef(onArrivato)
  arrivato.current = onArrivato
  const stato = useRef({ fase: 'fermo' as Fase, pos: 0, v: 0, avvio: 0, da: 0, a: 0, fine: 0, inizio: 0, durata: 0 })

  const scrivi = (pos: number) => {
    if (striscia.current) striscia.current.style.transform = spostamento(pos)
    if (anello.current) anello.current.style.transform = rotazione(pos)
  }

  // La lettera ferma: il timbro, e dopo un attimo il volo.
  const ferma = (pos: number, subito: boolean) => {
    const s = stato.current
    s.fase = 'arrivato'
    s.pos = pos
    scrivi(pos)
    setFase('arrivato')
    suona('lettera')
    haptic('tap')
    window.setTimeout(
      () => {
        if (tondo.current) arrivato.current?.(tondoDi(tondo.current))
      },
      subito ? 0 : TIENI_MS,
    )
  }

  useLayoutEffect(() => {
    scrivi(stato.current.pos)
  }, [])

  // Si comincia: il rullo parte, e senza animazioni aspetta fermo la lettera. Se la partenza non va, si ferma.
  useEffect(() => {
    const s = stato.current
    if (gira) {
      if (s.fase !== 'fermo' || movimentoRidotto()) return
      s.fase = 'gira'
      s.avvio = performance.now()
      setFase('gira')
    } else if (s.fase === 'gira') {
      s.fase = 'fermo'
      box.current?.classList.remove('is-mosso')
      setFase('fermo')
    }
  }, [gira])

  // Senza animazioni la lettera compare e basta.
  useEffect(() => {
    if (!gira || !lettera || stato.current.fase === 'arrivato' || !movimentoRidotto()) return
    ferma(N + fermataDi(lettera), true)
  }, [gira, lettera])

  // Il motore: un fotogramma alla volta, finche' la lettera non e' ferma.
  useEffect(() => {
    if (fase !== 'gira') return
    let id = 0
    let prima = performance.now()
    let ultima = Math.round(stato.current.pos)
    let ultimoScatto = 0
    const passo = (t: number) => {
      const s = stato.current
      const dt = Math.min(0.05, (t - prima) / 1_000)
      prima = t
      if (s.fase === 'gira') {
        s.v = VELOCITA * Math.min(1, (t - s.avvio) / PARTENZA_MS) ** 2
        s.pos += s.v * dt
        const l = meta.current
        if (l && t - s.avvio >= GIRO_MINIMO_MS) {
          s.da = inizioFrenata(s.pos, fermataDi(l), FRENATA)
          s.fine = s.da + FRENATA
          s.a = s.fine + OLTRE
          s.inizio = t
          s.durata = (3 * (FRENATA + OLTRE) * 1_000) / VELOCITA
          s.pos = s.da
          s.fase = 'frena'
          ultima = Math.round(s.pos)
        }
      } else if (s.fase === 'frena') {
        const u = Math.min(1, (t - s.inizio) / s.durata)
        s.pos = s.da + (s.a - s.da) * (1 - (1 - u) ** 3)
        s.v = (3 * (s.a - s.da) * (1 - u) ** 2 * 1_000) / s.durata
        if (u >= 1) {
          s.fase = 'incastra'
          s.inizio = t
        }
      } else if (s.fase === 'incastra') {
        const u = Math.min(1, (t - s.inizio) / INCASTRO_MS)
        s.pos = s.a + (s.fine - s.a) * (1 - (1 - u) ** 2)
        s.v = 0
        if (u >= 1) {
          box.current?.classList.remove('is-mosso')
          ferma(s.fine, false)
          return
        }
      }
      scrivi(s.pos)
      box.current?.classList.toggle('is-mosso', s.v > NITIDO)
      // Ogni lettera che passa davanti alla finestra scatta.
      const k = Math.round(s.pos)
      if (k !== ultima) {
        ultima = k
        if (t - ultimoScatto >= SCATTO_MS) {
          ultimoScatto = t
          suona('aletta', { volume: s.fase === 'gira' ? 0.45 : 0.75 })
        }
      }
      id = requestAnimationFrame(passo)
    }
    id = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(id)
  }, [fase])

  return (
    <span ref={box} className={`nomi-rullo is-${fase}`}>
      <span className="nomi-rullo__raggi" aria-hidden="true" />
      <span className="nomi-rullo__onda" aria-hidden="true" />
      <span ref={tondo} className="nomi-rullo__tondo" aria-hidden="true">
        <span ref={anello} className="nomi-rullo__anello">
          {LETTERE_NOMI.map((l, i) => (
            <span key={l} style={{ '--i': i } as CSSProperties}>
              {l.toUpperCase()}
            </span>
          ))}
        </span>
        <span className="nomi-rullo__tacca" />
        <span className="nomi-rullo__finestra">
          <span ref={striscia} className="nomi-rullo__striscia" style={{ '--celle': N * COPIE } as CSSProperties}>
            <Lettere />
          </span>
          <span key={String(faccia)} className="nomi-rullo__faccia">
            {faccia}
          </span>
        </span>
      </span>
      <span className="nomi-rullo__scintille" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} style={{ '--k': i } as CSSProperties} />
        ))}
      </span>
      {fase === 'arrivato' && lettera && (
        <span className="u-visually-hidden" role="status">
          La lettera è la {lettera.toUpperCase()}
        </span>
      )}
    </span>
  )
})

/** Tre giri delle lettere, una sotto l'altra: la striscia che scorre nella finestra. */
const Lettere = memo(function Lettere() {
  return (
    <>
      {Array.from({ length: COPIE }, (_, copia) =>
        LETTERE_NOMI.map((l) => <span key={`${copia}-${l}`}>{l.toUpperCase()}</span>),
      )}
    </>
  )
})

/**
 * La scena della lettera, quando il foglio non c'e' ancora: sopra chi gioca
 * o con che cosa, il rullo, e sotto una riga. Nella sfida ci sono i secondi
 * del tre-due-uno, nella finestra del rullo.
 */
export function Partenza({ sopra, sotto, children }: { sopra?: ReactNode; sotto?: ReactNode; children: ReactNode }) {
  return (
    <div className="nomi-partenza">
      {sopra && <div className="nomi-partenza__sopra">{sopra}</div>}
      {children}
      {sotto && <p className="nomi-partenza__sotto">{sotto}</p>}
    </div>
  )
}

/** Quanto ci mette la lettera a volare dal rullo al foglio. */
export const VOLO_MS = 460

/** Dove sta un tondo sullo schermo: il centro, e il lato senza la rotazione del timbro. */
export interface Tondo {
  x: number
  y: number
  lato: number
}

export function tondoDi(el: HTMLElement): Tondo {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, lato: el.offsetWidth }
}

export interface Volo {
  lettera: string
  /** Il tondo del rullo, dove la lettera si e' fermata. */
  da: Tondo
}

/**
 * La lettera che vola dal rullo al suo posto sul foglio, nell'angolo in alto:
 * una copia del tondo grande, che rimpicciolisce mentre vola — rimpicciolire
 * resta nitido, ingrandire il tondo piccolo no. Sta nel body, come gli
 * adesivi; il posto sul foglio aspetta vuoto finche' non arriva.
 */
export function VoloLettera({ volo, onFine }: { volo: Volo | null; onFine: () => void }) {
  const tondo = useRef<HTMLSpanElement>(null)
  const fine = useRef(onFine)
  fine.current = onFine

  useLayoutEffect(() => {
    if (!volo) return
    const el = tondo.current
    const posto = document.querySelector<HTMLElement>('[data-nomi-meta]')
    if (!el || !posto || movimentoRidotto()) {
      fine.current()
      return
    }
    const a = tondoDi(posto)
    const dx = a.x - volo.da.x
    const dy = a.y - volo.da.y
    const scala = a.lato / volo.da.lato
    // Un arco, non una retta: sale un poco e gira su se stessa, come un timbro che si porta sul foglio.
    const volata = el.animate(
      [
        { transform: 'translate(0, 0) scale(1) rotate(-4deg)' },
        {
          transform: `translate(${dx * 0.5}px, ${dy * 0.35 - 18}px) scale(${(1 + scala) / 2}) rotate(-14deg)`,
          offset: 0.5,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(${scala}) rotate(-4deg)` },
      ],
      { duration: VOLO_MS, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' },
    )
    volata.onfinish = () => fine.current()
    return () => volata.cancel()
  }, [volo])

  if (!volo || typeof document === 'undefined') return null
  return createPortal(
    <span
      ref={tondo}
      className="nomi-lettera nomi-volo"
      style={{
        left: volo.da.x - volo.da.lato / 2,
        top: volo.da.y - volo.da.lato / 2,
        width: volo.da.lato,
        fontSize: volo.da.lato / 2,
      }}
      aria-hidden="true"
    >
      {volo.lettera.toUpperCase()}
    </span>,
    document.body,
  )
}
