import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { IconaGioco } from '@/components/IconaGioco'
import { TastieraGioco, useTastieraFisica } from '@/components/TastieraGioco'
import { suona } from '@/lib/suoni'
import {
  DA_INDOVINARE_CATENA,
  ERRORE_CATENA,
  NASCOSTE_CATENA,
  PASSO_FINALE,
  normalizzaCatena,
  type EsitoMossaCatena,
  type TerzoElemento,
  type VoceCatena,
} from '@shared/catena'
import './Catena.css'

/** Quel che serve alla scena, dalla classificata (il server) o dalla libera (il telefono). */
export interface VistaCatena {
  /** Cambia a ogni mossa: dice alla scena che lo stato e' nuovo. */
  chiave: number
  /** Nessuna mossa ancora: la scena comincia dalla presentazione. */
  nuova: boolean
  voci: VoceCatena[]
  passo: number
  jollyRestanti: number
  jollyUsabile: boolean
  terzo: TerzoElemento
  compraUsabile: boolean
  montepremiIniziale: number
  montepremi: number
  /** Il minuto della parola di adesso, prima della finale, sull'orologio del telefono: quando parte e finisce. */
  parola: { inizio: number; scadenza: number } | null
  tempoParolaMs: number
  /** Il tempo della parola finale. */
  finale: { inizio: number; scadenza: number } | null
  tempoFinaleMs: number
  risposta: string | null
  indovinata: boolean | null
  finita: boolean
  punti: number
}

export interface RispostaCatena {
  vista: VistaCatena
  esito: EsitoMossaCatena | null
}

export interface ComandiCatena {
  /** Comincia: la prima coppia arriva, e il suo minuto parte dopo la scena. */
  inizia: () => Promise<RispostaCatena | null>
  /** Il minuto della parola e' finito: si mostra, e costa come due errori. */
  scadeParola: () => Promise<RispostaCatena | null>
  /** Una parola della catena: torna la vista dopo, con l'esito, o null se non e' andata. */
  prova: (parola: string) => Promise<RispostaCatena | null>
  jolly: () => Promise<RispostaCatena | null>
  /** Il terzo elemento della finale, che costa quanto un errore. */
  compra: () => Promise<RispostaCatena | null>
  rispondi: (parola: string) => Promise<RispostaCatena | null>
  /** Il tempo della finale e' finito sul telefono senza una risposta. */
  scade: () => void
}

/**
 * I momenti della partita, come in studio: la presentazione, una parola da
 * trovare, l'attesa, l'esito, la catena che scende alla coppia dopo, la parola
 * finale annunciata, il minuto, la busta, il verdetto, la fine.
 */
type Fase = 'intro' | 'gioco' | 'attesa' | 'esito' | 'scorre' | 'preambolo' | 'finale' | 'busta' | 'verdetto' | 'fine'

const ridotto = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** I tempi della scena, in millisecondi; senza animazioni bastano pochi istanti. */
function tempi() {
  const r = ridotto()
  return {
    /** Le maglie che cadono una dopo l'altra, all'inizio. */
    entrata: r ? 100 : 1300,
    /** Fra l'invio e l'esito: le caselle che pulsano. */
    attesa: r ? 150 : 650,
    /** Le lettere che si accendono di verde, e le maglie che si chiudono. */
    giusta: r ? 300 : 1250,
    /** Le lettere sbagliate che tremano e cadono. */
    sbagliata: r ? 250 : 750,
    /** La parola mostrata dopo il secondo errore, una lettera alla volta. */
    rivelata: r ? 400 : 1500,
    /** La catena che scende alla coppia dopo. */
    scorre: r ? 100 : 800,
    /** Il rullo prima del verdetto della parola finale. */
    busta: r ? 300 : 1800,
    /** Le lettere della parola finale che si girano, prima della fine. */
    verdetto: r ? 600 : 3200,
  }
}

const aspetta = (ms: number) => new Promise<void>((risolvi) => window.setTimeout(risolvi, ms))

/** Quanto resta sul palco un adesivo: "Giusta!", "−10", "Jolly!". */
const DURATA_ADESIVO_MS = 1_300

/** Quanto cade la parola sbagliata sotto il riquadro. */
const DURATA_CADUTA_MS = 1_400

interface AdesivoPalco {
  testo: string
  tono: 'vivace' | 'bordato'
  /** Cambia a ogni adesivo: fa ripartire l'animazione. */
  n: number
}

/** La fase da cui riprende una partita riaperta. */
function faseDi(v: VistaCatena, adesso: number): Fase {
  if (v.finita) return 'fine'
  if (v.passo >= PASSO_FINALE) return v.finale && adesso < v.finale.inizio ? 'preambolo' : 'finale'
  return v.nuova ? 'intro' : 'gioco'
}

/** La parola da indovinare adesso: l'unica nascosta. */
const correnteDi = (v: VistaCatena) => v.voci.find((x) => x.tipo === 'nascosta') ?? null

/**
 * Quante lettere si scrivono al piu': la lunghezza non si sa, e la parola cresce
 * a ogni tasto finché non sembra finita; il tetto e' solo quello dello schermo.
 */
const MASSIMO_LETTERE = 16

/** Le lettere che si possono ancora scrivere: dopo quelle che si vedono, e prima dell'ultima nella finale. */
const spazioDi = (voce: VoceCatena | null) =>
  voce ? Math.max(0, MASSIMO_LETTERE - voce.lettere.length - (voce.ultima ? 1 : 0)) : 0

/**
 * La Catena in scena: in cima il montepremi, le cinque maglie e i jolly; in
 * mezzo la catena, una parola sotto l'altra, con la coppia di adesso grande e
 * quelle passate che salgono e si spengono; in fondo la tastiera del gioco. La
 * scena va un passo dietro allo stato vero: la parola va subito al server, ma
 * com'e' andata si vede dopo un respiro, e la catena scende solo quando le
 * maglie si sono chiuse.
 */
export function PartitaCatena({
  vista,
  comandi,
  fine,
  subito = false,
  adesso = Date.now,
}: {
  vista: VistaCatena
  comandi: ComandiCatena
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
  const [fase, setFase] = useState<Fase>(() => faseDi(vista, adesso()))
  /** La coppia su cui sta la catena: scende un passo dietro allo stato. */
  const [passoVisto, setPassoVisto] = useState(vista.passo)
  /** Le lettere scritte nelle caselle vuote. */
  const [scritte, setScritte] = useState('')
  /** L'esito della mossa appena fatta, per le caselle: verdi, rosse che tremano, arancio. */
  const [esito, setEsito] = useState<EsitoMossaCatena | null>(null)
  /** Il montepremi sceso, o caduto: il valore di prima che vola via, quanto si e' perso, e il numero del colpo. */
  const [taglio, setTaglio] = useState<Taglio | null>(null)
  /** La riga sotto la catena: com'e' andata, o che cosa succede. */
  const [stato, setStato] = useState<string>('')
  /** Le parole che cadono al loro posto, appena dopo Comincia. */
  const [entra, setEntra] = useState(false)
  /** Il terzo elemento regalato si scopre a meta' dell'annuncio. */
  const [terzoCoperto, setTerzoCoperto] = useState(false)
  /** Il momento che conta, sul palco: se ne va da solo. */
  const [adesivo, setAdesivo] = useState<AdesivoPalco | null>(null)
  /** La parola sbagliata, barrata, che cade sotto il riquadro. */
  const [caduta, setCaduta] = useState<{ testo: string; n: number } | null>(null)
  const montata = useRef(true)
  const inVolo = useRef(false)
  // Rimessa a vero a ogni montaggio: in sviluppo React monta, smonta e rimonta, e restava falsa.
  useEffect(() => {
    montata.current = true
    return () => {
      montata.current = false
    }
  }, [])

  const attacca = useCallback((testo: string, tono: AdesivoPalco['tono']) => {
    setAdesivo((a) => ({ testo, tono, n: (a?.n ?? 0) + 1 }))
  }, [])
  const nAdesivo = adesivo?.n
  useEffect(() => {
    if (nAdesivo === undefined) return
    const t = window.setTimeout(() => setAdesivo(null), DURATA_ADESIVO_MS)
    return () => window.clearTimeout(t)
  }, [nAdesivo])
  const nCaduta = caduta?.n
  useEffect(() => {
    if (nCaduta === undefined) return
    const t = window.setTimeout(() => setCaduta(null), DURATA_CADUTA_MS)
    return () => window.clearTimeout(t)
  }, [nCaduta])

  const corrente = correnteDi(mostrata)
  const spazio = spazioDi(corrente)
  const finale = mostrata.passo >= PASSO_FINALE

  /** La vista nuova, e con lei il montepremi che scende, se e' sceso: di quel che si e' perso, o della meta'. */
  const mostra = useCallback((dopo: VistaCatena, prima: VistaCatena, dimezzato = false) => {
    if (dopo.montepremi < prima.montepremi) {
      const perso = prima.montepremi - dopo.montepremi
      setTaglio({ prima: prima.montepremi, perso, n: Date.now(), tutto: false, dimezzato })
      suona('dimezza')
    }
    setMostrata(dopo)
  }, [])

  // Uno stato arrivato da fuori — un altro telefono, una scrittura rifiutata e riletta, il minuto finito —
  // prende il posto di quello mostrato, se la scena non sta raccontando niente.
  useEffect(() => {
    if (inVolo.current || vista.chiave === mostrata.chiave) return
    if (fase === 'finale' && vista.finita) {
      // Il minuto e' finito: il server ha chiuso la partita.
      setMostrata(vista)
      setStato('Tempo scaduto!')
      setFase('verdetto')
      attacca('Tempo!', 'bordato')
      suona('scaduto')
      suona('sconfitta', { ritardo: 0.5 })
      return
    }
    if (fase === 'gioco' || fase === 'finale' || fase === 'intro') {
      setMostrata(vista)
      setPassoVisto(vista.passo)
      setScritte('')
      setFase(faseDi(vista, adesso()) === 'intro' ? fase : faseDi(vista, adesso()))
    }
  }, [vista, mostrata.chiave, fase, attacca, adesso])

  // Comincia: la prima coppia arriva dal server, e cade al suo posto, una maglia dopo l'altra.
  const comincia = useCallback(async () => {
    if (inVolo.current) return
    inVolo.current = true
    try {
      const r = await comandi.inizia()
      if (!montata.current || !r) return
      setMostrata(r.vista)
      setPassoVisto(r.vista.passo)
      setFase(faseDi(r.vista, adesso()) === 'intro' ? 'gioco' : faseDi(r.vista, adesso()))
      setEntra(true)
      window.setTimeout(() => montata.current && setEntra(false), tempi().entrata)
      for (let i = 0; i < 3; i += 1) suona('maglia', { ritardo: 0.15 + i * 0.28, altezza: 1 + i * 0.08 })
    } finally {
      inVolo.current = false
    }
  }, [comandi, adesso])

  // In una sfida si comincia da soli, con la stessa entrata del Comincia.
  const partita = useRef(false)
  useEffect(() => {
    if (!subito || partita.current || fase !== 'intro') return
    partita.current = true
    void comincia()
  }, [comincia, fase, subito])

  // La parola finale annunciata: il nastro, il terzo elemento in regalo, e il minuto quando parte.
  useEffect(() => {
    if (fase !== 'preambolo') return
    let fermo = false
    const regalato = mostrata.terzo === 'regalato'
    setTerzoCoperto(regalato && !ridotto())
    suona('intermezzo')
    const inizio = mostrata.finale?.inizio ?? adesso()
    const timer: number[] = []
    if (regalato) {
      timer.push(
        window.setTimeout(
          () => {
            if (fermo) return
            setTerzoCoperto(false)
            suona('magia')
          },
          ridotto() ? 0 : Math.max(0, Math.min(2000, inizio - adesso() - 1500)),
        ),
      )
    }
    timer.push(
      window.setTimeout(
        () => {
          if (fermo) return
          setFase('finale')
          suona('via')
        },
        Math.max(0, inizio - adesso()),
      ),
    )
    return () => {
      fermo = true
      timer.forEach((t) => window.clearTimeout(t))
    }
  }, [fase, mostrata.terzo, mostrata.finale, adesso])

  // Il verdetto: le lettere si girano, e poi la fine con le espressioni.
  useEffect(() => {
    if (fase !== 'verdetto') return
    const timer = window.setTimeout(() => setFase('fine'), tempi().verdetto)
    return () => window.clearTimeout(timer)
  }, [fase])

  /** La catena scende alla coppia dopo: le maglie della parola trovata si chiudono, e la scena si sposta. */
  const scendi = useCallback(async (dopo: VistaCatena) => {
    const t = tempi()
    setFase('scorre')
    setPassoVisto(dopo.passo)
    suona('carta')
    await aspetta(t.scorre)
    if (!montata.current) return
    setFase(dopo.passo >= PASSO_FINALE ? (dopo.finita ? 'fine' : 'preambolo') : 'gioco')
  }, [])

  const prova = useCallback(async () => {
    if (fase !== 'gioco' || !corrente || scritte.length === 0) return
    const t = tempi()
    const prima = mostrata
    const parola = corrente.lettere.toLowerCase() + scritte
    inVolo.current = true
    setFase('attesa')
    setStato('Vediamo…')
    suona('tocco')
    try {
      const [r] = await Promise.all([comandi.prova(parola), aspetta(t.attesa)])
      if (!montata.current) return
      if (!r) {
        setFase('gioco')
        setStato('')
        return
      }
      const { vista: dopo, esito: e } = r
      setEsito(e)
      setFase('esito')
      if (e === 'giusta') {
        setStato('Giusta!')
        attacca('Giusta!', 'vivace')
        suona('giusto')
        setMostrata(dopo)
        setScritte('')
        for (let i = 0; i < 2; i += 1) suona('maglia', { ritardo: 0.45 + i * 0.22, altezza: 1.1 + i * 0.1 })
        await aspetta(t.giusta)
      } else {
        setStato(e === 'rivelata' ? 'Sbagliata! Ecco la parola' : 'Sbagliata! Una lettera in più')
        attacca(`−${Math.max(0, prima.montepremi - dopo.montepremi)}`, 'bordato')
        setCaduta((c) => ({ testo: parola.toUpperCase(), n: (c?.n ?? 0) + 1 }))
        suona('sbagliato')
        await aspetta(t.sbagliata)
        if (!montata.current) return
        setScritte('')
        mostra(dopo, prima)
        if (e === 'rivelata') {
          suona('svela', { ritardo: 0.2 })
          await aspetta(t.rivelata)
        }
      }
      if (!montata.current) return
      setEsito(null)
      setStato('')
      if (dopo.passo !== prima.passo) await scendi(dopo)
      else setFase('gioco')
    } finally {
      inVolo.current = false
    }
  }, [fase, corrente, scritte, mostrata, comandi, mostra, scendi, attacca])

  /** Il minuto della parola e' finito: la miccia si spegne, la parola si mostra, e la catena scende. */
  const scadeParola = useCallback(async () => {
    if (fase !== 'gioco' || inVolo.current) return
    const t = tempi()
    const prima = mostrata
    inVolo.current = true
    setFase('attesa')
    setStato('Tempo scaduto!')
    suona('scaduto')
    try {
      const r = await comandi.scadeParola()
      if (!montata.current) return
      if (!r) {
        setFase('gioco')
        setStato('')
        return
      }
      const dopo = r.vista
      setEsito('scaduta')
      setFase('esito')
      setStato('Tempo scaduto! Ecco la parola')
      attacca('Tempo!', 'bordato')
      setScritte('')
      mostra(dopo, prima)
      suona('svela', { ritardo: 0.2 })
      await aspetta(t.rivelata)
      if (!montata.current) return
      setEsito(null)
      setStato('')
      if (dopo.passo !== prima.passo) await scendi(dopo)
      else setFase(dopo.finita ? 'fine' : 'gioco')
    } finally {
      inVolo.current = false
    }
  }, [fase, mostrata, comandi, mostra, scendi, attacca])

  const jolly = useCallback(async () => {
    if ((fase !== 'gioco' && fase !== 'finale') || !mostrata.jollyUsabile) return
    const prima = mostrata
    const torna = fase
    inVolo.current = true
    setFase('attesa')
    try {
      const r = await comandi.jolly()
      if (!montata.current) return
      if (r) {
        setScritte('')
        mostra(r.vista, prima)
        setStato('Jolly! Una lettera in più')
        attacca('Jolly!', 'vivace')
        suona('magia')
        window.setTimeout(() => montata.current && setStato(''), 1600)
        setFase(r.vista.finita ? 'fine' : torna)
      } else setFase(torna)
    } finally {
      inVolo.current = false
    }
  }, [fase, mostrata, comandi, mostra, attacca])

  const compra = useCallback(async () => {
    if (fase !== 'finale' || !mostrata.compraUsabile) return
    const prima = mostrata
    inVolo.current = true
    setFase('attesa')
    try {
      const r = await comandi.compra()
      if (!montata.current) return
      if (r) {
        mostra(r.vista, prima, true)
        setStato('Ecco il terzo elemento')
        attacca('÷2', 'bordato')
        suona('svela', { ritardo: 0.3 })
        window.setTimeout(() => montata.current && setStato(''), 1600)
        setFase(r.vista.finita ? 'fine' : 'finale')
      } else setFase('finale')
    } finally {
      inVolo.current = false
    }
  }, [fase, mostrata, comandi, mostra, attacca])

  const rispondi = useCallback(
    async (testo: string | null) => {
      if (fase !== 'finale' || !corrente) return
      const t = tempi()
      const parola = testo === null ? '' : corrente.lettere.toLowerCase() + testo + (corrente.ultima ?? '').toLowerCase()
      inVolo.current = true
      setFase('busta')
      setStato(testo === null ? 'Nessuna risposta…' : 'Vediamo…')
      suona('tamburo', { altezza: t.busta / 1000 })
      try {
        const [r] = await Promise.all([comandi.rispondi(parola), aspetta(t.busta)])
        if (!montata.current) return
        if (!r) {
          setFase('finale')
          setStato('')
          return
        }
        const dopo = r.vista
        setScritte('')
        setMostrata(dopo)
        setFase('verdetto')
        // L'adesivo aspetta che le lettere della parola finale si siano girate.
        const voceFinale = dopo.voci.find((x) => x.posto === NASCOSTE_CATENA[PASSO_FINALE])
        const lettere = voceFinale?.parola ? normalizzaCatena(voceFinale.parola).length : 6
        const dopoLeLettere = ridotto() ? 0 : 300 + lettere * 75 + 500
        window.setTimeout(() => {
          if (!montata.current) return
          if (dopo.indovinata) attacca('Indovinata!', 'vivace')
          else attacca(testo === null ? 'Tempo!' : 'Peccato', 'bordato')
        }, dopoLeLettere)
        if (dopo.indovinata) {
          setStato(`Catena completata! ${dopo.punti} punti`)
          suona('vittoria', { ritardo: 0.6 })
        } else {
          setStato(testo === null ? `Nessuna risposta: ${dopo.punti} punti` : `Sbagliata: ${dopo.punti} punti`)
          setTaglio({
            prima: mostrata.montepremi,
            perso: mostrata.montepremi - dopo.punti,
            n: Date.now(),
            tutto: true,
            dimezzato: false,
          })
          suona('sbagliato')
          suona('sconfitta', { ritardo: 0.5 })
        }
      } finally {
        inVolo.current = false
      }
    },
    [fase, corrente, comandi, mostrata.montepremi, attacca],
  )

  const scrivi = useCallback(
    (lettera: string) => {
      if ((fase !== 'gioco' && fase !== 'finale') || scritte.length >= spazio) return
      setScritte((s) => s + lettera)
      suona('tocco', { volume: 0.6 })
    },
    [fase, scritte.length, spazio],
  )
  const cancella = useCallback(() => {
    if (fase !== 'gioco' && fase !== 'finale') return
    setScritte((s) => s.slice(0, -1))
  }, [fase])
  const invia = useCallback(() => {
    if (fase === 'gioco') void prova()
    else if (fase === 'finale' && scritte.length > 0) void rispondi(scritte)
  }, [fase, prova, rispondi, scritte])

  // La tastiera del computer: le lettere del gioco, la cancellazione e l'invio.
  useTastieraFisica(true, { onLettera: scrivi, onCancella: cancella, onInvio: invia })

  const libera = fase === 'gioco' || fase === 'finale'
  const indovinata = mostrata.finita && mostrata.indovinata === true
  const valore = fase === 'fine' || fase === 'verdetto' ? mostrata.punti : mostrata.montepremi
  const giocando = fase !== 'intro' && fase !== 'fine'

  return (
    <div
      className={
        `cat is-${fase}${finale ? ' is-alla-finale' : ''}${entra ? ' is-entra' : ''}` +
        `${indovinata && (fase === 'verdetto' || fase === 'fine') ? ' is-vinta' : ''}`
      }
    >
      <header className="cat-testa">
        <Montepremi valore={valore} taglio={taglio} vinto={indovinata && fase === 'fine'} />
        <Maglie
          voci={mostrata.voci}
          passo={fase === 'fine' || fase === 'verdetto' ? DA_INDOVINARE_CATENA : passoVisto}
          finita={fase === 'fine' || fase === 'verdetto'}
          indovinata={indovinata}
          attiva={giocando}
        />
        {finale && (fase === 'finale' || fase === 'busta') ? (
          <Minuto
            finale={mostrata.finale}
            tempoMs={mostrata.tempoFinaleMs}
            adesso={adesso}
            fermo={fase === 'busta'}
            onScade={comandi.scade}
          />
        ) : !finale && mostrata.parola && giocando ? (
          <Miccia
            // Una parola nuova ha il suo tempo, intero.
            key={`${mostrata.passo}-${mostrata.parola.inizio}`}
            orologio={mostrata.parola}
            tempoMs={mostrata.tempoParolaMs}
            adesso={adesso}
            attiva={fase === 'gioco'}
            ferma={fase === 'scorre' || fase === 'esito'}
            onScade={() => void scadeParola()}
          />
        ) : (
          <Anello resta={0} tempoMs={1} testo="" spento etichetta="Tempo fermo" />
        )}
      </header>

      <section className="cat-palco" aria-label="La catena">
        <span className="cat-palco__luci" aria-hidden="true" />
        <Binario
          voci={mostrata.voci}
          passo={passoVisto}
          fase={fase}
          esito={esito}
          scritte={scritte}
          terzoCoperto={terzoCoperto}
          caduta={caduta}
        />
        {fase === 'intro' && <Presentazione tempoParolaMs={mostrata.tempoParolaMs} tempoFinaleMs={mostrata.tempoFinaleMs} />}
        {fase === 'preambolo' && (
          <div className="cat-nastro" role="status">
            <span className="cat-nastro__testo">La parola finale</span>
            {mostrata.terzo === 'regalato' && (
              <span className="cat-nastro__sotto">Con due jolly, il terzo elemento è in regalo</span>
            )}
          </div>
        )}
        {adesivo && (
          <div
            key={adesivo.n}
            className={`cat-adesivo is-${adesivo.tono}`}
            style={{ '--durata': `${DURATA_ADESIVO_MS}ms` } as CSSProperties}
            aria-hidden="true"
          >
            <span>{adesivo.testo}</span>
          </div>
        )}
      </section>

      <p className="u-visually-hidden" role="status">
        {stato}
      </p>

      <div className="cat-azioni">
        {fase === 'intro' ? (
          <button key="comincia" type="button" className="cat-comincia" onClick={() => void comincia()}>
            Comincia
          </button>
        ) : finale ? (
          fase !== 'verdetto' &&
          fase !== 'fine' && (
            <>
              <button key="nonso" type="button" className="cat-azione is-nonso" disabled={!libera} onClick={() => void rispondi(null)}>
                Non lo so
              </button>
              {mostrata.compraUsabile && (
                <button
                  key="compra"
                  type="button"
                  className="cat-azione is-compra"
                  disabled={fase !== 'finale'}
                  onClick={() => void compra()}
                >
                  Terzo<span className="cat-azione__lungo"> elemento</span>{' '}
                  <span className="cat-azione__costo">÷2</span>
                </button>
              )}
            </>
          )
        ) : (
          // Nella finale i jolly non si usano: quel che resta e' gia' nel terzo elemento in regalo.
          <button
            key="jolly"
            type="button"
            className="cat-azione is-jolly"
            disabled={!libera || !mostrata.jollyUsabile}
            onClick={() => void jolly()}
            aria-label={`Jolly: ne restano ${mostrata.jollyRestanti}`}
          >
            <Jolly restanti={mostrata.jollyRestanti} />
            <span>
              Jolly · <span className="u-tabnum">{mostrata.jollyRestanti}</span>
            </span>
          </button>
        )}
      </div>

      <div className="cat-sotto">
        {fase !== 'intro' && fase !== 'fine' && (
          <TastieraGioco
            className={`cat-tastiera${fase === 'verdetto' ? ' is-via' : ''}`}
            disabled={!libera}
            pronta={scritte.length > 0}
            invio={finale ? 'Invia' : 'Prova'}
            onLettera={scrivi}
            onCancella={cancella}
            onInvio={invia}
          />
        )}
      </div>

      {fase === 'fine' && (
        <Fine voci={mostrata.voci} indovinata={indovinata} punti={mostrata.punti}>
          {fine}
        </Fine>
      )}
    </div>
  )
}

/* ─────────────────────────────  La presentazione  ───────────────────────────── */

/** Prima di cominciare: una catena d'esempio che dondola, e le tre regole. */
function Presentazione({ tempoParolaMs, tempoFinaleMs }: { tempoParolaMs: number; tempoFinaleMs: number }) {
  return (
    <div className="cat-pronta">
      <div className="cat-pronta__catena" aria-hidden="true">
        <span className="cat-targa is-piccola">SPIRITO</span>
        <span className="cat-maglietta" />
        <span className="cat-targa is-esempio">LIBERO</span>
        <span className="cat-maglietta" />
        <span className="cat-targa is-piccola">TIRO</span>
      </div>
      <ul className="cat-pronta__righe">
        <li className="cat-pronta__riga">
          <span className="cat-punto is-cielo" aria-hidden="true" />
          Ogni parola si lega a quella dopo
        </li>
        <li className="cat-pronta__riga">
          <span className="cat-punto is-giallo" aria-hidden="true" />
          {Math.round(tempoParolaMs / 1000)} secondi a parola, {Math.round(tempoFinaleMs / 1000)} per la finale
        </li>
        <li className="cat-pronta__riga">
          <span className="cat-punto is-rosso" aria-hidden="true" />
          Un errore: {ERRORE_CATENA} punti e un’altra lettera
        </li>
      </ul>
    </div>
  )
}

/* ─────────────────────────────  La fine  ───────────────────────────── */

/**
 * La fine, su una carta sopra la scena: la parola finale, la catena intera
 * come dieci espressioni (quelle della finale in evidenza), i punti nel timbro,
 * e sotto quel che aggiunge la pagina.
 */
function Fine({
  voci,
  indovinata,
  punti,
  children,
}: {
  voci: VoceCatena[]
  indovinata: boolean
  punti: number
  children: ReactNode
}) {
  const postoFinale = NASCOSTE_CATENA[PASSO_FINALE]
  const parolaFinale = voci.find((v) => v.posto === postoFinale)?.parola ?? null
  return (
    <div className="cat-velo">
      <section className="cat-fine" aria-label="Fine partita">
        <span className="cat-fine__icona">
          <IconaGioco gioco="catena" lato={60} giro={-6} />
        </span>
        <h2 className="cat-fine__titolo">{indovinata ? 'Indovinata!' : 'Peccato!'}</h2>
        {parolaFinale && <p className="cat-fine__riga">La finale era {parolaFinale.toUpperCase()}</p>}
        <ol className="cat-espressioni" aria-label="Le espressioni della catena">
          {voci.map((v, i) =>
            v.espressione && i < voci.length - 1 ? (
              <li
                key={v.posto}
                className={`cat-espressione${i === postoFinale - 1 || i === postoFinale ? ' is-finale' : ''}`}
                style={{ '--i': i } as CSSProperties}
              >
                {v.espressione}
              </li>
            ) : null,
          )}
        </ol>
        <span className={`cat-fine__timbro u-tabnum${indovinata ? ' is-vinta' : ''}`}>
          {punti}
          <span className="u-visually-hidden"> punti</span>
        </span>
        <div className="cat-fine__piede">{children}</div>
      </section>
    </div>
  )
}


/* ─────────────────────────────  La catena  ───────────────────────────── */

/**
 * La catena, una targa sotto l'altra con una maglia fra due: scorre in su
 * finché la coppia di adesso e' in fondo al palco. Quelle sopra si fanno
 * piccole; quelle sotto non ci sono ancora.
 */
function Binario({
  voci,
  passo,
  fase,
  esito,
  scritte,
  terzoCoperto,
  caduta,
}: {
  voci: VoceCatena[]
  passo: number
  fase: Fase
  esito: EsitoMossaCatena | null
  scritte: string
  terzoCoperto: boolean
  caduta: { testo: string; n: number } | null
}) {
  const primo = 2 * passo
  const ultimo = primo + 2
  return (
    <ol className="cat-binario" style={{ '--p': passo } as CSSProperties} aria-label="La catena">
      {voci.map((v, i) => {
        const dove = i < primo ? 'sopra' : i <= ultimo ? 'qui' : 'sotto'
        const nota = (x: VoceCatena | undefined) => !!x && x.tipo !== 'nascosta' && !(x.tipo === 'terzo' && !x.parola)
        const chiusa = nota(v) && nota(voci[i + 1])
        const attiva = dove === 'qui' && v.tipo === 'nascosta'
        return (
          <li key={v.posto} className={`cat-anello is-${dove}`} style={{ '--i': i, '--j': i - primo } as CSSProperties}>
            <div className="cat-anello__riga">
              <Riga
                voce={v}
                attiva={attiva}
                fase={fase}
                esito={dove === 'qui' ? esito : null}
                scritte={scritte}
                coperta={v.tipo === 'terzo' && terzoCoperto}
                finale={v.posto === NASCOSTE_CATENA[PASSO_FINALE]}
              />
              {attiva && caduta && (
                <span key={caduta.n} className="cat-caduta" aria-hidden="true">
                  {caduta.testo}
                </span>
              )}
            </div>
            {i < voci.length - 1 && <Giunto chiusa={chiusa} dopo={i >= ultimo} />}
          </li>
        )
      })}
    </ol>
  )
}

/** Una parola della catena: una targa per quelle che si vedono, le caselle per quelle trovate o mostrate. */
function Riga({
  voce,
  attiva,
  fase,
  esito,
  scritte,
  coperta,
  finale,
}: {
  voce: VoceCatena
  attiva: boolean
  fase: Fase
  esito: EsitoMossaCatena | null
  scritte: string
  coperta: boolean
  finale: boolean
}) {
  if (voce.tipo === 'data' || (voce.tipo === 'terzo' && voce.parola && !coperta)) {
    return (
      <div className={`cat-targa is-${voce.tipo}`}>
        <span className="cat-targa__testo">{voce.parola}</span>
      </div>
    )
  }
  if (voce.tipo === 'terzo') {
    return (
      <div className="cat-targa is-chiusa" aria-label="Il terzo elemento, coperto">
        <span className="cat-targa__testo">Terzo elemento</span>
      </div>
    )
  }
  const tipo = voce.tipo
  const classi =
    `${attiva ? ' is-attiva' : ''}${finale ? ' is-finale' : ''}${esito && attiva ? ` esito-${esito}` : ''}` +
    `${fase === 'attesa' && attiva ? ' is-attesa' : ''}${fase === 'busta' && attiva ? ' is-busta' : ''}`
  if (!voce.parola) return <Scrittura voce={voce} attiva={attiva} classi={classi} scritte={scritte} />
  // Una parola trovata, o mostrata, ha tutte le sue caselle, che si girano una dopo l'altra.
  const lettere = [...normalizzaCatena(voce.parola).toUpperCase()]
  // Le caselle restano della stessa misura finché la parola ci sta.
  const misura = Math.max(lettere.length, 9)
  return (
    <div
      className={`cat-targa cat-caselle is-${tipo}${classi}`}
      style={{ '--n': misura } as CSSProperties}
      role="img"
      aria-label={voce.parola}
    >
      {lettere.map((l, i) => (
        <span key={i} className="cat-casella" style={{ '--k': i } as CSSProperties} aria-hidden="true">
          {l}
        </span>
      ))}
    </div>
  )
}

/**
 * La parola da indovinare: un riquadro bianco bordato d'oro, che respira, con
 * le lettere che si vedono in tessere d'oro e accanto quel che si scrive, con
 * il cursore. Quanto e' lunga la parola non lo dice niente: con una casella per
 * lettera, una lettera data e la casella vuota sembravano una parola di due.
 * Nella finale l'ultima lettera chiude la riga dall'altra parte, e si scrive in
 * mezzo.
 */
function Scrittura({
  voce,
  attiva,
  classi,
  scritte,
}: {
  voce: VoceCatena
  attiva: boolean
  classi: string
  scritte: string
}) {
  const date = voce.lettere.length + (voce.ultima ? 1 : 0)
  const scritto = scritte.toUpperCase()
  return (
    <div
      className={`cat-scrivi${classi}`}
      // Le lettere si stringono solo quando non ci starebbero piu': fino a otto restano grandi.
      style={{ '--n': Math.max(scritto.length, 8), '--date': date } as CSSProperties}
      role="img"
      aria-label={
        `Comincia con ${voce.lettere}${voce.ultima ? `, finisce con ${voce.ultima}` : ''}` +
        `${scritte ? `; hai scritto ${voce.lettere}${scritto}${voce.ultima ?? ''}` : ''}`
      }
    >
      <span className="cat-scrivi__date" aria-hidden="true">
        {[...voce.lettere].map((l, i) => (
          // Una lettera che si scopre e' una tessera nuova: montata, salta fuori.
          <span key={i} className="cat-scrivi__data">
            {l}
          </span>
        ))}
      </span>
      <span className="cat-scrivi__riga" aria-hidden="true">
        {[...scritto].map((l, i) => (
          <span key={i} className="cat-scrivi__lettera" style={{ '--k': i } as CSSProperties}>
            {l}
          </span>
        ))}
        {attiva && voce.lettere.length + scritto.length + (voce.ultima ? 1 : 0) < MASSIMO_LETTERE && (
          <span className="cat-scrivi__cursore" />
        )}
      </span>
      {voce.ultima && (
        <span className="cat-scrivi__data is-ultima" aria-hidden="true">
          {voce.ultima}
        </span>
      )}
    </div>
  )
}

/**
 * La maglia fra due parole: due anelli aperti finché una delle due manca, poi
 * si chiudono con un lampo. Quella sotto la coppia di adesso non si vede
 * ancora: la catena va avanti, ma non si sa per quanto.
 */
function Giunto({ chiusa, dopo }: { chiusa: boolean; dopo: boolean }) {
  return (
    <span className={`cat-giunto${chiusa ? ' is-chiusa' : ''}${dopo ? ' is-dopo' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 40">
        <rect className="cat-giunto__filo" x="5" y="2" width="14" height="22" rx="7" />
        <rect className="cat-giunto__filo cat-giunto__sotto" x="5" y="16" width="14" height="22" rx="7" />
        <rect className="cat-giunto__metallo" x="5" y="2" width="14" height="22" rx="7" />
        <rect className="cat-giunto__metallo cat-giunto__sotto" x="5" y="16" width="14" height="22" rx="7" />
      </svg>
    </span>
  )
}

/* ─────────────────────────────  La testata  ───────────────────────────── */

interface Taglio {
  prima: number
  /** Quanto e' sceso. */
  perso: number
  /** Il numero del colpo: uno nuovo fa ripartire l'animazione. */
  n: number
  /** La parola finale sbagliata: il montepremi cade tutto. */
  tutto: boolean
  /** Il terzo elemento comprato: il montepremi si dimezza, e si vede il ÷2. */
  dimezzato: boolean
}

/** Il montepremi: quando scende il valore di prima vola via, con quel che si e' perso; alla finale sbagliata cade. */
function Montepremi({ valore, taglio, vinto }: { valore: number; taglio: Taglio | null; vinto: boolean }) {
  return (
    <div className={`cat-montepremi${vinto ? ' is-vinto' : ''}`}>
      <span className="cat-montepremi__etichetta">Montepremi</span>
      <span key={valore} className="cat-montepremi__valore u-tabnum">
        {valore}
      </span>
      {taglio && (
        <span key={taglio.n} className={`cat-montepremi__taglio${taglio.tutto ? ' is-tutto' : ''}`} aria-hidden="true">
          <span className="cat-montepremi__prima u-tabnum">{taglio.prima}</span>
          {!taglio.tutto && (
            <span className="cat-montepremi__meta">{taglio.dimezzato ? '÷2' : `−${taglio.perso}`}</span>
          )}
        </span>
      )}
    </div>
  )
}

/**
 * Le cinque parole da indovinare, cinque lampade: lampeggia quella di adesso,
 * verdi quelle trovate, rosse quelle mostrate; a partita finita la quinta dice
 * com'e' andata la finale.
 */
function Maglie({
  voci,
  passo,
  finita,
  indovinata,
  attiva,
}: {
  voci: VoceCatena[]
  passo: number
  finita: boolean
  indovinata: boolean
  attiva: boolean
}) {
  const nascoste = NASCOSTE_CATENA.map((posto) => voci[posto] ?? null)
  return (
    <ol className="cat-maglie" aria-label={`Parola ${Math.min(passo + 1, DA_INDOVINARE_CATENA)} di ${DA_INDOVINARE_CATENA}`}>
      {nascoste.map((v, i) => {
        const stato =
          i === PASSO_FINALE && finita
            ? indovinata
              ? 'giusta'
              : 'rivelata'
            : i < passo && v && v.tipo !== 'nascosta'
              ? v.tipo
              : i === passo && attiva
                ? 'corrente'
                : 'dopo'
        return (
          <li key={i} className={`cat-maglia is-${stato}${i === PASSO_FINALE ? ' is-finale' : ''}`}>
            <span className="u-visually-hidden">{stato === 'giusta' ? 'trovata' : stato === 'rivelata' ? 'mostrata' : ''}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** I due jolly: gettoni con la stella, che si spengono quando si usano. */
function Jolly({ restanti }: { restanti: number }) {
  return (
    <span className="cat-gettoni" aria-hidden="true">
      {[0, 1].map((i) => (
        <span key={i} className={`cat-gettone${i >= restanti ? ' is-usato' : ''}`}>
          <svg viewBox="0 0 24 24">
            <path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9-4.4-4.1 6-.8z" />
          </svg>
        </span>
      ))}
    </span>
  )
}

const RAGGIO = 18
const GIRO = 2 * Math.PI * RAGGIO

/** Il tempo in testata: un anello che si svuota, con i secondi dentro. */
function Anello({
  resta,
  tempoMs,
  testo,
  urgente = false,
  spento = false,
  etichetta,
}: {
  resta: number
  tempoMs: number
  testo: string
  urgente?: boolean
  spento?: boolean
  etichetta: string
}) {
  return (
    <div
      className={`cat-tempo${urgente ? ' is-urgente' : ''}${spento ? ' is-spento' : ''}`}
      role="timer"
      aria-label={etichetta}
    >
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle className="cat-tempo__fondo" cx="22" cy="22" r={RAGGIO} />
        <circle
          className="cat-tempo__anello"
          cx="22"
          cy="22"
          r={RAGGIO}
          strokeDasharray={GIRO}
          strokeDashoffset={GIRO * (1 - resta / tempoMs)}
        />
      </svg>
      <span className="cat-tempo__n u-tabnum" aria-hidden="true">
        {testo}
      </span>
    </div>
  )
}

/** Il tempo della parola finale: l'anello che si svuota, e gli ultimi dieci secondi che si sentono. */
function Minuto({
  finale,
  tempoMs,
  adesso: ora,
  fermo,
  onScade,
}: {
  finale: { inizio: number; scadenza: number } | null
  tempoMs: number
  adesso: () => number
  fermo: boolean
  onScade: () => void
}) {
  const [adesso, setAdesso] = useState(ora)
  const scaduto = useRef(false)
  const resta = finale ? Math.max(0, Math.min(tempoMs, finale.scadenza - adesso)) : tempoMs
  const secondi = Math.ceil(resta / 1000)

  useEffect(() => {
    if (fermo) return
    const t = window.setInterval(() => setAdesso(ora()), 200)
    return () => window.clearInterval(t)
  }, [fermo, ora])

  const ultimoTic = useRef<number | null>(null)
  useEffect(() => {
    if (fermo) return
    if (secondi <= 10 && secondi > 0 && ultimoTic.current !== secondi) {
      ultimoTic.current = secondi
      suona('tic')
    }
    if (resta <= 0 && !scaduto.current) {
      scaduto.current = true
      onScade()
    }
  }, [secondi, resta, fermo, onScade])

  return (
    <Anello resta={resta} tempoMs={tempoMs} testo={String(secondi)} urgente={secondi <= 10} etichetta={`${secondi} secondi`} />
  )
}

/**
 * Il tempo di una parola della catena, la miccia della scena: un anello che si
 * consuma. Prima che parta — la scena sta portando la parola — e' intero;
 * negli ultimi dieci secondi si fa rosso, e gli ultimi cinque si sentono.
 * Finisce una volta sola, e solo mentre si gioca: se in quel momento una
 * parola sta andando al server, decide lui.
 */
function Miccia({
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
  const scaduta = useRef(false)
  const accesa = adesso >= orologio.inizio
  const resta = Math.max(0, Math.min(tempoMs, orologio.scadenza - adesso))
  const secondi = Math.ceil(resta / 1000)
  const urgente = accesa && !ferma && secondi <= 10

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
    if (resta <= 0 && attiva && !scaduta.current) {
      scaduta.current = true
      onScade()
    }
  }, [accesa, attiva, ferma, onScade, resta, secondi])

  return (
    <Anello
      resta={resta}
      tempoMs={tempoMs}
      testo={String(secondi)}
      urgente={urgente}
      etichetta={`${secondi} secondi per questa parola`}
    />
  )
}
