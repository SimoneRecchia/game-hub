import { memo, useEffect, useRef, useState, type ReactElement } from 'react'
import { IconArte, IconCinema, IconLibri, IconMappamondo, IconScienza, IconStoria } from '@/games/quiz/icone'
import { suona } from '@/lib/suoni'
import { SPICCHI, etichettaDi, nomeDi, type MateriaRuota, type Spicchio } from '@shared/ruota'
import './Ruota.css'

/** Quanti gradi prende uno spicchio. */
const PASSO = 360 / SPICCHI.length
/**
 * Il raggio della ruota, dei pioli sul bordo, delle scritte, delle icone e del
 * mozzo, in unita' del disegno. Scritte e icone stanno verso il bordo, dove lo
 * spicchio e' piu' largo.
 */
const RAGGIO = 96
const PIOLI = 92
const SCRITTE = 77
const ICONE = 74
const MOZZO = 24
/** Il lato delle icone delle sfide, e mezza croce della ✕. */
const ICONA = 16
const CROCE = 4.6

/** Quanto dura un giro, e quanti giri interi fa prima di fermarsi. */
const DURATA_GIRO_MS = 5_800
const GIRI = 5
/** Due scatti piu' vicini di cosi' suonano come uno: a ruota veloce sarebbe un ronzio. */
const SCATTO_MINIMO_MS = 45

export const ICONE_MATERIE_RUOTA: Record<MateriaRuota, (p: { size?: number }) => ReactElement> = {
  geografia: IconMappamondo,
  storia: IconStoria,
  arte: IconArte,
  libri: IconLibri,
  cinema: IconCinema,
  scienza: IconScienza,
}

/** Il colore di ogni materia, quello del quiz: arte, libri e cinema sono la cultura. */
export const COLORI_MATERIE_RUOTA: Record<MateriaRuota, string> = {
  geografia: 'var(--materia-geografia-1)',
  storia: 'var(--materia-storia-1)',
  arte: 'var(--materia-cultura-1)',
  libri: 'var(--materia-cultura-1)',
  cinema: 'var(--materia-cultura-1)',
  scienza: 'var(--materia-scienza-1)',
}

/** Le classi di uno spicchio, per il colore: le domande hanno quello della loro materia. */
function classiDi(s: Spicchio): string {
  switch (s.tipo) {
    case 'doppio':
      return 'is-doppio'
    case 'niente':
      return 'is-niente'
    case 'perdi':
      return 'is-perdi'
    case 'moneta':
      return 'is-moneta'
    case 'domanda':
      return `is-domanda is-materia-${s.materia}`
  }
}

/** Un punto sulla circonferenza, dall'alto in senso orario. */
function punto(raggio: number, gradi: number): [number, number] {
  const r = ((gradi - 90) * Math.PI) / 180
  return [raggio * Math.cos(r), raggio * Math.sin(r)]
}

function spicchioPath(i: number): string {
  const [x0, y0] = punto(RAGGIO, i * PASSO)
  const [x1, y1] = punto(RAGGIO, (i + 1) * PASSO)
  return `M0 0L${x0.toFixed(2)} ${y0.toFixed(2)}A${RAGGIO} ${RAGGIO} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`
}

/** L'angolo della ruota che porta lo spicchio sotto la lancetta in cima, con uno scarto dentro lo spicchio. */
export function angoloPer(spicchio: number, scarto = 0): number {
  return -(spicchio * PASSO + PASSO / 2 + scarto)
}

/** Lo spicchio sotto la lancetta, con la ruota girata di `angolo` gradi in senso orario. */
export function spicchioSotto(angolo: number): number {
  const sotto = (((-angolo % 360) + 360) % 360) / PASSO
  return Math.floor(sotto) % SPICCHI.length
}

/** La corona della moneta, come sulla faccia della testa (Moneta.tsx), centrata e rimpicciolita. */
const CORONA = 'M9 27 L11 14 L16.5 20 L20 11 L23.5 20 L29 14 L31 27 Z'

/**
 * Il disegno fermo: spicchi, scritte, icone delle sfide e pioli. Non cambia
 * mai, quindi si disegna una volta; a girare e' il gruppo che lo contiene.
 * Scritte e icone stanno dritte quando lo spicchio e' in cima, sotto la
 * lancetta: e' li' che si guardano. La ✕ e' disegnata e non scritta: il segno
 * non c'e' in tutti i caratteri, e da un telefono all'altro cambiava spessore.
 */
const Disegno = memo(function Disegno() {
  return (
    <>
      {SPICCHI.map((s, i) => (
        <path key={`s${i}`} className={`ruota__spicchio ${classiDi(s)}`} d={spicchioPath(i)} />
      ))}
      {SPICCHI.map((s, i) => {
        const centro = i * PASSO + PASSO / 2
        if (s.tipo === 'moneta' || s.tipo === 'domanda') {
          const Icona = s.tipo === 'domanda' ? ICONE_MATERIE_RUOTA[s.materia] : null
          return (
            <g key={`i${i}`} className={`ruota__sfida ${classiDi(s)}`} transform={`rotate(${centro})`}>
              <g transform={`translate(0 ${-ICONE})`}>
                {Icona ? (
                  <g transform={`translate(${-ICONA / 2} ${-ICONA / 2})`}>
                    <Icona size={ICONA} />
                  </g>
                ) : (
                  <>
                    <circle className="ruota__moneta" r={ICONA / 2} />
                    <path className="ruota__corona" d={CORONA} transform={`scale(${ICONA / 43}) translate(-20 -20)`} />
                  </>
                )}
              </g>
            </g>
          )
        }
        if (s.tipo === 'perdi') {
          return (
            <path
              key={`c${i}`}
              className="ruota__croce"
              transform={`rotate(${centro}) translate(0 ${-SCRITTE})`}
              d={`M${-CROCE} ${-CROCE}L${CROCE} ${CROCE}M${CROCE} ${-CROCE}L${-CROCE} ${CROCE}`}
            />
          )
        }
        return (
          <text
            key={`t${i}`}
            className={`ruota__scritta ${classiDi(s)}`}
            transform={`rotate(${centro})`}
            y={-SCRITTE}
          >
            {etichettaDi(s)}
          </text>
        )
      })}
      {SPICCHI.map((_, i) => {
        const [x, y] = punto(PIOLI, i * PASSO)
        return <circle key={`p${i}`} className="ruota__piolo" cx={x} cy={y} r={1.25} />
      })}
    </>
  )
})

interface Props {
  /** Dove fermarsi: l'indice dello spicchio, o null finché non si gira. */
  fermaSu: number | null
  /** Il numero del giro: due giri di fila sullo stesso spicchio sono due giri, e la ruota li gira tutti e due. */
  giro?: number
  /** Se arrivarci girando o esserci gia', come quando si riapre la pagina. */
  anima: boolean
  onFerma?: () => void
  /** Quel che si legge sul mozzo: la puntata, o l'esito. */
  mozzo: string
  mozzoSotto?: string
}

/**
 * La ruota di Crazy Time: ventiquattro spicchi e una lancetta in cima.
 *
 * Il giro lo decide il server; qui si fa solo vedere. Gira in senso orario per
 * qualche giro e rallenta come una ruota vera (`1 - (1 - t)^4`), e la lancetta
 * scatta a ogni spicchio che passa, con il suo clic. L'angolo si scrive
 * direttamente sul disegno a ogni fotogramma: passare dallo stato di React
 * ridisegnerebbe tutti gli spicchi sessanta volte al secondo. Con il
 * movimento ridotto la ruota si ferma subito dove deve.
 */
export function Ruota({ fermaSu, giro, anima, onFerma, mozzo, mozzoSotto }: Props) {
  const gruppo = useRef<SVGGElement>(null)
  const lancetta = useRef<SVGGElement>(null)
  // Prima del primo giro la ruota sta ferma con il x2 sotto la lancetta.
  const angolo = useRef(angoloPer(0))
  /** Mentre gira, chi non vede non deve sapere dove si fermera'. */
  const [inGiro, setInGiro] = useState(false)
  const avvisa = useRef(onFerma)
  useEffect(() => {
    avvisa.current = onFerma
  })

  useEffect(() => {
    const disegna = (a: number) => gruppo.current?.setAttribute('transform', `rotate(${a.toFixed(3)})`)
    if (fermaSu === null) return
    // Dentro lo spicchio, ma non sul filo: un fermo sul confine sembrerebbe un errore.
    const scarto = (Math.random() - 0.5) * PASSO * 0.6
    const meta = angoloPer(fermaSu, scarto)
    const ridotto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!anima || ridotto) {
      angolo.current = meta
      disegna(meta)
      if (anima) avvisa.current?.()
      return
    }
    const da = angolo.current
    setInGiro(true)
    // Sempre in senso orario: avanti fino all'angolo giusto, piu' i giri interi.
    const avanti = (((meta - da) % 360) + 360) % 360
    const a = da + avanti + 360 * GIRI
    const inizio = performance.now()
    let ultimo = spicchioSotto(da)
    let ultimoScatto = 0
    let fotogramma = 0
    const passo = (adesso: number) => {
      const t = Math.min(1, (adesso - inizio) / DURATA_GIRO_MS)
      const corrente = da + (a - da) * (1 - Math.pow(1 - t, 4))
      angolo.current = corrente
      disegna(corrente)
      const sotto = spicchioSotto(corrente)
      if (sotto !== ultimo) {
        ultimo = sotto
        if (adesso - ultimoScatto > SCATTO_MINIMO_MS) {
          ultimoScatto = adesso
          suona('tocco', { volume: 0.35 })
          lancetta.current?.animate(
            [{ transform: 'rotate(-18deg)' }, { transform: 'rotate(0deg)' }],
            { duration: 140, easing: 'cubic-bezier(.2,.8,.3,1)' },
          )
        }
      }
      if (t < 1) fotogramma = requestAnimationFrame(passo)
      else {
        setInGiro(false)
        avvisa.current?.()
      }
    }
    fotogramma = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(fotogramma)
  }, [fermaSu, giro, anima])

  const sotto = fermaSu === null || inGiro ? null : SPICCHI[fermaSu]
  return (
    <div
      className="ruota"
      role="img"
      aria-label={inGiro ? 'La ruota gira' : sotto ? `La ruota si è fermata su: ${nomeDi(sotto)}` : 'La ruota'}
    >
      <svg className="ruota__svg" viewBox="-110 -114 220 224" aria-hidden="true">
        <defs>
          <radialGradient id="ruota-mozzo" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="var(--ruota-mozzo-1)" />
            <stop offset="100%" stopColor="var(--ruota-mozzo-2)" />
          </radialGradient>
        </defs>
        <circle className="ruota__ombra" r={RAGGIO + 9} cy={3} />
        <circle className="ruota__cornice" r={RAGGIO + 8} />
        <g ref={gruppo} transform={`rotate(${angoloPer(0)})`}>
          <Disegno />
        </g>
        <circle className="ruota__bordo" r={RAGGIO} />
        <circle className="ruota__mozzo" r={MOZZO} fill="url(#ruota-mozzo)" />
        <circle className="ruota__mozzo-filo" r={MOZZO - 2.5} />
        <text className="ruota__mozzo-testo" y={mozzoSotto ? 2 : 4.5}>
          {mozzo}
        </text>
        {mozzoSotto && (
          <text className="ruota__mozzo-sotto" y={11}>
            {mozzoSotto}
          </text>
        )}
        <g className="ruota__lancetta" transform={`translate(0 ${-RAGGIO - 9})`}>
          <g ref={lancetta} className="ruota__lancetta-perno">
            <path d="M-8 -3 L8 -3 L0 15 Z" />
            <circle r={3} cy={-1} />
          </g>
        </g>
      </svg>
    </div>
  )
}
