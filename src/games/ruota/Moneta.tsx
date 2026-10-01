import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { suona } from '@/lib/suoni'
import { scriviMoltiplicatore, type LatoMoneta } from '@shared/ruota'
import './Moneta.css'

/** Quanto dura il lancio, dalla mano alla moneta ferma. */
export const LANCIO_MS = 1_700
/** Quando tocca terra, in frazione del lancio: da li' un rimbalzo piccolo. */
const TERRA = 0.84
/** I giri interi in aria. */
const GIRI = 7

/** Gli strati d'oro fra le due facce: di taglio fanno lo spessore della moneta. */
const STRATI = [-0.66, -0.22, 0.22, 0.66]

type Fase = 'ferma' | 'carica' | 'aria' | 'caduta'

/**
 * La moneta del Crazy Time: una faccia blu con il suo moltiplicatore, una rossa
 * del banco. Si lancia toccandola: sale girando su se stessa, ricade, rimbalza
 * e resta sul lato uscito.
 *
 * Il lato lo decide il server: al tocco la moneta si carica, come una mano che
 * prende lo slancio, e parte quando arriva la risposta, già sapendo dove
 * ricadere — i giri in aria sono interi, piu' mezzo se esce il rosso. Il salto,
 * il giro e l'ombra sono tre animazioni dello stesso tempo.
 */
export function Moneta({
  moltiplicatore,
  uscito,
  lanciabile,
  annulla,
  onTocca,
  onCaduta,
}: {
  moltiplicatore: number
  /** Il lato uscito: c'e' da quando il server ha lanciato. */
  uscito: LatoMoneta | null
  lanciabile: boolean
  /** Cambia quando il lancio non e' andato: la moneta torna in mano. */
  annulla: number
  onTocca: () => void
  onCaduta: () => void
}) {
  const [fase, setFase] = useState<Fase>(uscito ? 'caduta' : 'ferma')
  // La fase per chi la legge negli effetti: il lancio parte quando arriva il lato, non a ogni fase.
  const faseOra = useRef(fase)
  const cambia = (f: Fase) => {
    faseOra.current = f
    setFase(f)
  }
  const [faccia, setFaccia] = useState<LatoMoneta>(uscito ?? 'blu')
  const radice = useRef<HTMLDivElement>(null)
  const salto = useRef<HTMLDivElement>(null)
  const disco = useRef<HTMLDivElement>(null)
  const ombra = useRef<HTMLDivElement>(null)
  const avvisa = useRef(onCaduta)
  useEffect(() => {
    avvisa.current = onCaduta
  })

  useEffect(() => {
    if (annulla && faseOra.current === 'carica') cambia('ferma')
  }, [annulla])

  useEffect(() => {
    if (!uscito || faseOra.current !== 'carica') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setFaccia(uscito)
      cambia('caduta')
      avvisa.current()
      return
    }
    cambia('aria')
    suona('monetaLancio')
    const alto = -(radice.current?.getBoundingClientRect().height ?? 360) * 0.4
    const finale = GIRI * 360 + (uscito === 'rosso' ? 180 : 0)
    const tempo = { duration: LANCIO_MS, fill: 'forwards' as const }
    const animazioni = [
      salto.current?.animate(
        [
          { transform: 'translateY(0) scale(1)', easing: 'cubic-bezier(.15,.75,.35,1)' },
          { transform: `translateY(${alto}px) scale(1.22)`, offset: 0.44, easing: 'cubic-bezier(.65,0,.9,.45)' },
          { transform: 'translateY(0) scale(1)', offset: TERRA, easing: 'cubic-bezier(.2,.6,.4,1)' },
          { transform: `translateY(${alto * 0.07}px) scale(1.02)`, offset: 0.92, easing: 'cubic-bezier(.6,0,.9,.5)' },
          { transform: 'translateY(0) scale(1)' },
        ],
        tempo,
      ),
      disco.current?.animate(
        [
          { transform: 'rotateX(0deg)', easing: 'cubic-bezier(.3,.55,.55,1)' },
          { transform: `rotateX(${finale}deg)`, offset: TERRA },
          { transform: `rotateX(${finale + 14}deg)`, offset: 0.92 },
          { transform: `rotateX(${finale}deg)` },
        ],
        tempo,
      ),
      ombra.current?.animate(
        [
          { transform: 'scale(1)', opacity: 0.55 },
          { transform: 'scale(0.45)', opacity: 0.18, offset: 0.44 },
          { transform: 'scale(1)', opacity: 0.55, offset: TERRA },
          { transform: 'scale(0.9)', opacity: 0.45, offset: 0.92 },
          { transform: 'scale(1)', opacity: 0.55 },
        ],
        tempo,
      ),
    ]
    const terra = window.setTimeout(() => suona('monetaCade'), LANCIO_MS * TERRA)
    const fine = window.setTimeout(() => {
      setFaccia(uscito)
      cambia('caduta')
      animazioni.forEach((a) => a?.cancel())
      avvisa.current()
    }, LANCIO_MS)
    return () => {
      window.clearTimeout(terra)
      window.clearTimeout(fine)
    }
  }, [uscito])

  const tocca = () => {
    if (!lanciabile || faseOra.current !== 'ferma') return
    cambia('carica')
    suona('tocco')
    onTocca()
  }

  const blu = scriviMoltiplicatore(moltiplicatore)
  return (
    <div ref={radice} className={`ct-moneta is-${fase}${fase === 'caduta' ? ` is-uscito-${faccia}` : ''}`}>
      <div ref={ombra} className="ct-moneta__ombra" aria-hidden="true" />
      <div ref={salto} className="ct-moneta__salto">
        <button
          type="button"
          className="ct-moneta__bottone"
          onClick={tocca}
          disabled={!lanciabile || fase !== 'ferma'}
          aria-label={
            fase === 'caduta'
              ? `È uscito il ${faccia}`
              : `Lancia la moneta: blu ${blu}, rosso vince il banco`
          }
        >
          {fase === 'ferma' && lanciabile && <span className="ct-moneta__invito" aria-hidden="true" />}
          <div
            ref={disco}
            className="ct-moneta__disco"
            style={fase === 'caduta' ? { transform: `rotateX(${faccia === 'rosso' ? 180 : 0}deg)` } : undefined}
          >
            {STRATI.map((z) => (
              <span key={z} className="ct-moneta__strato" style={{ '--z': z } as CSSProperties} aria-hidden="true" />
            ))}
            <span className="ct-moneta__faccia is-blu" aria-hidden="true">
              <span className="ct-moneta__lato">Blu</span>
              <span className="ct-moneta__valore">{blu}</span>
              <span className="ct-moneta__stelle">★ ★ ★</span>
            </span>
            <span className="ct-moneta__faccia is-rosso" aria-hidden="true">
              <span className="ct-moneta__lato">Rosso</span>
              <span className="ct-moneta__banco">Banco</span>
              <span className="ct-moneta__stelle">★ ★ ★</span>
            </span>
          </div>
        </button>
      </div>
    </div>
  )
}
