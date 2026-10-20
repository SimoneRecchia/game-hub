import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Adesivo, useAdesivo } from '@/components/Adesivo'
import { IconaGioco } from '@/components/IconaGioco'
import { IconBook, IconCheck, IconClose } from '@/components/Icons'
import { formatDuration } from '@/lib/format'
import { suona } from '@/lib/suoni'
import { COSTO_AIUTO_ANAGRAMMI, puntiParola } from '@shared/anagrammi'
import type { ParolaAnagrammi } from '@shared/types'
import { Lettere, type EsitoProva } from './Lettere'
import './Anagrammi.css'

/** Quel che serve alla schermata, dalla giornata del server o dalla libera nel telefono. */
export interface VistaAnagrammi {
  parole: ParolaAnagrammi[]
  corrente: number | null
  /** Quando finisce il tempo della parola aperta, sull'orologio del telefono. */
  scadenza: number | null
  /** Il tempo e' finito: si aspetta che la parola si chiuda. */
  scaduta: boolean
  tempoParolaMs: number
  occupato: boolean
  finita: boolean
}

export interface ComandiAnagrammi {
  apri: () => void
  prova: (parola: string) => Promise<EsitoProva | null>
  aiuto: () => void
  passo: () => void
  scade: () => void
}

const ORDINALI = ['La prima', 'La seconda', 'La terza', 'La quarta', 'La quinta']

/** Quanto resta l'adesivo di una parola trovata, o del tempo finito. */
const ADESIVO_MS = 1_700

/** I secondi che restano, e quanto vale adesso la parola: si aggiornano quattro volte al secondo. */
function useRestante(scadenza: number | null): number | null {
  const [adesso, setAdesso] = useState(() => Date.now())
  useEffect(() => {
    if (scadenza === null) return
    setAdesso(Date.now())
    const t = window.setInterval(() => setAdesso(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [scadenza])
  return scadenza === null ? null : Math.max(0, scadenza - adesso)
}

/**
 * La giornata degli Anagrammi, o una libera: in cima le cinque tappe, e sotto
 * quel che tocca adesso. Fra una parola e l'altra ci sono due carte: com'e'
 * andata quella chiusa, e la prossima, coperta, con il bottone che la apre.
 * Il tempo di una parola parte quando la si apre, quindi fra una parola e
 * l'altra ci si ferma quanto si vuole.
 */
export function PartitaAnagrammi({
  vista,
  comandi,
  fine,
}: {
  vista: VistaAnagrammi
  comandi: ComandiAnagrammi
  /** Quel che si vede a giornata finita: la carta della fine, con i punti e i bottoni. */
  fine: ReactNode
}) {
  const { parole, corrente } = vista
  const restante = useRestante(corrente !== null ? vista.scadenza : null)
  const scadutaRef = useRef(false)
  const { adesivo, mostra } = useAdesivo()

  // Allo scadere lo si dice una volta sola: il resto lo fa chi tiene il tempo.
  useEffect(() => {
    scadutaRef.current = false
  }, [corrente])
  useEffect(() => {
    if (restante === null || restante > 0 || scadutaRef.current || vista.scaduta) return
    scadutaRef.current = true
    suona('scaduto')
    comandi.scade()
  }, [comandi, restante, vista.scaduta])

  // Gli ultimi cinque secondi si sentono.
  const ultimo = useRef<number | null>(null)
  useEffect(() => {
    if (restante === null) return
    const s = Math.ceil(restante / 1000)
    if (s <= 5 && s > 0 && ultimo.current !== s) suona('tic')
    ultimo.current = s
  }, [restante])

  const aperta = corrente !== null ? parole[corrente] : null
  const chiuse = parole.filter((p) => p.esito !== null).length

  /*
   * Quante parole chiuse si sono gia' viste chiudere: la carta dell'esito resta
   * finche' non si tocca "Prossima parola". Riaprendo la pagina fra una parola
   * e l'altra si ritrova l'ultima; a giornata finita, la fine.
   */
  const [viste, setViste] = useState(() => (vista.finita ? chiuse : Math.max(0, chiuse - 1)))

  // Una parola che si chiude adesso, davanti a chi gioca: l'adesivo del momento.
  const prima = useRef(chiuse)
  useEffect(() => {
    const prec = prima.current
    prima.current = chiuse
    // Una partita nuova, nella libera: non c'e' niente di chiuso da guardare.
    if (chiuse < prec) setViste(0)
    if (chiuse <= prec) return
    const p = parole[chiuse - 1]
    if (p?.esito === 'trovata') {
      mostra({
        tono: 'vivace',
        titolo: 'Trovata!',
        sotto: `+${p.punti} punti`,
        colore: 'linear-gradient(180deg, #ffc08f, var(--anagrammi-tinta))',
        classe: 'ana-adesivo',
        durata: ADESIVO_MS,
      })
    } else if (p?.esito === 'persa') {
      mostra({
        tono: 'bordato',
        titolo: 'Tempo!',
        sotto: 'La parola è persa',
        colore: 'var(--roulette-tinta)',
        classe: 'ana-adesivo',
        durata: ADESIVO_MS,
      })
    }
  }, [chiuse, mostra, parole])

  let scena: ReactNode
  if (aperta && aperta.lettere) {
    scena = (
      <ParolaAperta
        key={corrente}
        parola={aperta}
        indice={corrente!}
        restante={vista.scaduta ? 0 : restante}
        tempoParolaMs={vista.tempoParolaMs}
        attivo={!vista.occupato && !vista.scaduta && (restante ?? 1) > 0}
        comandi={comandi}
      />
    )
  } else if (viste < chiuse && parole[chiuse - 1]) {
    const ultima = chiuse === parole.length
    scena = (
      <Esito
        key={`esito-${chiuse}`}
        parola={parole[chiuse - 1]}
        indice={chiuse - 1}
        avanti={ultima ? 'Com’è andata' : 'Prossima parola'}
        onAvanti={() => setViste(chiuse)}
      />
    )
  } else if (vista.finita) {
    scena = <div className="ana-fine">{fine}</div>
  } else {
    scena = (
      <Pronta
        key={`pronta-${chiuse}`}
        numero={chiuse + 1}
        di={parole.length}
        lunghezza={parole[chiuse]?.lunghezza ?? 0}
        secondi={Math.round(vista.tempoParolaMs / 1000)}
        occupato={vista.occupato}
        onApri={comandi.apri}
      />
    )
  }

  return (
    <div className="ana">
      <Tappe parole={parole} attuale={vista.finita ? null : (corrente ?? (viste < chiuse ? null : chiuse))} />
      {scena}
      <Adesivo adesivo={adesivo} />
    </div>
  )
}

/** Le cinque tappe in cima: quante lettere ha ognuna, e com'e' andata. Quella di adesso saltella. */
function Tappe({ parole, attuale }: { parole: ParolaAnagrammi[]; attuale: number | null }) {
  return (
    <ol className="ana-tappe" aria-label="Le parole di oggi">
      {parole.map((p, i) => {
        const stato = p.esito === 'trovata' ? 'trovata' : p.esito ? 'persa' : i === attuale ? 'attuale' : 'dopo'
        return (
          <li
            key={i}
            className={`ana-tappa is-${stato}`}
            aria-current={i === attuale ? 'step' : undefined}
            aria-label={`Parola ${i + 1}, ${p.lunghezza} lettere${p.esito === 'trovata' ? ', trovata' : p.esito ? ', persa' : ''}`}
          >
            {stato === 'trovata' ? (
              <IconCheck size={20} />
            ) : stato === 'persa' ? (
              <IconClose size={20} />
            ) : (
              <span className="u-tabnum">{p.lunghezza}</span>
            )}
            {p.esito === 'trovata' && <small className="ana-tappa__punti u-tabnum">+{p.punti}</small>}
          </li>
        )
      })}
    </ol>
  )
}

/** La parola che viene, a tessere coperte che dondolano: quante lettere ha si vede, quali no. */
function Pronta({
  numero,
  di,
  lunghezza,
  secondi,
  occupato,
  onApri,
}: {
  numero: number
  di: number
  lunghezza: number
  secondi: number
  occupato: boolean
  onApri: () => void
}) {
  return (
    <section className="ana-carta ana-pronta" aria-label="La prossima parola">
      <span className="ana-pillola">
        Parola {numero} di {di}
      </span>
      <h2 className="ana-pronta__titolo">{lunghezza} lettere</h2>
      <div className="ana-dorsi" aria-hidden="true">
        {Array.from({ length: lunghezza }, (_, i) => (
          <span key={i} className="ana-dorso" style={{ animationDelay: `${(i * 0.17).toFixed(2)}s` }} />
        ))}
      </div>
      <p className="ana-carta__riga">{secondi} secondi, che partono quando la apri</p>
      <button type="button" className="ana-tasto ana-tasto--apri" onClick={onApri} disabled={occupato}>
        Apri la parola
      </button>
    </section>
  )
}

/** La parola aperta: il tempo, quanto vale, la definizione, le lettere e i comandi. */
function ParolaAperta({
  parola,
  indice,
  restante,
  tempoParolaMs,
  attivo,
  comandi,
}: {
  parola: ParolaAnagrammi
  indice: number
  restante: number | null
  tempoParolaMs: number
  attivo: boolean
  comandi: ComandiAnagrammi
}) {
  const passati = restante === null ? 0 : tempoParolaMs - restante
  const vale = puntiParola(parola.lunghezza, passati, parola.aiuto, tempoParolaMs)
  const quota = restante === null ? 1 : restante / tempoParolaMs
  const secondi = restante === null ? null : Math.ceil(restante / 1000)
  const urgente = secondi !== null && secondi <= 10
  // L'anello del tempo: un cerchio di raggio 26, che si svuota.
  const giro = 2 * Math.PI * 26
  return (
    <div className="ana-aperta">
      <div className="ana-quadro">
        <span
          className={`ana-anello${urgente ? ' is-urgente' : ''}`}
          role="timer"
          aria-label={secondi === null ? 'Tempo' : `${secondi} secondi`}
        >
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle className="ana-anello__traccia" cx="32" cy="32" r="26" />
            <circle
              className="ana-anello__corre"
              cx="32"
              cy="32"
              r="26"
              style={{ strokeDasharray: giro, strokeDashoffset: giro * (1 - quota) } as CSSProperties}
            />
          </svg>
          <span className="u-tabnum" aria-hidden="true">
            {secondi ?? '–'}
          </span>
        </span>
        <span className="ana-vale">
          <span className="ana-vale__sopra">Adesso vale</span>
          <b className="u-tabnum">{vale} punti</b>
        </span>
        <span className="ana-pillola">{parola.lunghezza} lettere</span>
      </div>

      {parola.aiuto && parola.definizione ? (
        <p className="ana-definizione">{parola.definizione}</p>
      ) : (
        <p className="ana-definizione is-chiusa">La definizione aiuta, e costa {COSTO_AIUTO_ANAGRAMMI} punti</p>
      )}

      <Lettere
        lettere={parola.lettere!}
        attivo={attivo}
        onProva={comandi.prova}
        altri={
          <>
            <button
              type="button"
              className="ana-comando"
              onClick={comandi.aiuto}
              disabled={!attivo || parola.aiuto}
              aria-label={`Definizione, costa ${COSTO_AIUTO_ANAGRAMMI} punti`}
            >
              <IconBook size={22} />
              Definizione
            </button>
            <button type="button" className="ana-comando" onClick={comandi.passo} disabled={!attivo}>
              <IconPasso />
              Passo
            </button>
          </>
        }
      />
      <span className="u-visually-hidden" aria-live="polite">
        {ORDINALI[indice] ?? 'La'} parola, {parola.lunghezza} lettere
      </span>
    </div>
  )
}

/** Il segno di "Passo": due frecce piene, come l'avanti veloce. */
function IconPasso() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M5 6l6.5 6L5 18z M13 6l6.5 6-6.5 6z"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Com'e' andata una parola chiusa: la parola, girata lettera per lettera nel
 * colore dell'esito, i punti, e la definizione del Wikizionario.
 */
function Esito({
  parola,
  indice,
  avanti,
  onAvanti,
}: {
  parola: ParolaAnagrammi
  indice: number
  avanti: string
  onAvanti: () => void
}) {
  const trovata = parola.esito === 'trovata'
  const etichetta = trovata
    ? `Trovata in ${formatDuration(parola.ms ?? 0)}`
    : parola.esito === 'persa'
      ? 'Tempo scaduto'
      : 'Passata'
  const testo = (parola.parola ?? '').toUpperCase()
  return (
    <section className={`ana-carta ana-esito is-${parola.esito}`} aria-label={`${ORDINALI[indice] ?? 'La'} parola`}>
      <span className="ana-pillola ana-pillola--esito">{etichetta}</span>
      <div className="ana-parola" role="img" aria-label={testo}>
        {[...testo].map((l, i) => (
          <span key={i} style={{ animationDelay: `${(i * 0.08).toFixed(2)}s` }} aria-hidden="true">
            {l}
          </span>
        ))}
      </div>
      <p className="ana-esito__punti u-tabnum">{trovata ? `+${parola.punti} punti` : 'Nessun punto'}</p>
      {parola.risposta && <p className="ana-carta__riga">Hai scritto {parola.risposta.toUpperCase()}, e vale</p>}
      {parola.definizione && (
        <p className="ana-citazione">
          «{parola.definizione}»<small>Wikizionario · CC BY-SA</small>
        </p>
      )}
      <button type="button" className="ana-tasto" onClick={onAvanti}>
        {avanti}
      </button>
    </section>
  )
}

/**
 * La carta della fine, per la giornata e per la libera: l'adesivo del gioco,
 * com'e' andata, le cinque parole con il loro tempo e i punti, e sotto il
 * bollino del totale e i bottoni di chi la usa.
 */
export function CartaFine({
  titolo,
  riga,
  parole,
  punti,
  sopra,
  children,
}: {
  titolo?: string
  riga?: string
  parole: ParolaAnagrammi[]
  /** Il bollino del totale: "+79" nella giornata, i punti nella libera. */
  punti?: string
  /** Prima delle parole: nella sfida, chi ha vinto. */
  sopra?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="ana-carta ana-carta-fine" aria-label="Fine partita">
      {titolo && (
        <>
          <span className="ana-carta-fine__icona">
            <IconaGioco gioco="anagrammi" lato={66} giro={-6} />
          </span>
          <h2 className="ana-carta-fine__titolo">{titolo}</h2>
        </>
      )}
      {riga && <p className="ana-carta-fine__riga">{riga}</p>}
      {sopra}
      <Riepilogo parole={parole} />
      {punti && <span className="ana-carta-fine__punti u-tabnum">{punti}</span>}
      {children}
    </section>
  )
}

/** Il titolo della carta della fine, da quante parole si sono trovate. */
export function titoloFine(parole: ParolaAnagrammi[]): string {
  const trovate = parole.filter((p) => p.esito === 'trovata').length
  if (trovate === parole.length) return 'Perfetto!'
  if (trovate >= 3) return 'Bel lavoro!'
  if (trovate > 0) return 'Fatta!'
  return 'Peccato!'
}

/** "Hai trovato 4 parole su 5". */
export function rigaFine(parole: ParolaAnagrammi[]): string {
  const trovate = parole.filter((p) => p.esito === 'trovata').length
  return `Hai trovato ${trovate} ${trovate === 1 ? 'parola' : 'parole'} su ${parole.length}`
}

/** Tutte le parole a giornata finita: com'erano, quanto ci si e' messo, e quanto hanno dato. */
export function Riepilogo({ parole }: { parole: ParolaAnagrammi[] }) {
  return (
    <ul className="ana-riepilogo">
      {parole.map((p, i) => {
        const trovata = p.esito === 'trovata'
        const come = trovata
          ? `${formatDuration(p.ms ?? 0)}${p.aiuto ? ' · def.' : ''}`
          : p.esito === 'passata'
            ? 'passata'
            : 'persa'
        return (
          <li
            key={i}
            className={`ana-riepilogo__riga is-${p.esito ?? 'persa'}`}
            style={{ animationDelay: `${(0.1 + i * 0.06).toFixed(2)}s` }}
          >
            <span className="ana-riepilogo__n u-tabnum" aria-hidden="true">
              {p.lunghezza}
            </span>
            <span className="ana-riepilogo__parola" title={p.definizione ?? undefined}>
              {(p.parola ?? p.lettere ?? '').toUpperCase()}
            </span>
            <span className="ana-riepilogo__come u-tabnum">{come}</span>
            <span className="ana-riepilogo__conto u-tabnum">{trovata ? `+${p.punti}` : '—'}</span>
            {p.risposta && <span className="ana-riepilogo__nota">hai scritto {p.risposta.toUpperCase()}</span>}
          </li>
        )
      })}
    </ul>
  )
}
