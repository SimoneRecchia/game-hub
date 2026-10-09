import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi, type DatiAdesivo } from '@/components/Adesivo'
import { Button } from '@/components/Button'
import { IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { useToast } from '@/components/Toast'
import { CashHunt, type FaseCashHunt } from '@/games/ruota/CashHunt'
import { ComeSiGiocaRuota } from '@/games/ruota/ComeSiGioca'
import {
  DisegnoQuiz,
  DisegnoRuota,
  IconaCashHunt,
  IconaPachinko,
  IconaQuiz,
  IconaSplit,
  Quadrifoglio,
  coloreDelMoltiplicatore,
  coloreDellaCategoria,
  iconaDellaCategoria,
} from '@/games/ruota/disegni'
import { FestaRuota, type DatiFestaRuota } from '@/games/ruota/Festa'
import { COLPO_MS, ColpoDiFortuna, NastroFortuna, PremioCheSale } from '@/games/ruota/Fortuna'
import { VISTA } from '@/games/ruota/geometria'
import { Intermezzo, PIOGGIA_MS, PioggiaDiMonete, type DatiIntermezzo } from '@/games/ruota/Intermezzo'
import { FichesPuntata } from '@/games/ruota/FichesPuntata'
import {
  CONTO_DIECI,
  CONTO_QUIZ,
  DURATA_AUMENTO_MS,
  DURATA_MAGIA_MS,
  PASSI_QUIZ,
  PASSI_RUOTA,
} from '@/games/ruota/magia'
import { Moneta } from '@/games/ruota/Moneta'
import { Pachinko, type FasePachinko } from '@/games/ruota/Pachinko'
import { RuotaFisica, type Meta, type Mozzo } from '@/games/ruota/RuotaFisica'
import { Tabellone } from '@/games/fortuna/Tabellone'
import { useDopo } from '@/games/fortuna/useDopo'
import { COLORE_FICHE, inFiches } from '@/games/fortuna/fiches'
import { centroDi, incassaMonete, perdiFiches, puntaFiches, spostaFiches, volaFiche, type Punto } from '@/games/fortuna/voli'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { suona } from '@/lib/suoni'
import { NOMI_CATEGORIE, type CategoriaQuiz } from '@shared/quiz'
import {
  INTERVALLO_GIRI_MS,
  MOLTIPLICATORE_FISSO,
  MOLTIPLICATORE_SPLIT,
  NOME_CRAZY_TIME,
  PUNTATA_MINIMA,
  SPICCHI_FORTUNATI,
  SPICCHI_QUIZ,
  SPICCHI_RUOTA,
  conSegno,
  nomeDi,
  scriviMoltiplicatore,
} from '@shared/ruota'
import type { GiroRuota, RuotaStato, SfidaRuotaVista } from '@shared/types'
import './Ruota.css'

const DomandaRuota = lazy(() => import('@/games/ruota/DomandaRuota'))

type NomeScena = 'ruota' | 'quiz' | 'moneta' | 'pachinko' | 'cashhunt' | 'domanda'
type Luci = 'attesa' | 'vinto' | 'perso'
type Quiz = Extract<SfidaRuotaVista, { tipo: 'domanda' }>

/**
 * La ruota grande: quella di sempre, la fortuna che arriva (il palco si fa verde
 * ma la ruota e' ancora quella), la magia che la trasforma, la ruota fortunata,
 * e il ritorno a quella di sempre.
 */
type ModoRuota = 'normale' | 'preludio' | 'magia' | 'fortunata' | 'torna'
/** La ruota del quiz: con i moltiplicatori di sempre, mentre salgono, o con quelli della fortuna. */
type ModoQuiz = 'normale' | 'aumento' | 'fortunata'

/** Quanto resta un adesivo, quanto festeggiano le luci prima del passaggio, quanto si guarda il moltiplicatore. */
const ADESIVO_MS = 2_300
const FESTA_LUCI_MS = 950
const RIVELA_MS = 2_200
/** La moneta caduta resta in vista, prima di tornare alla ruota: il lato uscito si deve vedere. */
const MONETA_IN_VISTA_MS = 2_700
/** Quanto resta l'invito a lanciare piu' forte. */
const DEBOLE_MS = 2_200
/** Quanto ci mette la ruota a tornare, dopo una domanda: le monete partono quando e' ferma. */
const RITORNO_MS = 720
/** Quanto si guarda la ruota fortunata ferma, con l'esito sul mozzo, prima che torni quella di sempre. */
const FORTUNA_IN_VISTA_MS = 2_000
/** Quanto ci mette la ruota fortunata a tornare quella di sempre. */
const TORNA_MS = 700
/** Dopo la festa: le monete volano al saldo, e poi la fortuna se ne va. */
const DOPO_FESTA_MS = 1_400
/** Dal ×5 in su, anche una moneta o una domanda vinta ha la festa. */
const FESTA_MINIGIOCO = 5

/** Quante monete volano al saldo per una vincita: piu' vale il moltiplicatore, piu' sono. */
const moneteDi = (moltiplicatore: number) => Math.round(4 + Math.min(moltiplicatore, 6) * 3)

const ridotto = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Il centro del mozzo della ruota grande, sullo schermo: da li' partono e li' arrivano fiches e monete. */
function centroDelMozzo(): Punto | null {
  const el = document.querySelector('.ct-ruota.is-principale')
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0) return null
  return { x: r.left + (r.width * -VISTA.x) / VISTA.larghezza, y: r.top + (r.height * -VISTA.y) / VISTA.altezza }
}

/** La scena di un giro: la ruota, o il minigioco a cui e' arrivato. La ruota fortunata si gira sulla ruota. */
function scenaDi(giro: GiroRuota | null): NomeScena {
  const sfida = giro?.sfida
  if (!giro || giro.stato === 'fatto' || !sfida || sfida.tipo === 'fortuna') return 'ruota'
  if (sfida.tipo === 'domanda') return sfida.spicchioQuiz === null ? 'quiz' : 'domanda'
  return sfida.tipo
}

/** Lo spicchio dove si e' fermata la ruota grande nell'ultimo giro: quello della ruota fortunata, se c'e'. */
function fermataDi(g: GiroRuota): Meta {
  return g.fortunata !== null ? { indice: g.fortunata, chiave: `f${g.n}` } : { indice: g.spicchio, chiave: `p${g.n}` }
}

/** Il moltiplicatore e la vincita del minigioco di un giro, quando ci sono. */
function palioDi(giro: GiroRuota | null): { moltiplicatore: number; vincita: number } | null {
  const s = giro?.sfida
  if (!s || s.tipo === 'fortuna' || s.moltiplicatore === null || s.vincita === null) return null
  return { moltiplicatore: s.moltiplicatore, vincita: s.vincita }
}

/** Lo spicchio dove si e' fermata la ruota grande: quello della ruota fortunata, se c'e'. */
const spicchioDi = (g: GiroRuota) => (g.fortunata !== null ? SPICCHI_FORTUNATI[g.fortunata] : SPICCHI_RUOTA[g.spicchio])

/** Il nastro della fortuna, scena per scena. */
const NASTRI: Record<NomeScena, string> = {
  ruota: 'Ruota fortunata',
  quiz: 'Quiz fortunato',
  moneta: 'Moneta fortunata',
  pachinko: 'Pachinko fortunato',
  cashhunt: 'Cash Hunt fortunato',
  domanda: 'Quiz fortunato',
}

/** Quel che e' tornato al saldo da un giro chiuso: la vincita, la meta' dello split, o niente. */
const tornatoDa = (g: GiroRuota) => g.delta + g.puntata

/** Il quiz del giro, se il giro e' arrivato al quiz. */
const quizDi = (giro: GiroRuota | null): Quiz | null => (giro?.sfida?.tipo === 'domanda' ? giro.sfida : null)

/**
 * Crazy Time: si punta, si trascina la ruota e la si lascia andare. La puntata
 * si paga al lancio, e si vede: le fiches volano dal saldo alla ruota, e il
 * saldo scende. Il banco se la tiene, e le fiches scivolano via; lo split ne
 * restituisce la meta', raccontata come una vincita; il triplo la restituisce
 * per tre, con la festa; il quiz porta alla ruota del quiz e poi alla domanda;
 * la moneta alla moneta da lanciare, il Pachinko al tabellone con la pallina, il
 * Cash Hunt al muro delle caselle. La fortuna fa saltare fuori il quadrifoglio,
 * e la ruota si trasforma sul posto nella ruota fortunata, con i premi che
 * salgono uno dopo l'altro; si rigira con la stessa puntata, e dopo l'esito
 * torna quella di sempre. Una vincita torna al saldo in monete, che lo fanno
 * salire quando arrivano. Ogni passaggio ha la sua transizione, e finito il
 * minigioco si torna alla ruota com'era, con l'esito sul mozzo.
 *
 * Il server decide tutto e risponde con lo stato intero, anche l'esito che la
 * ruota non ha ancora mostrato; qui si fa vedere nell'ordine giusto, e il
 * tabellone resta fermo (`conto`) finché il momento non arriva. Lo stato di una
 * pagina riaperta dice in che scena si era.
 */
export default function RuotaPagina() {
  const { vai } = useNavigazione()
  const toast = useToast()
  const dopo = useDopo()
  const [stato, setStato] = useState<RuotaStato | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [scena, setScena] = useState<NomeScena>('ruota')
  const [intermezzo, setIntermezzo] = useState<(DatiIntermezzo & { verso: NomeScena | 'fortunata' }) | null>(null)
  /** La puntata scelta: finché non la si tocca e' quella del giro di prima. */
  const [puntata, setPuntata] = useState<number | null>(null)
  const [inviando, setInviando] = useState(false)
  // La ruota: dove fermarsi, se gira, le luci, e l'esito sul mozzo.
  const [fermaSu, setFermaSu] = useState<Meta | null>(null)
  const [inGioco, setInGioco] = useState<number | null>(null)
  const [annulla, setAnnulla] = useState(0)
  const [luci, setLuci] = useState<Luci>('attesa')
  const [esito, setEsito] = useState(false)
  const [modo, setModo] = useState<ModoRuota>('normale')
  /** Il colpo del quadrifoglio, quando la ruota si ferma sulla fortuna. */
  const [colpo, setColpo] = useState<number | null>(null)
  /** Fra due giri passano tre secondi: senza animazioni la ruota si ferma subito, e il server direbbe di no. */
  const [riposata, setRiposata] = useState(true)
  const [debole, setDebole] = useState(false)
  // La ruota del quiz.
  const [fermaSuQ, setFermaSuQ] = useState<Meta | null>(null)
  const [girandoQ, setGirandoQ] = useState(false)
  const [annullaQ, setAnnullaQ] = useState(0)
  const [luciQ, setLuciQ] = useState<Luci>('attesa')
  const [modoQ, setModoQ] = useState<ModoQuiz>('normale')
  const [rivelato, setRivelato] = useState(false)
  // La moneta: mentre e' in aria il tabellone resta com'era, e il lato si dice quando cade.
  const [annullaMoneta, setAnnullaMoneta] = useState(0)
  const [conto, setConto] = useState<{ saldo: number; netto: number; giri: number } | null>(null)
  const [monetaCaduta, setMonetaCaduta] = useState(false)
  // Il Pachinko e il Cash Hunt dicono a che punto sono, per il pannello.
  const [faseP, setFaseP] = useState<FasePachinko>('pronta')
  const [faseC, setFaseC] = useState<FaseCashHunt>('scoperto')
  /** Il giro di un minigioco trovato aperto riaprendo la pagina: si riprende da dove serve, senza preamboli. */
  const [ripresa, setRipresa] = useState<number | null>(null)
  const [regole, setRegole] = useState(false)
  const [pioggia, setPioggia] = useState(0)
  const [festa, setFesta] = useState<DatiFestaRuota | null>(null)
  /** Che cosa fare quando la festa finisce: le monete al saldo, e quel che viene dopo. */
  const dopoLaFesta = useRef<(() => void) | null>(null)
  const { adesivo, accoda } = useCodaAdesivi()
  // Il saldo sul tabellone: da li' partono le fiches e li' arrivano le monete.
  const saldoRef = useRef<HTMLSpanElement>(null)
  /** Il numero della puntata, dove arrivano le fiches, e la loro riga, dove tornano. */
  const puntataRef = useRef<HTMLSpanElement>(null)
  const ficheRef = useRef<HTMLDivElement>(null)
  // Com'e' finita la domanda, da raccontare sulla ruota quando si torna: le monete al saldo, o le fiches al banco.
  const daRaccontare = useRef<{ vinto: boolean; moltiplicatore: number; puntata: number; vincita: number } | null>(
    null,
  )
  // Lo stato di adesso, per chi lo legge a ruota ferma o a moneta caduta: arrivano dopo il disegno.
  const ultimo = useRef(stato)
  useEffect(() => {
    ultimo.current = stato
  })
  /**
   * Lo stato arrivato dal server, subito anche per `ultimo`: senza animazioni la
   * ruota e la moneta si fermano dentro il loro effetto, che React fa girare
   * prima di quello della pagina, e leggerebbero il giro di prima.
   */
  const aggiorna = (nuovo: RuotaStato) => {
    ultimo.current = nuovo
    setStato(nuovo)
  }

  const leggi = useCallback(() => api<RuotaStato>('/ruota'), [])

  useEffect(() => {
    let vivo = true
    leggi()
      .then((s) => {
        if (!vivo) return
        const g = s.giro
        setStato(s)
        setScena(scenaDi(g))
        if (!g) return
        setFermaSu(fermataDi(g))
        setEsito(g.stato === 'fatto')
        // Una fortuna ancora in gioco: la ruota e' gia' quella fortunata, e cosi' la ruota del quiz che ne viene.
        const fortunata = g.stato !== 'fatto' && (g.sfida?.tipo === 'fortuna' || g.fortunata !== null)
        if (fortunata) setModo('fortunata')
        const quiz = quizDi(g)
        if (quiz?.fortunata) setModoQ('fortunata')
        if (quiz && quiz.spicchioQuiz !== null) {
          setFermaSuQ({ indice: quiz.spicchioQuiz, chiave: `q${g.n}` })
          setRivelato(true)
        }
        if (g.stato !== 'fatto' && (g.sfida?.tipo === 'pachinko' || g.sfida?.tipo === 'cashhunt')) setRipresa(g.n)
      })
      .catch((e) => vivo && setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare la ruota.'))
    return () => {
      vivo = false
    }
  }, [leggi])

  useEffect(() => {
    if (riposata) return
    const t = window.setTimeout(() => setRiposata(true), INTERVALLO_GIRI_MS)
    return () => window.clearTimeout(t)
  }, [riposata])

  useEffect(() => {
    if (!debole) return
    const t = window.setTimeout(() => setDebole(false), DEBOLE_MS)
    return () => window.clearTimeout(t)
  }, [debole])

  /** Una richiesta che risponde con lo stato: se va male lo dice, e rilegge com'e' davvero. */
  const inVolo = useRef(false)
  const chiedi = useCallback(
    async (percorso: string, corpo?: unknown): Promise<RuotaStato | null> => {
      // Un doppio tocco manderebbe la seconda prima che il bottone si spenga: il server la rifiuterebbe.
      if (inVolo.current) return null
      inVolo.current = true
      setInviando(true)
      try {
        const nuovo = await api<RuotaStato>(percorso, { method: 'POST', body: corpo ?? {} })
        dimentica('/oggi')
        return nuovo
      } catch (e) {
        toast.show(e instanceof ApiFetchError ? e.message : 'Non è andata: riprova.', 'error')
        leggi().then(setStato, () => {})
        return null
      } finally {
        inVolo.current = false
        setInviando(false)
      }
    },
    [toast, leggi],
  )

  const giro = stato?.giro ?? null
  const sfida = giro?.sfida ?? null
  const quiz = quizDi(giro)
  const saldo = stato?.saldo ?? 0
  const puoGirare = saldo >= PUNTATA_MINIMA
  // Si punta con le fiches, dalla minima a tutto il saldo; finché non la si tocca, la puntata e' quella di prima.
  const scelta = Math.min(saldo, puntata ?? giro?.puntata ?? 0)
  const puntataPronta = scelta >= PUNTATA_MINIMA
  const girando = inGioco !== null
  /** La ruota fortunata da girare: la puntata e' gia' sul tavolo. */
  const fortunaDaGirare = giro?.stato === 'sfida' && sfida?.tipo === 'fortuna'
  const inSfida = !!giro && giro.stato !== 'fatto'
  // Il disegno della ruota non cambia mai, e quello della ruota del quiz cambia con le sue categorie.
  const disegnoRuota = useMemo(() => <DisegnoRuota />, [])
  const categorie = quiz?.categorie ?? null
  const chiaveCategorie = categorie?.join(',') ?? ''
  const disegnoQuiz = useMemo(
    () => (chiaveCategorie ? <DisegnoQuiz categorie={chiaveCategorie.split(',') as CategoriaQuiz[]} /> : null),
    [chiaveCategorie],
  )

  /**
   * Una vincita che torna al saldo: le monete volano da `da` al tabellone, che
   * smette di stare fermo quando arriva la prima. Senza da dove partire, il
   * tabellone si muove subito.
   */
  const incassa = (moltiplicatore: number, da: Punto | null) => {
    const a = centroDi(saldoRef.current)
    if (!da || !a) {
      setConto(null)
      return
    }
    void incassaMonete(da, a, moneteDi(moltiplicatore), () => setConto(null))
  }

  /** La festa di un premio grande; quando finisce, `poi`. */
  const festeggia = (dati: Omit<DatiFestaRuota, 'chiave'>, poi: () => void) => {
    dopoLaFesta.current = poi
    setLuci('vinto')
    setFesta({ ...dati, chiave: Date.now() })
  }

  const fineFesta = () => {
    setFesta(null)
    setLuci('attesa')
    const poi = dopoLaFesta.current
    dopoLaFesta.current = null
    poi?.()
  }

  /** La fortuna se ne va: la ruota fortunata torna quella di sempre, con un'ultima luce. */
  const tornaNormale = () => {
    if (ridotto()) {
      setModo('normale')
      return
    }
    setModo('torna')
    dopo(TORNA_MS, () => setModo('normale'))
  }

  /**
   * L'esito di un minigioco: la vincita con le monete, la meta' del ×0,5
   * raccontata come una vincita, o il banco. Le vincite grandi hanno la festa,
   * dopo.
   */
  const annuncia = (g: GiroRuota) => {
    const palio = palioDi(g)
    const torna = tornatoDa(g)
    if (!palio || torna <= 0) {
      accoda(adesivoBanco(g.puntata))
      return
    }
    if (palio.moltiplicatore >= FESTA_MINIGIOCO) return
    if (torna < g.puntata) {
      accoda(adesivoMezzo(torna, g.puntata, palio.moltiplicatore))
      return
    }
    accoda(adesivoVincita(torna, g.puntata, palio.moltiplicatore))
    setPioggia((p) => p + 1)
    dopo(PIOGGIA_MS, () => setPioggia(0))
  }

  /**
   * L'esito del Pachinko e del Cash Hunt, che restituiscono sempre qualcosa: la
   * festa dal ×5, se no l'adesivo; le monete partono da `da` verso il saldo, e
   * poi si torna alla ruota.
   */
  const raccontaMinigioco = (g: GiroRuota, da: Punto | null, nome: string) => {
    const palio = palioDi(g)
    if (!palio) {
      setConto(null)
      dopo(MONETA_IN_VISTA_MS, allaRuota)
      return
    }
    if (palio.moltiplicatore >= FESTA_MINIGIOCO) {
      const fortunata = g.fortunata !== null
      const { moltiplicatore, vincita } = palio
      dopo(ridotto() ? 0 : 300, () =>
        festeggia({ moltiplicatore, vincita, sotto: nome, fortunata }, () => {
          incassa(moltiplicatore, da)
          dopo(MONETA_IN_VISTA_MS - 1_000, allaRuota)
        }),
      )
      return
    }
    annuncia(g)
    incassa(palio.moltiplicatore, da)
    dopo(MONETA_IN_VISTA_MS, allaRuota)
  }

  /* ───────────────────────────────  La puntata  ─────────────────────────────── */

  /** Una fiche: la puntata cresce del suo valore, fino al saldo, e la fiche vola sul numero della puntata. */
  const aggiungiFiche = (valore: number, bottone: HTMLElement) => {
    const nuova = Math.min(saldo, scelta + valore)
    if (nuova <= scelta) {
      suona('tetto')
      return
    }
    setPuntata(nuova)
    const da = centroDi(bottone)
    const a = centroDi(puntataRef.current)
    if (da && a) void volaFiche(da, a, valore, COLORE_FICHE[valore])
    else suona('fiche', { volume: 0.6 })
    if (nuova < scelta + valore) suona('tetto', { ritardo: 0.4 })
  }

  /** Azzera: le fiches tornano dal numero della puntata alla loro riga, in pila. */
  const azzeraPuntata = () => {
    if (scelta === 0) return
    setPuntata(0)
    const da = centroDi(puntataRef.current)
    const a = centroDi(ficheRef.current)
    const pila = inFiches(scelta).map((v) => COLORE_FICHE[v])
    if (da && a) void spostaFiches(da, a, pila)
    else suona('fiche', { volume: 0.4 })
  }

  /* ───────────────────────────────  La ruota  ─────────────────────────────── */

  const lanciaRuota = async () => {
    setEsito(false)
    setDebole(false)
    setLuci('attesa')
    setRiposata(false)
    // La ruota fortunata: la puntata e' gia' sul mozzo, e il saldo resta com'e' finché non si sa.
    if (fortunaDaGirare && giro) {
      setInGioco(giro.puntata)
      if (stato) setConto({ saldo: stato.saldo, netto: stato.netto, giri: stato.giri })
      const nuovo = await chiedi('/ruota/fortuna')
      if (!nuovo?.giro || nuovo.giro.fortunata === null) {
        setAnnulla((x) => x + 1)
        setInGioco(null)
        setConto(null)
        return
      }
      aggiorna(nuovo)
      setFermaSu(fermataDi(nuovo.giro))
      return
    }
    setInGioco(scelta)
    // La puntata si paga adesso: il saldo scende, e le fiches volano sulla ruota.
    if (stato) setConto({ saldo: stato.saldo - scelta, netto: stato.netto - scelta, giri: stato.giri + 1 })
    const da = centroDi(saldoRef.current)
    const a = centroDelMozzo()
    if (da && a) void puntaFiches(da, a, scelta)
    const nuovo = await chiedi('/ruota/gira', { puntata: scelta })
    if (!nuovo?.giro) {
      setAnnulla((x) => x + 1)
      setInGioco(null)
      setConto(null)
      return
    }
    aggiorna(nuovo)
    setFermaSu(fermataDi(nuovo.giro))
  }

  /** La fortuna: il palco si fa verde, la ruota si trasforma, e i premi salgono uno dopo l'altro, con i loro suoni. */
  const avviaMagia = () => {
    setIntermezzo(null)
    if (ridotto()) {
      setModo('fortunata')
      suona('magia')
      return
    }
    setModo('magia')
    setLuci('vinto')
    PASSI_RUOTA.forEach((ms, k) => suona('sale', { ritardo: ms / 1000, altezza: 1 + k * 0.07 }))
    CONTO_DIECI.slice(1).forEach((p, k) => suona('incasso', { ritardo: p.ms / 1000, altezza: 1 + k * 0.11 }))
    suona('magia', { ritardo: CONTO_DIECI[CONTO_DIECI.length - 1].ms / 1000 })
    dopo(DURATA_MAGIA_MS, () => {
      setModo('fortunata')
      setLuci('attesa')
    })
  }

  const fermataRuota = () => {
    setInGioco(null)
    const g = ultimo.current?.giro
    if (!g) {
      setConto(null)
      return
    }
    const fortunata = g.fortunata !== null
    const s = spicchioDi(g)
    if (s.tipo === 'banco') {
      setConto(null)
      setEsito(true)
      setLuci('perso')
      accoda(adesivoBanco(g.puntata))
      const mozzo = centroDelMozzo()
      if (mozzo) perdiFiches(mozzo, g.puntata)
      dopo(1_700, () => setLuci('attesa'))
      if (fortunata) dopo(FORTUNA_IN_VISTA_MS, tornaNormale)
      return
    }
    if (s.tipo === 'split') {
      // Meta' della puntata torna, e si racconta come una vincita: le luci, l'adesivo d'oro, le monete al saldo.
      setEsito(true)
      setLuci('vinto')
      accoda(adesivoSplit(tornatoDa(g)))
      incassa(MOLTIPLICATORE_SPLIT, centroDelMozzo())
      dopo(1_300, () => setLuci('attesa'))
      return
    }
    if (s.tipo === 'fisso' && s.moltiplicatore < MOLTIPLICATORE_FISSO) {
      // Il ×1,5 della ruota fortunata: un premio piccolo, con l'adesivo e la pioggia, senza la festa.
      setEsito(true)
      setLuci('vinto')
      accoda(adesivoVincita(tornatoDa(g), g.puntata, s.moltiplicatore))
      setPioggia((p) => p + 1)
      dopo(PIOGGIA_MS, () => setPioggia(0))
      incassa(s.moltiplicatore, centroDelMozzo())
      dopo(1_300, () => setLuci('attesa'))
      if (fortunata) dopo(FORTUNA_IN_VISTA_MS, tornaNormale)
      return
    }
    if (s.tipo === 'fisso') {
      setEsito(true)
      setLuci('vinto')
      suona('bonus')
      const vincita = g.delta + g.puntata
      const sotto = `${g.puntata} ${scriviMoltiplicatore(s.moltiplicatore)}`
      dopo(ridotto() ? 0 : 450, () =>
        festeggia({ moltiplicatore: s.moltiplicatore, vincita, sotto, fortunata }, () => {
          incassa(s.moltiplicatore, centroDelMozzo())
          if (fortunata) dopo(DOPO_FESTA_MS, tornaNormale)
        }),
      )
      return
    }
    setConto(null)
    setLuci('vinto')
    if (s.tipo === 'fortuna') {
      suona('quadrifoglio')
      setColpo(Date.now())
      dopo(ridotto() ? 300 : COLPO_MS, () => {
        setColpo(null)
        setLuci('attesa')
        setIntermezzo({
          chiave: Date.now(),
          titolo: 'Ruota fortunata',
          sotto: 'I premi salgono',
          colore: 'var(--ct-fortuna)',
          icona: <IconaFortuna />,
          verso: 'fortunata',
        })
      })
      return
    }
    suona('bonus')
    dopo(FESTA_LUCI_MS, () => {
      setLuci('attesa')
      if (s.tipo === 'moneta') {
        setIntermezzo({
          chiave: Date.now(),
          titolo: fortunata ? 'Moneta fortunata' : 'Moneta',
          sotto: 'Blu vinci, rosso vince il banco',
          colore: 'var(--ct-moneta)',
          icona: <MonetaPiccola />,
          verso: 'moneta',
        })
        return
      }
      if (s.tipo === 'pachinko' || s.tipo === 'cashhunt') {
        const pachinko = s.tipo === 'pachinko'
        const nome = nomeDi(s)
        setIntermezzo({
          chiave: Date.now(),
          titolo: fortunata ? `${nome} fortunato` : nome,
          sotto: fortunata ? 'I premi salgono' : pachinko ? 'Lancia la pallina' : 'Scegli un simbolo',
          colore: pachinko ? 'var(--ct-pachinko)' : 'var(--ct-cashhunt)',
          icona: <IconaInsegna tipo={s.tipo} />,
          verso: s.tipo,
        })
        return
      }
      // Il quiz: la ruota del quiz arriva con i moltiplicatori di sempre; dalla fortuna poi salgono.
      setModoQ('normale')
      setRivelato(false)
      setIntermezzo({
        chiave: Date.now(),
        titolo: fortunata ? 'Quiz fortunato' : 'Quiz',
        sotto: fortunata ? 'I moltiplicatori salgono' : 'Gira la ruota del quiz',
        colore: 'var(--ct-quiz)',
        icona: <IconaQuizGrande />,
        verso: 'quiz',
      })
    })
  }

  /* ───────────────────────────  La ruota del quiz  ──────────────────────────── */

  /** Dalla fortuna: i moltiplicatori della ruota del quiz salgono uno dopo l'altro, il ×4 fino al ×10. */
  const avviaAumento = () => {
    if (ridotto()) {
      setModoQ('fortunata')
      suona('magia')
      return
    }
    setModoQ('aumento')
    setLuciQ('vinto')
    PASSI_QUIZ.forEach((ms, k) => suona('sale', { ritardo: ms / 1000, altezza: 1 + k * 0.09 }))
    CONTO_QUIZ.slice(1).forEach((p, k) => suona('incasso', { ritardo: p.ms / 1000, altezza: 1 + k * 0.13 }))
    suona('magia', { ritardo: CONTO_QUIZ[CONTO_QUIZ.length - 1].ms / 1000 })
    dopo(DURATA_AUMENTO_MS, () => {
      setModoQ('fortunata')
      setLuciQ('attesa')
    })
  }

  const fineIntermezzo = () => {
    const verso = intermezzo?.verso
    if (verso === 'fortunata') {
      avviaMagia()
      return
    }
    setIntermezzo(null)
    if (verso === 'quiz' && quizDi(ultimo.current?.giro ?? null)?.fortunata) dopo(250, avviaAumento)
  }

  const lanciaQuiz = async () => {
    setGirandoQ(true)
    setLuciQ('attesa')
    setRivelato(false)
    const nuovo = await chiedi('/ruota/quiz')
    const q = quizDi(nuovo?.giro ?? null)
    if (!nuovo?.giro || !q || q.spicchioQuiz === null) {
      setAnnullaQ((a) => a + 1)
      setGirandoQ(false)
      return
    }
    aggiorna(nuovo)
    setFermaSuQ({ indice: q.spicchioQuiz, chiave: `q${nuovo.giro.n}` })
  }

  const apriDomanda = async () => {
    setScena('domanda')
    const nuovo = await chiedi('/ruota/domanda')
    if (nuovo) aggiorna(nuovo)
  }

  const fermataQuiz = () => {
    setGirandoQ(false)
    setLuciQ('vinto')
    setRivelato(true)
    suona('moltiplicatore')
    dopo(RIVELA_MS, () => {
      setLuciQ('attesa')
      void apriDomanda()
    })
  }

  /* ───────────────────────────────  La domanda  ─────────────────────────────── */

  const rispondi = async (risposta: string | null) => {
    const nuovo = await chiedi('/ruota/risposta', { scelta: risposta })
    if (!nuovo?.giro) return
    const g = nuovo.giro
    const palio = palioDi(g)
    // Il tabellone e' nascosto dalla domanda: la vincita la si vede arrivare tornando alla ruota.
    const vinto = g.delta > 0 && !!palio
    if (vinto) setConto({ saldo: nuovo.saldo - palio.vincita, netto: nuovo.netto - palio.vincita, giri: nuovo.giri })
    daRaccontare.current = {
      vinto,
      moltiplicatore: palio?.moltiplicatore ?? 1,
      puntata: g.puntata,
      vincita: palio?.vincita ?? 0,
    }
    aggiorna(nuovo)
    annuncia(g)
  }

  const allaRuota = () => {
    setScena('ruota')
    setEsito(true)
    setRivelato(false)
    const racconto = daRaccontare.current
    daRaccontare.current = null
    const fortunata = ultimo.current?.giro?.fortunata != null
    if (!racconto) {
      if (fortunata) dopo(FORTUNA_IN_VISTA_MS, tornaNormale)
      return
    }
    dopo(RITORNO_MS, () => {
      const mozzo = centroDelMozzo()
      const { vinto, moltiplicatore, puntata: p, vincita } = racconto
      if (vinto && moltiplicatore >= FESTA_MINIGIOCO) {
        festeggia({ moltiplicatore, vincita, sotto: 'Domanda giusta', fortunata }, () => {
          incassa(moltiplicatore, centroDelMozzo())
          if (fortunata) dopo(DOPO_FESTA_MS, tornaNormale)
        })
        return
      }
      if (vinto) incassa(moltiplicatore, mozzo)
      else if (mozzo) perdiFiches(mozzo, p)
      if (fortunata) dopo(FORTUNA_IN_VISTA_MS, tornaNormale)
    })
  }

  /* ───────────────────────────────  La moneta  ─────────────────────────────── */

  const lanciaMoneta = async () => {
    if (stato) setConto({ saldo: stato.saldo, netto: stato.netto, giri: stato.giri })
    setMonetaCaduta(false)
    const nuovo = await chiedi('/ruota/moneta')
    if (!nuovo?.giro) {
      setConto(null)
      setAnnullaMoneta((a) => a + 1)
      return
    }
    aggiorna(nuovo)
  }

  const caduta = () => {
    setMonetaCaduta(true)
    const g = ultimo.current?.giro
    if (!g) {
      setConto(null)
      return
    }
    annuncia(g)
    const palio = palioDi(g)
    const moneta = centroDi(document.querySelector('.ct-scena--moneta .ct-moneta'))
    if (g.delta > 0 && palio && palio.moltiplicatore >= FESTA_MINIGIOCO) {
      const fortunata = g.fortunata !== null
      dopo(ridotto() ? 0 : 600, () =>
        festeggia({ moltiplicatore: palio.moltiplicatore, vincita: palio.vincita, sotto: 'Blu', fortunata }, () => {
          incassa(palio.moltiplicatore, centroDi(document.querySelector('.ct-scena--moneta .ct-moneta')))
          dopo(MONETA_IN_VISTA_MS - 1_000, allaRuota)
        }),
      )
      return
    }
    if (g.delta > 0 && palio) incassa(palio.moltiplicatore, moneta)
    else {
      setConto(null)
      if (moneta) perdiFiches(moneta, g.puntata)
    }
    dopo(MONETA_IN_VISTA_MS, allaRuota)
  }

  /* ───────────────────────────────  Il Pachinko  ─────────────────────────────── */

  /** La pallina si lancia: la strada la decide il server, e finché non e' in buca il tabellone resta com'era. */
  const lanciaPachinko = async () => {
    if (stato) setConto({ saldo: stato.saldo, netto: stato.netto, giri: stato.giri })
    const nuovo = await chiedi('/ruota/pachinko')
    if (!nuovo?.giro) {
      setConto(null)
      return
    }
    aggiorna(nuovo)
  }

  const arrivoPachinko = () => {
    const g = ultimo.current?.giro
    if (!g) {
      setConto(null)
      return
    }
    raccontaMinigioco(g, centroDi(document.querySelector('.ct-pachinko__buca.is-uscita')), 'Pachinko')
  }

  /* ───────────────────────────────  Il Cash Hunt  ─────────────────────────────── */

  /** La casella scelta va al server, che risponde con il muro intero: finché non si gira, il tabellone resta. */
  const scegliCashHunt = async (casella: number) => {
    if (stato) setConto({ saldo: stato.saldo, netto: stato.netto, giri: stato.giri })
    const nuovo = await chiedi('/ruota/cashhunt', { scelta: casella })
    if (!nuovo?.giro) {
      setConto(null)
      return
    }
    aggiorna(nuovo)
  }

  const rivelatoCashHunt = () => {
    const g = ultimo.current?.giro
    if (!g) {
      setConto(null)
      return
    }
    raccontaMinigioco(g, centroDi(document.querySelector('.ct-caccia__tessera.is-scelta')), 'Cash Hunt')
  }

  /* ───────────────────────────────  La pagina  ─────────────────────────────── */

  const palio = palioDi(giro)
  const fortunata = modo === 'fortunata' || modo === 'magia'
  // Sul mozzo: la puntata, poi la puntata in gioco, poi quel che e' tornato — anche la meta' dello split, che si
  // dice vinta come le altre vincite — o quel che si e' perso.
  const mozzo: Mozzo =
    inGioco !== null
      ? { testo: String(inGioco), sotto: 'in gioco' }
      : fortunaDaGirare && giro
        ? { testo: String(giro.puntata), sotto: 'in gioco' }
        : esito && giro?.stato === 'fatto'
          ? tornatoDa(giro) > 0
            ? { testo: conSegno(tornatoDa(giro)), sotto: 'vinti', tono: 'piu' }
            : { testo: conSegno(-giro.puntata), sotto: 'persi', tono: 'meno' }
          : puoGirare
            ? { testo: String(scelta), sotto: 'puntata' }
            : { testo: String(saldo), sotto: 'saldo' }
  const mozzoQ: Mozzo = rivelato && palio ? { testo: scriviMoltiplicatore(palio.moltiplicatore) } : { testo: '×?' }
  const libera = scena === 'ruota' && !intermezzo && !girando && !inviando && !festa && colpo === null
  const prontaRuota =
    libera &&
    (fortunaDaGirare ? modo === 'fortunata' : modo === 'normale' && !inSfida && puoGirare && puntataPronta && riposata)
  const prontaQ =
    scena === 'quiz' && !intermezzo && !girandoQ && !rivelato && !inviando && modoQ !== 'aumento' && !!quiz
  const inDomanda = scena === 'domanda' && !!quiz
  /** Quel che c'e' in palio alla ruota del quiz, quando si e' fermata: la categoria e il moltiplicatore. */
  const inPalio =
    rivelato && palio && quiz?.categoria ? { categoria: NOMI_CATEGORIE[quiz.categoria], ...palio } : null
  /** Dal colpo del quadrifoglio alla ruota fortunata pronta: il pannello lo dice, e la ruota non si prende. */
  const arrivaLaFortuna = colpo !== null || intermezzo?.verso === 'fortunata' || modo === 'preludio' || modo === 'magia'
  // Il palco e' verde finché la fortuna dura: dall'insegna della ruota fortunata al ritorno a quella di sempre.
  const palcoFortunato = modo === 'preludio' || modo === 'magia' || modo === 'fortunata'
  const classeRuota = `is-principale${fortunata ? ' is-fortunata' : ''}${modo === 'magia' ? ' is-magia' : ''}${
    modo === 'torna' ? ' is-torna' : ''
  }`
  const classeQuiz = `is-quiz${modoQ !== 'normale' ? ' is-fortunata' : ''}${modoQ === 'aumento' ? ' is-aumento' : ''}`
  /** Il premio piu' grande del Pachinko o del Cash Hunt in scena: "fino al ×15". */
  const finoAl =
    sfida?.tipo === 'pachinko'
      ? scriviMoltiplicatore(Math.max(...sfida.moltiplicatori))
      : sfida?.tipo === 'cashhunt'
        ? scriviMoltiplicatore(Math.max(...sfida.valori))
        : ''

  return (
    <Pagina
      titolo={NOME_CRAZY_TIME}
      intera
      indietro={{ a: ROTTE.fortuna, etichetta: 'Fortuna' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      {inDomanda && quiz && (
        <Suspense fallback={<div className="ct-attesa" aria-hidden="true" />}>
          {quiz.domanda && quiz.categoria ? (
            <DomandaRuota
              key={`${giro?.n}-${giro?.stato}`}
              sfida={{ ...quiz, categoria: quiz.categoria }}
              inviando={inviando}
              onRispondi={(r) => void rispondi(r)}
              onTorna={allaRuota}
            />
          ) : inviando || !quiz.categoria ? (
            <div className="ct-attesa" aria-hidden="true" />
          ) : (
            <Pronti categoria={quiz.categoria} vincita={quiz.vincita} onVia={() => void apriDomanda()} />
          )}
        </Suspense>
      )}
      {/* Durante la domanda il palco resta, nascosto: tornando, il tabellone e le ruote sono quelli di prima. */}
      <div className="ct" hidden={inDomanda}>
        {stato && (
          <Tabellone
            saldo={conto?.saldo ?? saldo}
            puntata={inSfida && giro ? giro.puntata : scelta}
            saldoRef={saldoRef}
          />
        )}
        <div className="ct-corpo">
          <div
            className={`ct-palco is-${scena}${luci === 'perso' ? ' is-scosso' : ''}${
              palcoFortunato ? ' is-fortunata' : ''
            }`}
          >
            <span className="ct-palco__fortuna" aria-hidden="true" />
            <span className="ct-palco__luce" aria-hidden="true" />
            <span className="ct-palco__scintille" aria-hidden="true" />
            <span className="ct-palco__insegna" aria-hidden="true">
              Crazy <span>Time</span>
            </span>
            {stato && palcoFortunato && (
              <NastroFortuna testo={NASTRI[scena]} tabellone={scena === 'pachinko' || scena === 'cashhunt'} />
            )}
            {!stato ? (
              <div className="ct-palco__attesa" aria-hidden="true" />
            ) : (
              <>
                <Scena attiva={scena === 'ruota'} nome="ruota">
                  <RuotaFisica
                    spicchi={SPICCHI_RUOTA.length}
                    disegno={disegnoRuota}
                    fermaSu={fermaSu}
                    pronta={prontaRuota}
                    onLancio={() => void lanciaRuota()}
                    onFerma={fermataRuota}
                    onDebole={() => setDebole(true)}
                    annulla={annulla}
                    luci={luci}
                    lampade={24}
                    durataMinima={3_600}
                    mozzo={mozzo}
                    fiche={inGioco !== null || fortunaDaGirare}
                    invito={prontaRuota}
                    etichetta={
                      fortunaDaGirare
                        ? 'La ruota fortunata: trascinala e lasciala andare per girarla'
                        : 'La ruota: trascinala e lasciala andare per girarla'
                    }
                    classe={classeRuota}
                  />
                  {colpo !== null && <ColpoDiFortuna chiave={colpo} />}
                  {modo === 'magia' && <PremioCheSale passi={CONTO_DIECI} />}
                </Scena>
                <Scena attiva={scena === 'quiz'} nome="quiz">
                  {disegnoQuiz && (
                    <RuotaFisica
                      spicchi={SPICCHI_QUIZ}
                      disegno={disegnoQuiz}
                      fermaSu={fermaSuQ}
                      pronta={prontaQ}
                      onLancio={() => void lanciaQuiz()}
                      onFerma={fermataQuiz}
                      onDebole={() => setDebole(true)}
                      annulla={annullaQ}
                      luci={luciQ}
                      lampade={24}
                      durataMinima={2_800}
                      mozzo={mozzoQ}
                      invito={prontaQ}
                      etichetta="La ruota del quiz: trascinala e lasciala andare"
                      classe={classeQuiz}
                    />
                  )}
                  {modoQ === 'aumento' && <PremioCheSale passi={CONTO_QUIZ} />}
                  {rivelato && palio && quiz?.categoria && <Rivelazione categoria={quiz.categoria} {...palio} />}
                </Scena>
                <Scena attiva={scena === 'moneta'} nome="moneta">
                  {sfida?.tipo === 'moneta' && (
                    <Moneta
                      key={giro?.n}
                      moltiplicatore={sfida.moltiplicatore}
                      uscito={sfida.uscito}
                      fortunata={sfida.fortunata}
                      lanciabile={scena === 'moneta' && !intermezzo && giro?.stato === 'sfida' && !inviando}
                      annulla={annullaMoneta}
                      onTocca={() => void lanciaMoneta()}
                      onCaduta={caduta}
                    />
                  )}
                </Scena>
                <Scena attiva={scena === 'pachinko'} nome="pachinko">
                  {sfida?.tipo === 'pachinko' && giro && (
                    <Pachinko
                      key={giro.n}
                      moltiplicatori={sfida.moltiplicatori}
                      fortunata={sfida.fortunata}
                      percorso={sfida.percorso}
                      via={scena === 'pachinko' && !intermezzo}
                      subito={ripresa === giro.n}
                      inVolo={inviando}
                      lanciabile={scena === 'pachinko' && !intermezzo && giro.stato === 'sfida' && !inviando}
                      onLancia={() => void lanciaPachinko()}
                      onFase={setFaseP}
                      onArrivo={arrivoPachinko}
                    />
                  )}
                </Scena>
                <Scena attiva={scena === 'cashhunt'} nome="cashhunt">
                  {sfida?.tipo === 'cashhunt' && giro && (
                    <CashHunt
                      key={giro.n}
                      valori={sfida.valori}
                      fortunata={sfida.fortunata}
                      muro={sfida.muro}
                      scelta={sfida.scelta}
                      via={scena === 'cashhunt' && !intermezzo}
                      subito={ripresa === giro.n}
                      inVolo={inviando}
                      onScegli={(casella) => void scegliCashHunt(casella)}
                      onFase={setFaseC}
                      onRivelato={rivelatoCashHunt}
                    />
                  )}
                </Scena>
              </>
            )}
            <Intermezzo
              dati={intermezzo}
              onMezzo={() => {
                if (!intermezzo) return
                if (intermezzo.verso === 'fortunata') setModo('preludio')
                else setScena(intermezzo.verso)
              }}
              onFine={fineIntermezzo}
            />
          </div>

          <section className="ct-pannello" aria-live="polite">
            {errore ? (
              <p className="ct-nota">{errore}</p>
            ) : !stato ? null : scena === 'quiz' && quiz ? (
              <Indicazione
                titolo={
                  rivelato && palio
                    ? `In palio ${palio.vincita} punti`
                    : modoQ === 'aumento'
                      ? 'I moltiplicatori salgono'
                      : quiz.fortunata
                        ? 'Gira il quiz fortunato'
                        : 'Gira la ruota del quiz'
                }
              >
                {inPalio
                  ? `${inPalio.categoria} ${scriviMoltiplicatore(inPalio.moltiplicatore)}, se rispondi giusto`
                  : modoQ === 'aumento'
                    ? `Fino al ×10, con ${giro?.puntata} punti in gioco`
                    : debole
                      ? 'Più forte: trascinala e lasciala andare'
                      : 'Trascina la ruota e lasciala andare'}
              </Indicazione>
            ) : scena === 'moneta' && sfida?.tipo === 'moneta' ? (
              <Indicazione
                titolo={
                  sfida.uscito && monetaCaduta
                    ? sfida.uscito === 'blu'
                      ? `Blu: vinci ${sfida.vincita}!`
                      : 'Rosso: vince il banco'
                    : sfida.fortunata
                      ? 'Tocca la moneta fortunata'
                      : 'Tocca la moneta'
                }
              >
                <span className="ct-lati">
                  <span className="ct-lato is-blu">
                    Blu {scriviMoltiplicatore(sfida.moltiplicatore)} · vinci {sfida.vincita}
                  </span>
                  <span className="ct-lato is-rosso">Rosso · banco</span>
                </span>
              </Indicazione>
            ) : scena === 'pachinko' && sfida?.tipo === 'pachinko' && giro ? (
              <div className="ct-indicazione">
                <p className="ct-indicazione__titolo">
                  {faseP === 'caduta' && palio
                    ? `${scriviMoltiplicatore(palio.moltiplicatore)}: vinci ${palio.vincita}!`
                    : faseP === 'sale' || (intermezzo && sfida.fortunata)
                      ? 'I premi salgono'
                      : sfida.fortunata
                        ? 'Lancia la pallina fortunata'
                        : 'Lancia la pallina'}
                </p>
                <p className="ct-indicazione__testo">
                  {faseP === 'caduta' && palio
                    ? `${giro.puntata} ${scriviMoltiplicatore(palio.moltiplicatore)}`
                    : `${giro.puntata} punti in gioco, fino al ${finoAl}`}
                </p>
                {faseP !== 'caduta' && (
                  <Button
                    size="lg"
                    fullWidth
                    disabled={faseP !== 'pronta' || inviando || !!intermezzo}
                    onClick={() => void lanciaPachinko()}
                  >
                    Lancia
                  </Button>
                )}
              </div>
            ) : scena === 'cashhunt' && sfida?.tipo === 'cashhunt' && giro ? (
              <Indicazione
                titolo={
                  (faseC === 'rivela' || faseC === 'fine') && palio
                    ? `${scriviMoltiplicatore(palio.moltiplicatore)}: vinci ${palio.vincita}!`
                    : faseC === 'sale'
                      ? 'I premi salgono'
                      : faseC === 'copre' || faseC === 'mescola'
                        ? 'Si mescola'
                        : faseC === 'scoperto'
                          ? 'Guarda il muro'
                          : 'Scegli un simbolo'
                }
              >
                {(faseC === 'rivela' || faseC === 'fine') && palio
                  ? `${giro.puntata} ${scriviMoltiplicatore(palio.moltiplicatore)}`
                  : `${giro.puntata} punti in gioco, fino al ${finoAl}`}
              </Indicazione>
            ) : arrivaLaFortuna ? (
              <Indicazione titolo={modo === 'magia' ? 'I premi salgono' : 'Fortuna!'}>
                La ruota diventa la ruota fortunata
              </Indicazione>
            ) : fortunaDaGirare && giro ? (
              <div className="ct-indicazione">
                <p className="ct-indicazione__titolo">Gira la ruota fortunata</p>
                <p className={`ct-suggerimento${debole ? ' is-debole' : ''}`}>
                  <ManoCheTrascina />
                  {girando
                    ? `${giro.puntata} punti in gioco`
                    : debole
                      ? 'Più forte: trascinala e lasciala andare'
                      : `${giro.puntata} punti in gioco, fino al ×10`}
                </p>
              </div>
            ) : inSfida && giro && !girando ? (
              <Indicazione titolo={nomeDi(spicchioDi(giro))}>{giro.puntata} punti in gioco</Indicazione>
            ) : !puoGirare ? (
              <PochiPunti saldo={saldo} onClassificate={() => vai(ROTTE.home)} />
            ) : (
              <>
                <FichesPuntata
                  valore={scelta}
                  minima={PUNTATA_MINIMA}
                  tetto={saldo}
                  attiva={!girando && !inviando}
                  valoreRef={puntataRef}
                  rigaRef={ficheRef}
                  onAggiungi={aggiungiFiche}
                  onAzzera={azzeraPuntata}
                />
                {(puntataPronta || girando) && (
                  <p className={`ct-suggerimento${debole ? ' is-debole' : ''}`}>
                    <ManoCheTrascina />
                    {girando
                      ? `${inGioco} punti in gioco`
                      : debole
                        ? 'Più forte: trascinala e lasciala andare'
                        : 'Trascina la ruota per girarla'}
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      <Adesivo adesivo={adesivo} />
      {pioggia > 0 && <PioggiaDiMonete key={pioggia} />}
      {festa && <FestaRuota key={festa.chiave} dati={festa} onFine={fineFesta} />}
      <ComeSiGiocaRuota open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

/* ─────────────────────────────  I pezzi della pagina  ───────────────────────────── */

/** Una scena del palco: quella attiva si vede, le altre aspettano dietro, e non si toccano. */
function Scena({ attiva, nome, children }: { attiva: boolean; nome: string; children: ReactNode }) {
  return (
    <div className={`ct-scena ct-scena--${nome}${attiva ? ' is-attiva' : ''}`} aria-hidden={!attiva} inert={!attiva}>
      {children}
    </div>
  )
}

/** Il cartello della categoria della domanda: l'icona e il nome, nel colore della sua materia. */
function Cartello({ categoria }: { categoria: CategoriaQuiz }) {
  return (
    <p className="ct-cartello" style={{ '--colore': coloreDellaCategoria(categoria) } as CSSProperties}>
      <IconaCategoria categoria={categoria} piccola />
      {NOMI_CATEGORIE[categoria]}
    </p>
  )
}

/**
 * Dove si e' fermata la ruota del quiz: la categoria, che salta fuori con la
 * sua icona, il moltiplicatore enorme con i suoi raggi, e quel che mette in
 * palio.
 */
function Rivelazione({
  categoria,
  moltiplicatore,
  vincita,
}: {
  categoria: CategoriaQuiz
  moltiplicatore: number
  vincita: number
}) {
  return (
    <div
      className="ct-rivela"
      style={{ '--colore': coloreDelMoltiplicatore(moltiplicatore) } as CSSProperties}
      aria-hidden="true"
    >
      <span className="ct-rivela__raggi" />
      <Cartello categoria={categoria} />
      <span className="ct-rivela__valore">{scriviMoltiplicatore(moltiplicatore)}</span>
      <span className="ct-rivela__palio">
        in palio <span className="u-tabnum">{vincita}</span>
      </span>
    </div>
  )
}

/** La domanda pronta ma non ancora aperta, come quando si riapre la pagina: il tempo parte dal Via. */
function Pronti({
  categoria,
  vincita,
  onVia,
}: {
  categoria: CategoriaQuiz
  vincita: number | null
  onVia: () => void
}) {
  return (
    <div className="ct-pronti">
      <Cartello categoria={categoria} />
      {vincita !== null && (
        <p className="ct-pronti__palio">
          In palio <span className="u-tabnum">{vincita}</span> punti
        </p>
      )}
      <Button size="lg" fullWidth onClick={onVia}>
        Via
      </Button>
    </div>
  )
}

function Indicazione({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <div className="ct-indicazione">
      <p className="ct-indicazione__titolo">{titolo}</p>
      <p className="ct-indicazione__testo">{children}</p>
    </div>
  )
}

function PochiPunti({ saldo, onClassificate }: { saldo: number; onClassificate: () => void }) {
  return (
    <div className="ct-indicazione">
      <p className="ct-indicazione__titolo">Servono {PUNTATA_MINIMA} punti</p>
      <p className="ct-indicazione__testo">{saldo > 0 ? `Ne hai ${saldo}.` : 'Fai punti nelle classificate.'}</p>
      <Button size="lg" fullWidth variant="tinted" onClick={onClassificate}>
        Alle classificate
      </Button>
    </div>
  )
}

function IconaCategoria({ categoria, piccola = false }: { categoria: CategoriaQuiz; piccola?: boolean }) {
  const Icona = iconaDellaCategoria(categoria)
  return <Icona size={piccola ? 18 : 34} />
}

/** La moneta dell'insegna: mezza blu e mezza rossa. */
function MonetaPiccola() {
  return (
    <svg width="38" height="38" viewBox="-20 -20 40 40" aria-hidden="true">
      <circle r="19" fill="var(--ct-oro)" stroke="var(--ct-oro-scuro)" strokeWidth="1.4" />
      <path d="M0 -16A16 16 0 0 0 0 16Z" fill="var(--ct-blu)" />
      <path d="M0 -16A16 16 0 0 1 0 16Z" fill="var(--ct-rosso)" />
    </svg>
  )
}

/** Il fumetto del quiz, per l'insegna. */
function IconaQuizGrande() {
  return (
    <svg width="40" height="40" viewBox="-13 -13 26 26" className="ct-icona-insegna" aria-hidden="true">
      <IconaQuiz lato={24} />
    </svg>
  )
}

/** Il Pachinko o il Cash Hunt, per l'insegna dell'intermezzo: le icone degli spicchi, in grande. */
function IconaInsegna({ tipo }: { tipo: 'pachinko' | 'cashhunt' }) {
  return (
    <svg width="44" height="44" viewBox="-12 -12 24 24" className="ct-icona-insegna" aria-hidden="true">
      {tipo === 'pachinko' ? <IconaPachinko lato={23} /> : <IconaCashHunt lato={23} />}
    </svg>
  )
}

/** Il quadrifoglio d'oro, per l'insegna della ruota fortunata. */
function IconaFortuna() {
  return (
    <svg width="44" height="44" viewBox="-11 -11 22 22" aria-hidden="true">
      <Quadrifoglio lato={19} />
    </svg>
  )
}

/** Una mano che trascina: dice che la ruota si muove col dito. */
function ManoCheTrascina() {
  return (
    <svg className="ct-mano" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 11.5V5.2a1.6 1.6 0 0 1 3.2 0v5.3m0-1.2a1.6 1.6 0 0 1 3.2 0v1.6m0-.6a1.6 1.6 0 0 1 3.2 0v4.6
          c0 3.7-2.5 6.3-6 6.3h-.8c-2 0-3.4-.9-4.6-2.6L4 13.3a1.6 1.6 0 0 1 2.6-1.9L9 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ─────────────────────────────  Gli adesivi  ───────────────────────────── */

function adesivoVincita(vincita: number, puntata: number, moltiplicatore: number): Omit<DatiAdesivo, 'id'> {
  return {
    durata: ADESIVO_MS + 400,
    tono: 'vivace',
    titolo: `Vinci ${vincita}!`,
    sotto: `${puntata} ${scriviMoltiplicatore(moltiplicatore)}`,
    classe: 'ct-adesivo-vincita',
    suono: 'vincita',
  }
}

/**
 * Lo split: d'oro come una vincita, con la moneta tagliata e quel che torna,
 * e il suo suono. E' una perdita vestita da vincita, come la ciliegia sola
 * della slot: il saldo, sceso della puntata, risale della meta'.
 */
function adesivoSplit(vincita: number): Omit<DatiAdesivo, 'id'> {
  return {
    durata: ADESIVO_MS,
    tono: 'vivace',
    titolo: 'Split',
    sotto: `Vinci ${vincita}`,
    disegno: (
      <svg className="ct-adesivo-split" width="54" height="54" viewBox="-12 -12 24 24" aria-hidden="true">
        <IconaSplit lato={23} />
      </svg>
    ),
    classe: 'ct-adesivo-vincita',
    suono: 'split',
  }
}

/** Il ×0,5 del Pachinko e del Cash Hunt: torna meta' della puntata, e si racconta come lo split. */
function adesivoMezzo(vincita: number, puntata: number, moltiplicatore: number): Omit<DatiAdesivo, 'id'> {
  return {
    durata: ADESIVO_MS,
    tono: 'vivace',
    titolo: `Vinci ${vincita}`,
    sotto: `${puntata} ${scriviMoltiplicatore(moltiplicatore)}`,
    classe: 'ct-adesivo-vincita',
    suono: 'split',
  }
}

function adesivoBanco(puntata: number): Omit<DatiAdesivo, 'id'> {
  return {
    durata: ADESIVO_MS,
    tono: 'bordato',
    titolo: 'Vince il banco',
    sotto: `${conSegno(-puntata)} punti`,
    colore: 'var(--ct-rosso)',
    suono: 'banco',
  }
}
