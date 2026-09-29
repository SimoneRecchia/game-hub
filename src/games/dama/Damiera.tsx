import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { suona } from '@/lib/suoni'
import { casellaDi, leggi, mosseLegali, notazione, rigaColonna, type Mossa } from '@shared/dama'
import type { PropsTavoliere } from '@/games/tavolo/tipi'
import './Damiera.css'

/** Le caselle di una mossa dalla sua notazione: "22-18" o "22x13x6". */
function percorsoDi(testo: string | null): number[] {
  if (!testo) return []
  return testo
    .split(/[-x]/)
    .map(Number)
    .filter((k) => Number.isInteger(k) && k >= 1 && k <= 32)
}

/**
 * La damiera, con le regole italiane: si gioca sulle caselle scure, con la
 * scura in basso a destra per chi guarda, e chi ha il Nero la vede girata.
 *
 * Si tocca una pedina, poi dove va. Una presa multipla si fa una casella alla
 * volta, e appena resta un solo modo di finirla il gioco la completa da solo.
 * Quando prendere e' obbligatorio, le pedine che devono farlo si accendono:
 * e' la regola che chi comincia dimentica, e il gioco non accetterebbe altro.
 */
export function Damiera({ posizione, mia, attivo, ultima, n, onMossa }: PropsTavoliere) {
  const p = useMemo(() => leggi(posizione), [posizione])
  const legali = useMemo(() => (p && attivo ? mosseLegali(p) : []), [p, attivo])
  const [percorso, setPercorso] = useState<number[]>([])
  const girata = mia === 1

  useEffect(() => setPercorso([]), [posizione])

  const primoN = useRef(n)
  if (n < primoN.current) primoN.current = n
  const arriva = n > primoN.current
  const ultimo = useMemo(() => percorsoDi(ultima), [ultima])

  const pezziPrima = useRef<number | null>(null)
  useEffect(() => {
    if (!p) return
    const pezzi = p.caselle.filter(Boolean).length
    if (arriva && pezziPrima.current !== null) {
      const prese = pezziPrima.current - pezzi
      suona('posa', { volume: prese > 0 ? 1 : 0.75 })
      for (let i = 0; i < Math.min(prese, 4); i += 1) suona('tocco', { volume: 0.45, ritardo: 0.08 + i * 0.07 })
    }
    pezziPrima.current = pezzi
  }, [p, arriva, n])

  if (!p) return null

  const mio = mia === 0 ? 'bianco' : 'nero'
  const obbligate = legali.length > 0 && legali[0].prese.length > 0
  const conPrefisso = (prefisso: readonly number[]) =>
    legali.filter((m) => prefisso.every((k, i) => m.percorso[i] === k))
  const candidate = percorso.length > 0 ? conPrefisso(percorso) : []
  const prossime = new Set(candidate.map((m) => m.percorso[percorso.length]).filter((k) => k !== undefined))
  const partenze = new Set(legali.map((m) => m.percorso[0]))

  const gioca = (m: Mossa) => {
    setPercorso([])
    onMossa(notazione(m))
  }

  const tocca = (k: number) => {
    if (!attivo) return
    if (percorso.length > 0 && prossime.has(k)) {
      const piu = [...percorso, k]
      const restano = conPrefisso(piu)
      // Un modo solo di finire: la mossa si completa da sé, anche se la presa continua.
      if (restano.length === 1) gioca(restano[0])
      else setPercorso(piu)
      suona('tocco', { volume: 0.5 })
      return
    }
    if (partenze.has(k)) {
      setPercorso(percorso[0] === k && percorso.length === 1 ? [] : [k])
      suona('tocco', { volume: 0.5 })
      return
    }
    setPercorso([])
  }

  // Il pezzo arrivato scivola dalla partenza della mossa, diretto: le tappe della presa le segna la damiera.
  const partenza = arriva && ultimo.length >= 2 ? ultimo[0] : null
  const arrivo = arriva && ultimo.length >= 2 ? ultimo[ultimo.length - 1] : null

  const caselle = []
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const riga = girata ? 7 - r : r
      const colonna = girata ? 7 - c : c
      const k = casellaDi(riga, colonna)
      if (k === null) {
        caselle.push(<span key={`c${r}${c}`} className="dam__casella is-chiara" aria-hidden="true" />)
        continue
      }
      const pezzo = p.caselle[k - 1]
      const nome = pezzo
        ? `${k}, ${pezzo.dama ? 'dama' : 'pedina'} ${pezzo.colore === 'bianco' ? 'bianca' : 'nera'}`
        : String(k)
      const classi = [
        'dam__casella',
        'is-scura',
        ultimo.includes(k) ? (k === ultimo[0] || k === ultimo[ultimo.length - 1] ? 'is-ultima' : 'is-tappa') : '',
        percorso.includes(k) ? 'is-scelta' : '',
        prossime.has(k) ? 'is-meta' : '',
        attivo && obbligate && percorso.length === 0 && partenze.has(k) ? 'is-deve' : '',
      ]
        .filter(Boolean)
        .join(' ')
      let stile: CSSProperties | undefined
      if (k === arrivo && partenza !== null) {
        const da = rigaColonna(partenza)
        const verso = girata ? -1 : 1
        stile = { '--dx': (da.colonna - colonna) * verso, '--dy': (da.riga - riga) * verso } as CSSProperties
      }
      caselle.push(
        <button
          key={k}
          type="button"
          className={classi}
          onClick={() => tocca(k)}
          aria-label={nome}
          aria-pressed={percorso[0] === k}
          tabIndex={attivo ? 0 : -1}
        >
          <span className="dam__numero">{k}</span>
          {pezzo && (
            <span
              key={stile ? `${k}-${n}` : k}
              className={`dam__pezzo is-${pezzo.colore}${pezzo.dama ? ' is-dama' : ''}${
                pezzo.colore === mio ? ' is-mio' : ''
              }${stile ? ' is-scivola' : ''}`}
              style={stile}
            >
              {pezzo.dama && (
                <svg className="dam__corona" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z" />
                </svg>
              )}
            </span>
          )}
        </button>,
      )
    }
  }

  return (
    <div className={`dam${attivo ? ' is-attiva' : ''}`} role="grid" aria-label="La damiera">
      {caselle}
    </div>
  )
}
