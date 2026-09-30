import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta } from '@/components/Elementi'
import { IconCheck, IconClock, IconClose } from '@/components/Icons'
import { IconaScheda, Pillola, Scheda } from '@/components/Scheda'
import { Sheet } from '@/components/Sheet'
import { formatCronometro } from '@/lib/format'
import { suona } from '@/lib/suoni'
import {
  NOMI_CATEGORIE,
  NOMI_MODI,
  PUNTI_BASE_QUIZ,
  SECONDI_CARTINA,
  SECONDI_SCELTA,
  diGeografia,
  type CategoriaQuiz,
} from '@shared/quiz'
import { giornoInLettere, urlVoce } from '@shared/quiz-cultura'
import type { CittaQuiz } from '@shared/quiz-dati'
import type { AreaQuiz, DomandaQuiz, IndiceQuiz, OpzioneQuiz, SpiegazioneQuiz } from '@shared/quiz-domande'
import { adesivoFine, adesivoGiusta, adesivoSbagliata, adesivoTempo } from './adesivi'
import { misureBandiera, urlBandiera } from './bandiere'
import { Cartina, type EsitoCartina, type PuntoCartina } from './cartina/Cartina'
import { useIndiceQuiz } from './dati'
import { IconaCategoria } from './icone'
import { Quadro, precaricaQuadro } from './Quadro'
import { SchedaSpiegazione } from './Spiegazione'
import { descrizione } from './testi'
import { VIA_MS, type Fatta, type OpzioniPartita, type VistaPartita } from './usePartita'
import { luogoDellaRisposta, postoDellOpzione, zonaDellaPartita } from './zona'
import './PartitaQuiz.css'

const LETTERE = ['A', 'B', 'C', 'D', 'E', 'F']

/** Un'opzione che e' un paese: il suo id e' il codice ISO, e a risposta data ha la bandiera. */
const ePaese = (id: string) => /^[A-Z]{2}$/.test(id)

interface Props {
  p: VistaPartita
  /** La classificata ha i punti; la libera no. */
  classificata: boolean
  /** Sotto il risultato: i bottoni che portano via. */
  azioniFine: ReactNode
  /** Il titolo dell'intro e la riga sopra, se non sono quelli del quiz di oggi. */
  intro?: { titolo: string; sotto?: string }
}

/**
 * La partita del quiz, fase per fase: intro, tre-due-uno, domande, fine.
 *
 * Una schermata che non scorre, come gli altri giochi: la testata con il
 * numero della domanda e il tempo, la carta della domanda — il testo, e la
 * bandiera — e sotto le risposte, grandi come tasti, o la cartina muta. Si
 * sceglie con un tocco, o con 1-6 e A-F dalla tastiera; Invio va avanti.
 *
 * A risposta data, con la cartina che insegna, la carta diventa una cartina con
 * i nomi: dov'e' la risposta giusta, e dove quella scelta. Si va avanti con
 * "Avanti", quando si e' guardato.
 */
export function PartitaQuiz({ p, classificata, azioniFine, intro }: Props) {
  const { adesivo, accoda, subito } = useCodaAdesivi()
  const [riepilogo, setRiepilogo] = useState(false)

  // L'adesivo di ogni risposta, appena arriva. Serie e posizione si leggono
  // quando arriva la risposta, non sono loro a farlo ripartire.
  const ultima = p.ultima
  const contorno = useRef({ serie: p.serie, indice: p.fatte.length - 1, totale: p.totale })
  contorno.current = { serie: p.serie, indice: p.fatte.length - 1, totale: p.totale }
  useEffect(() => {
    if (!ultima) return
    const { serie, indice, totale } = contorno.current
    const { risposta, domanda } = ultima
    if (risposta.giusta) {
      accoda(adesivoGiusta(indice, serie, classificata ? Math.round((100 - PUNTI_BASE_QUIZ) / Math.max(1, totale)) : null))
    } else if (risposta.scelta === null) {
      accoda(adesivoTempo(risposta.risposta))
    } else {
      accoda(adesivoSbagliata(risposta.risposta, !!domanda.cartina))
    }
  }, [ultima, accoda, classificata])

  // La fine: la festa e l'adesivo solo per una partita vista giocare.
  const inCorso = p.fase === 'caricamento' || p.fase === 'errore' ? null : p.fase !== 'fine'
  const risposte = p.ripassoDa ?? p.fatte.length
  const quota = risposte > 0 ? p.giuste / risposte : 0
  const festa = useFesta(inCorso, p.fase === 'fine' && quota >= 0.7)
  const finita = useFesta(inCorso, p.fase === 'fine')
  const conto = useRef({ giuste: p.giuste, totale: risposte, punti: p.punti, fuori: fuoriDi(p) })
  conto.current = { giuste: p.giuste, totale: risposte, punti: p.punti, fuori: fuoriDi(p) }
  useEffect(() => {
    if (!finita) return
    const { giuste, totale, punti, fuori } = conto.current
    subito(adesivoFine(giuste, totale, classificata ? punti : null, fuori))
  }, [finita, subito, classificata])

  return (
    <div className="quiz">
      {p.fase === 'caricamento' && <div className="quiz__attesa" aria-hidden="true" />}

      {p.fase === 'errore' && (
        <div className="quiz__ripiego">
          <p>{p.errore}</p>
          <Button variant="tinted" onClick={p.riprova}>
            Riprova
          </Button>
        </div>
      )}

      {p.fase === 'intro' && p.categoria && <Intro p={p} categoria={p.categoria} intro={intro} />}

      {p.fase === 'via' && p.categoria && <Via categoria={p.categoria} />}

      {(p.fase === 'domanda' || p.fase === 'esito') && p.categoria && <Gioco p={p} categoria={p.categoria} />}

      {p.fase === 'fine' && (
        <Fine p={p} classificata={classificata} onRivedi={() => setRiepilogo(true)}>
          {azioniFine}
        </Fine>
      )}

      {p.errore && (p.fase === 'domanda' || p.fase === 'esito') && (
        <button type="button" className="quiz__errore" onClick={p.riprova}>
          {p.errore} Tocca per riprovare.
        </button>
      )}

      <Sheet open={riepilogo} onClose={() => setRiepilogo(false)} title="Le risposte">
        <Riepilogo fatte={p.fatte} />
      </Sheet>

      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </div>
  )
}

/* ──────────────────────────────  L'intro  ────────────────────────────── */

function Intro({ p, categoria, intro }: { p: VistaPartita; categoria: CategoriaQuiz; intro?: Props['intro'] }) {
  const ripresa = p.fatte.length > 0
  const cartina = p.modo === 'cartina'
  // La classificata ha i tempi di tutti; la libera quelli scelti, il doppio sulla cartina.
  const secondi = intro ? (p.opzioni.secondi === null ? null : p.opzioni.secondi * (cartina ? 2 : 1)) : cartina ? SECONDI_CARTINA : SECONDI_SCELTA
  const come = diGeografia(categoria)
    ? p.modo && NOMI_MODI[p.modo]
    : !intro && p.giorno
      ? giornoInLettere(p.giorno)
      : null
  return (
    <div className="quiz-intro">
      <div className="quiz-intro__disegno" aria-hidden="true">
        <span className="quiz-intro__anello" />
        <span className="quiz-intro__icona">
          <IconaCategoria categoria={categoria} size={54} />
        </span>
      </div>
      <p className="quiz-intro__sopra">{intro?.sotto ?? 'Il quiz di oggi'}</p>
      <h2 className="quiz-intro__titolo">{intro?.titolo ?? NOMI_CATEGORIE[categoria]}</h2>
      <p className="quiz-intro__testo">{descrizione(categoria, p.modo)}</p>
      <div className="quiz-intro__regole">
        <span>
          <strong className="u-tabnum">{p.totale}</strong> domande
        </span>
        {/* Il modo per la geografia, il giorno per "Accadde oggi". Zona e ambito della libera stanno sopra. */}
        {come && <span>{come}</span>}
        <span>
          {secondi === null ? (
            'Senza tempo'
          ) : (
            <>
              <strong className="u-tabnum">{secondi}</strong> secondi a domanda
            </>
          )}
        </span>
      </div>
      <Button size="lg" fullWidth onClick={p.comincia}>
        {ripresa ? `Riprendi dalla domanda ${p.fatte.length + 1}` : 'Comincia'}
      </Button>
    </div>
  )
}

/** Tre, due, uno, via: numeri che saltano fuori uno dopo l'altro. */
export function Via({ categoria, durata = VIA_MS }: { categoria: CategoriaQuiz; durata?: number }) {
  // I numeri compaiono a un quarto della durata l'uno (vedi PartitaQuiz.css): i suoni vanno con loro.
  const quarto = durata / 4000
  useEffect(() => {
    ;[0, 1, 2].forEach((i) => suona('tic', { ritardo: i * quarto }))
    suona('via', { ritardo: 3 * quarto })
    // Una volta sola, quando il tre-due-uno compare: nella sfida la durata si ricalcola a ogni disegno.
  }, [])
  return (
    <div className="quiz-via" style={{ '--via': `${durata}ms` } as CSSProperties}>
      <span className="quiz-via__icona" aria-hidden="true">
        <IconaCategoria categoria={categoria} size={28} />
      </span>
      <div className="quiz-via__numeri" aria-hidden="true">
        {['3', '2', '1', 'Via!'].map((n, i) => (
          <span key={n} className="quiz-via__numero" style={{ '--i': i } as CSSProperties}>
            {n}
          </span>
        ))}
      </div>
      <span className="u-visually-hidden" aria-live="polite">
        Si comincia
      </span>
    </div>
  )
}

/* ───────────────────────────────  Il gioco  ───────────────────────────── */

function Gioco({ p, categoria }: { p: VistaPartita; categoria: CategoriaQuiz }) {
  const d = p.domanda
  const esito = p.fase === 'esito' ? p.ultima : null
  const [sceltaCartina, setSceltaCartina] = useState<string | null>(null)
  useEffect(() => setSceltaCartina(null), [p.indice])

  const sullaCartina = !!d?.cartina
  const geografia = diGeografia(categoria)
  // A risposta data, con "impara": la cartina per la geografia, la scheda per le altre materie.
  const scheda = esito?.risposta.spiegazione ?? null
  const rivela = p.opzioni.imparo && !!esito && !sullaCartina && (geografia || !!scheda)
  // I dati servono alla cartina e a dire dove sta una risposta: si chiedono solo se c'e' una cartina.
  const ix = useIndiceQuiz(geografia && (p.modo === 'cartina' || sullaCartina || p.opzioni.imparo))
  const manuale = !p.opzioni.avantiDaSolo

  // Il quadro della domanda dopo, mentre si risponde a questa: quando arriva, c'e' gia'.
  const prossima = p.prossima
  useEffect(() => {
    if (prossima) precaricaQuadri(prossima)
  }, [prossima])

  // Da tastiera, su computer: 1-6 o A-F per rispondere, Invio per confermare o per andare avanti.
  const { rispondi, avanti } = p
  useEffect(() => {
    if (!d) return
    const tasto = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (esito) {
        if (manuale && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          avanti()
        }
        return
      }
      if (d.cartina) {
        if (e.key === 'Enter' && sceltaCartina) rispondi(sceltaCartina)
        return
      }
      if (e.key.length !== 1) return
      const i = '123456'.includes(e.key) ? '123456'.indexOf(e.key) : 'abcdef'.indexOf(e.key.toLowerCase())
      const o = d.opzioni[i]
      if (i >= 0 && o && !p.esclusi.has(o.id)) {
        e.preventDefault()
        rispondi(o.id)
      }
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [d, esito, rispondi, avanti, sceltaCartina, manuale, p.esclusi])

  // Il tempo finisce: la risposta e' "nessuna".
  useEffect(() => {
    if (p.fase !== 'domanda' || p.scade === null) return
    const t = setTimeout(() => rispondi(null), Math.max(0, p.scade - performance.now()))
    return () => clearTimeout(t)
  }, [p.fase, p.scade, rispondi])

  if (!d) return <div className="quiz__attesa" aria-hidden="true" />

  const com = esito ? (esito.risposta.giusta ? ' is-giusta' : ' is-sbagliata') : ''
  const nelRipasso = p.ripassoDa !== null && p.indice >= p.ripassoDa
  const titolo = (
    <>
      <span className="quiz-titolo__parola">{nelRipasso ? 'Ripasso ' : 'Domanda '}</span>
      {nelRipasso
        ? `${p.indice - p.ripassoDa! + 1} di ${p.totale - p.ripassoDa!}`
        : `${Math.min(p.indice + 1, p.totale)} di ${p.ripassoDa ?? p.totale}`}
    </>
  )

  return (
    <>
      <Scheda
        className="quiz__tabellone"
        titolo={titolo}
        icona={
          <IconaScheda colore="var(--quiz-1)">
            <IconaCategoria categoria={categoria} size={15} />
          </IconaScheda>
        }
        destra={<Tempo p={p} />}
      >
        <Progresso p={p} />
      </Scheda>

      {sullaCartina ? (
        <>
          {/* Il testo cambia a ogni domanda; la cartina no, e con lei la vista. */}
          <CartaDomanda key={`carta-${p.indice}`} d={d} categoria={categoria} esito={com} rivela={false} />
          <div className="quiz-mappa">
            <CartinaDellaPartita
              c={p}
              ix={ix}
              d={d}
              scelta={sceltaCartina}
              onScegli={esito ? undefined : setSceltaCartina}
              fatta={esito}
            />
          </div>
          <div className="quiz-conferma">
            {esito ? (
              <>
                <p className={`quiz-conferma__esito${esito.risposta.giusta ? ' is-giusta' : ''}`}>
                  {esito.risposta.giusta
                    ? 'Trovato!'
                    : `${esito.risposta.scelta === null ? 'Tempo scaduto' : 'Sbagliato'} · giusta: ${
                        esito.risposta.risposta
                      }`}
                </p>
                {manuale && <Avanti p={p} />}
              </>
            ) : (
              <Button
                size="lg"
                fullWidth
                disabled={!sceltaCartina}
                loading={p.inviando}
                onClick={() => sceltaCartina && rispondi(sceltaCartina)}
              >
                {sceltaCartina ? 'È qui' : 'Tocca la cartina'}
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Chiavi diverse per carta e risposte: sono fratelle, e con la stessa chiave
              React non saprebbe quale togliere, e la carta vecchia resterebbe. */}
          <CartaDomanda
            key={`carta-${p.indice}`}
            d={d}
            categoria={categoria}
            esito={com}
            rivela={rivela}
            aiuto={
              !esito && p.opzioni.aiuti && p.aiutiRimasti > 0 && d.opzioni.length >= 3 ? (
                <button
                  type="button"
                  className="quiz-carta__aiuto"
                  disabled={p.esclusi.size > 0}
                  onClick={() => {
                    suona('svela')
                    p.usaAiuto()
                  }}
                  aria-label={`Aiuto 50 e 50: ne restano ${p.aiutiRimasti}`}
                >
                  50:50 <span className="u-tabnum">×{p.aiutiRimasti}</span>
                </button>
              ) : null
            }
            cartina={
              rivela && esito && geografia ? (
                <CartinaDellaPartita c={p} ix={ix} d={d} scelta={null} fatta={esito} guarda />
              ) : null
            }
            scheda={scheda}
          />
          <Opzioni
            key={`opzioni-${p.indice}`}
            d={d}
            esito={esito}
            inviando={p.inviando}
            esclusi={p.esclusi}
            compatte={rivela}
            onScegli={rispondi}
          />
          {esito && manuale && (
            <div className="quiz-avanti">
              <Avanti p={p} />
            </div>
          )}
        </>
      )}
    </>
  )
}

/** "Avanti", o "Risultato" all'ultima domanda. */
function Avanti({ p }: { p: VistaPartita }) {
  return (
    <Button size="lg" fullWidth onClick={p.avanti} className="quiz-avanti__bottone">
      {p.finale ? 'Risultato' : 'Avanti'}
    </Button>
  )
}

/**
 * La carta della domanda: il testo, con la bandiera da riconoscere o
 * l'emblema della categoria. Sulla cartina e' una riga sola, con la bandierina
 * se c'e'; con la cartina che insegna, a risposta data, ha dentro la cartina.
 * La usano la partita e la sfida a due.
 */
export function CartaDomanda({
  d,
  categoria,
  esito,
  rivela,
  aiuto,
  cartina,
  scheda,
}: {
  d: DomandaQuiz
  categoria: CategoriaQuiz
  /** Il colore della carta a risposta data: " is-giusta", " is-sbagliata", o niente. */
  esito: string
  rivela: boolean
  aiuto?: ReactNode
  cartina?: ReactNode
  /** Per le altre materie, a risposta data: la scheda al posto della cartina. */
  scheda?: SpiegazioneQuiz | null
}) {
  if (d.cartina) {
    return (
      <section className={`quiz-carta is-cartina${esito}`} aria-live="polite">
        {d.bandiera && (
          <img
            className="quiz-carta__bandierina"
            src={urlBandiera(d.bandiera, 160)}
            srcSet={`${urlBandiera(d.bandiera, 320)} 2x`}
            alt="La bandiera da riconoscere"
            draggable={false}
          />
        )}
        <p className="quiz-carta__testo">{d.testo}</p>
      </section>
    )
  }
  // Si insegna solo se c'e' cosa: la cartina, o la scheda.
  const insegna = rivela && (!!cartina || !!scheda)
  const aspetto = insegna ? ' is-rivela' : d.immagine ? ' is-quadro' : d.bandiera ? ' is-bandiera' : ' is-testo'
  return (
    <section className={`quiz-carta${aspetto}${esito}`} aria-live="polite">
      {!insegna && !d.bandiera && !d.immagine && (
        <span className="quiz-carta__emblema" aria-hidden="true">
          <IconaCategoria categoria={categoria} size={40} />
        </span>
      )}
      {insegna && d.bandiera && (
        <img className="quiz-carta__bandierina" src={urlBandiera(d.bandiera, 160)} alt="" draggable={false} />
      )}
      <p className="quiz-carta__testo">{d.testo}</p>
      {!insegna && d.immagine && (
        <span className="quiz-carta__quadro">
          <Quadro img={d.immagine} alt="Il quadro della domanda" sizes={MISURE_DOMANDA} />
        </span>
      )}
      {!insegna && d.bandiera && (
        <span className="quiz-carta__bandiera">
          <img
            src={urlBandiera(d.bandiera, 320)}
            srcSet={misureBandiera(d.bandiera, 320, 640)}
            sizes="(min-width: 700px) 440px, 300px"
            alt="La bandiera da riconoscere"
            draggable={false}
          />
        </span>
      )}
      {aiuto}
      {insegna && cartina && <div className="quiz-carta__cartina">{cartina}</div>}
      {insegna && !cartina && scheda && (
        <div className="quiz-carta__scheda">
          <SchedaSpiegazione s={scheda} />
        </div>
      )}
    </section>
  )
}

/** Quanto e' largo sullo schermo il quadro di una domanda, e quello di una risposta: per scegliere la misura. */
const MISURE_DOMANDA = '(min-width: 700px) 500px, 92vw'
const MISURE_OPZIONE = '(min-width: 700px) 240px, 160px'

/** I quadri di una domanda: quello da riconoscere, o quelli fra cui scegliere. */
export function precaricaQuadri(d: DomandaQuiz): void {
  if (d.immagine) precaricaQuadro(d.immagine, MISURE_DOMANDA)
  for (const o of d.opzioni) if (o.immagine) precaricaQuadro(o.immagine, MISURE_OPZIONE)
}

/** Quel che la cartina di una partita deve sapere: dove si gioca, come, e le città se ce ne sono. */
export interface ContestoCartina {
  area: AreaQuiz
  citta: readonly CittaQuiz[] | null
  opzioni: Pick<OpzioniPartita, 'soloZona' | 'nomiPaesi' | 'evidenzia' | 'imparo'>
}

/**
 * La cartina di una partita: la stessa per tutte le domande sulla cartina, o
 * quella che nasce a risposta data per le domande a scelta (`guarda`). La
 * zona, i posti da toccare e i nomi vengono dalle opzioni della partita.
 */
export function CartinaDellaPartita({
  c: p,
  ix,
  d,
  scelta,
  onScegli,
  fatta,
  guarda = false,
}: {
  c: ContestoCartina
  ix: IndiceQuiz | null
  d: DomandaQuiz
  scelta: string | null
  onScegli?: (id: string) => void
  /** La risposta da mostrare, a risposta data. */
  fatta: Fatta | null
  /** Da guardare soltanto: la cartina che insegna, per una domanda a scelta. */
  guarda?: boolean
}) {
  const strato = guarda ? null : (d.cartina?.strato ?? null)
  // La vista della domanda conta solo alla prima: dopo la cartina resta dov'e'.
  const [vistaIniziale] = useState(d.cartina?.vista)
  const zona = useMemo(
    () => (ix ? zonaDellaPartita(ix, p.area, strato, p.opzioni.soloZona, p.citta, vistaIniziale) : null),
    [ix, p.area, strato, p.opzioni.soloZona, p.citta, vistaIniziale],
  )
  const punti: PuntoCartina[] | undefined = useMemo(
    () => p.citta?.map((c) => ({ id: `u:${c.id}`, lon: c.pt[0], lat: c.pt[1], nome: c.n })),
    [p.citta],
  )
  const esito: EsitoCartina | null = useMemo(() => {
    if (!fatta || !ix) return null
    const r = fatta.risposta
    const sullaCartina = !!fatta.domanda.cartina
    const giusta = sullaCartina ? r.corretta : (postoDellOpzione(ix, r.corretta) ?? '')
    const sceltaQui = sullaCartina ? r.scelta : postoDellOpzione(ix, r.scelta)
    return {
      giusta,
      accettate: sullaCartina ? (fatta.accettate ?? []) : [],
      scelta: r.giusta ? null : sceltaQui,
      luogo: luogoDellaRisposta(ix, fatta.domanda, r),
    }
  }, [fatta, ix])
  if (!zona) return <div className="quiz__attesa" aria-hidden="true" />
  // I nomi dei paesi aiutano a orientarsi, ma dove si cerca un paese sarebbero la risposta.
  const nomiPaesi = p.opzioni.nomiPaesi && strato !== 'paesi'
  return (
    <Cartina
      inquadra={zona.inquadra}
      fuoco={zona.fuoco}
      strato={strato}
      zona={zona.zona}
      toccabili={zona.toccabili}
      evidenzia={p.opzioni.evidenzia}
      nomiPaesi={nomiPaesi}
      scelta={scelta}
      onScegli={onScegli}
      mostra={d.cartina?.mostra}
      esito={esito}
      rivela={p.opzioni.imparo}
      punti={punti}
      etichetta={d.testo}
    />
  )
}

/**
 * A destra nella testata: i secondi che restano, e a risposta data com'e'
 * andata. Sotto i cinque secondi la pillola si fa rossa.
 */
function Tempo({ p }: { p: VistaPartita }) {
  const [adesso, setAdesso] = useState(() => performance.now())
  useEffect(() => {
    if (p.scade === null) return
    const t = setInterval(() => setAdesso(performance.now()), 200)
    return () => clearInterval(t)
  }, [p.scade])
  const restante = p.scade === null ? 0 : Math.max(0, p.scade - adesso)
  const secondi = Math.ceil(restante / 1000)
  // Gli ultimi cinque secondi ticchettano, uno per secondo.
  const ticchetta = p.fase === 'domanda' && p.scade !== null && secondi > 0 && secondi <= 5 ? secondi : null
  useEffect(() => {
    if (ticchetta !== null) suona('tic')
  }, [ticchetta])

  if (p.fase === 'esito' && p.ultima) {
    const { giusta, scelta } = p.ultima.risposta
    return (
      <Pillola
        tono={giusta ? 'buona' : 'cattiva'}
        icona={giusta ? <IconCheck size={13} /> : scelta === null ? <IconClock size={13} /> : <IconClose size={13} />}
      >
        {giusta ? 'Giusta' : scelta === null ? 'Tempo scaduto' : 'Sbagliata'}
      </Pillola>
    )
  }
  if (p.limiteMs === 0) {
    return <Pillola icona={<IconClock size={13} />}>Senza tempo</Pillola>
  }
  const poco = p.scade !== null && secondi <= 5
  return (
    <Pillola tono={poco ? 'cattiva' : 'neutra'} icona={<IconClock size={13} />} vivo={poco}>
      <span className="u-tabnum">{p.scade === null ? '…' : `${secondi} s`}</span>
    </Pillola>
  )
}

/** Le domande della partita, una casella l'una: verdi e rosse man mano, la corrente che respira. */
function Progresso({ p }: { p: VistaPartita }) {
  // Quando si risponde la scadenza sparisce: la miccia si ferma dove era arrivata.
  const ultimaScadenza = useRef<number | null>(null)
  if (p.scade !== null) ultimaScadenza.current = p.scade
  // Oltre le venti domande le caselle sarebbero fili: una barra che si riempie.
  const tante = p.totale > 20
  return (
    <div className="quiz-progresso">
      {tante ? (
        <div
          className="quiz-progresso__barra"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={p.totale}
          aria-valuenow={p.fatte.length}
        >
          <span style={{ '--pieno': p.fatte.length / Math.max(1, p.totale) } as CSSProperties} />
          <em className="u-tabnum">
            {p.fatte.filter((f) => f.risposta.giusta).length} giuste su {p.fatte.length}
          </em>
        </div>
      ) : (
        <ol className="quiz-progresso__caselle" aria-label={`${p.fatte.length} risposte date su ${p.totale}`}>
          {Array.from({ length: p.totale }, (_, i) => {
            const f = p.fatte[i]
            const classe = f ? (f.risposta.giusta ? ' is-giusta' : ' is-sbagliata') : i === p.indice ? ' is-corrente' : ''
            const ripasso = p.ripassoDa !== null && i >= p.ripassoDa ? ' is-ripasso' : ''
            return <li key={i} className={`quiz-progresso__casella${classe}${ripasso}`} />
          })}
        </ol>
      )}
      {p.limiteMs > 0 && (
        <Miccia
          key={`${p.indice}-${p.scade === null ? 'ferma' : 'va'}`}
          scadenza={p.scade ?? ultimaScadenza.current}
          ferma={p.scade === null}
          limiteMs={p.limiteMs}
        />
      )}
    </div>
  )
}

/**
 * La miccia del tempo. Misura quanto resta una volta sola, quando compare, e
 * da lì la consuma il CSS: ricalcolarla a ogni disegno della testata — una
 * casella toccata sulla cartina, una risposta che parte — la farebbe saltare.
 * La chiave la fa ricomparire a ogni domanda, e ferma quando si risponde.
 */
export function Miccia({
  scadenza,
  ferma,
  limiteMs,
  fattore = 1,
}: {
  scadenza: number | null
  ferma: boolean
  limiteMs: number
  /** Al rallentatore il tempo che resta dura `fattore` volte tanto: la miccia resta dov'e', e brucia piano. */
  fattore?: number
}) {
  const [misura] = useState(() => {
    const restante = scadenza === null ? 0 : Math.max(0, scadenza - performance.now())
    return { da: Math.min(1, restante / fattore / limiteMs), durata: restante }
  })
  return (
    <span className="quiz-miccia" aria-hidden="true">
      <span
        className={`quiz-miccia__fuoco${ferma ? ' is-ferma' : ''}`}
        style={{ '--da': misura.da, '--durata': `${misura.durata}ms` } as CSSProperties}
      />
    </span>
  )
}

/** Chi altro ha scelto una risposta, nella sfida a due: il suo bollo sull'opzione. */
export interface AltraScelta {
  scelta: string | null
  nome: string
  colore: string
}

export function Opzioni({
  d,
  esito,
  inviando,
  esclusi,
  compatte,
  onScegli,
  fuori = null,
  altra,
}: {
  d: DomandaQuiz
  esito: Fatta | null
  inviando: boolean
  esclusi: ReadonlySet<string>
  /** Con la cartina che insegna, restano la giusta e quella scelta: il resto dello spazio e' della cartina. */
  compatte: boolean
  onScegli: (id: string) => void
  /** Nella sfida, la risposta sbagliata data mentre la domanda e' ancora aperta: la giusta non si sa ancora. */
  fuori?: string | null
  altra?: AltraScelta
}) {
  const [scelta, setScelta] = useState<string | null>(null)
  // Quadri e bandiere si scelgono guardandoli: tasti grandi, due per riga, e il nome sotto a risposta data.
  const quadri = d.opzioni.some((o) => o.immagine)
  const bandiere = quadri || d.opzioni.some((o) => o.bandiera)
  const lunghe = d.opzioni.some((o) => o.testo.length > 18)
  const sei = d.opzioni.length > 4
  const visibili = compatte && esito
    ? d.opzioni.filter(
        (o) => o.id === esito.risposta.corretta || o.id === esito.risposta.scelta || o.id === altra?.scelta,
      )
    : d.opzioni
  return (
    <div
      className={`quiz-opzioni${bandiere ? ' is-bandiere' : ''}${quadri ? ' is-quadri' : ''}${
        lunghe && !bandiere ? ' is-lunghe' : ''
      }${sei ? ' is-sei' : ''}${compatte && esito ? ' is-compatte' : ''}`}
    >
      {visibili.map((o) => {
        const i = d.opzioni.indexOf(o)
        let stato = ''
        if (esito) {
          if (o.id === esito.risposta.corretta) stato = ' is-giusta'
          else if (o.id === esito.risposta.scelta) stato = ' is-sbagliata'
          else stato = ' is-spenta'
        } else if (fuori) {
          stato = o.id === fuori ? ' is-sbagliata' : ' is-spenta'
        } else if (esclusi.has(o.id)) {
          stato = ' is-esclusa'
        } else if (inviando && o.id === scelta) {
          stato = ' is-scelta'
        }
        return (
          <button
            key={o.id}
            type="button"
            className={`quiz-opzione${stato}`}
            style={{ '--i': i } as CSSProperties}
            disabled={!!esito || !!fuori || inviando || esclusi.has(o.id)}
            onClick={() => {
              setScelta(o.id)
              onScegli(o.id)
            }}
          >
            {o.immagine ? (
              <>
                <span className="quiz-opzione__quadro">
                  <Quadro img={o.immagine} alt={esito ? o.testo : `Quadro ${LETTERE[i]}`} sizes={MISURE_OPZIONE} />
                </span>
                {esito ? (
                  <span className="quiz-opzione__nome">{o.testo}</span>
                ) : (
                  <span className="quiz-opzione__segno" aria-hidden="true">
                    {LETTERE[i]}
                  </span>
                )}
              </>
            ) : o.bandiera ? (
              <>
                <img
                  className="quiz-opzione__bandiera"
                  src={urlBandiera(o.bandiera, 160)}
                  srcSet={misureBandiera(o.bandiera, 160, 320)}
                  sizes="(min-width: 700px) 240px, 160px"
                  alt={esito ? o.testo : `Bandiera ${LETTERE[i]}`}
                  draggable={false}
                />
                {esito && <span className="quiz-opzione__nome">{o.testo}</span>}
              </>
            ) : (
              <>
                <Lettera o={o} i={i} stato={stato} esito={!!esito} />
                <span className="quiz-opzione__testo">{o.testo}</span>
              </>
            )}
            {altra && altra.scelta === o.id && (esito || fuori) && (
              <span
                className="quiz-opzione__altro"
                style={{ '--colore': altra.colore } as CSSProperties}
                aria-label={`La risposta di ${altra.nome}`}
              >
                {altra.nome.slice(0, 1).toUpperCase()}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Il bollo a sinistra di una risposta: la lettera, il segno a risposta data,
 * e per i paesi la bandiera — che prima di rispondere, per "di quale stato e'
 * capitale Canberra?", sarebbe un aiuto, e dopo e' una cosa in piu' da imparare.
 */
function Lettera({ o, i, stato, esito }: { o: OpzioneQuiz; i: number; stato: string; esito: boolean }) {
  if (esito && ePaese(o.id)) {
    return (
      <span className="quiz-opzione__lettera is-bandiera" aria-hidden="true">
        <img src={urlBandiera(o.id.toLowerCase(), 80)} alt="" draggable={false} />
      </span>
    )
  }
  return (
    <span className="quiz-opzione__lettera" aria-hidden="true">
      {stato === ' is-giusta' ? <IconCheck size={15} /> : stato === ' is-sbagliata' ? <IconClose size={15} /> : LETTERE[i]}
    </span>
  )
}

/* ──────────────────────────────  La fine  ─────────────────────────────── */

function Fine({
  p,
  classificata,
  onRivedi,
  children,
}: {
  p: VistaPartita
  classificata: boolean
  onRivedi: () => void
  children: ReactNode
}) {
  const primoGiro = p.fatte.filter((f) => !f.ripasso)
  const ripasso = p.fatte.filter((f) => f.ripasso)
  const fuori = fuoriDi(p)
  return (
    <div className="quiz-fine">
      <Scheda
        className="quiz-fine__scheda"
        titolo={p.categoria ? NOMI_CATEGORIE[p.categoria] : 'Quiz'}
        icona={
          p.categoria ? (
            <IconaScheda colore="var(--quiz-1)">
              <IconaCategoria categoria={p.categoria} size={15} />
            </IconaScheda>
          ) : undefined
        }
        destra={
          <Pillola tono="neutra" icona={<IconClock size={13} />}>
            <span className="u-tabnum">{formatCronometro(p.tempoMs)}</span>
          </Pillola>
        }
      >
        <div className="quiz-fine__conto">
          <span className="quiz-fine__giuste u-tabnum">{p.giuste}</span>
          <span className="quiz-fine__su">{fuori ? 'di fila' : `su ${classificata ? p.totale : primoGiro.length}`}</span>
        </div>
        {fuori && (
          <p className="quiz-fine__punti">
            Primo errore alla domanda <strong className="u-tabnum">{primoGiro.length}</strong> di {p.totale}
          </p>
        )}
        {classificata && p.punti !== null && (
          <p className="quiz-fine__punti">
            <strong className="u-tabnum">{p.punti}</strong> punti in classifica
          </p>
        )}
        {ripasso.length > 0 && (
          <p className="quiz-fine__punti">
            Ripasso: <strong className="u-tabnum">{ripasso.filter((f) => f.risposta.giusta).length}</strong>{' '}
            giuste su {ripasso.length}
          </p>
        )}
        <ol className="quiz-fine__caselle" aria-hidden="true">
          {p.fatte.map((f, i) => (
            <li
              key={i}
              className={`${f.risposta.giusta ? 'is-giusta' : 'is-sbagliata'}${f.ripasso ? ' is-ripasso' : ''}`}
              style={{ '--i': i } as CSSProperties}
            >
              {f.risposta.giusta ? <IconCheck size={13} /> : <IconClose size={13} />}
            </li>
          ))}
        </ol>
        <button type="button" className="quiz-fine__rivedi" onClick={onRivedi}>
          Rivedi le risposte
        </button>
      </Scheda>
      <div className="quiz-fine__azioni">{children}</div>
    </div>
  )
}

/** Se la partita l'ha chiusa la morte improvvisa: una sbagliata nel primo giro. */
function fuoriDi(p: VistaPartita): boolean {
  return p.opzioni.morteImprovvisa && p.fatte.some((f) => !f.ripasso && !f.risposta.giusta)
}

function Riepilogo({ fatte }: { fatte: Fatta[] }) {
  return (
    <ol className="quiz-riepilogo">
      {fatte.map((f, i) => {
        const scelta = f.domanda.opzioni.find((o) => o.id === f.risposta.scelta)
        // Se si sceglieva fra bandiere, la risposta giusta si mostra con la sua.
        const giusta = f.domanda.opzioni.find((o) => o.id === f.risposta.corretta)
        const bandieraGiusta = giusta?.bandiera ?? (giusta && ePaese(giusta.id) ? giusta.id.toLowerCase() : undefined)
        return (
          <li key={i} className={`quiz-riepilogo__voce${f.risposta.giusta ? ' is-giusta' : ''}`}>
            <span className="quiz-riepilogo__segno" aria-hidden="true">
              {f.risposta.giusta ? <IconCheck size={14} /> : <IconClose size={14} />}
            </span>
            <span className="quiz-riepilogo__testi">
              <span className="quiz-riepilogo__domanda">
                {f.domanda.bandiera && (
                  <img
                    className="quiz-riepilogo__bandiera"
                    src={urlBandiera(f.domanda.bandiera, 40)}
                    srcSet={`${urlBandiera(f.domanda.bandiera, 80)} 2x`}
                    alt=""
                  />
                )}
                {f.ripasso && <em className="quiz-riepilogo__ripasso">Ripasso · </em>}
                {f.domanda.testo}
              </span>

              <span className="quiz-riepilogo__risposta">
                {bandieraGiusta && (
                  <img
                    className="quiz-riepilogo__bandiera"
                    src={urlBandiera(bandieraGiusta, 40)}
                    srcSet={`${urlBandiera(bandieraGiusta, 80)} 2x`}
                    alt=""
                  />
                )}
                {f.risposta.giusta
                  ? f.risposta.risposta
                  : f.risposta.scelta === null
                    ? `Tempo scaduto · giusta: ${f.risposta.risposta}`
                    : `${scelta ? `${scelta.testo} · ` : ''}giusta: ${f.risposta.risposta}`}
              </span>
              {f.risposta.spiegazione?.voce && (
                <a
                  className="quiz-riepilogo__leggi"
                  href={urlVoce(f.risposta.spiegazione.voce)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {f.risposta.spiegazione.titolo} su Wikipedia
                </a>
              )}
            </span>
            {f.domanda.immagine && (
              <span className="quiz-riepilogo__quadro">
                <Quadro img={f.domanda.immagine} alt="" sizes="56px" />
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
