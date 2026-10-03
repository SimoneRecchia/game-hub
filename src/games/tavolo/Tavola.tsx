import type { CSSProperties, ReactNode } from 'react'
import { Button } from '@/components/Button'
import { Pillola } from '@/components/Scheda'
import { altraParte, type Parte } from '@shared/tavolo'
import { SEGNI } from './nomi'
import { TempoMossa } from './TempoMossa'
import type { GiocoDelTavoliere, PropsTavoliere } from './tipi'
import './Tavola.css'

export interface GiocatoreTavola {
  nome: string
  avatar: ReactNode
  /** Accanto al nome, piccolo: "non è online", "pensa…". */
  nota?: string
}

interface Props {
  descrizione: GiocoDelTavoliere
  posizione: string
  mosse: readonly string[]
  mia: Parte
  attivo: boolean
  finita: boolean
  io: GiocatoreTavola
  altro: GiocatoreTavola
  /** Di chi e' il turno, per accendere il suo nome; null a partita finita. */
  turno: 'io' | 'altro' | null
  onMossa: (mossa: string) => void
  /** Nel go, a gioco fermo: le pietre morte e il territorio sul goban. */
  conteggio?: PropsTavoliere['conteggio']
  /** Nei giochi con il tempo per mossa: fino a quando ha tempo chi deve muovere, nella sua riga. */
  tempo?: TempoTavola | null
  /** Sotto il tavoliere: il turno, le proposte, la fine. */
  piede: ReactNode
}

export interface TempoTavola {
  /** L'istante, sull'orologio del telefono, in cui il tempo finisce. */
  scadenza: number
  totaleMs: number
  di: 'io' | 'altro'
  /** Il mio tempo e' finito. */
  onScaduto?: () => void
}

/**
 * Una partita su un tavoliere, con un amico o contro il computer: l'altro
 * sopra, io sotto, come a un tavolo vero, attaccati al tavoliere, che prende
 * tutto lo spazio che resta. Il piede dice che cosa succede; i messaggi non
 * stanno mai sopra il tavoliere.
 */
export function Tavola(props: Props) {
  const { descrizione, posizione, mosse, mia, attivo, finita, io, altro, turno, onMossa, conteggio, tempo, piede } =
    props
  const { Tavoliere } = descrizione
  return (
    <div className={`tav tav--${descrizione.gioco}`}>
      <div className="tav__campo">
        <div className="tav__gruppo">
          <Giocatore
            g={altro}
            parte={altraParte(mia)}
            descrizione={descrizione}
            turno={turno === 'altro'}
            tempo={tempo?.di === 'altro' ? tempo : null}
            classe="tav-g--altro"
          />
          <Tavoliere
            posizione={posizione}
            mia={mia}
            attivo={attivo}
            ultima={mosse.length > 0 ? mosse[mosse.length - 1] : null}
            n={mosse.length}
            finita={finita}
            onMossa={onMossa}
            conteggio={conteggio}
          />
          <Giocatore
            g={io}
            parte={mia}
            descrizione={descrizione}
            turno={turno === 'io'}
            tempo={tempo?.di === 'io' ? tempo : null}
            classe="tav-g--io"
          />
        </div>
      </div>
      <div className="tav__piede">{piede}</div>
    </div>
  )
}

function Giocatore({
  g,
  parte,
  descrizione,
  turno,
  tempo,
  classe,
}: {
  g: GiocatoreTavola
  parte: Parte
  descrizione: GiocoDelTavoliere
  turno: boolean
  tempo: TempoTavola | null
  classe: string
}) {
  const segno = { '--segno': SEGNI[descrizione.gioco][parte] } as CSSProperties
  return (
    <div className={`tav-g ${classe}${turno ? ' is-turno' : ''}`}>
      <span className="tav-g__avatar">{g.avatar}</span>
      <span className="tav-g__testo">
        <span className="tav-g__nome">{g.nome}</span>
        <span className="tav-g__parte">
          <span className="tav-g__segno" style={segno} aria-hidden="true" />
          {descrizione.parti[parte].nome}
          {g.nota && <span className="tav-g__nota"> · {g.nota}</span>}
        </span>
      </span>
      {tempo && (
        <TempoMossa
          key={tempo.scadenza}
          scadenza={tempo.scadenza}
          totaleMs={tempo.totaleMs}
          mio={tempo.di === 'io'}
          onScaduto={tempo.onScaduto}
        />
      )}
    </div>
  )
}

/**
 * Il turno, in una capsula, con quel che c'e' da sapere accanto: "Scacco",
 * "Devi prendere". Nei giochi dove si passa, quando tocca a me, il bottone
 * per passare sta qui accanto.
 */
export function Turno({
  mio,
  testo,
  avviso,
  onPassa,
}: {
  mio: boolean
  testo: string
  avviso?: string | null
  onPassa?: () => void
}) {
  return (
    <div className="tav-turno">
      <Pillola tono={mio ? 'turno' : 'neutra'} vivo>
        {testo}
      </Pillola>
      {onPassa && (
        <Button variant="tinted" onClick={onPassa}>
          Passa
        </Button>
      )}
      {avviso && <span className="tav-turno__avviso">{avviso}</span>}
    </div>
  )
}

/** Le mosse in coppie numerate, come sul foglio di una partita: "1. e4 e5". */
export function ElencoMosse({ mosse }: { mosse: readonly string[] }) {
  if (mosse.length === 0) return <p className="tav-mosse__vuoto">Ancora nessuna mossa.</p>
  const coppie: [string, string | undefined][] = []
  for (let i = 0; i < mosse.length; i += 2) coppie.push([mosse[i], mosse[i + 1]])
  return (
    <ol className="tav-mosse">
      {coppie.map(([a, b], i) => (
        <li key={i} className="tav-mosse__riga">
          <span className="tav-mosse__n u-tabnum">{i + 1}.</span>
          <span className="tav-mosse__mossa">{a}</span>
          <span className="tav-mosse__mossa">{b ?? ''}</span>
        </li>
      ))}
    </ol>
  )
}

/** La fine della partita, nel piede: il risultato, come, e che cosa fare adesso. */
export function Fine({
  titolo,
  riga,
  note,
  children,
}: {
  titolo: string
  riga: ReactNode
  note?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="tav-fine">
      <p className="tav-fine__titolo">{titolo}</p>
      {riga && <p className="tav-fine__riga">{riga}</p>}
      {note}
      <div className="tav-fine__azioni">{children}</div>
    </div>
  )
}
