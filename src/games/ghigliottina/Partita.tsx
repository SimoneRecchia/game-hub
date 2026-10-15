import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@/components/Button'
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
  return v.iniziata ? 'coppia' : 'intro'
}

/**
 * Fa scivolare dal posto di prima a quello nuovo gli elementi che cambiano
 * posto quando cambia `chiave` (FLIP): le cinque parole che salgono sopra la
 * tastiera, la ghigliottina che si fa piccola. `sposta` li porta per il centro,
 * `scala` li rimpicciolisce anche, dall'alto: la ghigliottina ha le sue
 * proporzioni, e scalata resta lei. I posti si misurano a ogni disegno, cosi'
 * quelli di prima sono quelli che si vedevano davvero.
 */
function useScivola(
  contenitore: { current: HTMLElement | null },
  selettori: { sposta: string; scala: string },
  chiave: unknown,
) {
  const posti = useRef(new Map<Element, DOMRect>())
  const ultima = useRef(chiave)
  useLayoutEffect(() => {
    const el = contenitore.current
    if (!el) return
    const sposta = [...el.querySelectorAll(selettori.sposta)]
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
      // Una parola dopo l'altra, come se salissero in fila.
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
          if (Math.abs(s - 1) < 0.01) return null
          const dx = p.left + p.width / 2 - (d.left + d.width / 2)
          return `translate(${dx}px, ${p.top - d.top}px) scale(${s})`
        }),
      )
    }
    ultima.current = chiave
    posti.current = new Map([...sposta, ...scala].map((e) => [e, e.getBoundingClientRect()]))
  })
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
  subito = false,
}: {
  vista: VistaGhigliottina
  comandi: ComandiGhigliottina
  fine: ReactNode
  /** Senza il Comincia: in una sfida il tre-due-uno l'ha gia' fatto. */
  subito?: boolean
}) {
  const [mostrata, setMostrata] = useState(vista)
  const [fase, setFase] = useState<Fase>(() => faseDi(vista))
  const [scelta, setScelta] = useState<0 | 1 | null>(null)
  /** La coppia di adesso si e' chiusa per il tempo, non per una scelta. */
  const [scaduta, setScaduta] = useState(false)
  const [lama, setLama] = useState<PosizioneLama>(vista.finita && vista.indovinata === false ? 'giu' : 'alta')
  const [colpi, setColpi] = useState(0)
  /**
   * Il montepremi tagliato: il valore di prima, che si spacca, quello di dopo,
   * che c'e' gia' sotto i pezzi, e il numero del colpo, che fa ripartire
   * l'animazione.
   */
  const [taglio, setTaglio] = useState<Taglio | null>(null)
  /** La coppia appena scelta, con l'esito, mentre la parola giusta vola nella colonna. */
  const [esito, setEsito] = useState<{ coppia: CoppiaGhigliottinaVista; indice: number } | null>(null)
  const montata = useRef(true)
  const inVolo = useRef(false)
  const scena = useRef<HTMLDivElement>(null)
  useEffect(
    () => () => {
      montata.current = false
    },
    [],
  )

  // Il tempo finito: il server ha chiuso la partita, e la vista arriva finita.
  useEffect(() => {
    if (fase === 'finale' && vista.finita) {
      setMostrata(vista)
      setFase('verdetto')
      setLama('giu')
      setTaglio({ prima: mostrata.montepremi, dopo: vista.punti, n: Date.now(), tutto: true })
      suona('lama')
      suona('sconfitta', { ritardo: 0.5 })
    }
  }, [fase, vista, mostrata.montepremi])

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

  /**
   * Una scelta, o il tempo della coppia finito (`null`): il rullo, poi la
   * parola giusta che si accende; se era sbagliata, o se il tempo e' finito,
   * cala la lama e il montepremi si spacca, con quello sceso gia' sotto.
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
            },
            ridotto() ? 0 : 200,
          )
          window.setTimeout(() => montata.current && setLama('alta'), ridotto() ? 100 : 900)
          await aspetta(t.sbagliata)
        }
        if (!montata.current) return
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
        window.setTimeout(
          () => {
            if (!montata.current) return
            setLama('giu')
            setTaglio({ prima: dopo.montepremi, dopo: dopo.punti, n: Date.now(), tutto: true })
            suona('lama')
            suona('sconfitta', { ritardo: 0.4 })
          },
          ridotto() ? 0 : 1300,
        )
      }
    },
    [fase, comandi],
  )

  const indovinata = mostrata.finita && mostrata.indovinata === true
  const valore = fase === 'fine' || fase === 'verdetto' ? mostrata.punti : mostrata.montepremi
  // Mentre si scrive la parola vincente le cinque parole salgono sopra la tastiera, e la ghigliottina si fa piccola.
  const compatta = fase === 'finale' || fase === 'busta' || fase === 'verdetto'
  useScivola(scena, { sposta: '.ghi-slot', scala: '.ghi-palco__macchina' }, compatta)

  return (
    <div
      ref={scena}
      className={
        `ghi is-${fase}${compatta ? ' is-compatta' : ''}` +
        `${indovinata && (fase === 'verdetto' || fase === 'fine') ? ' is-vinta' : ''}`
      }
    >
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
              In ogni coppia una sola parola porta alla parola vincente: hai pochi secondi per sceglierla. Ogni
              errore toglie {ERRORE_GHIGLIOTTINA} punti al montepremi.
            </p>
            <Button size="lg" onClick={() => void comincia()}>
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
            scaduta={scaduta}
            fase={fase}
            orologio={mostrata.orologioCoppia}
            tempoMs={mostrata.tempoSceltaMs}
            onScegli={scegli}
          />
        )}

        {fase === 'cinque' && (
          <p className="ghi-annuncio" role="status">
            Le cinque parole. {durataFinale(mostrata.tempoFinaleMs)} per la parola vincente!
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

/** Il tempo della parola vincente, come lo dice il conduttore: "Un minuto e mezzo". */
function durataFinale(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s === 60) return 'Un minuto'
  if (s === 90) return 'Un minuto e mezzo'
  if (s % 60 === 0) return `${s / 60} minuti`
  return `${s} secondi`
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
        const sbagliata = nota !== null && (nota.scaduta || (nota.scelta !== null && nota.scelta !== nota.giusta))
        return (
          <li
            key={i}
            className={`ghi-slot${parola ? ' is-piena' : ''}${sbagliata ? ' is-tagliata' : ''}`}
            style={{ '--i': i } as CSSProperties}
          >
            <span className="ghi-slot__n">{i + 1}</span>
            <span className="ghi-slot__parola">{parola ?? ''}</span>
            {sbagliata && (
              <span className="ghi-slot__taglio" aria-label={nota?.scaduta ? 'tempo finito' : 'scelta sbagliata'} />
            )}
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
  scaduta,
  fase,
  orologio,
  tempoMs,
  onScegli,
}: {
  numero: number
  coppia: CoppiaGhigliottinaVista
  scelta: 0 | 1 | null
  /** Il tempo e' finito senza una scelta. */
  scaduta: boolean
  fase: Fase
  orologio: { inizio: number; scadenza: number } | null
  tempoMs: number
  /** Una parola, o null quando il tempo finisce. */
  onScegli: (i: 0 | 1 | null) => void
}) {
  const libera = fase === 'coppia'
  return (
    <div
      className={`ghi-coppia is-${fase}${scaduta ? ' is-scaduta' : ''}`}
      role="group"
      aria-label={`Coppia ${numero} di 5`}
    >
      <div className="ghi-coppia__testa">
        <p className="ghi-coppia__titolo">Coppia {numero}</p>
        {orologio && (
          <Clessidra
            orologio={orologio}
            tempoMs={tempoMs}
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
        {scaduta && (fase === 'attesa' || fase === 'esito')
          ? 'Tempo scaduto!'
          : fase === 'attesa'
            ? 'Vediamo…'
            : fase === 'esito'
              ? scelta === coppia.giusta
                ? 'Giusta!'
                : 'Sbagliata!'
              : ''}
      </p>
    </div>
  )
}

const RAGGIO_COPPIA = 15
const GIRO_COPPIA = 2 * Math.PI * RAGGIO_COPPIA

/**
 * Il tempo della coppia: un anello accanto al titolo che si svuota, con i
 * secondi dentro. Prima che parta — la coppia sta entrando — e' pieno; negli
 * ultimi cinque secondi diventa rosso, batte e si sente. Finisce una volta
 * sola, e solo mentre si sceglie: una scelta gia' in viaggio decide da sola.
 */
function Clessidra({
  orologio,
  tempoMs,
  attiva,
  ferma,
  onScade,
}: {
  orologio: { inizio: number; scadenza: number }
  tempoMs: number
  attiva: boolean
  ferma: boolean
  onScade: () => void
}) {
  const [adesso, setAdesso] = useState(() => Date.now())
  const finita = useRef(false)
  const accesa = adesso >= orologio.inizio
  const resta = Math.max(0, Math.min(tempoMs, orologio.scadenza - adesso))
  const secondi = Math.ceil(resta / 1000)
  const urgente = accesa && secondi <= 5

  useEffect(() => {
    if (ferma) return
    const t = window.setInterval(() => setAdesso(Date.now()), 100)
    return () => window.clearInterval(t)
  }, [ferma])

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
    <span
      className={`ghi-clessidra${accesa ? ' is-accesa' : ''}${urgente ? ' is-urgente' : ''}`}
      role="timer"
      aria-label={`${secondi} secondi per scegliere`}
    >
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="ghi-clessidra__fondo" cx="18" cy="18" r={RAGGIO_COPPIA} />
        <circle
          className="ghi-clessidra__anello"
          cx="18"
          cy="18"
          r={RAGGIO_COPPIA}
          strokeDasharray={GIRO_COPPIA}
          strokeDashoffset={GIRO_COPPIA * (1 - resta / tempoMs)}
        />
      </svg>
      <span className="ghi-clessidra__secondi u-tabnum" aria-hidden="true">
        {secondi}
      </span>
    </span>
  )
}

/* ─────────────────────────────  Il minuto  ───────────────────────────── */

const RAGGIO = 26
const GIRO = 2 * Math.PI * RAGGIO

/** Quante lettere si scrivono al piu': la parola vincente non e' mai cosi' lunga. */
const MASSIMO_RISPOSTA = 16

/**
 * Il tempo della parola vincente: l'anello che si svuota, la parola che si
 * compone a ogni tasto, e la tastiera del gioco, come nella Catena. Le cinque
 * parole intanto sono salite sopra, piccole, e si leggono ancora.
 */
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
  const resta = scadenza === null ? tempoMs : Math.max(0, scadenza - adesso)
  const secondi = Math.ceil(resta / 1000)
  const libera = !inviata && resta > 0

  useEffect(() => {
    if (inviata) return
    const t = window.setInterval(() => setAdesso(Date.now()), 200)
    return () => window.clearInterval(t)
  }, [inviata])

  // Gli ultimi dieci secondi si sentono, e allo zero il tempo e' finito.
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
  useTastieraFisica(!inviata, { onLettera: scrivi, onCancella: cancella, onInvio: invia })

  const lettere = [...testo.toUpperCase()]
  return (
    <div className={`ghi-finale${secondi <= 10 ? ' is-urgente' : ''}${inviata ? ' is-inviata' : ''}`}>
      <div className="ghi-finale__riga">
        <div className="ghi-finale__tempo" role="timer" aria-label={`${secondi} secondi`}>
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
        <p
          className="ghi-finale__parola"
          role="img"
          aria-label={testo ? `Hai scritto ${testo.toUpperCase()}` : 'Scrivi la parola vincente'}
          style={{ '--n': Math.max(lettere.length + 1, 8) } as CSSProperties}
        >
          {lettere.length === 0 && <span className="ghi-finale__invito">La parola vincente</span>}
          {lettere.map((l, i) => (
            <span key={i} className="ghi-finale__lettera" aria-hidden="true">
              {l}
            </span>
          ))}
          {libera && lettere.length < MASSIMO_RISPOSTA && <span className="ghi-finale__cursore" aria-hidden="true" />}
        </p>
      </div>
      <button type="button" className="ghi-finale__nonso" disabled={!libera} onClick={() => onRispondi('')}>
        Non lo so
      </button>
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
            ? `Hai scritto «${risposta.toUpperCase()}»: ${punti} punti`
            : `Nessuna risposta: ${punti} punti`}
      </p>
    </div>
  )
}
