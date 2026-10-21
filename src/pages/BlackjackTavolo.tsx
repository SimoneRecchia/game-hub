import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi, type DatiAdesivo } from '@/components/Adesivo'
import { Button } from '@/components/Button'
import { IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { useToast } from '@/components/Toast'
import { DefinizioniCarte, PostoCarta, SabotContext } from '@/games/blackjack/Carta'
import { ComeSiGiocaBlackjack } from '@/games/blackjack/ComeSiGioca'
import { COLORE_FICHE, Fiche, GETTONI, PilaFiches, coloreFiche, scomponi } from '@/games/blackjack/Fiches'
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
  Panno,
  PostoAltro,
  PostoAssicurazione,
  PostoLibero,
  Rastrelliera,
  Sabot,
  Scarti,
  chiaviMano,
  esitiDelPosto,
  type CarteInGioco,
  type LatoPosto,
} from '@/games/blackjack/Tavolo'
import { esciFraPoco } from '@/games/blackjack/uscita'
import { CHIAMA_FICHES, PochiPunti } from '@/games/fortuna/Avvisi'
import { SALA, useSala } from '@/games/fortuna/sala'
import { Tabellone } from '@/games/fortuna/Tabellone'
import { useDopo } from '@/games/fortuna/useDopo'
import { centroDi, incassaMonete, puntaFiches, spostaFiches, volaFiche } from '@/games/fortuna/voli'
import { PIOGGIA_MS, PioggiaDiMonete } from '@/games/ruota/Intermezzo'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { suona } from '@/lib/suoni'
import {
  PUNTATA_MINIMA_BJ,
  costoAssicurazione,
  deltaAssicurazione,
  deltaMano,
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

/** I segni delle mosse, come nel mockup: la carta in piu', la mano aperta che si ferma, le due carte che si separano. */
const segno = (d: string) => (
  <svg className="bj-mossa__icona" viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
)

/**
 * Le mosse, come si chiamano ai tavoli italiani, nell'ordine del mockup. Ci
 * sono sempre tutte, spente quando non si possono fare: lo split si vede anche
 * quando non c'e' una coppia, e durante il turno degli altri si vedono tutte
 * spente, pronte.
 */
const MOSSE: Array<{ azione: AzioneBJ; nome: string; segno: ReactNode }> = [
  {
    azione: 'carta',
    nome: 'Carta',
    segno: segno('M7 3.5h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z M11 9v6 M8 12h6'),
  },
  {
    azione: 'stai',
    nome: 'Stai',
    segno: segno(
      'M8.5 12.5V6a1.5 1.5 0 0 1 3 0v5 M11.5 10.5V4.5a1.5 1.5 0 0 1 3 0v6 M14.5 10.5V6a1.5 1.5 0 0 1 3 0v7.5c0 4-2.6 7-6.2 7-2.6 0-4.3-1.4-5.6-3.7L3.9 13.6a1.5 1.5 0 0 1 2.6-1.5l2 3',
    ),
  },
  { azione: 'raddoppia', nome: 'Raddoppia', segno: '×2' },
  { azione: 'dividi', nome: 'Split', segno: segno('M3.5 8l5.5-2 3 8.5-5.5 2z M20.5 8L15 6l-3 8.5 5.5 2z M12 3v3') },
]

const oro = (titolo: string, sotto?: string, suono: DatiAdesivo['suono'] = 'vincita'): Omit<DatiAdesivo, 'id'> => ({
  durata: ADESIVO_MS + 300,
  tono: 'vivace',
  titolo,
  sotto,
  classe: 'ct-adesivo-vincita',
  suono,
})

/** Le cose brutte, o del banco: la carta color crema bordata di rosso del mockup; il pari grigia. */
const bordato = (titolo: string, sotto?: string, suono?: DatiAdesivo['suono']): Omit<DatiAdesivo, 'id'> => ({
  durata: ADESIVO_MS,
  tono: 'bordato',
  titolo,
  sotto,
  classe: suono === 'pareggio' ? 'bj-adesivo-pari' : 'bj-adesivo-banco',
  suono,
})

/** I posti degli altri, nell'ordine in cui si vedono da sinistra: la sinistra del banco e' a destra dello schermo. */
function altriPosti(mio: number | null): number[] {
  const tutti = Array.from({ length: POSTI_BJ }, (_, i) => POSTI_BJ - 1 - i)
  return mio === null ? tutti.slice(0, 4) : tutti.filter((i) => i !== mio)
}

/**
 * I posti degli altri, da sinistra: due per lato, lungo il bordo curvo, gli
 * esterni piu' in alto. Dove sta ognuno lo dice BlackjackTavolo.css
 * (`data-posto`), perché dipende dalla forma del tavolo: di traverso il panno
 * e' largo, e i posti si aprono ad arco. Il centro resta al banco e a me.
 */
const LATI: readonly LatoPosto[] = ['sinistra', 'sinistra', 'destra', 'destra']

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
  useSala()
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
  /** Com'e' andato il mio ultimo giro, nella riga sopra i comandi finché non si tocca una fiche. */
  const [esitoTesto, setEsitoTesto] = useState<{ testo: string; oro: boolean } | null>(null)
  /** Il giro per cui la puntata di prima e' gia' tornata sul cerchio: una volta sola, Azzera la toglie. */
  const ripetuta = useRef<number | null>(null)

  const tavoloRef = useRef<HTMLDivElement>(null)
  const sabotRef = useRef<HTMLSpanElement>(null)
  const scartiRef = useRef<HTMLSpanElement>(null)
  const rastrellieraRef = useRef<HTMLSpanElement>(null)
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
      setEsitoTesto(testoEsito(mio.delta))
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

  const andatoVia = useRef(false)
  const leggi = useCallback(async () => {
    try {
      const v = await api<VistaTavoloBJ>(`/blackjack/tavolo/${id}`)
      applica(v, vistaRef.current === null)
    } catch (e) {
      // Un tavolo che non c'e' piu' — lo si era lasciato, e vuoto se n'e' andato —: si torna alla sala.
      if (e instanceof ApiFetchError && e.status === 404) {
        if (!andatoVia.current) {
          andatoVia.current = true
          toast.show('Il tavolo si è chiuso.')
          vai(ROTTE.blackjack, { direzione: 'indietro', replace: true })
        }
      } else if (!vistaRef.current) setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco ad aprire il tavolo.')
    }
  }, [id, applica, toast, vai])

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

  // Chi lascia la pagina dall'app si alza (vedi `esciFraPoco`). Chi chiude la scheda, o la ricarica, resta
  // seduto: lo libera la presenza, se non torna.
  const annullaUscita = useRef<(() => void) | null>(null)
  useEffect(() => {
    annullaUscita.current?.()
    annullaUscita.current = null
    return () => {
      annullaUscita.current = esciFraPoco(
        () => api(`/blackjack/tavolo/${id}/lascia`, { method: 'POST', body: {}, keepalive: true }),
        () => dimentica('/fortuna'),
      )
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
  /** Tocca puntare, e il saldo non basta: lo dicono l'avviso al posto delle fiches e il tabellone. */
  const senzaSaldo = devoPuntare && saldo < PUNTATA_MINIMA_BJ
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

  // La puntata di prima torna sul cerchio a ogni giro nuovo, come al tavolo: "Nuovo giro" la rigioca, "Azzera" la
  // toglie. Una volta per giro, e solo se il saldo la copre.
  useEffect(() => {
    if (!devoPuntare || senzaSaldo || ripetuta.current === giroMostrato) return
    ripetuta.current = giroMostrato
    const importo = ultima.reduce((s, v) => s + v, 0)
    if (importo >= PUNTATA_MINIMA_BJ && importo <= saldo) setFiches((f) => (f.length === 0 ? ultima : f))
  }, [devoPuntare, senzaSaldo, giroMostrato, ultima, saldo])

  const posaFiche = (valore: number, bottone: HTMLElement) => {
    if (!devoPuntare || sommaFiches + inVoloFiches.current + valore > saldo) {
      suona('assente', { volume: 0.6 })
      return
    }
    setEsitoTesto(null)
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

  /** Azzera: la pila torna al saldo, in fiches. */
  const azzera = () => {
    if (fiches.length === 0) return
    setEsitoTesto(null)
    const da = centroDi(cerchioRef.current)
    const a = centroDi(saldoRef.current)
    if (da && a) void spostaFiches(da, a, fiches.map((v) => COLORE_FICHE[v]))
    else suona('fiche', { volume: 0.4 })
    setFiches([])
  }

  const punta = async (pezzi: number[]) => {
    const v = vistaRef.current
    const importo = pezzi.reduce((s, x) => s + x, 0)
    if (!v || importo < PUNTATA_MINIMA_BJ || importo > saldo) return
    setUltima(pezzi)
    setFiches(pezzi)
    setEsitoTesto(null)
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
  const sotto = 'Paga 1 a 1'
  const info = (
    <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
      <IconInfo size={21} />
    </BottoneBarra>
  )
  if (errore) {
    return (
      <Pagina titolo="Blackjack" sotto={sotto} indietro={indietro} intera azioni={info}>
        <div className={`bj-errore ${SALA}`}>
          <p>{errore}</p>
          <Button onClick={() => vai(ROTTE.blackjack)}>Alla sala</Button>
        </div>
        <ComeSiGiocaBlackjack open={regole} onClose={() => setRegole(false)} />
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
  const mioTurno = mosse.length > 0 && !!manoDiTurno
  const classeCerchio = [
    'bj-mio__cerchio',
    devoPuntare && !senzaSaldo && pilaVuota(fiches) && 'is-puntata',
    tempoTurno && manoDiTurno && 'is-turno',
  ]
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
  const importoPila = pilaMia.reduce((t, v) => t + v, 0)
  const esitoAss = chiuso && mio?.delta !== null && assicurazione > 0 ? (deltaAss > 0 ? 'pagata' : 'persa') : null

  /** La riga sopra i comandi: che cosa succede, o che cosa tocca fare. */
  const riga = ((): { testo: string; oro?: boolean } => {
    if (!vista) return { testo: 'Apro il tavolo…' }
    if (!mio) {
      const chi = vista.fase === 'gioco' && vista.turno ? vista.posti[vista.turno.posto] : null
      if (chi) return { testo: `Tocca a ${chi.giocatore.displayName}` }
      return { testo: libero ? 'Siediti per giocare' : 'Il tavolo è pieno' }
    }
    if (devoPuntare) {
      if (senzaSaldo) return { testo: '' }
      if (tempoPuntate) return { testo: `Punta entro ${Math.ceil(tempoPuntate.resta / 1000)} secondi`, oro: true }
      if (esitoTesto) return esitoTesto
      return sommaFiches > 0
        ? { testo: `Puntata ${sommaFiches} · ${altri ? 'punta' : 'distribuisci'}` }
        : { testo: 'Tocca le fiches per puntare' }
    }
    if (fase === 'puntate') {
      return {
        testo: tempoPuntate ? `Le carte fra ${Math.ceil(tempoPuntate.resta / 1000)} secondi` : 'Si aspettano le puntate',
      }
    }
    if (mioTurno) {
      if (offerta) return { testo: 'Il banco mostra un asso', oro: true }
      const quale = mani.length > 1 ? `Mano ${vista.turno!.mano + 1} di ${mani.length} · ` : ''
      return { testo: `Tocca a te · ${quale}${totaleDi(manoDiTurno!.carte).totale}`, oro: true }
    }
    if (vista.fase === 'gioco') {
      if (arrivando) return { testo: 'Carte!' }
      const chi = vista.turno && vista.turno.posto !== vista.mio ? vista.posti[vista.turno.posto] : null
      if (chi) return { testo: `Tocca a ${chi.giocatore.displayName}` }
      return { testo: puntataServer > 0 ? 'Carte!' : 'Guardi questo giro' }
    }
    if (!chiuso) return { testo: 'Il banco pesca…' }
    if (puntataServer > 0 && mio.delta !== null) return testoEsito(mio.delta)
    return { testo: 'Guardi questo giro' }
  })()
  const tempoRiga = tempoPuntate ?? tempoTurno

  return (
    <Pagina titolo="Blackjack" sotto={sotto} indietro={indietro} intera azioni={info}>
      <DefinizioniCarte />
      <div className={`bj ${SALA}`}>
        {vista && (
          <Tabellone
            saldo={conto ?? saldo}
            puntata={puntataMostrata}
            saldoRef={saldoRef}
            scarso={senzaSaldo}
            riga
            etichetta={puntataServer > 0 ? 'In gioco' : 'Puntata'}
          />
        )}
        <div className="bj-campo">
          <SabotContext.Provider value={sabotRef}>
            <div className={`bj-tavolo is-${fase}${chiuso ? ' is-chiuso' : ''}`} ref={tavoloRef}>
              <Panno offerta={offerta} />
              <span className="bj-tavolo__luce" aria-hidden="true" />
              <Scarti ref={scartiRef} />
              <Rastrelliera ref={rastrellieraRef} />
              <Sabot ref={sabotRef} />

              <span className="bj-banco__nome">Banco</span>
              <div className="bj-banco">
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

              {vista &&
                altriPosti(vista.mio).map((k, i) => {
                  const p = vista.posti[k]
                  const lato = LATI[i]
                  if (!p || (pulita && p.via)) return <PostoLibero key={k} lato={lato} arco={i} />
                  const visto = pulita ? { ...p, puntata: 0, mani: [], delta: null } : p
                  return (
                    <PostoAltro
                      key={k}
                      posto={visto}
                      indice={k}
                      lato={lato}
                      arco={i}
                      turno={pulita ? null : vista.turno}
                      banco={vista.banco}
                      chiuso={chiuso}
                      carte={carte}
                      tempo={vista.turno?.posto === k && tempoTurno && !pulita ? tempoTurno : null}
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
                        conto={esitiMiei[o] ? deltaMano(m, vista.banco) : null}
                        attiva={mioTurno && vista.turno!.mano === o}
                        className={`bj-mano--mia${mani.length > 2 ? ' bj-mano--piccola' : ''}`}
                      />
                    ))}
                </div>
                <PostoAssicurazione
                  ref={assicurazioneRef}
                  importo={assicurazione}
                  offerta={offerta}
                  esito={esitoAss}
                  pila={pilaAss}
                />
                <div className={classeCerchio} ref={cerchioRef}>
                  <PilaFiches
                    key={pilaMia.length % 2}
                    pezzi={pilaMia}
                    massimo={6}
                    targhetta={false}
                    className={pila === 'vinta' ? 'is-vinta' : ''}
                  />
                  {importoPila > 0 && (
                    <span className="bj-mio__cifra u-tabnum" style={{ '--alto': Math.min(6, pilaMia.length) - 1 } as CSSProperties}>
                      {importoPila}
                    </span>
                  )}
                  {tempoTurno && manoDiTurno && <AnelloTempo {...tempoTurno} />}
                </div>
              </div>
            </div>
          </SabotContext.Provider>
        </div>

        <div className="bj-pannello">
          <p className={`bj-riga${riga.oro ? ' is-oro' : ''}`} aria-live={tempoRiga ? 'off' : 'polite'}>
            {riga.testo || ' '}
          </p>
          {tempoRiga && <BarraTempo {...tempoRiga} />}
          {!vista ? null : !mio ? (
            libero && (
              <button type="button" className="bj-via is-pronto" onClick={() => void siedi()} disabled={inviando}>
                Siediti
              </button>
            )
          ) : devoPuntare ? (
            senzaSaldo ? (
              <PochiPunti servono={PUNTATA_MINIMA_BJ} saldo={saldo} />
            ) : (
              <Puntate
                fiches={fiches}
                saldo={saldo}
                inviando={inviando}
                verbo={altri ? 'Punta' : ultima.length > 0 ? 'Nuovo giro' : 'Distribuisci'}
                onPosa={posaFiche}
                onAzzera={azzera}
                onPunta={(pezzi) => void punta(pezzi)}
              />
            )
          ) : fase !== 'puntate' && puntataServer > 0 ? (
            <>
              {offerta && (
                <button
                  type="button"
                  className="bj-assicura"
                  disabled={saldo < costo || inviando}
                  onClick={() => void muovi('assicurazione')}
                >
                  Assicurazione · <span className="u-tabnum">{costo}</span>
                </button>
              )}
              <div className="bj-mosse" role="group" aria-label="La tua mossa">
                {MOSSE.map(({ azione, nome, segno }) => {
                  const costa = azione === 'raddoppia' || azione === 'dividi'
                  const puo =
                    mioTurno && mosse.includes(azione) && (!costa || saldo >= (manoDiTurno?.puntata ?? Infinity))
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
            </>
          ) : null}
        </div>
      </div>
      <Adesivo adesivo={adesivo} />
      {pioggia > 0 && <PioggiaDiMonete key={pioggia} />}
      <ComeSiGiocaBlackjack open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

const pilaVuota = (f: readonly number[]) => f.length === 0

/** Com'e' andato il giro, nella riga sopra i comandi: d'oro se si e' vinto. */
const testoEsito = (delta: number) =>
  delta > 0
    ? { testo: `Vinci ${delta}`, oro: true }
    : delta < 0
      ? { testo: `Perdi ${-delta}`, oro: false }
      : { testo: 'Pari: la puntata torna', oro: false }

/** I comandi della puntata: le fiches da posare, Azzera, e il bottone che distribuisce. */
function Puntate({
  fiches,
  saldo,
  inviando,
  verbo,
  onPosa,
  onAzzera,
  onPunta,
}: {
  fiches: number[]
  saldo: number
  inviando: boolean
  /** Il nome del bottone quando la puntata c'e': Distribuisci, Nuovo giro, o Punta se si aspettano gli altri. */
  verbo: string
  onPosa: (valore: number, bottone: HTMLElement) => void
  onAzzera: () => void
  onPunta: (pezzi: number[]) => void
}) {
  const somma = fiches.reduce((s, v) => s + v, 0)
  const pronto = somma >= PUNTATA_MINIMA_BJ && somma <= saldo && !inviando
  // Senza fiches sul cerchio le carte non partono: le fiches si fanno toccare.
  const chiama = somma === 0 && !inviando
  return (
    <>
      <div className={`bj-gettoni${chiama ? ` ${CHIAMA_FICHES}` : ''}`} role="group" aria-label="Le fiches">
        {GETTONI.map((v) => (
          <button
            key={v}
            type="button"
            className="bj-gettone"
            disabled={somma + v > saldo || inviando}
            aria-label={`Aggiungi ${v}`}
            onClick={(e) => onPosa(v, e.currentTarget)}
          >
            <Fiche valore={v} />
          </button>
        ))}
      </div>
      <div className="bj-comandi">
        <button type="button" className="bj-azzera" onClick={onAzzera} disabled={somma === 0 || inviando}>
          Azzera
        </button>
        <button type="button" className={`bj-via${pronto ? ' is-pronto' : ''}`} disabled={!pronto} onClick={() => onPunta(fiches)}>
          {somma === 0 ? 'Tocca una fiche' : somma < PUNTATA_MINIMA_BJ ? `Da ${PUNTATA_MINIMA_BJ} in su` : verbo}
        </button>
      </div>
    </>
  )
}
