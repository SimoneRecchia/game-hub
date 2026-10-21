import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ALTEZZA_TAVOLA, CUBETTI, LARGHEZZA_TAVOLA, LATO_CUBETTO } from '@shared/sequenze'
import type { ErroreProva, FaseProva, Prova } from './useProva'

interface Props {
  fase: FaseProva
  /** Il cubetto acceso dai lampi. */
  acceso: number | null
  /** I cubetti della sequenza, per accenderli di verde quando e' giusta. */
  sequenza: number[] | null
  errore: ErroreProva | null
  onTocca: (cubetto: number) => void
}

/** Quanto resta acceso un cubetto toccato: il lampo del dito, piu' corto di quello della sequenza. */
const LAMPO_TOCCO_MS = 240

/**
 * La tavola: nove cubetti sparsi, che si accendono uno alla volta e poi si
 * toccano. I cubetti sono bottoni, e si toccano solo quando tocca a chi gioca:
 * mentre la sequenza si accende stanno fermi, e dopo l'errore mostrano dove si
 * e' sbagliato — il cubetto toccato in rosso, quello giusto bordato.
 */
export function Tavola({ fase, acceso, sequenza, errore, onTocca }: Props) {
  const [toccato, setToccato] = useState<{ cubetto: number; n: number } | null>(null)
  const timer = useRef<number | null>(null)
  const n = useRef(0)

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  const premi = (cubetto: number) => {
    if (fase !== 'tocca') return
    n.current += 1
    setToccato({ cubetto, n: n.current })
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToccato(null), LAMPO_TOCCO_MS)
    onTocca(cubetto)
  }

  const giusti = fase === 'giusta' && sequenza ? new Set(sequenza) : null
  return (
    <div className={`seq-tavola is-${fase}`} role="group" aria-label="La tavola dei cubetti">
      <span className="seq-venature" aria-hidden="true" />
      {CUBETTI.map((c, i) => {
        const stato =
          acceso === i
            ? 'is-acceso'
            : errore?.toccato === i
              ? 'is-sbagliato'
              : errore?.atteso === i
                ? 'is-atteso'
                : giusti?.has(i)
                  ? 'is-giusto'
                  : toccato?.cubetto === i
                    ? 'is-toccato'
                    : ''
        return (
          <button
            key={i}
            type="button"
            className={`seq-cubetto ${stato}`}
            style={
              {
                left: `${((c.x - LATO_CUBETTO / 2) / LARGHEZZA_TAVOLA) * 100}%`,
                top: `${((c.y - LATO_CUBETTO / 2) / ALTEZZA_TAVOLA) * 100}%`,
                width: `${(LATO_CUBETTO / LARGHEZZA_TAVOLA) * 100}%`,
                height: `${(LATO_CUBETTO / ALTEZZA_TAVOLA) * 100}%`,
                '--r': `${c.r}deg`,
              } as CSSProperties
            }
            aria-label={`Cubetto ${i + 1}`}
            aria-disabled={fase !== 'tocca'}
            tabIndex={fase === 'tocca' ? 0 : -1}
            onPointerDown={(e) => {
              // Il tocco vale quando il dito scende, come un tasto: aspettando che si alzi i tocchi veloci si perdono.
              if (e.pointerType !== 'mouse' || e.button === 0) {
                e.preventDefault()
                premi(i)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                premi(i)
              }
            }}
          >
            <span className="seq-cubetto__faccia" key={toccato?.cubetto === i ? toccato.n : 0} />
          </button>
        )
      })}
      {/* Una sequenza giusta: l'adesivo salta fuori sopra la tavola e se ne va (la chiave e' la sequenza). */}
      {fase === 'giusta' && sequenza && (
        <span className="seq-bravo" aria-hidden="true">
          <span key={sequenza.length} className={`seq-bravo__carta${sequenza.length % 2 ? ' is-b' : ''}`}>
            Bravo!
          </span>
        </span>
      )}
    </div>
  )
}

/** I tocchi della sequenza: un pallino per cubetto, pieno quando lo si e' toccato. */
export function Pallini({ quanti, toccati, errore }: { quanti: number; toccati: number; errore: boolean }) {
  return (
    <span className="seq-pallini" aria-hidden="true">
      {Array.from({ length: quanti }, (_, k) => (
        <span
          key={k}
          className={`seq-pallino${k < toccati ? (errore && k === toccati - 1 ? ' is-sbagliato' : ' is-pieno') : ''}`}
        />
      ))}
    </span>
  )
}

/** Sotto la tavola, che cosa fare: guardare, toccare, e com'e' andata. */
export function MessaggioProva({ prova, indietro, attesa }: { prova: Prova; indietro: boolean; attesa: boolean }) {
  const testo = attesa
    ? 'Arriva la sequenza…'
    : prova.fase === 'guarda'
      ? 'Guarda i cubetti che si accendono'
      : prova.fase === 'tocca'
        ? indietro
          ? 'Al contrario: dall’ultimo al primo'
          : 'Tocca nello stesso ordine'
        : prova.fase === 'giusta'
          ? 'Giusta! Ne arriva una più lunga'
          : prova.fase === 'sbagliata'
            ? 'Sbagliata'
            : ''
  return (
    <p className={`seq-messaggio is-${attesa ? 'ferma' : prova.fase}`} role="status">
      {testo}
    </p>
  )
}
