import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { IconaGioco } from '@/components/IconaGioco'
import { TastieraGioco, useTastieraFisica } from '@/components/TastieraGioco'
import { suona } from '@/lib/suoni'
import { ERRORE_GHIGLIOTTINA, normalizzaGhigliottina } from '@shared/ghigliottina'
import type { CoppiaGhigliottinaVista } from '@shared/types'
import { Lama, type PosizioneLama } from './Lama'
import './Ghigliottina.css'

/** Quel che serve alla scena, dalla classificata (il server) o dalla libera (il telefono). */
export interface VistaGhigliottina {
  /** Si e' premuto Comincia: prima la scena e' la presentazione. */
  iniziata: boolean
  coppie: CoppiaGhigliottinaVista[]
  totaleCoppie: number
  corrente: number | null
  montepremiIniziale: number
  montepremi: number
  /** Il tempo della coppia di adesso, sull'orologio del telefono: quando parte e quando finisce. */
  orologioCoppia: { inizio: number; scadenza: number } | null
  tempoSceltaMs: number
  finaleAperto: boolean
  /** Quando finisce il tempo della parola vincente, sull'orologio del telefono. */
  scadenza: number | null
  tempoFinaleMs: number
  soluzione: string | null
  risposta: string | null
  indovinata: boolean | null
  finita: boolean
  punti: number
}

export interface ComandiGhigliottina {
  /** Comincia: arriva la prima coppia, e il suo tempo parte dopo la scena. */
  inizia: () => Promise<VistaGhigliottina | null>
  /** Il tempo della coppia e' finito: conta come sbagliata, e si vede qual era la giusta. */
  scadeScelta: () => Promise<VistaGhigliottina | null>
  /** La scelta della coppia di adesso: torna la vista dopo la scelta, o null se non e' andata. */
  scegli: (scelta: 0 | 1) => Promise<VistaGhigliottina | null>
  /** Fa partire il tempo della parola vincente. */
  apriFinale: () => Promise<VistaGhigliottina | null>
  rispondi: (parola: string) => Promise<VistaGhigliottina | null>
  /** Il tempo della parola vincente e' finito sul telefono senza una risposta. */
  scade: () => void
}

/**
 * I momenti della partita, come in studio: l'entrata, una coppia da
 * scegliere, l'attesa col rullo di tamburo, l'esito (la lama, se e' sbagliata),
 * le cinque parole che salgono, il minuto, la busta, il verdetto, la fine.
 */
type Fase = 'intro' | 'coppia' | 'attesa' | 'esito' | 'cinque' | 'finale' | 'busta' | 'verdetto' | 'fine'

const ridotto = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * I tempi della scena, in millisecondi; senza animazioni bastano pochi istanti.
 * Il rullo, l'esito e l'uscita della coppia stanno nel preambolo che il server
 * lascia alla coppia dopo (`preamboloCoppia`): 2,8 secondi dopo una giusta, 4
 * dopo una sbagliata.
 */
function tempi() {
  const r = ridotto()
  return {
    /** Il rullo di tamburo fra la scelta e l'esito. */
    attesa: r ? 200 : 1400,
    /** La parola giusta che si accende, con la sua espressione. */
    giusta: r ? 300 : 1000,
    /** La lama che cala, il montepremi tagliato, e la lama che risale. */
    sbagliata: r ? 500 : 2200,
    /** La coppia vista che se ne va, prima della prossima. */
    uscita: r ? 0 : 380,
    /** Le cinque parole che salgono una dopo l'altra, prima del minuto. */
    cinque: r ? 300 : 2600,
    /** La busta che arriva e trema. */
    busta: r ? 300 : 2700,
    /** Le lettere della parola vincente che si girano, prima della fine. */
    verdetto: r ? 600 : 3400,
  }
}

/** Quanto resta sul palco un adesivo: "Giusta!", "−10", "Indovinata!". */
const DURATA_ADESIVO_MS = 1_400

const aspetta = (ms: number) => new Promise<void>((risolvi) => window.setTimeout(risolvi, ms))

/** La fase da cui riprende una partita riaperta. */
function faseDi(v: VistaGhigliottina): Fase {
  if (v.finita) return 'fine'
  if (v.finaleAperto) return 'finale'
  if (v.corrente === null) return 'cinque'
  return v.iniziata ? 'coppia' : 'intro'
}

/**
 * Fa scivolare dal posto di prima a quello nuovo gli elementi che cambiano
 * posto quando cambia `chiave` (FLIP): la ghigliottina che si fa piccola per
 * lasciare posto alle cinque parole. `sposta` li porta per il centro, `scala`
 * li rimpicciolisce anche, dall'alto: la ghigliottina ha le sue proporzioni, e
 * scalata resta lei. I posti si misurano a ogni disegno, cosi' quelli di prima
 * sono quelli che si vedevano davvero.
 */
function useScivola(
  contenitore: { current: HTMLElement | null },
  selettori: { sposta?: string; scala: string },
  chiave: unknown,
) {
  const posti = useRef(new Map<Element, DOMRect>())
  const ultima = useRef(chiave)
  useLayoutEffect(() => {
    const el = contenitore.current
    if (!el) return
    const sposta = selettori.sposta ? [...el.querySelectorAll(selettori.sposta)] : []
    const scala = [...el.querySelectorAll(selettori.scala)]
    if (ultima.current !== chiave && !ridotto()) {
      const anima = (e: Element, ritardo: number, trasforma: (p: DOMRect, d: DOMRect) => string | null) => {
        const p = posti.current.get(e)
        if (!p) return
        const t = trasforma(p, e.getBoundingClientRect())
        if (!t) return
        // Durante il ritardo resta dov'era: senza `backwards` comparirebbe al posto nuovo e poi tornerebbe indietro.
        e.animate([{ transform: t }, { transform: 'none' }], {
          duration: 650,
          delay: ritardo,
          easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)',
          fill: 'backwards',
        })
      }
      sposta.forEach((e, i) =>
        anima(e, i * 45, (p, d) => {
          const dx = p.left + p.width / 2 - (d.left + d.width / 2)
          const dy = p.top + p.height / 2 - (d.top + d.height / 2)
          return Math.abs(dx) < 1 && Math.abs(dy) < 1 ? null : `translate(${dx}px, ${dy}px)`
        }),
      )
      scala.forEach((e) =>
        anima(e, 0, (p, d) => {
          const s = p.height / Math.max(1, d.height)
          if (Math.abs(s - 1) < 0.01 && Math.abs(p.top - d.top) < 1) return null
          const dx = p.left + p.width / 2 - (d.left + d.width / 2)
          return `translate(${dx}px, ${p.top - d.top}px) scale(${s})`
        }),
      )
    }
    ultima.current = chiave
    posti.current = new Map([...sposta, ...scala].map((e) => [e, e.getBoundingClientRect()]))
  })
}

interface AdesivoPalco {
  testo: string
  tono: 'vivace' | 'bordato'
  /** Cambia a ogni adesivo: fa ripartire l'animazione. */
  n: number
}

/**
 * La Ghigliottina in scena: il palco con le cinque lampade, la lama sopra il
 * montepremi, e sotto la coppia di parole, il minuto o la busta. La scena va
 * un passo dietro allo stato vero (`vista`): la scelta va subito al server, ma
 * si vede com'e' andata solo dopo il rullo di tamburo, e la coppia dopo solo
 * quando quella vista se n'e' andata.
 */
export function PartitaGhigliottina({
  vista,
  comandi,
  fine,
  subito = false,
  adesso = Date.now,
}: {
  vista: VistaGhigliottina
  comandi: ComandiGhigliottina
  fine: ReactNode
  /** Senza il Comincia: in una sfida il tre-due-uno l'ha gia' fatto. */
  subito?: boolean
  /**
   * L'ora su cui sono scritti i tempi della vista. Nella libera si ferma a
   * pagina nascosta (`adessoVisibile`): lasciata, la partita aspetta.
   */
  adesso?: () => number
}) {
  const [mostrata, setMostrata] = useState(vista)
  const [fase, setFase] = useState<Fase>(() => faseDi(vista))
  const [scelta, setScelta] = useState<0 | 1 | null>(null)
  /** La coppia di adesso si e' chiusa per il tempo, non per una scelta. */
  const [scaduta, setScaduta] = useState(false)
  /** La coppia vista se ne va, prima che arrivi la prossima. */
  const [uscita, setUscita] = useState(false)
  const [lama, setLama] = useState<PosizioneLama>(vista.finita && vista.indovinata === false ? 'giu' : 'alta')
  const [colpi, setColpi] = useState(0)
  /**
   * Il montepremi tagliato: il valore di prima, che si spacca, quello di dopo,
   * che c'e' gia' sotto i pezzi, e il numero del colpo, che fa ripartire
   * l'animazione.
   */
  const [taglio, setTaglio] = useState<Taglio | null>(null)
  /** La coppia appena scelta, con l'esito, mentre la giusta si accende. */
  const [esito, setEsito] = useState<{ coppia: CoppiaGhigliottinaVista; indice: number } | null>(null)
  const [adesivo, setAdesivo] = useState<AdesivoPalco | null>(null)
  const montata = useRef(true)
  const inVolo = useRef(false)
  const scena = useRef<HTMLDivElement>(null)
  // Rimessa a vero a ogni montaggio: in sviluppo React monta, smonta e rimonta, e restava falsa.
  useEffect(() => {
    montata.current = true
    return () => {
      montata.current = false
    }
  }, [])

  // L'adesivo sul palco se ne va da solo.
  const attacca = useCallback((testo: string, tono: AdesivoPalco['tono']) => {
    setAdesivo((a) => ({ testo, tono, n: (a?.n ?? 0) + 1 }))
  }, [])
  const nAdesivo = adesivo?.n
  useEffect(() => {
    if (nAdesivo === undefined) return
    const t = window.setTimeout(() => setAdesivo(null), DURATA_ADESIVO_MS)
    return () => window.clearTimeout(t)
  }, [nAdesivo])

  // Il tempo finito: il server ha chiuso la partita, e la vista arriva finita.
  useEffect(() => {
    if (fase === 'finale' && vista.finita) {
      setMostrata(vista)
      setFase('verdetto')
      setLama('giu')
      setTaglio({ prima: mostrata.montepremi, dopo: vista.punti, n: Date.now(), tutto: true })
      attacca('Tempo!', 'bordato')
      suona('lama')
      suona('sconfitta', { ritardo: 0.5 })
    }
  }, [fase, vista, mostrata.montepremi, attacca])

  // Uno stato arrivato da fuori — una scrittura rifiutata e riletta, un tempo finito applicato dal server —
  // prende il posto di quello mostrato mentre si sceglie.
  useEffect(() => {
    if (inVolo.current || fase !== 'coppia' || vista === mostrata) return
    if (vista.corrente === mostrata.corrente && vista.montepremi === mostrata.montepremi) return
    setMostrata(vista)
    setFase(faseDi(vista))
  }, [vista, mostrata, fase])

  // Comincia: la prima coppia arriva, e il suo tempo parte dopo la scena.
  const comincia = useCallback(async () => {
    if (inVolo.current) return
    inVolo.current = true
    try {
      const dopo = await comandi.inizia()
      if (!montata.current || !dopo) return
      setMostrata(dopo)
      setFase(faseDi(dopo) === 'intro' ? 'coppia' : faseDi(dopo))
      suona('carta')
    } finally {
      inVolo.current = false
    }
  }, [comandi])

  // In una sfida si comincia da soli: il tre-due-uno l'ha gia' fatto.
  const partita = useRef(false)
  useEffect(() => {
    if (!subito || partita.current || fase !== 'intro') return
    partita.current = true
    void comincia()
  }, [comincia, fase, subito])

  // Le cinque parole salgono sul palco, una dopo l'altra, poi parte il minuto.
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

  // Il verdetto: le lettere si girano, e poi la fine con le espressioni.
  useEffect(() => {
    if (fase !== 'verdetto') return
    const timer = window.setTimeout(() => setFase('fine'), tempi().verdetto)
    return () => window.clearTimeout(timer)
  }, [fase])

  const k = mostrata.corrente
  const coppia = k !== null ? mostrata.coppie[k] : null

  /**
   * Una scelta, o il tempo della coppia finito (`null`): il rullo, poi la
   * parola giusta che si accende con la sua espressione; se era sbagliata, o
   * se il tempo e' finito, cala la lama e il montepremi si spacca, con quello
   * sceso gia' sotto. Poi la coppia se ne va, e arriva la prossima.
   */
  const scegli = useCallback(
    async (i: 0 | 1 | null) => {
      if (fase !== 'coppia' || k === null || inVolo.current) return
      const t = tempi()
      inVolo.current = true
      try {
        setScelta(i)
        setScaduta(i === null)
        setFase('attesa')
        if (i === null) suona('scaduto')
        else suona('tocco')
        suona('tamburo', { altezza: t.attesa / 1000 })
        const [dopo] = await Promise.all([i === null ? comandi.scadeScelta() : comandi.scegli(i), aspetta(t.attesa)])
        if (!montata.current) return
        if (!dopo) {
          setScelta(null)
          setScaduta(false)
          setFase('coppia')
          return
        }
        const scelta = dopo.coppie[k]
        const giusta = i !== null && scelta.giusta === i
        setEsito({ coppia: scelta, indice: k })
        setFase('esito')
        if (giusta) {
          attacca('Giusta!', 'vivace')
          suona('giusto')
          await aspetta(t.giusta)
        } else {
          setLama('cala')
          setColpi((n) => n + 1)
          suona('lama')
          window.setTimeout(
            () => {
              if (!montata.current) return
              setTaglio({ prima: mostrata.montepremi, dopo: dopo.montepremi, n: Date.now(), tutto: false })
              attacca(i === null ? 'Tempo!' : `−${ERRORE_GHIGLIOTTINA}`, 'bordato')
            },
            ridotto() ? 0 : 200,
          )
          window.setTimeout(() => montata.current && setLama('alta'), ridotto() ? 100 : 900)
          await aspetta(t.sbagliata)
        }
        if (!montata.current) return
        if (t.uscita > 0) {
          setUscita(true)
          await aspetta(t.uscita)
          if (!montata.current) return
        }
        setUscita(false)
        setEsito(null)
        setScelta(null)
        setScaduta(false)
        setTaglio(null)
        setMostrata(dopo)
        setFase(dopo.corrente === null ? 'cinque' : 'coppia')
        if (dopo.corrente !== null) suona('carta')
      } finally {
        inVolo.current = false
      }
    },
    [fase, k, comandi, mostrata.montepremi, attacca],
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
      // L'adesivo aspetta che le lettere si siano girate.
      const lettere = normalizzaGhigliottina(dopo.soluzione ?? '').length
      const dopoLeLettere = ridotto() ? 0 : 500 + lettere * 180 + 450
      if (dopo.indovinata) {
        window.setTimeout(() => montata.current && attacca('Indovinata!', 'vivace'), dopoLeLettere)
        suona('vittoria', { ritardo: dopoLeLettere / 1000 })
      } else {
        window.setTimeout(
          () => {
            if (!montata.current) return
            setLama('giu')
            setTaglio({ prima: dopo.montepremi, dopo: dopo.punti, n: Date.now(), tutto: true })
            attacca('Peccato', 'bordato')
            suona('lama')
            suona('sconfitta', { ritardo: 0.4 })
          },
          Math.max(ridotto() ? 0 : 1300, dopoLeLettere),
        )
      }
    },
    [fase, comandi, attacca],
  )

  const indovinata = mostrata.finita && mostrata.indovinata === true
  const valore = fase === 'fine' || fase === 'verdetto' ? mostrata.punti : mostrata.montepremi
  // Dalle cinque parole in poi la ghigliottina si fa piccola, e le parole salgono sul palco sopra di lei.
  const compatta = fase === 'cinque' || fase === 'finale' || fase === 'busta' || fase === 'verdetto' || fase === 'fine'
  useScivola(scena, { scala: '.ghi-palco__macchina' }, compatta)

  return (
    <div
      ref={scena}
      className={
        `ghi is-${fase}${compatta ? ' is-compatta' : ''}` +
        `${indovinata && (fase === 'verdetto' || fase === 'fine') ? ' is-vinta' : ''}`
      }
    >
      <section className={`ghi-palco${fase === 'attesa' ? ' is-tamburo' : ''}`} aria-label="Il palco">
        <span className="ghi-palco__luci" aria-hidden="true">
          <span className="ghi-fascio ghi-fascio--sx" />
          <span className="ghi-fascio ghi-fascio--dx" />
        </span>
        <Lampade
          coppie={esito ? mostrata.coppie.map((c, i) => (i === esito.indice ? esito.coppia : c)) : mostrata.coppie}
          totale={mostrata.totaleCoppie}
          corrente={fase === 'coppia' || fase === 'attesa' || fase === 'esito' ? k : null}
        />
        <div className="ghi-palco__scena">
          <div className="ghi-palco__macchina">
            <Lama posizione={lama} colpi={colpi} />
            <Montepremi valore={valore} taglio={taglio} vinto={indovinata && fase !== 'verdetto'} />
          </div>
        </div>
        {compatta && <Parole coppie={mostrata.coppie} ferme={fase !== 'cinque'} />}
        {adesivo && (
          <div
            key={adesivo.n}
            className={`ghi-adesivo is-${adesivo.tono}`}
            style={{ '--durata': `${DURATA_ADESIVO_MS}ms` } as CSSProperties}
            aria-hidden="true"
          >
            <span>{adesivo.testo}</span>
          </div>
        )}
      </section>

      <div className="ghi-centro">
        {fase === 'intro' && (
          <Presentazione
            tempoSceltaMs={mostrata.tempoSceltaMs}
            tempoFinaleMs={mostrata.tempoFinaleMs}
            onComincia={() => void comincia()}
          />
        )}

        {coppia && (fase === 'coppia' || fase === 'attesa' || fase === 'esito') && (
          <Coppia
            key={k}
            numero={(k ?? 0) + 1}
            totale={mostrata.totaleCoppie}
            coppia={esito?.coppia ?? coppia}
            scelta={scelta}
            scaduta={scaduta}
            uscita={uscita}
            fase={fase}
            orologio={mostrata.orologioCoppia}
            tempoMs={mostrata.tempoSceltaMs}
            adesso={adesso}
            onScegli={scegli}
          />
        )}

        {fase === 'cinque' && (
          <p className="ghi-annuncio" role="status">
            Le cinque parole!
            <span className="ghi-annuncio__sotto">{durataFinale(mostrata.tempoFinaleMs)} per la parola vincente</span>
          </p>
        )}

        {fase === 'finale' && (
          <Finale
            scadenza={mostrata.scadenza}
            tempoMs={mostrata.tempoFinaleMs}
            adesso={adesso}
            onRispondi={rispondi}
            onScade={comandi.scade}
          />
        )}

        {(fase === 'busta' || fase === 'verdetto') && (
          <Busta
            soluzione={fase === 'verdetto' ? mostrata.soluzione : null}
            risposta={mostrata.risposta}
            indovinata={indovinata}
          />
        )}
      </div>

      {fase === 'fine' && (
        <Fine coppie={mostrata.coppie} soluzione={mostrata.soluzione} indovinata={indovinata} punti={mostrata.punti}>
          {fine}
        </Fine>
      )}
    </div>
  )
}

/** Il tempo della parola vincente, come lo dice il conduttore: "Un minuto e mezzo". */
function durataFinale(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s === 60) return 'Un minuto'
  if (s === 90) return 'Un minuto e mezzo'
  if (s === 120) return 'Due minuti'
  if (s % 60 === 0) return `${s / 60} minuti`
  return `${s} secondi`
}

/* ─────────────────────────────  La presentazione  ───────────────────────────── */

/** Prima di cominciare: le tre regole in una carta, e Comincia. */
function Presentazione({
  tempoSceltaMs,
  tempoFinaleMs,
  onComincia,
}: {
  tempoSceltaMs: number
  tempoFinaleMs: number
  onComincia: () => void
}) {
  return (
    <div className="ghi-pronta">
      <ul className="ghi-pronta__carta">
        <li className="ghi-pronta__riga">
          <span className="ghi-punto is-rosa" aria-hidden="true" />
          Cinque coppie: in ognuna scegli la parola legata alla vincente
        </li>
        <li className="ghi-pronta__riga">
          <span className="ghi-punto is-giallo" aria-hidden="true" />
          {Math.round(tempoSceltaMs / 1000)} secondi a coppia, {Math.round(tempoFinaleMs / 1000)} per la vincente
        </li>
        <li className="ghi-pronta__riga">
          <span className="ghi-punto is-rosso" aria-hidden="true" />
          Ogni errore: la lama toglie {ERRORE_GHIGLIOTTINA} punti
        </li>
      </ul>
      <button type="button" className="ghi-comincia" onClick={onComincia}>
        Comincia
      </button>
    </div>
  )
}

/* ─────────────────────────────  Le lampade  ───────────────────────────── */

/**
 * Le cinque lampade in cima al palco, una per coppia: lampeggia quella di
 * adesso, durante il rullo piu' in fretta, e una coppia scelta resta verde o
 * rossa, da quando se ne vede l'esito.
 */
function Lampade({
  coppie,
  totale,
  corrente,
}: {
  coppie: CoppiaGhigliottinaVista[]
  totale: number
  corrente: number | null
}) {
  const fatte = coppie.filter((c) => c.giusta !== null).length
  return (
    <ol className="ghi-lampade" aria-label={`${fatte} coppie su ${totale}`}>
      {Array.from({ length: totale }, (_, i) => {
        const c = coppie[i]
        const nota = c && c.giusta !== null ? c : null
        const sbagliata = nota !== null && (nota.scaduta || (nota.scelta !== null && nota.scelta !== nota.giusta))
        const stato = nota ? (sbagliata ? 'is-sbagliata' : 'is-giusta') : corrente === i ? 'is-attuale' : ''
        return (
          <li
            key={i}
            className={`ghi-lampada ${stato}`}
            aria-label={nota ? (sbagliata ? 'sbagliata' : 'giusta') : corrente === i ? 'adesso' : 'da giocare'}
          />
        )
      })}
    </ol>
  )
}

/* ─────────────────────────────  Il montepremi  ───────────────────────────── */

interface Taglio {
  prima: number
  /** Il montepremi dopo il colpo: sotto i pezzi che cadono c'e' gia' lui. */
  dopo: number
  /** Il numero del colpo: uno nuovo fa ripartire l'animazione. */
  n: number
  /** La parola vincente sbagliata: la targa cade tutta. */
  tutto: boolean
}

/**
 * La targa d'oro del montepremi, nella lunetta della ghigliottina. Quando la
 * lama la colpisce si spacca: i pezzi con il numero di prima cadono, e sotto
 * c'e' gia' quello sceso, che salta fuori. Alla parola vincente sbagliata
 * cade tutta, e sotto restano i punti di consolazione.
 */
function Montepremi({ valore, taglio, vinto }: { valore: number; taglio: Taglio | null; vinto: boolean }) {
  const [mostrato, setMostrato] = useState(valore)
  // Il colpo: il numero nuovo c'e' subito, sotto i pezzi, senza aspettare che la scena vada avanti.
  const colpo = taglio?.n
  const dopoIlColpo = taglio?.dopo
  useEffect(() => {
    if (colpo !== undefined && dopoIlColpo !== undefined) setMostrato(dopoIlColpo)
  }, [colpo, dopoIlColpo])
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
    const ritardo = window.setTimeout(() => (f = requestAnimationFrame(passo)), 0)
    return () => {
      window.clearTimeout(ritardo)
      cancelAnimationFrame(f)
    }
    // Il valore mostrato e' quello da cui si parte: non deve far ripartire il conto.
  }, [valore])

  return (
    <div className={`ghi-montepremi${vinto ? ' is-vinto' : ''}`} aria-live="polite">
      <span className="ghi-montepremi__etichetta">Montepremi</span>
      {/* La chiave e' sua: quella del colpo ce l'hanno i pezzi, e due fratelli con la stessa lasciano nodi orfani. */}
      <span
        key={colpo === undefined ? 'valore' : `valore-${colpo}`}
        className={`ghi-montepremi__valore u-tabnum${taglio ? ' is-nuovo' : ''}`}
      >
        {mostrato}
      </span>
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

/* ─────────────────────────────  Le cinque parole  ───────────────────────────── */

/**
 * Le cinque parole giuste, sul palco sopra la ghigliottina, in due file:
 * salgono una dopo l'altra prima del minuto, e restano li' mentre si scrive.
 * Una coppia sbagliata ha il suo segno rosso.
 */
function Parole({ coppie, ferme }: { coppie: CoppiaGhigliottinaVista[]; ferme: boolean }) {
  return (
    <ol className={`ghi-parole${ferme ? ' is-ferme' : ''}`} aria-label="Le cinque parole">
      {coppie.map((c, i) => {
        if (c.giusta === null) return null
        const sbagliata = c.scaduta || (c.scelta !== null && c.scelta !== c.giusta)
        return (
          <li
            key={i}
            className={`ghi-parola${sbagliata ? ' is-tagliata' : ''}`}
            style={{ '--i': i } as CSSProperties}
          >
            {c.parole[c.giusta].toUpperCase()}
          </li>
        )
      })}
    </ol>
  )
}

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

/* ─────────────────────────────  La coppia  ───────────────────────────── */

/**
 * Le due parole della coppia, due tessere che entrano dal basso. Toccata una,
 * l'altra si spegne e parte il rullo; poi la giusta si accende di verde con la
 * sua espressione, e se era l'altra quella toccata diventa rossa e trema.
 * Finito l'esito la coppia scivola via, e arriva la prossima.
 */
function Coppia({
  numero,
  totale,
  coppia,
  scelta,
  scaduta,
  uscita,
  fase,
  orologio,
  tempoMs,
  adesso,
  onScegli,
}: {
  numero: number
  totale: number
  coppia: CoppiaGhigliottinaVista
  scelta: 0 | 1 | null
  /** Il tempo e' finito senza una scelta. */
  scaduta: boolean
  uscita: boolean
  fase: Fase
  orologio: { inizio: number; scadenza: number } | null
  tempoMs: number
  adesso: () => number
  /** Una parola, o null quando il tempo finisce. */
  onScegli: (i: 0 | 1 | null) => void
}) {
  const libera = fase === 'coppia'
  const titolo =
    scaduta && (fase === 'attesa' || fase === 'esito')
      ? 'Tempo scaduto!'
      : fase === 'attesa'
        ? 'Vediamo…'
        : fase === 'esito'
          ? scelta === coppia.giusta
            ? 'Giusta!'
            : 'Sbagliata!'
          : `Coppia ${numero} di ${totale}`
  return (
    <div
      className={`ghi-coppia is-${fase}${scaduta ? ' is-scaduta' : ''}${uscita ? ' is-uscita' : ''}`}
      role="group"
      aria-label={`Coppia ${numero} di ${totale}`}
    >
      <div className="ghi-testa">
        <p className="ghi-testa__titolo" role="status">
          {titolo}
        </p>
        {orologio && (
          <Clessidra
            orologio={orologio}
            tempoMs={tempoMs}
            adesso={adesso}
            attiva={libera}
            ferma={!libera}
            onScade={() => onScegli(null)}
          />
        )}
      </div>
      <div className="ghi-coppia__parole">
        {coppia.parole.map((parola, i) => {
          const giusta = fase === 'esito' && coppia.giusta === i
          const sbagliata = fase === 'esito' && scelta === i && coppia.giusta !== i
          const spenta =
            (fase === 'attesa' && scelta !== i) || (fase === 'esito' && !giusta && !sbagliata)
          return (
            <button
              key={i}
              type="button"
              className={
                'ghi-tessera' +
                (fase === 'attesa' && scelta === i ? ' is-attesa' : '') +
                (giusta ? ' is-giusta' : '') +
                (sbagliata ? ' is-sbagliata' : '') +
                (spenta ? ' is-spenta' : '')
              }
              style={{ '--i': i } as CSSProperties}
              disabled={!libera}
              aria-pressed={scelta === i}
              onClick={() => onScegli(i as 0 | 1)}
            >
              <span className="ghi-tessera__testo">{parola}</span>
              {giusta && coppia.spiegazione && <span className="ghi-tessera__spiega">{coppia.spiegazione}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const RAGGIO_ANELLO = 18
const GIRO_ANELLO = 2 * Math.PI * RAGGIO_ANELLO

/** Un anello che si svuota, con i secondi dentro: il tempo di una coppia e quello della vincente. */
function Anello({
  resta,
  tempoMs,
  secondi,
  urgente,
  acceso = true,
  grande = false,
  etichetta,
}: {
  resta: number
  tempoMs: number
  secondi: number
  urgente: boolean
  acceso?: boolean
  grande?: boolean
  etichetta: string
}) {
  return (
    <span
      className={`ghi-tempo${grande ? ' ghi-tempo--grande' : ''}${acceso ? ' is-acceso' : ''}${urgente ? ' is-poco' : ''}`}
      role="timer"
      aria-label={etichetta}
    >
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle className="ghi-tempo__fondo" cx="22" cy="22" r={RAGGIO_ANELLO} />
        <circle
          className="ghi-tempo__anello"
          cx="22"
          cy="22"
          r={RAGGIO_ANELLO}
          strokeDasharray={GIRO_ANELLO}
          strokeDashoffset={GIRO_ANELLO * (1 - resta / tempoMs)}
        />
      </svg>
      <span className="ghi-tempo__n u-tabnum" aria-hidden="true">
        {secondi}
      </span>
    </span>
  )
}

/**
 * Il tempo della coppia, accanto al titolo. Prima che parta — la coppia sta
 * entrando — e' pieno; negli ultimi cinque secondi diventa rosso, batte e si
 * sente. Finisce una volta sola, e solo mentre si sceglie: una scelta gia' in
 * viaggio decide da sola.
 */
function Clessidra({
  orologio,
  tempoMs,
  adesso: ora,
  attiva,
  ferma,
  onScade,
}: {
  orologio: { inizio: number; scadenza: number }
  tempoMs: number
  adesso: () => number
  attiva: boolean
  ferma: boolean
  onScade: () => void
}) {
  const [adesso, setAdesso] = useState(ora)
  const finita = useRef(false)
  const accesa = adesso >= orologio.inizio
  const resta = Math.max(0, Math.min(tempoMs, orologio.scadenza - adesso))
  const secondi = Math.ceil(resta / 1000)
  const urgente = accesa && !ferma && secondi <= 5

  useEffect(() => {
    if (ferma) return
    const t = window.setInterval(() => setAdesso(ora()), 100)
    return () => window.clearInterval(t)
  }, [ferma, ora])

  const ultimoTic = useRef<number | null>(null)
  useEffect(() => {
    if (!accesa || ferma) return
    if (secondi <= 5 && secondi > 0 && ultimoTic.current !== secondi) {
      ultimoTic.current = secondi
      suona('tic')
    }
    if (resta <= 0 && attiva && !finita.current) {
      finita.current = true
      onScade()
    }
  }, [accesa, attiva, ferma, onScade, resta, secondi])

  return (
    <Anello
      resta={resta}
      tempoMs={tempoMs}
      secondi={secondi}
      urgente={urgente}
      acceso={accesa}
      etichetta={`${secondi} secondi per scegliere`}
    />
  )
}

/* ─────────────────────────────  Il minuto  ───────────────────────────── */

/** Quante lettere si scrivono al piu': la parola vincente non e' mai cosi' lunga. */
const MASSIMO_RISPOSTA = 16

/**
 * Il tempo della parola vincente: l'anello che si svuota, la parola che si
 * compone a ogni tasto, e la tastiera del gioco, come nella Catena. Le cinque
 * parole intanto sono salite sul palco, e si leggono ancora.
 */
function Finale({
  scadenza,
  tempoMs,
  adesso: ora,
  onRispondi,
  onScade,
}: {
  scadenza: number | null
  tempoMs: number
  adesso: () => number
  onRispondi: (parola: string) => void
  onScade: () => void
}) {
  const [testo, setTesto] = useState('')
  const [adesso, setAdesso] = useState(ora)
  const scaduto = useRef(false)
  const resta = scadenza === null ? tempoMs : Math.max(0, scadenza - adesso)
  const secondi = Math.ceil(resta / 1000)
  const libera = resta > 0

  useEffect(() => {
    const t = window.setInterval(() => setAdesso(ora()), 200)
    return () => window.clearInterval(t)
  }, [ora])

  // Gli ultimi dieci secondi si sentono, e allo zero il tempo e' finito.
  const ultimoTic = useRef<number | null>(null)
  useEffect(() => {
    if (secondi <= 10 && secondi > 0 && ultimoTic.current !== secondi) {
      ultimoTic.current = secondi
      suona('tic')
    }
    if (resta <= 0 && !scaduto.current) {
      scaduto.current = true
      suona('scaduto')
      onScade()
    }
  }, [secondi, resta, onScade])

  const scrivi = useCallback(
    (l: string) => {
      if (!libera) return
      setTesto((t) => (t.length >= MASSIMO_RISPOSTA ? t : t + l))
      suona('tocco', { volume: 0.6 })
    },
    [libera],
  )
  const cancella = useCallback(() => {
    if (libera) setTesto((t) => t.slice(0, -1))
  }, [libera])
  const invia = useCallback(() => {
    if (libera && testo.length > 0) onRispondi(testo)
  }, [libera, onRispondi, testo])
  useTastieraFisica(true, { onLettera: scrivi, onCancella: cancella, onInvio: invia })

  const lettere = [...testo.toUpperCase()]
  return (
    <div className="ghi-finale">
      <div className="ghi-testa">
        <p className="ghi-testa__titolo">La parola vincente</p>
        <button type="button" className="ghi-nonso" disabled={!libera} onClick={() => onRispondi('')}>
          Non lo so
        </button>
        <Anello
          resta={resta}
          tempoMs={tempoMs}
          secondi={secondi}
          urgente={secondi <= 10}
          grande
          etichetta={`${secondi} secondi`}
        />
      </div>
      <p
        className={`ghi-riga${lettere.length === 0 ? ' is-vuota' : ''}`}
        role="img"
        aria-label={testo ? `Hai scritto ${testo.toUpperCase()}` : 'Scrivi la parola vincente'}
        style={{ '--n': Math.max(lettere.length + 1, 9) } as CSSProperties}
      >
        {lettere.length === 0 && <span className="ghi-riga__invito">Scrivi la vincente</span>}
        {lettere.map((l, i) => (
          <span key={i} className="ghi-riga__lettera" aria-hidden="true">
            {l}
          </span>
        ))}
        {libera && lettere.length < MASSIMO_RISPOSTA && <span className="ghi-cursore" aria-hidden="true" />}
      </p>
      <TastieraGioco
        className="ghi-tastiera"
        disabled={!libera}
        pronta={testo.length > 0}
        invio="Invia"
        onLettera={scrivi}
        onCancella={cancella}
        onInvio={invia}
      />
    </div>
  )
}

/* ─────────────────────────────  La busta  ───────────────────────────── */

/**
 * La busta della parola vincente: arriva col sigillo e trema mentre il
 * conduttore la apre; poi dice quel che si era scritto e la parola vincente,
 * una lettera alla volta, come le caselle che si girano: verdi se e' quella
 * scritta, d'oro se no.
 */
function Busta({
  soluzione,
  risposta,
  indovinata,
}: {
  soluzione: string | null
  risposta: string | null
  indovinata: boolean
}) {
  const lettere = soluzione ? [...normalizzaGhigliottina(soluzione).toUpperCase()] : []
  const scritta = risposta ? normalizzaGhigliottina(risposta).toUpperCase() : ''
  return (
    <div className={`ghi-busta${soluzione ? ' is-aperta' : ''}`}>
      {soluzione ? (
        <>
          <p className="ghi-busta__scritta">{scritta ? `Hai scritto ${scritta}` : 'Nessuna risposta'}</p>
          <p className="ghi-busta__lettere" aria-label={`La parola vincente è ${soluzione.toUpperCase()}`}>
            {lettere.map((l, i) => (
              <span
                key={i}
                className={`ghi-busta__lettera${indovinata ? ' is-giusta' : ''}`}
                style={{ '--i': i } as CSSProperties}
                aria-hidden="true"
              >
                {l}
              </span>
            ))}
          </p>
        </>
      ) : (
        <>
          <span className="ghi-busta__sigillo" aria-hidden="true">
            ?
          </span>
          <p className="ghi-busta__scritta" role="status">
            La parola vincente è…
          </p>
        </>
      )}
    </div>
  )
}

/* ─────────────────────────────  La fine  ───────────────────────────── */

/**
 * La fine, su una carta sopra la scena: la parola vincente, le cinque
 * espressioni con la parola e la vincente in evidenza, i punti nel timbro, e
 * sotto quel che aggiunge la pagina (la prossima, un'altra, la sfida).
 */
function Fine({
  coppie,
  soluzione,
  indovinata,
  punti,
  children,
}: {
  coppie: CoppiaGhigliottinaVista[]
  soluzione: string | null
  indovinata: boolean
  punti: number
  children: ReactNode
}) {
  return (
    <div className="ghi-velo">
      <section className="ghi-fine" aria-label="Fine partita">
        <span className="ghi-fine__icona">
          <IconaGioco gioco="ghigliottina" lato={64} giro={-6} />
        </span>
        <h2 className="ghi-fine__titolo">{indovinata ? 'Indovinata!' : 'Peccato!'}</h2>
        {soluzione && <p className="ghi-fine__riga">La parola vincente era {soluzione.toUpperCase()}</p>}
        <ul className="ghi-espressioni" aria-label="Le espressioni">
          {coppie.map((c, i) => {
            if (c.giusta === null) return null
            const parola = c.parole[c.giusta]
            const sbagliata = c.scaduta || (c.scelta !== null && c.scelta !== c.giusta)
            return (
              <li key={i} className={`ghi-espressione${sbagliata ? ' is-tagliata' : ''}`}>
                <span className="ghi-espressione__parola">
                  {sbagliata && <span className="ghi-espressione__taglio" aria-label="sbagliata" />}
                  {parola.toUpperCase()}
                </span>
                <span className="ghi-espressione__frase">
                  {c.spiegazione &&
                    partiDi(c.spiegazione, parola, soluzione).map((p, j) =>
                      p.tipo === 'testo' ? (
                        <span key={j}>{p.testo}</span>
                      ) : (
                        <strong key={j} className={`is-${p.tipo}`}>
                          {p.testo}
                        </strong>
                      ),
                    )}
                </span>
              </li>
            )
          })}
        </ul>
        <span className={`ghi-fine__timbro u-tabnum${indovinata ? ' is-vinta' : ''}`}>
          {punti}
          <span className="u-visually-hidden"> punti</span>
        </span>
        <div className="ghi-fine__piede">{children}</div>
      </section>
    </div>
  )
}
