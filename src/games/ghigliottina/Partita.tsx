import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/Button'
import { suona } from '@/lib/suoni'
import { normalizzaGhigliottina } from '@shared/ghigliottina'
import type { CoppiaGhigliottinaVista } from '@shared/types'
import { Lama, type PosizioneLama } from './Lama'
import './Ghigliottina.css'

/** Quel che serve alla scena, dalla classificata (il server) o dalla libera (il telefono). */
export interface VistaGhigliottina {
  coppie: CoppiaGhigliottinaVista[]
  totaleCoppie: number
  corrente: number | null
  montepremiIniziale: number
  montepremi: number
  finaleAperto: boolean
  /** Quando finisce il minuto, sull'orologio del telefono. */
  scadenza: number | null
  tempoFinaleMs: number
  soluzione: string | null
  risposta: string | null
  indovinata: boolean | null
  finita: boolean
  punti: number
}

export interface ComandiGhigliottina {
  /** La scelta della coppia di adesso: torna la vista dopo la scelta, o null se non e' andata. */
  scegli: (scelta: 0 | 1) => Promise<VistaGhigliottina | null>
  /** Fa partire il minuto della parola vincente. */
  apriFinale: () => Promise<VistaGhigliottina | null>
  rispondi: (parola: string) => Promise<VistaGhigliottina | null>
  /** Il minuto e' finito sul telefono senza una risposta. */
  scade: () => void
}

/**
 * I momenti della partita, come in studio: l'entrata, una coppia da
 * scegliere, l'attesa col rullo di tamburo, l'esito (la lama, se e' sbagliata),
 * le cinque parole che si accendono, il minuto, la busta, il verdetto, la fine.
 */
type Fase = 'intro' | 'coppia' | 'attesa' | 'esito' | 'cinque' | 'finale' | 'busta' | 'verdetto' | 'fine'

const ridotto = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** I tempi della scena, in millisecondi; senza animazioni bastano pochi istanti. */
function tempi() {
  const r = ridotto()
  return {
    /** Il rullo di tamburo fra la scelta e l'esito. */
    attesa: r ? 200 : 1400,
    /** La parola giusta che si accende, e vola nella colonna. */
    giusta: r ? 300 : 1100,
    /** La lama che cala, il montepremi tagliato, e la lama che risale. */
    sbagliata: r ? 500 : 2300,
    /** Le cinque parole che si accendono una dopo l'altra, prima del minuto. */
    cinque: r ? 300 : 2600,
    /** La busta che arriva e si apre. */
    busta: r ? 300 : 2700,
    /** Le lettere della parola vincente che si girano, prima della fine. */
    verdetto: r ? 600 : 3400,
  }
}

const aspetta = (ms: number) => new Promise<void>((risolvi) => window.setTimeout(risolvi, ms))

/** La fase da cui riprende una partita riaperta. */
function faseDi(v: VistaGhigliottina): Fase {
  if (v.finita) return 'fine'
  if (v.finaleAperto) return 'finale'
  if (v.corrente === null) return 'cinque'
  return v.coppie.some((c) => c.scelta !== null) ? 'coppia' : 'intro'
}

/**
 * La Ghigliottina in scena: la lama sopra il montepremi, la coppia di parole,
 * la colonna delle cinque parole giuste. La scena va un passo dietro allo
 * stato vero (`vista`): la scelta va subito al server, ma si vede com'e' andata
 * solo dopo il rullo di tamburo, e la coppia dopo solo quando la parola giusta
 * e' volata al suo posto.
 */
export function PartitaGhigliottina({
  vista,
  comandi,
  fine,
}: {
  vista: VistaGhigliottina
  comandi: ComandiGhigliottina
  fine: ReactNode
}) {
  const [mostrata, setMostrata] = useState(vista)
  const [fase, setFase] = useState<Fase>(() => faseDi(vista))
  const [scelta, setScelta] = useState<0 | 1 | null>(null)
  const [lama, setLama] = useState<PosizioneLama>(vista.finita && vista.indovinata === false ? 'giu' : 'alta')
  const [colpi, setColpi] = useState(0)
  /** Il montepremi tagliato: il valore di prima, che si spacca, e il numero del colpo, che fa ripartire l'animazione. */
  const [taglio, setTaglio] = useState<{ prima: number; n: number; tutto: boolean } | null>(null)
  /** La coppia appena scelta, con l'esito, mentre la parola giusta vola nella colonna. */
  const [esito, setEsito] = useState<{ coppia: CoppiaGhigliottinaVista; indice: number } | null>(null)
  const montata = useRef(true)
  useEffect(
    () => () => {
      montata.current = false
    },
    [],
  )

  // Il minuto finito: il server ha chiuso la partita, e la vista arriva finita.
  useEffect(() => {
    if (fase === 'finale' && vista.finita) {
      setMostrata(vista)
      setFase('verdetto')
      setLama('giu')
      setTaglio({ prima: mostrata.montepremi, n: Date.now(), tutto: true })
      suona('lama')
      suona('sconfitta', { ritardo: 0.5 })
    }
  }, [fase, vista, mostrata.montepremi])

  // Le cinque parole si accendono, poi parte il minuto.
  useEffect(() => {
    if (fase !== 'cinque') return
    let fermo = false
    const t = tempi()
    for (let i = 0; i < 5; i += 1) suona('sale', { ritardo: 0.25 + i * 0.28, altezza: 1 + i * 0.12 })
    void (async () => {
      await aspetta(t.cinque)
      if (fermo || !montata.current) return
      const dopo = await comandi.apriFinale()
      if (fermo || !montata.current || !dopo) return
      setMostrata(dopo)
      setFase(dopo.finita ? 'fine' : 'finale')
      suona('via')
    })()
    return () => {
      fermo = true
    }
  }, [fase, comandi])

  // Il verdetto: le lettere si girano, e poi la fine con le spiegazioni.
  useEffect(() => {
    if (fase !== 'verdetto') return
    const timer = window.setTimeout(() => setFase('fine'), tempi().verdetto)
    return () => window.clearTimeout(timer)
  }, [fase])

  const k = mostrata.corrente
  const coppia = k !== null ? mostrata.coppie[k] : null

  const scegli = useCallback(
    async (i: 0 | 1) => {
      if (fase !== 'coppia' || k === null) return
      const t = tempi()
      setScelta(i)
      setFase('attesa')
      suona('tocco')
      suona('tamburo', { altezza: t.attesa / 1000 })
      const [dopo] = await Promise.all([comandi.scegli(i), aspetta(t.attesa)])
      if (!montata.current) return
      if (!dopo) {
        setScelta(null)
        setFase('coppia')
        return
      }
      const scelta = dopo.coppie[k]
      const giusta = scelta.giusta === i
      setEsito({ coppia: scelta, indice: k })
      setFase('esito')
      if (giusta) {
        suona('giusto')
        await aspetta(t.giusta)
      } else {
        setLama('cala')
        setColpi((n) => n + 1)
        suona('lama')
        window.setTimeout(() => {
          if (!montata.current) return
          setTaglio({ prima: mostrata.montepremi, n: Date.now(), tutto: false })
        }, ridotto() ? 0 : 200)
        window.setTimeout(() => montata.current && setLama('alta'), ridotto() ? 100 : 900)
        await aspetta(t.sbagliata)
      }
      if (!montata.current) return
      setEsito(null)
      setScelta(null)
      setTaglio(null)
      setMostrata(dopo)
      setFase(dopo.corrente === null ? 'cinque' : 'coppia')
      if (dopo.corrente !== null) suona('carta')
    },
    [fase, k, comandi, mostrata.montepremi],
  )

  const rispondi = useCallback(
    async (parola: string) => {
      if (fase !== 'finale') return
      const t = tempi()
      setFase('busta')
      suona('tamburo', { altezza: t.busta / 1000 })
      const [dopo] = await Promise.all([comandi.rispondi(parola), aspetta(t.busta)])
      if (!montata.current) return
      if (!dopo) {
        setFase('finale')
        return
      }
      suona('busta')
      setMostrata(dopo)
      setFase('verdetto')
      if (dopo.indovinata) {
        suona('vittoria', { ritardo: 0.9 })
      } else {
        window.setTimeout(() => {
          if (!montata.current) return
          setLama('giu')
          setTaglio({ prima: dopo.montepremi, n: Date.now(), tutto: true })
          suona('lama')
          suona('sconfitta', { ritardo: 0.4 })
        }, ridotto() ? 0 : 1300)
      }
    },
    [fase, comandi],
  )

  const indovinata = mostrata.finita && mostrata.indovinata === true
  const valore = fase === 'fine' || fase === 'verdetto' ? (indovinata ? mostrata.punti : 0) : mostrata.montepremi

  return (
    <div className={`ghi is-${fase}${indovinata && (fase === 'verdetto' || fase === 'fine') ? ' is-vinta' : ''}`}>
      <div className="ghi-palco">
        <div className="ghi-palco__luci" aria-hidden="true" />
        <div className="ghi-palco__macchina">
          <Lama posizione={lama} colpi={colpi} />
          <Montepremi valore={valore} taglio={taglio} vinto={indovinata && fase !== 'verdetto'} />
        </div>
      </div>

      <Colonna
        coppie={mostrata.coppie}
        totale={mostrata.totaleCoppie}
        accese={fase === 'cinque' || fase === 'finale' || fase === 'busta'}
        mostraSpiegazioni={fase === 'fine'}
        soluzione={mostrata.soluzione}
      />

      <div className="ghi-centro">
        {fase === 'intro' && (
          <div className="ghi-intro">
            <p className="ghi-intro__testo">
              In ogni coppia una sola parola porta alla parola vincente. Ogni errore dimezza il montepremi.
            </p>
            <Button size="lg" onClick={() => setFase('coppia')}>
              Comincia
            </Button>
          </div>
        )}

        {coppia && (fase === 'coppia' || fase === 'attesa' || fase === 'esito') && (
          <Coppia
            key={k}
            numero={(k ?? 0) + 1}
            coppia={esito?.coppia ?? coppia}
            scelta={scelta}
            fase={fase}
            onScegli={scegli}
          />
        )}

        {fase === 'cinque' && (
          <p className="ghi-annuncio" role="status">
            Le cinque parole. Un minuto per la parola vincente!
          </p>
        )}

        {(fase === 'finale' || fase === 'busta') && (
          <Finale
            scadenza={mostrata.scadenza}
            tempoMs={mostrata.tempoFinaleMs}
            inviata={fase === 'busta'}
            onRispondi={rispondi}
            onScade={comandi.scade}
          />
        )}

        {(fase === 'verdetto' || fase === 'fine') && mostrata.soluzione && (
          <Verdetto
            soluzione={mostrata.soluzione}
            risposta={mostrata.risposta}
            indovinata={indovinata}
            punti={mostrata.punti}
            subito={fase === 'fine'}
          />
        )}
      </div>

      {fase === 'busta' && <Busta />}
      {fase === 'fine' && <div className="ghi-fine">{fine}</div>}
    </div>
  )
}

/* ─────────────────────────────  Il montepremi  ───────────────────────────── */

/**
 * La targa d'oro del montepremi, nella lunetta della ghigliottina. Quando la
 * lama la colpisce si spacca: la meta' destra cade, e il numero scende. Alla
 * parola vincente sbagliata cade tutta.
 */
function Montepremi({
  valore,
  taglio,
  vinto,
}: {
  valore: number
  taglio: { prima: number; n: number; tutto: boolean } | null
  vinto: boolean
}) {
  const [mostrato, setMostrato] = useState(valore)
  useEffect(() => {
    if (mostrato === valore) return
    if (ridotto()) {
      setMostrato(valore)
      return
    }
    // Il numero scende (o sale) di uno alla volta, piu' piano verso la fine.
    const da = mostrato
    const inizio = performance.now()
    const durata = 650
    let f = 0
    const passo = (adesso: number) => {
      const t = Math.min(1, (adesso - inizio) / durata)
      setMostrato(Math.round(da + (valore - da) * (1 - Math.pow(1 - t, 3))))
      if (t < 1) f = requestAnimationFrame(passo)
    }
    const ritardo = window.setTimeout(() => (f = requestAnimationFrame(passo)), taglio ? 380 : 0)
    return () => {
      window.clearTimeout(ritardo)
      cancelAnimationFrame(f)
    }
    // Il valore mostrato e' quello da cui si parte: non deve far ripartire il conto.
  }, [valore])

  return (
    <div className={`ghi-montepremi${vinto ? ' is-vinto' : ''}`} aria-live="polite">
      <span className="ghi-montepremi__etichetta">Montepremi</span>
      <span className="ghi-montepremi__valore u-tabnum">{mostrato}</span>
      <span className="u-visually-hidden">punti</span>
      {taglio && (
        <span key={taglio.n} className={`ghi-montepremi__pezzi${taglio.tutto ? ' is-tutto' : ''}`} aria-hidden="true">
          <span className="ghi-montepremi__pezzo is-sinistra">{taglio.prima}</span>
          <span className="ghi-montepremi__pezzo is-destra">{taglio.prima}</span>
          <span className="ghi-montepremi__scintille" />
        </span>
      )}
    </div>
  )
}

/* ─────────────────────────────  La colonna  ───────────────────────────── */

/** Le parti di un'espressione: la parola della coppia, la parola vincente e il resto. */
function partiDi(espressione: string, parola: string, soluzione: string | null): Array<{ testo: string; tipo: string }> {
  // La normalizzazione tiene la lunghezza: le lettere accentate restano una lettera.
  const piana = espressione.toLowerCase().replace(/[àáèéìíòóùú]/g, (c) => normalizzaGhigliottina(c) || c)
  const segni: Array<{ da: number; a: number; tipo: string }> = []
  const p = normalizzaGhigliottina(parola)
  const i = piana.indexOf(p)
  if (i >= 0) segni.push({ da: i, a: i + p.length, tipo: 'parola' })
  if (soluzione) {
    const s = normalizzaGhigliottina(soluzione)
    const radice = s.length > 3 ? s.slice(0, s.length - 1) : s
    let j = piana.indexOf(radice)
    while (j >= 0 && segni.some((x) => j < x.a && j + radice.length > x.da)) j = piana.indexOf(radice, j + 1)
    if (j >= 0) {
      // Fino alla fine della parola: "casa" in "casa", "cuor" in "Cuor di Leone".
      let fine = j + radice.length
      while (fine < piana.length && /[a-z]/.test(piana[fine]) && !segni.some((x) => fine >= x.da && fine < x.a)) {
        fine += 1
      }
      segni.push({ da: j, a: fine, tipo: 'soluzione' })
    }
  }
  segni.sort((a, b) => a.da - b.da)
  const parti: Array<{ testo: string; tipo: string }> = []
  let at = 0
  for (const s of segni) {
    if (s.da < at) continue
    if (s.da > at) parti.push({ testo: espressione.slice(at, s.da), tipo: 'testo' })
    parti.push({ testo: espressione.slice(s.da, s.a), tipo: s.tipo })
    at = s.a
  }
  if (at < espressione.length) parti.push({ testo: espressione.slice(at), tipo: 'testo' })
  return parti
}

/**
 * Le cinque parole giuste, una sotto l'altra come in studio: vuote finché la
 * coppia non e' scelta. Un segno rosso dice dove la lama e' calata. Alla fine
 * ogni parola ha accanto la sua espressione.
 */
function Colonna({
  coppie,
  totale,
  accese,
  mostraSpiegazioni,
  soluzione,
}: {
  coppie: CoppiaGhigliottinaVista[]
  totale: number
  accese: boolean
  mostraSpiegazioni: boolean
  soluzione: string | null
}) {
  return (
    <ol className={`ghi-colonna${accese ? ' is-accesa' : ''}${mostraSpiegazioni ? ' is-spiegata' : ''}`}>
      {Array.from({ length: totale }, (_, i) => {
        const c = coppie[i]
        const nota = c && c.giusta !== null ? c : null
        const parola = nota ? nota.parole[nota.giusta!] : null
        const sbagliata = nota !== null && nota.scelta !== null && nota.scelta !== nota.giusta
        return (
          <li
            key={i}
            className={`ghi-slot${parola ? ' is-piena' : ''}${sbagliata ? ' is-tagliata' : ''}`}
            style={{ '--i': i } as CSSProperties}
          >
            <span className="ghi-slot__n">{i + 1}</span>
            <span className="ghi-slot__parola">{parola ?? ''}</span>
            {sbagliata && <span className="ghi-slot__taglio" aria-label="scelta sbagliata" />}
            {mostraSpiegazioni && nota?.spiegazione && parola && (
              <span className="ghi-slot__spiegazione">
                {partiDi(nota.spiegazione, parola, soluzione).map((p, j) =>
                  p.tipo === 'testo' ? (
                    <span key={j}>{p.testo}</span>
                  ) : (
                    <strong key={j} className={`is-${p.tipo}`}>
                      {p.testo}
                    </strong>
                  ),
                )}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/* ─────────────────────────────  La coppia  ───────────────────────────── */

/**
 * Le due parole della coppia, che entrano in scena da due parti. Toccata una,
 * l'altra si spegne e parte il rullo; poi la giusta si accende di verde, e se
 * era l'altra quella toccata diventa rossa e trema.
 */
function Coppia({
  numero,
  coppia,
  scelta,
  fase,
  onScegli,
}: {
  numero: number
  coppia: CoppiaGhigliottinaVista
  scelta: 0 | 1 | null
  fase: Fase
  onScegli: (i: 0 | 1) => void
}) {
  const libera = fase === 'coppia'
  return (
    <div className={`ghi-coppia is-${fase}`} role="group" aria-label={`Coppia ${numero} di 5`}>
      <p className="ghi-coppia__titolo">Coppia {numero}</p>
      <div className="ghi-coppia__parole">
        {coppia.parole.map((parola, i) => {
          const giusta = fase === 'esito' && coppia.giusta === i
          const sbagliata = fase === 'esito' && scelta === i && coppia.giusta !== i
          return (
            <button
              key={i}
              type="button"
              className={
                `ghi-parola is-${i === 0 ? 'prima' : 'seconda'}` +
                (scelta === i ? ' is-scelta' : scelta !== null ? ' is-altra' : '') +
                (giusta ? ' is-giusta' : '') +
                (sbagliata ? ' is-sbagliata' : '')
              }
              disabled={!libera}
              aria-pressed={scelta === i}
              onClick={() => onScegli(i as 0 | 1)}
            >
              <span className="ghi-parola__testo">{parola}</span>
            </button>
          )
        })}
      </div>
      <p className="ghi-coppia__stato" role="status">
        {fase === 'attesa' ? 'Vediamo…' : fase === 'esito' ? (scelta === coppia.giusta ? 'Giusta!' : 'Sbagliata!') : ''}
      </p>
    </div>
  )
}

/* ─────────────────────────────  Il minuto  ───────────────────────────── */

const RAGGIO = 26
const GIRO = 2 * Math.PI * RAGGIO

/** Il minuto della parola vincente: l'anello che si svuota, e la parola da scrivere. */
function Finale({
  scadenza,
  tempoMs,
  inviata,
  onRispondi,
  onScade,
}: {
  scadenza: number | null
  tempoMs: number
  inviata: boolean
  onRispondi: (parola: string) => void
  onScade: () => void
}) {
  const [testo, setTesto] = useState('')
  const [adesso, setAdesso] = useState(() => Date.now())
  const scaduto = useRef(false)
  const campo = useRef<HTMLInputElement>(null)
  const resta = scadenza === null ? tempoMs : Math.max(0, scadenza - adesso)
  const secondi = Math.ceil(resta / 1000)

  useEffect(() => {
    if (inviata) return
    const t = window.setInterval(() => setAdesso(Date.now()), 200)
    return () => window.clearInterval(t)
  }, [inviata])

  useEffect(() => {
    campo.current?.focus({ preventScroll: true })
  }, [])

  // Gli ultimi dieci secondi si sentono, e allo zero il minuto e' finito.
  const ultimoTic = useRef<number | null>(null)
  useEffect(() => {
    if (inviata) return
    if (secondi <= 10 && secondi > 0 && ultimoTic.current !== secondi) {
      ultimoTic.current = secondi
      suona('tic')
    }
    if (resta <= 0 && !scaduto.current) {
      scaduto.current = true
      suona('scaduto')
      onScade()
    }
  }, [secondi, resta, inviata, onScade])

  const invia = (e: FormEvent) => {
    e.preventDefault()
    if (inviata || resta <= 0) return
    campo.current?.blur()
    onRispondi(testo)
  }

  return (
    <form className={`ghi-finale${secondi <= 10 ? ' is-urgente' : ''}`} onSubmit={invia}>
      <div className="ghi-finale__tempo" aria-label={`${secondi} secondi`}>
        <svg viewBox="0 0 60 60" aria-hidden="true">
          <circle className="ghi-finale__fondo" cx="30" cy="30" r={RAGGIO} />
          <circle
            className="ghi-finale__anello"
            cx="30"
            cy="30"
            r={RAGGIO}
            strokeDasharray={GIRO}
            strokeDashoffset={GIRO * (1 - resta / tempoMs)}
          />
        </svg>
        <span className="ghi-finale__secondi u-tabnum">{secondi}</span>
      </div>
      <label className="ghi-finale__campo">
        <span className="u-visually-hidden">La parola vincente</span>
        <input
          ref={campo}
          type="text"
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          placeholder="La parola vincente"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="send"
          maxLength={24}
          disabled={inviata}
        />
      </label>
      <div className="ghi-finale__azioni">
        <Button type="submit" size="lg" disabled={inviata || normalizzaGhigliottina(testo).length === 0}>
          Conferma
        </Button>
        <Button type="button" variant="plain" disabled={inviata} onClick={() => onRispondi('')}>
          Non lo so
        </Button>
      </div>
    </form>
  )
}

/* ─────────────────────────────  La busta  ───────────────────────────── */

/** La busta della parola vincente, che arriva tremando e si apre: il conduttore che legge. */
function Busta() {
  return (
    <div className="ghi-busta" aria-hidden="true">
      <div className="ghi-busta__carta">
        <span className="ghi-busta__lembo" />
        <span className="ghi-busta__sigillo">?</span>
      </div>
      <p className="ghi-busta__testo">La parola vincente è…</p>
    </div>
  )
}

/* ─────────────────────────────  Il verdetto  ───────────────────────────── */

/**
 * La parola vincente, una lettera alla volta, come le caselle che si girano:
 * verdi se e' quella scritta, oro se no; e sotto quel che si era scritto.
 */
function Verdetto({
  soluzione,
  risposta,
  indovinata,
  punti,
  subito,
}: {
  soluzione: string
  risposta: string | null
  indovinata: boolean
  punti: number
  subito: boolean
}) {
  const lettere = [...soluzione.toUpperCase()]
  return (
    <div className={`ghi-verdetto${indovinata ? ' is-giusta' : ' is-sbagliata'}${subito ? ' is-subito' : ''}`}>
      <p className="ghi-verdetto__titolo">La parola vincente</p>
      <p className="ghi-verdetto__parola" aria-label={soluzione}>
        {lettere.map((l, i) => (
          <span key={i} className="ghi-verdetto__lettera" style={{ '--i': i } as CSSProperties} aria-hidden="true">
            {l}
          </span>
        ))}
      </p>
      <p className="ghi-verdetto__esito" style={{ '--n': lettere.length } as CSSProperties}>
        {indovinata
          ? `Indovinata! ${punti} punti`
          : risposta
            ? `Hai scritto «${risposta.toUpperCase()}»: niente punti`
            : 'Nessuna risposta: niente punti'}
      </p>
    </div>
  )
}
