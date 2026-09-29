import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Sheet } from '@/components/Sheet'
import { suona } from '@/lib/suoni'
import {
  casellaDa,
  daFen,
  mosseLegali,
  nomeCasella,
  sottoScacco,
  uci,
  type Mossa,
  type Pezzo,
  type Promozione,
} from '@shared/scacchi'
import type { PropsTavoliere } from '@/games/tavolo/tipi'
import { NOMI_PEZZI, immaginePezzo } from './pezzi'
import './Scacchiera.css'

const PROMOZIONI: readonly Promozione[] = ['q', 'r', 'b', 'n']
const NOMI_COLORI = { w: 'bianco', b: 'nero' } as const

/** Da quale casella a quale e' andata l'ultima mossa, dal suo UCI: "e2e4". */
function daA(ultima: string | null): { da: number; a: number } | null {
  if (!ultima) return null
  const da = casellaDa(ultima.slice(0, 2))
  const a = casellaDa(ultima.slice(2, 4))
  return da === null || a === null ? null : { da, a }
}

/**
 * La scacchiera. Si tocca un proprio pezzo, e le caselle dove puo' andare si
 * accendono — un punto se sono vuote, un anello se c'e' da prendere — poi si
 * tocca la casella. Il pedone che arriva in fondo chiede in che pezzo
 * trasformarsi. Chi gioca col Nero la vede girata, con i suoi pezzi in basso.
 *
 * Il pezzo appena mosso arriva scivolando dalla sua casella di partenza, e
 * nell'arrocco anche la torre: si vede che cosa ha fatto l'altro, non solo
 * dov'e' finito.
 */
export function Scacchiera({ posizione, mia, attivo, ultima, n, finita, onMossa }: PropsTavoliere) {
  const p = useMemo(() => daFen(posizione), [posizione])
  const legali = useMemo(() => (p && attivo ? mosseLegali(p) : []), [p, attivo])
  const [scelta, setScelta] = useState<number | null>(null)
  const [promozione, setPromozione] = useState<Mossa[] | null>(null)
  const girata = mia === 1

  // Una posizione nuova (la mia mossa, quella dell'altro) chiude la scelta a meta'.
  useEffect(() => {
    setScelta(null)
    setPromozione(null)
  }, [posizione])

  // Il pezzo scivola solo per una mossa vista arrivare, non riaprendo la partita.
  const primoN = useRef(n)
  if (n < primoN.current) primoN.current = n
  const arriva = n > primoN.current
  const mossa = daA(ultima)

  // Il suono della mossa: piu' pieno se si e' preso qualcosa.
  const pezziPrima = useRef<number | null>(null)
  useEffect(() => {
    if (!p) return
    const pezzi = p.caselle.filter(Boolean).length
    if (arriva && pezziPrima.current !== null) {
      const presa = pezzi < pezziPrima.current
      suona('posa', { volume: presa ? 1 : 0.75 })
      if (presa) suona('tocco', { volume: 0.5, ritardo: 0.06 })
    }
    pezziPrima.current = pezzi
  }, [p, arriva, n])

  if (!p) return null

  const scacco = sottoScacco(p)
  const reInScacco = scacco
    ? p.caselle.findIndex((x) => x !== null && x.tipo === 'k' && x.colore === p.tratto)
    : -1
  const mieDa = scelta === null ? [] : legali.filter((m) => m.da === scelta)
  const destinazioni = new Map<number, Mossa[]>()
  for (const m of mieDa) destinazioni.set(m.a, [...(destinazioni.get(m.a) ?? []), m])
  const mio = mia === 0 ? 'w' : 'b'

  // Nell'arrocco scivola anche la torre: dall'angolo alla casella accanto al re.
  const scivola = new Map<number, number>()
  if (arriva && mossa) {
    scivola.set(mossa.a, mossa.da)
    const pezzo = p.caselle[mossa.a]
    if (pezzo?.tipo === 'k' && Math.abs((mossa.a & 7) - (mossa.da & 7)) === 2) {
      const corto = (mossa.a & 7) > (mossa.da & 7)
      const traversa = mossa.a & ~7
      scivola.set(traversa + (corto ? 5 : 3), traversa + (corto ? 7 : 0))
    }
  }

  const tocca = (k: number) => {
    if (!attivo) return
    const giocabili = destinazioni.get(k)
    if (giocabili) {
      if (giocabili.length > 1) setPromozione(giocabili)
      else {
        setScelta(null)
        onMossa(uci(giocabili[0]))
      }
      return
    }
    const pezzo = p.caselle[k]
    if (pezzo && pezzo.colore === mio && legali.some((m) => m.da === k)) {
      setScelta(scelta === k ? null : k)
      suona('tocco', { volume: 0.5 })
    } else setScelta(null)
  }

  const caselle = []
  for (let riga = 0; riga < 8; riga += 1) {
    for (let colonna = 0; colonna < 8; colonna += 1) {
      const traversa = girata ? riga : 7 - riga
      const col = girata ? 7 - colonna : colonna
      const k = traversa * 8 + col
      const pezzo = p.caselle[k]
      const scura = (traversa + col) % 2 === 0
      const bersaglio = destinazioni.has(k)
      const classi = [
        'scc__casella',
        scura ? 'is-scura' : 'is-chiara',
        mossa && (k === mossa.da || k === mossa.a) ? 'is-ultima' : '',
        k === scelta ? 'is-scelta' : '',
        bersaglio ? (pezzo ? 'is-presa' : 'is-meta') : '',
        k === reInScacco ? (finita ? 'is-matto' : 'is-scacco') : '',
      ]
        .filter(Boolean)
        .join(' ')
      const da = scivola.get(k)
      const stilePezzo =
        da !== undefined
          ? ({
              '--dx': ((da & 7) - col) * (girata ? -1 : 1),
              '--dy': ((da >> 3) - traversa) * (girata ? 1 : -1),
            } as CSSProperties)
          : undefined
      caselle.push(
        <button
          key={k}
          type="button"
          className={classi}
          onClick={() => tocca(k)}
          aria-label={`${nomeCasella(k)}${pezzo ? `, ${nomePezzo(pezzo)}` : ''}`}
          aria-pressed={k === scelta}
          tabIndex={attivo ? 0 : -1}
        >
          {colonna === 0 && <span className="scc__traversa">{traversa + 1}</span>}
          {riga === 7 && <span className="scc__colonna">{'abcdefgh'[col]}</span>}
          {pezzo && (
            <img
              // La chiave cambia con la mossa: il pezzo arrivato rinasce, e l'animazione riparte.
              key={da !== undefined ? `${k}-${n}` : k}
              className={`scc__pezzo${da !== undefined ? ' is-scivola' : ''}`}
              style={stilePezzo}
              src={immaginePezzo(pezzo.colore, pezzo.tipo)}
              alt=""
              draggable={false}
            />
          )}
        </button>,
      )
    }
  }

  return (
    <>
      <div className={`scc${attivo ? ' is-attiva' : ''}`} role="grid" aria-label="La scacchiera">
        {caselle}
      </div>
      <Sheet open={promozione !== null} onClose={() => setPromozione(null)} title="Promozione">
        <div className="scc-promo">
          {PROMOZIONI.map((tipo) => {
            const m = promozione?.find((x) => x.promozione === tipo)
            if (!m) return null
            return (
              <button
                key={tipo}
                type="button"
                className="scc-promo__pezzo"
                onClick={() => {
                  setPromozione(null)
                  setScelta(null)
                  onMossa(uci(m))
                }}
              >
                <img src={immaginePezzo(mio, tipo)} alt="" draggable={false} />
                <span>{NOMI_PEZZI[tipo].charAt(0).toUpperCase() + NOMI_PEZZI[tipo].slice(1)}</span>
              </button>
            )
          })}
        </div>
      </Sheet>
    </>
  )
}

function nomePezzo(pezzo: Pezzo): string {
  return `${NOMI_PEZZI[pezzo.tipo]} ${NOMI_COLORI[pezzo.colore]}`
}
