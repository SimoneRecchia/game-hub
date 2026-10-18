/**
 * I grafici del pannello: SVG scritti a mano, senza librerie.
 *
 * Tre forme e due pezzi: le colonne (anche impilate, e con un limite), le
 * linee, le colonne che vanno sopra e sotto lo zero; la misura di un valore
 * contro il suo limite e la linea piccola dentro una cifra. Seguono tutte le
 * stesse regole: segni sottili, la griglia a filo e sullo sfondo, il colore
 * solo sui segni e mai sulle scritte, la legenda quando le serie sono due.
 *
 * Il grafico si misura sulla larghezza che ha (ResizeObserver) e si disegna in
 * pixel veri, invece di un viewBox che si stira: con il viewBox le scritte
 * diventerebbero piccole sul telefono e enormi sul computer. Il dito o il
 * mouse cercano il giorno piu' vicino, e il fumetto dice tutte le serie di
 * quel giorno; con la tastiera le frecce passano da un giorno all'altro, e chi
 * legge lo schermo ha anche la tabella dei numeri, nascosta.
 */
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { compatto, numero, percento } from './formato'
import { IconaAvviso } from './icone'
import './Grafici.css'

export interface SerieGrafico {
  nome: string
  /** Un colore dei token: `var(--adm-serie-1)`. */
  colore: string
}

export interface PuntoGrafico {
  /** Nel fumetto e nella tabella: "sab 18 ott". */
  etichetta: string
  /** Sotto l'asse, corta: "18". */
  asse: string
  /** Uno per serie; null dove il valore manca. */
  valori: (number | null)[]
}

type Formato = (n: number) => string

/* ─────────────────────────────  La misura  ───────────────────────────── */

function useLarghezza<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [larghezza, setLarghezza] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setLarghezza(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const osserva = new ResizeObserver(([voce]) => setLarghezza(voce.contentRect.width))
    osserva.observe(el)
    return () => osserva.disconnect()
  }, [])
  return [ref, larghezza] as const
}

/** Un massimo tondo e il suo passo, per le tacche dell'asse: 1, 2, 2,5 o 5 per una potenza di dieci. */
export function scalaTonda(massimo: number, tacche = 4, interi = true): { max: number; passo: number } {
  if (!(massimo > 0)) return { max: interi ? tacche : 1, passo: interi ? 1 : 0.25 }
  const grezzo = massimo / tacche
  const potenza = 10 ** Math.floor(Math.log10(grezzo))
  const resto = grezzo / potenza
  let passo = (resto <= 1 ? 1 : resto <= 2 ? 2 : resto <= 2.5 ? 2.5 : resto <= 5 ? 5 : 10) * potenza
  if (interi) passo = Math.max(1, Math.round(passo))
  return { max: passo * Math.ceil(massimo / passo - 1e-9), passo }
}

/** Quanto e' larga una scritta corta dell'asse, a occhio: undici punti, cifre larghe sei e mezzo. */
const larghezzaTesto = (testo: string) => testo.length * 6.4 + 2

/** L'ultimo posto con un valore, o -1. */
function ultimoPieno(valori: Array<number | null | undefined>): number {
  for (let i = valori.length - 1; i >= 0; i -= 1) if (valori[i] !== null && valori[i] !== undefined) return i
  return -1
}

const ALTO = 8
const BASSO = 24

/** I giorni da scrivere sotto l'asse: il primo, l'ultimo, quello evidenziato, e in mezzo quanti ci stanno. */
function giorniDaScrivere(n: number, larghezza: number, evidenzia: number | undefined): Set<number> {
  const ogni = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(larghezza / 40))))
  const scelti = new Set<number>()
  for (let i = 0; i < n; i += ogni) if (n - 1 - i >= ogni / 2 || i === 0) scelti.add(i)
  scelti.add(n - 1)
  if (evidenzia !== undefined) {
    // Il giorno evidenziato si scrive sempre: tolti i vicini, che gli finirebbero addosso.
    for (const i of [...scelti]) if (i !== evidenzia && Math.abs(i - evidenzia) < ogni) scelti.delete(i)
    scelti.add(evidenzia)
  }
  return scelti
}

/* ─────────────────────────────  Il fumetto  ───────────────────────────── */

function Fumetto({
  x,
  larghezza,
  titolo,
  righe,
}: {
  x: number
  larghezza: number
  titolo: string
  righe: Array<{ colore: string; nome: string; valore: string; tratto?: 'linea' | 'quadro' }>
}) {
  // Sta dentro il grafico: vicino ai bordi si sposta, invece di uscire.
  const mezzo = 84
  const sinistra = Math.min(Math.max(x, mezzo), Math.max(mezzo, larghezza - mezzo))
  return (
    <div className="adm-fumetto" style={{ left: sinistra }} aria-hidden="true">
      <p className="adm-fumetto__titolo">{titolo}</p>
      {righe.map((r) => (
        <p key={r.nome} className="adm-fumetto__riga">
          <span
            className={`adm-fumetto__chiave${r.tratto === 'quadro' ? ' is-quadro' : ''}`}
            style={{ background: r.colore }}
          />
          <strong className="u-tabnum">{r.valore}</strong>
          <span>{r.nome}</span>
        </p>
      ))}
    </div>
  )
}

/** La legenda sopra il grafico, quando le serie sono due o piu'. */
export function Legenda({ serie, tratto = 'quadro' }: { serie: SerieGrafico[]; tratto?: 'linea' | 'quadro' }) {
  if (serie.length < 2) return null
  return (
    <ul className="adm-legenda">
      {serie.map((s) => (
        <li key={s.nome}>
          <span className={`adm-legenda__chiave is-${tratto}`} style={{ background: s.colore }} aria-hidden="true" />
          {s.nome}
        </li>
      ))}
    </ul>
  )
}

/** La tabella dei numeri, per chi legge lo schermo: il grafico ha gli stessi valori, disegnati. */
function TabellaNascosta({
  titolo,
  serie,
  punti,
  formato,
}: {
  titolo: string
  serie: SerieGrafico[]
  punti: PuntoGrafico[]
  formato: Formato
}) {
  // Nascosta nel suo contenitore: una tabella non si stringe sotto il suo contenuto, e da sola allargherebbe la pagina.
  return (
    <div className="u-visually-hidden">
      <table>
        <caption>{titolo}</caption>
        <thead>
          <tr>
            <th scope="col">Giorno</th>
            {serie.map((s) => (
              <th key={s.nome} scope="col">
                {s.nome}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {punti.map((p) => (
            <tr key={p.etichetta}>
              <th scope="row">{p.etichetta}</th>
              {p.valori.map((v, i) => (
                <td key={i}>{v === null ? '—' : formato(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Il giorno sotto il dito, il mouse o la tastiera. Il dito lascia il fumetto
 * dov'e' (sollevandolo non sparisce, se no non si leggerebbe); il mouse lo
 * porta via uscendo.
 */
function useAttivo(n: number) {
  const [attivo, setAttivo] = useState<number | null>(null)
  const daPuntatore = (e: PointerEvent<SVGRectElement>, sinistra: number, banda: number) => {
    const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (!box) return
    const i = Math.floor((e.clientX - box.left - sinistra) / banda)
    setAttivo(Math.min(n - 1, Math.max(0, i)))
  }
  const tasti = (e: KeyboardEvent<HTMLDivElement>) => {
    const muovi = (i: number) => {
      e.preventDefault()
      setAttivo(Math.min(n - 1, Math.max(0, i)))
    }
    if (e.key === 'ArrowRight') muovi((attivo ?? -1) + 1)
    else if (e.key === 'ArrowLeft') muovi((attivo ?? n) - 1)
    else if (e.key === 'Home') muovi(0)
    else if (e.key === 'End') muovi(n - 1)
    else if (e.key === 'Escape') setAttivo(null)
  }
  return { attivo, setAttivo, daPuntatore, tasti }
}

interface PropsComuni {
  /** Il nome del grafico per chi legge lo schermo, con quel che dice: "Iscrizioni, 30 giorni". */
  titolo: string
  serie: SerieGrafico[]
  punti: PuntoGrafico[]
  formato?: Formato
  altezza?: number
  /** Il giorno da evidenziare sotto l'asse: oggi. */
  evidenzia?: number
}

/** Il guscio di ogni grafico: si misura, si tocca, si legge con la tastiera. */
function Cornice({
  titolo,
  riassunto,
  annuncio,
  onTasti,
  onEsci,
  cornice,
  children,
}: {
  titolo: string
  riassunto: string
  annuncio: string
  onTasti: (e: KeyboardEvent<HTMLDivElement>) => void
  onEsci: () => void
  cornice: RefObject<HTMLDivElement | null>
  children: ReactNode
}) {
  return (
    <div
      ref={cornice}
      className="adm-grafico"
      role="group"
      aria-roledescription="grafico"
      aria-label={`${titolo}. ${riassunto}`}
      tabIndex={0}
      onKeyDown={onTasti}
      onBlur={onEsci}
    >
      {children}
      <span className="u-visually-hidden" aria-live="polite">
        {annuncio}
      </span>
    </div>
  )
}

/* ─────────────────────────────  Le colonne  ───────────────────────────── */

/** Una colonna con gli angoli tondi solo in cima, dove finisce il dato; dritta sulla linea di base. */
function colonna(x: number, y: number, w: number, h: number, raggio = 4): string {
  if (h <= 0 || w <= 0) return ''
  const r = Math.min(raggio, w / 2, h)
  return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`
}

/** Lo stesso, rovesciata: per i valori sotto lo zero, tonda in fondo. */
function colonnaGiu(x: number, y: number, w: number, h: number, raggio = 4): string {
  if (h <= 0 || w <= 0) return ''
  const r = Math.min(raggio, w / 2, h)
  const giu = y + h
  return `M${x} ${y}V${giu - r}Q${x} ${giu} ${x + r} ${giu}H${x + w - r}Q${x + w} ${giu} ${x + w} ${giu - r}V${y}Z`
}

/**
 * Le colonne di una serie al giorno, o di piu' serie impilate (le finite in
 * basso, le altre sopra): le parti di una colonna sono staccate da un filo
 * del colore dello sfondo, e solo l'ultima ha la cima tonda.
 */
export function GraficoColonne({
  titolo,
  serie,
  punti,
  formato = numero,
  altezza = 180,
  evidenzia,
  totale,
  limite,
}: PropsComuni & {
  /** Nel fumetto, sopra le serie impilate: "Giocate". */
  totale?: string
  /** Una linea a un valore che non si deve passare, con il suo nome. */
  limite?: { valore: number; nome: string }
}) {
  const [cornice, larghezza] = useLarghezza<HTMLDivElement>()
  const n = punti.length
  const { attivo, setAttivo, daPuntatore, tasti } = useAttivo(n)
  const somme = punti.map((p) => p.valori.reduce<number>((s, v) => s + (v ?? 0), 0))
  const massimo = Math.max(0, ...somme, limite?.valore ?? 0)
  const { max, passo } = scalaTonda(massimo)
  const tacche = Array.from({ length: Math.round(max / passo) + 1 }, (_, i) => i * passo)
  const sinistra = Math.max(...tacche.map((t) => larghezzaTesto(compatto(t)))) + 8
  const pianoL = Math.max(0, larghezza - sinistra)
  const pianoA = altezza - ALTO - BASSO
  const banda = n > 0 ? pianoL / n : 0
  const spessore = Math.max(2, Math.min(24, banda * 0.62, banda - 2))
  const y = (v: number) => ALTO + pianoA - (v / max) * pianoA
  const scritti = giorniDaScrivere(n, pianoL, evidenzia)
  const ultimo = n > 0 ? somme[n - 1] : 0
  const riassunto =
    n > 0
      ? `${n} giorni, da ${punti[0].etichetta} a ${punti[n - 1].etichetta}. Ultimo: ${formato(ultimo)}.`
      : 'Nessun dato.'
  const puntoAttivo = attivo !== null ? punti[attivo] : null
  const annuncio = puntoAttivo
    ? `${puntoAttivo.etichetta}: ${serie.map((s, i) => `${s.nome} ${formato(puntoAttivo.valori[i] ?? 0)}`).join(', ')}`
    : ''

  return (
    <>
      <Legenda serie={serie} />
      <Cornice
        titolo={titolo}
        riassunto={riassunto}
        annuncio={annuncio}
        onTasti={tasti}
        onEsci={() => setAttivo(null)}
        cornice={cornice}
      >
        {larghezza > 0 && (
          <svg width={larghezza} height={altezza} className="adm-grafico__svg" aria-hidden="true">
            {tacche.map((t) => (
              <g key={t}>
                <line
                  x1={sinistra}
                  x2={larghezza}
                  y1={y(t)}
                  y2={y(t)}
                  className={t === 0 ? 'adm-grafico__base' : 'adm-grafico__griglia'}
                />
                <text x={sinistra - 8} y={y(t) + 3.5} textAnchor="end" className="adm-grafico__tacca">
                  {compatto(t)}
                </text>
              </g>
            ))}
            {attivo !== null && (
              <rect
                x={sinistra + attivo * banda}
                y={ALTO}
                width={banda}
                height={pianoA}
                rx={4}
                className="adm-grafico__evidenza"
              />
            )}
            {punti.map((p, i) => {
              const x = sinistra + i * banda + (banda - spessore) / 2
              let sotto = 0
              const ultimaParte = p.valori.reduce<number>((u, v, k) => ((v ?? 0) > 0 ? k : u), -1)
              return (
                <g key={p.etichetta}>
                  {p.valori.map((v, k) => {
                    const valore = v ?? 0
                    if (valore <= 0) return null
                    const cima = y(sotto + valore)
                    const fondo = y(sotto)
                    sotto += valore
                    // Il filo dello sfondo fra due parti: la parte sotto si accorcia di due punti.
                    const alta = Math.max(0, fondo - cima - (k < ultimaParte ? 2 : 0))
                    const d =
                      k === ultimaParte
                        ? colonna(x, cima, spessore, fondo - cima)
                        : `M${x} ${fondo}V${fondo - alta}H${x + spessore}V${fondo}Z`
                    return <path key={k} d={d} fill={serie[k]?.colore} />
                  })}
                </g>
              )
            })}
            {limite && (
              <g>
                <line
                  x1={sinistra}
                  x2={larghezza}
                  y1={y(limite.valore)}
                  y2={y(limite.valore)}
                  className="adm-grafico__limite"
                />
                <text x={larghezza} y={y(limite.valore) - 5} textAnchor="end" className="adm-grafico__nota">
                  {limite.nome}
                </text>
              </g>
            )}
            {punti.map((p, i) =>
              scritti.has(i) ? (
                <text
                  key={p.etichetta}
                  x={sinistra + (i + 0.5) * banda}
                  y={altezza - 6}
                  textAnchor={i === 0 && banda < 20 ? 'start' : i === n - 1 && banda < 20 ? 'end' : 'middle'}
                  className={`adm-grafico__tacca${i === evidenzia ? ' is-oggi' : ''}`}
                >
                  {p.asse}
                </text>
              ) : null,
            )}
            <rect
              x={sinistra}
              y={0}
              width={pianoL}
              height={altezza}
              fill="transparent"
              onPointerMove={(e) => daPuntatore(e, sinistra, banda)}
              onPointerDown={(e) => daPuntatore(e, sinistra, banda)}
              onPointerLeave={(e) => e.pointerType === 'mouse' && setAttivo(null)}
            />
          </svg>
        )}
        {puntoAttivo && attivo !== null && (
          <Fumetto
            x={sinistra + (attivo + 0.5) * banda}
            larghezza={larghezza}
            titolo={puntoAttivo.etichetta}
            righe={[
              ...(totale && serie.length > 1
                ? [{ colore: 'transparent', nome: totale, valore: formato(somme[attivo]) }]
                : []),
              ...serie.map((s, k) => ({
                colore: s.colore,
                nome: s.nome,
                valore: puntoAttivo.valori[k] === null ? '—' : formato(puntoAttivo.valori[k] ?? 0),
                tratto: 'quadro' as const,
              })),
            ]}
          />
        )}
      </Cornice>
      <TabellaNascosta titolo={titolo} serie={serie} punti={punti} formato={formato} />
    </>
  )
}

/* ─────────────────────────────  Le linee  ───────────────────────────── */

/**
 * Una o due linee nel tempo. Con una sola serie sotto c'e' il velo del suo
 * colore e il valore dell'ultimo giorno alla fine; con due, la legenda. Il
 * mirino segue il giorno piu' vicino, e il fumetto dice tutte le serie.
 */
export function GraficoLinee({
  titolo,
  serie,
  punti,
  formato = numero,
  altezza = 180,
  evidenzia,
  limite,
  interi = true,
}: PropsComuni & { limite?: { valore: number; nome: string }; interi?: boolean }) {
  const [cornice, larghezza] = useLarghezza<HTMLDivElement>()
  const n = punti.length
  const { attivo, setAttivo, daPuntatore, tasti } = useAttivo(n)
  const tutti = punti.flatMap((p) => p.valori.filter((v): v is number => v !== null))
  const { max, passo } = scalaTonda(Math.max(0, ...tutti, limite?.valore ?? 0), 4, interi)
  const tacche = Array.from({ length: Math.round(max / passo) + 1 }, (_, i) => i * passo)
  const sinistra = Math.max(...tacche.map((t) => larghezzaTesto(compatto(t)))) + 8
  const sola = serie.length === 1
  const ultimoValore = sola ? ([...punti].reverse().find((p) => p.valori[0] !== null)?.valori[0] ?? null) : null
  // Il valore dell'ultimo giorno sta in fondo alla linea: gli si lascia il posto a destra.
  const destra = ultimoValore !== null ? larghezzaTesto(formato(ultimoValore)) + 10 : 6
  const pianoL = Math.max(0, larghezza - sinistra - destra)
  const pianoA = altezza - ALTO - BASSO
  const banda = n > 0 ? pianoL / n : 0
  const x = (i: number) => sinistra + (i + 0.5) * banda
  const y = (v: number) => ALTO + pianoA - (v / max) * pianoA
  const scritti = giorniDaScrivere(n, pianoL, evidenzia)

  const tracciato = (k: number) => {
    let d = ''
    let dentro = false
    punti.forEach((p, i) => {
      const v = p.valori[k]
      if (v === null || v === undefined) {
        dentro = false
        return
      }
      d += `${dentro ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`
      dentro = true
    })
    return d
  }
  const velo = () => {
    const pieni = punti
      .map((p, i) => ({ i, v: p.valori[0] }))
      .filter((q): q is { i: number; v: number } => q.v !== null)
    if (pieni.length < 2) return ''
    const base = y(0)
    const linea = pieni.map((q) => `L${x(q.i).toFixed(1)} ${y(q.v).toFixed(1)}`).join('')
    return `M${x(pieni[0].i)} ${base}${linea}L${x(pieni[pieni.length - 1].i)} ${base}Z`
  }

  const riassunto =
    n > 0
      ? `${n} giorni, da ${punti[0].etichetta} a ${punti[n - 1].etichetta}. ${serie
          .map((s, k) => {
            const ultimo = [...punti].reverse().find((p) => p.valori[k] !== null)?.valori[k]
            return `${s.nome}: ultimo ${ultimo === null || ultimo === undefined ? '—' : formato(ultimo)}`
          })
          .join('; ')}.`
      : 'Nessun dato.'
  const puntoAttivo = attivo !== null ? punti[attivo] : null
  const annuncio = puntoAttivo
    ? `${puntoAttivo.etichetta}: ${serie
        .map((s, k) => {
          const v = puntoAttivo.valori[k]
          return `${s.nome} ${v === null || v === undefined ? 'nessun dato' : formato(v)}`
        })
        .join(', ')}`
    : ''

  return (
    <>
      <Legenda serie={serie} tratto="linea" />
      <Cornice
        titolo={titolo}
        riassunto={riassunto}
        annuncio={annuncio}
        onTasti={tasti}
        onEsci={() => setAttivo(null)}
        cornice={cornice}
      >
        {larghezza > 0 && (
          <svg width={larghezza} height={altezza} className="adm-grafico__svg" aria-hidden="true">
            {tacche.map((t) => (
              <g key={t}>
                <line
                  x1={sinistra}
                  x2={larghezza - destra + 4}
                  y1={y(t)}
                  y2={y(t)}
                  className={t === 0 ? 'adm-grafico__base' : 'adm-grafico__griglia'}
                />
                <text x={sinistra - 8} y={y(t) + 3.5} textAnchor="end" className="adm-grafico__tacca">
                  {compatto(t)}
                </text>
              </g>
            ))}
            {limite && (
              <g>
                <line
                  x1={sinistra}
                  x2={larghezza - destra + 4}
                  y1={y(limite.valore)}
                  y2={y(limite.valore)}
                  className="adm-grafico__limite"
                />
                <text x={sinistra + 2} y={y(limite.valore) - 5} className="adm-grafico__nota">
                  {limite.nome}
                </text>
              </g>
            )}
            {sola && <path d={velo()} fill={serie[0].colore} className="adm-grafico__velo" />}
            {serie.map((s, k) => (
              <path key={s.nome} d={tracciato(k)} stroke={s.colore} className="adm-grafico__linea" />
            ))}
            {attivo !== null && (
              <line x1={x(attivo)} x2={x(attivo)} y1={ALTO} y2={ALTO + pianoA} className="adm-grafico__mirino" />
            )}
            {serie.map((s, k) => {
              // Il pallino dell'ultimo giorno, e quello del giorno sotto il mirino.
              const ultimoI = ultimoPieno(punti.map((p) => p.valori[k]))
              const dove = attivo !== null ? attivo : ultimoI
              const v = dove >= 0 ? punti[dove]?.valori[k] : null
              if (v === null || v === undefined) return null
              return <circle key={s.nome} cx={x(dove)} cy={y(v)} r={4} fill={s.colore} className="adm-grafico__punto" />
            })}
            {ultimoValore !== null && attivo === null && (
              <text
                x={x(ultimoPieno(punti.map((p) => p.valori[0]))) + 9}
                y={y(ultimoValore) + 4}
                className="adm-grafico__fine"
              >
                {formato(ultimoValore)}
              </text>
            )}
            {punti.map((p, i) =>
              scritti.has(i) ? (
                <text
                  key={p.etichetta}
                  x={x(i)}
                  y={altezza - 6}
                  textAnchor={i === 0 && banda < 20 ? 'start' : i === n - 1 && banda < 20 ? 'end' : 'middle'}
                  className={`adm-grafico__tacca${i === evidenzia ? ' is-oggi' : ''}`}
                >
                  {p.asse}
                </text>
              ) : null,
            )}
            <rect
              x={sinistra}
              y={0}
              width={pianoL}
              height={altezza}
              fill="transparent"
              onPointerMove={(e) => daPuntatore(e, sinistra, banda)}
              onPointerDown={(e) => daPuntatore(e, sinistra, banda)}
              onPointerLeave={(e) => e.pointerType === 'mouse' && setAttivo(null)}
            />
          </svg>
        )}
        {puntoAttivo && attivo !== null && (
          <Fumetto
            x={x(attivo)}
            larghezza={larghezza}
            titolo={puntoAttivo.etichetta}
            righe={serie.map((s, k) => ({
              colore: s.colore,
              nome: s.nome,
              valore: puntoAttivo.valori[k] === null ? '—' : formato(puntoAttivo.valori[k] ?? 0),
            }))}
          />
        )}
      </Cornice>
      <TabellaNascosta titolo={titolo} serie={serie} punti={punti} formato={formato} />
    </>
  )
}

/* ─────────────────────────  Sopra e sotto lo zero  ───────────────────────── */

/**
 * Le colonne di un valore con il segno, dalla linea dello zero: sopra in un
 * colore, sotto nell'altro, e i due nomi nella legenda. Il netto dei giocatori
 * alla Fortuna: sopra hanno vinto loro, sotto il banco.
 */
export function GraficoDivergente({
  titolo,
  punti,
  sopra,
  sotto,
  formato = numero,
  altezza = 200,
  evidenzia,
}: {
  titolo: string
  punti: Array<{ etichetta: string; asse: string; valore: number }>
  sopra: SerieGrafico
  sotto: SerieGrafico
  formato?: Formato
  altezza?: number
  evidenzia?: number
}) {
  const [cornice, larghezza] = useLarghezza<HTMLDivElement>()
  const n = punti.length
  const { attivo, setAttivo, daPuntatore, tasti } = useAttivo(n)
  const alto = Math.max(0, ...punti.map((p) => p.valore))
  const basso = Math.max(0, ...punti.map((p) => -p.valore))
  // Le due meta' con lo stesso passo: un passo diverso sopra e sotto falserebbe il confronto.
  const { passo } = scalaTonda(Math.max(alto + basso, 1), 4)
  const su = passo * Math.ceil(alto / passo)
  const giu = passo * Math.ceil(basso / passo)
  const intervallo = Math.max(passo, su + giu)
  const tacche: number[] = []
  for (let t = -giu; t <= su + 1e-9; t += passo) tacche.push(Math.round(t * 1000) / 1000)
  const sinistra = Math.max(...tacche.map((t) => larghezzaTesto(compatto(t)))) + 8
  const pianoL = Math.max(0, larghezza - sinistra)
  const pianoA = altezza - ALTO - BASSO
  const banda = n > 0 ? pianoL / n : 0
  const spessore = Math.max(2, Math.min(24, banda * 0.62, banda - 2))
  const y = (v: number) => ALTO + ((su - v) / intervallo) * pianoA
  const scritti = giorniDaScrivere(n, pianoL, evidenzia)
  const totale = punti.reduce((s, p) => s + p.valore, 0)
  const riassunto = `${n} giorni. In tutto ${formato(totale)}.`
  const puntoAttivo = attivo !== null ? punti[attivo] : null

  return (
    <>
      <Legenda serie={[sopra, sotto]} />
      <Cornice
        titolo={titolo}
        riassunto={riassunto}
        annuncio={puntoAttivo ? `${puntoAttivo.etichetta}: ${formato(puntoAttivo.valore)}` : ''}
        onTasti={tasti}
        onEsci={() => setAttivo(null)}
        cornice={cornice}
      >
        {larghezza > 0 && (
          <svg width={larghezza} height={altezza} className="adm-grafico__svg" aria-hidden="true">
            {tacche.map((t) => (
              <g key={t}>
                {t !== 0 && <line x1={sinistra} x2={larghezza} y1={y(t)} y2={y(t)} className="adm-grafico__griglia" />}
                <text x={sinistra - 8} y={y(t) + 3.5} textAnchor="end" className="adm-grafico__tacca">
                  {t > 0 ? `+${compatto(t)}` : compatto(t).replace('-', '−')}
                </text>
              </g>
            ))}
            {attivo !== null && (
              <rect
                x={sinistra + attivo * banda}
                y={ALTO}
                width={banda}
                height={pianoA}
                rx={4}
                className="adm-grafico__evidenza"
              />
            )}
            {punti.map((p, i) => {
              const x = sinistra + i * banda + (banda - spessore) / 2
              const zero = y(0)
              const d =
                p.valore >= 0
                  ? colonna(x, y(p.valore), spessore, zero - y(p.valore))
                  : colonnaGiu(x, zero, spessore, y(p.valore) - zero)
              return <path key={p.etichetta} d={d} fill={p.valore >= 0 ? sopra.colore : sotto.colore} />
            })}
            <line x1={sinistra} x2={larghezza} y1={y(0)} y2={y(0)} className="adm-grafico__base" />
            {punti.map((p, i) =>
              scritti.has(i) ? (
                <text
                  key={p.etichetta}
                  x={sinistra + (i + 0.5) * banda}
                  y={altezza - 6}
                  textAnchor={i === 0 && banda < 20 ? 'start' : i === n - 1 && banda < 20 ? 'end' : 'middle'}
                  className={`adm-grafico__tacca${i === evidenzia ? ' is-oggi' : ''}`}
                >
                  {p.asse}
                </text>
              ) : null,
            )}
            <rect
              x={sinistra}
              y={0}
              width={pianoL}
              height={altezza}
              fill="transparent"
              onPointerMove={(e) => daPuntatore(e, sinistra, banda)}
              onPointerDown={(e) => daPuntatore(e, sinistra, banda)}
              onPointerLeave={(e) => e.pointerType === 'mouse' && setAttivo(null)}
            />
          </svg>
        )}
        {puntoAttivo && attivo !== null && (
          <Fumetto
            x={sinistra + (attivo + 0.5) * banda}
            larghezza={larghezza}
            titolo={puntoAttivo.etichetta}
            righe={[
              {
                colore: puntoAttivo.valore >= 0 ? sopra.colore : sotto.colore,
                nome: puntoAttivo.valore >= 0 ? sopra.nome : sotto.nome,
                valore: formato(puntoAttivo.valore),
                tratto: 'quadro',
              },
            ]}
          />
        )}
      </Cornice>
      <TabellaNascosta
        titolo={titolo}
        serie={[{ nome: 'Netto', colore: sopra.colore }]}
        punti={punti.map((p) => ({ etichetta: p.etichetta, asse: p.asse, valori: [p.valore] }))}
        formato={formato}
      />
    </>
  )
}

/* ─────────────────────────────  La misura  ───────────────────────────── */

export type Livello = 'ok' | 'quasi' | 'pieno'

/** Oltre il 70% del limite si avvisa, oltre il 90% e' quasi finito. */
export function livelloDi(valore: number, limite: number): Livello {
  const quota = limite > 0 ? valore / limite : 0
  return quota >= 0.9 ? 'pieno' : quota >= 0.7 ? 'quasi' : 'ok'
}

const PAROLE_LIVELLO: Record<Livello, string | null> = { ok: null, quasi: 'Quasi al limite', pieno: 'Al limite' }

/**
 * Un valore contro il suo limite: la barra si riempie nel blu dei grafici, e
 * si fa arancione e poi rossa avvicinandosi al limite, con la parola e
 * l'icona accanto (il colore da solo non basta). Il binario vuoto e' lo stesso
 * colore, piu' tenue, cosi' la barra intera dice a che punto si e'.
 */
export function Misura({
  etichetta,
  valore,
  limite,
  formato = numero,
  sotto,
}: {
  etichetta: string
  valore: number
  limite: number
  formato?: Formato
  /** Una riga sotto la barra, al posto della percentuale. */
  sotto?: ReactNode
}) {
  const livello = livelloDi(valore, limite)
  const quota = limite > 0 ? Math.min(1, valore / limite) : 0
  const parola = PAROLE_LIVELLO[livello]
  const id = useId()
  return (
    <div className={`adm-misura is-${livello}`}>
      <div className="adm-misura__testa">
        <span className="adm-misura__nome" id={id}>
          {etichetta}
        </span>
        <span className="adm-misura__valore">
          <strong>{formato(valore)}</strong> di {formato(limite)}
        </span>
      </div>
      <div
        className="adm-misura__binario"
        role="meter"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={limite}
        aria-valuenow={Math.min(valore, limite)}
        aria-valuetext={`${formato(valore)} di ${formato(limite)}, ${percento(valore, limite)}`}
      >
        <span className="adm-misura__pieno" style={{ width: valore > 0 ? `max(4px, ${quota * 100}%)` : 0 }} />
      </div>
      <div className="adm-misura__piede">
        {parola && (
          <span className="adm-misura__avviso">
            <IconaAvviso size={14} />
            {parola}
          </span>
        )}
        <span className="adm-misura__quota">{sotto ?? percento(valore, limite)}</span>
      </div>
    </div>
  )
}

/* ─────────────────────────  La linea dentro una cifra  ───────────────────────── */

/**
 * Trenta giorni in una riga, dentro la carta di una cifra: grigia, e il
 * pallino di oggi nel blu. Dice l'andamento, non i numeri, che stanno nel
 * grafico grande.
 */
export function Andamento({ valori }: { valori: number[] }) {
  if (valori.length < 2) return null
  const max = Math.max(1, ...valori)
  const w = 100
  const h = 28
  const x = (i: number) => (i / (valori.length - 1)) * w
  const y = (v: number) => h - 3 - (v / max) * (h - 6)
  const d = valori.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join('')
  const ultimo = valori[valori.length - 1]
  return (
    <svg className="adm-andamento" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} className="adm-andamento__linea" vectorEffect="non-scaling-stroke" />
      <circle
        cx={x(valori.length - 1)}
        cy={y(ultimo)}
        r={1}
        className="adm-andamento__oggi"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/* ─────────────────────────  Le barre di traverso  ───────────────────────── */

/**
 * Una barra per riga, con le parti impilate: le partite di oggi per gioco,
 * finite e in corso. Il nome a sinistra, i numeri a destra, la barra in mezzo
 * sulla stessa scala per tutte le righe.
 */
export function BarreOrizzontali({
  serie,
  righe,
  titolo,
}: {
  titolo: string
  serie: SerieGrafico[]
  righe: Array<{ chiave: string; nome: ReactNode; testo: string; valori: number[]; dopo?: ReactNode }>
}) {
  const massimo = Math.max(1, ...righe.map((r) => r.valori.reduce((s, v) => s + v, 0)))
  return (
    <div className="adm-barre">
      <Legenda serie={serie} />
      <ul className="adm-barre__righe" aria-label={titolo}>
        {righe.map((r) => {
          const totale = r.valori.reduce((s, v) => s + v, 0)
          return (
            <li
              key={r.chiave}
              className="adm-barre__riga"
              aria-label={`${r.testo}: ${serie.map((s, k) => `${s.nome} ${numero(r.valori[k] ?? 0)}`).join(', ')}`}
            >
              <span className="adm-barre__nome" aria-hidden="true">
                {r.nome}
              </span>
              <span className="adm-barre__binario" aria-hidden="true">
                <span className="adm-barre__pieno" style={{ width: `${(totale / massimo) * 100}%` }}>
                  {r.valori.map((v, k) =>
                    v > 0 ? (
                      <span
                        key={k}
                        className="adm-barre__parte"
                        style={{ flexGrow: v, background: serie[k]?.colore } as CSSProperties}
                      />
                    ) : null,
                  )}
                </span>
              </span>
              <span className="adm-barre__dopo" aria-hidden="true">
                {r.dopo}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
