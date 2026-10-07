import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { IconBackspace, IconShuffle } from '@/components/Icons'
import { suona } from '@/lib/suoni'

export type EsitoProva = 'giusta' | 'sbagliata'

interface Tessera {
  id: number
  lettera: string
}

interface Props {
  /** Le lettere mescolate della parola. */
  lettere: string
  /** Si puo' scrivere: la parola e' aperta e non si sta aspettando il server. */
  attivo: boolean
  /** Una parola fatta con tutte le lettere: chi gioca dice se e' giusta (null se la risposta non e' arrivata). */
  onProva: (parola: string) => Promise<EsitoProva | null>
  /** A parola chiusa, la parola e com'e' finita: le lettere vanno al loro posto. */
  chiusa?: { parola: string; trovata: boolean } | null
}

/** Quanto trema la riga di una parola sbagliata prima che le lettere tornino sotto. */
const TREMA_MS = 480

const tessereDi = (lettere: string): Tessera[] => [...lettere].map((lettera, id) => ({ id, lettera }))

/**
 * Le lettere di una parola: sotto quelle da usare, sopra la parola che si
 * compone. Una lettera si tocca per metterla nella parola, e una lettera della
 * parola si tocca per rimetterla sotto; dalla tastiera si scrive, con il tasto
 * per cancellare e lo spazio per rimescolare. Quando le lettere sono tutte
 * sopra la parola si prova da sola: se non e' giusta la riga trema e le lettere
 * tornano sotto.
 */
export function Lettere({ lettere, attivo, onProva, chiusa = null }: Props) {
  const [vassoio, setVassoio] = useState<Tessera[]>(() => tessereDi(lettere))
  const [poste, setPoste] = useState<number[]>([])
  const [esito, setEsito] = useState<EsitoProva | 'prova' | null>(null)
  // Quante volte si e' rimescolato: due classi che si alternano fanno ripartire l'animazione.
  const [giri, setGiri] = useState(0)
  const posteRef = useRef(poste)
  posteRef.current = poste
  const provaRef = useRef(onProva)
  provaRef.current = onProva

  // Una parola nuova: le sue lettere, tutte sotto.
  useEffect(() => {
    setVassoio(tessereDi(lettere))
    setPoste([])
    setEsito(null)
    setGiri(0)
  }, [lettere])

  const libera = esito === null && attivo && !chiusa
  const perId = (id: number) => vassoio.find((t) => t.id === id)!

  const prova = useCallback((ids: number[]) => {
    const parola = ids.map((id) => tessereDi(lettere)[id].lettera).join('')
    setEsito('prova')
    void provaRef.current(parola).then((r) => {
      if (r === 'giusta') {
        setEsito('giusta')
        suona('giusto')
        return
      }
      if (r === 'sbagliata') {
        setEsito('sbagliata')
        suona('sbagliato')
        window.setTimeout(() => {
          setPoste([])
          setEsito(null)
        }, TREMA_MS)
        return
      }
      setEsito(null)
    })
  }, [lettere])

  const metti = useCallback(
    (id: number) => {
      const attuali = posteRef.current
      if (attuali.includes(id)) return
      const dopo = [...attuali, id]
      setPoste(dopo)
      suona('tocco')
      if (dopo.length === lettere.length) prova(dopo)
    },
    [lettere.length, prova],
  )

  const togli = useCallback((id: number) => {
    setPoste((p) => p.filter((x) => x !== id))
    suona('tocco')
  }, [])

  const mescola = useCallback(() => {
    setVassoio((v) => {
      const nuovo = [...v]
      for (let i = nuovo.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[nuovo[i], nuovo[j]] = [nuovo[j], nuovo[i]]
      }
      return nuovo
    })
    setGiri((g) => g + 1)
    suona('mescola')
  }, [])

  // La tastiera: le lettere, il tasto per cancellare, Esc per rimettere tutto sotto e lo spazio per rimescolare.
  useEffect(() => {
    if (!libera) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable]')) return
      if (e.key === 'Backspace') {
        const ultima = posteRef.current[posteRef.current.length - 1]
        if (ultima !== undefined) togli(ultima)
        e.preventDefault()
        return
      }
      if (e.key === 'Escape') {
        setPoste([])
        return
      }
      if (e.key === ' ') {
        mescola()
        e.preventDefault()
        return
      }
      const lettera = e.key.toLowerCase()
      if (!/^[a-z]$/.test(lettera)) return
      const libere = vassoio.filter((t) => !posteRef.current.includes(t.id) && t.lettera === lettera)
      if (libere.length > 0) metti(libere[0].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [libera, metti, mescola, togli, vassoio])

  const n = lettere.length
  // A parola chiusa la riga di sopra ha la parola, nel suo ordine.
  const sopra = chiusa ? [...chiusa.parola] : poste.map((id) => perId(id).lettera)
  const fine = chiusa ? (chiusa.trovata ? ' is-trovata' : ' is-persa') : ''
  return (
    <div
      className={`ana-lettere${esito ? ` is-${esito}` : ''}${fine}`}
      style={{ '--n': n } as CSSProperties}
    >
      <div className="ana-lettere__parola" aria-label="La parola" aria-live="polite">
        {Array.from({ length: n }, (_, i) => {
          const lettera = sopra[i]
          const id = chiusa ? null : poste[i]
          return (
            <button
              key={i}
              type="button"
              className={`ana-casella${lettera ? ' is-piena' : ''}`}
              style={{ '--i': i } as CSSProperties}
              disabled={!libera || id === undefined || id === null}
              onClick={() => id !== undefined && id !== null && togli(id)}
              aria-label={lettera ? `${lettera.toUpperCase()}, togli` : 'Vuota'}
            >
              {lettera ? <span className="ana-tessera ana-tessera--posta">{lettera.toUpperCase()}</span> : null}
            </button>
          )
        })}
      </div>

      {!chiusa && (
        <>
          <div className={`ana-lettere__vassoio${giri === 0 ? '' : giri % 2 ? ' is-mescolato' : ' is-rimescolato'}`}>
            {vassoio.map((t) => {
              const usata = poste.includes(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`ana-posto${usata ? ' is-vuoto' : ''}`}
                  disabled={!libera || usata}
                  onClick={() => metti(t.id)}
                  aria-label={usata ? 'Già usata' : t.lettera.toUpperCase()}
                >
                  {!usata && <span className="ana-tessera">{t.lettera.toUpperCase()}</span>}
                </button>
              )
            })}
          </div>
          <div className="ana-lettere__comandi">
            <button type="button" className="ana-comando" onClick={mescola} disabled={!libera}>
              <IconShuffle size={18} />
              Mescola
            </button>
            <button
              type="button"
              className="ana-comando"
              onClick={() => setPoste([])}
              disabled={!libera || poste.length === 0}
            >
              <IconBackspace size={18} />
              Cancella
            </button>
          </div>
        </>
      )}
    </div>
  )
}
