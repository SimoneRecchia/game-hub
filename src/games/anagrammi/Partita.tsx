import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@/components/Button'
import { IconBook, IconClock, IconPlay } from '@/components/Icons'
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
 * La giornata degli Anagrammi, o una libera: la fila delle cinque parole, e
 * sotto la parola aperta con il suo tempo, o il bottone che apre la prossima.
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
  /** Quel che si vede a giornata finita: i punti, la classifica, quando tocca la prossima. */
  fine: ReactNode
}) {
  const { parole, corrente } = vista
  const restante = useRestante(corrente !== null ? vista.scadenza : null)
  const scadutaRef = useRef(false)

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
  const ultima = chiuse > 0 ? parole[chiuse - 1] : null

  return (
    <div className="ana">
      <Fila parole={parole} corrente={corrente} />

      {vista.finita ? (
        <div className="ana-fine">{fine}</div>
      ) : aperta && aperta.lettere ? (
        <ParolaAperta
          parola={aperta}
          indice={corrente!}
          restante={vista.scaduta ? 0 : restante}
          tempoParolaMs={vista.tempoParolaMs}
          attivo={!vista.occupato && !vista.scaduta && (restante ?? 1) > 0}
          comandi={comandi}
        />
      ) : (
        <div className="ana-pausa">
          {ultima && <Esito parola={ultima} indice={chiuse - 1} />}
          <Coperte n={parole[chiuse]?.lunghezza ?? 0} />
          <p className="ana-pausa__titolo">
            Parola {chiuse + 1} di {parole.length}
          </p>
          <p className="ana-pausa__riga">
            {parole[chiuse]?.lunghezza} lettere · {Math.round(vista.tempoParolaMs / 1000)} secondi
          </p>
          <Button size="lg" onClick={comandi.apri} loading={vista.occupato}>
            <IconPlay size={17} /> {chiuse === 0 ? 'Comincia' : 'Prossima parola'}
          </Button>
        </div>
      )}
    </div>
  )
}

/** La parola che viene, a tessere coperte: quante lettere ha si vede, quali no. */
function Coperte({ n }: { n: number }) {
  return (
    <div className="ana-coperte" style={{ '--n': n } as CSSProperties} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="ana-coperta" style={{ '--i': i } as CSSProperties} />
      ))}
    </div>
  )
}

/** La fila delle cinque parole: quante lettere ha ognuna, e com'e' andata. */
function Fila({ parole, corrente }: { parole: ParolaAnagrammi[]; corrente: number | null }) {
  return (
    <ol className="ana-fila" aria-label="Le parole di oggi">
      {parole.map((p, i) => (
        <li
          key={i}
          className={`ana-fila__parola${p.esito ? ` is-${p.esito}` : ''}${i === corrente ? ' is-aperta' : ''}`}
          aria-label={`${p.lunghezza} lettere${p.esito === 'trovata' ? ', trovata' : p.esito ? ', persa' : ''}`}
        >
          <span className="u-tabnum">{p.lunghezza}</span>
          {p.esito === 'trovata' && <span className="ana-fila__punti u-tabnum">+{p.punti}</span>}
        </li>
      ))}
    </ol>
  )
}

/** La parola aperta: il tempo, le lettere, l'aiuto e "Passo". */
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
  const vale = puntiParola(parola.lunghezza, passati, parola.aiuto)
  const quota = restante === null ? 1 : restante / tempoParolaMs
  const secondi = restante === null ? null : Math.ceil(restante / 1000)
  return (
    <div className="ana-aperta">
      <div className="ana-aperta__centro">
        <div
          className={`ana-tempo${secondi !== null && secondi <= 10 ? ' is-urgente' : ''}`}
          style={{ '--quota': quota } as CSSProperties}
        >
          <span className="ana-tempo__barra" aria-hidden="true" />
          <span className="ana-tempo__testo u-tabnum">
            <IconClock size={14} /> {secondi ?? '–'}
          </span>
          <span className="ana-tempo__vale u-tabnum">Vale {vale}</span>
        </div>

        <Lettere lettere={parola.lettere!} attivo={attivo} onProva={comandi.prova} />
      </div>

      <div className="ana-aperta__piede">
        {parola.aiuto && parola.definizione ? (
          <p className="ana-definizione">
            <IconBook size={16} />
            {parola.definizione}
          </p>
        ) : (
          <button type="button" className="ana-aiuto" onClick={comandi.aiuto} disabled={!attivo}>
            <IconBook size={16} />
            Definizione
            <span className="ana-aiuto__costo u-tabnum">−{COSTO_AIUTO_ANAGRAMMI}</span>
          </button>
        )}
        <button type="button" className="ana-passo" onClick={comandi.passo} disabled={!attivo}>
          Passo
        </button>
      </div>
      <span className="u-visually-hidden" aria-live="polite">
        {ORDINALI[indice] ?? 'La'} parola, {parola.lunghezza} lettere
      </span>
    </div>
  )
}

/** Com'e' andata una parola chiusa: la parola, e il tempo o perché non c'e'. */
export function Esito({ parola, indice }: { parola: ParolaAnagrammi; indice: number }) {
  if (!parola.parola) return null
  return (
    <div className={`ana-esito is-${parola.esito}`}>
      <Lettere
        lettere={parola.lettere ?? parola.parola}
        attivo={false}
        onProva={async () => null}
        chiusa={{ parola: parola.parola, trovata: parola.esito === 'trovata' }}
      />
      <p className="ana-esito__riga">
        {parola.esito === 'trovata'
          ? `${ORDINALI[indice] ?? 'La'} in ${formatDuration(parola.ms ?? 0)} · +${parola.punti}`
          : parola.esito === 'persa'
            ? 'Tempo scaduto'
            : 'Passata'}
        {parola.risposta && <span className="ana-esito__anche"> · hai scritto {parola.risposta.toUpperCase()}</span>}
      </p>
    </div>
  )
}

/** Tutte le parole a giornata finita: com'erano, cos'erano, e quanto hanno dato. */
export function Riepilogo({ parole }: { parole: ParolaAnagrammi[] }) {
  return (
    <ul className="ana-riepilogo">
      {parole.map((p, i) => (
        <li key={i} className={`ana-riepilogo__riga is-${p.esito ?? 'persa'}`}>
          <span className="ana-riepilogo__cosa">
            <span className="ana-riepilogo__lettere">{(p.lettere ?? '').toUpperCase()}</span>
            <span className="ana-riepilogo__freccia" aria-hidden="true">
              →
            </span>
            <span className="ana-riepilogo__parola">{(p.parola ?? '').toUpperCase()}</span>
          </span>
          <span className="ana-riepilogo__conto u-tabnum">
            {p.esito === 'trovata' ? `+${p.punti}` : p.esito === 'passata' ? 'passata' : 'persa'}
          </span>
          {(p.definizione || p.risposta) && (
            <span className="ana-riepilogo__definizione">
              {p.definizione}
              {p.risposta && `${p.definizione ? ' · ' : ''}hai scritto ${p.risposta.toUpperCase()}`}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
