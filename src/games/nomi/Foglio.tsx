import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { Scheda } from '@/components/Scheda'
import { useRestante } from '@/games/tavolo/TempoMossa'
import { suona } from '@/lib/suoni'
import { CATEGORIE_NOMI, LUNGHEZZA_MASSIMA_RISPOSTA, candidati, type CategoriaNomi } from '@shared/nomi-cose'
import { Matita, URGENTE_S } from './Matita'
import { tempiCorrezione, variabiliCorrezione } from './scena'
import type { RisposteNomi } from './useNomiDelGiorno'

/** Le categorie che sono nomi propri: la tastiera comincia con la maiuscola. */
const PROPRI: readonly CategoriaNomi[] = ['nomi', 'citta', 'paesi', 'acque']

/** La risposta comincia con la lettera, anche con l'articolo davanti o con "lago di". */
export function cominciaCon(testo: string, categoria: CategoriaNomi, lettera: string): boolean {
  return candidati(testo, categoria).some((f) => f.startsWith(lettera))
}

/** Movimento ridotto: le scene si saltano, e i segni compaiono gia' fatti. */
export function movimentoRidotto(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * La lettera del giorno nel tondo giallo della matita: il timbro sul foglio.
 * Quella del foglio in gioco e' la meta della lettera che vola via dal rullo
 * (`meta`), e mentre vola il suo posto aspetta vuoto (`nascosta`).
 */
export function Lettera({
  lettera,
  piccola = false,
  meta = false,
  nascosta = false,
}: {
  lettera: string | null
  piccola?: boolean
  meta?: boolean
  nascosta?: boolean
}) {
  const classi = ['nomi-lettera', piccola && 'is-piccola', !lettera && 'is-nascosta', nascosta && 'is-in-volo']
  return (
    <span className={classi.filter(Boolean).join(' ')} data-nomi-meta={meta || undefined} aria-hidden="true">
      {lettera ? lettera.toUpperCase() : '?'}
    </span>
  )
}

/**
 * L'altro che scrive, contato come si contano i punti al tavolo: una
 * stanghetta per risposta, e l'ultima taglia le altre. Quelle che mancano si
 * vedono appena, cosi' si sa quante ne restano.
 */
export function Stanghette({ scritte, totale }: { scritte: number; totale: number }) {
  const dritte = Math.max(0, totale - 1)
  const larga = 10 + dritte * 6
  return (
    <svg className="nomi-stanghette" viewBox={`0 0 ${larga} 20`} width={larga} height={20} aria-hidden="true">
      {Array.from({ length: dritte }, (_, i) => (
        <path
          key={i}
          pathLength={1}
          className={i < scritte ? 'is-scritta' : undefined}
          d={`M${5 + i * 6} 3.5c-.5 4.2.5 8.4-.2 13`}
        />
      ))}
      <path
        pathLength={1}
        className={scritte >= totale ? 'is-scritta' : undefined}
        d={`M1.5 14.5C${larga * 0.35} 11.5 ${larga * 0.65} 8.5 ${larga - 1.5} 5.5`}
      />
    </svg>
  )
}

/** Sotto la matita: chi altro sta scrivendo, e quante risposte ha. */
export function Altro({
  chi,
  nome,
  scritte,
  totale,
  fermo = false,
}: {
  chi: ReactNode
  nome: string
  scritte: number
  totale: number
  fermo?: boolean
}) {
  return (
    <p className="nomi-altro" aria-live="polite">
      <span className="nomi-altro__chi">{chi}</span>
      <span className="nomi-altro__nome">
        {nome} {fermo ? 'ha scritto' : 'scrive'}
      </span>
      <span className="nomi-altro__conto" role="img" aria-label={`${scritte} su ${totale}`}>
        <Stanghette scritte={scritte} totale={totale} />
      </span>
    </p>
  )
}

/**
 * Il foglio in gioco: in cima la lettera e la matita che fa da orologio, poi
 * una riga per categoria, con il nome a sinistra del margine rosso e la
 * risposta sulla riga, e sotto le righe vuote del quaderno fino in fondo.
 * Dopo uno stop il foglio si ferma: le risposte restano come sono, e al posto
 * della matita si legge che cosa e' successo (`fermo`).
 *
 * Negli ultimi secondi il foglio si fa urgente: la matita e' rossa, i secondi
 * battono, e il bordo pulsa.
 */
export function FoglioInGioco({
  lettera,
  categorie,
  risposte,
  onScrivi,
  disabilitato = false,
  scadenza,
  totaleMs,
  onScaduto,
  altro,
  fermo = null,
  azione,
  entrata = false,
  nascondiLettera = false,
}: {
  lettera: string
  categorie: readonly CategoriaNomi[]
  risposte: RisposteNomi
  onScrivi: (categoria: CategoriaNomi, testo: string) => void
  disabilitato?: boolean
  /** Quando finisce il tempo, sull'orologio del telefono; null se non corre. */
  scadenza: number | null
  totaleMs: number
  onScaduto?: () => void
  /** Sotto la matita: l'altro che scrive. */
  altro?: ReactNode
  /** Il foglio fermo dopo lo stop: che cosa e' successo. */
  fermo?: string | null
  /** Sotto il foglio: la consegna, o lo stop. */
  azione?: ReactNode
  /** Il foglio appena arrivato con la lettera: le righe si scrivono una dopo l'altra. */
  entrata?: boolean
  /** La lettera sta volando sul foglio: il suo posto aspetta. */
  nascondiLettera?: boolean
}) {
  const restante = useRestante(fermo === null ? scadenza : null, onScaduto)
  const urgente = restante !== null && Math.ceil(restante / 1_000) <= URGENTE_S
  const maiuscola = lettera.toUpperCase()
  const classi = ['nomi-foglio', urgente && 'is-urgente', fermo !== null && 'is-fermo']
  return (
    <div className={`nomi-gioco${entrata ? ' is-entrata' : ''}`}>
      <section className={classi.filter(Boolean).join(' ')} aria-label={`Il foglio, con la ${maiuscola}`}>
        <header className="nomi-foglio__testa">
          <Lettera lettera={lettera} meta nascosta={nascondiLettera} />
          <div className="nomi-foglio__intestazione">
            <h2 className="nomi-foglio__titolo">Con la {maiuscola}</h2>
            {fermo !== null ? (
              <p className="nomi-foglio__fermo">{fermo}</p>
            ) : (
              restante !== null && <Matita restante={restante} totaleMs={totaleMs} />
            )}
          </div>
          {altro && <div className="nomi-foglio__altro">{altro}</div>}
        </header>
        <div className="nomi-foglio__righe">
          {fermo !== null ? (
            categorie.map((c, i) => {
              const testo = risposte[c]?.trim() ?? ''
              return (
                <div
                  key={c}
                  className={`nomi-riga is-ferma${testo ? '' : ' is-vuota'}`}
                  style={{ '--i': i } as CSSProperties}
                >
                  <span className="nomi-riga__categoria">{CATEGORIE_NOMI[c].nome}</span>
                  <span className="nomi-riga__cella">
                    <span className="nomi-riga__testo">{testo || '—'}</span>
                  </span>
                </div>
              )
            })
          ) : (
            <RigheDaScrivere
              lettera={lettera}
              categorie={categorie}
              risposte={risposte}
              onScrivi={onScrivi}
              disabilitato={disabilitato}
            />
          )}
          <div className="nomi-foglio__vuote" aria-hidden="true" />
        </div>
      </section>
      {azione && <div className="nomi-gioco__azione">{azione}</div>}
    </div>
  )
}

/**
 * Le righe da scrivere. Invio passa alla riga dopo; sull'ultima chiude la
 * tastiera, e la consegna resta un gesto a parte.
 */
function RigheDaScrivere({
  lettera,
  categorie,
  risposte,
  onScrivi,
  disabilitato,
}: {
  lettera: string
  categorie: readonly CategoriaNomi[]
  risposte: RisposteNomi
  onScrivi: (categoria: CategoriaNomi, testo: string) => void
  disabilitato: boolean
}) {
  const campi = useRef<(HTMLInputElement | null)[]>([])
  const maiuscola = lettera.toUpperCase()

  // Si comincia a scrivere subito: il tempo corre.
  useEffect(() => {
    campi.current.find((c, i) => c && !risposte[categorie[i]])?.focus({ preventScroll: true })
    // Solo all'apertura del foglio: dopo, il fuoco lo decide chi scrive.
  }, [])

  return (
    <>
      {categorie.map((c, i) => {
        const testo = risposte[c] ?? ''
        const fuori = testo.trim() !== '' && !cominciaCon(testo, c, lettera)
        const ultima = i === categorie.length - 1
        return (
          <label key={c} className={`nomi-riga${fuori ? ' is-fuori' : ''}`} style={{ '--i': i } as CSSProperties}>
            <span className="nomi-riga__categoria">{CATEGORIE_NOMI[c].nome}</span>
            <span className="nomi-riga__cella">
              {fuori && <span className="nomi-riga__avviso">Non comincia con la {maiuscola}</span>}
              <input
                ref={(el) => {
                  campi.current[i] = el
                }}
                className="nomi-riga__campo"
                type="text"
                value={testo}
                maxLength={LUNGHEZZA_MASSIMA_RISPOSTA}
                placeholder={`${maiuscola}…`}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                autoCapitalize={PROPRI.includes(c) ? 'words' : 'none'}
                enterKeyHint={ultima ? 'done' : 'next'}
                disabled={disabilitato}
                aria-invalid={fuori || undefined}
                onChange={(e) => onScrivi(c, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  if (ultima) e.currentTarget.blur()
                  else campi.current[i + 1]?.focus()
                }}
              />
            </span>
          </label>
        )
      })}
    </>
  )
}

export type SegnoRiga = 'giusta' | 'sbagliata' | 'vuota'

export interface RigaScritta {
  categoria: CategoriaNomi
  testo: string
  /** Vale, non vale, o non c'era; null se ancora non si sa. */
  segno: SegnoRiga | null
  /** Sotto la risposta: quanti l'hanno data, la risposta dell'altro. */
  nota?: ReactNode
  /** Nella colonna dei punti. */
  punti?: ReactNode
  /** L'ha data solo lui: l'evidenziatore. */
  rara?: boolean
}

/** L'ultima riga del foglio, sotto la doppia riga della somma. */
export interface TotaleScritto {
  etichetta: string
  /** In mezzo, a matita: l'altro, i punti per aver giocato. */
  nota?: ReactNode
  valore: ReactNode
}

/** Il segno della penna di chi corregge: la spunta che vale, la croce che non vale. Si traccia come a penna. */
function Segno({ tipo }: { tipo: 'spunta' | 'croce' }) {
  return tipo === 'spunta' ? (
    <svg className="nomi-segno is-spunta" viewBox="0 0 24 24" role="img" aria-label="Valida">
      <path pathLength={1} d="M3.5 12.8c2.1 1.5 3.7 3.4 5.3 5.7C11.4 12.4 15.2 7.6 20.8 4.2" />
    </svg>
  ) : (
    <svg className="nomi-segno is-croce" viewBox="0 0 24 24" role="img" aria-label="Non valida">
      <path pathLength={1} d="M5.5 5.2c4.4 4.3 8.6 8.8 13 13.4" />
      <path pathLength={1} d="M18.6 5.4c-4.6 4.4-8.8 8.8-13.1 13.3" />
    </svg>
  )
}

/**
 * Il foglio corretto: ogni risposta con il segno della penna, i punti nella
 * colonna a destra (`conPunti`: la colonna c'e' anche quando sono tutti zero),
 * l'evidenziatore su quelle date solo da chi le ha scritte, e in fondo la
 * somma. Le risposte non valide si cancellano con un tratto.
 */
export function FoglioScritto({
  righe,
  totale,
  conPunti = false,
}: {
  righe: readonly RigaScritta[]
  totale?: TotaleScritto
  conPunti?: boolean
}) {
  return (
    <div className={`nomi-scritto${conPunti ? ' con-punti' : ''}`}>
      <ul className="nomi-scritto__righe">
        {righe.map((r, i) => (
          <li
            key={r.categoria}
            className={`nomi-riga is-${r.segno ?? 'aperta'}${r.rara ? ' is-rara' : ''}`}
            style={{ '--i': i } as CSSProperties}
          >
            <span className="nomi-riga__categoria">{CATEGORIE_NOMI[r.categoria].nome}</span>
            <span className="nomi-riga__cella">
              <span className="nomi-riga__parola">
                <span className="nomi-riga__testo">{r.testo || '—'}</span>
                {r.segno === 'giusta' && <Segno tipo="spunta" />}
                {r.segno === 'sbagliata' && <Segno tipo="croce" />}
              </span>
              {r.nota && <span className="nomi-riga__nota">{r.nota}</span>}
            </span>
            {conPunti && <span className="nomi-riga__punti u-tabnum">{r.punti}</span>}
          </li>
        ))}
      </ul>
      {totale && (
        <p className="nomi-scritto__totale">
          <span className="nomi-scritto__etichetta">{totale.etichetta}</span>
          <span className="nomi-scritto__nota">{totale.nota}</span>
          <span className="nomi-scritto__valore u-tabnum">{totale.valore}</span>
        </p>
      )}
    </div>
  )
}

/**
 * Il foglio corretto dentro la sua scheda, che e' di carta: in testa la
 * lettera, il titolo e la pillola dell'esito. Con `correzione` il foglio si
 * corregge davanti a chi guarda — un segno per riga, poi i punti, poi la somma
 * — dopo `attesa` (il timbro dello stop); la pillola arriva alla fine, per non
 * dire prima com'e' andata.
 */
export function CartaScritta({
  titolo,
  lettera,
  destra,
  righe,
  totale,
  conPunti = false,
  correzione = null,
  className = '',
  children,
}: {
  titolo: string
  lettera: string | null
  destra?: ReactNode
  righe: readonly RigaScritta[]
  totale?: TotaleScritto
  conPunti?: boolean
  correzione?: { attesa: number } | null
  className?: string
  children?: ReactNode
}) {
  // La correzione e' quella del primo disegno: le righe che arrivano dopo non la rifanno.
  const prima = useRef(correzione)
  const ridotto = movimentoRidotto()
  const anima = prima.current !== null && !ridotto
  const tempi = anima ? tempiCorrezione(righe.length, prima.current!.attesa) : null

  useEffect(() => {
    if (!tempi) return
    righe.forEach((r, i) => {
      const quando = tempi.righe[i] / 1_000
      if (r.segno === 'giusta') suona('spunta', { ritardo: quando, volume: 0.9 })
      else if (r.segno === 'sbagliata') suona('croce', { ritardo: quando, volume: 0.9 })
      if (r.rara) suona('evidenzia', { ritardo: quando + 0.16 })
    })
    // Una volta, quando il foglio compare.
  }, [])

  return (
    <Scheda
      className={`nomi-carta${anima ? ' is-correzione' : ''} ${className}`}
      titolo={titolo}
      icona={<Lettera lettera={lettera} piccola />}
      destra={destra}
      stile={tempi ? (variabiliCorrezione(tempi, prima.current!.attesa) as CSSProperties) : undefined}
    >
      <FoglioScritto righe={righe} totale={totale} conPunti={conPunti} />
      {children}
    </Scheda>
  )
}

/**
 * Il post-it attaccato al foglio, scritto a mano: le parole che si potevano
 * scrivere, le piu' date di ieri.
 */
export function PostIt({
  titolo,
  voci,
}: {
  titolo: string
  voci: readonly { chiave: string; nome: string; parole: ReactNode }[]
}) {
  return (
    <aside className="nomi-postit" aria-label={titolo}>
      <p className="nomi-postit__titolo">{titolo}</p>
      <ul className="nomi-postit__elenco">
        {voci.map((v) => (
          <li key={v.chiave}>
            <span className="nomi-postit__categoria">{v.nome}</span>{' '}
            <span className="nomi-postit__parole">{v.parole}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
