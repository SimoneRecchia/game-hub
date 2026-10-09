import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Coriandoli } from '@/components/Elementi'
import { suona } from '@/lib/suoni'
import { DURATA_DIRETTA_MS, PALLINE_MS, presiDi } from '@shared/superenalotto'
import type { PremioEnalotto } from '@shared/superenalotto'
import type { SchedaEnalotto } from '@shared/types'
import { Pallina } from './Pallina'
import { ORDINALI } from './palline'
import { Urna, VIAGGIO_MS } from './urna'
import './Diretta.css'

/** Quando una pallina e' arrivata al suo posto, e quanto resta il suo annuncio. */
const ARRIVO = VIAGGIO_MS * 0.9
const ANNUNCIO_MS = 2600
/** Il riepilogo: dopo l'annuncio dell'ultima. */
const RIEPILOGO_MS = PALLINE_MS[PALLINE_MS.length - 1] + ARRIVO + ANNUNCIO_MS
const SOFFIO_DA = 4500

const minuti = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * La diretta dell'estrazione, a pieno schermo: l'urna in 3D (`Urna`) e sopra
 * quel che si legge — il conto alla rovescia, i titoli, il numero di ogni
 * pallina quando arriva al suo posto, le schede di chi guarda che si accendono
 * numero per numero, e alla fine la combinazione e com'e' andata. Il tempo e'
 * quello della diretta (`inizio`, sull'orologio del telefono rimesso su quello
 * del server): chi arriva a meta' la trova a meta'. La replica e' la stessa
 * diretta, con l'orologio che parte quando la si apre.
 */
export default function Diretta({
  data,
  inizio,
  estratti,
  mie,
  premi,
  replica,
  onChiudi,
}: {
  data: string
  /** L'inizio della diretta, in `Date.now()` del telefono. */
  inizio: number
  /** I numeri, nell'ordine: null finché la diretta non comincia. */
  estratti: number[] | null
  mie: SchedaEnalotto[]
  /** I premi, quando sono pagati. */
  premi: PremioEnalotto[] | null
  replica: boolean
  onChiudi: () => void
}) {
  const tela = useRef<HTMLCanvasElement>(null)
  const urna = useRef<Urna | null>(null)
  const [t, setT] = useState(() => Date.now() - inizio)
  const [senza3d, setSenza3d] = useState(false)
  const tempo = useRef(() => Date.now() - inizio)
  useEffect(() => {
    tempo.current = () => Date.now() - inizio
  }, [inizio])

  useEffect(() => {
    const canvas = tela.current
    if (!canvas) return
    let u: Urna
    try {
      u = new Urna(canvas, () => tempo.current())
    } catch {
      setSenza3d(true)
      return
    }
    urna.current = u
    const misura = () => u.ridimensiona(canvas.clientWidth, canvas.clientHeight)
    misura()
    const osserva = new ResizeObserver(misura)
    osserva.observe(canvas)
    u.avvia()
    return () => {
      osserva.disconnect()
      u.distruggi()
      urna.current = null
    }
  }, [])

  useEffect(() => {
    urna.current?.imposta(estratti)
  }, [estratti, senza3d])

  // Il tempo per quel che si legge: dieci volte al secondo bastano, l'urna ha il suo.
  useEffect(() => {
    const id = window.setInterval(() => setT(Date.now() - inizio), 100)
    return () => window.clearInterval(id)
  }, [inizio])

  // I suoni della diretta, ognuno una volta, al suo momento; chi arriva tardi non sente quelli gia' passati.
  const suonati = useRef(new Set<string>())
  const prima = useRef(t)
  useEffect(() => {
    const da = prima.current
    prima.current = t
    const passa = (chiave: string, quando: number, fai: () => void) => {
      if (suonati.current.has(chiave) || t < quando) return
      suonati.current.add(chiave)
      if (da <= quando + 400) fai()
    }
    passa('via', 0, () => suona('intermezzo'))
    for (let x = SOFFIO_DA; x < PALLINE_MS[PALLINE_MS.length - 1] + 2000; x += 3800) {
      passa(`urna${x}`, x, () => suona('urna', { altezza: 4 }))
    }
    if (!estratti) return
    PALLINE_MS.forEach((t0, i) => {
      passa(`tamburo${i}`, t0 - 2200, () => suona('tamburo', { altezza: 2.1 }))
      passa(`estratto${i}`, t0, () => suona('estratto'))
      const mio = mie.some((s) => s.numeri.includes(estratti[i]))
      passa(`arrivo${i}`, t0 + ARRIVO, () => suona(mio ? 'sale' : 'rimbalzo', mio ? { altezza: 1 + i * 0.15 } : {}))
    })
    const migliore = Math.max(0, ...mie.map((s) => presiDi(s.numeri, estratti)))
    passa('fine', RIEPILOGO_MS, () => suona(migliore >= 2 ? 'vincita' : 'pareggio'))
  }, [t, estratti, mie])

  // Esc chiude, come un foglio.
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => e.key === 'Escape' && onChiudi()
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [onChiudi])

  const usciti = estratti ? estratti.filter((_, i) => t >= PALLINE_MS[i] + ARRIVO) : []
  const annuncio =
    estratti &&
    PALLINE_MS.map((t0, i) => ({ i, da: t0 + ARRIVO })).find(({ da }) => t >= da && t < da + ANNUNCIO_MS)
  const attesa = estratti && PALLINE_MS.findIndex((t0) => t >= t0 - 2200 && t < t0 + ARRIVO)
  const riepilogo = t >= RIEPILOGO_MS && estratti
  const migliore = estratti ? Math.max(0, ...mie.map((s) => presiDi(s.numeri, estratti))) : 0
  const vinto = premi && mie.reduce((s, x) => s + (x.vincita ?? 0), 0)
  const quando = new Date(`${data}T12:00:00Z`).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })

  return createPortal(
    <div className="se-diretta" role="dialog" aria-modal="true" aria-label={`Estrazione di ${quando}`}>
      <div className="se-diretta__fasci" aria-hidden="true" />
      <canvas className="se-diretta__tela" ref={tela} aria-hidden="true" />
      {senza3d && <div className="se-diretta__urna2d" aria-hidden="true" />}

      <header className="se-diretta__testa">
        <button type="button" className="se-diretta__chiudi" onClick={onChiudi} aria-label="Chiudi la diretta">
          ✕
        </button>
        <span className="se-diretta__marchio">
          Super<b>Enalotto</b>
        </span>
        <span className={`se-diretta__bollino${replica ? ' is-replica' : ''}`}>{replica ? 'Replica' : 'In diretta'}</span>
      </header>

      <div className="se-diretta__centro" aria-live="polite">
        {t < 0 && (
          <div className="se-diretta__attesa">
            <span>Estrazione di {quando}</span>
            <strong className="u-tabnum">Si comincia fra {minuti(-t)}</strong>
          </div>
        )}
        {t >= 0 && t < SOFFIO_DA && (
          <div className="se-diretta__titolo" key="titolo">
            <span>L’estrazione</span>
            <strong>{quando}</strong>
          </div>
        )}
        {attesa !== null && attesa >= 0 && !annuncio && (
          <p className="se-diretta__prossima" key={`p${attesa}`}>
            Si estrae il {ORDINALI[attesa].toLowerCase()} numero…
          </p>
        )}
        {annuncio && estratti && (
          <div className="se-diretta__annuncio" key={`a${annuncio.i}`}>
            <span className="se-diretta__ordinale">{ORDINALI[annuncio.i]} estratto</span>
            <Pallina n={estratti[annuncio.i]} />
            {mie.some((s) => s.numeri.includes(estratti[annuncio.i])) && <span className="se-diretta__tuo">È tuo!</span>}
          </div>
        )}
        {riepilogo && (
          <div className="se-diretta__riepilogo">
            <span className="se-diretta__ordinale">La combinazione vincente</span>
            <span className="se-diretta__combinazione">
              {[...estratti].sort((a, b) => a - b).map((n) => (
                <Pallina key={n} n={n} />
              ))}
            </span>
            <p className="se-diretta__esito">
              {mie.length === 0
                ? 'Non avevi schede per questa estrazione.'
                : migliore >= 2
                  ? `Hai fatto ${migliore}!`
                  : 'Niente per te, stavolta.'}
            </p>
            {mie.length > 0 && migliore >= 2 && (
              <p className="se-diretta__premio">
                {vinto !== null && vinto !== undefined
                  ? vinto > 0
                    ? `Hai vinto ${vinto} ${vinto === 1 ? 'punto' : 'punti'}`
                    : 'Il premio, diviso fra tanti, è di zero punti'
                  : t < DURATA_DIRETTA_MS
                    ? 'I premi fra un attimo…'
                    : 'Conto i premi…'}
              </p>
            )}
            <button type="button" className="se-diretta__fine" onClick={onChiudi}>
              {premi ? 'Vedi i premi' : 'Chiudi'}
            </button>
          </div>
        )}
      </div>

      <footer className="se-diretta__piede">
        <div className="se-diretta__estratti" aria-label="Numeri estratti">
          {PALLINE_MS.map((_, i) => (
            <span key={i} className="se-diretta__posto">
              {usciti[i] !== undefined ? <Pallina n={usciti[i]} piccola /> : <span className="se-diretta__vuoto" />}
            </span>
          ))}
        </div>
        {mie.length > 0 && (
          <ul className="se-diretta__mie" aria-label="Le tue schede">
            {mie.map((s) => {
              const presi = s.numeri.filter((n) => usciti.includes(n)).length
              return (
                <li key={s.id} className={`se-diretta__scheda${presi >= 2 ? ' is-vince' : ''}`}>
                  {s.numeri.map((n) => (
                    <span key={n} className={`se-diretta__numero u-tabnum${usciti.includes(n) ? ' is-preso' : ''}`}>
                      {n}
                    </span>
                  ))}
                  <span className="se-diretta__conto u-tabnum">{presi}/4</span>
                </li>
              )
            })}
          </ul>
        )}
      </footer>
      {riepilogo && vinto !== null && vinto > 0 && <Coriandoli />}
    </div>,
    document.body,
  )
}
