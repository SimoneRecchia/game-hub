import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { Personaggi } from '@shared/indovina'
import './Tabellone.css'

/** Una carta e' un po' piu' alta che larga: la faccia quadrata, e il nome sotto. */
const RAPPORTO = 0.8
const SPAZIO = 8

/**
 * Quante colonne, per carte piu' grandi possibile nello spazio che c'e': 24
 * personaggi in un telefono in piedi stanno in quattro colonne, su un computer
 * in otto. Si prova ogni numero di colonne e si tiene quello che fa la carta
 * piu' grande.
 */
function disposizione(quante: number, larghezza: number, altezza: number): { colonne: number; lato: number } {
  let migliore = { colonne: 4, lato: 0 }
  for (let colonne = 2; colonne <= 10; colonne += 1) {
    const righe = Math.ceil(quante / colonne)
    const perLarghezza = (larghezza - SPAZIO * (colonne - 1)) / colonne
    const perAltezza = ((altezza - SPAZIO * (righe - 1)) / righe) * RAPPORTO
    const lato = Math.floor(Math.min(perLarghezza, perAltezza))
    if (lato > migliore.lato) migliore = { colonne, lato }
  }
  return migliore
}

export function iniziali(nome: string): string {
  const parole = nome.trim().split(/\s+/)
  return (parole.length > 1 ? parole[0][0] + parole[1][0] : nome.slice(0, 2)).toUpperCase()
}

/**
 * L'immagine di un personaggio. Una foto che non arriva — la rete, il servizio
 * delle immagini — si riprova una volta; poi restano le iniziali, e la
 * partita si gioca lo stesso con i nomi.
 */
export function Faccia({
  url,
  nome,
  attesa = false,
  sfondo = null,
}: {
  url: string | null
  nome: string
  attesa?: boolean
  sfondo?: string | null
}) {
  const [tentativo, setTentativo] = useState(0)
  const [rotta, setRotta] = useState(false)
  useEffect(() => {
    setTentativo(0)
    setRotta(false)
  }, [url])
  if (!url || rotta) {
    return (
      <span
        className={`ic-faccia ic-faccia--vuota${attesa && !url ? ' is-attesa' : ''}`}
        style={sfondo ? { background: sfondo } : undefined}
        aria-hidden="true"
      >
        {iniziali(nome)}
      </span>
    )
  }
  return (
    <img
      key={tentativo}
      className="ic-faccia"
      style={sfondo ? { background: sfondo } : undefined}
      src={url}
      alt=""
      draggable={false}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (tentativo === 0) setTimeout(() => setTentativo(1), 1500)
        else setRotta(true)
      }}
    />
  )
}

export function Tabellone({
  personaggi,
  url,
  sfondo,
  abbassate,
  scegli = false,
  scelta = null,
  rivelato = null,
  vinto = null,
  attesaFoto = false,
  onTocca,
}: {
  personaggi: Personaggi
  url: (k: number) => string | null
  sfondo?: (k: number) => string | null
  abbassate: ReadonlySet<number>
  /** Si sta provando a indovinare: toccare sceglie, non abbassa. */
  scegli?: boolean
  scelta?: number | null
  /** A partita finita, il personaggio dell'altro. */
  rivelato?: number | null
  vinto?: boolean | null
  /** Le foto stanno arrivando dall'altro telefono. */
  attesaFoto?: boolean
  onTocca: (k: number) => void
}) {
  const campo = useRef<HTMLDivElement>(null)
  const [misura, setMisura] = useState({ colonne: 4, lato: 0 })
  const quante = personaggi.voci.length

  useLayoutEffect(() => {
    const el = campo.current
    if (!el) return
    const aggiorna = () => {
      const r = el.getBoundingClientRect()
      setMisura(disposizione(quante, r.width, r.height))
    }
    aggiorna()
    const osservatore = new ResizeObserver(aggiorna)
    osservatore.observe(el)
    return () => osservatore.disconnect()
  }, [quante])

  return (
    <div ref={campo} className="ic-campo">
      <div
        className={`ic-tabellone${scegli ? ' is-scegli' : ''}`}
        role="group"
        aria-label="I personaggi"
        style={{ '--colonne': misura.colonne, '--lato': `${misura.lato}px` } as CSSProperties}
      >
        {misura.lato > 0 &&
          personaggi.voci.map((voce, k) => {
            const giu = abbassate.has(k)
            const classi = [
              'ic-carta',
              giu ? 'is-abbassata' : '',
              scelta === k ? 'is-scelta' : '',
              rivelato === k ? (vinto ? 'is-rivelata is-vinta' : 'is-rivelata') : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={k}
                type="button"
                className={classi}
                onClick={() => onTocca(k)}
                disabled={scegli && giu}
                aria-pressed={scegli ? scelta === k : giu}
                aria-label={`${voce.nome}${giu ? ', abbassata' : ''}`}
                style={{ '--i': k } as CSSProperties}
              >
                <span className="ic-carta__dentro">
                  <span className="ic-carta__fronte">
                    <Faccia url={url(k)} sfondo={sfondo?.(k)} nome={voce.nome} attesa={attesaFoto} />
                    <span className="ic-carta__nome">
                      <span>{voce.nome}</span>
                    </span>
                  </span>
                  <span className="ic-carta__retro" aria-hidden="true" />
                </span>
              </button>
            )
          })}
      </div>
    </div>
  )
}
