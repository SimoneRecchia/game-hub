import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { suona } from '@/lib/suoni'
import { PALLINE_MS, presiDi } from '@shared/superenalotto'
import type { PremioEnalotto } from '@shared/superenalotto'
import type { SchedaEnalotto } from '@shared/types'
import { Pallina } from './Pallina'
import { ORDINALI, inLettere } from './palline'
import {
  BOCCA,
  MISTE,
  LATO_PALLINA_MISTA,
  PALCO,
  POSTI_X,
  RAGGIO_PALLINA,
  ROTAIA,
  SFERA,
  SULLA_ROTAIA,
  tracciatoTubo,
  viaggioDi,
} from './studio'
import {
  ARRIVO_MS,
  ATTESA_MS,
  CONGEDO_MS,
  RIEPILOGO_MS,
  RISUCCHIO_MS,
  SOFFIO,
  ULTIMI_SECONDI,
  arrivata,
  momentoDi,
} from './tempi'
import './Diretta.css'

/** Dopo che i premi sono arrivati, quanto resta in studio il riepilogo prima di passare ai risultati. */
const DOPO_I_PREMI_MS = 1500

const minuti = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function useMovimentoRidotto(): boolean {
  const [ridotto, setRidotto] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const m = matchMedia('(prefers-reduced-motion: reduce)')
    const cambia = () => setRidotto(m.matches)
    m.addEventListener('change', cambia)
    return () => m.removeEventListener('change', cambia)
  }, [])
  return ridotto
}

/**
 * La diretta dell'estrazione, dentro la pagina come nel mockup: sotto la testa
 * e il tabellone, lo studio disegnato piatto — i fasci di luce, la parete di
 * lampadine, il bollino della diretta e il titolo d'oro, la sfera di vetro con
 * le palline che si mescolano, la bocca, il tubo e la rotaia con i quattro
 * posti — e sotto le schede di chi guarda, che si accendono numero per numero.
 *
 * Tutto e' una funzione del tempo della diretta (`inizio`, sull'orologio del
 * telefono rimesso su quello del server): chi arriva a meta' la trova a meta',
 * con la pallina gia' a meta' del tubo, e la replica e' la stessa diretta con
 * l'orologio che parte quando la si apre. Lo studio e' un palco di 390 per 590
 * punti (`studio.ts`), scalato sullo spazio che la pagina gli lascia.
 *
 * Finito il riepilogo, e arrivati i premi, la diretta lascia il posto ai
 * risultati della pagina (`onChiudi(true)`). Lo screen reader sente una riga
 * per momento, dalla sua regione, e non le scritte che cambiano.
 */
export default function Diretta({
  data,
  numero,
  inizio,
  estratti,
  mie,
  premi,
  replica,
  onChiudi,
}: {
  data: string
  /** Il numero del concorso, per il titolo. */
  numero: number
  /** L'inizio della diretta, in `Date.now()` del telefono. */
  inizio: number
  /** I numeri, nell'ordine: null finché la diretta non comincia. */
  estratti: number[] | null
  mie: SchedaEnalotto[]
  /** I premi, quando sono pagati. */
  premi: PremioEnalotto[] | null
  replica: boolean
  /** `finita`: la diretta e' arrivata in fondo da sola, e non la si e' lasciata a meta'. */
  onChiudi: (finita: boolean) => void
}) {
  const ridotto = useMovimentoRidotto()
  const [t, setT] = useState(() => Date.now() - inizio)
  const ora = useRef(() => Date.now() - inizio)
  useEffect(() => {
    ora.current = () => Date.now() - inizio
  }, [inizio])

  // Il tempo per quel che si vede: dieci volte al secondo bastano, i viaggi delle palline hanno il loro.
  useEffect(() => {
    const id = window.setInterval(() => setT(Date.now() - inizio), 100)
    return () => window.clearInterval(id)
  }, [inizio])

  // Il palco si scala sullo spazio che c'e', in larghezza e in altezza; misurato prima del primo disegno.
  const scena = useRef<HTMLDivElement>(null)
  const [scala, setScala] = useState(1)
  useLayoutEffect(() => {
    const el = scena.current
    if (!el) return
    const misura = () => {
      const k = Math.min(el.clientWidth / PALCO.largo, el.clientHeight / PALCO.alto)
      if (k > 0) setScala(k)
    }
    misura()
    const o = new ResizeObserver(misura)
    o.observe(el)
    return () => o.disconnect()
  }, [])

  const mieNumeri = new Set(mie.flatMap((s) => s.numeri))
  const tuo = (i: number) => estratti !== null && mieNumeri.has(estratti[i])
  const migliore = estratti ? Math.max(0, ...mie.map((s) => presiDi(s.numeri, estratti))) : 0

  // I suoni della diretta, ognuno una volta, al suo momento; chi arriva tardi non sente quelli gia' passati.
  const suonati = useRef(new Set<string>())
  const prima = useRef(t)
  useEffect(() => {
    const da = prima.current
    prima.current = t
    const passa = (chiave: string, quando: number, fai: () => void) => {
      if (suonati.current.has(chiave) || t < quando) return
      suonati.current.add(chiave)
      if (da <= quando + 400) fai()
    }
    for (let n = ULTIMI_SECONDI; n >= 1; n -= 1) passa(`tic${n}`, -n * 1000, () => suona('tic'))
    passa('via', 0, () => suona('sigla'))
    for (let x = SOFFIO.da; x < SOFFIO.a - 1500; x += 3800) {
      passa(`urna${x}`, x, () => suona('urna', { altezza: 4 }))
    }
    if (!estratti) return
    PALLINE_MS.forEach((t0, i) => {
      passa(`tamburo${i}`, t0 - ATTESA_MS, () => suona('tamburo', { altezza: ATTESA_MS / 1000 }))
      passa(`estratto${i}`, t0, () => suona('estratto'))
      passa(`arrivo${i}`, t0 + ARRIVO_MS, () => suona(tuo(i) ? 'tuo' : 'svelato', { altezza: 1 + i * 0.06 }))
    })
    passa('fine', RIEPILOGO_MS, () => suona(migliore >= 2 ? 'vincita' : 'pareggio'))
    // `tuo` e `migliore` vengono da `estratti` e `mie`, che sono gia' qui.
  }, [t, estratti, mie])

  // Finito il riepilogo, con i premi pagati, si passa ai risultati: i premi della replica si sanno gia'.
  const pagatiDa = useRef<number | null>(null)
  if (premi && pagatiDa.current === null) pagatiDa.current = replica ? -Infinity : t
  const congedo = useRef(false)
  useEffect(() => {
    if (congedo.current || !estratti || pagatiDa.current === null) return
    if (t >= RIEPILOGO_MS + CONGEDO_MS && t >= pagatiDa.current + DOPO_I_PREMI_MS) {
      congedo.current = true
      onChiudi(true)
    }
  }, [t, estratti, premi, onChiudi])

  const momento = momentoDi(t)
  const usciti = estratti ? estratti.filter((_, i) => arrivata(t, i)) : []
  const mescola = t >= SOFFIO.da && t < SOFFIO.a && !ridotto
  const vinto = premi && mie.reduce((s, x) => s + (x.vincita ?? 0), 0)
  const quando = new Date(`${data}T12:00:00Z`).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
  const esito =
    mie.length === 0 ? 'Non avevi schede' : migliore >= 2 ? `Hai fatto ${migliore}!` : 'Niente per te, stavolta'
  const premio =
    mie.length === 0 || migliore < 2
      ? null
      : vinto !== null && vinto !== undefined
        ? vinto > 0
          ? `Hai vinto ${vinto} ${vinto === 1 ? 'punto' : 'punti'}`
          : 'Il premio, diviso fra tanti, è di zero punti'
        : 'I premi fra un attimo…'

  // Quel che sente lo screen reader: una riga per momento.
  const annuncio =
    momento.tipo === 'riepilogo' && estratti
      ? `La combinazione vincente: ${[...estratti].sort((a, b) => a - b).join(', ')}. ${esito}.${premio ? ` ${premio}.` : ''}`
      : momento.tipo === 'annuncio' && estratti
        ? `${ORDINALI[momento.pallina]} estratto: ${estratti[momento.pallina]}${tuo(momento.pallina) ? '. È sulla tua schedina!' : ''}`
        : momento.tipo === 'attesa'
          ? `Si estrae il ${ORDINALI[momento.pallina].toLowerCase()} numero.`
          : momento.tipo === 'apertura'
            ? 'Comincia l’estrazione.'
            : ''

  const bocca = estratti && PALLINE_MS.some((t0) => t >= t0 - ATTESA_MS && t < t0 + RISUCCHIO_MS)

  return (
    <section className={`se-studio${ridotto ? ' is-ridotto' : ''}`} aria-label={`L’estrazione di ${quando}`}>
      <span className="se-studio__fascio is-a" aria-hidden="true" />
      <span className="se-studio__fascio is-b" aria-hidden="true" />
      <span className="se-studio__parete" aria-hidden="true" />

      <div className="se-studio__scena" ref={scena}>
        <div
          className="se-studio__palco"
          style={{ '--k': scala, width: PALCO.largo, height: PALCO.alto } as CSSProperties}
          aria-hidden="true"
        >
          <span className={`se-studio__bollino${replica ? ' is-replica' : ''}`}>
            <span className="se-studio__punto" />
            {replica ? 'Replica' : 'Diretta'}
          </span>
          <span className="se-studio__oro">Estrazione n° {numero}</span>

          <svg className="se-studio__tubo" viewBox={`0 0 ${PALCO.largo} ${PALCO.alto}`}>
            <path className="se-studio__vetro" d={tracciatoTubo()} />
            <path className="se-studio__luce" d={tracciatoTubo(8)} />
            <rect
              className="se-studio__rotaia"
              x={ROTAIA.da}
              y={ROTAIA.y}
              width={ROTAIA.a - ROTAIA.da}
              height={ROTAIA.alta}
              rx={ROTAIA.alta / 2}
            />
          </svg>

          <div
            className={`se-studio__sfera${mescola ? ' is-mescola' : ''}`}
            style={{ left: SFERA.x, top: SFERA.y, width: SFERA.lato, height: SFERA.lato }}
          >
            {MISTE.map((p, i) => (
              <span
                key={i}
                className="se-studio__mista"
                style={
                  {
                    left: p.x - LATO_PALLINA_MISTA / 2,
                    top: p.y - LATO_PALLINA_MISTA / 2,
                    '--fx': `${p.fermaX - p.x}px`,
                    '--fy': `${p.fermaY - p.y}px`,
                    '--ritardo': `${(i % 8) * 40}ms`,
                  } as CSSProperties
                }
              >
                <span className={`se-studio__gira is-giro-${i % 3}`} style={{ animationDelay: `${-((i * 0.37) % 2.4)}s` }}>
                  <Pallina n={p.n} lato={LATO_PALLINA_MISTA} />
                </span>
              </span>
            ))}
            <span className="se-studio__riflesso" />
          </div>
          {/* Dopo la sfera: il piedistallo ne copre il fondo, come una coppa che la regge. */}
          <span
            className="se-studio__piedistallo"
            style={{ left: SFERA.x + 55, top: SFERA.y + SFERA.lato - 8 }}
          />
          <span
            className={`se-studio__bocca${bocca ? ' is-accesa' : ''}`}
            style={{ left: BOCCA.x - BOCCA.lato / 2, top: BOCCA.y - BOCCA.lato / 2 }}
          />
          {estratti &&
            !ridotto &&
            PALLINE_MS.map((t0, i) =>
              t >= t0 + RISUCCHIO_MS - 60 && t < t0 + RISUCCHIO_MS + 600 ? (
                <span key={i} className="se-studio__lampo" style={{ left: BOCCA.x - 40, top: BOCCA.y - 40 }} />
              ) : null,
            )}

          {POSTI_X.map((x, i) => (
            <span key={i} className="se-studio__posto" style={{ left: x - 26, top: ROTAIA.y + ROTAIA.alta + 6 }}>
              {i + 1}°
            </span>
          ))}
          {estratti &&
            PALLINE_MS.map((t0, i) =>
              (ridotto ? arrivata(t, i) : t >= t0) ? (
                <Uscente key={i} i={i} n={estratti[i]} mia={tuo(i)} t0={t0} ora={ora} ridotto={ridotto} />
              ) : null,
            )}

          {momento.tipo === 'conto' && <ContoAllaRovescia ms={-t} />}
          {momento.tipo === 'apertura' && (
            <div className="se-studio__apertura">
              <span className="se-studio__giorno">{quando}</span>
              <strong className="se-studio__titolo">Estrazione n° {numero}</strong>
            </div>
          )}

          {momento.tipo === 'attesa' && (
            <div className="se-studio__terzo is-attesa" key={`a${momento.pallina}`}>
              <span className="se-studio__forse">?</span>
              <span className="se-studio__testi">
                <span className="se-studio__ord">Si estrae il</span>
                <span className="se-studio__num">{ORDINALI[momento.pallina].toLowerCase()} numero</span>
              </span>
              <span className="se-studio__tacche">
                {PALLINE_MS.map((_, i) => (
                  <span key={i} className={i < momento.pallina ? 'is-fatta' : i === momento.pallina ? 'is-ora' : ''} />
                ))}
              </span>
            </div>
          )}
          {momento.tipo === 'annuncio' && estratti && (
            <Sottopancia
              key={`s${momento.pallina}`}
              i={momento.pallina}
              n={estratti[momento.pallina]}
              mio={tuo(momento.pallina)}
            />
          )}
          {momento.tipo === 'riepilogo' && estratti && (
            <div className={`se-studio__terzo is-fine${migliore >= 2 ? ' is-oro' : ''}`}>
              <span className="se-studio__testi">
                <span className="se-studio__ord">La combinazione</span>
                <span className="se-studio__num">{esito}</span>
                {premio && <span className="se-studio__mio">{premio}</span>}
              </span>
              <span className="se-studio__combinazione">
                {[...estratti].sort((a, b) => a - b).map((n) => (
                  <Pallina key={n} n={n} lato={30} />
                ))}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="se-studio__piede">
        {mie.length > 0 && (
          <ol className="se-studio__schede" aria-label="Le tue schede">
            {mie.map((s, k) => {
              const presi = s.numeri.filter((n) => usciti.includes(n)).length
              return (
                <li
                  key={s.id}
                  className={`se-studio__foglio${presi >= 2 ? ' is-vince' : ''}`}
                  style={{ '--giro': `${[-3, 2, -2, 3, -1][k]}deg` } as CSSProperties}
                  aria-label={`Scheda ${k + 1}: ${presi} su ${s.numeri.length > 4 ? 5 : 4} usciti`}
                >
                  <span className="se-studio__presi u-tabnum" aria-hidden="true">
                    {presi}/4
                  </span>
                  <span className="se-studio__mano" aria-hidden="true">
                    {s.numeri.map((n) => (
                      <span key={n} className={usciti.includes(n) ? 'is-preso' : undefined}>
                        {String(n).padStart(2, '0')}
                      </span>
                    ))}
                  </span>
                </li>
              )
            })}
            {mie.length < 5 &&
              Array.from({ length: 5 - mie.length }, (_, k) => (
                <li key={`v${k}`} className="se-studio__foglio is-vuoto" aria-hidden="true" />
              ))}
          </ol>
        )}
        <button type="button" className="se-studio__salta" onClick={() => onChiudi(false)}>
          {premi ? 'Vai ai risultati' : 'Esci dalla diretta'}
        </button>
      </div>
      <p className="u-visually-hidden" aria-live="polite">
        {annuncio}
      </p>
    </section>
  )
}

/**
 * Una pallina estratta: dalla bocca lungo il tubo e sulla rotaia, fino al suo
 * posto. Il viaggio e' un'animazione sola, fatta con i tappe di `viaggioDi` e
 * cominciata da dove la diretta e' arrivata: chi apre a meta' la trova a meta'
 * del tubo. Arrivata, sta ferma al suo posto, ed e' cosi' anche senza
 * movimento, dove compare quando arriva.
 */
function Uscente({
  i,
  n,
  mia,
  t0,
  ora,
  ridotto,
}: {
  i: number
  n: number
  mia: boolean
  t0: number
  ora: { current: () => number }
  ridotto: boolean
}) {
  const el = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const nodo = el.current
    const passato = ora.current() - t0
    if (!nodo || ridotto || passato >= ARRIVO_MS || typeof nodo.animate !== 'function') return
    const a = nodo.animate(
      viaggioDi(i).map((k) => ({
        offset: k.offset,
        easing: k.easing,
        opacity: k.opacita,
        transform: `translate(${k.x - RAGGIO_PALLINA}px, ${k.y - RAGGIO_PALLINA}px) rotate(${k.giro}deg) scale(${k.scala})`,
      })),
      { duration: ARRIVO_MS, delay: -Math.max(0, passato), fill: 'backwards' },
    )
    return () => a.cancel()
    // Il viaggio comincia una volta, quando la pallina compare.
  }, [])
  return (
    <span
      ref={el}
      className="se-studio__uscente"
      style={{ transform: `translate(${POSTI_X[i] - RAGGIO_PALLINA}px, ${SULLA_ROTAIA - RAGGIO_PALLINA}px)` }}
    >
      <Pallina n={n} lato={RAGGIO_PALLINA * 2} mia={mia} />
    </span>
  )
}

/** Prima dell'inizio: quando si comincia, e negli ultimi secondi il conto grande, uno alla volta. */
function ContoAllaRovescia({ ms }: { ms: number }) {
  const secondi = Math.ceil(ms / 1000)
  if (secondi <= ULTIMI_SECONDI) {
    return (
      <strong className="se-studio__tre u-tabnum" key={secondi}>
        {secondi}
      </strong>
    )
  }
  return (
    <div className="se-studio__attesa">
      <span className="se-studio__fra">Si comincia fra</span>
      <strong className="se-studio__orologio u-tabnum">{minuti(ms)}</strong>
    </div>
  )
}

/**
 * Il sottopancia di una pallina appena arrivata: la pallina, quale estratto
 * e', il numero e in lettere, come lo direbbe chi conduce. Se e' un numero di
 * chi guarda diventa d'oro, e lo dice.
 */
function Sottopancia({ i, n, mio }: { i: number; n: number; mio: boolean }) {
  return (
    <div className={`se-studio__terzo is-annuncio${mio ? ' is-oro' : ''}`}>
      <Pallina n={n} lato={56} />
      <span className="se-studio__testi">
        <span className="se-studio__ord">{ORDINALI[i]} estratto</span>
        <span className="se-studio__num">
          <span className="u-tabnum">{n}</span> · {inLettere(n)}
        </span>
        {mio && <span className="se-studio__mio">È sulla tua schedina!</span>}
      </span>
    </div>
  )
}
