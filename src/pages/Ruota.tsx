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
import { ComeSiGiocaRuota } from '@/games/ruota/ComeSiGioca'
import {
  DisegnoMoltiplicatori,
  DisegnoRuota,
  coloreDelMoltiplicatore,
  coloreDellaCategoria,
  iconaDellaCategoria,
} from '@/games/ruota/disegni'
import { VISTA } from '@/games/ruota/geometria'
import { Intermezzo, PIOGGIA_MS, PioggiaDiMonete, type DatiIntermezzo } from '@/games/ruota/Intermezzo'
import { LineaPuntata } from '@/games/ruota/LineaPuntata'
import { Moneta } from '@/games/ruota/Moneta'
import { RuotaFisica, type Meta, type Mozzo } from '@/games/ruota/RuotaFisica'
import { Tabellone } from '@/games/fortuna/Tabellone'
import { useDopo } from '@/games/fortuna/useDopo'
import { centroDi, incassaMonete, perdiFiches, puntaFiches, type Punto } from '@/games/fortuna/voli'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { suona } from '@/lib/suoni'
import { NOMI_CATEGORIE, type CategoriaQuiz } from '@shared/quiz'
import {
  INTERVALLO_GIRI_MS,
  MOLTIPLICATORI,
  NOME_CRAZY_TIME,
  PUNTATA_MINIMA,
  conSegno,
  scriviMoltiplicatore,
  spicchiDelGiorno,
} from '@shared/ruota'
import type { GiroRuota, RuotaStato } from '@shared/types'
import './Ruota.css'

const DomandaRuota = lazy(() => import('@/games/ruota/DomandaRuota'))

type NomeScena = 'ruota' | 'moltiplicatori' | 'moneta' | 'domanda'
type Luci = 'attesa' | 'vinto' | 'perso'

/** Quanto resta un adesivo, quanto festeggiano le luci prima del passaggio, quanto si guarda il moltiplicatore. */
const ADESIVO_MS = 2_300
const FESTA_LUCI_MS = 950
const RIVELA_MS = 2_000
/** La moneta caduta resta in vista, prima di tornare alla ruota: il lato uscito si deve vedere. */
const MONETA_IN_VISTA_MS = 2_700
/** Quanto resta l'invito a lanciare piu' forte. */
const DEBOLE_MS = 2_200
/** Quanto ci mette la ruota a tornare, dopo una domanda: le monete partono quando e' ferma. */
const RITORNO_MS = 720

/** Quante monete volano al saldo per una vincita: piu' vale il moltiplicatore, piu' sono. */
const moneteDi = (moltiplicatore: number) => Math.round(4 + moltiplicatore * 3)

/** Il centro del mozzo della ruota grande, sullo schermo: da li' partono e li' arrivano fiches e monete. */
function centroDelMozzo(): Punto | null {
  const el = document.querySelector('.ct-ruota.is-principale')
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0) return null
  return { x: r.left + (r.width * -VISTA.x) / VISTA.larghezza, y: r.top + (r.height * -VISTA.y) / VISTA.altezza }
}

/** La scena di un giro: la ruota, o il minigioco a cui e' arrivato. */
function scenaDi(giro: GiroRuota | null): NomeScena {
  const sfida = giro?.sfida
  if (!giro || giro.stato === 'fatto' || !sfida) return 'ruota'
  if (sfida.tipo === 'moneta') return 'moneta'
  return sfida.moltiplicatore === null ? 'moltiplicatori' : 'domanda'
}

/** Il moltiplicatore e la vincita del minigioco di un giro, quando ci sono. */
function palioDi(giro: GiroRuota | null): { moltiplicatore: number; vincita: number } | null {
  const s = giro?.sfida
  if (!s || s.moltiplicatore === null || s.vincita === null) return null
  return { moltiplicatore: s.moltiplicatore, vincita: s.vincita }
}

/**
 * Crazy Time: si punta, si trascina la ruota e la si lascia andare. La puntata
 * si paga al lancio, e si vede: le fiches volano dal saldo alla ruota, e il
 * saldo scende. Il banco se la tiene, e le fiches scivolano via; il triplo la
 * restituisce per tre; una domanda porta alla ruota dei moltiplicatori e poi
 * alla domanda; la moneta alla moneta da lanciare. Una vincita torna al saldo
 * in monete, che lo fanno salire quando arrivano. Ogni passaggio ha la sua
 * transizione, e finito il minigioco si torna alla ruota com'era, con l'esito
 * sul mozzo.
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
  const [intermezzo, setIntermezzo] = useState<(DatiIntermezzo & { verso: NomeScena }) | null>(null)
  /** La puntata scelta: finché non la si tocca e' quella del giro di prima. */
  const [puntata, setPuntata] = useState<number | null>(null)
  const [inviando, setInviando] = useState(false)
  // La ruota: dove fermarsi, se gira, le luci, e l'esito sul mozzo.
  const [fermaSu, setFermaSu] = useState<Meta | null>(null)
  const [inGioco, setInGioco] = useState<number | null>(null)
  const [annulla, setAnnulla] = useState(0)
  const [luci, setLuci] = useState<Luci>('attesa')
  const [esito, setEsito] = useState(false)
  /** Fra due giri passano tre secondi: senza animazioni la ruota si ferma subito, e il server direbbe di no. */
  const [riposata, setRiposata] = useState(true)
  const [debole, setDebole] = useState(false)
  // La ruota dei moltiplicatori.
  const [fermaSuM, setFermaSuM] = useState<Meta | null>(null)
  const [girandoM, setGirandoM] = useState(false)
  const [annullaM, setAnnullaM] = useState(0)
  const [luciM, setLuciM] = useState<Luci>('attesa')
  const [rivelato, setRivelato] = useState(false)
  // La moneta: mentre e' in aria il tabellone resta com'era, e il lato si dice quando cade.
  const [annullaMoneta, setAnnullaMoneta] = useState(0)
  const [conto, setConto] = useState<{ saldo: number; netto: number; giri: number } | null>(null)
  const [monetaCaduta, setMonetaCaduta] = useState(false)
  const [regole, setRegole] = useState(false)
  const [pioggia, setPioggia] = useState(0)
  const { adesivo, accoda } = useCodaAdesivi()
  // Il saldo sul tabellone: da li' partono le fiches e li' arrivano le monete.
  const saldoRef = useRef<HTMLSpanElement>(null)
  // Com'e' finita la domanda, da raccontare sulla ruota quando si torna: le monete al saldo, o le fiches al banco.
  const daRaccontare = useRef<{ vinto: boolean; moltiplicatore: number; puntata: number } | null>(null)
  // Lo stato di adesso, per chi lo legge a ruota ferma o a moneta caduta: arrivano dopo il disegno.
  const ultimo = useRef(stato)
  useEffect(() => {
    ultimo.current = stato
  })

  const leggi = useCallback(() => api<RuotaStato>('/ruota'), [])

  useEffect(() => {
    let vivo = true
    leggi()
      .then((s) => {
        if (!vivo) return
        const g = s.giro
        setStato(s)
        setScena(scenaDi(g))
        if (g) {
          setFermaSu({ indice: g.spicchio, chiave: `p${g.n}` })
          setEsito(g.stato === 'fatto')
          if (g.sfida?.tipo === 'domanda' && g.sfida.spicchioMoltiplicatore !== null) {
            setFermaSuM({ indice: g.sfida.spicchioMoltiplicatore, chiave: `m${g.n}` })
            setRivelato(true)
          }
        }
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

  /** L'esito di un minigioco: la vincita con le monete, o il banco. */
  const annuncia = (g: GiroRuota) => {
    const palio = palioDi(g)
    if (g.delta > 0 && palio) {
      accoda(adesivoVincita(palio.vincita, g.puntata, palio.moltiplicatore))
      setPioggia((p) => p + 1)
      dopo(PIOGGIA_MS, () => setPioggia(0))
    } else {
      accoda(adesivoBanco(g.puntata))
    }
  }

  const giro = stato?.giro ?? null
  const sfida = giro?.sfida ?? null
  const saldo = stato?.saldo ?? 0
  const numero = stato?.puzzleNumber ?? 1
  // Gli spicchi di oggi, con le categorie del giorno: cambiano solo con il giorno, e la ruota non si ridisegna.
  const spicchi = useMemo(() => spicchiDelGiorno(numero), [numero])
  const disegnoRuota = useMemo(() => <DisegnoRuota spicchi={spicchi} />, [spicchi])
  const puoGirare = saldo >= PUNTATA_MINIMA
  // Si punta quanto si vuole, dalla minima a tutto il saldo; finché non la si cambia, la puntata e' quella di prima.
  const scelta = Math.min(saldo, Math.max(PUNTATA_MINIMA, puntata ?? giro?.puntata ?? PUNTATA_MINIMA))
  const girando = inGioco !== null

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

  /* ───────────────────────────────  La ruota  ─────────────────────────────── */

  const lanciaRuota = async () => {
    setEsito(false)
    setDebole(false)
    setLuci('attesa')
    setInGioco(scelta)
    setRiposata(false)
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
    setStato(nuovo)
    setFermaSu({ indice: nuovo.giro.spicchio, chiave: `p${nuovo.giro.n}` })
  }

  const fermataRuota = () => {
    setInGioco(null)
    const g = ultimo.current?.giro
    if (!g) {
      setConto(null)
      return
    }
    const s = spicchi[g.spicchio]
    if (s.tipo === 'banco') {
      setConto(null)
      setEsito(true)
      setLuci('perso')
      accoda(adesivoBanco(g.puntata))
      const mozzo = centroDelMozzo()
      if (mozzo) perdiFiches(mozzo, g.puntata)
      dopo(1_700, () => setLuci('attesa'))
      return
    }
    if (s.tipo === 'fisso') {
      setEsito(true)
      setLuci('vinto')
      suona('bonus')
      accoda(adesivoVincita(g.delta + g.puntata, g.puntata, s.moltiplicatore))
      setPioggia((p) => p + 1)
      dopo(PIOGGIA_MS, () => setPioggia(0))
      incassa(s.moltiplicatore, centroDelMozzo())
      dopo(2_200, () => setLuci('attesa'))
      return
    }
    setConto(null)
    setLuci('vinto')
    suona('bonus')
    dopo(FESTA_LUCI_MS, () => {
      setLuci('attesa')
      setIntermezzo(
        s.tipo === 'moneta'
          ? {
              chiave: Date.now(),
              titolo: 'Moneta',
              sotto: 'Blu vinci, rosso vince il banco',
              colore: 'var(--ct-moneta)',
              icona: <MonetaPiccola />,
              verso: 'moneta',
            }
          : {
              chiave: Date.now(),
              titolo: NOMI_CATEGORIE[s.categoria],
              sotto: 'Gira i moltiplicatori',
              colore: coloreDellaCategoria(s.categoria),
              icona: <IconaCategoria categoria={s.categoria} />,
              verso: 'moltiplicatori',
            },
      )
    })
  }

  /* ───────────────────────────  I moltiplicatori  ──────────────────────────── */

  const lanciaMoltiplicatori = async () => {
    setGirandoM(true)
    setLuciM('attesa')
    setRivelato(false)
    const nuovo = await chiedi('/ruota/moltiplicatore')
    const s = nuovo?.giro?.sfida
    if (!nuovo?.giro || s?.tipo !== 'domanda' || s.spicchioMoltiplicatore === null) {
      setAnnullaM((a) => a + 1)
      setGirandoM(false)
      return
    }
    setStato(nuovo)
    setFermaSuM({ indice: s.spicchioMoltiplicatore, chiave: `m${nuovo.giro.n}` })
  }

  const apriDomanda = async () => {
    setScena('domanda')
    const nuovo = await chiedi('/ruota/domanda')
    if (nuovo) setStato(nuovo)
  }

  const fermataMoltiplicatori = () => {
    setGirandoM(false)
    setLuciM('vinto')
    setRivelato(true)
    suona('moltiplicatore')
    dopo(RIVELA_MS, () => {
      setLuciM('attesa')
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
    daRaccontare.current = { vinto, moltiplicatore: palio?.moltiplicatore ?? 1, puntata: g.puntata }
    setStato(nuovo)
    annuncia(g)
  }

  const allaRuota = () => {
    setScena('ruota')
    setEsito(true)
    setRivelato(false)
    const racconto = daRaccontare.current
    daRaccontare.current = null
    if (!racconto) return
    dopo(RITORNO_MS, () => {
      const mozzo = centroDelMozzo()
      if (racconto.vinto) incassa(racconto.moltiplicatore, mozzo)
      else if (mozzo) perdiFiches(mozzo, racconto.puntata)
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
    setStato(nuovo)
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
    if (g.delta > 0 && palio) incassa(palio.moltiplicatore, moneta)
    else {
      setConto(null)
      if (moneta) perdiFiches(moneta, g.puntata)
    }
    dopo(MONETA_IN_VISTA_MS, allaRuota)
  }

  /* ───────────────────────────────  La pagina  ─────────────────────────────── */

  const palio = palioDi(giro)
  // Sul mozzo: la puntata, poi la puntata in gioco, poi quel che e' tornato, o quel che si e' perso.
  const mozzo: Mozzo =
    inGioco !== null
      ? { testo: String(inGioco), sotto: 'in gioco' }
      : esito && giro?.stato === 'fatto'
        ? giro.delta > 0
          ? { testo: conSegno(giro.delta + giro.puntata), sotto: 'vinti', tono: 'piu' }
          : { testo: conSegno(-giro.puntata), sotto: 'persi', tono: 'meno' }
        : puoGirare
          ? { testo: String(scelta), sotto: 'puntata' }
          : { testo: String(saldo), sotto: 'saldo' }
  const mozzoM: Mozzo = rivelato && palio ? { testo: scriviMoltiplicatore(palio.moltiplicatore) } : { testo: '×?' }
  const prontaRuota = scena === 'ruota' && !intermezzo && puoGirare && !girando && riposata && !inviando
  const prontaM = scena === 'moltiplicatori' && !intermezzo && !girandoM && !rivelato && !inviando
  const categoria = sfida?.tipo === 'domanda' ? sfida.categoria : null
  const inDomanda = scena === 'domanda' && sfida?.tipo === 'domanda'

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
      {inDomanda && sfida?.tipo === 'domanda' && (
        <Suspense fallback={<div className="ct-attesa" aria-hidden="true" />}>
          {sfida.domanda ? (
            <DomandaRuota
              key={`${giro?.n}-${giro?.stato}`}
              sfida={sfida}
              inviando={inviando}
              onRispondi={(r) => void rispondi(r)}
              onTorna={allaRuota}
            />
          ) : inviando ? (
            <div className="ct-attesa" aria-hidden="true" />
          ) : (
            <Pronti categoria={sfida.categoria} vincita={sfida.vincita} onVia={() => void apriDomanda()} />
          )}
        </Suspense>
      )}
      {/* Durante la domanda il palco resta, nascosto: tornando, il tabellone e le ruote sono quelli di prima. */}
      <div className="ct" hidden={inDomanda}>
        {stato && (
          <Tabellone {...(conto ?? { saldo, netto: stato.netto, giri: stato.giri })} saldoRef={saldoRef} />
        )}
        <div className="ct-corpo">
          <div className={`ct-palco is-${scena}${luci === 'perso' ? ' is-scosso' : ''}`}>
            <span className="ct-palco__luce" aria-hidden="true" />
            <span className="ct-palco__scintille" aria-hidden="true" />
            <span className="ct-palco__insegna" aria-hidden="true">
              Crazy <span>Time</span>
            </span>
            {!stato ? (
              <div className="ct-palco__attesa" aria-hidden="true" />
            ) : (
              <>
                <Scena attiva={scena === 'ruota'} nome="ruota">
                  <RuotaFisica
                    spicchi={spicchi.length}
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
                    fiche={inGioco !== null}
                    invito={prontaRuota}
                    etichetta="La ruota: trascinala e lasciala andare per girarla"
                    classe="is-principale"
                  />
                </Scena>
                <Scena attiva={scena === 'moltiplicatori'} nome="moltiplicatori">
                  {categoria && <Cartello categoria={categoria} />}
                  <RuotaFisica
                    spicchi={MOLTIPLICATORI.length}
                    disegno={<DisegnoMoltiplicatori />}
                    fermaSu={fermaSuM}
                    pronta={prontaM}
                    onLancio={() => void lanciaMoltiplicatori()}
                    onFerma={fermataMoltiplicatori}
                    onDebole={() => setDebole(true)}
                    annulla={annullaM}
                    luci={luciM}
                    lampade={24}
                    durataMinima={2_800}
                    mozzo={mozzoM}
                    invito={prontaM}
                    etichetta="La ruota dei moltiplicatori: trascinala e lasciala andare"
                    classe="is-moltiplicatori"
                  />
                  {rivelato && palio && <Rivelazione {...palio} />}
                </Scena>
                <Scena attiva={scena === 'moneta'} nome="moneta">
                  {sfida?.tipo === 'moneta' && (
                    <Moneta
                      key={giro?.n}
                      moltiplicatore={sfida.moltiplicatore}
                      uscito={sfida.uscito}
                      lanciabile={scena === 'moneta' && !intermezzo && giro?.stato === 'sfida' && !inviando}
                      annulla={annullaMoneta}
                      onTocca={() => void lanciaMoneta()}
                      onCaduta={caduta}
                    />
                  )}
                </Scena>
              </>
            )}
            <Intermezzo
              dati={intermezzo}
              onMezzo={() => intermezzo && setScena(intermezzo.verso)}
              onFine={() => setIntermezzo(null)}
            />
          </div>

          <section className="ct-pannello" aria-live="polite">
            {errore ? (
              <p className="ct-nota">{errore}</p>
            ) : !stato ? null : scena === 'moltiplicatori' ? (
              <Indicazione titolo={rivelato && palio ? `In palio ${palio.vincita} punti` : 'Gira i moltiplicatori'}>
                {rivelato && palio
                  ? `${giro?.puntata} ${scriviMoltiplicatore(palio.moltiplicatore)}, se rispondi giusto`
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
            ) : !puoGirare ? (
              <PochiPunti saldo={saldo} onClassificate={() => vai(ROTTE.home)} />
            ) : (
              <>
                <LineaPuntata min={PUNTATA_MINIMA} max={saldo} valore={scelta} onChange={setPuntata} />
                <p className={`ct-suggerimento${debole ? ' is-debole' : ''}`}>
                  <ManoCheTrascina />
                  {girando
                    ? `${inGioco} punti in gioco`
                    : debole
                      ? 'Più forte: trascinala e lasciala andare'
                      : 'Trascina la ruota per girarla'}
                </p>
              </>
            )}
          </section>
        </div>
      </div>

      <Adesivo adesivo={adesivo} />
      {pioggia > 0 && <PioggiaDiMonete key={pioggia} />}
      <ComeSiGiocaRuota open={regole} onClose={() => setRegole(false)} numero={numero} />
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


/** Il cartello sopra la ruota dei moltiplicatori: di che categoria sara' la domanda. */
function Cartello({ categoria }: { categoria: CategoriaQuiz }) {
  return (
    <p className="ct-cartello" style={{ '--colore': coloreDellaCategoria(categoria) } as CSSProperties}>
      <IconaCategoria categoria={categoria} piccola />
      Domanda: {NOMI_CATEGORIE[categoria]}
    </p>
  )
}

/** Il moltiplicatore uscito, che salta fuori dalla ruota con quel che mette in palio. */
function Rivelazione({ moltiplicatore, vincita }: { moltiplicatore: number; vincita: number }) {
  return (
    <div
      className="ct-rivela"
      style={{ '--colore': coloreDelMoltiplicatore(moltiplicatore) } as CSSProperties}
      aria-hidden="true"
    >
      <span className="ct-rivela__raggi" />
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
