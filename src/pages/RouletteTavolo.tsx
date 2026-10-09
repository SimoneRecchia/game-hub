import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi, type DatiAdesivo } from '@/components/Adesivo'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { IconAnnulla, IconCestino, IconInfo, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { useToast } from '@/components/Toast'
import { esciFraPoco } from '@/games/blackjack/uscita'
import { Tabellone } from '@/games/fortuna/Tabellone'
import { useDopo } from '@/games/fortuna/useDopo'
import { centroDi, incassaMonete, volaFiche } from '@/games/fortuna/voli'
import { ComeSiGiocaRoulette } from '@/games/roulette/ComeSiGioca'
import { COLORE_FICHE_RL, FicheRL } from '@/games/roulette/Fiches'
import { Panno, type FicheAltrui } from '@/games/roulette/Panno'
import { TAVOLO_NUOVO } from '@/games/roulette/nuovo'
import { RuotaRoulette, type LancioRuota } from '@/games/roulette/Ruota'
import { FestaRuota, type DatiFestaRuota } from '@/games/ruota/Festa'
import { PIOGGIA_MS, PioggiaDiMonete } from '@/games/ruota/Intermezzo'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { suona } from '@/lib/suoni'
import {
  GETTONI_RL,
  PUNTATA_MINIMA_RL,
  PUNTATE,
  coloreDi,
  nomeDi,
  pagaDi,
  tipoDi,
  totaleDi,
  vincenti,
  type PuntateRL,
} from '@shared/roulette'
import { PUNTATE_RL_MS } from '@shared/roulette-tavolo'
import type { VistaTavoloRL } from '@shared/types'
import '@/games/roulette/Feltro.css'
import './RouletteTavolo.css'

/** I colori dei posti: le fiches di ognuno sul panno, e l'anello attorno al suo volto. */
const COLORI_POSTI = ['#4f8cff', '#ff9f1c', '#c77dff', '#2ec4b6', '#ff5d8f', '#ffd23f']

/** Dopo che la biglia si ferma: il numero si annuncia, poi si torna al panno per i conti. */
const ANNUNCIO_MS = 1_700
/** Quanto restano le fiches dell'esito sul panno, se nessuno punta, prima di sparire. */
const ESITO_MS = 6_500
/** Quanto si vede "Rien ne va plus" al lancio. */
const NVP_MS = 1_500

/** Da quanto e' piu' larga che alta il tavolo si mette di traverso, con la ruota accanto al panno (RouletteTavolo.css). */
const LARGO = 1.15

const POLL_ATTESA_MS = 1_500
const POLL_CALMO_MS = 4_000

const NOMI_NUMERI = [
  'Zero',
  'Uno',
  'Due',
  'Tre',
  'Quattro',
  'Cinque',
  'Sei',
  'Sette',
  'Otto',
  'Nove',
  'Dieci',
  'Undici',
  'Dodici',
  'Tredici',
  'Quattordici',
  'Quindici',
  'Sedici',
  'Diciassette',
  'Diciotto',
  'Diciannove',
  'Venti',
  'Ventuno',
  'Ventidue',
  'Ventitré',
  'Ventiquattro',
  'Venticinque',
  'Ventisei',
  'Ventisette',
  'Ventotto',
  'Ventinove',
  'Trenta',
  'Trentuno',
  'Trentadue',
  'Trentatré',
  'Trentaquattro',
  'Trentacinque',
  'Trentasei',
]

/** Come lo annuncia il croupier: "nero, dispari e manque". */
function annuncioDi(n: number): string {
  if (n === 0) return 'lo zero'
  return `${coloreDi(n)}, ${n % 2 === 0 ? 'pari' : 'dispari'} e ${n <= 18 ? 'manque' : 'passe'}`
}

const oro = (titolo: string, sotto?: string): Omit<DatiAdesivo, 'id'> => ({
  durata: 2_400,
  tono: 'vivace',
  titolo,
  sotto,
  classe: 'ct-adesivo-vincita',
  suono: 'vincita',
})

const bordato = (titolo: string, sotto?: string): Omit<DatiAdesivo, 'id'> => ({
  durata: 1_900,
  tono: 'bordato',
  titolo,
  sotto,
  colore: '#7a1020',
  suono: 'banco',
})

/** Il gradino della festa di una vincita interna: dal pieno la festa grande, dalla sestina la piu' piccola. */
function festaDiPuntata(paga: number): number | null {
  if (paga >= 35) return 10
  if (paga >= 11) return 5
  if (paga >= 5) return 3
  return null
}

function resta(v: VistaTavoloRL | null, ricevuta: number, ora: number): number | null {
  if (!v || v.scadenzaMs === null) return null
  return Math.max(0, v.scadenzaMs - (ora - ricevuta))
}

function useOra(attivo: boolean): number {
  const [ora, setOra] = useState(() => Date.now())
  useEffect(() => {
    if (!attivo) return
    const t = window.setInterval(() => setOra(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [attivo])
  return ora
}

function leggiTaglio(): number {
  try {
    const v = Number(localStorage.getItem('roulette-taglio'))
    return GETTONI_RL.includes(v) ? v : 5
  } catch {
    return 5
  }
}

function leggiUltime(): PuntateRL {
  try {
    const p = JSON.parse(localStorage.getItem('roulette-ultime') ?? '{}') as PuntateRL
    return Object.fromEntries(Object.entries(p).filter(([k, v]) => PUNTATE.has(k) && Number.isInteger(v) && v > 0))
  } catch {
    return {}
  }
}

const somma = (a: PuntateRL, chiave: string, v: number): PuntateRL => ({ ...a, [chiave]: (a[chiave] ?? 0) + v })

/**
 * Il tavolo della roulette. Si sceglie una fiche, la si posa sul panno — le
 * puntate si compongono nel telefono — e si lancia: da soli la biglia parte
 * subito, con gli altri quando hanno puntato tutti o il tempo finisce. Il
 * numero lo dice il server con il lancio; qui la ruota si fa grande, la biglia
 * corre e si ferma, il croupier annuncia il numero, e tornati al panno il
 * dolly si posa, le fiches perse vanno via e le vinte si pagano in monete,
 * che arrivano al saldo. Il saldo resta fermo (`conto`) finché non arrivano.
 *
 * Chi lascia la pagina si alza dal tavolo: le puntate di un giro non ancora
 * lanciato tornano. Un tavolo nuovo (`TAVOLO_NUOVO`) lo apre questa pagina,
 * mentre il feltro della sala si allarga nel tavolo.
 */
export default function RouletteTavolo() {
  const { id = '' } = useParams()
  const nuovo = id === TAVOLO_NUOVO
  /** Il saldo che la sala sapeva gia': il tabellone c'e' dal primo disegno, e il passaggio non lo vede arrivare. */
  const saldoDellaSala = (useLocation().state as { saldo?: number } | null)?.saldo ?? null
  const { vai } = useNavigazione()
  const toast = useToast()
  const dopo = useDopo()
  const { adesivo, accoda } = useCodaAdesivi()

  const [vista, setVista] = useState<VistaTavoloRL | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const vistaRef = useRef<VistaTavoloRL | null>(null)
  const ricevuta = useRef(0)
  /** Quando e' partita la biglia di ogni giro, nell'ora del telefono: fissata la prima volta che lo si vede. */
  const lanci = useRef(new Map<number, number>())
  /** Il giro la cui biglia si e' fermata, quello di cui si e' visto l'annuncio, e quello gia' tolto dal panno. */
  const [fermo, setFermo] = useState<number | null>(null)
  const [annunciato, setAnnunciato] = useState<number | null>(null)
  const [pulito, setPulito] = useState<number | null>(null)
  const pulitoRef = useRef<number | null>(null)
  /** Il saldo che si vede mentre la biglia gira: la vincita arriva con le monete. */
  const [conto, setConto] = useState<number | null>(null)
  /** Le puntate che si stanno componendo; null finché non le si tocca, e allora valgono quelle mandate. */
  const [bozza, setBozza] = useState<PuntateRL | null>(null)
  const [mosse, setMosse] = useState<Array<{ chiave: string; valore: number }>>([])
  const inVolo = useRef(0)
  const [taglio, setTaglio] = useState(leggiTaglio)
  const [ultime, setUltime] = useState<PuntateRL>(leggiUltime)
  const [inviando, setInviando] = useState(false)
  const inCorso = useRef(false)
  const [regole, setRegole] = useState(false)
  const [nvp, setNvp] = useState<number | null>(null)
  const [festa, setFesta] = useState<DatiFestaRuota | null>(null)
  /** La puntata sotto il dito, mentre la si sceglie: la dice la riga di stato. */
  const [anteprima, setAnteprima] = useState<string | null>(null)
  const [pioggia, setPioggia] = useState(0)

  const radice = useRef<HTMLDivElement>(null)
  const palcoRuota = useRef<HTMLDivElement>(null)
  const pannoRef = useRef<HTMLDivElement>(null)
  const saldoRef = useRef<HTMLSpanElement>(null)
  const fichesRef = useRef<HTMLDivElement>(null)

  /* ─────────────────────────────  Raccontare il tavolo  ───────────────────────────── */

  const applica = useCallback((nuova: VistaTavoloRL, primo = false) => {
    const prima = vistaRef.current
    if (prima && nuova.versione < prima.versione) return
    ricevuta.current = Date.now()
    if (nuova.fase === 'giro' && nuova.lancio && !lanci.current.has(nuova.giro)) {
      lanci.current.set(nuova.giro, Date.now() - nuova.lancio.faMs)
      const mio = nuova.mio !== null ? nuova.posti[nuova.mio] : null
      if (primo) {
        // Una pagina aperta a giro gia' lanciato non lo racconta: il saldo e' gia' quello giusto.
        setFermo(nuova.giro)
        setAnnunciato(nuova.giro)
        pulitoRef.current = nuova.giro
        setPulito(nuova.giro)
      } else {
        if (nuova.lancio.faMs < NVP_MS) {
          setNvp(Date.now())
          suona('nienteVaPiu')
        }
        if (mio && mio.delta !== null) {
          const vincita = mio.delta + totaleDi(mio.puntate)
          if (vincita > 0) setConto(nuova.saldo - vincita)
        }
      }
    }
    vistaRef.current = nuova
    setVista(nuova)
  }, [])

  /** La biglia e' nella casella: l'annuncio, poi i conti sul panno, le monete e la festa. */
  const onFerma = useCallback(
    (numero: number) => {
      const v = vistaRef.current
      if (!v || v.fase !== 'giro' || !v.lancio || v.lancio.numero !== numero) return
      const giro = v.giro
      if (pulitoRef.current === giro) return
      setFermo(giro)
      dopo(ANNUNCIO_MS, () => setAnnunciato(giro))
      const mio = v.mio !== null ? v.posti[v.mio] : null
      const libera = () => setConto(null)
      const totale = mio ? totaleDi(mio.puntate) : 0
      const delta = mio?.delta ?? null
      if (!mio || delta === null || totale === 0) libera()
      else if (delta + totale === 0) {
        libera()
        dopo(ANNUNCIO_MS + 1_300, () => accoda(bordato('Vince il banco', `${delta}`)))
      } else {
        // Torna qualcosa: i conti sul panno, poi le monete dalla vincita al saldo, e la festa se e' grande.
        const vinte = vincenti(mio.puntate, numero)
        const migliore = vinte.reduce((m, k) => (pagaDi(k) > pagaDi(m) ? k : m), vinte[0])
        const gradino = delta > 0 ? festaDiPuntata(pagaDi(migliore)) : null
        dopo(ANNUNCIO_MS + 2_300, () => {
          const da = centroDi(pannoRef.current)
          const a = centroDi(saldoRef.current)
          const quante = Math.min(24, 6 + Math.round(Math.sqrt(delta + totale) * 1.2))
          if (da && a) void incassaMonete(da, a, quante, libera)
          else libera()
          if (delta <= 0) accoda(bordato('Quasi', `Tornano ${delta + totale}`))
          else if (gradino !== null) {
            setFesta({
              chiave: Date.now(),
              moltiplicatore: gradino,
              vincita: delta,
              fortunata: false,
              testo: String(numero),
              nome: tipoDi(migliore) === 'carre' ? 'CARRÉ' : tipoDi(migliore).toUpperCase(),
              sotto: `${nomeDi(migliore)} · ${pagaDi(migliore)} a 1`,
            })
          } else {
            accoda(oro(`Vinci ${delta}!`, annuncioDi(numero)))
            if (delta >= totale) {
              setPioggia((p) => p + 1)
              dopo(PIOGGIA_MS, () => setPioggia(0))
            }
          }
        })
      }
      // Se nessuno tocca il panno, le fiches dell'esito se ne vanno da sole.
      dopo(ANNUNCIO_MS + ESITO_MS, () => {
        if (vistaRef.current?.giro === giro && pulitoRef.current !== giro) {
          pulitoRef.current = giro
          setPulito(giro)
        }
      })
    },
    [accoda, dopo],
  )

  /* ─────────────────────────────────  Il server  ───────────────────────────────── */

  /** Si torna alla sala una volta sola, anche se intanto arriva un altro controllo. */
  const andatoVia = useRef(false)
  const allaSala = useCallback(
    (messaggio: string, tono?: 'error') => {
      if (andatoVia.current) return
      andatoVia.current = true
      toast.show(messaggio, tono)
      vai(ROTTE.roulette, { direzione: 'tavolo', replace: true })
    },
    [toast, vai],
  )

  const leggi = useCallback(async () => {
    if (id === TAVOLO_NUOVO) return
    try {
      const v = await api<VistaTavoloRL>(`/roulette/tavolo/${id}`)
      applica(v, vistaRef.current === null)
    } catch (e) {
      // Un tavolo che non c'e' piu' — lo si era lasciato, e vuoto se n'e' andato —: si torna alla sala.
      if (e instanceof ApiFetchError && e.status === 404) allaSala('Il tavolo si è chiuso.')
      else if (!vistaRef.current) setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco ad aprire il tavolo.')
    }
  }, [id, applica, allaSala])

  useEffect(() => {
    // Il tavolo appena aperto e' gia' qui, con la risposta che l'ha aperto.
    if (vistaRef.current?.id !== id) void leggi()
  }, [id, leggi])

  // Il tavolo nuovo: lo si apre adesso, e l'indirizzo diventa il suo. Se intanto si e' usciti, ci si alza.
  useEffect(() => {
    if (!nuovo) return
    let vivo = true
    api<VistaTavoloRL>('/roulette/tavoli', { method: 'POST', body: {} }).then(
      (v) => {
        dimentica('/fortuna')
        if (!vivo) {
          void api(`/roulette/tavolo/${v.id}/lascia`, { method: 'POST', body: {}, keepalive: true }).catch(() => {})
          return
        }
        applica(v, true)
        vai(ROTTE.tavoloRL(v.id), { direzione: 'nessuna', replace: true })
      },
      (e: unknown) => {
        if (vivo) allaSala(e instanceof ApiFetchError ? e.message : 'Non riesco ad aprire il tavolo: riprova.', 'error')
      },
    )
    return () => {
      vivo = false
    }
  }, [nuovo, applica, vai, allaSala])

  // Il controllo: stretto quando si aspettano gli altri, largo da soli; e subito dopo una scadenza.
  useEffect(() => {
    let vivo = true
    let t = 0
    const cadenza = () => {
      const v = vistaRef.current
      if (!v) return POLL_CALMO_MS
      const altri = v.posti.some((p, k) => p && k !== v.mio)
      let ms = altri ? POLL_ATTESA_MS : POLL_CALMO_MS
      const r = resta(v, ricevuta.current, Date.now())
      if (r !== null) ms = Math.min(ms, r + 300)
      return Math.max(500, ms)
    }
    const giro = async () => {
      if (!vivo) return
      if (document.visibilityState === 'visible' && !inCorso.current) await leggi()
      if (vivo) t = window.setTimeout(giro, cadenza())
    }
    t = window.setTimeout(giro, cadenza())
    return () => {
      vivo = false
      window.clearTimeout(t)
    }
  }, [leggi])

  // Chi lascia la pagina dall'app si alza (vedi `esciFraPoco`); chi chiude la scheda lo libera la presenza, se non torna.
  const annullaUscita = useRef<(() => void) | null>(null)
  useEffect(() => {
    annullaUscita.current?.()
    annullaUscita.current = null
    if (id === TAVOLO_NUOVO) return
    return () => {
      annullaUscita.current = esciFraPoco(
        () => api(`/roulette/tavolo/${id}/lascia`, { method: 'POST', body: {}, keepalive: true }),
        () => dimentica('/fortuna'),
      )
    }
  }, [id])

  const chiedi = useCallback(
    async (percorso: string, corpo: unknown): Promise<VistaTavoloRL | null> => {
      if (inCorso.current) return null
      inCorso.current = true
      setInviando(true)
      try {
        const v = await api<VistaTavoloRL>(percorso, { method: 'POST', body: corpo })
        dimentica('/fortuna')
        return v
      } catch (e) {
        toast.show(e instanceof ApiFetchError ? e.message : 'Non è andata: riprova.', 'error')
        inCorso.current = false
        await leggi()
        return null
      } finally {
        inCorso.current = false
        setInviando(false)
      }
    },
    [toast, leggi],
  )

  /* ────────────────────────────────  Che cosa si vede  ──────────────────────────────── */

  const lancio: LancioRuota | null =
    vista && vista.fase === 'giro' && vista.lancio
      ? { inizio: lanci.current.get(vista.giro) ?? Date.now(), numero: vista.lancio.numero }
      : null
  const giroLanciato = vista?.fase === 'giro' ? vista.giro : null
  /** La scena: si punta, la biglia gira, il numero si annuncia, i conti sul panno, o il giro e' passato. */
  const scena: 'puntate' | 'lancio' | 'annuncio' | 'esito' | 'pronto' =
    giroLanciato === null
      ? 'puntate'
      : pulito === giroLanciato
        ? 'pronto'
        : fermo !== giroLanciato
          ? 'lancio'
          : annunciato !== giroLanciato
            ? 'annuncio'
            : 'esito'
  const grande = scena === 'lancio' || scena === 'annuncio'
  const ora = useOra(!!vista && vista.scadenzaMs !== null)
  const tempo = resta(vista, ricevuta.current, ora)
  const mio = vista && vista.mio !== null ? vista.posti[vista.mio] : null
  const saldo = vista?.saldo ?? 0
  const altri = !!vista && vista.posti.some((p, k) => p && k !== vista.mio)

  /** Quel che ho gia' mandato per il giro che si punta, che il saldo ha gia' tolto. */
  const mandate: PuntateRL = scena === 'puntate' && mio ? mio.puntate : {}
  const sulPanno: PuntateRL =
    scena === 'puntate' || scena === 'pronto' ? (bozza ?? mandate) : mio ? mio.puntate : {}
  const totaleSulPanno = totaleDi(sulPanno)
  const disponibile = saldo + totaleDi(mandate)
  const puoPuntare = !!mio && (scena === 'puntate' || scena === 'pronto' || scena === 'esito')
  const cambiata = bozza !== null && JSON.stringify(bozza) !== JSON.stringify(mandate)
  const numeroMostrato = scena === 'esito' || (scena === 'pronto' && bozza === null) ? (vista?.lancio?.numero ?? null) : null

  // Toccare il panno mentre si vedono i conti chiude l'esito: si punta sul giro dopo.
  const chiudiEsito = () => {
    if (scena === 'esito' && giroLanciato !== null) {
      pulitoRef.current = giroLanciato
      setPulito(giroLanciato)
    }
  }

  const altrui: FicheAltrui[] = useMemo(() => {
    if (!vista || scena === 'pronto') return []
    return vista.posti.flatMap((p, k) =>
      p && k !== vista.mio && totaleDi(p.puntate) > 0
        ? [{ id: p.giocatore.playerId, colore: COLORI_POSTI[k], puntate: p.puntate }]
        : [],
    )
  }, [vista, scena])

  // La ruota e' disegnata grande e rimpicciolita sul palco: mentre la biglia gira si fa grande sopra il panno.
  // Quanto, e dove, lo dice lo spazio che c'e'; le misure sono quelle del layout, senza le trasformazioni.
  const [zoom, setZoom] = useState<CSSProperties>({})
  // La ruota si muove fra il palco e il centro solo dopo la prima misura: prima di quella il browser la vedeva grande
  // (`--piccola` non c'era ancora), e la faceva rimpicciolire sotto gli occhi, proprio mentre si arrivava al tavolo.
  const [misurata, setMisurata] = useState(false)
  const pronta = vista !== null
  useLayoutEffect(() => {
    const radiceEl = radice.current
    const piccola = palcoRuota.current
    if (!radiceEl || !piccola) return
    const misura = () => {
      let x = 0
      let y = 0
      for (let el: HTMLElement | null = piccola; el && el !== radiceEl; el = el.offsetParent as HTMLElement | null) {
        x += el.offsetLeft
        y += el.offsetTop
      }
      const larga = radiceEl.clientWidth
      const alta = radiceEl.clientHeight
      const sotto = alta - y
      // Di traverso la ruota e' gia' grande, nella sua colonna: non copre il panno.
      const largo = larga / alta >= LARGO
      const grande = largo
        ? piccola.offsetWidth
        : Math.max(piccola.offsetWidth, Math.min(larga * 0.96, (sotto * 0.62) / 0.7, 560))
      const sinistra = largo ? x : (larga - grande) / 2
      const sopra = largo ? y : y + Math.max(0, (sotto - grande * 0.7) * 0.32)
      setZoom({
        '--grande-w': `${grande.toFixed(1)}px`,
        '--piccola': (piccola.offsetWidth / grande).toFixed(4),
        '--zoom-x': `${(sinistra - x).toFixed(1)}px`,
        '--zoom-y': `${(sopra - y).toFixed(1)}px`,
      } as CSSProperties)
    }
    misura()
    const dopoLaMisura = requestAnimationFrame(() => setMisurata(true))
    const osserva = new ResizeObserver(misura)
    osserva.observe(radiceEl)
    osserva.observe(piccola)
    return () => {
      cancelAnimationFrame(dopoLaMisura)
      osserva.disconnect()
    }
  }, [pronta])

  /* ───────────────────────────────────  Le puntate  ─────────────────────────────────── */

  const scegliTaglio = (v: number) => {
    setTaglio(v)
    suona('fiche', { volume: 0.4 })
    try {
      localStorage.setItem('roulette-taglio', String(v))
    } catch {
      /* resta per questa volta */
    }
  }

  const posa = (chiave: string, x: number, y: number) => {
    if (!puoPuntare) return
    chiudiEsito()
    const base = scena === 'esito' || scena === 'pronto' ? (bozza ?? {}) : (bozza ?? mandate)
    if (totaleDi(base) + inVolo.current + taglio > disponibile) {
      suona('tetto', { volume: 0.7 })
      toast.show(disponibile < PUNTATA_MINIMA_RL ? 'Il saldo è finito.' : `Sul panno ci stanno ${disponibile} punti.`)
      return
    }
    inVolo.current += taglio
    const valore = taglio
    const bottone = fichesRef.current?.querySelector<HTMLElement>(`[data-taglio="${valore}"]`) ?? null
    const da = centroDi(bottone)
    const metti = () => {
      inVolo.current -= valore
      setBozza((b) => somma(b ?? base, chiave, valore))
      setMosse((m) => [...m, { chiave, valore }])
    }
    if (da) void volaFiche(da, { x, y }, valore, COLORE_FICHE_RL[valore]).then(metti)
    else metti()
  }

  const annulla = () => {
    const ultima = mosse.at(-1)
    if (!ultima || !bozza) return
    suona('fiche', { volume: 0.4 })
    setMosse((m) => m.slice(0, -1))
    setBozza((b) => {
      const n = { ...(b ?? {}) }
      n[ultima.chiave] = (n[ultima.chiave] ?? 0) - ultima.valore
      if (n[ultima.chiave] <= 0) delete n[ultima.chiave]
      return n
    })
  }

  const raddoppia = () => {
    if (totaleSulPanno === 0 || totaleSulPanno * 2 > disponibile) {
      suona('tetto', { volume: 0.7 })
      return
    }
    chiudiEsito()
    suona('fiche')
    setBozza(Object.fromEntries(Object.entries(sulPanno).map(([k, v]) => [k, v * 2])))
    setMosse((m) => [...m, ...Object.entries(sulPanno).map(([chiave, valore]) => ({ chiave, valore }))])
  }

  const azzera = () => {
    suona('fiche', { volume: 0.4 })
    setBozza({})
    setMosse([])
  }

  const ripeti = () => {
    if (totaleDi(ultime) > disponibile) {
      suona('tetto', { volume: 0.7 })
      return
    }
    chiudiEsito()
    suona('fiche')
    setBozza({ ...ultime })
    setMosse(Object.entries(ultime).map(([chiave, valore]) => ({ chiave, valore })))
  }

  const lancia = async () => {
    const v = vistaRef.current
    if (!v || !mio) return
    const puntate = bozza ?? mandate
    const giro = v.fase === 'giro' ? v.giro + 1 : v.giro
    const nuova = await chiedi(`/roulette/tavolo/${id}/punta`, { giro, puntate })
    if (!nuova) return
    if (totaleDi(puntate) > 0) {
      setUltime(puntate)
      try {
        localStorage.setItem('roulette-ultime', JSON.stringify(puntate))
      } catch {
        /* "Ripeti" vale fino a quando la pagina resta aperta */
      }
    }
    setBozza(null)
    setMosse([])
    applica(nuova)
  }

  const siedi = async () => {
    const nuova = await chiedi(`/roulette/tavolo/${id}/siedi`, {})
    if (nuova) applica(nuova)
  }

  /* ──────────────────────────────────  La pagina  ────────────────────────────────── */

  const indietro = { a: ROTTE.roulette, etichetta: 'Roulette', direzione: 'tavolo' as const }
  if (errore) {
    return (
      <Pagina titolo="Roulette" indietro={indietro} intera>
        <div className="rl-errore">
          <p>{errore}</p>
          <Button onClick={() => vai(ROTTE.roulette, { direzione: 'tavolo', replace: true })}>Alla sala</Button>
        </div>
      </Pagina>
    )
  }

  const libero = vista ? vista.posti.some((p) => p === null) : false
  const tempoPuntate =
    vista?.fase === 'puntate' && tempo !== null ? { resta: tempo, tutto: PUNTATE_RL_MS } : null
  const ultimoNumero = vista?.storia[0] ?? null
  const nvpVisibile = nvp !== null && Date.now() - nvp < NVP_MS + 200
  const annuncioNumero = scena === 'annuncio' ? (vista?.lancio?.numero ?? null) : null
  const verbo = altri ? (totaleDi(mandate) > 0 ? 'Cambia' : 'Punta') : 'Lancia'
  // Si manda solo quel che si e' composto: piu' puntate, altre, o nessuna per ritirare quelle mandate.
  const puoLanciare =
    puoPuntare &&
    !inviando &&
    bozza !== null &&
    cambiata &&
    (totaleDi(bozza) >= PUNTATA_MINIMA_RL || totaleDi(mandate) > 0)

  return (
    <Pagina
      titolo="Roulette"
      indietro={indietro}
      intera
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      <div className={`rl is-${scena}${grande ? ' is-grande' : ''}${misurata ? ' is-misurata' : ''}`} style={zoom}>
        <span className="rl-feltro" aria-hidden="true" />
        <div className="rl__dentro" ref={radice}>
        {(vista || saldoDellaSala !== null) && (
          <Tabellone
            saldo={conto ?? (vista ? saldo : (saldoDellaSala ?? 0))}
            puntata={totaleSulPanno || null}
            saldoRef={saldoRef}
          />
        )}

        <div className="rl-palco">
          <div className="rl-palco__ruota" ref={palcoRuota}>
            <div className="rl-palco__grande">
              <RuotaRoulette lancio={lancio} ultimo={ultimoNumero} onFerma={onFerma} />
              {annuncioNumero !== null && <Annuncio numero={annuncioNumero} />}
              {nvpVisibile && scena === 'lancio' && (
                <span className="rl-nvp" key={nvp}>
                  Rien ne va plus
                </span>
              )}
            </div>
          </div>
          <Storia numeri={scena === 'lancio' ? (vista?.storia.slice(1) ?? []) : (vista?.storia ?? [])} />
        </div>

        {vista && altri && (
          <ul className="rl-giocatori" aria-label="Al tavolo">
            {vista.posti.map((p, k) =>
              p && k !== vista.mio ? (
                <li
                  key={p.giocatore.playerId}
                  className={`rl-giocatore${p.presente ? '' : ' is-assente'}`}
                  style={{ '--posto': COLORI_POSTI[k] } as CSSProperties}
                >
                  <Avatar nickname={p.giocatore.nickname} color={p.giocatore.avatarColor} size={26} />
                  <span className="rl-giocatore__nome">{p.giocatore.displayName}</span>
                  {scena === 'esito' && p.delta !== null ? (
                    <span className={`rl-giocatore__conto${p.delta > 0 ? ' is-vinto' : ' is-perso'}`}>
                      {p.delta > 0 ? `+${p.delta}` : p.delta}
                    </span>
                  ) : (
                    totaleDi(p.puntate) > 0 &&
                    scena !== 'pronto' && <span className="rl-giocatore__conto u-tabnum">{totaleDi(p.puntate)}</span>
                  )}
                </li>
              ) : null,
            )}
          </ul>
        )}

        <div className="rl-panno-posto" ref={pannoRef}>
          <Panno
            mie={sulPanno}
            altrui={altrui}
            numero={numeroMostrato}
            attivo={puoPuntare}
            onPosa={posa}
            onAnteprima={setAnteprima}
          />
        </div>

        <div className="rl-comandi">
          {!vista ? (
            <Riga>Apro il tavolo…</Riga>
          ) : !mio ? (
            <div className="rl-comandi__riga">
              {libero ? (
                <Button size="lg" onClick={() => void siedi()} disabled={inviando}>
                  Siediti
                </Button>
              ) : (
                <Riga>Il tavolo è pieno</Riga>
              )}
            </div>
          ) : saldo + totaleDi(mandate) < PUNTATA_MINIMA_RL && totaleSulPanno === 0 && scena !== 'lancio' ? (
            <Riga>Serve almeno un punto di oggi: gioca le classificate, poi torna qui.</Riga>
          ) : (
            <>
              <StatoTavolo
                anteprima={anteprima}
                scena={scena}
                tempo={tempoPuntate}
                mandate={totaleDi(mandate)}
                cambiata={cambiata}
                numero={vista.lancio?.numero ?? null}
              />
              <div className="rl-gettoni" role="radiogroup" aria-label="La fiche" ref={fichesRef}>
                {GETTONI_RL.map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={taglio === v}
                    data-taglio={v}
                    className={`rl-gettone${taglio === v ? ' is-scelto' : ''}`}
                    disabled={v > disponibile}
                    aria-label={`Fiche da ${v}`}
                    onClick={() => scegliTaglio(v)}
                  >
                    <FicheRL importo={v} />
                  </button>
                ))}
              </div>
              <div className="rl-comandi__riga">
                <button
                  type="button"
                  className="rl-tasto"
                  aria-label="Annulla l’ultima fiche"
                  onClick={annulla}
                  disabled={!puoPuntare || mosse.length === 0 || !bozza}
                >
                  <IconAnnulla size={20} />
                </button>
                <button
                  type="button"
                  className="rl-tasto"
                  aria-label="Togli tutte le fiches"
                  onClick={azzera}
                  disabled={!puoPuntare || totaleSulPanno === 0 || scena === 'esito'}
                >
                  <IconCestino size={20} />
                </button>
                {/* Sul panno vuoto le puntate dell'ultimo giro, su quello pieno il doppio. */}
                {totaleSulPanno === 0 && totaleDi(ultime) > 0 ? (
                  <button
                    type="button"
                    className="rl-tasto"
                    aria-label="Ripeti le ultime puntate"
                    onClick={ripeti}
                    disabled={!puoPuntare || totaleDi(ultime) > disponibile}
                  >
                    <IconRefresh size={20} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rl-tasto rl-tasto--testo"
                    aria-label="Raddoppia le puntate"
                    onClick={raddoppia}
                    disabled={!puoPuntare || totaleSulPanno === 0 || totaleSulPanno * 2 > disponibile}
                  >
                    ×2
                  </button>
                )}
                <button
                  type="button"
                  className="rl-lancia"
                  disabled={!puoLanciare}
                  onClick={() => void lancia()}
                >
                  {verbo}
                </button>
              </div>
            </>
          )}
        </div>
        <span className="rl-velo" aria-hidden="true" />
        </div>
      </div>
      <Adesivo adesivo={adesivo} />
      {pioggia > 0 && <PioggiaDiMonete key={pioggia} />}
      {festa && <FestaRuota key={festa.chiave} dati={festa} onFine={() => setFesta(null)} />}
      <ComeSiGiocaRoulette open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

/**
 * Una riga di stato sopra le fiches, con la barra del tempo quando corre. Il
 * conto alla rovescia si vede e non si legge: un lettore di schermo lo
 * ripeterebbe a ogni secondo.
 */
function Riga({ children, tempo }: { children: ReactNode; tempo?: { resta: number; tutto: number } | null }) {
  return (
    <div className="rl-stato">
      <span className="rl-stato__testo" aria-live={tempo ? 'off' : 'polite'}>
        {children}
      </span>
      {tempo && (
        <span className="rl-stato__barra" aria-hidden="true">
          <span
            className={`rl-stato__pieno${tempo.resta < 5_000 ? ' is-poco' : ''}`}
            style={{ transform: `scaleX(${Math.max(0, Math.min(1, tempo.resta / tempo.tutto))})` }}
          />
        </span>
      )}
    </div>
  )
}

/** La riga sopra le fiches: che cosa succede adesso. */
function StatoTavolo({
  anteprima,
  scena,
  tempo,
  mandate,
  cambiata,
  numero,
}: {
  anteprima: string | null
  scena: string
  tempo: { resta: number; tutto: number } | null
  mandate: number
  cambiata: boolean
  numero: number | null
}) {
  if (anteprima) {
    return (
      <Riga>
        {nomeDi(anteprima)} · <span className="rl-stato__paga">{pagaDi(anteprima)} a 1</span>
      </Riga>
    )
  }
  if (scena === 'lancio') return <Riga>La biglia gira…</Riga>
  if (scena === 'annuncio' || scena === 'esito') {
    return <Riga>{numero === null ? ' ' : `${NOMI_NUMERI[numero]}, ${annuncioDi(numero)}`}</Riga>
  }
  if (tempo) {
    const s = Math.ceil(tempo.resta / 1000)
    return <Riga tempo={tempo}>{mandate > 0 && !cambiata ? `Puntato · la biglia fra ${s} s` : `Punta entro ${s} s`}</Riga>
  }
  if (mandate > 0 && !cambiata) return <Riga>Puntato · aspetto gli altri</Riga>
  return <Riga>Scegli una fiche e toccala sul panno</Riga>
}

/** Il numero uscito, grande, come lo annuncia il croupier: la cifra sul suo colore, e come si dice. */
function Annuncio({ numero }: { numero: number }) {
  return (
    <div className={`rl-annuncio is-${coloreDi(numero)}`} role="status">
      <span className="rl-annuncio__raggi" aria-hidden="true" />
      <span className="rl-annuncio__disco">
        <span className="rl-annuncio__cifra">{numero}</span>
      </span>
      <span className="rl-annuncio__targa">
        <span className="rl-annuncio__nome">{NOMI_NUMERI[numero]}</span>
        <span className="rl-annuncio__sotto">{annuncioDi(numero)}</span>
      </span>
    </div>
  )
}

/**
 * Il tabellone dei numeri usciti, come quelli luminosi accanto ai tavoli: il
 * piu' recente in cima e grande, i rossi a sinistra, i neri a destra, lo zero
 * in mezzo.
 */
function Storia({ numeri }: { numeri: readonly number[] }) {
  return (
    <ol className="rl-storia" aria-label="Gli ultimi numeri usciti">
      {numeri.length === 0 && <li className="rl-storia__vuota">–</li>}
      {numeri.slice(0, 9).map((n, i) => (
        <li key={`${numeri.length - i}:${n}`} className={`rl-storia__numero is-${coloreDi(n)}${i === 0 ? ' is-ultimo' : ''}`}>
          {n}
        </li>
      ))}
    </ol>
  )
}
