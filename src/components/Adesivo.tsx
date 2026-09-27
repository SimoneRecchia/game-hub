import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './Adesivo.css'

/**
 * Un momento che conta, al centro dello schermo e per un attimo: il colpo
 * affondato della battaglia, la parola indovinata, la mossa da quaranta punti.
 *
 * Due toni, che si riconoscono prima di leggere. **Vivace** e' una carta nel
 * colore del gioco che salta fuori un po' storta: una cosa bella. **Bordato**
 * e' una carta bianca bordata di colore che trema: una cosa brutta, o
 * dell'avversario. Non si tocca e non ferma niente — passa da sola, e sotto la
 * partita continua.
 *
 * Sta nel body e non nella pagina, perché la pagina durante le transizioni fa
 * da contenitore e un `position: fixed` al suo interno si fermerebbe li'.
 */
export interface DatiAdesivo {
  /** Cambia a ogni adesivo: e' la chiave che fa ripartire l'animazione. */
  id: number
  tono: 'vivace' | 'bordato'
  titolo: string
  sotto?: string
  /** Il disegno sopra il titolo. */
  disegno?: ReactNode
  /** Sotto il testo: caselle, tessere, lettere. */
  piede?: ReactNode
  /**
   * Il colore del gioco: lo sfondo della carta vivace (anche un gradiente), il
   * bordo e il titolo di quella bordata.
   */
  colore?: string
  /** Quanto resta: le animazioni in Adesivo.css sono frazioni di questa durata. */
  durata: number
  /** Una classe in piu', per i disegni che hanno bisogno di colori loro. */
  classe?: string
}

export function Adesivo({ adesivo }: { adesivo: DatiAdesivo | null }) {
  if (!adesivo || typeof document === 'undefined') return null
  return createPortal(
    <div
      key={adesivo.id}
      className={`adesivo is-${adesivo.tono}${adesivo.classe ? ` ${adesivo.classe}` : ''}`}
      style={
        {
          '--durata': `${adesivo.durata}ms`,
          ...(adesivo.colore ? { '--adesivo-colore': adesivo.colore } : {}),
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <div className="adesivo__carta">
        {adesivo.disegno}
        <p className="adesivo__titolo">{adesivo.titolo}</p>
        {adesivo.sotto && <p className="adesivo__sotto">{adesivo.sotto}</p>}
        {adesivo.piede}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Un adesivo alla volta: `mostra` lo mette, e dopo la sua durata se ne va da
 * solo. Uno nuovo prende il posto di quello in corso.
 */
export function useAdesivo() {
  const [adesivo, setAdesivo] = useState<DatiAdesivo | null>(null)
  const prossimo = useRef(1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mostra = useCallback((dati: Omit<DatiAdesivo, 'id'>) => {
    const id = prossimo.current
    prossimo.current += 1
    setAdesivo({ ...dati, id })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setAdesivo(null), dati.durata)
  }, [])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return { adesivo, mostra }
}

/**
 * Gli adesivi in fila: uno alla volta, ognuno per la sua durata. La mossa e
 * poi la fine della partita, il mio colpo e poi quello del computer: messi in
 * coda, non si coprono.
 */
export function useCodaAdesivi() {
  const [coda, setCoda] = useState<DatiAdesivo[]>([])
  const prossimo = useRef(1)
  const corrente = coda[0] ?? null

  useEffect(() => {
    if (!corrente) return
    const t = setTimeout(() => setCoda((c) => c.slice(1)), corrente.durata)
    return () => clearTimeout(t)
  }, [corrente])

  const accoda = useCallback((dati: Omit<DatiAdesivo, 'id'>) => {
    const id = prossimo.current
    prossimo.current += 1
    setCoda((c) => [...c, { ...dati, id }])
  }, [])

  /** Al posto di quelli in fila: la fine del quiz non aspetta l'adesivo dell'ultima risposta, gia' visto. */
  const subito = useCallback((dati: Omit<DatiAdesivo, 'id'>) => {
    const id = prossimo.current
    prossimo.current += 1
    setCoda([{ ...dati, id }])
  }, [])

  return { adesivo: corrente, accoda, subito }
}

/**
 * Una fila di caselle con le lettere, che entrano una dopo l'altra: la parola
 * del Wordle indovinata, la parola dello Scarabeo appena posata.
 */
export function LettereAdesivo({ parola, classe = '' }: { parola: string; classe?: string }) {
  return (
    <span className={`adesivo__lettere ${classe}`}>
      {[...parola.toUpperCase()].map((l, i) => (
        <span key={i} style={{ '--i': i } as CSSProperties}>
          {l}
        </span>
      ))}
    </span>
  )
}
