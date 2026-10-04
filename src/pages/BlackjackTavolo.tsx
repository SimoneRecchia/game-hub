import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi, type DatiAdesivo } from '@/components/Adesivo'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { useToast } from '@/components/Toast'
import { DefinizioniCarte, PostoCarta, SabotContext } from '@/games/blackjack/Carta'
import { ComeSiGiocaBlackjack } from '@/games/blackjack/ComeSiGioca'
import { COLORE_FICHE, Fiche, PilaFiches, coloreFiche, scomponi } from '@/games/blackjack/Fiches'
import { Mano } from '@/games/blackjack/Mano'
import {
  carteDi,
  chiaveBanco,
  pianoDi,
  VOLO_CARTA_MS,
  type ArrivoCarta,
  type CarteViste,
} from '@/games/blackjack/piano'
import { raccogliCarte } from '@/games/blackjack/raccolta'
import {
  AnelloTempo,
  BarraTempo,
  PostoAltro,
  PostoAssicurazione,
  PostoLibero,
  Rastrelliera,
  Sabot,
  Scarti,
  Scritte,
  SegnoAssicurazione,
  Stato,
  chiaviMano,
  esitiDelPosto,
  type CarteInGioco,
} from '@/games/blackjack/Tavolo'
import { uscitaDalTavolo } from '@/games/blackjack/uscita'
import { Tabellone } from '@/games/fortuna/Tabellone'
import { useDopo } from '@/games/fortuna/useDopo'
import { centroDi, incassaMonete, puntaFiches, spostaFiches, volaFiche } from '@/games/fortuna/voli'
import { PIOGGIA_MS, PioggiaDiMonete } from '@/games/ruota/Intermezzo'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { suona } from '@/lib/suoni'
import {
  GETTONI_BJ,
  PUNTATA_MINIMA_BJ,
  costoAssicurazione,
  deltaAssicurazione,
  eBlackjack,
  mossePossibili,
  sballata,
  totaleDi,
  type AzioneBJ,
  type MossaBJ,
} from '@shared/blackjack'
import { POSTI_BJ, PUNTATE_MS, TURNO_MS } from '@shared/blackjack-tavolo'
import type { VistaTavoloBJ } from '@shared/types'
import './BlackjackTavolo.css'

/** Quanto restano in vista gli esiti prima che il croupier raccolga le carte, come minimo. */
const ESITI_MS = 2_600
/** Il ritmo del controllo: stretto quando si aspetta qualcuno, largo da soli o quando tocca a me. */
const POLL_ATTESA_MS = 1_500
const POLL_CALMO_MS = 4_000
const POLL_DA_SOLI_MS = 5_000

const ADESIVO_MS = 2_200

/** Lo split: due carte che si separano. */
const SEGNO_SPLIT = (
  <svg className="bj-mossa__icona" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5.4" y="5.5" width="5.4" height="13" rx="1.4" />
    <rect x="13.2" y="5.5" width="5.4" height="13" rx="1.4" />
    <path d="M3.5 12H.9m1.5-1.8L.9 12l1.5 1.8M20.5 12h2.6m-1.5-1.8 1.5 1.8-1.5 1.8" fill="none" />
  </svg>
)

/**
 * Le mosse, come si chiamano ai tavoli italiani, con il segno che hanno ai
 * tavoli delle app. Ci sono sempre tutte, spente quando non si possono fare:
 * lo split si vede anche quando non c'e' una coppia.
 */
const MOSSE: Array<{ azione: AzioneBJ; nome: string; segno: ReactNode }> = [
  { azione: 'dividi', nome: 'Split', segno: SEGNO_SPLIT },
  { azione: 'raddoppia', nome: 'Raddoppia', segno: '×2' },
  { azione: 'carta', nome: 'Carta', segno: '+' },
  { azione: 'stai', nome: 'Stai', segno: '−' },
]

const oro = (titolo: string, sotto?: string, suono: DatiAdesivo['suono'] = 'vincita'): Omit<DatiAdesivo, 'id'> => ({
  durata: ADESIVO_MS + 300,
  tono: 'vivace',
  titolo,
  sotto,
  classe: 'ct-adesivo-vincita',
  suono,
})

const bordato = (titolo: string, sotto?: string, suono?: DatiAdesivo['suono']): Omit<DatiAdesivo, 'id'> => ({
  durata: ADESIVO_MS,
  tono: 'bordato',
  titolo,
  sotto,
  colore: 'var(--bj-panno-2)',
  suono,
})

/** I posti degli altri, nell'ordine in cui si vedono da sinistra: la sinistra del banco e' a destra dello schermo. */
function altriPosti(mio: number | null): number[] {
  const tutti = Array.from({ length: POSTI_BJ }, (_, i) => POSTI_BJ - 1 - i)
  return mio === null ? tutti.slice(0, 4) : tutti.filter((i) => i !== mio)
}

/**
 * Dove sta ogni posto degli altri, da sinistra: due per lato, lungo il bordo
 * curvo, gli esterni piu' in alto. Il centro resta al banco e a me.
 */
const ARCO: Array<{ x: number; y: number }> = [
  { x: 12, y: 47 },
  { x: 15, y: 66 },
  { x: 85, y: 66 },
  { x: 88, y: 47 },
]

/** Il tempo che resta, contando da quando e' arrivata la vista. */
function resta(v: VistaTavoloBJ | null, ricevuta: number, ora: number): number | null {
  if (!v || v.scadenzaMs === null) return null
  return Math.max(0, v.scadenzaMs - (ora - ricevuta))
}

function useOra(attivo: boolean): number {
  const [ora, setOra] = useState(() => Date.now())
  useEffect(() => {
    if (!attivo) return
    const t = window.setInterval(() => setOra(Date.now()), 200)
    return () => window.clearInterval(t)
  }, [attivo])
  return ora
}

/**
 * Il tavolo del blackjack. Il server dice com'e' il tavolo; qui lo si mostra
 * nell'ordine in cui succede (`pianoDi`): le carte che volano dal sabot una
 * alla volta, il banco che pesca con calma, gli esiti quando l'ultima carta e'
 * arrivata, il croupier che raccoglie. Il tabellone resta fermo (`conto`)
 * finché la vincita non arriva al saldo.
 *
 * Chi lascia la pagina si alza dal tavolo: le puntate non giocate tornano, le
 * mani in corso stanno e si pagano lo stesso.
 */
export default function BlackjackTavolo() {
  const { id = '' } = useParams()
  const { vai } = useNavigazione()
  const toast = useToast()
  const dopo = useDopo()
  const { adesivo, accoda } = useCodaAdesivi()

  const [vista, setVista] = useState<VistaTavoloBJ | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const vistaRef = useRef<VistaTavoloBJ | null>(null)
  const ricevuta = useRef(0)
  /** Le carte gia' viste o in arrivo, al loro posto: una carta vola una volta sola. */
  const viste = useRef<CarteViste>(new Map())
  /** Quando e da dove arriva ogni carta nuova: lo legge la carta quando compare. */
  const arrivi = useRef(new Map<string, ArrivoCarta>())
  const [inArrivo, setInArrivo] = useState<ReadonlySet<string>>(new Set())
  /** Il giro di cui si vedono gli esiti, e quello le cui carte sono gia' state raccolte. */
  const [esitiDi, setEsitiDi] = useState<number | null>(null)
  const esitiRef = useRef<number | null>(null)
  const [pulito, setPulito] = useState<number | null>(null)
  const pulitoRef = useRef<number | null>(null)
  /** Il saldo che si vede mentre il giro si racconta: la vincita arriva con le monete. */
  const [conto, setConto] = useState<number | null>(null)
  /** Le fiches posate per la prossima puntata, e quelle dell'ultima, per "Ripeti". */
  const [fiches, setFiches] = useState<number[]>([])
  const inVoloFiches = useRef(0)
  const [ultima, setUltima] = useState<number[]>([])
  /** La mia pila a giro chiuso: raddoppiata dalla vincita, o andata via. Quella dell'assicurazione fa lo stesso. */
  const [pila, setPila] = useState<'ferma' | 'vinta' | 'via'>('ferma')
  const [pilaAss, setPilaAss] = useState<'ferma' | 'vinta' | 'via'>('ferma')
  const [inviando, setInviando] = useState(false)
  const inVolo = useRef(false)
  const [regole, setRegole] = useState(false)
  const [pioggia, setPioggia] = useState(0)

  const tavoloRef = useRef<HTMLDivElement>(null)
  const sabotRef = useRef<HTMLSpanElement>(null)
  const scartiRef = useRef<HTMLDivElement>(null)
  const rastrellieraRef = useRef<HTMLDivElement>(null)
  const cerchioRef = useRef<HTMLDivElement>(null)
  const assicurazioneRef = useRef<HTMLDivElement>(null)
  const saldoRef = useRef<HTMLSpanElement>(null)

  /* ─────────────────────────────  Raccontare il tavolo  ───────────────────────────── */

  /** Le carte del giro chiuso volano negli scarti, e il tavolo e' pronto per le puntate. */
  const pulisci = useCallback((giro: number) => {
    if (pulitoRef.current === giro) return 0
    const durata = raccogliCarte(tavoloRef.current, scartiRef.current)
    pulitoRef.current = giro
    setPulito(giro)
    setPila('ferma')
    setPilaAss('ferma')
    return durata
  }, [])

  const mostraEsiti = useCallback(
    (v: VistaTavoloBJ) => {
      if (esitiRef.current === v.giro) return
      esitiRef.current = v.giro
      setEsitiDi(v.giro)
      const inGioco = v.posti.filter((p) => p && p.puntata > 0 && !p.via)
      const vive = inGioco.some((p) => p!.mani.some((m) => !sballata(m.carte)))
      const totaleBanco = totaleDi(v.banco).totale
      const mio = v.mio !== null ? v.posti[v.mio] : null
      const assicurato = mio && mio.puntata > 0 ? mio.assicurazione : 0
      const daAssicurazione = deltaAssicurazione(assicurato, v.banco)
      if (vive && totaleBanco > 21) accoda(oro('Il banco sballa!', `${totaleBanco}`, 'vincita'))
      // A chi si era assicurato il blackjack del banco lo racconta l'assicurazione che paga.
      else if (vive && eBlackjack(v.banco) && daAssicurazione <= 0) {
        accoda(bordato('Blackjack del banco', undefined, 'banco'))
      }
      if (daAssicurazione > 0) accoda(oro('L’assicurazione paga', `+${daAssicurazione}`))
      const finePulizia = () => {
        const fine = (resta(v, ricevuta.current, Date.now()) ?? 0) + 100
        dopo(Math.max(ESITI_MS, fine), () => {
          if (vistaRef.current?.giro === v.giro) pulisci(v.giro)
        })
      }
      if (!mio || mio.puntata === 0 || mio.delta === null) {
        setConto(null)
        finePulizia()
        return
      }
      // Le mani e l'assicurazione si pagano ognuna dal suo posto: il delta del giro e' la loro somma.
      const delta = mio.delta - daAssicurazione
      const cerchio = centroDi(cerchioRef.current)
      const centroAss = centroDi(assicurazioneRef.current)
      const rastrelliera = centroDi(rastrellieraRef.current)
      const saldo = centroDi(saldoRef.current)
      const colori = scomponi(mio.puntata).map((x) => COLORE_FICHE[x])
      const tutteSballate = mio.mani.every((m) => sballata(m.carte))
      // Il saldo resta fermo finché non arriva la prima moneta, o la puntata che torna; subito, se non torna niente.
      let liberato = false
      const libera = () => {
        if (liberato) return
        liberato = true
        setConto(null)
      }
      if (delta > 0) {
        const bj = mio.mani.length === 1 && eBlackjack(mio.mani[0].carte)
        accoda(oro(bj ? 'Blackjack!' : `Vinci ${delta}!`, bj ? `+${delta}` : undefined))
        // La pioggia per i momenti grandi: il blackjack, e le vincite con un raddoppio o uno split.
        if (bj || mio.mani.some((m) => m.raddoppiata || m.divisa)) {
          setPioggia((p) => p + 1)
          dopo(PIOGGIA_MS, () => setPioggia(0))
        }
        // Il banco paga: le fiches dalla rastrelliera alla puntata, poi tutto al saldo, in monete.
        const paga = rastrelliera && cerchio ? spostaFiches(rastrelliera, cerchio, colori, 250) : Promise.resolve()
        void paga.then(() => {
          setPila('vinta')
          dopo(500, () => {
            setPila('via')
            if (cerchio && saldo) {
              void incassaMonete(cerchio, saldo, Math.min(22, 6 + Math.round(Math.sqrt(delta) * 1.5)), libera)
            } else libera()
          })
        })
      } else if (delta < 0) {
        if (!tutteSballate) accoda(bordato('Vince il banco', `${delta}`, 'banco'))
        setPila('via')
        if (cerchio && rastrelliera) void spostaFiches(cerchio, rastrelliera, colori, 150)
      } else {
        accoda(bordato('Pari', 'La puntata torna', 'pareggio'))
        setPila('via')
        const torna = cerchio && saldo ? spostaFiches(cerchio, saldo, colori, 150) : Promise.resolve()
        void torna.then(libera)
      }
      if (assicurato > 0) {
        if (daAssicurazione > 0) {
          // Pagata 2 a 1: il banco porta la sua fiche sull'assicurazione, poi tutto al saldo.
          const pagata = [coloreFiche(daAssicurazione)]
          const paga =
            rastrelliera && centroAss ? spostaFiches(rastrelliera, centroAss, pagata, 250) : Promise.resolve()
          void paga.then(() => {
            setPilaAss('vinta')
            dopo(500, () => {
              setPilaAss('via')
              const monete = 6 + Math.min(10, Math.round(Math.sqrt(daAssicurazione)))
              if (centroAss && saldo) void incassaMonete(centroAss, saldo, monete, libera)
              else libera()
            })
          })
        } else {
          setPilaAss('via')
          if (centroAss && rastrelliera) void spostaFiches(centroAss, rastrelliera, [coloreFiche(assicurato)], 150)
        }
      }
      if (delta < 0 && daAssicurazione <= 0) libera()
      finePulizia()
    },
    [accoda, dopo, pulisci],
  )

  /**
   * Una vista nuova del tavolo: il piano delle carte nuove, il saldo fermo se
   * il mio giro si e' appena chiuso, e gli esiti quando le carte sono arrivate.
   */
  const applica = useCallback(
    (nuova: VistaTavoloBJ, primo = false) => {
      const prima = vistaRef.current
      if (prima && nuova.versione < prima.versione) return
      ricevuta.current = Date.now()
      let ritardo = 0
      // Il server e' gia' al giro dopo, e le carte di prima sono ancora sul panno: il croupier le raccoglie.
      if (prima && nuova.giro !== prima.giro && pulitoRef.current !== prima.giro) {
        esitiRef.current = prima.giro
        ritardo = pulisci(prima.giro)
      }
      if (primo) for (const [k, c] of carteDi(nuova)) viste.current.set(k, c)
      const piano = pianoDi(nuova, viste.current, ritardo)
      for (const [k, a] of piano.arrivi) arrivi.current.set(k, a)
      if (piano.arrivi.size > 0) setInArrivo((p) => new Set([...p, ...piano.arrivi.keys()]))

      const mio = nuova.mio !== null ? nuova.posti[nuova.mio] : null
      const daMostrare = nuova.fase === 'fine' && esitiRef.current !== nuova.giro
      // Il saldo di prima della fine: quel che c'era meno tutto quel che stava sul tavolo, assicurazione compresa.
      if (daMostrare && !primo && mio && mio.delta !== null && mio.puntata > 0) {
        setConto(nuova.saldo - (mio.delta + mio.puntata + mio.assicurazione))
      }
      // Le mie mani che sballano, e il blackjack: il momento si dice quando la carta e' arrivata.
      if (!primo && mio && nuova.mio !== null) {
        mio.mani.forEach((m, o) => {
          const chiave = chiaviMano(nuova.giro, nuova.mio!, m.id ?? o, m.carte.length).at(-1)!
          const arrivo = piano.arrivi.get(chiave)
          if (!arrivo) return
          const quando = arrivo.ritardo + VOLO_CARTA_MS
          const totale = `${totaleDi(m.carte).totale}`
          if (sballata(m.carte)) dopo(quando, () => accoda(bordato('Sballato', totale, 'sballato')))
          else if (eBlackjack(m.carte, m.divisa)) dopo(quando, () => accoda(oro('Blackjack!', undefined, 'blackjack')))
        })
      }
      vistaRef.current = nuova
      setVista(nuova)
      if (daMostrare) {
        if (primo) {
          esitiRef.current = nuova.giro
          setEsitiDi(nuova.giro)
        } else dopo(piano.fine + 250, () => mostraEsiti(nuova))
      }
    },
    [accoda, dopo, mostraEsiti, pulisci],
  )

  const onAtterra = useCallback((chiave: string) => {
    arrivi.current.delete(chiave)
    setInArrivo((p) => {
      if (!p.has(chiave)) return p
      const n = new Set(p)
      n.delete(chiave)
      return n
    })
    if (chiave.includes(':b:') && !chiave.endsWith(':b:0')) suona('giraCarta', { volume: 0.8 })
  }, [])

  /* ─────────────────────────────────  Il server  ───────────────────────────────── */

  const leggi = useCallback(async () => {
    try {
      const v = await api<VistaTavoloBJ>(`/blackjack/tavolo/${id}`)
      applica(v, vistaRef.current === null)
    } catch (e) {
      if (e instanceof ApiFetchError && e.status === 404) setErrore('Questo tavolo non c’è più.')
      else if (!vistaRef.current) setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco ad aprire il tavolo.')
    }
  }, [id, applica])

  useEffect(() => {
    void leggi()
  }, [leggi])

  // Il controllo: stretto se qualcuno aspetta, largo da soli; e subito dopo una scadenza.
  useEffect(() => {
    let vivo = true
    let t = 0
    const cadenza = () => {
      const v = vistaRef.current
      if (!v) return POLL_CALMO_MS
      const altri = v.posti.some((p, k) => p && k !== v.mio && !p.via)
      let ms = v.mio === null ? POLL_CALMO_MS : !altri ? POLL_DA_SOLI_MS : POLL_ATTESA_MS
      if (altri && v.fase === 'gioco' && v.turno?.posto === v.mio) ms = POLL_CALMO_MS
      const r = resta(v, ricevuta.current, Date.now())
      if (altri && r !== null) ms = Math.min(ms, r + 300)
      return Math.max(400, ms)
    }
    const giro = async () => {
      if (!vivo) return
      if (document.visibilityState === 'visible' && !inVolo.current) await leggi()
      if (vivo) t = window.setTimeout(giro, cadenza())
    }
    t = window.setTimeout(giro, cadenza())
    return () => {
      vivo = false
      window.clearTimeout(t)
    }
  }, [leggi])

  // Chi lascia la pagina dall'app si alza. In sviluppo React smonta e rimonta subito: l'uscita aspetta un giro
  // per saperlo. Chi chiude la scheda, o la ricarica, resta seduto: lo libera la presenza, se non torna.
  const uscita = useRef(0)
  useEffect(() => {
    window.clearTimeout(uscita.current)
    return () => {
      uscita.current = window.setTimeout(() => {
        uscitaDalTavolo(api(`/blackjack/tavolo/${id}/lascia`, { method: 'POST', body: {}, keepalive: true }))
        dimentica('/fortuna')
      }, 0)
    }
  }, [id])

  /** Una richiesta che risponde con il tavolo: se va male lo dice, e rilegge com'e' davvero. */
  const chiedi = useCallback(
    async (percorso: string, corpo: unknown): Promise<VistaTavoloBJ | null> => {
      if (inVolo.current) return null
      inVolo.current = true
      setInviando(true)
      try {
        const v = await api<VistaTavoloBJ>(percorso, { method: 'POST', body: corpo })
        dimentica('/fortuna')
        return v
      } catch (e) {
        toast.show(e instanceof ApiFetchError ? e.message : 'Non è andata: riprova.', 'error')
        inVolo.current = false
        await leggi()
        return null
      } finally {
        inVolo.current = false
        setInviando(false)
      }
    },
    [toast, leggi],
  )

  /* ────────────────────────────────  Che cosa si vede  ──────────────────────────────── */

  const ora = useOra(!!vista && (vista.scadenzaMs !== null || vista.fase !== 'puntate'))
  const pulita = !!vista && vista.fase === 'fine' && pulito === vista.giro
  const fase = vista ? (pulita ? 'puntate' : vista.fase) : 'puntate'
  const giroMostrato = vista ? (pulita ? vista.giro + 1 : vista.giro) : 0
  const mio = vista && vista.mio !== null ? vista.posti[vista.mio] : null
  const chiuso = !!vista && vista.fase === 'fine' && esitiDi === vista.giro
  const arrivando = inArrivo.size > 0
  const altri = !!vista && vista.posti.some((p, k) => p && k !== vista.mio && !p.via)
  const tempo = resta(vista, ricevuta.current, ora)

  const sommaFiches = fiches.reduce((s, v) => s + v, 0)
  const saldo = vista?.saldo ?? 0
  /** La mia puntata di questo giro, se l'ho messa; prima di metterla, le fiches posate. */
  const puntataServer = mio && !pulita && (vista?.fase !== 'puntate' || mio.puntata > 0) ? mio.puntata : 0
  const assicurazione = puntataServer > 0 ? mio!.assicurazione : 0
  const devoPuntare = !!vista && !!mio && fase === 'puntate' && puntataServer === 0 && !mio.via
  /** Sul tabellone, tutto quel che ho sul tavolo: le mani e l'assicurazione. */
  const puntataMostrata = puntataServer > 0 ? puntataServer + assicurazione : sommaFiches > 0 ? sommaFiches : null

  const mosse = useMemo((): MossaBJ[] => {
    if (!vista || !mio || vista.fase !== 'gioco' || vista.turno?.posto !== vista.mio || arrivando) return []
    return mossePossibili(mio.mani, vista.turno.mano, vista.banco, mio.assicurazione)
  }, [vista, mio, arrivando])
  const manoDiTurno = vista && mio && vista.turno?.posto === vista.mio ? mio.mani[vista.turno.mano] : null
  const offerta = mosse.includes('assicurazione')
  const costo = manoDiTurno ? costoAssicurazione(manoDiTurno.puntata) : 0

  const carte: CarteInGioco = useMemo(
    () => ({ giro: vista?.giro ?? 0, arrivi: arrivi.current, inArrivo, onAtterra }),
    [vista?.giro, inArrivo, onAtterra],
  )

  /* ───────────────────────────────────  Le mosse  ─────────────────────────────────── */

  const posaFiche = (valore: number, bottone: HTMLElement) => {
    if (!devoPuntare || sommaFiches + inVoloFiches.current + valore > saldo) {
      suona('assente', { volume: 0.6 })
      return
    }
    inVoloFiches.current += valore
    const da = centroDi(bottone)
    const a = centroDi(cerchioRef.current)
    const posa = () => {
      inVoloFiches.current -= valore
      setFiches((f) => [...f, valore])
    }
    if (da && a) void volaFiche(da, a, valore, COLORE_FICHE[valore]).then(posa)
    else posa()
  }

  const togliFiche = () => {
    if (fiches.length === 0) return
    suona('fiche', { volume: 0.4 })
    setFiches((f) => f.slice(0, -1))
  }

  const punta = async (pezzi: number[]) => {
    const v = vistaRef.current
    const importo = pezzi.reduce((s, x) => s + x, 0)
    if (!v || importo < PUNTATA_MINIMA_BJ || importo > saldo) return
    setUltima(pezzi)
    setFiches(pezzi)
    const nuova = await chiedi(`/blackjack/tavolo/${id}/punta`, { giro: giroMostrato, puntata: importo })
    if (nuova) {
      setFiches([])
      applica(nuova)
    }
  }

  const muovi = async (azione: MossaBJ) => {
    const v = vistaRef.current
    if (!v?.turno || !manoDiTurno) return
    // Il raddoppio e lo split chiedono un'altra puntata, l'assicurazione la meta': le fiches volano dal saldo.
    const extra =
      azione === 'assicurazione'
        ? costoAssicurazione(manoDiTurno.puntata)
        : azione === 'raddoppia' || azione === 'dividi'
          ? manoDiTurno.puntata
          : 0
    if (extra > 0) {
      const da = centroDi(saldoRef.current)
      const a = centroDi((azione === 'assicurazione' ? assicurazioneRef : cerchioRef).current)
      if (da && a) void puntaFiches(da, a, extra)
    }
    const nuova = await chiedi(`/blackjack/tavolo/${id}/mossa`, {
      giro: v.giro,
      mano: v.turno.mano,
      carte: manoDiTurno.carte.length,
      azione,
    })
    if (nuova) applica(nuova)
  }

  const siedi = async () => {
    const nuova = await chiedi(`/blackjack/tavolo/${id}/siedi`, {})
    if (nuova) applica(nuova)
  }

  /* ──────────────────────────────────  La pagina  ────────────────────────────────── */

  const indietro = { a: ROTTE.blackjack, etichetta: 'Blackjack' }
  if (errore) {
    return (
      <Pagina titolo="Blackjack" indietro={indietro} intera>
        <div className="bj-errore">
          <p>{errore}</p>
          <Button onClick={() => vai(ROTTE.blackjack)}>Alla sala</Button>
        </div>
      </Pagina>
    )
  }

  const mani = mio && !pulita ? mio.mani : []
  const esitiMiei = mio && !pulita ? esitiDelPosto(mio, vista!.banco, chiuso) : []
  const libero = vista ? vista.posti.some((p) => p === null) : false
  const tempoTurno =
    vista?.aTempo && vista.fase === 'gioco' && tempo !== null ? { resta: tempo, tutto: TURNO_MS } : null
  const tempoPuntate =
    vista?.aTempo && vista.fase === 'puntate' && tempo !== null ? { resta: tempo, tutto: PUNTATE_MS } : null
  const banco = vista && !pulita ? vista.banco : []
  const chiaviBanco = banco.map((_, i) => chiaveBanco(vista!.giro, i))
  const classeCerchio = ['bj-mio__cerchio', devoPuntare && 'is-puntata', tempoTurno && manoDiTurno && 'is-turno']
    .filter(Boolean)
    .join(' ')
  // A giro chiuso il delta delle mani e' quello del giro senza l'assicurazione, che si paga dal suo posto.
  const deltaAss = vista ? deltaAssicurazione(assicurazione, vista.banco) : 0
  const pilaMia =
    pila === 'via'
      ? []
      : puntataServer > 0
        ? scomponi(pila === 'vinta' ? puntataServer + Math.max(0, (mio?.delta ?? 0) - deltaAss) : puntataServer)
        : fiches
  const esitoAss = chiuso && mio?.delta !== null && assicurazione > 0 ? (deltaAss > 0 ? 'pagata' : 'persa') : null

  return (
    <Pagina
      titolo="Blackjack"
      indietro={indietro}
      intera
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      <DefinizioniCarte />
      <div className="bj">
        {vista && <Tabellone saldo={conto ?? saldo} puntata={puntataMostrata} saldoRef={saldoRef} />}
        <SabotContext.Provider value={sabotRef}>
          <div className={`bj-tavolo is-${fase}${chiuso ? ' is-chiuso' : ''}`} ref={tavoloRef}>
            <span className="bj-tavolo__luce" aria-hidden="true" />
            <Scarti ref={scartiRef} />
            <Rastrelliera ref={rastrellieraRef} />
            <Sabot ref={sabotRef} />

            <div className="bj-banco">
              <div className="bj-banco__carte">
                {vista && banco.length > 0 && (
                  <Mano
                    carte={banco}
                    chiavi={chiaviBanco}
                    arrivi={arrivi.current}
                    inArrivo={inArrivo}
                    onAtterra={onAtterra}
                    className="bj-mano--banco"
                  />
                )}
                {vista?.fase === 'gioco' && banco.length === 1 && <PostoCarta className="bj-banco__posto" />}
              </div>
              <span className="bj-banco__nome">Banco</span>
            </div>

            <Scritte offerta={offerta} />

            {vista &&
              altriPosti(vista.mio).map((k, i) => {
                const p = vista.posti[k]
                const stile = { '--x': ARCO[i].x, '--y': ARCO[i].y } as CSSProperties
                if (!p || (pulita && p.via)) return <PostoLibero key={k} style={stile} />
                const visto = pulita ? { ...p, puntata: 0, mani: [], delta: null } : p
                return (
                  <PostoAltro
                    key={k}
                    posto={visto}
                    indice={k}
                    turno={pulita ? null : vista.turno}
                    banco={vista.banco}
                    chiuso={chiuso}
                    carte={carte}
                    tempo={vista.turno?.posto === k && tempoTurno && !pulita ? tempoTurno : null}
                    style={stile}
                  />
                )
              })}

            <div className={`bj-mio${mani.length > 1 ? ` is-mani-${Math.min(4, mani.length)}` : ''}`}>
              <div className="bj-mio__mani">
                {vista &&
                  mio &&
                  mani.map((m, o) => (
                    <Mano
                      key={m.id ?? o}
                      carte={m.carte}
                      chiavi={chiaviMano(vista.giro, vista.mio!, m.id ?? o, m.carte.length)}
                      arrivi={arrivi.current}
                      inArrivo={inArrivo}
                      onAtterra={onAtterra}
                      divisa={m.divisa}
                      esito={esitiMiei[o]}
                      attiva={vista.turno?.posto === vista.mio && vista.turno.mano === o && mani.length > 1}
                      className="bj-mano--mia"
                    />
                  ))}
              </div>
              <div className="bj-mio__puntate">
                <PostoAssicurazione
                  ref={assicurazioneRef}
                  importo={assicurazione}
                  offerta={offerta}
                  esito={esitoAss}
                  pila={pilaAss}
                />
                <div className={classeCerchio} ref={cerchioRef}>
                  <PilaFiches pezzi={pilaMia} className={pila === 'vinta' ? 'is-vinta' : ''} />
                  {pilaMia.length === 0 && devoPuntare && <span className="bj-mio__invito">Punta qui</span>}
                  {tempoTurno && manoDiTurno && <AnelloTempo {...tempoTurno} />}
                </div>
              </div>
            </div>
            <span className="bj-tavolo__bordo" aria-hidden="true" />
          </div>
        </SabotContext.Provider>

        <div className="bj-comandi">
          {!vista ? (
            <Stato>Apro il tavolo…</Stato>
          ) : !mio ? (
            <div className="bj-comandi__riga">
              {libero ? (
                <Button size="lg" onClick={() => void siedi()} disabled={inviando}>
                  Siediti
                </Button>
              ) : (
                <Stato>Il tavolo è pieno</Stato>
              )}
            </div>
          ) : devoPuntare ? (
            saldo < PUNTATA_MINIMA_BJ ? (
              <Stato>Servono {PUNTATA_MINIMA_BJ} punti di oggi: gioca le classificate, poi torna qui.</Stato>
            ) : (
              <Puntate
                fiches={fiches}
                saldo={saldo}
                ultima={ultima}
                inviando={inviando}
                tempo={tempoPuntate}
                altri={altri}
                onPosa={posaFiche}
                onTogli={togliFiche}
                onRaddoppia={() => sommaFiches * 2 <= saldo && setFiches((f) => [...f, ...f])}
                onPunta={(pezzi) => void punta(pezzi)}
              />
            )
          ) : fase === 'puntate' ? (
            <Stato tempo={tempoPuntate}>
              {tempoPuntate
                ? `Le carte fra ${Math.ceil(tempoPuntate.resta / 1000)} secondi`
                : 'Si aspettano le puntate'}
            </Stato>
          ) : mosse.length > 0 && manoDiTurno ? (
            <div className="bj-comandi__mosse">
              {/* L'assicurazione, quando c'e', prende il posto di "Tocca a te": il tempo resta, sotto. */}
              {offerta ? (
                <div className="bj-comandi__offerta">
                  <button
                    type="button"
                    className="bj-offerta"
                    disabled={saldo < costo || inviando}
                    onClick={() => void muovi('assicurazione')}
                  >
                    <SegnoAssicurazione className="bj-offerta__segno" />
                    <span className="bj-offerta__nome">Assicurazione</span>
                    <span className="bj-offerta__costo u-tabnum">{costo}</span>
                  </button>
                  {tempoTurno && <BarraTempo {...tempoTurno} />}
                </div>
              ) : (
                tempoTurno && <Stato tempo={tempoTurno}>Tocca a te</Stato>
              )}
              <div className="bj-mosse" role="group" aria-label="La tua mossa">
                {MOSSE.map(({ azione, nome, segno }) => {
                  const costa = azione === 'raddoppia' || azione === 'dividi'
                  const puo = mosse.includes(azione) && (!costa || saldo >= manoDiTurno.puntata)
                  return (
                    <button
                      key={azione}
                      type="button"
                      className={`bj-mossa is-${azione}`}
                      disabled={!puo || inviando}
                      onClick={() => void muovi(azione)}
                    >
                      <span className="bj-mossa__segno" aria-hidden="true">
                        {segno}
                      </span>
                      <span className="bj-mossa__nome">{nome}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <StatoDelGiro vista={vista} chiuso={chiuso} arrivando={arrivando} tempo={tempoTurno} />
          )}
        </div>
      </div>
      <Adesivo adesivo={adesivo} />
      {pioggia > 0 && <PioggiaDiMonete key={pioggia} />}
      <ComeSiGiocaBlackjack open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

/** I comandi della puntata: le fiches da posare, e il bottone che distribuisce. */
function Puntate({
  fiches,
  saldo,
  ultima,
  inviando,
  tempo,
  altri,
  onPosa,
  onTogli,
  onRaddoppia,
  onPunta,
}: {
  fiches: number[]
  saldo: number
  ultima: number[]
  inviando: boolean
  tempo: { resta: number; tutto: number } | null
  altri: boolean
  onPosa: (valore: number, bottone: HTMLElement) => void
  onTogli: () => void
  onRaddoppia: () => void
  onPunta: (pezzi: number[]) => void
}) {
  const somma = fiches.reduce((s, v) => s + v, 0)
  const ripeti = ultima.reduce((s, v) => s + v, 0)
  const verbo = altri ? 'Punta' : 'Distribuisci'
  return (
    <div className="bj-puntate">
      {tempo && <Stato tempo={tempo}>Punta entro {Math.ceil(tempo.resta / 1000)} secondi</Stato>}
      <div className="bj-gettoni" role="group" aria-label="Le fiches">
        {GETTONI_BJ.map((v) => (
          <button
            key={v}
            type="button"
            className="bj-gettone"
            disabled={somma + v > saldo || inviando}
            aria-label={`Fiche da ${v}`}
            onClick={(e) => onPosa(v, e.currentTarget)}
          >
            <Fiche valore={v} />
          </button>
        ))}
      </div>
      <div className="bj-comandi__riga">
        <button type="button" className="bj-tasto" onClick={onTogli} disabled={somma === 0 || inviando}>
          Annulla
        </button>
        <button type="button" className="bj-tasto" onClick={onRaddoppia} disabled={somma === 0 || somma * 2 > saldo}>
          ×2
        </button>
        {somma === 0 && ripeti >= PUNTATA_MINIMA_BJ && ripeti <= saldo ? (
          <button type="button" className="bj-distribuisci" disabled={inviando} onClick={() => onPunta(ultima)}>
            Ripeti <span className="u-tabnum">{ripeti}</span>
          </button>
        ) : (
          <button
            type="button"
            className="bj-distribuisci"
            disabled={somma < PUNTATA_MINIMA_BJ || inviando}
            onClick={() => onPunta(fiches)}
          >
            {somma < PUNTATA_MINIMA_BJ ? `Minimo ${PUNTATA_MINIMA_BJ}` : verbo}
          </button>
        )}
      </div>
    </div>
  )
}

/** Quel che succede quando non tocca a me: di chi e' il turno, il banco che gioca, gli esiti. */
function StatoDelGiro({
  vista,
  chiuso,
  arrivando,
  tempo,
}: {
  vista: VistaTavoloBJ
  chiuso: boolean
  arrivando: boolean
  tempo: { resta: number; tutto: number } | null
}) {
  const mio = vista.mio !== null ? vista.posti[vista.mio] : null
  if (vista.fase === 'gioco' && vista.turno && vista.turno.posto !== vista.mio) {
    const chi = vista.posti[vista.turno.posto]
    return (
      <Stato tempo={tempo}>
        {chi && (
          <span className="bj-stato__chi">
            <Avatar nickname={chi.giocatore.nickname} color={chi.giocatore.avatarColor} size={22} />
            Tocca a {chi.giocatore.displayName}
          </span>
        )}
      </Stato>
    )
  }
  if (vista.fase === 'gioco' && arrivando) return <Stato>Si distribuisce</Stato>
  if (vista.fase === 'fine' && !chiuso) return <Stato>Gioca il banco</Stato>
  if (mio && mio.puntata === 0) return <Stato>Guardi questo giro</Stato>
  return <Stato>{' '}</Stato>
}
