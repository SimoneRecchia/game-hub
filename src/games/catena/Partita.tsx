import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@/components/Button'
import { IconBackspace } from '@/components/Icons'
import { suona } from '@/lib/suoni'
import {
  DA_INDOVINARE_CATENA,
  NASCOSTE_CATENA,
  PASSO_FINALE,
  normalizzaCatena,
  type EsitoMossaCatena,
  type TerzoElemento,
  type VoceCatena,
} from '@shared/catena'
import { KEYBOARD_ROWS, isGameLetter } from '@shared/wordle'
import '@/games/wordle/Keyboard.css'
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
  /** Il minuto della parola finale, sull'orologio del telefono: quando parte e quando finisce. */
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
  /** Una parola della catena: torna la vista dopo, con l'esito, o null se non e' andata. */
  prova: (parola: string) => Promise<RispostaCatena | null>
  jolly: () => Promise<RispostaCatena | null>
  /** Il terzo elemento della finale, che dimezza il montepremi. */
  compra: () => Promise<RispostaCatena | null>
  rispondi: (parola: string) => Promise<RispostaCatena | null>
  /** Il minuto e' finito sul telefono senza una risposta. */
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

/** La fase da cui riprende una partita riaperta. */
function faseDi(v: VistaCatena): Fase {
  if (v.finita) return 'fine'
  if (v.passo >= PASSO_FINALE) return v.finale && Date.now() < v.finale.inizio ? 'preambolo' : 'finale'
  return v.nuova ? 'intro' : 'gioco'
}

/** La parola da indovinare adesso: l'unica nascosta. */
const correnteDi = (v: VistaCatena) => v.voci.find((x) => x.tipo === 'nascosta') ?? null

/** Le caselle da scrivere: quelle dopo le lettere che si vedono, e prima dell'ultima nella finale. */
const vuoteDi = (voce: VoceCatena | null) =>
  voce ? Math.max(0, voce.lunghezza - voce.lettere.length - (voce.ultima ? 1 : 0)) : 0

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
}: {
  vista: VistaCatena
  comandi: ComandiCatena
  fine: ReactNode
  /** Senza il Comincia: in una sfida il tre-due-uno l'ha gia' fatto. */
  subito?: boolean
}) {
  const [mostrata, setMostrata] = useState(vista)
  const [fase, setFase] = useState<Fase>(() => faseDi(vista))
  /** La coppia su cui sta la catena: scende un passo dietro allo stato. */
  const [passoVisto, setPassoVisto] = useState(vista.passo)
  /** Le lettere scritte nelle caselle vuote. */
  const [scritte, setScritte] = useState('')
  /** L'esito della mossa appena fatta, per le caselle: verdi, rosse che tremano, arancio. */
  const [esito, setEsito] = useState<EsitoMossaCatena | null>(null)
  /** Il montepremi dimezzato, o azzerato: il valore di prima che vola via, e il numero del colpo. */
  const [taglio, setTaglio] = useState<Taglio | null>(null)
  /** La riga sotto la catena: com'e' andata, o che cosa succede. */
  const [stato, setStato] = useState<string>('')
  /** Le parole che cadono al loro posto, appena dopo Comincia. */
  const [entra, setEntra] = useState(false)
  /** Il terzo elemento regalato si scopre a meta' dell'annuncio. */
  const [terzoCoperto, setTerzoCoperto] = useState(false)
  const montata = useRef(true)
  const inVolo = useRef(false)
  useEffect(
    () => () => {
      montata.current = false
    },
    [],
  )

  const corrente = correnteDi(mostrata)
  const vuote = vuoteDi(corrente)
  const finale = mostrata.passo >= PASSO_FINALE

  /** La vista nuova, e con lei il montepremi che si dimezza se e' sceso. */
  const mostra = useCallback((dopo: VistaCatena, prima: VistaCatena) => {
    if (dopo.montepremi < prima.montepremi) {
      setTaglio({ prima: prima.montepremi, n: Date.now(), tutto: false })
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
      suona('scaduto')
      suona('sconfitta', { ritardo: 0.5 })
      return
    }
    if (fase === 'gioco' || fase === 'finale' || fase === 'intro') {
      setMostrata(vista)
      setPassoVisto(vista.passo)
      setScritte('')
      setFase(faseDi(vista) === 'intro' ? fase : faseDi(vista))
    }
  }, [vista, mostrata.chiave, fase])

  // L'entrata: le parole cadono al loro posto, una maglia dopo l'altra.
  const comincia = useCallback(() => {
    setFase('gioco')
    setEntra(true)
    window.setTimeout(() => montata.current && setEntra(false), tempi().entrata)
    for (let i = 0; i < 3; i += 1) suona('maglia', { ritardo: 0.15 + i * 0.28, altezza: 1 + i * 0.08 })
  }, [])

  // In una sfida si comincia da soli, con la stessa entrata del Comincia.
  const partita = useRef(false)
  useEffect(() => {
    if (!subito || partita.current || fase !== 'intro') return
    partita.current = true
    comincia()
  }, [comincia, fase, subito])

  // La parola finale annunciata: il nastro, il terzo elemento in regalo, e il minuto quando parte.
  useEffect(() => {
    if (fase !== 'preambolo') return
    let fermo = false
    const regalato = mostrata.terzo === 'regalato'
    setTerzoCoperto(regalato && !ridotto())
    suona('intermezzo')
    const inizio = mostrata.finale?.inizio ?? Date.now()
    const timer: number[] = []
    if (regalato) {
      timer.push(
        window.setTimeout(
          () => {
            if (fermo) return
            setTerzoCoperto(false)
            suona('magia')
          },
          ridotto() ? 0 : Math.max(0, Math.min(2000, inizio - Date.now() - 1500)),
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
        Math.max(0, inizio - Date.now()),
      ),
    )
    return () => {
      fermo = true
      timer.forEach((t) => window.clearTimeout(t))
    }
  }, [fase, mostrata.terzo, mostrata.finale])

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
    if (fase !== 'gioco' || !corrente || scritte.length < vuote) return
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
        suona('giusto')
        setMostrata(dopo)
        setScritte('')
        for (let i = 0; i < 2; i += 1) suona('maglia', { ritardo: 0.45 + i * 0.22, altezza: 1.1 + i * 0.1 })
        await aspetta(t.giusta)
      } else {
        setStato(e === 'rivelata' ? 'Sbagliata! Ecco la parola' : 'Sbagliata! Una lettera in più')
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
  }, [fase, corrente, scritte, vuote, mostrata, comandi, mostra, scendi])

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
        suona('magia')
        window.setTimeout(() => montata.current && setStato(''), 1600)
        setFase(r.vista.finita ? 'fine' : torna)
      } else setFase(torna)
    } finally {
      inVolo.current = false
    }
  }, [fase, mostrata, comandi, mostra])

  const compra = useCallback(async () => {
    if (fase !== 'finale' || !mostrata.compraUsabile) return
    const prima = mostrata
    inVolo.current = true
    setFase('attesa')
    try {
      const r = await comandi.compra()
      if (!montata.current) return
      if (r) {
        mostra(r.vista, prima)
        setStato('Ecco il terzo elemento')
        suona('svela', { ritardo: 0.3 })
        window.setTimeout(() => montata.current && setStato(''), 1600)
        setFase(r.vista.finita ? 'fine' : 'finale')
      } else setFase('finale')
    } finally {
      inVolo.current = false
    }
  }, [fase, mostrata, comandi, mostra])

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
        if (dopo.indovinata) {
          setStato(`Catena completata! ${dopo.punti} punti`)
          suona('vittoria', { ritardo: 0.6 })
        } else {
          setStato(testo === null ? 'Niente punti' : 'Sbagliata: niente punti')
          setTaglio({ prima: mostrata.montepremi, n: Date.now(), tutto: true })
          suona('sbagliato')
          suona('sconfitta', { ritardo: 0.5 })
        }
      } finally {
        inVolo.current = false
      }
    },
    [fase, corrente, comandi, mostrata.montepremi],
  )

  const scrivi = useCallback(
    (lettera: string) => {
      if ((fase !== 'gioco' && fase !== 'finale') || scritte.length >= vuote) return
      setScritte((s) => s + lettera)
      suona('tocco', { volume: 0.6 })
    },
    [fase, scritte.length, vuote],
  )
  const cancella = useCallback(() => {
    if (fase !== 'gioco' && fase !== 'finale') return
    setScritte((s) => s.slice(0, -1))
  }, [fase])
  const invia = useCallback(() => {
    if (fase === 'gioco') void prova()
    else if (fase === 'finale' && scritte.length >= vuote) void rispondi(scritte)
  }, [fase, prova, rispondi, scritte, vuote])

  // La tastiera del computer: le lettere del gioco, la cancellazione e l'invio.
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const bersaglio = e.target as HTMLElement | null
      if (bersaglio && /^(INPUT|TEXTAREA)$/.test(bersaglio.tagName)) return
      const k = e.key.toLowerCase()
      if (k === 'enter') {
        // Un bottone col fuoco si preme da solo: l'invio lo fa lui.
        if (bersaglio?.tagName === 'BUTTON') return
        e.preventDefault()
        invia()
      } else if (k === 'backspace') {
        e.preventDefault()
        cancella()
      } else if (isGameLetter(k)) {
        e.preventDefault()
        scrivi(k)
      }
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [invia, cancella, scrivi])

  const libera = fase === 'gioco' || fase === 'finale'
  const indovinata = mostrata.finita && mostrata.indovinata === true
  const valore = fase === 'fine' || fase === 'verdetto' ? (indovinata ? mostrata.punti : 0) : mostrata.montepremi

  return (
    <div
      className={
        `cat is-${fase}${finale ? ' is-alla-finale' : ''}${entra ? ' is-entra' : ''}` +
        `${indovinata && (fase === 'verdetto' || fase === 'fine') ? ' is-vinta' : ''}`
      }
    >
      <div className="cat-luci" aria-hidden="true" />
      <header className="cat-testa">
        <Montepremi valore={valore} taglio={taglio} vinto={indovinata && fase === 'fine'} />
        {fase === 'finale' || fase === 'busta' ? (
          <Minuto finale={mostrata.finale} tempoMs={mostrata.tempoFinaleMs} fermo={fase === 'busta'} onScade={comandi.scade} />
        ) : (
          <Maglie voci={mostrata.voci} passo={fase === 'fine' || fase === 'verdetto' ? DA_INDOVINARE_CATENA : passoVisto} />
        )}
        <Jolly restanti={mostrata.jollyRestanti} />
      </header>

      {fase === 'fine' ? (
        <div className="cat-fine">
          {fine}
          <CatenaIntera voci={mostrata.voci} />
        </div>
      ) : (
        <>
          <Binario
            voci={mostrata.voci}
            passo={passoVisto}
            fase={fase}
            esito={esito}
            scritte={scritte}
            terzoCoperto={terzoCoperto}
          />
          {fase === 'intro' && (
            <div className="cat-intro">
              <p className="cat-intro__titolo">La Catena</p>
              <p className="cat-intro__testo">
                Ogni parola si lega a quella dopo. Trovane cinque: ogni errore dimezza il montepremi.
              </p>
              <Button size="lg" onClick={comincia}>
                Comincia
              </Button>
            </div>
          )}
          {fase === 'preambolo' && (
            <div className="cat-nastro" role="status">
              <span className="cat-nastro__testo">La parola finale</span>
              {mostrata.terzo === 'regalato' && (
                <span className="cat-nastro__sotto">Con due jolly, il terzo elemento è in regalo</span>
              )}
            </div>
          )}

          <div className="cat-comandi">
            <p className={`cat-stato${esito ? ` is-${esito}` : ''}`} role="status">
              {stato}
            </p>
            <div className="cat-azioni">
              {finale && fase !== 'verdetto' && (
                <button
                  type="button"
                  className="cat-azione"
                  disabled={!libera}
                  onClick={() => void rispondi(null)}
                >
                  Non lo so
                </button>
              )}
              {finale && mostrata.compraUsabile && (
                <button type="button" className="cat-azione is-compra" disabled={fase !== 'finale'} onClick={() => void compra()}>
                  Terzo<span className="cat-azione__lungo"> elemento</span>{' '}
                  <span className="cat-azione__costo">÷2</span>
                </button>
              )}
              <button
                type="button"
                className="cat-azione is-jolly"
                disabled={!libera || !mostrata.jollyUsabile}
                onClick={() => void jolly()}
              >
                Jolly <span className="cat-azione__costo u-tabnum">{mostrata.jollyRestanti}</span>
              </button>
            </div>
          </div>

          <Tastiera
            disabled={!libera}
            pronta={scritte.length >= vuote && vuote > 0}
            invio={finale ? 'Invia' : 'Prova'}
            onLettera={scrivi}
            onCancella={cancella}
            onInvio={invia}
          />
        </>
      )}
    </div>
  )
}

/* ─────────────────────────────  La catena  ───────────────────────────── */

/**
 * La catena, una parola sotto l'altra con una maglia fra due: scorre in su
 * finché la coppia di adesso e' al centro. Quelle sopra si fanno piccole e si
 * spengono; quelle sotto non ci sono ancora.
 */
function Binario({
  voci,
  passo,
  fase,
  esito,
  scritte,
  terzoCoperto,
}: {
  voci: VoceCatena[]
  passo: number
  fase: Fase
  esito: EsitoMossaCatena | null
  scritte: string
  terzoCoperto: boolean
}) {
  const primo = 2 * passo
  const ultimo = primo + 2
  return (
    <div className="cat-palco">
      <ol className="cat-binario" style={{ '--p': passo } as CSSProperties} aria-label="La catena">
        {voci.map((v, i) => {
          const dove = i < primo ? 'sopra' : i <= ultimo ? 'qui' : 'sotto'
          const nota = (x: VoceCatena | undefined) => !!x && x.tipo !== 'nascosta' && !(x.tipo === 'terzo' && !x.parola)
          const chiusa = nota(v) && nota(voci[i + 1])
          return (
            <li
              key={v.posto}
              className={`cat-anello is-${dove}`}
              style={{ '--i': i, '--j': i - primo } as CSSProperties}
            >
              <div className="cat-anello__riga">
                <Riga
                  voce={v}
                  attiva={dove === 'qui' && v.tipo === 'nascosta'}
                  fase={fase}
                  esito={dove === 'qui' ? esito : null}
                  scritte={scritte}
                  coperta={v.tipo === 'terzo' && terzoCoperto}
                />
              </div>
              {i < voci.length - 1 && <Giunto chiusa={chiusa} dopo={i >= ultimo} />}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Una parola della catena: un pannello per quelle che si vedono, le caselle per quella da indovinare. */
function Riga({
  voce,
  attiva,
  fase,
  esito,
  scritte,
  coperta,
}: {
  voce: VoceCatena
  attiva: boolean
  fase: Fase
  esito: EsitoMossaCatena | null
  scritte: string
  coperta: boolean
}) {
  if (voce.tipo === 'data' || (voce.tipo === 'terzo' && voce.parola && !coperta)) {
    return (
      <div className={`cat-pannello is-${voce.tipo}`}>
        <span className="cat-pannello__testo">{voce.parola}</span>
      </div>
    )
  }
  if (voce.tipo === 'terzo') {
    return (
      <div className="cat-pannello is-chiuso" aria-label="Il terzo elemento, coperto">
        <span className="cat-pannello__lucchetto" aria-hidden="true">
          ?
        </span>
      </div>
    )
  }
  const lettere = voce.parola
    ? [...normalizzaCatena(voce.parola).toUpperCase()]
    : Array.from({ length: voce.lunghezza }, (_, i) => {
        if (i < voce.lettere.length) return voce.lettere[i]
        if (voce.ultima && i === voce.lunghezza - 1) return voce.ultima
        return scritte[i - voce.lettere.length]?.toUpperCase() ?? ''
      })
  const tipo = voce.tipo
  return (
    <div
      className={
        `cat-caselle is-${tipo}${attiva ? ' is-attiva' : ''}${esito && attiva ? ` esito-${esito}` : ''}` +
        `${fase === 'attesa' && attiva ? ' is-attesa' : ''}${fase === 'busta' && attiva ? ' is-busta' : ''}`
      }
      style={{ '--n': voce.lunghezza } as CSSProperties}
      role="img"
      aria-label={
        voce.parola
          ? voce.parola
          : `${voce.lunghezza} lettere, comincia con ${voce.lettere}${voce.ultima ? `, finisce con ${voce.ultima}` : ''}`
      }
    >
      {lettere.map((l, i) => {
        const data = !voce.parola && (i < voce.lettere.length || (!!voce.ultima && i === voce.lunghezza - 1))
        const scritta = !voce.parola && !data && l !== ''
        return (
          <span
            // Una lettera che si scopre e' una casella nuova: rimontata, si gira.
            key={`${i}-${data ? 'd' : voce.parola ? 'p' : 'v'}`}
            className={`cat-casella${data ? ' is-data' : ''}${scritta ? ' is-scritta' : ''}${l === '' ? ' is-vuota' : ''}`}
            style={{ '--k': i } as CSSProperties}
            aria-hidden="true"
          >
            {l}
          </span>
        )
      })}
    </div>
  )
}

/**
 * La maglia fra due parole: aperta finché una delle due manca, poi si chiude con
 * un lampo. Quella sotto la coppia di adesso non si vede ancora: la catena va
 * avanti, ma non si sa per quanto.
 */
function Giunto({ chiusa, dopo }: { chiusa: boolean; dopo: boolean }) {
  return (
    <span className={`cat-giunto${chiusa ? ' is-chiusa' : ''}${dopo ? ' is-dopo' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 40">
        <rect className="cat-giunto__sopra" x="5" y="2" width="14" height="22" rx="7" />
        <rect className="cat-giunto__sotto" x="5" y="16" width="14" height="22" rx="7" />
      </svg>
    </span>
  )
}

/** La catena intera, a partita finita: ogni parola, e fra due l'espressione che le lega. */
function CatenaIntera({ voci }: { voci: VoceCatena[] }) {
  return (
    <ol className="cat-intera" aria-label="La catena">
      {voci.map((v, i) => (
        <li key={v.posto} className={`cat-intera__voce is-${v.tipo}`} style={{ '--i': i } as CSSProperties}>
          <span className="cat-intera__parola">{v.parola}</span>
          {v.espressione && i < voci.length - 1 && (
            <span className="cat-intera__espressione">
              <span className="cat-intera__maglia" aria-hidden="true" />
              {v.espressione}
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}

/* ─────────────────────────────  La testata  ───────────────────────────── */

interface Taglio {
  prima: number
  /** Il numero del colpo: uno nuovo fa ripartire l'animazione. */
  n: number
  /** La parola finale sbagliata: il montepremi cade tutto. */
  tutto: boolean
}

/** Il montepremi: quando si dimezza il valore di prima vola via, e arriva il ÷2; quando si azzera, cade. */
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
          {!taglio.tutto && <span className="cat-montepremi__meta">÷2</span>}
        </span>
      )}
    </div>
  )
}

/** Le cinque parole da indovinare: verdi quelle trovate, arancio quelle mostrate, la quinta e' la finale. */
function Maglie({ voci, passo }: { voci: VoceCatena[]; passo: number }) {
  const nascoste = NASCOSTE_CATENA.map((posto) => voci[posto] ?? null)
  return (
    <ol className="cat-maglie" aria-label={`Parola ${Math.min(passo + 1, DA_INDOVINARE_CATENA)} di ${DA_INDOVINARE_CATENA}`}>
      {nascoste.map((v, i) => {
        const stato = i < passo && v && v.tipo !== 'nascosta' ? v.tipo : i === passo ? 'corrente' : 'dopo'
        return (
          <li key={i} className={`cat-maglia is-${stato}${i === PASSO_FINALE ? ' is-finale' : ''}`}>
            <span className="u-visually-hidden">{stato === 'giusta' ? 'trovata' : stato === 'rivelata' ? 'mostrata' : ''}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** I due jolly: monete d'oro, che si girano e si spengono quando si usano. */
function Jolly({ restanti }: { restanti: number }) {
  return (
    <div className="cat-jolly" aria-label={`${restanti} jolly`}>
      {[0, 1].map((i) => (
        <span key={i} className={`cat-jolly__moneta${i >= restanti ? ' is-usato' : ''}`} aria-hidden="true">
          J
        </span>
      ))}
    </div>
  )
}

const RAGGIO = 17
const GIRO = 2 * Math.PI * RAGGIO

/** Il minuto della parola finale: l'anello che si svuota, e gli ultimi dieci secondi che si sentono. */
function Minuto({
  finale,
  tempoMs,
  fermo,
  onScade,
}: {
  finale: { inizio: number; scadenza: number } | null
  tempoMs: number
  fermo: boolean
  onScade: () => void
}) {
  const [adesso, setAdesso] = useState(() => Date.now())
  const scaduto = useRef(false)
  const resta = finale ? Math.max(0, Math.min(tempoMs, finale.scadenza - adesso)) : tempoMs
  const secondi = Math.ceil(resta / 1000)

  useEffect(() => {
    if (fermo) return
    const t = window.setInterval(() => setAdesso(Date.now()), 200)
    return () => window.clearInterval(t)
  }, [fermo])

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
    <div className={`cat-minuto${secondi <= 10 ? ' is-urgente' : ''}`} role="timer" aria-label={`${secondi} secondi`}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle className="cat-minuto__fondo" cx="20" cy="20" r={RAGGIO} />
        <circle
          className="cat-minuto__anello"
          cx="20"
          cy="20"
          r={RAGGIO}
          strokeDasharray={GIRO}
          strokeDashoffset={GIRO * (1 - resta / tempoMs)}
        />
      </svg>
      <span className="cat-minuto__secondi u-tabnum">{secondi}</span>
    </div>
  )
}

/* ─────────────────────────────  La tastiera  ───────────────────────────── */

/** Le 21 lettere del gioco, come nel Wordle: l'invio prova la parola, o la conferma nella finale. */
function Tastiera({
  disabled,
  pronta,
  invio,
  onLettera,
  onCancella,
  onInvio,
}: {
  disabled: boolean
  pronta: boolean
  invio: string
  onLettera: (l: string) => void
  onCancella: () => void
  onInvio: () => void
}) {
  return (
    <div className="keyboard cat-tastiera" role="group" aria-label="Tastiera">
      {KEYBOARD_ROWS.map((riga, i) => (
        <div className="keyboard__row" key={i}>
          {riga.map((tasto) => {
            if (tasto === 'ENTER') {
              return (
                <button
                  key={tasto}
                  type="button"
                  className={`key key--wide cat-tastiera__invio${pronta ? ' is-pronta' : ''}`}
                  onClick={onInvio}
                  disabled={disabled || !pronta}
                >
                  {invio}
                </button>
              )
            }
            if (tasto === 'BACK') {
              return (
                <button
                  key={tasto}
                  type="button"
                  className="key key--wide"
                  onClick={onCancella}
                  disabled={disabled}
                  aria-label="Cancella"
                >
                  <IconBackspace size={22} />
                </button>
              )
            }
            return (
              <button
                key={tasto}
                type="button"
                className="key"
                onClick={() => onLettera(tasto)}
                disabled={disabled}
                aria-label={tasto.toUpperCase()}
              >
                {tasto.toUpperCase()}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
