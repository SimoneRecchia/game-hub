import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { useToast } from '@/components/Toast'
import { Tabellone } from '@/games/fortuna/Tabellone'
import { useDopo } from '@/games/fortuna/useDopo'
import { centroDi, incassaMonete, puntaFiches, spostaFiches, volaFiche } from '@/games/fortuna/voli'
import { coloreDellaCategoria, iconaDellaCategoria } from '@/games/ruota/disegni'
import { Intermezzo, type DatiIntermezzo } from '@/games/ruota/Intermezzo'
import { ComeSiGiocaSlot } from '@/games/slot/ComeSiGioca'
import { FestaSlot, type DatiFesta } from '@/games/slot/Festa'
import { Leva } from '@/games/slot/Leva'
import { eFesta, momentoDi, type Momento, type MomentoMobile } from '@/games/slot/momenti'
import { Rulli, type MetaRulli } from '@/games/slot/Rulli'
import { DefinizioniSlot, Simbolo } from '@/games/slot/simboli'
import { DURATA_TARGA, Targa, type DatiTarga } from '@/games/slot/Targa'
import { VINCITE, type VincitaRulli } from '@/games/slot/vincite'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { suona } from '@/lib/suoni'
import { NOMI_CATEGORIE, type CategoriaQuiz } from '@shared/quiz'
import {
  INTERVALLO_SLOT_MS,
  PREMI,
  PUNTATA_MASSIMA_SLOT,
  PUNTATA_MINIMA_SLOT,
  PUNTATE_SLOT,
  VINCITA_DOMANDA,
  lineaDi,
  righeDelleDomande,
  vincitaDellaLinea,
} from '@shared/slot'
import type { GiroSlot, SlotStato } from '@shared/types'
import './Slot.css'

const DomandaRuota = lazy(() => import('@/games/ruota/DomandaRuota'))

type Fase = 'pronta' | 'gira' | 'paga' | 'tripla' | 'domanda'
/**
 * Le luci della sala, che seguono il momento della vincita: la ciliegia sola
 * fa tre giri di corsa e basta, la targa accende tutto e fa passare la luce
 * sulla lacca, il palco fa correre le lampadine il doppio, il jackpot lampeggia.
 */
type Luci = 'attesa' | 'gira' | 'poco' | 'vinto' | 'palco' | 'jackpot'

const LUCI_DEL_MOMENTO: Record<Momento, Luci> = {
  targhetta: 'poco',
  targa: 'vinto',
  palco: 'palco',
  big: 'vinto',
  super: 'vinto',
  mega: 'vinto',
  jackpot: 'jackpot',
}

/**
 * Le vincite sul mobile: quando le monete partono dal vassoio verso il saldo
 * (ci arrivano 760 ms dopo, `incassaMonete`), e quando la slot torna pronta,
 * appena dopo la targa. La ciliegia sola esce un giro ogni quattro, quindi rende
 * la leva in fretta; piu' la vincita e' rara, piu' il momento dura.
 */
const TEMPI: Record<MomentoMobile, { incasso: number; pronta: number }> = {
  targhetta: { incasso: 500, pronta: 1_350 },
  targa: { incasso: 950, pronta: 1_900 },
  palco: { incasso: 1_700, pronta: 2_800 },
}

/** Dal ×20 i simboli che pagano si vedono un attimo prima che la festa prenda lo schermo. */
const FESTA_MS = 900
/** Quanto i punti di domanda si girano prima della domanda, e quanto si torna alla slot prima della festa. */
const TRIPLA_MS = 1_500
const RITORNO_MS = 650

/** La puntata in fiches, dalle piu' grandi: la pila che torna indietro quando la si azzera. */
function inFiches(puntata: number): number[] {
  const pezzi: number[] = []
  let resto = puntata
  for (const valore of [...PUNTATE_SLOT].reverse()) {
    while (resto >= valore) {
      pezzi.push(valore)
      resto -= valore
    }
  }
  return pezzi
}

/** Le monete che cadono nel vassoio, e poi volano al saldo: piu' vale la vincita, piu' sono. */
const moneteDi = (premio: number) => Math.min(24, Math.round(3 + Math.sqrt(premio) * 2))

/** Quel che paga la linea di un giro, da mostrare sui rulli: la combinazione e i simboli che la fanno. */
function vincitaDi(g: GiroSlot): VincitaRulli | null {
  const v = vincitaDellaLinea(lineaDi(g.fermate))
  return v && { tipo: v.combinazione, caselle: v.simboli.map((rullo) => [rullo, 1] as const) }
}

/** I tre punti di domanda di un giro, che girandosi mostrano la categoria. */
function domandaDi(g: GiroSlot): VincitaRulli | null {
  if (!g.tripla) return null
  const caselle = righeDelleDomande(g.fermate).map((riga, rullo) => [rullo, riga] as const)
  return { tipo: 'Q', caselle, categoria: g.tripla.categoria }
}

/**
 * La slot: si mettono le fiches, si tira la leva, e i tre rulli girano e si
 * fermano uno dopo l'altro. Ogni fiche aggiunge il suo valore alla puntata,
 * fino al massimo; "Azzera" la riporta a zero, e a zero la leva non si tira.
 * La puntata si paga alla leva, e si vede: le fiches volano dal saldo alla
 * fessura del mobile, e il saldo scende. Quando il terzo rullo si ferma, quel
 * che paga si accende, ogni combinazione a modo suo, con il suo nome sul
 * display (`VINCITE`), e il suo momento, piu' grande quanto e' piu' rara
 * (`momentoDi`): una targa sul mobile, o la festa. Le monete cadono nel vassoio
 * e da li' volano al saldo, che sale quando arriva la prima. Tre punti di
 * domanda, dovunque nella finestra, si girano e mostrano la categoria:
 * l'intermezzo, poi la domanda del quiz, e tornando alla slot la vincita.
 *
 * Il server sa gia' l'esito quando risponde alla leva, ma i rulli no: qui si
 * mostra nell'ordine giusto, e il tabellone resta fermo (`conto`) finché il
 * momento non arriva.
 */
export default function SlotPagina() {
  const { vai } = useNavigazione()
  const toast = useToast()
  const dopo = useDopo()
  const [stato, setStato] = useState<SlotStato | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [fase, setFase] = useState<Fase>('pronta')
  /** La puntata messa con le fiches; finché non se ne tocca una, quella dell'ultimo giro di oggi. */
  const [puntata, setPuntata] = useState<number | null>(null)
  /** Le fiches in volo verso il display: la puntata e' gia' cresciuta, il display la conta quando arrivano. */
  const [inVoloFiches, setInVoloFiches] = useState(0)
  /** Cresce a ogni fiche che non entra: il MAX del display lampeggia. */
  const [lampoMax, setLampoMax] = useState(0)
  const [targa, setTarga] = useState<DatiTarga | null>(null)
  const [inMoto, setInMoto] = useState(false)
  const [meta, setMeta] = useState<MetaRulli | null>(null)
  const [conto, setConto] = useState<{ saldo: number; netto: number; giri: number } | null>(null)
  /** Quel che paga, sui rulli e sul display: la combinazione della linea, o i tre punti di domanda. */
  const [vinta, setVinta] = useState<VincitaRulli | null>(null)
  const [vincita, setVincita] = useState<number | null>(null)
  const [luci, setLuci] = useState<Luci>('attesa')
  const [vassoio, setVassoio] = useState(0)
  const [intermezzo, setIntermezzo] = useState<DatiIntermezzo | null>(null)
  const [regole, setRegole] = useState(false)
  const [festa, setFesta] = useState<(DatiFesta & { premio: number }) | null>(null)
  /** La leva arrivata in fondo: il mobile ha un sussulto. */
  const [scossa, setScossa] = useState(false)
  const [inviando, setInviando] = useState(false)
  /** Fra due giri passa un attimo: senza animazioni i rulli si fermano subito, e il server direbbe di no. */
  const [riposata, setRiposata] = useState(true)
  /** Cresce a ogni leva: le monete di un giro finito, arrivando, non liberano il tabellone del giro dopo. */
  const leve = useRef(0)
  /** Cresce quando si azzera o si tira la leva: le fiches ancora in volo, arrivando, non contano piu'. */
  const voliFiches = useRef(0)
  const saldoRef = useRef<HTMLSpanElement>(null)
  const puntataRef = useRef<HTMLSpanElement>(null)
  const vassoioRef = useRef<HTMLDivElement>(null)
  const gettoniRef = useRef<HTMLDivElement>(null)
  const vetroRef = useRef<HTMLDivElement>(null)
  const macchinaRef = useRef<HTMLDivElement>(null)
  const ultimo = useRef(stato)
  useEffect(() => {
    ultimo.current = stato
  })

  const leggi = useCallback(() => api<SlotStato>('/slot'), [])

  useEffect(() => {
    let vivo = true
    leggi()
      .then((s) => {
        if (!vivo) return
        setStato(s)
        if (s.giro) {
          // I rulli compaiono dove si sono fermati l'ultima volta: non rigirano.
          setMeta({ fermate: s.giro.fermate, chiave: `g${s.giro.n}` })
          if (s.giro.stato !== 'fatto') setFase('domanda')
        }
      })
      .catch((e) => vivo && setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare la slot.'))
    return () => {
      vivo = false
    }
  }, [leggi])

  useEffect(() => {
    if (riposata) return
    const t = window.setTimeout(() => setRiposata(true), INTERVALLO_SLOT_MS)
    return () => window.clearTimeout(t)
  }, [riposata])

  /** Una richiesta che risponde con lo stato: se va male lo dice, e rilegge com'e' davvero. */
  const inVolo = useRef(false)
  const chiedi = useCallback(
    async (percorso: string, corpo?: unknown): Promise<SlotStato | null> => {
      if (inVolo.current) return null
      inVolo.current = true
      setInviando(true)
      try {
        const nuovo = await api<SlotStato>(percorso, { method: 'POST', body: corpo ?? {} })
        dimentica('/fortuna')
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
  const saldo = stato?.saldo ?? 0
  const categorie = useMemo(() => stato?.categorie ?? [], [stato?.categorie])
  /** Si punta fino a dieci, e mai piu' del saldo: il ×300 dei sette su un saldo intero sfascerebbe la generale. */
  const tetto = Math.min(PUNTATA_MASSIMA_SLOT, saldo)
  const ferma = fase === 'pronta' && !inMoto
  // La puntata resta quella di prima finché non la si cambia, come al tavolo. A slot ferma mai oltre il tetto;
  // mentre i rulli girano e' quella del giro, anche se il saldo, che il server ha gia' contato, e' sceso sotto.
  const voluta = puntata ?? giro?.puntata ?? 0
  const scelta = ferma ? Math.min(tetto, voluta) : voluta
  /** Quel che dice il display: la puntata, meno le fiches che non ci sono ancora arrivate. */
  const mostrata = Math.max(0, scelta - inVoloFiches)
  /** Al tetto, quando il display ci e' arrivato: la fiche che lo riempie dice MAX quando si posa. */
  const alMassimo = ferma && scelta > 0 && scelta >= tetto && inVoloFiches === 0
  const puoPuntare = ferma && saldo >= PUNTATA_MINIMA_SLOT
  const puoGiocare = puoPuntare && scelta >= PUNTATA_MINIMA_SLOT && riposata && !inviando
  const senzaPuntata = puoPuntare && mostrata === 0

  /** Una fiche che non entra, o che riempie la puntata: il MAX lampeggia, con un tocco morbido. Mai un errore. */
  const segnaMassimo = () => {
    setLampoMax((n) => n + 1)
    suona('tetto', { ritardo: 0.06 })
  }

  /**
   * Una fiche: la puntata cresce del suo valore, fino al tetto, e la fiche vola
   * dal bottone al display, che conta quando arriva. Una che va oltre si ferma
   * al tetto, e lo dice.
   */
  const aggiungi = (valore: number, bottone: HTMLElement) => {
    if (!puoPuntare) return
    const nuova = Math.min(tetto, scelta + valore)
    const oltre = scelta + valore > tetto
    if (nuova <= scelta) {
      segnaMassimo()
      return
    }
    const quanto = nuova - scelta
    const volo = voliFiches.current
    setPuntata(nuova)
    setInVoloFiches((n) => n + quanto)
    const posa = () => {
      if (volo !== voliFiches.current) return
      setInVoloFiches((n) => Math.max(0, n - quanto))
      if (oltre) segnaMassimo()
    }
    const da = centroDi(bottone)
    const a = centroDi(puntataRef.current)
    const colore = getComputedStyle(bottone).getPropertyValue('--fiche').trim() || 'var(--ct-blu)'
    if (da && a) void volaFiche(da, a, valore, colore).then(posa)
    else {
      suona('fiche', { volume: 0.6 })
      posa()
    }
  }

  /** Azzera: le fiches tornano dal display al banco, in pila, e la leva aspetta la puntata nuova. */
  const azzera = () => {
    if (!puoPuntare || scelta === 0) return
    voliFiches.current += 1
    setInVoloFiches(0)
    setPuntata(0)
    const da = centroDi(puntataRef.current)
    const a = centroDi(gettoniRef.current)
    // Il colore di ogni fiche e' quello del suo bottone, scritto una volta in Slot.css.
    const coloreDi = (valore: number) => {
      const bottone = gettoniRef.current?.querySelector(`.slot-gettone.is-${valore}`)
      return (bottone && getComputedStyle(bottone).getPropertyValue('--fiche').trim()) || 'var(--ct-blu)'
    }
    const pila = inFiches(mostrata).map(coloreDi)
    if (da && a && pila.length > 0) void spostaFiches(da, a, pila)
    else suona('fiche', { volume: 0.4 })
  }

  /**
   * La vincita che torna al saldo: le monete volano dal vassoio, e il tabellone si muove quando arriva la prima.
   * Se intanto e' partito un altro giro non lo tocca: mostrerebbe il saldo del giro nuovo prima dei rulli.
   */
  const incassa = (premio: number) => {
    const leva = leve.current
    const ancora = () => leve.current === leva
    const da = centroDi(vassoioRef.current)
    const a = centroDi(saldoRef.current)
    if (!da || !a) {
      setConto(null)
      return
    }
    void incassaMonete(da, a, moneteDi(premio), () => ancora() && setConto(null)).then(
      () => ancora() && setVassoio(0),
    )
  }

  /* ───────────────────────────────  La leva  ─────────────────────────────── */

  const tira = async () => {
    if (!puoGiocare || !stato) return
    leve.current += 1
    // La leva paga la puntata che c'e': le fiches ancora in volo sono gia' sue, e il display la dice intera.
    voliFiches.current += 1
    setInVoloFiches(0)
    setPuntata(scelta)
    setTarga(null)
    setFase('gira')
    setInMoto(true)
    setVinta(null)
    setVincita(null)
    setVassoio(0)
    setLuci('gira')
    setRiposata(false)
    setScossa(true)
    dopo(420, () => setScossa(false))
    const prima = stato.giro?.fermate ?? null
    // La puntata si paga adesso: il saldo scende, e le fiches volano nel display della puntata.
    setConto({ saldo: stato.saldo - scelta, netto: stato.netto - scelta, giri: stato.giri + 1 })
    const da = centroDi(saldoRef.current)
    const a = centroDi(puntataRef.current)
    if (da && a) void puntaFiches(da, a, scelta)
    const nuovo = await chiedi('/slot/gira', { puntata: scelta })
    if (!nuovo?.giro) {
      // I rulli tornano dov'erano, e il saldo com'era.
      setMeta({ fermate: prima ?? [0, 0, 0], chiave: `annulla${Date.now()}` })
      setConto(null)
      setFase('pronta')
      return
    }
    // Subito, e non con l'effetto: senza animazioni i rulli si fermano nell'effetto di `Rulli`, che viene prima di
    // quelli della pagina, e `fermati` leggerebbe il giro di prima.
    ultimo.current = nuovo
    setStato(nuovo)
    setMeta({ fermate: nuovo.giro.fermate, chiave: `g${nuovo.giro.n}` })
  }

  /**
   * Il jackpot comincia al buio, e la festa deve sapere dove stanno i rulli, che restano accesi con i sette che
   * bruciano, e la cima del mobile, da dove si alza il faro.
   */
  const scenaDelJackpot = (): Pick<DatiFesta, 'rulli' | 'faro'> => {
    const v = vetroRef.current?.getBoundingClientRect()
    const m = macchinaRef.current?.getBoundingClientRect()
    return {
      ...(v && { rulli: { x: v.left + v.width / 2, y: v.top + v.height / 2, r: Math.max(v.width, v.height) * 0.56 } }),
      ...(m && { faro: { x: m.left + m.width / 2, y: m.top } }),
    }
  }

  /**
   * Il terzo rullo si e' fermato: quel che paga si accende, con il momento che le spetta — una targa sul mobile, o
   * dal ×20 la festa — le monete cadono, poi la domanda se c'e'.
   */
  const fermati = () => {
    setInMoto(false)
    const s = ultimo.current
    const g = s?.giro
    if (!s || !g || fase !== 'gira') {
      setConto(null)
      setLuci('attesa')
      return
    }
    const linea = vincitaDi(g)
    const importo = g.premio * g.puntata
    const momento = linea ? momentoDi(g.premio) : null
    /** Quando il momento della linea e' finito: poi la domanda, o la slot di nuovo pronta. */
    let finito = 0
    if (linea && momento) {
      setFase('paga')
      setVinta(linea)
      setVincita(importo)
      setVassoio(moneteDi(g.premio))
      setLuci(LUCI_DEL_MOMENTO[momento])
      suona(VINCITE[linea.tipo].suono)
      if (eFesta(momento)) {
        // Dal ×20 la festa delle slot vere: le monete vanno al saldo quando finisce.
        const sotto = `${VINCITE[linea.tipo].nome}, ${g.puntata} × ${g.premio}`
        const scena = momento === 'jackpot' ? scenaDelJackpot() : {}
        dopo(FESTA_MS, () =>
          setFesta({ chiave: Date.now(), livello: momento, vincita: importo, sotto, premio: g.premio, ...scena }),
        )
      } else {
        // Sotto il ×20 la targa sul mobile, che non copre la linea; le monete partono mentre se ne va.
        const chiave = Date.now()
        setTarga({ chiave, momento, nome: VINCITE[linea.tipo].nome, vincita: importo })
        dopo(DURATA_TARGA[momento], () => setTarga((t) => (t?.chiave === chiave ? null : t)))
        dopo(TEMPI[momento].incasso, () => incassa(g.premio))
        finito = TEMPI[momento].pronta
      }
    } else {
      setConto(null)
    }
    const domanda = domandaDi(g)
    if (domanda && g.tripla) {
      // I punti di domanda dopo la linea, se ha pagato anche lei: insieme a una domanda la linea paga al piu' le
      // prugne, ×15, quindi una targa e mai una festa davanti alla domanda.
      const { categoria } = g.tripla
      dopo(finito, () => {
        setFase('tripla')
        setVinta(domanda)
        setVincita(null)
        setLuci('vinto')
        suona(VINCITE.Q.suono)
        dopo(TRIPLA_MS, () => apriTripla(categoria, g.vincitaDomanda ?? 0))
      })
      return
    }
    // Con la festa, la slot torna pronta quando la festa finisce.
    if (momento && eFesta(momento)) return
    dopo(finito, () => {
      setFase('pronta')
      setLuci('attesa')
    })
  }

  /** Finita la festa: le monete dal vassoio al saldo, e la slot e' di nuovo pronta. */
  const fineFesta = () => {
    const f = festa
    setFesta(null)
    if (f) incassa(f.premio)
    const g = ultimo.current?.giro
    if (g?.tripla && g.stato !== 'fatto') return
    setFase('pronta')
    setLuci('attesa')
  }

  /* ───────────────────────────────  La domanda  ─────────────────────────────── */

  const apriTripla = (categoria: CategoriaQuiz, vale: number) => {
    const Icona = iconaDellaCategoria(categoria)
    setIntermezzo({
      chiave: Date.now(),
      titolo: NOMI_CATEGORIE[categoria],
      sotto: `Giusta vale ${vale}`,
      colore: coloreDellaCategoria(categoria),
      icona: <Icona size={34} />,
    })
  }

  const apriDomanda = async () => {
    const nuovo = await chiedi('/slot/domanda')
    if (nuovo) setStato(nuovo)
  }

  const rispondi = async (scelta: string | null) => {
    const nuovo = await chiedi('/slot/risposta', { scelta })
    if (!nuovo?.giro) return
    setStato(nuovo)
    const r = nuovo.giro.risposta
    if (r) suona(r.giusta ? 'giusto' : 'sbagliato')
  }

  const allaSlot = () => {
    const g = ultimo.current?.giro
    setFase('pronta')
    setLuci('attesa')
    setVinta(null)
    if (g?.risposta?.giusta && g.vincitaDomanda && g.tripla) {
      const vale = g.vincitaDomanda
      const s = ultimo.current
      setConto(s ? { saldo: s.saldo - vale, netto: s.netto - vale, giri: s.giri } : null)
      // Sul display la domanda, nel colore della sua categoria; i rulli restano spenti.
      setVinta({ tipo: 'Q', caselle: [], categoria: g.tripla.categoria })
      dopo(RITORNO_MS, () => {
        setVincita(vale)
        setVassoio(moneteDi(VINCITA_DOMANDA))
        setLuci('vinto')
        const premio = VINCITA_DOMANDA
        setFesta({ chiave: Date.now(), livello: 'big', vincita: vale, sotto: 'Domanda giusta', premio })
      })
    }
  }

  if (errore) {
    return (
      <Pagina titolo="Slot" indietro={{ a: ROTTE.fortuna, etichetta: 'Fortuna' }} intera>
        <div className="slot-errore">
          <p>{errore}</p>
          <Button onClick={() => vai(ROTTE.fortuna)}>Torna alla Fortuna</Button>
        </div>
      </Pagina>
    )
  }

  const inDomanda = fase === 'domanda' && giro?.tripla
  const quanto = conto ?? (stato ? { saldo: stato.saldo, netto: stato.netto, giri: stato.giri } : null)
  const classeVincita = `slot-display__voce is-vincita${vinta ? ' is-accesa' : ''}${senzaPuntata ? ' is-invito' : ''}`
  return (
    <Pagina
      titolo="Slot"
      indietro={{ a: ROTTE.fortuna, etichetta: 'Fortuna' }}
      intera
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      <DefinizioniSlot />
      {inDomanda && giro?.tripla && (
        <Suspense fallback={<div className="slot-attesa" />}>
          {giro.domanda ? (
            <DomandaRuota
              sfida={{
                categoria: giro.tripla.categoria,
                domanda: giro.domanda,
                risposta: giro.risposta,
                limiteMs: giro.limiteMs,
                restanteMs: giro.restanteMs,
                moltiplicatore: VINCITA_DOMANDA,
                vincita: giro.vincitaDomanda,
              }}
              inviando={inviando}
              torna="Torna alla slot"
              onRispondi={rispondi}
              onTorna={allaSlot}
            />
          ) : (
            <Pronti categoria={giro.tripla.categoria} vale={giro.vincitaDomanda ?? 0} onVia={apriDomanda} />
          )}
        </Suspense>
      )}
      <div className="slot" hidden={!!inDomanda}>
        {quanto && <Tabellone saldo={quanto.saldo} puntata={mostrata > 0 ? mostrata : null} saldoRef={saldoRef} />}
        <div
          className={`slot-sala is-${luci}`}
          data-vince={vinta?.tipo}
          style={vinta?.categoria ? ({ '--vinta': coloreDellaCategoria(vinta.categoria) } as CSSProperties) : undefined}
        >
          <span className="slot-sala__luci" aria-hidden="true" />
          <div className={`slot-macchina${scossa ? ' is-scossa' : ''}`} ref={macchinaRef}>
            <span className="slot-lustro" aria-hidden="true" />
            <span className="slot-fianco" aria-hidden="true" />
            <Insegna luci={luci} />
            <div className="slot-fronte">
              <span className="slot-fronte__led is-sinistra" aria-hidden="true" />
              <span className="slot-fronte__led is-destra" aria-hidden="true" />
              <TabellaBreve />
              <div className="slot-vetro" ref={vetroRef}>
                {stato ? (
                  <Rulli categorie={categorie} inMoto={inMoto} meta={meta} vincita={vinta} onFine={fermati} />
                ) : (
                  <div className="slot-rulli is-attesa" />
                )}
                <span className="slot-vetro__linea" aria-hidden="true" />
                <span className="slot-vetro__freccia is-sinistra" aria-hidden="true" />
                <span className="slot-vetro__freccia is-destra" aria-hidden="true" />
                <span className="slot-vetro__riflesso" aria-hidden="true" />
              </div>
              <div className="slot-display">
                <span className={`slot-display__voce is-puntata${alMassimo ? ' is-massimo' : ''}`}>
                  <span className="slot-display__etichetta" aria-hidden="true">
                    Puntata
                  </span>
                  <span className="slot-display__cifre u-tabnum" ref={puntataRef} key={mostrata} aria-hidden="true">
                    {mostrata}
                  </span>
                  {alMassimo && (
                    <span className="slot-display__max" key={lampoMax} aria-hidden="true">
                      Max
                    </span>
                  )}
                  {/* La puntata per chi ascolta: subito, senza aspettare le fiches in volo. */}
                  <span className="u-visually-hidden" aria-live="polite" aria-atomic="true">
                    {`Puntata ${scelta}${alMassimo ? ', il massimo' : ''}`}
                  </span>
                </span>
                <span className={classeVincita} aria-live="polite" aria-atomic="true">
                  {senzaPuntata ? (
                    <span className="slot-display__invito">Tocca le fiches</span>
                  ) : (
                    <>
                      <span className="slot-display__etichetta">{vinta ? VINCITE[vinta.tipo].nome : 'Vincita'}</span>
                      <span className="slot-display__cifre u-tabnum" key={`${vinta?.tipo}${vincita}`}>
                        {vincita ?? (vinta?.tipo === 'Q' ? '?' : '–')}
                      </span>
                    </>
                  )}
                </span>
              </div>
            </div>
            <div className="slot-banco">
              <div className="slot-banco__piano">
                <div className="slot-banco__fiches">
                  <div className="slot-gettoni" ref={gettoniRef} role="group" aria-label="Fiches">
                    {PUNTATE_SLOT.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`slot-gettone is-${p}`}
                        aria-label={`Aggiungi ${p}`}
                        disabled={!puoPuntare}
                        onClick={(e) => aggiungi(p, e.currentTarget)}
                      >
                        <span className="u-tabnum" aria-hidden="true">
                          {p}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="slot-azzera"
                    aria-label="Azzera la puntata"
                    disabled={!puoPuntare || scelta === 0}
                    onClick={azzera}
                  >
                    Azzera
                  </button>
                </div>
                <button type="button" className="slot-gira" disabled={!puoGiocare} onClick={() => void tira()}>
                  <span className="slot-gira__testo">Gira</span>
                </button>
              </div>
            </div>
            <Pancia />
            <div className="slot-vassoio" ref={vassoioRef} aria-hidden="true">
              {Array.from({ length: vassoio }, (_, i) => (
                <span key={i} className="slot-vassoio__moneta" style={{ '--i': i } as CSSProperties} />
              ))}
            </div>
            <span className="slot-zoccolo" aria-hidden="true" />
            <Leva attiva={puoGiocare} onTira={() => void tira()} />
            {targa && <Targa key={targa.chiave} dati={targa} />}
          </div>
          {intermezzo && (
            <Intermezzo dati={intermezzo} onMezzo={() => setFase('domanda')} onFine={() => setIntermezzo(null)} />
          )}
        </div>
        {stato && saldo < PUNTATA_MINIMA_SLOT && fase === 'pronta' && !inMoto && (
          <p className="slot-vuoto">Servono punti di oggi: gioca le classificate, poi torna qui.</p>
        )}
      </div>
      {festa && <FestaSlot dati={festa} onFine={fineFesta} />}
      <ComeSiGiocaSlot open={regole} onClose={() => setRegole(false)} categorie={categorie} />
    </Pagina>
  )
}

/** Le lampadine dell'insegna: lungo l'arco e sul fondo, ognuna con il suo posto nella corsa. */
const LAMPADINE = (() => {
  const punti: Array<{ x: number; y: number; i: number }> = []
  const n = 17
  for (let k = 0; k < n; k += 1) {
    const a = Math.PI + (Math.PI * k) / (n - 1)
    punti.push({ x: 200 + 184 * Math.cos(a), y: 92 + 80 * Math.sin(a), i: k })
  }
  for (let k = 1; k < 9; k += 1) punti.push({ x: 16 + (368 * k) / 9, y: 110, i: n + k })
  return punti
})()

/**
 * L'insegna in cima al mobile: un arco laccato con le lampadine che corrono
 * lungo il bordo — a turno in attesa, in corsa mentre i rulli girano, a
 * raffica per una vincita — e la scritta in rilievo, con lo spessore delle
 * lettere disegnato sotto.
 */
function Insegna({ luci }: { luci: Luci }) {
  return (
    <div className={`slot-insegna is-${luci}`} aria-hidden="true">
      <svg className="slot-insegna__disegno" viewBox="0 0 400 120" preserveAspectRatio="none">
        <defs>
          <linearGradient id="slot-insegna-oro" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fffbe0" />
            <stop offset="0.45" stopColor="#ffd84a" />
            <stop offset="0.7" stopColor="#e89a10" />
            <stop offset="1" stopColor="#fff0a0" />
          </linearGradient>
          <linearGradient id="slot-insegna-rosso" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffb3bd" />
            <stop offset="0.5" stopColor="#ff2a48" />
            <stop offset="1" stopColor="#8c0018" />
          </linearGradient>
        </defs>
        {LAMPADINE.map((p) => (
          <circle
            key={p.i}
            cx={p.x}
            cy={p.y}
            r={5}
            className="slot-insegna__lampadina"
            style={{ '--i': p.i } as CSSProperties}
          />
        ))}
      </svg>
      <svg className="slot-insegna__scritta" viewBox="0 0 400 110">
        {[7, 5.5, 4, 2.5, 1].map((d) => (
          <text key={d} x={200} y={78 + d} className="slot-insegna__spessore">
            SLOT
          </text>
        ))}
        <text x={200} y={78} className="slot-insegna__lettere">
          SLOT
        </text>
        {[52, 348].map((x) => (
          <g key={x}>
            {[4, 2].map((d) => (
              <text key={d} x={x} y={72 + d} className="slot-insegna__spessore is-sette">
                7
              </text>
            ))}
            <text x={x} y={72} className="slot-insegna__sette">
              7
            </text>
          </g>
        ))}
      </svg>
      <span className="slot-insegna__luccichio" />
    </div>
  )
}

/** I tre premi piu' alti, sul vetro sotto l'insegna, come sui mobili veri: il resto nelle regole. */
function TabellaBreve() {
  const premi: Array<['7' | 'R' | 'B', number]> = [
    ['7', PREMI['7']],
    ['R', PREMI.R],
    ['B', PREMI.B],
  ]
  return (
    <div className="slot-tabella" aria-label="I premi piu' alti">
      {premi.map(([s, x]) => (
        <span key={s} className="slot-tabella__voce">
          <span className="slot-tabella__simboli">
            {[0, 1, 2].map((i) => (
              <Simbolo key={i} codice={s} />
            ))}
          </span>
          <span className="slot-tabella__valore u-tabnum">×{x}</span>
        </span>
      ))}
    </div>
  )
}

/**
 * La stella della pancia, in un quadrato di cento: cinque punte piene, e il
 * centro un poco sotto, perché stia in mezzo.
 */
const STELLA = Array.from({ length: 10 }, (_, k) => {
  const a = -Math.PI / 2 + (Math.PI * k) / 5
  const r = k % 2 === 0 ? 44 : 20
  return `${(50 + r * Math.cos(a)).toFixed(1)},${(54 + r * Math.sin(a)).toFixed(1)}`
}).join(' ')

/**
 * La pancia del mobile, sotto il banco: il vetro illuminato con i raggi, come
 * sui mobili veri, e dove i raggi si incontrano una stella d'oro in rilievo,
 * come le lettere dell'insegna. E' disegno e basta: le regole e le categorie
 * del giorno le dice il foglio della "i".
 */
function Pancia() {
  return (
    <div className="slot-pancia" aria-hidden="true">
      <div className="slot-pancia__vetro">
        <span className="slot-pancia__raggi" />
        <svg className="slot-pancia__stella" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="slot-pancia-oro" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fffbe0" />
              <stop offset="0.45" stopColor="#ffd84a" />
              <stop offset="0.7" stopColor="#e89a10" />
              <stop offset="1" stopColor="#fff0a0" />
            </linearGradient>
          </defs>
          {[5, 3.5, 2].map((d) => (
            <polygon key={d} points={STELLA} transform={`translate(0 ${d})`} className="slot-pancia__spessore" />
          ))}
          <polygon points={STELLA} className="slot-pancia__faccia" />
        </svg>
      </div>
    </div>
  )
}

/** La domanda pronta ma non aperta: la categoria, quel che vale, e il Via. */
function Pronti({ categoria, vale, onVia }: { categoria: CategoriaQuiz; vale: number; onVia: () => void }) {
  const Icona = iconaDellaCategoria(categoria)
  return (
    <div className="slot-pronti" style={{ '--colore': coloreDellaCategoria(categoria) } as CSSProperties}>
      <span className="slot-pronti__icona">
        <Icona size={34} />
      </span>
      <p className="slot-pronti__titolo">Domanda: {NOMI_CATEGORIE[categoria]}</p>
      <p className="slot-pronti__palio">
        Giusta vale <span className="u-tabnum">{vale}</span> punti
      </p>
      <Button size="lg" onClick={onVia}>
        Via
      </Button>
    </div>
  )
}
