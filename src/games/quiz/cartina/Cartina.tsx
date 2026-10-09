import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as EventoPuntatore,
} from 'react'
import type { Riquadro as RiquadroGradi } from '@shared/quiz'
import type { IndiceQuiz, LuogoQuiz, StratoCartina } from '@shared/quiz-domande'
import { lagoInOpzione, maiuscola } from '@shared/quiz-lingua'
import { urlBandiera } from '../bandiere'
import { caricaDatiQuiz } from '../dati'
import {
  anelliDi,
  caricaAcque,
  caricaGeometrie,
  caricaPaesi,
  latoDi,
  piuVicino,
  proietta,
  proiezione,
  puntoDelNome,
  riquadroDi,
  taglioPer,
  tracciato,
  unisciRiquadri,
  type LineeProiettate,
  type Luogo,
  type Proiezione,
  type PuntoXY,
  type Riquadro,
  type Tratti,
} from './geometria'
import './Cartina.css'

/** Un punto da toccare che non sta nel riassunto: le città, che il browser chiede a Wikidata. */
export interface PuntoCartina {
  id: string
  lon: number
  lat: number
  nome: string
}

export interface EsitoCartina {
  giusta: string
  /** I posti che valevano come giusti: il Tirreno, per il Mediterraneo. */
  accettate: string[]
  /** Il posto toccato, o l'opzione scelta tradotta in un posto; null se non c'e'. */
  scelta: string | null
  /** Dove guardare: la risposta giusta e i posti della domanda. */
  luogo?: LuogoQuiz
}

interface Props {
  /** Da dove parte la vista la prima volta: poi resta dove la si lascia. */
  inquadra: RiquadroGradi
  /** Un posto da inquadrare al posto del riquadro: il paese della partita, per i fiumi d'Italia. */
  fuoco?: string
  /** Cosa si tocca; null per una cartina da guardare soltanto. */
  strato: StratoCartina | null
  /** I paesi della zona della partita (id della cartina): fuori si attenuano. Null e' tutto il mondo. */
  zona: ReadonlySet<string> | null
  /** Cosa si puo' toccare, fra i posti dello strato; null e' tutto. */
  toccabili: ReadonlySet<string> | null
  /** Accende quel che si puo' toccare: i fiumi, i laghi, i mari, i pallini delle città. */
  evidenzia: boolean
  /** I nomi dei paesi sempre: un aiuto per orientarsi, per fiumi, laghi e città. */
  nomiPaesi: boolean
  scelta: string | null
  /** Senza, la cartina si guarda e basta: e' la risposta gia' data. */
  onScegli?: (id: string) => void
  /** Da accendere mentre si risponde: il paese di cui si chiede l'oceano. */
  mostra?: readonly string[]
  esito?: EsitoCartina | null
  /** A risposta data, i nomi: la cartina smette di essere muta. */
  rivela: boolean
  punti?: readonly PuntoCartina[]
  etichetta: string
}

interface Vista {
  /** Pixel per unita' della cartina: all'equatore, per grado. */
  k: number
  x: number
  y: number
}

type Geometrie = { fiumi: Map<string, Tratti>; laghi: Map<string, Tratti> }

const ZOOM_MASSIMO = 260
/** Il margine attorno a quel che si inquadra, in pixel: mezzo nome di lato, un nome sopra. */
const MARGINE_NOMI: readonly [number, number] = [56, 34]
/** Sotto questi pixel un dito che si sposta tocca, non trascina. */
const SOGLIA_TRASCINA = 7
/** Quanto lontano da un dito si cerca un fiume, un lago o un pallino. */
const RAGGIO_TOCCO = 22
/** I punti piu' vicini di così al precedente non si disegnano: a zoom massimo e' un pixel. */
const TOLLERANZA = 0.004

type TipoPosto = 'paese' | 'acqua' | 'fiume' | 'lago' | 'capitale' | 'citta'

/** Di che cosa e' un posto della cartina: "f:Q1653" e' il Danubio, "c:FR" la capitale della Francia. */
export function tipoDelPosto(id: string): TipoPosto | null {
  if (/^n\d+$/.test(id)) return 'paese'
  if (/^Q\d+$/.test(id)) return 'acqua'
  if (id.startsWith('f:')) return 'fiume'
  if (id.startsWith('l:')) return 'lago'
  if (id.startsWith('c:')) return 'capitale'
  if (id.startsWith('u:')) return 'citta'
  return null
}

/**
 * La cartina muta: il mondo senza nomi, da toccare con un dito.
 *
 * Si ingrandisce con due dita (o la rotella), si sposta trascinando, e un tocco
 * sceglie. Il mondo c'e' sempre tutto: la zona della partita e' accesa, il
 * resto attenuato, e non si tocca. Un tocco vicino a un paese piccolo, a un
 * fiume o a un pallino lo sceglie lo stesso: un dito e' largo come Malta. Il
 * posto scelto si colora e resta finché non se ne tocca un altro; la conferma
 * sta fuori, nella domanda.
 *
 * La cartina resta la stessa per tutta la partita, e con lei la vista: da una
 * domanda all'altra non salta sul continente della risposta, che sarebbe un
 * aiuto. A risposta data il posto giusto si accende di verde, quello sbagliato
 * di rosso, e se sono piccoli o fuori dallo schermo la cartina ci va sopra;
 * alla domanda dopo torna dov'era.
 */
export function Cartina(props: Props) {
  const { inquadra, fuoco, strato, zona, toccabili, scelta, onScegli, esito, rivela, punti, mostra, etichetta } = props
  const [ix, setIx] = useState<IndiceQuiz | null>(null)
  const [paesi, setPaesi] = useState<Luogo[] | null>(null)
  const [acque, setAcque] = useState<Luogo[] | null>(null)
  const [geo, setGeo] = useState<Geometrie | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [tentativo, setTentativo] = useState(0)

  // Cosa serve disegnare: lo strato che si tocca, e i posti di cui parla la domanda o la risposta.
  const tipi = useMemo(() => {
    const ids = [
      ...(mostra ?? []),
      ...(esito ? [esito.giusta, ...(esito.luogo?.giusti ?? []), ...(esito.luogo?.altri ?? [])] : []),
      ...(esito?.scelta ? [esito.scelta] : []),
    ]
    return new Set(ids.map(tipoDelPosto))
  }, [mostra, esito])
  const serveAcque = strato === 'acque' || tipi.has('acqua')
  const serveGeo = strato === 'fiumi' || strato === 'laghi' || tipi.has('fiume') || tipi.has('lago')

  useEffect(() => {
    let vivo = true
    setErrore(null)
    const sbaglia = (e: Error) => vivo && setErrore(e.message)
    caricaPaesi()
      .then((l) => vivo && setPaesi(l))
      .catch(sbaglia)
    caricaDatiQuiz()
      .then((i) => {
        if (!vivo) return
        setIx(i)
        if (serveGeo && i.dati.geo) {
          caricaGeometrie(i.dati.geo)
            .then((g) => vivo && setGeo(g))
            .catch(sbaglia)
        }
      })
      .catch(sbaglia)
    if (serveAcque) {
      caricaAcque()
        .then((a) => vivo && setAcque(a))
        .catch(sbaglia)
    }
    return () => {
      vivo = false
    }
  }, [serveAcque, serveGeo, tentativo])

  const contenitore = useRef<HTMLDivElement>(null)
  const [misura, setMisura] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const nodo = contenitore.current
    if (!nodo) return
    const osserva = new ResizeObserver(([voce]) => {
      const { width, height } = voce.contentRect
      setMisura({ w: Math.round(width), h: Math.round(height) })
    })
    osserva.observe(nodo)
    return () => osserva.disconnect()
  }, [])

  // La proiezione si decide una volta: il taglio segue la zona della partita.
  const [p] = useState(() => proiezione(taglioPer(inquadra)))
  const kMinimo = misura.w > 0 ? Math.min(misura.w / 360, misura.h / (p.basso - p.alto)) * 0.92 : 1

  /* ── I posti, proiettati una volta ── */

  const capitali = useMemo(
    () =>
      (ix?.dati.paesi ?? [])
        .filter((q) => q.cc && q.id !== 'VA')
        .map((q) => ({ id: `c:${q.id}`, lon: q.cc![0], lat: q.cc![1], nome: q.cap })),
    [ix],
  )
  const puntiLaghi = useMemo(
    () =>
      (ix?.dati.laghi ?? [])
        .filter((l) => !l.g && l.pt)
        .map((l) => ({ id: `l:${l.id}`, lon: l.pt![0], lat: l.pt![1], nome: lagoInOpzione(l.n) })),
    [ix],
  )
  const pallini: PuntoCartina[] = useMemo(() => {
    if (strato === 'capitali' || tipi.has('capitale')) return capitali
    if (strato === 'citta' || tipi.has('citta')) return [...(punti ?? [])]
    if (strato === 'laghi' || tipi.has('lago')) return puntiLaghi
    return []
  }, [strato, tipi, capitali, punti, puntiLaghi])

  const tracciatiPaesi = useMemo(
    () => (paesi ?? []).map((l) => ({ id: l.id, d: tracciato(anelliDi(l.poligoni), p, TOLLERANZA), tinta: l.tinta })),
    [paesi, p],
  )
  /** Tutte le terre in un tracciato solo: la riva, il filo d'acqua bassa lungo le coste. */
  const riva = useMemo(() => tracciatiPaesi.map((t) => t.d).join(''), [tracciatiPaesi])
  /** Meridiani e paralleli ogni trenta gradi, come sugli atlanti: sul mare si capisce dove si e'. */
  const reticolo = useMemo(() => {
    const linee: string[] = []
    for (let x = Math.ceil(p.ovest / 30) * 30; x <= p.est; x += 30) linee.push(`M${x} ${p.alto}V${p.basso}`)
    for (const lat of [-60, -30, 0, 30, 60]) linee.push(`M${p.ovest} ${p.punto(0, lat)[1].toFixed(3)}H${p.est}`)
    return linee.join('')
  }, [p])
  const tracciatiAcque = useMemo(
    () => (acque ?? []).map((l) => ({ id: l.id, d: tracciato(anelliDi(l.poligoni), p, TOLLERANZA) })),
    [acque, p],
  )
  const tracciatiFiumi = useMemo(
    () => [...(geo?.fiumi.values() ?? [])].map((t) => ({ id: `f:${t.id}`, d: tracciato(t.linee, p, TOLLERANZA, false) })),
    [geo, p],
  )
  const tracciatiLaghi = useMemo(
    () => [...(geo?.laghi.values() ?? [])].map((t) => ({ id: `l:${t.id}`, d: tracciato(t.linee, p, TOLLERANZA) })),
    [geo, p],
  )
  const xyPallini = useMemo(() => pallini.map((q) => ({ ...q, xy: p.punto(q.lon, q.lat) })), [pallini, p])
  /** Dove va il nome di ogni paese, e quanto e' grande: dal piu' grande, per i nomi che ci stanno. */
  const ancorePaesi = useMemo(
    () =>
      (paesi ?? [])
        .map((l) => ({ id: l.id, xy: puntoDelNome(anelliDi(l.principali), p, true), r: riquadroDi(anelliDi(l.principali), p) }))
        .filter((a): a is Ancora => !!a.xy && !!a.r)
        .sort((a, b) => (b.r.x1 - b.r.x0) * (b.r.y1 - b.r.y0) - (a.r.x1 - a.r.x0) * (a.r.y1 - a.r.y0)),
    [paesi, p],
  )

  /** Per i tocchi: fiumi, laghi e pallini proiettati, fra quelli che si toccano. */
  const perTocchi = useMemo((): LineeProiettate[] => {
    const vale = (id: string) => !toccabili || toccabili.has(id)
    const puntiDi = (voci: PuntoCartina[]) =>
      voci.filter((q) => vale(q.id)).map((q) => proietta(q.id, [[[q.lon, q.lat]]], p, false))
    if (strato === 'fiumi') {
      return [...(geo?.fiumi.values() ?? [])]
        .filter((t) => vale(`f:${t.id}`))
        .map((t) => proietta(`f:${t.id}`, t.linee, p, false))
    }
    if (strato === 'laghi') {
      const forme = [...(geo?.laghi.values() ?? [])]
        .filter((t) => vale(`l:${t.id}`))
        .map((t) => proietta(`l:${t.id}`, t.linee, p, true))
      return [...forme, ...puntiDi(puntiLaghi)]
    }
    if (strato === 'capitali' || strato === 'citta') return puntiDi(pallini)
    return []
  }, [strato, geo, puntiLaghi, pallini, toccabili, p])

  /* ── La vista ── */

  const [v, setV] = useState<Vista | null>(null)
  const [animata, setAnimata] = useState(false)

  const limita = useCallback(
    (n: Vista): Vista => {
      const k = Math.min(ZOOM_MASSIMO, Math.max(kMinimo, n.k))
      // Lo schermo resta dentro il mondo, e dove il mondo e' piu' piccolo dello schermo sta nel mezzo:
      // niente cartina persa di lato, né un mondo appoggiato a un bordo.
      const asse = (centro: number, da: number, a: number, schermo: number) => {
        const mezzo = schermo / 2 / k
        return (a - da) * k <= schermo ? (da + a) / 2 : Math.min(a - mezzo, Math.max(da + mezzo, centro))
      }
      const cx = asse((misura.w / 2 - n.x) / k, p.ovest, p.est, misura.w)
      const cy = asse((misura.h / 2 - n.y) / k, p.alto, p.basso, misura.h)
      return { k, x: misura.w / 2 - cx * k, y: misura.h / 2 - cy * k }
    },
    [kMinimo, p, misura.w, misura.h],
  )

  /**
   * La vista che mostra un riquadro, con un'ampiezza minima e un margine in
   * pixel: un posto sul bordo del riquadro ha il nome a meta' fuori, se il
   * margine e' solo una percentuale.
   */
  const vistaSu = useCallback(
    (r: Riquadro, minimo: number): Vista => {
      const cx = (r.x0 + r.x1) / 2
      const cy = (r.y0 + r.y1) / 2
      const w = Math.max(r.x1 - r.x0, minimo)
      const h = Math.max(r.y1 - r.y0, minimo * 0.6)
      const lato = (schermo: number, margine: number) => Math.max(schermo * 0.6, schermo - 2 * margine)
      const k = Math.min(lato(misura.w, MARGINE_NOMI[0]) / w, lato(misura.h, MARGINE_NOMI[1]) / h)
      return limita({ k, x: misura.w / 2 - cx * k, y: misura.h / 2 - cy * k })
    },
    [misura.w, misura.h, limita],
  )

  /** Il riquadro di un posto della cartina, per andarci sopra. */
  const riquadroPosto = useCallback(
    (id: string): Riquadro | null => {
      const tipo = tipoDelPosto(id)
      if (tipo === 'paese') {
        const l = paesi?.find((x) => x.id === id)
        return l ? riquadroDi(anelliDi(l.principali), p) : null
      }
      if (tipo === 'acqua') {
        const l = acque?.find((x) => x.id === id)
        return l ? riquadroDi(anelliDi(l.poligoni), p) : null
      }
      if (tipo === 'fiume') {
        const t = geo?.fiumi.get(id.slice(2))
        return t ? riquadroDi(t.linee, p) : null
      }
      if (tipo === 'lago') {
        const t = geo?.laghi.get(id.slice(2))
        if (t) return riquadroDi(t.linee, p)
      }
      const q = [...capitali, ...(punti ?? []), ...puntiLaghi].find((x) => x.id === id)
      if (!q) return null
      const [x, y] = p.punto(q.lon, q.lat)
      return { x0: x - 1, y0: y - 1, x1: x + 1, y1: y + 1 }
    },
    [paesi, acque, geo, capitali, punti, puntiLaghi, p],
  )

  /**
   * Cosa inquadrare a risposta data: la risposta e la scelta, e con i nomi
   * anche i posti della domanda — ma non se allargano troppo: la Russia intorno
   * al Volga farebbe del fiume un filo. Restano nei nomi, se ci stanno.
   */
  const riquadroEsito = useCallback(
    (e: EsitoCartina): Riquadro | null => {
      const giusti = e.luogo?.giusti.length ? e.luogo.giusti : [e.giusta]
      const cuore = unisciRiquadri([...giusti, ...(e.scelta ? [e.scelta] : [])].map(riquadroPosto), p)
      if (!rivela || !e.luogo?.altri?.length) return cuore
      const tutto = unisciRiquadri([cuore, ...e.luogo.altri.map(riquadroPosto)], p)
      return cuore && tutto && latoDi(tutto) > 3 * Math.max(latoDi(cuore), 20) ? cuore : tutto
    },
    [riquadroPosto, rivela, p],
  )

  const riquadroZona = useMemo((): Riquadro => {
    const [o, s, e, n] = inquadra
    const [x0, y0] = p.punto(o, n)
    const [, y1] = p.punto(e, s)
    // La larghezza dai gradi: un riquadro che arriva al 180, o lo passa, resta intero.
    return { x0, y0, x1: x0 + (e - o), y1 }
  }, [inquadra, p])

  const riquadroIniziale = useCallback((): Riquadro => {
    const r = fuoco ? riquadroPosto(fuoco) : null
    return r ?? riquadroZona
  }, [fuoco, riquadroPosto, riquadroZona])

  const pronta =
    !!paesi && !!ix && (!serveAcque || !!acque) && (!serveGeo || !!geo || !ix.dati.geo) && misura.w > 0 && misura.h > 0

  // La prima vista: la zona della partita, o — per una cartina che nasce con la
  // risposta, quella delle domande a scelta — il posto della risposta.
  const iniziata = useRef(false)
  useEffect(() => {
    if (!pronta || iniziata.current) return
    iniziata.current = true
    const daGuardare = esito ? riquadroEsito(esito) : null
    setV(daGuardare ? vistaSu(daGuardare, 22) : vistaSu(riquadroIniziale(), 6))
  }, [pronta, esito, riquadroEsito, riquadroIniziale, vistaSu])

  // Se cambia la misura, la vista tiene il centro e lo zoom.
  const misuraPrima = useRef(misura)
  useEffect(() => {
    const prima = misuraPrima.current
    misuraPrima.current = misura
    if (prima.w === misura.w && prima.h === misura.h) return
    setV((attuale) => {
      if (!attuale || prima.w === 0) return attuale
      const cx = (prima.w / 2 - attuale.x) / attuale.k
      const cy = (prima.h / 2 - attuale.y) / attuale.k
      return limita({ k: attuale.k, x: misura.w / 2 - cx * attuale.k, y: misura.h / 2 - cy * attuale.k })
    })
  }, [misura, limita])

  // A risposta data, se il posto giusto e' piccolo o fuori dallo schermo la
  // cartina ci va sopra; alla domanda dopo torna dove l'aveva lasciata chi gioca.
  const vistaDiChiGioca = useRef<Vista | null>(null)
  const vRef = useRef(v)
  vRef.current = v
  const esitoPrima = useRef<EsitoCartina | null | undefined>(esito)
  useEffect(() => {
    const prima = esitoPrima.current
    const attuale = vRef.current
    if (!pronta || !attuale) return
    esitoPrima.current = esito
    if (esito && !prima) {
      vistaDiChiGioca.current = attuale
      const r = riquadroEsito(esito)
      if (!r) return
      const sx0 = r.x0 * attuale.k + attuale.x
      const sx1 = r.x1 * attuale.k + attuale.x
      const sy0 = r.y0 * attuale.k + attuale.y
      const sy1 = r.y1 * attuale.k + attuale.y
      // Ci si va sopra se non si vede tutto, o se e' piccolo: un fiume di due pixel non insegna niente.
      const visibile = sx0 >= 0 && sy0 >= 0 && sx1 <= misura.w && sy1 <= misura.h
      const piccolo = Math.max(sx1 - sx0, sy1 - sy0) < Math.min(misura.w, misura.h) * 0.35
      if (visibile && !piccolo) return
      setAnimata(true)
      setV(vistaSu(r, rivela ? 14 : 6))
    } else if (!esito && prima && vistaDiChiGioca.current) {
      setAnimata(true)
      setV(vistaDiChiGioca.current)
      vistaDiChiGioca.current = null
    }
  }, [esito, pronta, rivela, riquadroEsito, vistaSu, misura.w, misura.h])

  /* ── Toccare, trascinare, ingrandire ── */

  const puntatori = useRef(new Map<number, { x: number; y: number }>())
  const gesto = useRef<{
    inizio: { x: number; y: number }
    trascina: boolean
    pizzico: { distanza: number; centro: { x: number; y: number }; v: Vista } | null
    v: Vista
  } | null>(null)

  /** Ingrandisce di `fattore` tenendo fermo il punto dello schermo (px, py). */
  const ingrandisci = useCallback(
    (da: Vista, fattore: number, px: number, py: number): Vista => {
      const k = Math.min(ZOOM_MASSIMO, Math.max(kMinimo, da.k * fattore))
      const f = k / da.k
      return limita({ k, x: px - (px - da.x) * f, y: py - (py - da.y) * f })
    },
    [limita, kMinimo],
  )

  const cercaNelDom = useCallback(
    (cx: number, cy: number, livello: 'paesi' | 'acque'): string | null => {
      const cerca = (x: number, y: number) => {
        for (const el of document.elementsFromPoint(x, y)) {
          if (!(el instanceof SVGElement) || !contenitore.current?.contains(el)) continue
          const id = el.dataset.luogo
          if (el.dataset.strato === livello && id && (!toccabili || toccabili.has(id))) return id
        }
        return null
      }
      const diretto = cerca(cx, cy)
      if (diretto) return diretto
      // Attorno al dito: il posto che compare piu' spesso in due giri di punti.
      const voti = new Map<string, number>()
      for (const raggio of [9, 16]) {
        for (let i = 0; i < 12; i += 1) {
          const a = (i / 12) * Math.PI * 2
          const id = cerca(cx + Math.cos(a) * raggio, cy + Math.sin(a) * raggio)
          if (id) voti.set(id, (voti.get(id) ?? 0) + (raggio === 9 ? 2 : 1))
        }
      }
      let migliore: string | null = null
      let piu = 0
      for (const [id, n] of voti) {
        if (n > piu) {
          piu = n
          migliore = id
        }
      }
      return migliore
    },
    [toccabili],
  )

  const luogoSotto = useCallback(
    (clientX: number, clientY: number): string | null => {
      if (!v || !strato) return null
      if (strato === 'paesi' || strato === 'acque') return cercaNelDom(clientX, clientY, strato)
      const rett = contenitore.current!.getBoundingClientRect()
      const x = (clientX - rett.left - v.x) / v.k
      const y = (clientY - rett.top - v.y) / v.k
      return piuVicino(x, y, RAGGIO_TOCCO / v.k, perTocchi)
    },
    [v, strato, cercaNelDom, perTocchi],
  )

  const giu = (e: EventoPuntatore<HTMLDivElement>) => {
    if (!v) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rett = e.currentTarget.getBoundingClientRect()
    puntatori.current.set(e.pointerId, { x: e.clientX - rett.left, y: e.clientY - rett.top })
    setAnimata(false)
    const tocchi = [...puntatori.current.values()]
    if (tocchi.length === 1) {
      gesto.current = { inizio: tocchi[0], trascina: false, pizzico: null, v }
    } else if (tocchi.length === 2 && gesto.current) {
      const [a, b] = tocchi
      gesto.current.pizzico = {
        distanza: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        centro: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        v,
      }
      gesto.current.trascina = true
    }
  }

  const muovi = (e: EventoPuntatore<HTMLDivElement>) => {
    if (!puntatori.current.has(e.pointerId) || !gesto.current) return
    const rett = e.currentTarget.getBoundingClientRect()
    puntatori.current.set(e.pointerId, { x: e.clientX - rett.left, y: e.clientY - rett.top })
    const tocchi = [...puntatori.current.values()]
    const g = gesto.current
    if (g.pizzico && tocchi.length >= 2) {
      const [a, b] = tocchi
      const distanza = Math.hypot(a.x - b.x, a.y - b.y)
      const centro = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const z = ingrandisci(g.pizzico.v, distanza / g.pizzico.distanza, g.pizzico.centro.x, g.pizzico.centro.y)
      setV(limita({ ...z, x: z.x + centro.x - g.pizzico.centro.x, y: z.y + centro.y - g.pizzico.centro.y }))
      return
    }
    const [p0] = tocchi
    const dx = p0.x - g.inizio.x
    const dy = p0.y - g.inizio.y
    if (!g.trascina && Math.hypot(dx, dy) > SOGLIA_TRASCINA) g.trascina = true
    if (g.trascina) setV(limita({ ...g.v, x: g.v.x + dx, y: g.v.y + dy }))
  }

  const su = (e: EventoPuntatore<HTMLDivElement>) => {
    const g = gesto.current
    puntatori.current.delete(e.pointerId)
    if (puntatori.current.size === 1 && g?.pizzico && v) {
      // Da due dita a una: si riparte a trascinare da dov'e' adesso.
      const [resto] = puntatori.current.values()
      gesto.current = { inizio: resto, trascina: true, pizzico: null, v }
      return
    }
    if (puntatori.current.size > 0) return
    gesto.current = null
    if (!g || g.trascina || !onScegli) return
    const id = luogoSotto(e.clientX, e.clientY)
    if (id) onScegli(id)
  }

  /**
   * La rotella e il trackpad. Una rotella vera, o due dita che scorrono,
   * ingrandiscono come in tutte le cartine; il pizzico del trackpad arriva come
   * una rotella con il ctrl (Chrome, Firefox, Edge), con passi molto piu'
   * piccoli, e per questo ha un'altra misura. Safari invece manda i suoi
   * GestureEvent, con la scala. React ascolta la rotella come passiva e non la
   * puo' fermare: il pizzico ingrandiva la pagina intera, e la cartina restava
   * com'era. Per questo gli ascoltatori stanno sul nodo, senza `passive`.
   */
  const zoomDa = useRef<{
    rotella: (e: WheelEvent) => void
    gesto: (fattore: number, cx: number, cy: number) => void
  } | null>(null)
  zoomDa.current = {
    rotella: (e) => {
      const attuale = vRef.current
      if (!attuale) return
      const rett = contenitore.current!.getBoundingClientRect()
      // Firefox con una rotella vera conta in righe, o in pagine.
      const passo = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rett.height : 1
      const sensibilita = e.ctrlKey ? 0.01 : 0.0016
      setAnimata(false)
      setV(ingrandisci(attuale, Math.exp(-e.deltaY * passo * sensibilita), e.clientX - rett.left, e.clientY - rett.top))
    },
    gesto: (fattore, cx, cy) => {
      const attuale = vRef.current
      if (!attuale) return
      const rett = contenitore.current!.getBoundingClientRect()
      setAnimata(false)
      setV(ingrandisci(attuale, fattore, cx - rett.left, cy - rett.top))
    },
  }
  useEffect(() => {
    const nodo = contenitore.current
    if (!nodo) return
    let scala = 1
    let inGesto = false
    const rotella = (e: WheelEvent) => {
      e.preventDefault()
      // Durante un pizzico di Safari una rotella con il ctrl sarebbe lo stesso gesto due volte.
      if (!(inGesto && e.ctrlKey)) zoomDa.current?.rotella(e)
    }
    const inizio = (e: Event) => {
      e.preventDefault()
      inGesto = true
      scala = 1
    }
    const cambio = (e: Event) => {
      e.preventDefault()
      const g = e as Event & { scale: number; clientX: number; clientY: number }
      // Sul telefono il pizzico lo seguono gia' i puntatori, due dita: il gesto di Safari lo farebbe doppio.
      if (puntatori.current.size === 0 && scala > 0) zoomDa.current?.gesto(g.scale / scala, g.clientX, g.clientY)
      scala = g.scale
    }
    const fine = (e: Event) => {
      e.preventDefault()
      inGesto = false
    }
    nodo.addEventListener('wheel', rotella, { passive: false })
    nodo.addEventListener('gesturestart', inizio)
    nodo.addEventListener('gesturechange', cambio)
    nodo.addEventListener('gestureend', fine)
    return () => {
      nodo.removeEventListener('wheel', rotella)
      nodo.removeEventListener('gesturestart', inizio)
      nodo.removeEventListener('gesturechange', cambio)
      nodo.removeEventListener('gestureend', fine)
    }
  }, [])

  const bottone = (fattore: number) => {
    if (!v) return
    setAnimata(true)
    setV(fattore === 0 ? vistaSu(riquadroIniziale(), 6) : ingrandisci(v, fattore, misura.w / 2, misura.h / 2))
  }

  /* ── Le classi dei posti ── */

  const statoDi = useCallback(
    (id: string): string => {
      if (esito) {
        if (id === esito.giusta || esito.luogo?.giusti.includes(id)) return ' is-giusta'
        if (esito.accettate.includes(id)) return ' is-accettata'
        if (id === esito.scelta) return ' is-sbagliata'
        if (rivela && esito.luogo?.altri?.includes(id)) return ' is-altro'
        if (mostra?.includes(id)) return ' is-mostra'
        return ''
      }
      if (id === scelta) return ' is-scelta'
      if (mostra?.includes(id)) return ' is-mostra'
      return ''
    },
    [esito, scelta, rivela, mostra],
  )

  const k = v?.k ?? 1
  const nomi = useMemo(
    () =>
      pronta
        ? etichette({
            esito,
            rivela,
            nomiPaesi: props.nomiPaesi,
            ix: ix!,
            ancorePaesi,
            acque,
            geo,
            pallini: xyPallini,
            p,
            k,
            statoDi,
          })
        : [],
    [pronta, esito, rivela, props.nomiPaesi, ix, ancorePaesi, acque, geo, xyPallini, p, k, statoDi],
  )

  const [idClip] = useState(() => `mondo-${Math.random().toString(36).slice(2, 8)}`)
  const perStrato = (livello: StratoCartina) => (strato === livello ? toccabili : null)

  return (
    <div
      ref={contenitore}
      className={`cartina cartina--${strato ?? 'guarda'}${onScegli ? ' is-attiva' : ''}${props.evidenzia ? ' is-evidenzia' : ''}`}
      role="application"
      aria-label={etichetta}
      onPointerDown={giu}
      onPointerMove={muovi}
      onPointerUp={su}
      onPointerCancel={su}
    >
      {errore ? (
        <div className="cartina__avviso">
          <p>{errore}</p>
          <button type="button" className="cartina__riprova" onClick={() => setTentativo((n) => n + 1)}>
            Riprova
          </button>
        </div>
      ) : !pronta || !v ? (
        <div className="cartina__avviso is-attesa" aria-live="polite">
          Apro la cartina…
        </div>
      ) : (
        <>
          <svg className="cartina__svg" viewBox={`0 0 ${misura.w} ${misura.h}`} width={misura.w} height={misura.h}>
            <defs>
              <clipPath id={idClip}>
                <rect x={p.ovest} y={p.alto} width={p.est - p.ovest} height={p.basso - p.alto} />
              </clipPath>
            </defs>
            <g
              className={`cartina__mondo${animata ? ' is-animata' : ''}`}
              style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${k})` }}
            >
              <g clipPath={`url(#${idClip})`}>
                <rect className="cartina__oceano" x={p.ovest} y={p.alto} width={p.est - p.ovest} height={p.basso - p.alto} />
                <path className="cartina__reticolo" d={reticolo} />
                <Strato
                  voci={tracciatiAcque}
                  classe="cartina__acqua"
                  livello="acque"
                  statoDi={statoDi}
                  accesi={perStrato('acque')}
                  toccabili={perStrato('acque')}
                />
                <path className="cartina__riva" d={riva} />
                <Strato
                  voci={tracciatiPaesi}
                  classe="cartina__paese"
                  livello="paesi"
                  statoDi={statoDi}
                  accesi={zona}
                  toccabili={perStrato('paesi')}
                />
                <Strato
                  voci={tracciatiLaghi}
                  classe="cartina__lago"
                  livello="laghi"
                  statoDi={statoDi}
                  accesi={perStrato('laghi')}
                  toccabili={perStrato('laghi')}
                />
                <Strato
                  voci={tracciatiFiumi}
                  classe="cartina__fiume"
                  livello="fiumi"
                  statoDi={statoDi}
                  accesi={perStrato('fiumi')}
                  toccabili={perStrato('fiumi')}
                />
                <Pallini voci={xyPallini} statoDi={statoDi} dentro={strato && strato !== 'paesi' && strato !== 'acque' ? toccabili : null} />
              </g>
            </g>
          </svg>
          <div className="cartina__nomi" style={{ transform: `translate(${v.x}px, ${v.y}px)` }} aria-hidden="true">
            {nomi.map((n) => (
              <span
                key={n.id}
                className={`cartina__nome${n.classe}${n.sopra ? ' is-sopra' : ''}`}
                style={{ left: `${n.x}px`, top: `${n.y}px` }}
              >
                {n.bandiera && <img src={urlBandiera(n.bandiera, 40)} alt="" />}
                {n.testo}
              </span>
            ))}
          </div>
        </>
      )}
      {pronta && v && (
        <div className="cartina__zoom" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" aria-label="Ingrandisci" onClick={() => bottone(1.8)}>
            +
          </button>
          <button type="button" aria-label="Rimpicciolisci" onClick={() => bottone(1 / 1.8)}>
            −
          </button>
          <button type="button" aria-label="Torna alla zona della partita" onClick={() => bottone(0)}>
            ⤢
          </button>
        </div>
      )}
    </div>
  )
}

/** I posti da inquadrare a risposta data: la risposta, quello scelto, e con i nomi anche il resto. */
interface Voce {
  id: string
  d: string
  /** Il colore della carta politica, per i paesi. */
  tinta?: number
}

/**
 * Uno strato di tracciati. E' memorizzato: spostare la cartina cambia solo la
 * trasformazione del gruppo, e i trecento tracciati dei paesi non si rifanno.
 * Fuori da `accesi` un posto e' attenuato; fuori da `toccabili` non si tocca.
 * Di solito sono gli stessi, ma con "si tocca anche fuori dalla zona" i paesi
 * restano attenuati e si toccano lo stesso.
 */
const Strato = memo(function Strato({
  voci,
  classe,
  livello,
  statoDi,
  accesi,
  toccabili,
}: {
  voci: Voce[]
  classe: string
  livello: string
  statoDi: (id: string) => string
  accesi: ReadonlySet<string> | null
  toccabili: ReadonlySet<string> | null
}) {
  return (
    <g className={`cartina__strato cartina__strato--${livello}`}>
      {voci.map((l) =>
        l.d ? (
          <path
            key={l.id}
            d={l.d}
            className={`${classe}${l.tinta !== undefined ? ` tinta-${l.tinta}` : ''}${statoDi(l.id)}${
              accesi && !accesi.has(l.id) ? ' is-fuori' : ''
            }${toccabili && !toccabili.has(l.id) ? ' is-bloccato' : ''}`}
            data-luogo={l.id}
            data-strato={livello}
          />
        ) : null,
      )}
    </g>
  )
})

/**
 * I pallini di capitali e città: un tracciato solo per quelli normali — un
 * segmento lungo zero con la punta tonda e lo spessore che non si ingrandisce
 * e' un cerchio sempre della stessa misura — e uno per ognuno di quelli accesi.
 */
const Pallini = memo(function Pallini({
  voci,
  statoDi,
  dentro,
}: {
  voci: Array<PuntoCartina & { xy: PuntoXY }>
  statoDi: (id: string) => string
  dentro: ReadonlySet<string> | null
}) {
  const [normali, spenti, accesi] = useMemo(() => {
    const n: string[] = []
    const s: string[] = []
    const a: Array<{ id: string; d: string; stato: string }> = []
    for (const q of voci) {
      const d = `M${q.xy[0].toFixed(3)} ${q.xy[1].toFixed(3)}l0.0001 0`
      const stato = statoDi(q.id)
      if (stato) a.push({ id: q.id, d, stato })
      else if (dentro && !dentro.has(q.id)) s.push(d)
      else n.push(d)
    }
    return [n.join(''), s.join(''), a]
  }, [voci, statoDi, dentro])
  if (voci.length === 0) return null
  return (
    <g className="cartina__pallini">
      {spenti && <path className="cartina__pallino is-fuori" d={spenti} />}
      {normali && (
        <>
          <path className="cartina__pallino-bordo" d={normali} />
          <path className="cartina__pallino" d={normali} />
        </>
      )}
      {accesi.map((q) => (
        <g key={q.id}>
          <path className="cartina__pallino-bordo is-acceso" d={q.d} />
          <path className={`cartina__pallino is-acceso${q.stato}`} d={q.d} />
        </g>
      ))}
    </g>
  )
})

/* ──────────────────────────────  I nomi  ─────────────────────────────── */

interface Nome {
  id: string
  x: number
  y: number
  testo: string
  classe: string
  bandiera?: string
  /** Sopra il punto, per i pallini: il nome non copre la città. */
  sopra: boolean
}

interface Ancora {
  id: string
  xy: PuntoXY
  r: Riquadro
}

/** Dove provare un nome della risposta che cadrebbe su un altro: in mezze larghezze e in righe. */
const SPOSTAMENTI: Array<[number, number]> = [
  [0, 0],
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [0, 2],
  [0, -2],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [0, 3],
  [0, -3],
]

interface PerEtichette {
  esito: EsitoCartina | null | undefined
  rivela: boolean
  nomiPaesi: boolean
  ix: IndiceQuiz
  ancorePaesi: Ancora[]
  acque: Luogo[] | null
  geo: Geometrie | null
  pallini: Array<PuntoCartina & { xy: PuntoXY }>
  p: Proiezione
  k: number
  statoDi: (id: string) => string
}

/**
 * I nomi sulla cartina: a risposta data quelli dei posti della domanda, con la
 * bandiera dei paesi, e poi quelli dei paesi che ci stanno, dal piu' grande. Le
 * posizioni sono in pixel alla scala di adesso, relative al mondo: spostare la
 * cartina trasla il livello intero, e non le ricalcola.
 */
function etichette(e: PerEtichette): Nome[] {
  const { ix, ancorePaesi, acque, geo, pallini, p, k } = e
  const perNumero = new Map(ix.dati.paesi.filter((q) => q.num).map((q) => [`n${q.num}`, q]))
  const nomi: Nome[] = []
  const occupati: Array<[number, number, number, number]> = []
  const sovrapposto = (x: number, y: number, w: number, h: number) =>
    occupati.reduce((s, [a, b, c, d]) => {
      const larghezza = Math.min(x + w, c) - Math.max(x, a)
      const altezza = Math.min(y + h, d) - Math.max(y, b)
      return larghezza > 0 && altezza > 0 ? s + larghezza * altezza : s
    }, 0)

  const aggiungi = (id: string, forza: boolean) => {
    if (nomi.some((n) => n.id === id)) return
    const tipo = tipoDelPosto(id)
    let xy: PuntoXY | null = null
    let testo = ''
    let bandiera: string | undefined
    let sopra = false
    if (tipo === 'paese') {
      const a = ancorePaesi.find((x) => x.id === id)
      const q = perNumero.get(id)
      if (!a || !q) return
      xy = a.xy
      testo = q.n
      bandiera = forza ? q.id.toLowerCase() : undefined
    } else if (tipo === 'acqua') {
      const l = acque?.find((x) => x.id === id)
      xy = l ? puntoDelNome(anelliDi(l.poligoni), p, true) : null
      testo = ix.acque.get(id)?.n ?? l?.nome ?? ''
    } else if (tipo === 'fiume') {
      const t = geo?.fiumi.get(id.slice(2))
      xy = t ? puntoDelNome(t.linee, p, false) : null
      testo = maiuscola(ix.dati.fiumi.find((f) => f.id === id.slice(2))?.n ?? '')
      // Sopra la linea: il nome sul fiume lo coprirebbe proprio dove lo si guarda.
      sopra = true
    } else if (tipo === 'lago') {
      const t = geo?.laghi.get(id.slice(2))
      const l = ix.dati.laghi.find((x) => x.id === id.slice(2))
      xy = t ? puntoDelNome(t.linee, p, true) : l?.pt ? p.punto(l.pt[0], l.pt[1]) : null
      testo = l ? lagoInOpzione(l.n) : ''
      sopra = !t
    } else if (tipo === 'capitale' || tipo === 'citta') {
      const q = pallini.find((x) => x.id === id)
      xy = q?.xy ?? null
      testo = q?.nome ?? ''
      sopra = true
    }
    if (!xy || !testo) return
    const x = xy[0] * k
    const y = xy[1] * k
    const w = testo.length * 6.6 + (bandiera ? 30 : 14)
    const h = 21
    const bx0 = x - w / 2
    const by0 = sopra ? y - h * 1.35 : y - h / 2
    if (!forza && sovrapposto(bx0, by0, w, h) > 0) return
    // I nomi della risposta ci devono essere tutti: uno che cadrebbe su un altro prova le righe sopra e
    // sotto, poi di lato, e se non c'e' posto da nessuna parte prende quello dove copre meno.
    let [bx, by] = [bx0, by0]
    if (forza) {
      let meno = Infinity
      for (const [dx, dy] of SPOSTAMENTI) {
        const cx = bx0 + dx * (w / 2 + 4)
        const cy = by0 + dy * (h + 3)
        const coperto = sovrapposto(cx, cy, w, h)
        if (coperto < meno) [meno, bx, by] = [coperto, cx, cy]
        if (coperto === 0) break
      }
    }
    occupati.push([bx, by, bx + w, by + h])
    nomi.push({
      id,
      x: bx + w / 2,
      y: sopra ? by + h * 1.35 : by + h / 2,
      testo,
      classe: forza ? e.statoDi(id) || ' is-altro' : ' is-paese',
      bandiera,
      sopra,
    })
  }

  const { esito } = e
  if (esito && e.rivela) {
    const giusti = esito.luogo?.giusti.length ? esito.luogo.giusti : [esito.giusta]
    for (const id of giusti) aggiungi(id, true)
    if (esito.scelta && !giusti.includes(esito.scelta) && !esito.accettate.includes(esito.scelta)) {
      aggiungi(esito.scelta, true)
    }
    for (const id of esito.luogo?.altri ?? []) aggiungi(id, true)
  }
  if (e.nomiPaesi || (esito && e.rivela)) {
    // I paesi dal piu' grande sullo schermo: i piccoli, se non c'e' posto, restano senza nome.
    for (const a of ancorePaesi) if ((a.r.x1 - a.r.x0) * k > 38) aggiungi(a.id, false)
  }
  return nomi
}
