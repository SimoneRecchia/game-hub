import { useCallback, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { vicine } from '@shared/paroliere'

/** Come si accende una strada: mentre la si traccia, in attesa del server, e com'e' andata. */
export type TonoStrada = 'attesa' | 'giusta' | 'sbagliata' | 'gia' | 'mostra'

export interface StradaEvidente {
  strada: number[]
  tono: TonoStrada
  /** Una chiave nuova fa ripartire l'animazione, anche sulla stessa strada. */
  chiave: number
}

export type StatoGriglia = 'coperta' | 'scuote' | 'assesta' | 'ferma'

interface Props {
  /** Le facce dei dadi; mentre si scuotono, quelle che passano. */
  facce: readonly string[]
  lato: number
  stato: StatoGriglia
  /** Si traccia solo durante la partita. */
  attiva: boolean
  evidenzia: StradaEvidente | null
  /** La strada scritta con la tastiera del computer, che si vede come una tracciata. */
  digitata: number[] | null
  onCambia: (strada: number[]) => void
  onParola: (strada: number[]) => void
}

/** Una faccia come si legge sul dado: "Qu" con la u piccola, il resto maiuscolo. */
export function faccia(f: string): string {
  return f === 'qu' ? 'Qu' : f.toUpperCase()
}

/** Un poco storto, ogni dado a modo suo: come caduti nella griglia, e sempre uguali per lo stesso posto. */
function storto(i: number): number {
  return (((i * 7919) % 11) - 5) * 0.6
}

/**
 * La griglia dei dadi, da tracciare col dito: si preme su un dado, si scorre
 * sui vicini — anche di sbieco — e lasciando la parola parte. Tornando sul dado
 * di prima si torna indietro di una lettera. Per i vicini di sbieco conta solo
 * il centro di ogni dado (`DENTRO`): passando fra due dadi di lato, il dito
 * sfiora gli angoli di quelli in diagonale, e li prenderebbe.
 *
 * Si gioca anche a tocchi: un dado, poi i vicini uno alla volta, e il tocco
 * sull'ultimo manda la parola. Con la tastiera i dadi sono bottoni, e Invio fa
 * lo stesso tocco.
 *
 * Dito e mouse li sente la griglia, non i dadi: un dado catturerebbe il
 * puntatore, e scorrendo sugli altri non arriverebbe niente.
 */
export function Griglia({ facce, lato, stato, attiva, evidenzia, digitata, onCambia, onParola }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [strada, setStrada] = useState<number[]>([])
  const stradaRef = useRef<number[]>([])
  /** Il dito si e' mosso su un altro dado: lasciando, la parola parte. */
  const trascinato = useRef(false)
  /** Il dito e' sceso sull'ultimo dado: se si alza senza muoversi, e' il tocco che manda. */
  const sullUltimo = useRef(false)
  /** Quando e' arrivato l'ultimo dito: il clic che il browser manda dopo un tocco non va contato due volte. */
  const puntatoreAlle = useRef(-Infinity)

  const cambia = useCallback(
    (nuova: number[]) => {
      stradaRef.current = nuova
      setStrada(nuova)
      onCambia(nuova)
    },
    [onCambia],
  )

  const manda = useCallback(() => {
    const s = stradaRef.current
    cambia([])
    if (s.length > 0) onParola(s)
  }, [cambia, onParola])

  /** Il tocco su un dado, col dito o con la tastiera. */
  const tocca = useCallback(
    (i: number) => {
      const s = stradaRef.current
      if (s.length > 0 && s[s.length - 1] === i) return manda()
      if (s.length > 0 && !s.includes(i) && vicine(s[s.length - 1], lato).includes(i)) return cambia([...s, i])
      cambia([i])
    },
    [cambia, manda, lato],
  )

  /** Il dado sotto il dito: con `centro`, solo se il dito e' vicino al suo centro. */
  const dadoSotto = (e: PointerEvent, centro: boolean): number | null => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return null
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const passo = r.width / lato
    const c = Math.floor(x / passo)
    const riga = Math.floor(y / passo)
    if (c < 0 || c >= lato || riga < 0 || riga >= lato) return null
    if (centro && Math.hypot(x - (c + 0.5) * passo, y - (riga + 0.5) * passo) > passo * DENTRO) return null
    return riga * lato + c
  }

  const giu = (e: PointerEvent<HTMLDivElement>) => {
    if (!attiva || (e.pointerType === 'mouse' && e.button !== 0)) return
    const i = dadoSotto(e, false)
    if (i === null) return
    e.preventDefault()
    puntatoreAlle.current = performance.now()
    ref.current?.setPointerCapture(e.pointerId)
    trascinato.current = false
    const s = stradaRef.current
    sullUltimo.current = s.length > 0 && s[s.length - 1] === i
    if (!sullUltimo.current) {
      if (s.length > 0 && !s.includes(i) && vicine(s[s.length - 1], lato).includes(i)) cambia([...s, i])
      else cambia([i])
    }
  }

  const muovi = (e: PointerEvent<HTMLDivElement>) => {
    if (!attiva || !ref.current?.hasPointerCapture(e.pointerId)) return
    const i = dadoSotto(e, true)
    const s = stradaRef.current
    if (i === null || s.length === 0 || i === s[s.length - 1]) return
    if (s.length > 1 && i === s[s.length - 2]) {
      trascinato.current = true
      cambia(s.slice(0, -1))
    } else if (!s.includes(i) && vicine(s[s.length - 1], lato).includes(i)) {
      trascinato.current = true
      cambia([...s, i])
    }
  }

  const su = (e: PointerEvent<HTMLDivElement>) => {
    if (!ref.current?.hasPointerCapture(e.pointerId)) return
    ref.current.releasePointerCapture(e.pointerId)
    if (trascinato.current || sullUltimo.current) manda()
    trascinato.current = false
    sullUltimo.current = false
  }

  const annulla = () => {
    trascinato.current = false
    sullUltimo.current = false
  }

  // Quel che si vede: la strada tracciata, o quella scritta, o l'ultima com'e' andata.
  const tracciata = strada.length > 0 ? strada : (digitata ?? [])
  const accesa = tracciata.length > 0 ? null : evidenzia
  const filo = tracciata.length > 0 ? tracciata : (accesa?.strada ?? [])
  const centro = (i: number) => `${(i % lato) * 100 + 50},${Math.floor(i / lato) * 100 + 50}`

  return (
    <div
      ref={ref}
      className={`par-griglia is-${stato}${attiva ? ' is-attiva' : ''}${accesa ? ` is-${accesa.tono}` : ''}`}
      style={{ '--lato': lato } as CSSProperties}
      onPointerDown={giu}
      onPointerMove={muovi}
      onPointerUp={su}
      onPointerCancel={annulla}
      onLostPointerCapture={annulla}
    >
      <svg
        key={accesa ? `e${accesa.chiave}` : 't'}
        className="par-griglia__filo"
        viewBox={`0 0 ${lato * 100} ${lato * 100}`}
        aria-hidden="true"
      >
        {filo.length > 1 && (
          <>
            <polyline className="par-griglia__filo-sotto" points={filo.map(centro).join(' ')} />
            <polyline className="par-griglia__filo-sopra" points={filo.map(centro).join(' ')} />
          </>
        )}
        {filo.length > 0 && <circle className="par-griglia__capo" r="11" cx={(filo[0] % lato) * 100 + 50} cy={Math.floor(filo[0] / lato) * 100 + 50} />}
      </svg>
      {facce.map((f, i) => {
        const nellaTracciata = tracciata.indexOf(i)
        const nellAccesa = accesa ? accesa.strada.indexOf(i) : -1
        return (
          <button
            // L'animazione dell'esito riparte da sola: mentre si traccia la parola dopo nessun dado e' acceso.
            key={i}
            type="button"
            className={[
              'par-dado',
              nellaTracciata >= 0 ? 'is-scelto' : '',
              nellaTracciata >= 0 && nellaTracciata === tracciata.length - 1 ? 'is-ultimo' : '',
              nellAccesa >= 0 ? 'is-acceso' : '',
            ].join(' ')}
            style={
              {
                '--i': i,
                '--riga': Math.floor(i / lato),
                '--colonna': i % lato,
                '--storto': `${storto(i)}deg`,
                '--ordine': nellAccesa >= 0 ? nellAccesa : nellaTracciata,
              } as CSSProperties
            }
            tabIndex={attiva ? 0 : -1}
            disabled={!attiva && stato === 'coperta'}
            aria-pressed={nellaTracciata >= 0}
            aria-label={stato === 'coperta' ? 'Dado coperto' : `${faccia(f)}, riga ${Math.floor(i / lato) + 1}, colonna ${(i % lato) + 1}`}
            // Il dito lo sente la griglia: qui arriva il tasto, o il lettore dello schermo, che non hanno un puntatore.
            onClick={() => {
              if (attiva && performance.now() - puntatoreAlle.current > CLIC_DOPO_TOCCO_MS) tocca(i)
            }}
          >
            <span className="par-dado__faccia">{stato === 'coperta' ? '' : faccia(f)}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Il clic che segue un tocco arriva entro qualche centinaio di millisecondi: prima, e' quel tocco. */
const CLIC_DOPO_TOCCO_MS = 700

/** Quanto vicino al centro di un dado deve passare il dito, in parti del lato: piu' della meta' prenderebbe gli angoli. */
const DENTRO = 0.42
