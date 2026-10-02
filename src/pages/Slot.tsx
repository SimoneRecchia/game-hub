import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi, type DatiAdesivo } from '@/components/Adesivo'
import { Button } from '@/components/Button'
import { IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { useToast } from '@/components/Toast'
import { Tabellone } from '@/games/fortuna/Tabellone'
import { useDopo } from '@/games/fortuna/useDopo'
import { centroDi, incassaMonete, puntaFiches } from '@/games/fortuna/voli'
import { coloreDellaCategoria, iconaDellaCategoria } from '@/games/ruota/disegni'
import { Intermezzo, PIOGGIA_MS, PioggiaDiMonete, type DatiIntermezzo } from '@/games/ruota/Intermezzo'
import { ComeSiGiocaSlot } from '@/games/slot/ComeSiGioca'
import { Leva } from '@/games/slot/Leva'
import { Rulli, type MetaRulli } from '@/games/slot/Rulli'
import { DefinizioniSlot, Simbolo } from '@/games/slot/simboli'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { suona } from '@/lib/suoni'
import { NOMI_CATEGORIE, type CategoriaQuiz } from '@shared/quiz'
import {
  INTERVALLO_SLOT_MS,
  PREMI,
  PUNTATA_MINIMA_SLOT,
  PUNTATE_SLOT,
  VINCITA_DOMANDA,
  lineaDi,
  righeDellaTripla,
  simboliVincenti,
} from '@shared/slot'
import type { GiroSlot, SlotStato } from '@shared/types'
import './Slot.css'

const DomandaRuota = lazy(() => import('@/games/ruota/DomandaRuota'))

type Fase = 'pronta' | 'gira' | 'paga' | 'tripla' | 'domanda'
type Luci = 'attesa' | 'gira' | 'vinto' | 'jackpot'

/** Da quanto in su una vincita ha l'adesivo: le ciliegie bastano nel display. */
const GRANDE = 20
/** Quanto si festeggia una vincita prima delle monete al saldo, e quanto una tripla prima della domanda. */
const FESTA_MS = 900
const TRIPLA_MS = 1_400
const ADESIVO_MS = 2_300
const RITORNO_MS = 650

/** Le monete che cadono nel vassoio, e poi volano al saldo: piu' vale la vincita, piu' sono. */
const moneteDi = (premio: number) => Math.min(24, Math.round(3 + Math.sqrt(premio) * 2))

/** Le caselle da accendere: i simboli che pagano sulla linea, o le tre della categoria. */
function vincentiDi(g: GiroSlot | null, tripla: boolean): Array<[number, number]> {
  if (!g) return []
  if (tripla && g.tripla) return righeDellaTripla(g.fermate, g.tripla.indice).map((riga, rullo) => [rullo, riga])
  return simboliVincenti(lineaDi(g.fermate)).map((rullo) => [rullo, 1])
}

function adesivoVincita(vincita: number, puntata: number, premio: number): Omit<DatiAdesivo, 'id'> {
  return {
    durata: ADESIVO_MS + 400,
    tono: 'vivace',
    titolo: premio >= PREMI['7'] ? 'JACKPOT!' : `Vinci ${vincita}!`,
    sotto: premio >= PREMI['7'] ? `${vincita} punti` : `${puntata} ×${premio}`,
    classe: 'ct-adesivo-vincita',
    suono: premio >= PREMI['7'] ? 'jackpot' : 'vincita',
  }
}

/**
 * La slot: si sceglie la puntata, si tira la leva, e i tre rulli girano e si
 * fermano uno dopo l'altro. La puntata si paga alla leva, e si vede: le fiches
 * volano dal saldo alla fessura del mobile, e il saldo scende. Quando il terzo
 * rullo si ferma, quel che paga si accende; le monete cadono nel vassoio e da
 * li' volano al saldo, che sale quando arriva la prima. Tre simboli della
 * stessa categoria, dovunque nella finestra, aprono una domanda: l'intermezzo
 * con la categoria, poi la domanda del quiz, e tornando alla slot la vincita.
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
  const [puntata, setPuntata] = useState<number | null>(null)
  const [inMoto, setInMoto] = useState(false)
  const [meta, setMeta] = useState<MetaRulli | null>(null)
  const [conto, setConto] = useState<{ saldo: number; netto: number; giri: number } | null>(null)
  const [vincenti, setVincenti] = useState<Array<[number, number]>>([])
  const [vincita, setVincita] = useState<number | null>(null)
  const [luci, setLuci] = useState<Luci>('attesa')
  const [vassoio, setVassoio] = useState(0)
  const [intermezzo, setIntermezzo] = useState<DatiIntermezzo | null>(null)
  const [pioggia, setPioggia] = useState(0)
  const [regole, setRegole] = useState(false)
  const [inviando, setInviando] = useState(false)
  /** Fra due giri passa un attimo: senza animazioni i rulli si fermano subito, e il server direbbe di no. */
  const [riposata, setRiposata] = useState(true)
  const { adesivo, accoda } = useCodaAdesivi()
  const saldoRef = useRef<HTMLSpanElement>(null)
  const feritoiaRef = useRef<HTMLSpanElement>(null)
  const vassoioRef = useRef<HTMLDivElement>(null)
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
  const massimo = Math.max(PUNTATA_MINIMA_SLOT, Math.min(PUNTATE_SLOT[PUNTATE_SLOT.length - 1], saldo))
  // La puntata resta quella di prima finché non la si cambia, come al tavolo; mai piu' del saldo.
  const scelta = Math.min(massimo, puntata ?? giro?.puntata ?? PUNTATA_MINIMA_SLOT)
  const puoGiocare = saldo >= PUNTATA_MINIMA_SLOT && fase === 'pronta' && !inMoto && riposata && !inviando

  /** La vincita che torna al saldo: le monete volano dal vassoio, e il tabellone si muove quando arriva la prima. */
  const incassa = (premio: number) => {
    const da = centroDi(vassoioRef.current)
    const a = centroDi(saldoRef.current)
    if (!da || !a) {
      setConto(null)
      return
    }
    void incassaMonete(da, a, moneteDi(premio), () => setConto(null)).then(() => setVassoio(0))
  }

  /* ───────────────────────────────  La leva  ─────────────────────────────── */

  const tira = async () => {
    if (!puoGiocare || !stato) return
    setFase('gira')
    setInMoto(true)
    setVincenti([])
    setVincita(null)
    setVassoio(0)
    setLuci('gira')
    setRiposata(false)
    const prima = stato.giro?.fermate ?? null
    // La puntata si paga adesso: il saldo scende, e le fiches volano nella fessura.
    setConto({ saldo: stato.saldo - scelta, netto: stato.netto - scelta, giri: stato.giri + 1 })
    const da = centroDi(saldoRef.current)
    const a = centroDi(feritoiaRef.current)
    if (da && a) void puntaFiches(da, a, scelta)
    const nuovo = await chiedi('/slot/gira', { puntata: scelta })
    if (!nuovo?.giro) {
      // I rulli tornano dov'erano, e il saldo com'era.
      setMeta({ fermate: prima ?? [0, 0, 0], chiave: `annulla${Date.now()}` })
      setConto(null)
      setFase('pronta')
      return
    }
    setStato(nuovo)
    setMeta({ fermate: nuovo.giro.fermate, chiave: `g${nuovo.giro.n}` })
  }

  /** Il terzo rullo si e' fermato: quel che paga si accende, le monete cadono, poi la domanda se c'e'. */
  const fermati = () => {
    setInMoto(false)
    const s = ultimo.current
    const g = s?.giro
    if (!s || !g || fase !== 'gira') {
      setConto(null)
      setLuci('attesa')
      return
    }
    const vinta = g.premio * g.puntata
    if (g.premio > 0) {
      setFase('paga')
      setVincenti(vincentiDi(g, false))
      setVincita(vinta)
      setVassoio(moneteDi(g.premio))
      setLuci(g.premio >= PREMI['7'] ? 'jackpot' : 'vinto')
      if (g.premio >= GRANDE) {
        accoda(adesivoVincita(vinta, g.puntata, g.premio))
        if (g.premio >= 100) {
          setPioggia((p) => p + 1)
          dopo(PIOGGIA_MS, () => setPioggia(0))
        }
      } else {
        suona('incasso')
        suona('incasso', { ritardo: 0.12 })
      }
      dopo(FESTA_MS, () => incassa(g.premio))
    } else {
      setConto(null)
    }
    if (g.tripla) {
      // La tripla dopo la linea, se ha pagato anche lei.
      dopo(g.premio > 0 ? FESTA_MS + 700 : 0, () => {
        setFase('tripla')
        setVincenti(vincentiDi(g, true))
        setLuci('vinto')
        suona('tripla')
        dopo(TRIPLA_MS, () => apriTripla(g.tripla!.categoria, g.vincitaDomanda ?? 0))
      })
      return
    }
    dopo(g.premio > 0 ? FESTA_MS + 900 : 0, () => {
      setFase('pronta')
      setLuci('attesa')
    })
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
    setVincenti([])
    if (g?.risposta?.giusta && g.vincitaDomanda) {
      const vale = g.vincitaDomanda
      const s = ultimo.current
      setConto(s ? { saldo: s.saldo - vale, netto: s.netto - vale, giri: s.giri } : null)
      dopo(RITORNO_MS, () => {
        setVincita(vale)
        setVassoio(moneteDi(VINCITA_DOMANDA))
        accoda(adesivoVincita(vale, g.puntata, VINCITA_DOMANDA))
        dopo(FESTA_MS, () => incassa(VINCITA_DOMANDA))
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
        {quanto && <Tabellone {...quanto} saldoRef={saldoRef} />}
        <div className={`slot-sala is-${luci}`}>
          <div className="slot-mobile">
            <Insegna luci={luci} />
            <TabellaBreve />
            <div className="slot-vetro">
              {stato ? (
                <Rulli
                  categorie={categorie}
                  inMoto={inMoto}
                  meta={meta}
                  vincenti={vincenti}
                  onFine={fermati}
                />
              ) : (
                <div className="slot-rulli is-attesa" />
              )}
              <span className="slot-vetro__linea" aria-hidden="true" />
              <span className="slot-vetro__freccia is-sinistra" aria-hidden="true" />
              <span className="slot-vetro__freccia is-destra" aria-hidden="true" />
            </div>
            <div className="slot-display" aria-live="polite">
              <span className="slot-display__voce">
                <span className="slot-display__etichetta">Puntata</span>
                <span className="slot-display__cifre u-tabnum">{scelta}</span>
              </span>
              <span className="slot-feritoia" ref={feritoiaRef} aria-hidden="true" />
              <span className={`slot-display__voce is-vincita${vincita ? ' is-accesa' : ''}`}>
                <span className="slot-display__etichetta">Vincita</span>
                <span className="slot-display__cifre u-tabnum" key={vincita ?? 0}>
                  {vincita ?? 0}
                </span>
              </span>
            </div>
            <div className="slot-comandi">
              <div className="slot-gettoni" role="radiogroup" aria-label="Puntata">
                {PUNTATE_SLOT.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={p === scelta}
                    className={`slot-gettone is-${p}${p === scelta ? ' is-scelto' : ''}`}
                    disabled={p > saldo || fase !== 'pronta' || inMoto}
                    onClick={() => {
                      suona('fiche', { volume: 0.6 })
                      setPuntata(p)
                    }}
                  >
                    <span className="u-tabnum">{p}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="slot-gira" disabled={!puoGiocare} onClick={() => void tira()}>
                Gira
              </button>
            </div>
            <div className="slot-vassoio" ref={vassoioRef} aria-hidden="true">
              {Array.from({ length: vassoio }, (_, i) => (
                <span key={i} className="slot-vassoio__moneta" style={{ '--i': i } as CSSProperties} />
              ))}
            </div>
          </div>
          <Leva attiva={puoGiocare} onTira={() => void tira()} />
          {intermezzo && (
            <Intermezzo dati={intermezzo} onMezzo={() => setFase('domanda')} onFine={() => setIntermezzo(null)} />
          )}
        </div>
        {stato && saldo < PUNTATA_MINIMA_SLOT && fase === 'pronta' && !inMoto && (
          <p className="slot-vuoto">Servono punti di oggi: gioca le classificate, poi torna qui.</p>
        )}
      </div>
      <Adesivo adesivo={adesivo} />
      {pioggia > 0 && <PioggiaDiMonete key={pioggia} />}
      <ComeSiGiocaSlot open={regole} onClose={() => setRegole(false)} categorie={categorie} />
    </Pagina>
  )
}

/** L'insegna in cima al mobile: le lampadine che corrono, e il nome. */
function Insegna({ luci }: { luci: Luci }) {
  return (
    <div className={`slot-insegna is-${luci}`} aria-hidden="true">
      <span className="slot-insegna__lampadine" />
      <span className="slot-insegna__nome">
        <span className="slot-insegna__sette">7</span>
        SLOT
        <span className="slot-insegna__sette">7</span>
      </span>
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
              <Simbolo key={i} codice={s} categorie={[]} />
            ))}
          </span>
          <span className="slot-tabella__valore u-tabnum">×{x}</span>
        </span>
      ))}
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
