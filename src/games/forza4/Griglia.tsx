import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as EventoPuntatore,
} from 'react'
import { suona } from '@/lib/suoni'
import { COLONNE, RIGHE, file, leggi, rigaDiArrivo, type Disco } from '@shared/forza4'
import type { MotivoTavoliere } from '@shared/tavolo'
import type { PropsTavoliere } from '@/games/tavolo/tipi'
import './Griglia.css'

/** La fascia sopra la griglia, dove la mano tiene il disco, e il piede sotto, in caselle: Griglia.css li segue. */
export const FASCIA = 0.9
export const PIEDE = 0.45

/** Quanto ci mette la mano a portarsi sopra un'altra colonna. */
export const SCIVOLA_MS = 170
/** In che punto della caduta il disco tocca il fondo la prima volta: il resto sono i rimbalzi. */
export const IMPATTO = 0.6
/** Fra un disco della fila che si accende e quello dopo. */
export const PASSO_FILA_MS = 120
/** Dal colpo dell'ultimo disco a quando la fila comincia ad accendersi. */
const PRIMA_DELLA_FILA_MS = 90
/** Quanto dura la griglia che si svuota a una partita nuova. */
const SVUOTA_MS = 900

/**
 * Quanto dura la caduta fino alla riga `riga`, rimbalzi compresi. Il disco
 * parte dalla mano, nella fascia, e scende come un sasso: il tempo cresce con
 * la radice della distanza.
 */
export function durataCaduta(riga: number): number {
  const distanza = RIGHE - 1 - riga + 0.5 + FASCIA / 2
  return Math.round((70 + 100 * Math.sqrt(distanza)) / IMPATTO)
}

/**
 * Quanto aspetta la fine dopo l'ultima mossa, prima dell'adesivo: la mano che
 * scivola, il disco che cade e la fila che si accende. La fila parte
 * dall'ultimo disco verso i due capi, e da una parte ne ha al piu' tre: con
 * quattro in fila prima, la partita sarebbe gia' finita.
 */
export function attesaFine(motivo: MotivoTavoliere): number {
  const colpo = SCIVOLA_MS + durataCaduta(0) * IMPATTO
  if (motivo === 'forza4') return Math.round(colpo + PRIMA_DELLA_FILA_MS + 4 * PASSO_FILA_MS + 200)
  if (motivo === 'pieno') return Math.round(colpo + 350)
  return 450
}

/** Un disco visto arrivare: quando parte, quanto cade, e quando tocca il fondo. */
interface Arrivo {
  /** La mano che si porta sopra la colonna, prima di lasciarlo. */
  attesa: number
  caduta: number
  /** Da quando e' arrivato, il primo colpo sul fondo. */
  colpo: number
  /** `performance.now()` di quando e' arrivato. */
  nato: number
}

const ridotto = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Il centro di una casella nel disegno della cornice, settanta per sessanta: le righe contano dal fondo. */
function centro(k: number): { x: number; y: number } {
  return { x: 5 + (k % COLONNE) * 10, y: 55 - Math.floor(k / COLONNE) * 10 }
}

const RAGGIO_FORO = 4
const FORI = Array.from({ length: COLONNE * RIGHE }, (_, k) => centro(k))

/** La cornice, con gli angoli in alto arrotondati e un foro per casella: con `evenodd` ogni cerchio e' un vuoto. */
const FACCIA =
  'M2 0H68A2 2 0 0 1 70 2V60H0V2A2 2 0 0 1 2 0Z' +
  FORI.map(
    ({ x, y }) =>
      `M${x - RAGGIO_FORO} ${y}a${RAGGIO_FORO} ${RAGGIO_FORO} 0 1 0 ${2 * RAGGIO_FORO} 0` +
      `a${RAGGIO_FORO} ${RAGGIO_FORO} 0 1 0 ${-2 * RAGGIO_FORO} 0z`,
  ).join('')

const colore = (d: Disco) => (d === 0 ? 'rosso' : 'giallo')

/**
 * La griglia del Forza 4, come il gioco vero: la cornice di plastica sul suo
 * piede, e i dischi che cadono dietro, visti dai fori — la cornice e' un
 * tracciato con i buchi sopra lo strato dei dischi.
 *
 * Chi deve giocare ha il suo disco in mano, nella fascia in cima: io lo porto
 * sopra una colonna con il dito o con il mouse, e lo lascio; quello dell'altro
 * va avanti e indietro mentre ci pensa. Il disco scivola sopra la colonna,
 * cade, schiaccia, rimbalza, e la griglia sobbalza. A partita finita la fila
 * si accende dall'ultimo disco verso i capi, e a una partita nuova i dischi
 * escono dal fondo, come quando si tira la stecca.
 */
export function Griglia({ posizione, mia, attivo, ultima, n, finita, onMossa }: PropsTavoliere) {
  const p = useMemo(() => leggi(posizione), [posizione])
  const id = useId().replace(/[^\w-]/g, '')
  const [mira, setMira] = useState<number | null>(null)
  const [riposo, setRiposo] = useState(3)
  const [pensa, setPensa] = useState(3)
  const [uscenti, setUscenti] = useState<{ caselle: readonly (Disco | null)[]; chiave: number } | null>(null)
  const colonne = useRef<HTMLDivElement>(null)
  const premuto = useRef(false)
  const miraRef = useRef(mira)
  miraRef.current = mira

  // Quel che c'era all'ultimo disegno: le caselle, quante mosse, e dove stavano le due mani e da quando.
  const visto = useRef<{ caselle: readonly (Disco | null)[] | null; n: number }>({ caselle: null, n })
  const mani = useRef<{ col: [number, number]; mossa: [number, number] }>({ col: [3, 3], mossa: [0, 0] })
  const arrivi = useRef(new Map<number, Arrivo>())

  // Meno mosse di prima: una partita nuova nello stesso posto (la rivincita, "gioca ancora"), o una mossa
  // che il server non ha preso. Niente di quel che e' arrivato prima; la griglia si svuota solo nel primo caso.
  const indietro = !!visto.current.caselle && n < visto.current.n
  if (indietro) arrivi.current = new Map()
  const ricomincia = indietro && n === 0
  // I dischi nuovi cadono solo se li ho visti arrivare: riaprendo la partita sono gia' al loro posto.
  const prima = visto.current.caselle
  if (p && prima && n > visto.current.n) {
    const adesso = performance.now()
    const fermo = ridotto()
    p.caselle.forEach((d, k) => {
      if (d === null || prima[k] !== null || arrivi.current.has(k)) return
      const c = k % COLONNE
      // La mano di chi l'ha giocato scivola sopra la colonna, se non c'era gia', e poi lo lascia.
      const daQuanto = adesso - mani.current.mossa[d]
      const attesa = fermo ? 0 : mani.current.col[d] === c ? Math.max(0, Math.round(SCIVOLA_MS - daQuanto)) : SCIVOLA_MS
      const caduta = fermo ? 0 : durataCaduta(Math.floor(k / COLONNE))
      arrivi.current.set(k, { attesa, caduta, colpo: Math.round(attesa + caduta * IMPATTO), nato: adesso })
    })
  }

  const colonnaUltima = ultima !== null ? Number(ultima) : null
  const kUltima = useMemo(() => {
    if (!p || colonnaUltima === null) return null
    for (let r = RIGHE - 1; r >= 0; r -= 1) {
      if (p.caselle[r * COLONNE + colonnaUltima] !== null) return r * COLONNE + colonnaUltima
    }
    return null
  }, [p, colonnaUltima])
  const arrivo = kUltima !== null ? (arrivi.current.get(kUltima) ?? null) : null

  // La fila vincente, o le file: ogni disco ha il suo passo dall'ultimo giocato, che le accende.
  const vittoria = useMemo(() => {
    if (!p || !finita) return null
    const trovate = file(p)
    if (trovate.length === 0) return null
    const passi = new Map<number, number>()
    const tratti: { da: number; a: number; passi: number }[] = []
    for (const fila of trovate) {
      const origine = kUltima !== null && fila.includes(kUltima) ? fila.indexOf(kUltima) : 0
      fila.forEach((k, i) => passi.set(k, Math.min(Math.abs(i - origine), passi.get(k) ?? Infinity)))
      for (const capo of [0, fila.length - 1]) {
        if (capo !== origine) tratti.push({ da: fila[origine], a: fila[capo], passi: Math.abs(capo - origine) })
      }
    }
    return { disco: p.caselle[trovate[0][0]] as Disco, passi, tratti }
  }, [p, finita, kUltima])

  const tratto: Disco = p?.tratto ?? 0
  const giocando = !!p && !finita
  const miaVista = attivo ? mira : null
  const colMano = ([0, 1] as const).map((d) => {
    if (giocando && tratto === d) return d === mia ? (miaVista ?? riposo) : pensa
    // Chi ha appena giocato tiene la mano sopra la sua colonna, finche' il disco non parte.
    if (kUltima !== null && colonnaUltima !== null && p?.caselle[kUltima] === d) return colonnaUltima
    return d === mia ? riposo : pensa
  }) as [number, number]

  // Dopo ogni disegno: dove sono le mani adesso, e quel che si vede, per la prossima mossa.
  useLayoutEffect(() => {
    const adesso = performance.now()
    for (const d of [0, 1] as const) {
      if (mani.current.col[d] !== colMano[d]) {
        mani.current.col[d] = colMano[d]
        mani.current.mossa[d] = adesso
      }
    }
  })
  useLayoutEffect(() => {
    if (!p) return
    const stava = visto.current
    if (stava.caselle && n === 0 && stava.n > 0 && stava.caselle.some((d) => d !== null) && !ridotto()) {
      setUscenti({ caselle: stava.caselle, chiave: stava.n })
    }
    visto.current = { caselle: p.caselle, n }
  }, [p, n])

  // La griglia che si svuota: il suono della stecca, e poi via i dischi di prima.
  useEffect(() => {
    if (!uscenti) return
    suona('svuota', { volume: 0.8 })
    const t = window.setTimeout(() => setUscenti(null), SVUOTA_MS)
    return () => window.clearTimeout(t)
  }, [uscenti])

  // Il colpo quando il disco arriva in fondo, non quando parte: il mio un po' piu' forte.
  useEffect(() => {
    if (!arrivo || kUltima === null || !p) return
    const mio = p.caselle[kUltima] === mia
    const resta = arrivo.colpo - (performance.now() - arrivo.nato)
    const t = window.setTimeout(() => suona('disco', { volume: mio ? 0.95 : 0.75 }), Math.max(0, resta))
    return () => window.clearTimeout(t)
    // Una volta per mossa: quel che legge cambia con lei.
  }, [n])

  // L'inizio della fila: dal colpo dell'ultimo disco, o subito se la partita era gia' finita.
  const fila = arrivo ? arrivo.colpo + PRIMA_DELLA_FILA_MS : 0
  const subito = finita && !arrivo
  useEffect(() => {
    if (!vittoria || subito) return
    const t = window.setTimeout(() => suona(vittoria.disco === mia ? 'quattro' : 'quattroAltro'), fila)
    return () => window.clearTimeout(t)
    // Una volta per fila: l'inizio e chi ha vinto vengono con lei.
  }, [vittoria])

  // L'altro ci pensa: la sua mano va avanti e indietro sopra le colonne libere, senza fretta.
  const pensaAdesso = giocando && tratto !== mia
  useEffect(() => {
    if (!pensaAdesso || !p || ridotto()) return
    let t = 0
    const passo = () => {
      setPensa((c) => {
        const vicine = [c - 1, c + 1, c - 2, c + 2].filter((x) => x >= 0 && x < COLONNE && rigaDiArrivo(p, x) !== null)
        return vicine.length > 0 ? vicine[Math.floor(Math.random() * vicine.length)] : c
      })
      t = window.setTimeout(passo, 850 + Math.random() * 650)
    }
    t = window.setTimeout(passo, 650 + Math.random() * 450)
    return () => window.clearTimeout(t)
  }, [pensaAdesso, p])

  if (!p) return null
  const mio = colore(mia)

  /** La colonna sotto il dito, o null se il dito e' uscito di lato oltre mezza colonna. */
  const colonnaDa = (x: number): number | null => {
    const r = colonne.current?.getBoundingClientRect()
    if (!r || r.width === 0) return null
    const lato = r.width / COLONNE
    if (x < r.left - lato / 2 || x > r.right + lato / 2) return null
    return Math.min(COLONNE - 1, Math.max(0, Math.floor((x - r.left) / lato)))
  }
  const gioca = (c: number) => {
    if (!attivo || rigaDiArrivo(p, c) === null) return
    setRiposo(c)
    onMossa(String(c))
  }
  const giu = (e: EventoPuntatore<HTMLDivElement>) => {
    if (!attivo || (e.pointerType === 'mouse' && e.button !== 0)) return
    const c = colonnaDa(e.clientX)
    if (c === null) return
    premuto.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setMira(c)
  }
  const muove = (e: EventoPuntatore<HTMLDivElement>) => {
    if (!attivo || (!premuto.current && e.pointerType !== 'mouse')) return
    const c = colonnaDa(e.clientX)
    if (c === null || c === miraRef.current) return
    if (premuto.current) suona('tocco', { volume: 0.25 })
    setMira(c)
  }
  const su = (e: EventoPuntatore<HTMLDivElement>) => {
    if (!premuto.current) return
    premuto.current = false
    const r = colonne.current?.getBoundingClientRect()
    // Lasciato lontano dalla griglia, sopra o sotto: ci ha ripensato.
    const fuori = !r || e.clientY < r.top - 48 || e.clientY > r.bottom + 48
    const c = fuori ? null : colonnaDa(e.clientX)
    if (e.pointerType !== 'mouse') setMira(null)
    if (c !== null) gioca(c)
  }
  const annulla = () => {
    premuto.current = false
    setMira(null)
  }

  // La griglia si svuota da quando si vede la partita nuova: il primo disegno lo sa dal confronto, i dopo dallo stato.
  const svuota = !!uscenti || (ricomincia && !!prima?.some((d) => d !== null) && !ridotto())
  // Dove cadrebbe il disco della mira: un anello nel foro, e la colonna che si accende.
  const metaRiga = miaVista !== null ? rigaDiArrivo(p, miaVista) : null
  // La mira si vede quando il disco dell'altro ha toccato il fondo, non mentre cade nella stessa colonna.
  const dopoMira =
    arrivo && kUltima !== null && p.caselle[kUltima] !== mia
      ? Math.max(0, Math.round(arrivo.colpo + 60 - (performance.now() - arrivo.nato)))
      : 0

  const mano = (d: Disco): CSSProperties => {
    const qui = giocando && tratto === d
    // Quella che arriva aspetta il colpo del disco di prima, o la griglia che si svuota;
    // quella che lascia il disco, la scivolata.
    const dopo = qui ? (arrivo ? arrivo.colpo + 60 : svuota ? SVUOTA_MS * 0.7 : 0) : arrivo ? arrivo.attesa : 0
    return { '--col': colMano[d], '--dopo': `${dopo}ms` } as CSSProperties
  }

  // La patta e' la griglia piena: una partita finita per resa o per il tempo non scuote la testa.
  const patta = finita && !vittoria && p.caselle.every((d) => d !== null)
  const classi = [
    'f4',
    `f4--${mio}`,
    attivo && 'is-attiva',
    (vittoria || patta) && 'is-spenta',
    vittoria && (vittoria.disco === mia ? 'is-vinta' : 'is-persa'),
    patta && 'is-patta',
    subito && 'is-subito',
    svuota && 'is-svuota',
  ]
    .filter(Boolean)
    .join(' ')
  const ultimoPasso = vittoria ? Math.max(...vittoria.passi.values()) : 0

  return (
    <div
      className={classi}
      style={
        {
          '--scivola': `${SCIVOLA_MS}ms`,
          '--fila': `${fila}ms`,
          '--passo-fila': `${PASSO_FILA_MS}ms`,
          '--fine-fila': `${fila + (ultimoPasso + 1) * PASSO_FILA_MS}ms`,
          '--dopo-mira': `${dopoMira}ms`,
        } as CSSProperties
      }
    >
      <div className="f4__fascia" aria-hidden="true">
        {([0, 1] as const).map((d) => (
          <span
            key={d}
            className={`f4__mano is-${colore(d)}${giocando && tratto === d ? ' is-qui' : ''}${
              d !== mia && pensaAdesso ? ' is-pensa' : ''
            }`}
            style={mano(d)}
          />
        ))}
      </div>
      <div
        className={`f4__corpo${arrivo ? ` is-scossa-${n % 2}` : ''}`}
        style={arrivo ? ({ '--scossa': `${arrivo.colpo}ms` } as CSSProperties) : undefined}
      >
        <div className="f4__griglia">
          {miaVista !== null && <span className="f4__luce" style={{ '--c': miaVista } as CSSProperties} />}
          <div className="f4__dischi">
            {p.caselle.map((disco, k) => {
              if (disco === null) return null
              const a = arrivi.current.get(k)
              const passo = vittoria?.passi.get(k)
              const stile = {
                '--c': k % COLONNE,
                '--r': Math.floor(k / COLONNE),
                ...(a && { '--attesa': `${a.attesa}ms`, '--caduta': `${a.caduta}ms`, '--colpo': `${a.colpo}ms` }),
                ...(passo !== undefined && { '--passo': passo }),
              } as CSSProperties
              return (
                <span
                  key={k}
                  className={`f4__disco is-${colore(disco)}${a ? ' is-cade' : ''}${k === kUltima ? ' is-ultimo' : ''}${
                    passo !== undefined ? ' is-quattro' : ''
                  }`}
                  style={stile}
                />
              )
            })}
            {miaVista !== null && metaRiga !== null && (
              <span className="f4__meta" style={{ '--c': miaVista, '--r': metaRiga } as CSSProperties} />
            )}
          </div>
          {uscenti && (
            <div key={uscenti.chiave} className="f4__uscenti" aria-hidden="true">
              {uscenti.caselle.map((disco, k) =>
                disco === null ? null : (
                  <span
                    key={k}
                    className={`f4__disco is-${colore(disco)} is-esce`}
                    style={{ '--c': k % COLONNE, '--r': Math.floor(k / COLONNE) } as CSSProperties}
                  />
                ),
              )}
            </div>
          )}
          <svg className="f4__cornice" viewBox="0 0 70 60" aria-hidden="true">
            <defs>
              <linearGradient id={`${id}-faccia`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" className="f4__plastica-alta" />
                <stop offset="0.5" className="f4__plastica" />
                <stop offset="1" className="f4__plastica-bassa" />
              </linearGradient>
              <linearGradient id={`${id}-foro`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#000" stopOpacity="0.34" />
                <stop offset="0.5" stopColor="#000" stopOpacity="0.04" />
                <stop offset="1" stopColor="#fff" stopOpacity="0.42" />
              </linearGradient>
            </defs>
            <path d={FACCIA} fillRule="evenodd" fill={`url(#${id}-faccia)`} className="f4__faccia" />
            <g fill="none" stroke={`url(#${id}-foro)`} strokeWidth="0.75">
              {FORI.map(({ x, y }, k) => (
                <circle key={k} cx={x} cy={y} r={RAGGIO_FORO + 0.38} />
              ))}
            </g>
            <path d="M2.4 0.45H67.6" className="f4__riflesso" />
          </svg>
          {vittoria && (
            <svg className="f4__file" viewBox="0 0 70 60" aria-hidden="true">
              {[...vittoria.passi.entries()].map(([k, passo]) => {
                const { x, y } = centro(k)
                return (
                  <circle
                    key={k}
                    className="f4__anello"
                    cx={x}
                    cy={y}
                    r={RAGGIO_FORO + 0.3}
                    style={{ '--passo': passo } as CSSProperties}
                  />
                )
              })}
              {vittoria.tratti.map((t, i) => {
                const da = centro(t.da)
                const a = centro(t.a)
                return (
                  <g key={i} style={{ '--passi': t.passi } as CSSProperties}>
                    <line className="f4__alone" x1={da.x} y1={da.y} x2={a.x} y2={a.y} pathLength={1} />
                    <line className="f4__tratto" x1={da.x} y1={da.y} x2={a.x} y2={a.y} pathLength={1} />
                  </g>
                )
              })}
            </svg>
          )}
          {vittoria?.disco === mia && <span className="f4__lampo" aria-hidden="true" />}
        </div>
        <svg className="f4__piede" viewBox={`0 0 70 ${PIEDE * 10}`} aria-hidden="true">
          <rect className="f4__barra" x="6" y="0" width="58" height="1.5" rx="0.75" />
          <path className="f4__gamba" d="M0.4 0H6.4L7.4 4.5H0Z" />
          <path className="f4__gamba" d="M63.6 0H69.6L70 4.5H62.6Z" />
        </svg>
      </div>
      <div
        ref={colonne}
        className="f4__colonne"
        role="group"
        aria-label="Le colonne"
        onPointerDown={giu}
        onPointerMove={muove}
        onPointerUp={su}
        onPointerCancel={annulla}
        onPointerLeave={(e) => {
          if (!premuto.current && e.pointerType === 'mouse') setMira(null)
        }}
      >
        {Array.from({ length: COLONNE }, (_, c) => {
          const piena = rigaDiArrivo(p, c) === null
          return (
            <button
              key={c}
              type="button"
              className="f4__colonna"
              aria-label={`Colonna ${c + 1}${piena ? ', piena' : ''}`}
              disabled={!attivo || piena}
              onFocus={() => setMira(c)}
              onBlur={() => setMira((m) => (m === c ? null : m))}
              // Il dito e il mouse giocano dalla griglia, che sa dove sono; il clic qui e' della tastiera.
              onClick={(e) => {
                if (e.detail === 0) gioca(c)
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
