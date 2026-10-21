import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useAdesivo } from '@/components/Adesivo'
import { Button } from '@/components/Button'
import { Coriandoli, Numero } from '@/components/Elementi'
import { IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { useToast } from '@/components/Toast'
import { PochiPunti } from '@/games/fortuna/Avvisi'
import { SALA, useSala } from '@/games/fortuna/sala'
import { Tabellone } from '@/games/fortuna/Tabellone'
import { ComeSiGiocaEnalotto } from '@/games/superenalotto/ComeSiGioca'
import Diretta from '@/games/superenalotto/Diretta'
import { casuali, coloreDellaPallina } from '@/games/superenalotto/palline'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { frecceDelGruppo } from '@/lib/gruppo'
import { suona } from '@/lib/suoni'
import {
  COSTI,
  ESTRATTI,
  GIOCATE,
  GIORNI_ESTRAZIONE,
  NUMERI,
  PRIMO_CONCORSO,
  SCHEDE_MASSIME,
  costoDi,
  presiDi,
  type GiocataEnalotto,
} from '@shared/superenalotto'
import type { ConcorsoEnalottoVista, SchedaEnalotto, VistaEnalotto } from '@shared/types'
import './SuperEnalotto.css'

/** La diretta si apre da sola un minuto prima, per chi ha la pagina aperta. */
const PRIMA_DELLA_DIRETTA_MS = 60_000

/** Quanto costa la scheda piu' economica: sotto, non si gioca. */
const COSTO_MINIMO = Math.min(...GIOCATE.map((g) => COSTI[g]))

/** I risultati di un concorso gia' guardati: la pagina non li ripropone a ogni apertura. */
const VISTO = 'enalotto-visto'

const dataLunga = (data: string) =>
  new Date(`${data}T12:00:00Z`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

const punti = (n: number) => n.toLocaleString('it-IT')

/** Il numero del concorso: quante estrazioni ci sono state dal primo, questa compresa. */
function numeroConcorso(data: string): number {
  let n = 0
  const d = new Date(`${PRIMO_CONCORSO}T12:00:00Z`)
  while (d.toISOString().slice(0, 10) <= data) {
    if (GIORNI_ESTRAZIONE.includes(d.getUTCDay())) n += 1
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return Math.max(1, n)
}

function durata(ms: number): string {
  const min = Math.max(0, Math.ceil(ms / 60_000))
  if (min < 60) return `${min} min`
  const ore = Math.floor(min / 60)
  if (ore < 24) return `${ore} h ${min % 60} min`
  const giorni = Math.round(ore / 24)
  return giorni === 1 ? 'un giorno' : `${giorni} giorni`
}

const conto = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`

function leggiVisto(): string | null {
  try {
    return localStorage.getItem(VISTO)
  } catch {
    return null
  }
}

function segnaVisto(data: string) {
  try {
    localStorage.setItem(VISTO, data)
  } catch {
    /* li ripropone, e basta */
  }
}

/**
 * Il SuperEnalotto, come nel mockup: in cima il saldo e quel che si e' giocato,
 * la striscia del jackpot, la schedina di carta, "Gioca la scheda", le cinque
 * schede del concorso e il bottone dell'estrazione. Fra la chiusura delle 21 e
 * la fine della diretta, e dopo, la schedina lascia il posto all'estrazione: i
 * numeri, le proprie schede e i premi.
 *
 * I momenti del concorso arrivano dal server come distanze dalla sua ora
 * (`chiusuraFra`, `inizioFra`, `fineFra`): sommati all'ora del telefono di
 * quando e' arrivata la risposta, tengono la pagina sull'orologio del server.
 * A ognuno di quei momenti la pagina rilegge lo stato: alla chiusura, quando
 * comincia la diretta (i numeri), e quando finisce (i premi).
 */
export default function SuperEnalotto() {
  useSala()
  const { vai } = useNavigazione()
  const toast = useToast()
  const [vista, setVista] = useState<VistaEnalotto | null>(null)
  const [arrivata, setArrivata] = useState(0)
  const [errore, setErrore] = useState<string | null>(null)
  const [regole, setRegole] = useState(false)
  const [inviando, setInviando] = useState(false)
  const [diretta, setDiretta] = useState<{ replica: boolean; inizio: number } | null>(null)
  /** I risultati dell'ultima estrazione al posto della schedina: dopo la diretta, o chiesti. */
  const [risultati, setRisultati] = useState(false)
  const [nuova, setNuova] = useState<string | null>(null)
  const chiusaDa = useRef<string | null>(null)
  const saldoRef = useRef<HTMLSpanElement>(null)
  const [adesso, setAdesso] = useState(() => Date.now())
  const { adesivo, mostra } = useAdesivo()
  const [festa, setFesta] = useState(false)

  const prendi = useCallback((v: VistaEnalotto) => {
    setVista(v)
    setArrivata(Date.now())
  }, [])

  const leggi = useCallback(
    () =>
      api<VistaEnalotto>('/superenalotto')
        .then(prendi)
        .catch((e) => setErrore(e instanceof ApiFetchError ? e.message : 'Non riesco a caricare il SuperEnalotto.')),
    [prendi],
  )

  useEffect(() => {
    void leggi()
  }, [leggi])

  // L'orologio della pagina, per i conti alla rovescia.
  useEffect(() => {
    const id = window.setInterval(() => setAdesso(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // Rilegge a ogni momento del concorso: la chiusura, l'inizio e la fine della diretta.
  useEffect(() => {
    if (!vista) return
    const momenti = [vista.aperto?.chiusuraFra, vista.ultimo?.inizioFra, vista.ultimo?.fineFra]
      .filter((x): x is number => x !== undefined && x > 0)
      .map((x) => x + 700)
    if (momenti.length === 0) return
    const fra = Math.min(...momenti) - (Date.now() - arrivata)
    const id = window.setTimeout(() => void leggi(), Math.max(500, Math.min(fra, 2 ** 31 - 1)))
    return () => window.clearTimeout(id)
  }, [vista, arrivata, leggi])

  // La diretta si apre da sola a chi ha la pagina aperta, una volta per estrazione.
  const ultimo = vista?.ultimo ?? null
  const inizioUltimo = ultimo ? arrivata + ultimo.inizioFra : 0
  const fineUltimo = ultimo ? arrivata + ultimo.fineFra : 0
  useEffect(() => {
    if (!ultimo || diretta || chiusaDa.current === ultimo.data) return
    if (adesso >= inizioUltimo - PRIMA_DELLA_DIRETTA_MS && adesso < fineUltimo + 20_000) {
      setDiretta({ replica: false, inizio: inizioUltimo })
    }
  }, [ultimo, diretta, adesso, inizioUltimo, fineUltimo])

  // Chi aveva schede nell'ultima estrazione, pagata, ne trova i risultati la prima volta che torna.
  const daVedere = ultimo && ultimo.premi && ultimo.mie.length > 0 ? ultimo.data : null
  useEffect(() => {
    if (daVedere && leggiVisto() !== daVedere) setRisultati(true)
  }, [daVedere])

  const gioca = async (numeri: number[]): Promise<boolean> => {
    if (inviando) return false
    setInviando(true)
    try {
      const v = await api<VistaEnalotto>('/superenalotto/schede', { method: 'POST', body: { schede: [numeri] } })
      dimentica('/fortuna')
      const prima = new Set(vista?.aperto?.mie.map((s) => s.id) ?? [])
      setNuova(v.aperto?.mie.find((s) => !prima.has(s.id))?.id ?? null)
      prendi(v)
      return true
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'La scheda non è passata: riprova.', 'error')
      void leggi()
      return false
    } finally {
      setInviando(false)
    }
  }

  const testa = (sotto?: string) => ({
    titolo: 'SuperEnalotto',
    sotto,
    intera: true,
    indietro: { a: ROTTE.fortuna, etichetta: 'Fortuna' },
    azioni: (
      <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
        <IconInfo size={21} />
      </BottoneBarra>
    ),
  })

  if (errore && !vista) {
    return (
      <Pagina {...testa()}>
        <div className={`se-errore ${SALA}`}>
          <p>{errore}</p>
          <Button onClick={() => vai(ROTTE.fortuna)}>Torna alla Fortuna</Button>
        </div>
      </Pagina>
    )
  }

  const aperto = vista?.aperto ?? null
  const puntato = aperto?.mie.reduce((s, x) => s + costoDi(x.numeri), 0) ?? 0
  /** Si potrebbe ancora giocare una scheda, ma il saldo non la paga: lo dicono il tabellone e la schedina. */
  const senzaSaldo = !!vista && !!aperto && aperto.mie.length < SCHEDE_MASSIME && vista.saldo < COSTO_MINIMO
  const tempoDi = (fra: number) => arrivata + fra - adesso
  /** La schedina, o l'estrazione: quella chiusa che aspetta la diretta, o i risultati chiesti. */
  const estrazione = vista && ultimo && (!aperto || (risultati && ultimo.premi)) ? ultimo : null
  const mostrato = estrazione ?? aperto
  const apriDiretta = () => ultimo && setDiretta({ replica: false, inizio: inizioUltimo })
  /**
   * La diretta lascia il posto ai risultati: quando la si lascia, o quando
   * arriva in fondo da sola. In fondo a quella vera, com'e' andata lo dice un
   * adesivo, come nel mockup; la replica non lo ridice.
   */
  const chiudiDiretta = (finita: boolean) => {
    if (!ultimo || !diretta) return
    chiusaDa.current = ultimo.data
    setDiretta(null)
    // Finita la diretta, i premi: la pagina mostra l'estrazione, non la schedina.
    if (!diretta.replica) setRisultati(true)
    if (finita && !diretta.replica && ultimo.mie.length > 0) {
      const vinto = ultimo.mie.reduce((s, x) => s + (x.vincita ?? 0), 0)
      const presi = ultimo.estratti ? Math.max(0, ...ultimo.mie.map((x) => presiDi(x.numeri, ultimo.estratti!))) : 0
      if (vinto > 0) {
        mostra({
          tono: 'vivace',
          titolo: presi >= 4 ? 'Jackpot!' : `${PRESI[presi] ?? presi} numeri!`,
          sotto: `+${punti(vinto)}`,
          colore: 'linear-gradient(180deg, #ffe27a, #ffc93c)',
          durata: 2200,
        })
        setFesta(true)
        window.setTimeout(() => setFesta(false), 3200)
      } else {
        mostra({ tono: 'bordato', titolo: 'Niente, stavolta', sotto: 'Il jackpot cresce', colore: '#e5383b', durata: 1900 })
      }
    }
    void leggi()
  }
  const allaSchedina = () => {
    if (ultimo) segnaVisto(ultimo.data)
    setRisultati(false)
  }

  return (
    <Pagina {...testa(mostrato ? `Concorso n° ${numeroConcorso(mostrato.data)}` : undefined)}>
      <div className={`se ${SALA}${diretta ? ' is-diretta' : ''}`}>
        {vista && (
          <Tabellone
            saldo={vista.saldo}
            puntata={estrazione ? estrazione.mie.reduce((s, x) => s + costoDi(x.numeri), 0) : puntato}
            saldoRef={saldoRef}
            scarso={senzaSaldo && !estrazione}
            riga
            etichetta="Giocato"
          />
        )}

        {!vista && <div className="se-attesa" aria-hidden="true" />}

        {vista && diretta && ultimo && (
          <Diretta
            data={ultimo.data}
            numero={numeroConcorso(ultimo.data)}
            inizio={diretta.inizio}
            estratti={ultimo.estratti}
            mie={ultimo.mie}
            premi={diretta.replica || ultimo.premi ? ultimo.premi : null}
            replica={diretta.replica}
            onChiudi={chiudiDiretta}
          />
        )}

        {vista && !diretta && estrazione && (
          <>
            {!estrazione.premi && <Jackpot concorso={estrazione} oggi={vista.date} />}
            <Estrazione
              key={estrazione.data}
              concorso={estrazione}
              oggi={vista.date}
              tempoDi={tempoDi}
              prossimo={aperto ? numeroConcorso(aperto.data) : null}
              onDiretta={apriDiretta}
              onRivedi={() => setDiretta({ replica: true, inizio: Date.now() + 3000 })}
              onProssimo={allaSchedina}
            />
          </>
        )}

        {vista && !diretta && aperto && !estrazione && (
          <>
            <Jackpot concorso={aperto} oggi={vista.date} />
            <Schedina
              concorso={aperto}
              saldo={vista.saldo}
              inviando={inviando}
              senzaSaldo={senzaSaldo}
              onGioca={gioca}
            />
            <Foglietti mie={aperto.mie} nuova={nuova} />
            <button type="button" className="se-vai" disabled>
              {aperto.mie.length === 0
                ? 'Gioca una scheda per l’estrazione'
                : `Estrazione fra ${durata(tempoDi(aperto.inizioFra))}`}
            </button>
            {ultimo?.premi && (
              <button type="button" className="se-ultima" onClick={() => setRisultati(true)}>
                I numeri di {dataLunga(ultimo.data)}
              </button>
            )}
          </>
        )}
      </div>

      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
      <ComeSiGiocaEnalotto open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

/** La striscia del jackpot, in una riga: quanto vale e quando si estrae. */
function Jackpot({ concorso, oggi }: { concorso: ConcorsoEnalottoVista; oggi: string }) {
  const primo = useRef(concorso.jackpot)
  return (
    <section className="se-jackpot" aria-label="Jackpot">
      <span className="se-jackpot__luci" aria-hidden="true" />
      <span className="se-jackpot__etichetta">Jackpot</span>
      <span className="se-jackpot__cifra u-tabnum">
        <Numero valore={concorso.jackpot} da={primo.current} />
      </span>
      <span className="se-jackpot__quando">
        {concorso.data === oggi ? 'stasera' : dataLunga(concorso.data)} · alle 21:05
      </span>
    </section>
  )
}

/** La giocata scelta l'ultima volta, che la schedina ripropone. */
function leggiGiocata(): GiocataEnalotto {
  try {
    return localStorage.getItem('enalotto-giocata') === '5' ? 5 : 4
  } catch {
    return 4
  }
}

/**
 * La schedina di carta: "Schedina" stampato in rosso e le due giocate in una
 * capsula, quattro numeri o il "4+1"; le novanta caselle stampate in rosso,
 * dieci per riga come sulla schedina vera, che si segnano con una croce di
 * penna blu; in fondo quanti numeri mancano, "A caso" e "Cancella". Sotto, il
 * bottone che la gioca.
 *
 * Una giocata che il saldo non paga non si sceglie: con quindici punti il 4+1
 * e' spento, e la schedina passa ai quattro numeri. Senza i punti per nessuna
 * delle due la schedina si spegne, e al posto del bottone c'e' l'avviso.
 */
function Schedina({
  concorso,
  saldo,
  inviando,
  senzaSaldo,
  onGioca,
}: {
  concorso: ConcorsoEnalottoVista
  saldo: number
  inviando: boolean
  senzaSaldo: boolean
  onGioca: (numeri: number[]) => Promise<boolean>
}) {
  const [segnati, setScelti] = useState<number[]>([])
  const [voluta, setVoluta] = useState<GiocataEnalotto>(leggiGiocata)
  const [scossa, setScossa] = useState(0)
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const mescola = useRef(0)
  const rimaste = SCHEDE_MASSIME - concorso.mie.length
  /** La giocata scelta, o la piu' ricca che il saldo paga. */
  const giocata = COSTI[voluta] <= saldo ? voluta : (GIOCATE.filter((g) => COSTI[g] <= saldo).at(-1) ?? voluta)
  // Passando ai quattro numeri perche' il saldo e' sceso, il quinto segnato se ne va.
  const scelti = segnati.length > giocata ? segnati.slice(0, giocata) : segnati
  const costo = COSTI[giocata]
  const pochi = saldo < costo
  const puo = rimaste > 0 && !pochi && !inviando
  const spenta = rimaste <= 0 || pochi

  const metti = (x: number[]) => {
    setScelti(x)
    setMessaggio(null)
  }

  const scegliGiocata = (g: GiocataEnalotto) => {
    if (g === giocata) return
    mescola.current += 1
    setVoluta(g)
    // Passando a quattro, il quinto numero segnato se ne va.
    metti(scelti.slice(0, g))
    suona('tocco')
    try {
      localStorage.setItem('enalotto-giocata', String(g))
    } catch {
      /* resta per questa volta */
    }
  }

  const tocca = (n: number) => {
    if (!puo) return
    if (scelti.includes(n)) {
      metti(scelti.filter((x) => x !== n))
      suona('tocco')
    } else if (scelti.length < giocata) {
      metti([...scelti, n])
      suona('tocco', { volume: 1.2 })
    } else {
      setScossa((x) => x + 1)
      setMessaggio(giocata === 4 ? 'Quattro numeri: togline uno' : 'Cinque numeri: togline uno')
      suona('tetto')
    }
  }

  // A caso: le croci saltano qua e la' per un attimo, poi si fermano sui numeri della giocata.
  const casuale = () => {
    if (!puo) return
    const giro = ++mescola.current
    const finale = casuali(giocata)
    let volte = 0
    const passo = () => {
      if (giro !== mescola.current) return
      volte += 1
      if (volte < 7) {
        metti(casuali(giocata))
        suona('tocco', { volume: 0.6 })
        window.setTimeout(passo, 70)
      } else {
        metti(finale)
        suona('fiche')
      }
    }
    passo()
  }

  const conferma = async () => {
    if (scelti.length !== giocata || !puo) return
    mescola.current += 1
    if (await onGioca([...scelti].sort((a, b) => a - b))) {
      suona('posa')
      metti([])
    }
  }

  const mancano = giocata - scelti.length
  const conta =
    rimaste <= 0
      ? 'Cinque schede: si gioca'
      : (messaggio ??
        (mancano === 0 ? 'Pronta da giocare' : `Segna ancora ${mancano === 1 ? 'un numero' : `${mancano} numeri`}`))
  const pronta = puo && mancano === 0
  return (
    <>
      <section
        className={`se-schedina${spenta ? ' is-spenta' : ''}${scossa ? ` is-scossa-${scossa % 2}` : ''}`}
        aria-label="La schedina"
      >
        <header className="se-schedina__testa">
          <span className="se-schedina__marca">Schedina</span>
          <span className="se-giocate" role="radiogroup" aria-label="La giocata" onKeyDown={frecceDelGruppo}>
            {GIOCATE.map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={giocata === g}
                tabIndex={giocata === g ? 0 : -1}
                className={`se-giocata${giocata === g ? ' is-scelta' : ''}`}
                disabled={!puo || COSTI[g] > saldo}
                onClick={() => scegliGiocata(g)}
              >
                {g === 4 ? '4 numeri' : '4+1'} · <span className="u-tabnum">{COSTI[g]}</span>
              </button>
            ))}
          </span>
        </header>
        <div className="se-griglia" role="group" aria-label="I novanta numeri">
          {Array.from({ length: NUMERI }, (_, i) => i + 1).map((n) => {
            const segnato = scelti.includes(n)
            return (
              <button
                key={n}
                type="button"
                className={`se-casella${segnato ? ' is-segnata' : ''}`}
                aria-pressed={segnato}
                aria-label={`Numero ${n}`}
                disabled={!puo}
                onClick={() => tocca(n)}
              >
                <span className="se-casella__n u-tabnum">{n}</span>
                <svg className="se-casella__croce" viewBox="0 0 30 30" aria-hidden="true">
                  <path className="se-casella__tratto" d="M6 7L24 23" />
                  <path className="se-casella__tratto is-secondo" d="M24 6L7 24" />
                </svg>
              </button>
            )
          })}
        </div>
        <div className="se-schedina__piede">
          <span className="se-schedina__conta" aria-live="polite">
            {conta}
          </span>
          <button type="button" className="se-piccolo" onClick={casuale} disabled={!puo}>
            A caso
          </button>
          <button
            type="button"
            className="se-piccolo"
            onClick={() => metti([])}
            disabled={!puo || scelti.length === 0}
          >
            Cancella
          </button>
        </div>
      </section>
      {senzaSaldo ? (
        <PochiPunti
          servono={COSTO_MINIMO}
          saldo={saldo}
          titolo={`Una scheda costa ${COSTO_MINIMO} punti`}
          className="se-pochi"
        />
      ) : (
        <button
          type="button"
          className={`se-gioca${pronta ? ' is-pronta' : ''}`}
          disabled={!pronta}
          onClick={() => void conferma()}
        >
          {rimaste <= 0 ? `Hai giocato ${SCHEDE_MASSIME} schede` : `Gioca la scheda · ${costo}`}
        </button>
      )}
    </>
  )
}

/** Le cinque schede del concorso: quelle giocate, con il timbro, e i posti tratteggiati delle altre. */
function Foglietti({ mie, nuova }: { mie: SchedaEnalotto[]; nuova: string | null }) {
  const due = (n: number) => String(n).padStart(2, '0')
  return (
    <ol className="se-schede" aria-label="Le schede giocate">
      {Array.from({ length: SCHEDE_MASSIME }, (_, i) => {
        const s = mie[i]
        if (!s) {
          return (
            <li key={`vuota-${i}`} className="se-foglietto is-vuoto" aria-hidden="true">
              {i + 1}
            </li>
          )
        }
        return (
          <li
            key={s.id}
            className={`se-foglietto${s.id === nuova ? ' is-nuovo' : ''}`}
            style={{ '--giro': `${[-4, 3, -2, 4, -3][i]}deg` } as CSSProperties}
            aria-label={`Scheda ${i + 1}: ${s.numeri.join(', ')}`}
          >
            <span className="se-foglietto__tipo">{s.numeri.length > ESTRATTI ? '4+1' : 'Quattro'}</span>
            <span className="se-foglietto__mano">{s.numeri.slice(0, 3).map(due).join(' ')}</span>
            <span className="se-foglietto__mano">{s.numeri.slice(3).map(due).join(' ')}</span>
            <span className="se-foglietto__timbro" aria-hidden="true">
              Giocata
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Una pallina estratta, piatta come nel mockup: il colore del suo quarto d'urna e il numero nel tondo. */
function PallinaPiatta({ n, i }: { n: number | null; i: number }) {
  return (
    <span
      className={`se-ri-pallina${n === null ? ' is-vuota' : ''}`}
      style={{ '--pallina': n === null ? undefined : coloreDellaPallina(n), '--i': i } as CSSProperties}
    >
      <span className="u-tabnum">{n ?? '?'}</span>
    </span>
  )
}

const NOMI_CATEGORIE: Record<number, string> = { 4: 'Quattro numeri', 3: 'Tre numeri', 2: 'Due numeri' }
const PRESI: Record<number, string> = { 2: 'Due', 3: 'Tre', 4: 'Quattro' }

/**
 * L'estrazione al posto della schedina: i quattro numeri, le proprie schede con
 * quel che hanno preso, i premi del concorso e il jackpot che passa. Prima della
 * diretta i numeri sono punti di domanda, e il bottone apre la diretta.
 */
function Estrazione({
  concorso,
  oggi,
  tempoDi,
  prossimo,
  onDiretta,
  onRivedi,
  onProssimo,
}: {
  concorso: NonNullable<VistaEnalotto['ultimo']>
  oggi: string
  tempoDi: (fra: number) => number
  prossimo: number | null
  onDiretta: () => void
  onRivedi: () => void
  onProssimo: () => void
}) {
  const { estratti, premi } = concorso
  const prima = tempoDi(concorso.inizioFra) > 0
  const finita = tempoDi(concorso.fineFra) <= 0 && !!premi
  const visti = finita ? estratti : null
  const quando =
    concorso.data === oggi
      ? 'stasera'
      : new Date(`${concorso.data}T12:00:00Z`).toLocaleDateString('it-IT', { weekday: 'long', timeZone: 'UTC' })
  return (
    <div className="se-riepilogo">
      <section className="se-ri-estratti" aria-label="I numeri estratti">
        <span className="se-ri-et">{prima ? `L’estrazione di ${quando}` : `I numeri di ${quando}`}</span>
        <span className="se-ri-palline">
          {Array.from({ length: ESTRATTI }, (_, i) => (
            <PallinaPiatta key={i} n={visti?.[i] ?? null} i={i} />
          ))}
        </span>
        {!finita && (
          <span className="se-ri-quando u-tabnum">
            {prima
              ? `Gioco chiuso · la diretta comincia fra ${conto(Math.ceil(tempoDi(concorso.inizioFra) / 1000))}`
              : 'In diretta adesso'}
          </span>
        )}
      </section>

      <section className="se-ri-carta">
        <h2 className="se-ri-titolo">Le tue schede</h2>
        {concorso.mie.length === 0 ? (
          <p className="se-ri-vuoto">Non hai giocato questo concorso.</p>
        ) : (
          concorso.mie.map((s) => {
            const presi = visti ? presiDi(s.numeri, visti) : null
            const vinta = (s.vincita ?? 0) > 0
            return (
              <div key={s.id} className="se-ri-riga">
                <span className="se-ri-numeri">
                  {s.numeri.map((n) => (
                    <span key={n} className={`se-ri-n u-tabnum${visti?.includes(n) ? ' is-preso' : ''}`}>
                      {n}
                    </span>
                  ))}
                </span>
                <span className={`se-ri-esito${vinta ? ' is-vinta' : ''}`}>
                  {presi === null
                    ? `${costoDi(s.numeri)} punti`
                    : vinta
                      ? `${PRESI[presi] ?? presi} · +${punti(s.vincita ?? 0)}`
                      : presi === 0
                        ? 'Niente'
                        : presi === 1
                          ? 'Uno solo'
                          : `${PRESI[presi]} · 0`}
                </span>
              </div>
            )
          })
        )}
      </section>

      {finita && premi && (
        <section className="se-ri-carta">
          <h2 className="se-ri-titolo">I premi del concorso</h2>
          {premi.map((p) => (
            <div key={p.categoria} className="se-ri-riga">
              <span className="se-ri-cat">{NOMI_CATEGORIE[p.categoria]}</span>
              <span className="se-ri-vinc">
                {p.vincitori === 0 ? 'Nessuno' : p.vincitori === 1 ? '1 vincitore' : `${p.vincitori} vincitori`}
              </span>
              <span className="se-ri-premio u-tabnum">
                {p.vincitori === 0 ? 'Al jackpot' : `${punti(p.premio)} a testa`}
              </span>
            </div>
          ))}
          {concorso.prossimoJackpot !== null && (
            <p className="se-ri-jackpot">
              {prossimo ? `Jackpot del concorso n° ${prossimo}: ` : 'Il jackpot passa a '}
              <span className="u-tabnum">{punti(concorso.prossimoJackpot)}</span>
            </p>
          )}
        </section>
      )}

      <div className="se-ri-comandi">
        {finita ? (
          <>
            <button type="button" className="se-ri-rivedi" onClick={onRivedi}>
              Rivedi l’estrazione
            </button>
            {prossimo !== null && (
              <button type="button" className="se-ri-nuovo" onClick={onProssimo}>
                Concorso n° {prossimo}
              </button>
            )}
          </>
        ) : (
          <button type="button" className="se-ri-nuovo is-diretta" onClick={onDiretta}>
            {prima ? 'Apri la diretta' : 'Guarda la diretta'}
          </button>
        )}
      </div>
    </div>
  )
}
