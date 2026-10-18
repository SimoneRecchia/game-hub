import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Coriandoli } from '@/components/Elementi'
import { suona } from '@/lib/suoni'
import { DURATA_DIRETTA_MS, PALLINE_MS, presiDi } from '@shared/superenalotto'
import type { PremioEnalotto } from '@shared/superenalotto'
import type { SchedaEnalotto } from '@shared/types'
import { Pallina } from './Pallina'
import { ORDINALI, inLettere } from './palline'
import {
  APERTURA_MS,
  ARRIVO_MS,
  ATTESA_MS,
  RIEPILOGO_MS,
  RISUCCHIO_MS,
  SOFFIO,
  ULTIMI_SECONDI,
  arrivata,
  inEstrazione,
  inVetrina,
} from './tempi'
import { Urna } from './urna'
import './Diretta.css'

/** Quanto resta acceso un numero appena preso su una scheda, prima di diventare un numero preso come gli altri. */
const APPENA_MS = 1800

const minuti = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Quanto sta sotto il bordo di sopra della diretta un elemento, contando i genitori posizionati. */
function sopraDi(el: HTMLElement, radice: HTMLElement): number {
  let y = 0
  let e: HTMLElement | null = el
  while (e && e !== radice) {
    y += e.offsetTop
    e = e.offsetParent as HTMLElement | null
  }
  return y
}

/**
 * La diretta dell'estrazione, a pieno schermo: l'urna in 3D (`Urna`) e sopra
 * la grafica di una diretta televisiva — il conto alla rovescia, il titolo,
 * il sottopancia dell'attesa e quello di ogni pallina quando arriva al suo
 * posto, il tabellone dei quattro posti, le schede di chi guarda che si
 * accendono numero per numero, e alla fine la combinazione e com'e' andata.
 * Il tempo e' quello della diretta (`inizio`, sull'orologio del telefono
 * rimesso su quello del server): chi arriva a meta' la trova a meta'. La
 * replica e' la stessa diretta, con l'orologio che parte quando la si apre.
 *
 * Le scritte coprono una parte dello schermo, in alto e in basso: la diretta
 * misura quanto e lo dice all'urna (`inquadratura`), che mette la sua regia
 * nel mezzo che resta. Lo screen reader sente una riga per momento, dalla
 * regione `annunci`, e non le scritte che cambiano dieci volte al secondo.
 */
export default function Diretta({
  data,
  inizio,
  estratti,
  mie,
  premi,
  replica,
  onChiudi,
}: {
  data: string
  /** L'inizio della diretta, in `Date.now()` del telefono. */
  inizio: number
  /** I numeri, nell'ordine: null finché la diretta non comincia. */
  estratti: number[] | null
  mie: SchedaEnalotto[]
  /** I premi, quando sono pagati. */
  premi: PremioEnalotto[] | null
  replica: boolean
  onChiudi: () => void
}) {
  const radice = useRef<HTMLDivElement>(null)
  const tela = useRef<HTMLCanvasElement>(null)
  const testa = useRef<HTMLElement>(null)
  const piede = useRef<HTMLElement>(null)
  const scheda = useRef<HTMLDivElement | null>(null)
  const osserva = useRef<ResizeObserver | null>(null)
  const urna = useRef<Urna | null>(null)
  const [t, setT] = useState(() => Date.now() - inizio)
  const [senza3d, setSenza3d] = useState(false)
  const tempo = useRef(() => Date.now() - inizio)
  useEffect(() => {
    tempo.current = () => Date.now() - inizio
  }, [inizio])

  // Quanto coprono le scritte: la testata sopra, il piede sotto, e il riepilogo quando c'e'.
  const misura = useCallback(() => {
    const u = urna.current
    const r = radice.current
    if (!u || !r) return
    const alto = r.clientHeight
    const sopra = testa.current ? sopraDi(testa.current, r) + testa.current.offsetHeight : 0
    let sotto = piede.current ? alto - sopraDi(piede.current, r) : 0
    if (scheda.current) sotto = Math.max(sotto, alto - sopraDi(scheda.current, r))
    u.inquadratura(sopra, sotto)
  }, [])

  useEffect(() => {
    const canvas = tela.current
    if (!canvas) return
    let u: Urna
    try {
      u = new Urna(canvas, () => tempo.current())
    } catch {
      setSenza3d(true)
      return
    }
    urna.current = u
    const ridimensiona = () => {
      u.ridimensiona(canvas.clientWidth, canvas.clientHeight)
      misura()
    }
    ridimensiona()
    const o = new ResizeObserver(ridimensiona)
    o.observe(canvas)
    if (testa.current) o.observe(testa.current)
    if (piede.current) o.observe(piede.current)
    if (scheda.current) o.observe(scheda.current)
    osserva.current = o
    u.avvia()
    return () => {
      o.disconnect()
      osserva.current = null
      u.distruggi()
      urna.current = null
    }
  }, [misura])

  // Il riepilogo arriva e se ne va da solo: quando c'e', la regia gli lascia il suo spazio.
  const conScheda = useCallback(
    (el: HTMLDivElement | null) => {
      if (scheda.current && osserva.current) osserva.current.unobserve(scheda.current)
      scheda.current = el
      if (el && osserva.current) osserva.current.observe(el)
      misura()
    },
    [misura],
  )

  useEffect(() => {
    urna.current?.imposta(estratti)
  }, [estratti, senza3d])

  // Il tempo per quel che si legge: dieci volte al secondo bastano, l'urna ha il suo.
  useEffect(() => {
    const id = window.setInterval(() => setT(Date.now() - inizio), 100)
    return () => window.clearInterval(id)
  }, [inizio])

  // Una finestra di dialogo prende il fuoco quando si apre: lei, non il bottone, che si accenderebbe senza motivo.
  useEffect(() => {
    radice.current?.focus({ preventScroll: true })
  }, [])

  const tuo = (i: number) => estratti !== null && mie.some((s) => s.numeri.includes(estratti[i]))
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

  // Esc chiude, come un foglio.
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => e.key === 'Escape' && onChiudi()
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [onChiudi])

  const usciti = estratti ? estratti.filter((_, i) => arrivata(t, i)) : []
  const inCorso = estratti ? inEstrazione(t) : -1
  const vetrina = estratti ? inVetrina(t) : -1
  const riepilogo = t >= RIEPILOGO_MS && estratti !== null
  const vinto = premi && mie.reduce((s, x) => s + (x.vincita ?? 0), 0)
  const quando = new Date(`${data}T12:00:00Z`).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
  const esito =
    mie.length === 0
      ? 'Non avevi schede per questa estrazione.'
      : migliore >= 2
        ? `Hai fatto ${migliore}!`
        : 'Niente per te, stavolta.'

  // Quel che sente lo screen reader: una riga per momento.
  const annuncio = riepilogo
    ? `La combinazione vincente: ${[...estratti].sort((a, b) => a - b).join(', ')}. ${esito}`
    : vetrina >= 0 && estratti
      ? `${ORDINALI[vetrina]} estratto: ${estratti[vetrina]}${tuo(vetrina) ? '. È tuo!' : ''}`
      : t >= 0 && t < APERTURA_MS
        ? 'Comincia l’estrazione.'
        : ''

  return createPortal(
    <div
      ref={radice}
      className="se-diretta"
      role="dialog"
      aria-modal="true"
      aria-label={`Estrazione di ${quando}`}
      tabIndex={-1}
    >
      {senza3d && <div className="se-diretta__fasci" aria-hidden="true" />}
      <canvas className="se-diretta__tela" ref={tela} aria-hidden="true" />
      {senza3d && <div className="se-diretta__urna2d" aria-hidden="true" />}
      <div className="se-diretta__velo" aria-hidden="true" />
      {estratti &&
        PALLINE_MS.map((t0, i) => (
          <Lampo key={i} attivo={t >= t0 + RISUCCHIO_MS && t < t0 + RISUCCHIO_MS + 500} />
        ))}

      <header className="se-diretta__testa" ref={testa}>
        <button type="button" className="se-diretta__chiudi" onClick={onChiudi} aria-label="Chiudi la diretta">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className="se-diretta__marchio">
          <span className="se-diretta__logo">
            Super<b>Enalotto</b>
          </span>
          <span className="se-diretta__data">{quando}</span>
        </div>
        <span className={`se-diretta__bollino${replica ? ' is-replica' : ''}`}>
          {replica ? 'Replica' : 'In diretta'}
        </span>
      </header>

      <div className="se-diretta__centro">
        {t < 0 && <ContoAllaRovescia ms={-t} quando={quando} />}
        {t >= 0 && t < APERTURA_MS && <Titolo data={data} />}
        {inCorso >= 0 && (
          <div className="se-diretta__terzo se-diretta__prossima" key={`p${inCorso}`} aria-hidden="true">
            <span className="se-diretta__tacche">
              {PALLINE_MS.map((_, i) => (
                <span key={i} className={i < inCorso ? 'is-fatta' : i === inCorso ? 'is-ora' : ''} />
              ))}
            </span>
            <span>
              Si estrae il <b>{ORDINALI[inCorso].toLowerCase()} numero</b>
            </span>
          </div>
        )}
        {vetrina >= 0 && estratti && (
          <Annuncio key={`a${vetrina}`} i={vetrina} n={estratti[vetrina]} mio={tuo(vetrina)} />
        )}
        {riepilogo && (
          <div className="se-diretta__riepilogo" ref={conScheda}>
            <span className="se-diretta__occhiello">La combinazione vincente</span>
            <span className="se-diretta__combinazione">
              {[...estratti].sort((a, b) => a - b).map((n, k) => (
                <span key={n} className="se-diretta__vincente" style={{ '--n': k } as CSSProperties}>
                  <Pallina n={n} />
                </span>
              ))}
            </span>
            <p className={`se-diretta__esito${migliore >= 2 ? ' is-vinto' : ''}`}>{esito}</p>
            {mie.length > 0 && migliore >= 2 && (
              <p className="se-diretta__premio">
                {vinto !== null && vinto !== undefined
                  ? vinto > 0
                    ? `Hai vinto ${vinto} ${vinto === 1 ? 'punto' : 'punti'}`
                    : 'Il premio, diviso fra tanti, è di zero punti'
                  : t < DURATA_DIRETTA_MS
                    ? 'I premi fra un attimo…'
                    : 'Conto i premi…'}
              </p>
            )}
            <button type="button" className="se-diretta__fine" onClick={onChiudi}>
              {premi ? 'Vedi i premi' : 'Chiudi'}
            </button>
          </div>
        )}
      </div>

      <footer className="se-diretta__piede" ref={piede}>
        <ol className="se-diretta__estratti" aria-label="Numeri estratti">
          {PALLINE_MS.map((_, i) => {
            const n = usciti[i]
            const classi = `se-diretta__posto${n !== undefined ? ' is-acceso' : ''}${inCorso === i ? ' is-attesa' : ''}`
            return (
              <li key={i} className={classi}>
                {n !== undefined ? (
                  <Pallina n={n} piccola />
                ) : (
                  <span className="se-diretta__vuoto">
                    <span className="u-visually-hidden">Non ancora estratto</span>
                  </span>
                )}
                <span className="se-diretta__ordine" aria-hidden="true">
                  {i + 1}°
                </span>
              </li>
            )
          })}
        </ol>
        {mie.length > 0 && (
          <ul className="se-diretta__mie" aria-label="Le tue schede">
            {mie.map((s) => {
              const presi = s.numeri.filter((n) => usciti.includes(n)).length
              return (
                <li key={s.id} className={`se-diretta__scheda${presi >= 2 ? ' is-vince' : ''}`}>
                  {s.numeri.map((n) => {
                    const k = estratti ? estratti.indexOf(n) : -1
                    const preso = usciti.includes(n)
                    const appena = preso && t < PALLINE_MS[k] + ARRIVO_MS + APPENA_MS
                    const classi = `se-diretta__numero u-tabnum${preso ? ' is-preso' : ''}${appena ? ' is-appena' : ''}`
                    return (
                      <span key={n} className={classi}>
                        {n}
                      </span>
                    )
                  })}
                  <span className="se-diretta__conto u-tabnum">
                    {presi >= 2 ? <b>{presi}</b> : presi}/4
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </footer>
      <p className="u-visually-hidden" aria-live="polite">
        {annuncio}
      </p>
      {riepilogo && vinto !== null && vinto > 0 && <Coriandoli />}
    </div>,
    document.body,
  )
}

/** Prima dell'inizio: quando si comincia, e negli ultimi secondi il conto a voce, uno alla volta. */
function ContoAllaRovescia({ ms, quando }: { ms: number; quando: string }) {
  const secondi = Math.ceil(ms / 1000)
  const ultimi = secondi <= ULTIMI_SECONDI
  return (
    <div className="se-diretta__attesa">
      <span className="se-diretta__occhiello">Estrazione di {quando}</span>
      {ultimi ? (
        <strong className="se-diretta__tre u-tabnum" key={secondi} aria-hidden="true">
          {secondi}
        </strong>
      ) : (
        <strong className="se-diretta__orologio u-tabnum" aria-hidden="true">
          {minuti(ms)}
        </strong>
      )}
      <span className="se-diretta__fra">{ultimi ? 'Si comincia' : 'Si comincia fra poco'}</span>
    </div>
  )
}

/** Il titolo d'apertura: il giorno, e la data grande in oro, con la luce che ci passa sopra e il filo che si apre. */
function Titolo({ data }: { data: string }) {
  const giorno = new Date(`${data}T12:00:00Z`).toLocaleDateString('it-IT', { weekday: 'long', timeZone: 'UTC' })
  const breve = new Date(`${data}T12:00:00Z`).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
  return (
    <div className="se-diretta__titolo">
      <span className="se-diretta__occhiello">L’estrazione del SuperEnalotto</span>
      <span className="se-diretta__giorno">{giorno}</span>
      <strong className="se-diretta__dorato">
        {breve}
        <span className="se-diretta__luccichio" aria-hidden="true">
          <span>{breve}</span>
        </span>
      </strong>
      <span className="se-diretta__filo" aria-hidden="true" />
    </div>
  )
}

/**
 * Il sottopancia di una pallina appena arrivata: la pallina, quale estratto
 * e', il numero grande e in lettere, come lo direbbe chi conduce. Se e' un
 * numero di chi guarda, diventa d'oro e lo dice.
 */
function Annuncio({ i, n, mio }: { i: number; n: number; mio: boolean }) {
  return (
    <div className={`se-diretta__terzo se-diretta__annuncio${mio ? ' is-tuo' : ''}`} aria-hidden="true">
      <span className="se-diretta__pallina">
        <Pallina n={n} />
      </span>
      <span className="se-diretta__dice">
        <span className="se-diretta__ordinale">{ORDINALI[i]} estratto</span>
        <span className="se-diretta__numerone">
          <strong className="u-tabnum">{n}</strong>
          <span className="se-diretta__lettere">{inLettere(n)}</span>
        </span>
      </span>
      {mio && <span className="se-diretta__tuo">È tuo!</span>}
    </div>
  )
}

/** Il lampo di quando la pallina entra nel tubo: un velo di luce su tutto lo schermo, un attimo. */
function Lampo({ attivo }: { attivo: boolean }) {
  return attivo ? <div className="se-diretta__lampo" aria-hidden="true" /> : null
}
