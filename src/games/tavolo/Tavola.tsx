import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/Button'
import { IconaGioco } from '@/components/IconaGioco'
import { IconChevronRight, IconFlag } from '@/components/Icons'
import { Pillola } from '@/components/Scheda'
import { altraParte, type GiocoTavoliere, type Parte } from '@shared/tavolo'
import { SEGNI } from './nomi'
import { TempoMossa } from './TempoMossa'
import type { GiocoDelTavoliere, PropsTavoliere } from './tipi'
import './Tavola.css'

export interface GiocatoreTavola {
  nome: string
  avatar: ReactNode
  /** Sotto il nome, piccolo: "Livello normale", "non è online". */
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
  /** Di chi e' il turno, per accendere la sua riga; null a partita finita o a gioco fermo. */
  turno: 'io' | 'altro' | null
  /** A partita finita, chi ha vinto: la sua riga lo dice. */
  vincitore?: 'io' | 'altro' | 'patta' | null
  onMossa: (mossa: string) => void
  /** Nel go, a gioco fermo: le pietre morte e il territorio sul goban. */
  conteggio?: PropsTavoliere['conteggio']
  /** Nei giochi con il tempo per mossa: fino a quando ha tempo chi deve muovere, nella sua riga. */
  tempo?: TempoTavola | null
  /** Sotto il tavoliere: le mosse e la resa, il passo, le proposte, la fine. */
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
 * tutto lo spazio che resta. Le righe dei giocatori sono carte: quella di chi
 * deve muovere si alza con l'anello giallo, e la pillola dice che cosa succede
 * ("Tocca a te", "Pensa", "Scacco!"). Il piede ha le mosse, il passo e le
 * domande; i messaggi non stanno mai sopra il tavoliere.
 */
export function Tavola(props: Props) {
  const {
    descrizione,
    posizione,
    mosse,
    mia,
    attivo,
    finita,
    io,
    altro,
    turno,
    vincitore = null,
    onMossa,
    conteggio,
    tempo,
    piede,
  } = props
  const { Tavoliere } = descrizione
  // Quel che c'e' da sapere su chi ha il tratto, nella sua pillola: "Scacco!", "Devi prendere".
  const avviso =
    turno && !descrizione.avvisoNelPiede ? descrizione.avviso(posizione, turno === 'io') : null
  const riga = (chi: 'io' | 'altro') => ({
    descrizione,
    posizione,
    turno: turno === chi,
    avviso: turno === chi ? avviso : null,
    esito: vincitore === 'patta' ? ('patta' as const) : vincitore === chi ? ('vince' as const) : null,
    tempo: tempo?.di === chi ? tempo : null,
  })
  return (
    <div className={`tav tav--${descrizione.gioco}`}>
      <div className="tav__campo">
        <div className="tav__gruppo">
          <Giocatore g={altro} parte={altraParte(mia)} mio={false} classe="tav-g--altro" {...riga('altro')} />
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
          <Giocatore g={io} parte={mia} mio classe="tav-g--io" {...riga('io')} />
        </div>
      </div>
      <div className="tav__piede">{piede}</div>
    </div>
  )
}

function Giocatore({
  g,
  parte,
  mio,
  descrizione,
  posizione,
  turno,
  avviso,
  esito,
  tempo,
  classe,
}: {
  g: GiocatoreTavola
  parte: Parte
  mio: boolean
  descrizione: GiocoDelTavoliere
  posizione: string
  turno: boolean
  avviso: string | null
  esito: 'vince' | 'patta' | null
  tempo: TempoTavola | null
  classe: string
}) {
  const nomeParte = descrizione.parti[parte].nome
  const dettaglio = descrizione.dettaglio?.(posizione, parte) ?? null
  const segno = descrizione.Segno ? (
    <descrizione.Segno parte={parte} />
  ) : (
    <span
      className="tav-g__segno"
      style={{ '--segno': SEGNI[descrizione.gioco][parte] } as CSSProperties}
      aria-hidden="true"
    />
  )
  const pillola = esito ? (
    <Pillola tono={esito === 'vince' ? 'buona' : 'neutra'}>{esito === 'vince' ? 'Vince' : 'Patta'}</Pillola>
  ) : turno ? (
    avviso ? (
      <Pillola tono="cattiva" vivo>
        {avviso}
      </Pillola>
    ) : mio ? (
      <Pillola tono="turno" vivo>
        Tocca a te
      </Pillola>
    ) : (
      <span className="tav-g__pensa">
        <Pillola tono="neutra">
          Pensa
          <span className="tav-g__puntini" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </Pillola>
      </span>
    )
  ) : null
  return (
    <div className={`tav-g ${classe}${turno ? ' is-turno' : ''}`}>
      <span className="tav-g__avatar">{g.avatar}</span>
      <span className="tav-g__testo">
        <span className="tav-g__nome">
          <span className="tav-g__chi">{g.nome}</span>
          {segno}
          <span className="u-visually-hidden">, {nomeParte}</span>
        </span>
        <span className="tav-g__dettaglio">
          {dettaglio ?? nomeParte}
          {g.nota && <span className="tav-g__nota">{'\u00a0·\u00a0'}{g.nota}</span>}
        </span>
      </span>
      {pillola}
      {tempo && (
        <TempoMossa
          key={tempo.scadenza}
          scadenza={tempo.scadenza}
          totaleMs={tempo.totaleMs}
          mio={tempo.di === 'io'}
          onScaduto={tempo.onScaduto}
          forma="anello"
        />
      )}
    </div>
  )
}

/**
 * Sotto la scacchiera e la damiera, come al tavolo il foglio della partita:
 * le ultime mosse in una carta, che apre l'elenco intero, e la resa accanto.
 */
export function SottoTavola({
  storia,
  onMosse,
  resa,
}: {
  /** Le mosse come si leggono, dalla prima. */
  storia: readonly string[]
  onMosse: () => void
  resa?: { etichetta: string; onClick: () => void } | null
}) {
  // Le ultime tre, con il loro numero: "12.", "12…" per quella del Nero.
  const ultime = storia.slice(-3).map((testo, j, tutte) => {
    const i = storia.length - tutte.length + j
    return { testo, n: `${Math.floor(i / 2) + 1}${i % 2 === 0 ? '.' : '…'}`, ultima: i === storia.length - 1, i }
  })
  return (
    <div className="tav-sotto">
      <button type="button" className="tav-sotto__mosse" onClick={onMosse} aria-label="Tutte le mosse">
        <span className="tav-sotto__titolo">Mosse</span>
        <span className="tav-sotto__elenco">
          {ultime.length === 0 ? (
            <span className="tav-sotto__vuoto">Ancora nessuna</span>
          ) : (
            ultime.map((m) => (
              <span key={m.i} className={`tav-sotto__mossa${m.ultima ? ' is-ultima' : ''}`}>
                <span className="tav-sotto__n u-tabnum">{m.n}</span>
                {m.testo}
              </span>
            ))
          )}
        </span>
        <IconChevronRight size={16} />
      </button>
      {resa && (
        <button type="button" className="tav-sotto__resa" onClick={resa.onClick}>
          <IconFlag size={17} />
          {resa.etichetta}
        </button>
      )}
    </div>
  )
}

/**
 * Il piede del go mentre si gioca: quel che e' appena successo — l'altro ha
 * passato, hai passato — e il passo, sempre al suo posto: spento quando non
 * tocca a me, perché il piede non salti a ogni turno.
 */
export function PiedePasso({
  avviso,
  onPassa,
  puoi,
}: {
  avviso: string | null
  onPassa: () => void
  puoi: boolean
}) {
  return (
    <div className="tav-passo">
      <p className="tav-passo__avviso" aria-live="polite">
        {avviso ?? (puoi ? 'Tocca un incrocio, o passa' : '')}
      </p>
      <Button variant="tinted" onClick={onPassa} disabled={!puoi}>
        Passo
      </Button>
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

/** Un numero della carta del risultato: "Tu 2", "Computer 3", "Patte 0". */
export interface VoceConto {
  etichetta: string
  valore: number | string
}

/**
 * La fine della partita: una carta sopra il tavoliere, con l'adesivo del
 * gioco, com'e' finita, il conto e che cosa fare adesso. Se la fine si e'
 * vista arrivare aspetta `ritardo`, il tempo dell'adesivo. Toccando fuori, o
 * "Guarda il tavoliere", la carta si fa da parte e resta una riga nel piede:
 * la posizione finale — il matto, la fila — si deve poter guardare.
 */
export function Fine({
  gioco,
  esito,
  titolo,
  riga,
  conto,
  note,
  ritardo = 0,
  children,
}: {
  gioco: GiocoTavoliere
  esito: 'vinta' | 'persa' | 'patta'
  titolo: string
  riga: ReactNode
  conto?: readonly VoceConto[]
  note?: ReactNode
  /** Quanto aspetta la carta: l'adesivo della fine, se la fine si e' vista arrivare. */
  ritardo?: number
  children: ReactNode
}) {
  const [stato, setStato] = useState<'attesa' | 'aperta' | 'chiusa'>(ritardo > 0 ? 'attesa' : 'aperta')
  const carta = useRef<HTMLElement>(null)
  useEffect(() => {
    if (stato !== 'attesa') return
    const t = window.setTimeout(() => setStato('aperta'), ritardo)
    return () => window.clearTimeout(t)
  }, [ritardo, stato])
  // La carta prende il fuoco quando arriva: chi usa la tastiera la trova.
  useEffect(() => {
    if (stato === 'aperta') carta.current?.focus({ preventScroll: true })
  }, [stato])

  if (stato === 'attesa') return null
  if (stato === 'chiusa') {
    return (
      <div className="tav-fine-riga">
        <button type="button" className="tav-fine-riga__esito" onClick={() => setStato('aperta')}>
          <span className="tav-fine-riga__titolo">{titolo}</span>
          {riga && <span className="tav-fine-riga__riga">{riga}</span>}
        </button>
        <div className="tav-fine-riga__azioni">{children}</div>
      </div>
    )
  }
  // Sopra la pagina, come i fogli: la barra in cima resta sotto il velo.
  return createPortal(
    <div className={`tav-fine is-${esito}`}>
      <button
        type="button"
        className="tav-fine__velo"
        aria-label="Guarda il tavoliere"
        tabIndex={-1}
        onClick={() => setStato('chiusa')}
      />
      <section
        ref={carta}
        className="tav-fine__carta"
        aria-label="Fine della partita"
        tabIndex={-1}
        style={{ '--tinta': `var(--${gioco}-tinta)` } as CSSProperties}
      >
        <span className="tav-fine__icona" aria-hidden="true">
          <IconaGioco gioco={gioco} lato={72} />
        </span>
        <h2 className="tav-fine__titolo">{titolo}</h2>
        {riga && <p className="tav-fine__riga">{riga}</p>}
        {conto && conto.length > 0 && (
          <ul className="tav-fine__conto" aria-label="Il conto">
            {conto.map((v) => (
              <li key={v.etichetta}>
                {v.etichetta} <b className="u-tabnum">{v.valore}</b>
              </li>
            ))}
          </ul>
        )}
        {note}
        <div className="tav-fine__azioni">{children}</div>
        <button type="button" className="tav-fine__guarda" onClick={() => setStato('chiusa')}>
          Guarda il tavoliere
        </button>
      </section>
    </div>,
    document.body,
  )
}
