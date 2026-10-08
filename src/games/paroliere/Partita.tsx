import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@/components/Button'
import { Numero } from '@/components/Elementi'
import { suona } from '@/lib/suoni'
import { LETTERE } from '@shared/dawg'
import { DADI, DADI_IN_PIU, LETTERE_MINIME, ordinaParole, puntiParola, stradaDi } from '@shared/paroliere'
import type { EsitoParolaParoliere } from '@shared/types'
import { Clessidra } from './Clessidra'
import { Griglia, type StatoGriglia, type StradaEvidente, type TonoStrada } from './Griglia'
import './Paroliere.css'

/** La partita come la vede la scena: la classificata dal server, la libera dal telefono. */
export interface VistaParoliere {
  fase: 'nuova' | 'gioca' | 'finita'
  /** Le facce dei dadi, riga per riga: null finché la clessidra non si gira. */
  griglia: string[] | null
  lato: number
  /** Quando finisce il tempo, sull'orologio del telefono: null finché non parte. */
  scadenza: number | null
  tempoMs: number
  /** Le parole trovate, nell'ordine in cui sono arrivate. */
  trovate: string[]
  punteggio: number
  /** Il punteggio che vale il tetto: null dove non c'e' (la griglia grande della libera). */
  traguardo: number | null
  /** Le parole comuni della griglia: a partita finita. */
  comuni: string[] | null
}

/** Com'e' andata una parola: quel che dice il server, o la rete che non l'ha portata. */
export type EsitoParola = EsitoParolaParoliere | 'rete'

export interface EsitoProva {
  esito: EsitoParola
  valore: number
}

export interface ComandiParoliere {
  /** Gira la clessidra: arriva la griglia. false se non e' arrivata. */
  inizia: () => Promise<boolean>
  /** I dadi si sono fermati: nella libera il tempo parte adesso, nella classificata corre gia'. */
  parti: () => void
  prova: (parola: string) => Promise<EsitoProva>
  /** "Basta": la partita finisce prima del tempo. */
  basta: () => Promise<void>
  /** Il tempo e' finito sull'orologio del telefono. */
  scade: () => void
}

type Scena = 'chiusa' | 'scuote' | 'gioca' | 'tempo' | 'fine'

/** I dadi si scuotono almeno tanto, anche se la griglia arriva prima: e' il momento della scatola. */
const SCUOTI_MS = 1_100
/** I dadi che cadono al loro posto, uno dopo l'altro (`--i` nel CSS, 25 ms l'uno). */
const ASSESTA_MS = 750
/** La cupola che si alza dai dadi (`par-cupola-via` nel CSS). */
const CUPOLA_MS = 500
/** Quanto resta il timbro sul vassoio prima dei conti. */
const TIMBRO_MS = 1_700
/** Da quanti secondi il tempo si fa urgente, e da quanti si sente. */
const URGENTE_S = 20
const TIC_S = 5

/** Il tempo come sulla clessidra della scatola: minuti e secondi, arrotondati in su. */
function minuti(ms: number): string {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const ridotto = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const attendi = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

const FACCE = [...new Set([...DADI, ...DADI_IN_PIU].flat())]
const facceACaso = (n: number) => Array.from({ length: n }, () => FACCE[Math.floor(Math.random() * FACCE.length)])

/** Che cosa dice la riga della parola, dopo: le parole nuove dicono i loro punti. */
const MESSAGGI: Record<Exclude<EsitoParola, 'nuova'>, string> = {
  gia: 'Già trovata',
  corta: 'Almeno tre lettere',
  griglia: 'Non si scrive sulla griglia',
  sconosciuta: 'Non è nel dizionario',
  tempo: 'Tempo scaduto',
  rete: 'Non è arrivata: riprova',
}

const TONI: Record<EsitoParola | 'attesa', TonoStrada> = {
  attesa: 'attesa',
  nuova: 'giusta',
  gia: 'gia',
  corta: 'sbagliata',
  griglia: 'sbagliata',
  sconosciuta: 'sbagliata',
  tempo: 'sbagliata',
  rete: 'sbagliata',
}

interface Ultima {
  parola: string
  strada: number[]
  esito: EsitoParola | 'attesa'
  valore: number
  chiave: number
}

/** Il tempo che resta, aggiornato quattro volte al secondo finché corre. */
function useRestante(scadenza: number | null, tempoMs: number): number {
  const [adesso, setAdesso] = useState(() => Date.now())
  useEffect(() => {
    if (scadenza === null) return
    setAdesso(Date.now())
    const t = window.setInterval(() => setAdesso(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [scadenza])
  return scadenza === null ? tempoMs : Math.max(0, Math.min(tempoMs, scadenza - adesso))
}

/**
 * Una partita del Paroliere, la stessa per la classificata e per la libera.
 *
 * La scena va da sola: la scatola chiusa con i dadi coperti; la clessidra che
 * si gira e i dadi che si scuotono, con le facce che passano, e poi cadono al
 * loro posto uno dopo l'altro; la partita, con la sabbia che scende; il timbro
 * "Tempo!" sul vassoio; e i conti, con tutte le parole che c'erano. Ogni
 * parola tracciata si accende sui dadi del colore di com'e' andata — verde,
 * giallo se c'era gia', rosso se non esiste — e la riga sopra la griglia lo
 * dice: e' il posto dei messaggi, che non stanno mai sopra i dadi.
 */
export function PartitaParoliere({
  vista,
  comandi,
  fine,
  subito = false,
}: {
  vista: VistaParoliere
  comandi: ComandiParoliere
  /** Sotto i conti, a partita finita: i punti in classifica, i bottoni. */
  fine: ReactNode
  /** La clessidra si gira da sola: nella libera, dove si e' appena scelto di giocare. */
  subito?: boolean
}) {
  const [scena, setScena] = useState<Scena>(() =>
    vista.fase === 'nuova' ? 'chiusa' : vista.fase === 'gioca' ? 'gioca' : 'fine',
  )
  const [griglia, setGriglia] = useState<StatoGriglia>(() =>
    vista.fase === 'nuova' ? 'coperta' : vista.fase === 'gioca' ? 'assesta' : 'ferma',
  )
  const [finte, setFinte] = useState<string[] | null>(null)
  /** La cupola di plastica sopra i dadi: c'e' finché si scuotono, poi si alza. */
  const [cupola, setCupola] = useState<'su' | 'via' | null>(() => (vista.fase === 'nuova' ? 'su' : null))
  const [tracciata, setTracciata] = useState<number[]>([])
  const [digitata, setDigitata] = useState('')
  const [ultima, setUltima] = useState<Ultima | null>(null)
  const [mostrata, setMostrata] = useState<StradaEvidente | null>(null)
  const [punti, setPunti] = useState<{ chiave: number; valore: number }[]>([])
  const [conferma, setConferma] = useState(false)
  const [girata, setGirata] = useState(false)
  const [timbro, setTimbro] = useState<'Tempo!' | 'Basta!'>('Tempo!')
  const [timbroFinito, setTimbroFinito] = useState(false)
  const chiave = useRef(0)
  const inVolo = useRef(new Set<string>())
  const vistaRef = useRef(vista)
  vistaRef.current = vista

  const corrente = useRestante(vista.scadenza, vista.tempoMs)
  // Finita la partita la clessidra si ferma dov'era: con un "basta" a meta', resta la sabbia di quel momento.
  const fermo = useRef<number | null>(null)
  if (scena === 'gioca' && vista.scadenza !== null) fermo.current = corrente
  const restante = scena === 'tempo' || scena === 'fine' ? (fermo.current ?? 0) : corrente
  const secondi = Math.ceil(restante / 1000)
  const caselle = vista.lato * vista.lato

  /* ── La scatola: si gira la clessidra, i dadi si scuotono e cadono ── */

  const gira = useCallback(async () => {
    if (scena !== 'chiusa') return
    const piano = ridotto()
    setScena('scuote')
    setGriglia('scuote')
    suona('dadi')
    const inizio = performance.now()
    const ok = await comandi.inizia()
    if (!ok) {
      setScena('chiusa')
      setGriglia('coperta')
      return
    }
    await attendi(piano ? 0 : Math.max(0, SCUOTI_MS - (performance.now() - inizio)))
    setCupola('via')
    window.setTimeout(() => setCupola(null), piano ? 0 : CUPOLA_MS)
    setGriglia('assesta')
    await attendi(piano ? 0 : ASSESTA_MS)
    setGriglia('ferma')
    setGirata(true)
    suona('clessidra')
    comandi.parti()
    setScena('gioca')
  }, [scena, comandi])

  // Nella libera si e' gia' scelto di giocare: la scatola si apre da sola.
  const giaGirata = useRef(false)
  useEffect(() => {
    if (!subito || giaGirata.current || scena !== 'chiusa') return
    giaGirata.current = true
    void gira()
  }, [subito, scena, gira])

  // Le facce che passano mentre i dadi si scuotono.
  useEffect(() => {
    if (griglia !== 'scuote') return
    setFinte(facceACaso(caselle))
    const t = window.setInterval(() => setFinte(facceACaso(caselle)), 80)
    return () => window.clearInterval(t)
  }, [griglia, caselle])

  // Riaperta a partita in corso, la griglia cade al suo posto e basta.
  useEffect(() => {
    if (griglia !== 'assesta' || scena !== 'gioca') return
    const t = window.setTimeout(() => setGriglia('ferma'), ridotto() ? 0 : ASSESTA_MS)
    return () => window.clearTimeout(t)
  }, [griglia, scena])

  /* ── Il tempo ── */

  useEffect(() => {
    if (scena !== 'gioca' || vista.scadenza === null || restante > 0) return
    setTimbro('Tempo!')
    setScena('tempo')
    suona('scaduto')
    comandi.scade()
  }, [scena, vista.scadenza, restante, comandi])

  const ultimoTic = useRef<number | null>(null)
  useEffect(() => {
    if (scena !== 'gioca' || vista.scadenza === null || secondi > TIC_S || secondi <= 0) return
    if (ultimoTic.current === secondi) return
    ultimoTic.current = secondi
    suona('tic')
  }, [scena, vista.scadenza, secondi])

  // La partita chiusa altrove — il server allo scadere, o un "basta" — porta al timbro.
  useEffect(() => {
    if (vista.fase === 'finita' && scena === 'gioca') setScena('tempo')
  }, [vista.fase, scena])

  useEffect(() => {
    if (scena !== 'tempo') return
    setTimbroFinito(false)
    const t = window.setTimeout(() => setTimbroFinito(true), ridotto() ? 400 : TIMBRO_MS)
    return () => window.clearTimeout(t)
  }, [scena])

  useEffect(() => {
    if (scena === 'tempo' && timbroFinito && vista.fase === 'finita') setScena('fine')
  }, [scena, timbroFinito, vista.fase])

  /* ── Le parole ── */

  const invia = useCallback(
    async (parola: string, strada: number[]) => {
      const v = vistaRef.current
      if (v.fase !== 'gioca') return
      chiave.current += 1
      const c = chiave.current
      const mostra = (esito: Ultima['esito'], valore = 0) => {
        // Solo l'ultima parola si racconta nella riga: una risposta arrivata dopo non la copre.
        if (chiave.current === c) setUltima({ parola, strada, esito, valore, chiave: c })
      }
      if (parola.length < LETTERE_MINIME) {
        mostra('corta')
        suona('tocco', { volume: 0.6 })
        return
      }
      if (v.trovate.includes(parola) || inVolo.current.has(parola)) {
        mostra('gia')
        suona('tocco', { volume: 0.6 })
        return
      }
      mostra('attesa')
      inVolo.current.add(parola)
      let r: EsitoProva
      try {
        r = await comandi.prova(parola)
      } finally {
        inVolo.current.delete(parola)
      }
      mostra(r.esito, r.valore)
      if (r.esito === 'nuova') {
        suona(r.valore >= 5 ? 'parolona' : 'parola', { altezza: 1 + Math.min(6, parola.length - 3) * 0.06 })
        setPunti((p) => [...p.slice(-4), { chiave: c, valore: r.valore }])
      } else if (r.esito === 'gia') {
        suona('tocco', { volume: 0.6 })
      } else if (r.esito !== 'tempo') {
        suona('sbagliato', { volume: 0.5 })
      }
    },
    [comandi],
  )

  const parolaDi = useCallback(
    (strada: number[]) => strada.map((i) => vistaRef.current.griglia?.[i] ?? '').join(''),
    [],
  )

  const lunghezzaPrima = useRef(0)
  const cambia = useCallback((strada: number[]) => {
    setTracciata(strada)
    setDigitata('')
    if (strada.length > lunghezzaPrima.current) suona('tocco', { volume: 0.5 })
    lunghezzaPrima.current = strada.length
  }, [])

  const tracciataParola = useCallback((strada: number[]) => void invia(parolaDi(strada), strada), [invia, parolaDi])

  const digitataRef = useRef(digitata)
  digitataRef.current = digitata
  // Dal computer si scrive anche con la tastiera: la strada la cerca il gioco, e si accende come una tracciata.
  const stradaDigitata = useMemo(
    () => (digitata && vista.griglia ? stradaDi(vista.griglia, digitata) : null),
    [digitata, vista.griglia],
  )
  useEffect(() => {
    if (scena !== 'gioca') return
    const tasto = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const bersaglio = e.target as HTMLElement | null
      if (bersaglio?.closest('input, textarea, [contenteditable="true"]')) return
      const k = e.key.toLowerCase()
      if (k.length === 1 && LETTERE.includes(k)) {
        e.preventDefault()
        setDigitata((d) => (d.length < 17 ? d + k : d))
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        setDigitata((d) => d.slice(0, -1))
      } else if (e.key === 'Escape') {
        setDigitata('')
      } else if (e.key === 'Enter') {
        // Invio su un dado e' il suo tocco: qui solo la parola scritta.
        if (bersaglio?.closest('.par-dado') || !digitataRef.current) return
        e.preventDefault()
        const parola = digitataRef.current
        const strada = vistaRef.current.griglia ? stradaDi(vistaRef.current.griglia, parola) : null
        setDigitata('')
        if (strada) void invia(parola, strada)
        else {
          chiave.current += 1
          setUltima({ parola, strada: [], esito: 'griglia', valore: 0, chiave: chiave.current })
          suona('sbagliato', { volume: 0.5 })
        }
      }
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [scena, invia])

  /* ── Basta ── */

  useEffect(() => {
    if (!conferma) return
    const t = window.setTimeout(() => setConferma(false), 3_000)
    return () => window.clearTimeout(t)
  }, [conferma])

  const basta = () => {
    if (!conferma) return setConferma(true)
    setConferma(false)
    setTimbro('Basta!')
    setScena('tempo')
    suona('scaduto')
    void comandi.basta()
  }

  /* ── Quel che si vede ── */

  const facce =
    griglia === 'coperta'
      ? new Array<string>(caselle).fill('')
      : griglia === 'scuote'
        ? (finte ?? new Array<string>(caselle).fill(''))
        : (vista.griglia ?? new Array<string>(caselle).fill(''))

  const evidenzia: StradaEvidente | null =
    scena === 'fine'
      ? mostrata
      : ultima && ultima.strada.length > 0
        ? { strada: ultima.strada, tono: TONI[ultima.esito], chiave: ultima.chiave }
        : null

  const quota = vista.traguardo ? Math.min(1, vista.punteggio / vista.traguardo) : null
  const urgente = scena === 'gioca' && vista.scadenza !== null && secondi <= URGENTE_S

  return (
    <div className={`par is-${scena}${urgente ? ' is-urgente' : ''}`}>
      <div className="par-testa">
        <div className="par-tempo">
          <Clessidra
            restante={restante / vista.tempoMs}
            corre={scena === 'gioca' && vista.scadenza !== null}
            urgente={urgente}
            gira={girata}
          />
          <span className="par-tempo__valore u-tabnum" aria-label={`${secondi} secondi`}>
            {minuti(restante)}
          </span>
        </div>
        {/* Il numero conta fotogramma per fotogramma: lo annuncia gia' la riga della parola, con i suoi punti. */}
        <div className="par-punteggio">
          <span className="par-punteggio__valore">
            <Numero valore={vista.punteggio} durata={500} />
          </span>
          <span className="par-punteggio__etichetta">{vista.punteggio === 1 ? 'punto' : 'punti'}</span>
          {punti.map((p) => (
            <span
              key={p.chiave}
              className="par-punteggio__piu"
              onAnimationEnd={() => setPunti((q) => q.filter((x) => x.chiave !== p.chiave))}
            >
              +{p.valore}
            </span>
          ))}
        </div>
        <div className="par-conto">
          <span className="par-conto__valore u-tabnum">{vista.trovate.length}</span>
          <span className="par-conto__etichetta">{vista.trovate.length === 1 ? 'parola' : 'parole'}</span>
        </div>
      </div>

      {quota !== null && (
        <div className="par-traguardo" aria-label={`Traguardo: ${vista.traguardo} punti`}>
          <div className="par-traguardo__pista">
            <div
              className={`par-traguardo__barra${quota >= 1 ? ' is-pieno' : ''}`}
              style={{ '--quota': quota } as CSSProperties}
            />
          </div>
          <span className="par-traguardo__testo u-tabnum">
            {quota >= 1 ? 'Traguardo!' : `Traguardo ${vista.traguardo}`}
          </span>
        </div>
      )}

      {scena !== 'fine' && (
        <RigaParola
          tracciata={tracciata.length > 0 ? parolaDi(tracciata) : digitata}
          digitataSbagliata={digitata.length > 0 && tracciata.length === 0 && stradaDigitata === null}
          ultima={ultima}
          suggerimento={
            scena === 'chiusa'
              ? null
              : scena === 'gioca' && vista.trovate.length === 0 && !ultima
                ? 'Scorri sulle lettere vicine'
                : null
          }
        />
      )}

      <div className="par-vassoio">
        <Griglia
          facce={facce}
          lato={vista.lato}
          stato={griglia}
          attiva={scena === 'gioca'}
          evidenzia={evidenzia}
          digitata={tracciata.length === 0 ? stradaDigitata : null}
          onCambia={cambia}
          onParola={tracciataParola}
        />
        {cupola && (
          <div className={`par-cupola${cupola === 'via' ? ' is-via' : ''}`} aria-hidden="true">
            <span className="par-cupola__nome">Paroliere</span>
          </div>
        )}
        {scena === 'tempo' && (
          <div className="par-timbro" role="status">
            <span>{timbro}</span>
          </div>
        )}
      </div>

      {scena === 'chiusa' || scena === 'scuote' ? (
        <div className="par-via">
          <Button size="lg" fullWidth loading={scena === 'scuote'} onClick={() => void gira()}>
            Gira la clessidra
          </Button>
        </div>
      ) : scena === 'fine' ? (
        <Conti vista={vista} mostrata={mostrata} onMostra={setMostrata} fine={fine} />
      ) : (
        <>
          <Trovate trovate={vista.trovate} />
          <div className="par-piede">
            <button
              type="button"
              className={`par-basta${conferma ? ' is-conferma' : ''}`}
              onClick={basta}
              disabled={scena !== 'gioca'}
            >
              {conferma ? 'Tocca ancora per finire' : 'Basta'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** La riga sopra la griglia: la parola che si sta tracciando, o com'e' andata l'ultima. */
function RigaParola({
  tracciata,
  digitataSbagliata,
  ultima,
  suggerimento,
}: {
  tracciata: string
  digitataSbagliata: boolean
  ultima: Ultima | null
  suggerimento: string | null
}) {
  if (tracciata) {
    const lettere = tracciata.length
    return (
      <div className={`par-parola is-traccia${digitataSbagliata ? ' is-fuori' : ''}`}>
        <span className="par-parola__lettere">
          {[...tracciata.toUpperCase()].map((l, i) => (
            <span key={i} className="par-parola__lettera">
              {l}
            </span>
          ))}
        </span>
        {lettere >= LETTERE_MINIME && !digitataSbagliata && (
          <span className="par-parola__valore u-tabnum">+{puntiParola(lettere)}</span>
        )}
      </div>
    )
  }
  if (ultima) {
    const tono = TONI[ultima.esito]
    return (
      <div key={ultima.chiave} className={`par-parola is-esito is-${tono}`} role="status">
        <span className="par-parola__testo">{ultima.parola.toUpperCase()}</span>
        <span className="par-parola__messaggio">
          {ultima.esito === 'attesa' ? '' : ultima.esito === 'nuova' ? `+${ultima.valore}` : MESSAGGI[ultima.esito]}
        </span>
      </div>
    )
  }
  return (
    <div className="par-parola is-vuota">
      <span className="par-parola__suggerimento">{suggerimento ?? ''}</span>
    </div>
  )
}

/** Le parole trovate durante la partita, dall'ultima: la nuova entra con un salto. */
function Trovate({ trovate }: { trovate: string[] }) {
  // Quelle che c'erano gia' aprendo la pagina non saltano.
  const viste = useRef(new Set(trovate))
  return (
    <ul className="par-trovate" aria-label="Parole trovate">
      {[...trovate].reverse().map((p) => {
        const nuova = !viste.current.has(p)
        return (
          <li key={p} className={`par-trovata${nuova ? ' is-nuova' : ''}${puntiParola(p.length) >= 5 ? ' is-lunga' : ''}`}>
            {p.toUpperCase()}
            <span className="par-trovata__punti">{puntiParola(p.length)}</span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * I conti a partita finita: il punteggio, il traguardo, e le parole — le mie,
 * e tutte quelle comuni che la griglia aveva, con quelle trovate accese.
 * Toccandone una si accende la sua strada sui dadi.
 */
function Conti({
  vista,
  mostrata,
  onMostra,
  fine,
}: {
  vista: VistaParoliere
  mostrata: StradaEvidente | null
  onMostra: (s: StradaEvidente | null) => void
  fine: ReactNode
}) {
  const trovate = useMemo(() => new Set(vista.trovate), [vista.trovate])
  const comuni = vista.comuni ?? []
  const prese = comuni.filter((p) => trovate.has(p)).length
  // Le mie parole che non sono fra le comuni: rare, ma valgono lo stesso.
  const rare = ordinaParole(vista.trovate.filter((p) => !comuni.includes(p)))
  const mostra = (p: string) => {
    const strada = vista.griglia ? stradaDi(vista.griglia, p) : null
    if (!strada) return
    onMostra(mostrata && mostrata.strada.join() === strada.join() ? null : { strada, tono: 'mostra', chiave: Date.now() })
    suona('tocco', { volume: 0.5 })
  }
  const parola = (p: string, presa: boolean) => (
    <li key={p}>
      <button
        type="button"
        className={`par-voce${presa ? ' is-presa' : ''}`}
        onClick={() => mostra(p)}
        aria-label={`${p}, ${puntiParola(p.length)} ${puntiParola(p.length) === 1 ? 'punto' : 'punti'}${presa ? ', trovata' : ''}`}
      >
        {p.toUpperCase()}
        <span className="par-voce__punti">{puntiParola(p.length)}</span>
      </button>
    </li>
  )
  return (
    <div className="par-conti">
      <div className="par-esito">{fine}</div>
      {rare.length > 0 && (
        <section className="par-elenco">
          <h2 className="par-elenco__titolo">Le tue parole rare</h2>
          <ul className="par-voci">{rare.map((p) => parola(p, true))}</ul>
        </section>
      )}
      {comuni.length > 0 && (
        <section className="par-elenco">
          <h2 className="par-elenco__titolo">
            Le parole della griglia{' '}
            <span className="u-tabnum">
              · {prese} su {comuni.length}
            </span>
          </h2>
          <ul className="par-voci">{comuni.map((p) => parola(p, trovate.has(p)))}</ul>
        </section>
      )}
    </div>
  )
}
