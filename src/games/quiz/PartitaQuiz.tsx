import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta } from '@/components/Elementi'
import { IconCheck, IconClock, IconClose } from '@/components/Icons'
import { IconaScheda, Pillola, Scheda } from '@/components/Scheda'
import { Sheet } from '@/components/Sheet'
import { formatCronometro } from '@/lib/format'
import { NOMI_CATEGORIE, PUNTI_BASE_QUIZ, SECONDI_CARTINA, SECONDI_SCELTA, type CategoriaQuiz } from '@shared/quiz'
import type { DomandaQuiz } from '@shared/quiz-domande'
import { adesivoFine, adesivoGiusta, adesivoSbagliata, adesivoTempo } from './adesivi'
import { Cartina } from './cartina/Cartina'
import { IconaCategoria } from './icone'
import { VIA_MS, type Fatta, type VistaPartita } from './usePartita'
import './PartitaQuiz.css'

const LETTERE = ['A', 'B', 'C', 'D']

/** Le parole delle categorie, per l'intro: cosa si chiede, in una riga. */
export const DESCRIZIONI: Record<CategoriaQuiz, string> = {
  capitali: 'La capitale di un paese, o il paese di una capitale.',
  bandiere: 'Di chi è una bandiera, o quale bandiera è di chi.',
  cartina: 'Un paese, un mare o un oceano da trovare sulla cartina muta.',
  mari: 'Quale mare bagna un paese, e quale paese bagna un mare.',
  oceani: 'Quale oceano bagna un paese, e quale paese bagna un oceano.',
  fiumi: 'In quale paese scorre un fiume, e quale fiume scorre in un paese.',
  laghi: 'In quale paese si trova un lago, e quale lago si trova in un paese.',
}

/** Le larghezze che flagcdn tiene pronte, fra quelle che servono qui. */
export function urlBandiera(codice: string, larghezza: 40 | 80 | 160 | 320 | 640 = 320): string {
  return `https://flagcdn.com/w${larghezza}/${codice}.png`
}

/** Le due misure di una bandiera, per `srcSet`: il browser prende quella che serve allo schermo. */
function misureBandiera(codice: string, piccola: 160 | 320, grande: 320 | 640): string {
  return `${urlBandiera(codice, piccola)} ${piccola}w, ${urlBandiera(codice, grande)} ${grande}w`
}

interface Props {
  p: VistaPartita
  /** La classificata ha i punti; la libera no. */
  classificata: boolean
  /** Sotto il risultato: i bottoni che portano via. */
  azioniFine: ReactNode
  /** Il titolo dell'intro e il suo bottone, se non sono quelli del quiz di oggi. */
  intro?: { titolo: string; sotto?: string; azione: string }
}

/**
 * La partita del quiz, fase per fase: intro, tre-due-uno, domande, fine.
 *
 * Una schermata che non scorre, come gli altri giochi: la testata con il
 * numero della domanda e il tempo, la carta della domanda — il testo, e la
 * bandiera o la cartina — e sotto le quattro risposte, grandi come tasti. Si
 * sceglie con un tocco, o con 1-4 e A-D dalla tastiera.
 */
export function PartitaQuiz({ p, classificata, azioniFine, intro }: Props) {
  const { adesivo, accoda } = useCodaAdesivi()
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
  const quota = p.totale > 0 ? p.giuste / p.totale : 0
  const festa = useFesta(inCorso, p.fase === 'fine' && quota >= 0.7)
  const finita = useFesta(inCorso, p.fase === 'fine')
  const conto = useRef({ giuste: p.giuste, totale: p.totale, punti: p.punti })
  conto.current = { giuste: p.giuste, totale: p.totale, punti: p.punti }
  useEffect(() => {
    if (!finita) return
    const { giuste, totale, punti } = conto.current
    accoda(adesivoFine(giuste, totale, classificata ? punti : null))
  }, [finita, accoda, classificata])

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

      {p.fase === 'intro' && p.categoria && (
        <Intro categoria={p.categoria} totale={p.totale} fatte={p.fatte.length} intro={intro} onVia={p.comincia} />
      )}

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

function Intro({
  categoria,
  totale,
  fatte,
  intro,
  onVia,
}: {
  categoria: CategoriaQuiz
  totale: number
  fatte: number
  intro?: Props['intro']
  onVia: () => void
}) {
  const ripresa = fatte > 0
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
      <p className="quiz-intro__testo">{DESCRIZIONI[categoria]}</p>
      <div className="quiz-intro__regole">
        <span>
          <strong className="u-tabnum">{totale}</strong> domande
        </span>
        <span>
          <strong className="u-tabnum">{categoria === 'cartina' ? SECONDI_CARTINA : SECONDI_SCELTA}</strong> secondi
          l’una
        </span>
      </div>
      <Button size="lg" fullWidth onClick={onVia}>
        {ripresa ? `Riprendi dalla ${fatte + 1}ª domanda` : (intro?.azione ?? 'Comincia')}
      </Button>
    </div>
  )
}

/** Tre, due, uno, via: numeri che saltano fuori uno dopo l'altro. */
function Via({ categoria }: { categoria: CategoriaQuiz }) {
  return (
    <div className="quiz-via" style={{ '--via': `${VIA_MS}ms` } as CSSProperties}>
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

  // Da tastiera, su computer: 1-4 o A-D per rispondere, Invio per confermare sulla cartina.
  const { rispondi } = p
  useEffect(() => {
    if (!d || esito) return
    const tasto = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (d.cartina) {
        if (e.key === 'Enter' && sceltaCartina) rispondi(sceltaCartina)
        return
      }
      if (e.key.length !== 1) return
      const i = '1234'.includes(e.key) ? '1234'.indexOf(e.key) : 'abcd'.indexOf(e.key.toLowerCase())
      if (i >= 0 && d.opzioni[i]) {
        e.preventDefault()
        rispondi(d.opzioni[i].id)
      }
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [d, esito, rispondi, sceltaCartina])

  // Il tempo finisce: la risposta e' "nessuna".
  useEffect(() => {
    if (p.fase !== 'domanda' || p.scade === null) return
    const t = setTimeout(() => rispondi(null), Math.max(0, p.scade - performance.now()))
    return () => clearTimeout(t)
  }, [p.fase, p.scade, rispondi])

  if (!d) return <div className="quiz__attesa" aria-hidden="true" />

  const forma = d.cartina ? ' is-cartina' : d.bandiera ? ' is-bandiera' : ' is-testo'
  const com = esito ? (esito.risposta.giusta ? ' is-giusta' : ' is-sbagliata') : ''

  return (
    <>
      <Scheda
        className="quiz__tabellone"
        titolo={`Domanda ${Math.min(p.indice + 1, p.totale)} di ${p.totale}`}
        icona={
          <IconaScheda colore="var(--quiz-1)">
            <IconaCategoria categoria={categoria} size={15} />
          </IconaScheda>
        }
        destra={<Tempo p={p} />}
      >
        <Progresso p={p} />
      </Scheda>

      {/* Chiavi diverse per carta e risposte: sono fratelle, e con la stessa chiave
          React non saprebbe quale togliere, e la carta vecchia resterebbe. */}
      <section key={`carta-${p.indice}`} className={`quiz-carta${forma}${com}`} aria-live="polite">
        {!d.cartina && !d.bandiera && (
          <span className="quiz-carta__emblema" aria-hidden="true">
            <IconaCategoria categoria={categoria} size={40} />
          </span>
        )}
        <p className="quiz-carta__testo">{d.testo}</p>
        {d.bandiera && (
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
        {d.cartina && (
          <Cartina
            vista={d.cartina.vista}
            strato={d.cartina.strato}
            scelta={sceltaCartina}
            onScegli={esito ? undefined : setSceltaCartina}
            esito={
              esito
                ? {
                    giusta: esito.risposta.corretta,
                    accettate: esito.accettate ?? [],
                    scelta: esito.risposta.scelta,
                  }
                : null
            }
            etichetta={d.testo}
          />
        )}
      </section>

      {d.cartina ? (
        <div className="quiz-conferma">
          {esito ? (
            <p className={`quiz-conferma__esito${esito.risposta.giusta ? ' is-giusta' : ''}`}>
              {esito.risposta.giusta
                ? 'Trovato!'
                : `${esito.risposta.scelta === null ? 'Tempo scaduto' : 'Sbagliato'} · in verde: ${esito.risposta.risposta}`}
            </p>
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
      ) : (
        <Opzioni key={`opzioni-${p.indice}`} d={d} esito={esito} inviando={p.inviando} onScegli={rispondi} />
      )}
    </>
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
  const restante = p.scade === null ? 0 : Math.max(0, p.scade - adesso)
  const secondi = Math.ceil(restante / 1000)
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
  return (
    <div className="quiz-progresso">
      <ol className="quiz-progresso__caselle" aria-label={`${p.fatte.length} risposte date su ${p.totale}`}>
        {Array.from({ length: p.totale }, (_, i) => {
          const f = p.fatte[i]
          const classe = f ? (f.risposta.giusta ? ' is-giusta' : ' is-sbagliata') : i === p.indice ? ' is-corrente' : ''
          return <li key={i} className={`quiz-progresso__casella${classe}`} />
        })}
      </ol>
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
function Miccia({ scadenza, ferma, limiteMs }: { scadenza: number | null; ferma: boolean; limiteMs: number }) {
  const [misura] = useState(() => {
    const restante = scadenza === null ? 0 : Math.max(0, scadenza - performance.now())
    return { da: Math.min(1, restante / limiteMs), durata: restante }
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

function Opzioni({
  d,
  esito,
  inviando,
  onScegli,
}: {
  d: DomandaQuiz
  esito: Fatta | null
  inviando: boolean
  onScegli: (id: string) => void
}) {
  const [scelta, setScelta] = useState<string | null>(null)
  const bandiere = d.opzioni.some((o) => o.bandiera)
  const lunghe = d.opzioni.some((o) => o.testo.length > 18)
  return (
    <div className={`quiz-opzioni${bandiere ? ' is-bandiere' : ''}${lunghe && !bandiere ? ' is-lunghe' : ''}`}>
      {d.opzioni.map((o, i) => {
        let stato = ''
        if (esito) {
          if (o.id === esito.risposta.corretta) stato = ' is-giusta'
          else if (o.id === esito.risposta.scelta) stato = ' is-sbagliata'
          else stato = ' is-spenta'
        } else if (inviando && o.id === scelta) {
          stato = ' is-scelta'
        }
        return (
          <button
            key={o.id}
            type="button"
            className={`quiz-opzione${stato}`}
            style={{ '--i': i } as CSSProperties}
            disabled={!!esito || inviando}
            onClick={() => {
              setScelta(o.id)
              onScegli(o.id)
            }}
          >
            {o.bandiera ? (
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
                <span className="quiz-opzione__lettera" aria-hidden="true">
                  {stato === ' is-giusta' ? (
                    <IconCheck size={15} />
                  ) : stato === ' is-sbagliata' ? (
                    <IconClose size={15} />
                  ) : (
                    LETTERE[i]
                  )}
                </span>
                <span className="quiz-opzione__testo">{o.testo}</span>
              </>
            )}
          </button>
        )
      })}
    </div>
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
          <span className="quiz-fine__su">su {p.totale}</span>
        </div>
        {classificata && p.punti !== null && (
          <p className="quiz-fine__punti">
            <strong className="u-tabnum">{p.punti}</strong> punti in classifica
          </p>
        )}
        <ol className="quiz-fine__caselle" aria-hidden="true">
          {p.fatte.map((f, i) => (
            <li
              key={i}
              className={f.risposta.giusta ? 'is-giusta' : 'is-sbagliata'}
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

function Riepilogo({ fatte }: { fatte: Fatta[] }) {
  return (
    <ol className="quiz-riepilogo">
      {fatte.map((f, i) => {
        const scelta = f.domanda.opzioni.find((o) => o.id === f.risposta.scelta)
        // Se si sceglieva fra bandiere, la risposta giusta si mostra con la sua.
        const giusta = f.domanda.opzioni.find((o) => o.id === f.risposta.corretta)
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
                {f.domanda.testo}
              </span>
              <span className="quiz-riepilogo__risposta">
                {giusta?.bandiera && (
                  <img
                    className="quiz-riepilogo__bandiera"
                    src={urlBandiera(giusta.bandiera, 40)}
                    srcSet={`${urlBandiera(giusta.bandiera, 80)} 2x`}
                    alt=""
                  />
                )}
                {f.risposta.giusta
                  ? f.risposta.risposta
                  : f.risposta.scelta === null
                    ? `Tempo scaduto · giusta: ${f.risposta.risposta}`
                    : `${scelta ? `${scelta.testo} · ` : ''}giusta: ${f.risposta.risposta}`}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
