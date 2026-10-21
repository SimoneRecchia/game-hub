import { Suspense, lazy, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Numero } from '@/components/Elementi'
import { IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { useToast } from '@/components/Toast'
import { PochiPunti } from '@/games/fortuna/Avvisi'
import { SALA, useSala } from '@/games/fortuna/sala'
import { Tabellone } from '@/games/fortuna/Tabellone'
import { giornoEstrazione } from '@/games/stato'
import { ComeSiGiocaEnalotto } from '@/games/superenalotto/ComeSiGioca'
import { Pallina } from '@/games/superenalotto/Pallina'
import { casuali } from '@/games/superenalotto/palline'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { frecceDelGruppo } from '@/lib/gruppo'
import { suona } from '@/lib/suoni'
import {
  COSTI,
  ESTRATTI,
  GIOCATE,
  NUMERI,
  SCHEDE_MASSIME,
  costoDi,
  presiDi,
  type GiocataEnalotto,
} from '@shared/superenalotto'
import type { ConcorsoEnalottoVista, SchedaEnalotto, VistaEnalotto } from '@shared/types'
import './SuperEnalotto.css'

const Diretta = lazy(() => import('@/games/superenalotto/Diretta'))

/** La diretta si apre da sola un minuto prima, per chi ha la pagina aperta. */
const PRIMA_DELLA_DIRETTA_MS = 60_000

/** Quanto costa la scheda piu' economica: sotto, non si gioca. */
const COSTO_MINIMO = Math.min(...GIOCATE.map((g) => COSTI[g]))

const dataLunga = (data: string) =>
  new Date(`${data}T12:00:00Z`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

function durata(ms: number): string {
  const min = Math.max(0, Math.ceil(ms / 60_000))
  if (min < 60) return `${min} min`
  const ore = Math.floor(min / 60)
  if (ore < 24) return `${ore} h ${min % 60} min`
  const giorni = Math.round(ore / 24)
  return giorni === 1 ? 'un giorno' : `${giorni} giorni`
}

const conto = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`

/**
 * Il SuperEnalotto: il jackpot del concorso aperto, la schedina da segnare,
 * le schede giocate e l'ultima estrazione con i suoi premi. Alle 21:05 dei
 * giorni di estrazione, a chi ha la pagina aperta, si apre la diretta.
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
  const chiusaDa = useRef<string | null>(null)
  const saldoRef = useRef<HTMLSpanElement>(null)
  const [adesso, setAdesso] = useState(() => Date.now())

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

  // Il prossimo concorso si apre a fine diretta: finche' la pagina non ha riletto, i numeri sono quelli di prima.
  const prossimoFra = vista?.aperto?.chiusuraFra ?? null

  const gioca = async (numeri: number[]): Promise<boolean> => {
    if (inviando) return false
    setInviando(true)
    try {
      const v = await api<VistaEnalotto>('/superenalotto/schede', { method: 'POST', body: { schede: [numeri] } })
      dimentica('/fortuna')
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

  if (errore && !vista) {
    return (
      <Pagina titolo="SuperEnalotto" indietro={{ a: ROTTE.fortuna, etichetta: 'Fortuna' }}>
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

  return (
    <Pagina
      titolo="SuperEnalotto"
      indietro={{ a: ROTTE.fortuna, etichetta: 'Fortuna' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      <div className={`se ${SALA}`}>
        {vista && (
          <Tabellone
            saldo={vista.saldo}
            puntata={puntato || null}
            saldoRef={saldoRef}
            scarso={senzaSaldo}
            riga
            etichetta="Giocato"
          />
        )}

        <Jackpot vista={vista} tempoDi={tempoDi} onDiretta={() => ultimo && setDiretta({ replica: false, inizio: inizioUltimo })} />

        {aperto && vista && (
          <Schedina
            concorso={aperto}
            oggi={vista.date}
            saldo={vista.saldo}
            inviando={inviando}
            onGioca={gioca}
          />
        )}

        {aperto && aperto.mie.length > 0 && (
          <section className="se-sezione">
            <h2 className="se-sezione__titolo">
              Le tue schede <span className="u-tabnum">{aperto.mie.length}/{SCHEDE_MASSIME}</span>
            </h2>
            <ul className="se-ricevute">
              {aperto.mie.map((s, i) => (
                <Ricevuta key={s.id} scheda={s} indice={i} estratti={null} />
              ))}
            </ul>
          </section>
        )}

        {ultimo && (
          <Ultima
            concorso={ultimo}
            tempoDi={tempoDi}
            onRivedi={() => setDiretta({ replica: true, inizio: Date.now() + 3000 })}
            onDiretta={() => setDiretta({ replica: false, inizio: inizioUltimo })}
          />
        )}
        {prossimoFra === null && !ultimo && <p className="se-nota">Il gioco riapre a fine estrazione.</p>}
      </div>

      {diretta && ultimo && (
        <Suspense fallback={null}>
          <Diretta
            data={ultimo.data}
            inizio={diretta.inizio}
            estratti={ultimo.estratti}
            mie={ultimo.mie}
            premi={diretta.replica || ultimo.premi ? ultimo.premi : null}
            replica={diretta.replica}
            onChiudi={() => {
              chiusaDa.current = ultimo.data
              setDiretta(null)
              void leggi()
            }}
          />
        </Suspense>
      )}
      <ComeSiGiocaEnalotto open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

/** In cima: il jackpot, grande, e quando si estrae; o che il gioco e' chiuso, e la diretta. */
function Jackpot({
  vista,
  tempoDi,
  onDiretta,
}: {
  vista: VistaEnalotto | null
  tempoDi: (fra: number) => number
  onDiretta: () => void
}) {
  const aperto = vista?.aperto ?? null
  const ultimo = vista?.ultimo ?? null
  const inDiretta = ultimo && tempoDi(ultimo.inizioFra) <= 0 && tempoDi(ultimo.fineFra) > 0
  const chiuso = !aperto && ultimo && tempoDi(ultimo.inizioFra) > 0
  const jackpot = aperto?.jackpot ?? ultimo?.jackpot ?? 0
  return (
    <section className={`se-jackpot${inDiretta ? ' is-diretta' : ''}`} aria-label="Jackpot">
      <span className="se-jackpot__brilli" aria-hidden="true" />
      <span className="se-jackpot__etichetta">Jackpot</span>
      <span className="se-jackpot__cifra u-tabnum">
        {vista ? <Numero valore={jackpot} /> : <span className="scheletro scheletro--riga-corta" />}
        <span className="se-jackpot__unita"> {jackpot === 1 ? 'punto' : 'punti'}</span>
      </span>
      {aperto && vista && (
        <span className="se-jackpot__quando">
          Estrazione {giornoEstrazione(aperto.data, vista.date)} alle 21:05 ·{' '}
          <span className="u-tabnum">si gioca ancora per {durata(tempoDi(aperto.chiusuraFra))}</span>
        </span>
      )}
      {chiuso && ultimo && (
        <span className="se-jackpot__quando">
          Gioco chiuso · la diretta comincia fra <span className="u-tabnum">{conto(Math.ceil(tempoDi(ultimo.inizioFra) / 1000))}</span>
        </span>
      )}
      {(inDiretta || chiuso) && (
        <button type="button" className="se-jackpot__diretta" onClick={onDiretta}>
          {inDiretta ? 'Guarda la diretta' : 'Apri la diretta'}
        </button>
      )}
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
 * La schedina: in cima le due giocate, quattro numeri o il "4+1", poi le
 * novanta caselle stampate in rosso, dieci per riga come sulla schedina vera,
 * che si segnano con una croce di penna blu, e i numeri scelti scritti a mano in
 * fondo. "Casuale" li sceglie a caso, come alla ricevitoria; giocata, la scheda
 * prende il timbro e torna bianca per la prossima.
 *
 * Una giocata che il saldo non paga non si sceglie: con quindici punti il 4+1
 * e' spento, e la schedina passa ai quattro numeri. Senza i punti per nessuna
 * delle due la schedina si spegne, e al posto del bottone c'e' l'avviso.
 */
function Schedina({
  concorso,
  oggi,
  saldo,
  inviando,
  onGioca,
}: {
  concorso: ConcorsoEnalottoVista
  oggi: string
  saldo: number
  inviando: boolean
  onGioca: (numeri: number[]) => Promise<boolean>
}) {
  const [segnati, setScelti] = useState<number[]>([])
  const [voluta, setVoluta] = useState<GiocataEnalotto>(leggiGiocata)
  const [timbro, setTimbro] = useState(0)
  const [scossa, setScossa] = useState(0)
  const mescola = useRef(0)
  const rimaste = SCHEDE_MASSIME - concorso.mie.length
  /** La giocata scelta, o la piu' ricca che il saldo paga. */
  const giocata = COSTI[voluta] <= saldo ? voluta : (GIOCATE.filter((g) => COSTI[g] <= saldo).at(-1) ?? voluta)
  // Passando ai quattro numeri perche' il saldo e' sceso, il quinto segnato se ne va.
  const scelti = segnati.length > giocata ? segnati.slice(0, giocata) : segnati
  const costo = COSTI[giocata]
  const pochi = saldo < costo
  const puo = rimaste > 0 && !pochi && !inviando

  const scegliGiocata = (g: GiocataEnalotto) => {
    if (g === giocata) return
    mescola.current += 1
    setVoluta(g)
    // Passando a quattro, il quinto numero segnato se ne va.
    setScelti((x) => x.slice(0, g))
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
      setScelti(scelti.filter((x) => x !== n))
      suona('tocco')
    } else if (scelti.length < giocata) {
      setScelti([...scelti, n])
      suona('tocco', { volume: 1.2 })
    } else {
      setScossa((x) => x + 1)
      suona('tetto')
    }
  }

  // La giocata casuale: le croci saltano qua e la' per un attimo, poi si fermano su quattro numeri.
  const casuale = () => {
    if (!puo) return
    const giro = ++mescola.current
    const finale = casuali(giocata)
    let volte = 0
    const passo = () => {
      if (giro !== mescola.current) return
      volte += 1
      if (volte < 7) {
        setScelti(casuali(giocata))
        suona('tocco', { volume: 0.6 })
        window.setTimeout(passo, 70)
      } else {
        setScelti(finale)
        suona('fiche')
      }
    }
    passo()
  }

  const conferma = async () => {
    if (scelti.length !== giocata || !puo) return
    mescola.current += 1
    if (await onGioca([...scelti].sort((a, b) => a - b))) {
      setTimbro((x) => x + 1)
      suona('posa')
      window.setTimeout(() => setScelti([]), 650)
    }
  }

  const mano = [...scelti].sort((a, b) => a - b)
  const breve = new Date(`${concorso.data}T12:00:00Z`).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'UTC',
  })
  return (
    <section className="se-sezione" aria-label="La schedina">
      <div
        className={`se-schedina${scossa ? ' is-scossa' : ''}${rimaste > 0 && pochi ? ' is-spenta' : ''}`}
        key={`s${scossa}`}
      >
        <header className="se-schedina__testa">
          <span className="se-schedina__marchio">
            Super<b>Enalotto</b>
          </span>
          <span className="se-schedina__concorso">
            Concorso di {giornoEstrazione(concorso.data, oggi)} · {breve}
          </span>
        </header>
        <div className="se-giocate" role="radiogroup" aria-label="La giocata" onKeyDown={frecceDelGruppo}>
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
              <span className="se-giocata__casella" aria-hidden="true">
                {giocata === g && (
                  <svg viewBox="0 0 40 40">
                    <path d="M8 9 L32 32" />
                    <path d="M31 8 L9 31" />
                  </svg>
                )}
              </span>
              <span className="se-giocata__nome">{g === 4 ? '4 numeri' : '4+1'}</span>
              <span className="se-giocata__costo u-tabnum">{COSTI[g]} punti</span>
            </button>
          ))}
        </div>
        <p className="se-schedina__istruzioni">
          Segna {giocata} numeri
          <span className="se-schedina__segni" aria-hidden="true">
            {Array.from({ length: giocata }, (_, i) => (
              <span key={i} className={i < scelti.length ? 'is-pieno' : ''} />
            ))}
          </span>
        </p>
        <div className="se-schedina__griglia" role="group" aria-label="I numeri">
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
                <span className="se-casella__numero u-tabnum">{n}</span>
                {segnato && (
                  <svg className="se-casella__croce" viewBox="0 0 40 40" aria-hidden="true">
                    <path d="M8 9 L32 32" />
                    <path d="M31 8 L9 31" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
        <div className="se-schedina__piede">
          <span className="se-schedina__mano" aria-live="polite">
            {mano.length > 0 ? mano.join(' · ') : 'Nessun numero'}
          </span>
          <span className="se-schedina__comandi">
            <button type="button" className="se-schedina__comando" onClick={casuale} disabled={!puo}>
              Casuale
            </button>
            <button
              type="button"
              className="se-schedina__comando"
              onClick={() => setScelti([])}
              disabled={!puo || scelti.length === 0}
            >
              Cancella
            </button>
          </span>
        </div>
        {timbro > 0 && (
          <span className="se-schedina__timbro" key={timbro} aria-hidden="true">
            Giocata
          </span>
        )}
      </div>
      {rimaste > 0 && pochi ? (
        <PochiPunti servono={COSTO_MINIMO} saldo={saldo} titolo={`Una scheda costa ${COSTO_MINIMO} punti`} />
      ) : (
        <Button
          className="se-gioca"
          disabled={!puo || scelti.length !== giocata}
          onClick={() => void conferma()}
        >
          {rimaste <= 0
            ? `Hai giocato ${SCHEDE_MASSIME} schede`
            : scelti.length === giocata
              ? `Gioca la scheda · ${costo} punti`
              : `Segna ancora ${giocata - scelti.length} ${giocata - scelti.length === 1 ? 'numero' : 'numeri'}`}
        </Button>
      )}
      {rimaste > 0 && concorso.mie.length > 0 && (
        <p className="se-nota">
          Puoi giocarne ancora {rimaste} per {giornoEstrazione(concorso.data, oggi)}.
        </p>
      )}
    </section>
  )
}

/** Una scheda giocata, come la ricevuta della ricevitoria: i numeri, e dopo l'estrazione quanti ha preso. */
function Ricevuta({ scheda, indice, estratti }: { scheda: SchedaEnalotto; indice: number; estratti: number[] | null }) {
  const presi = estratti ? presiDi(scheda.numeri, estratti) : null
  return (
    <li
      className={`se-ricevuta${presi !== null && presi >= 2 ? ' is-vince' : ''}`}
      style={{ '--i': indice } as CSSProperties}
    >
      <span className="se-ricevuta__titolo">
        Scheda {indice + 1}
        {scheda.numeri.length > ESTRATTI && <span className="se-ricevuta__giocata">4+1</span>}
      </span>
      <span className="se-ricevuta__numeri">
        {scheda.numeri.map((n) => (
          <Pallina key={n} n={n} piccola accesa={!!estratti?.includes(n)} />
        ))}
      </span>
      <span className="se-ricevuta__esito">
        {presi === null
          ? `${costoDi(scheda.numeri)} punti`
          : scheda.vincita
            ? `+${scheda.vincita}`
            : presi >= 2
              ? `${presi} numeri`
              : `${presi}/${ESTRATTI}`}
      </span>
    </li>
  )
}

/** L'ultima estrazione: i numeri, i premi di ogni categoria e le proprie schede. Si puo' rivedere la diretta. */
function Ultima({
  concorso,
  tempoDi,
  onRivedi,
  onDiretta,
}: {
  concorso: NonNullable<VistaEnalotto['ultimo']>
  tempoDi: (fra: number) => number
  onRivedi: () => void
  onDiretta: () => void
}) {
  const { estratti, premi } = concorso
  const prima = tempoDi(concorso.inizioFra) > 0
  const finita = tempoDi(concorso.fineFra) <= 0
  const vinto = concorso.mie.reduce((s, x) => s + (x.vincita ?? 0), 0)
  return (
    <section className="se-sezione">
      <h2 className="se-sezione__titolo">Estrazione di {dataLunga(concorso.data)}</h2>
      <div className="se-ultima">
        {prima || !estratti ? (
          <div className="se-ultima__attesa">
            <p>L’estrazione comincia alle 21:05.</p>
            <Button onClick={onDiretta}>Apri la diretta</Button>
          </div>
        ) : !finita || !premi ? (
          <div className="se-ultima__attesa">
            <p>L’estrazione è in diretta.</p>
            <Button onClick={onDiretta}>Guarda la diretta</Button>
          </div>
        ) : (
          <>
            <div className="se-ultima__palline">
              {estratti.map((n) => (
                <Pallina key={n} n={n} />
              ))}
            </div>
            <table className="se-premi">
              <thead>
                <tr>
                  <th scope="col">Punti</th>
                  <th scope="col">Vincitori</th>
                  <th scope="col">Premio</th>
                </tr>
              </thead>
              <tbody>
                {premi.map((p) => (
                  <tr key={p.categoria} className={p.categoria === 4 ? 'is-jackpot' : ''}>
                    <th scope="row">{p.categoria === 4 ? '4 · Jackpot' : p.categoria}</th>
                    <td className="u-tabnum">{p.vincitori}</td>
                    <td className="u-tabnum">{p.vincitori > 0 ? `${p.premio} ${p.premio === 1 ? 'punto' : 'punti'}` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="se-nota">
              {premi[0].vincitori > 0
                ? `Jackpot vinto! Riparte da ${concorso.prossimoJackpot} punti.`
                : `Nessuno ha fatto 4: il jackpot passa a ${concorso.prossimoJackpot} punti.`}{' '}
              {concorso.schede} {concorso.schede === 1 ? 'scheda giocata' : 'schede giocate'}.
            </p>
            {concorso.mie.length > 0 && (
              <>
                <p className={`se-ultima__mio${vinto > 0 ? ' is-vinto' : ''}`}>
                  {vinto > 0 ? `Hai vinto ${vinto} ${vinto === 1 ? 'punto' : 'punti'}` : 'Le tue schede non hanno vinto'}
                </p>
                <ul className="se-ricevute">
                  {concorso.mie.map((s, i) => (
                    <Ricevuta key={s.id} scheda={s} indice={i} estratti={estratti} />
                  ))}
                </ul>
              </>
            )}
            <Button variant="tinted" onClick={onRivedi}>
              Rivedi l’estrazione
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
