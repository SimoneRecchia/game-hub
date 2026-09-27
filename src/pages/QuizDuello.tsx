import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta } from '@/components/Elementi'
import { IconCheck, IconClock, IconClose, IconFlag, IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { IconaScheda, Pillola, Scheda } from '@/components/Scheda'
import { Sheet } from '@/components/Sheet'
import { usePlayer } from '@/lib/auth'
import { ApiFetchError } from '@/lib/api'
import { NOMI_CATEGORIE, NOMI_MODI } from '@shared/quiz'
import type { CittaQuiz } from '@shared/quiz-dati'
import type { DomandaQuiz } from '@shared/quiz-domande'
import { RALLENTY, secondiMostrati } from '@shared/quiz-sfida'
import type { GiroQuizVisto, VistaDuello } from '@shared/types'
import {
  CartaDomanda,
  CartinaDellaPartita,
  Miccia,
  Opzioni,
  Via,
  type ContestoCartina,
} from '@/games/quiz/PartitaQuiz'
import { caricaCitta } from '@/games/quiz/citta'
import { ComeSiGiocaQuiz } from '@/games/quiz/ComeSiGioca'
import { useIndiceQuiz } from '@/games/quiz/dati'
import { IconaCategoria } from '@/games/quiz/icone'
import { nomeArea } from '@/games/quiz/testi'
import type { Fatta } from '@/games/quiz/usePartita'
import {
  adesivoFineDuello,
  adesivoFuori,
  adesivoNessuno,
  adesivoPunto,
  adesivoRallenty,
} from '@/games/quiz/sfida/adesivi'
import { useDuello, type Duello } from '@/games/quiz/sfida/useDuello'
import '@/games/quiz/PartitaQuiz.css'
import '@/games/quiz/sfida/Duello.css'
import './Battaglia.css'

const NESSUNO: ReadonlySet<string> = new Set()
const LETTERE = 'abcdef'

/**
 * La sfida a quiz fra due giocatori: le stesse domande nello stesso momento.
 *
 * Il primo che risponde giusto prende il punto. Chi sbaglia e' fuori dalla
 * domanda, e all'altro il tempo va al rallentatore: l'orologio segna gli
 * stessi secondi, e scende alla meta' — la schermata si fa fredda, la miccia
 * brucia piano. Fra una domanda e l'altra la risposta giusta, con la cartina
 * che insegna; alla fine chi ha vinto, il conto della serie, e "Gioca ancora".
 */
export default function QuizDuello() {
  const { id = '' } = useParams()
  // Un duello, una pagina: la rivincita arriva allo stesso indirizzo con un altro id, e riparte da capo.
  return <Duello key={id} id={id} />
}

function Duello({ id }: { id: string }) {
  const { vai } = useNavigazione()
  const d = useDuello(id)
  const v = d.vista
  const imp = v?.impostazioni ?? null

  // I dati del quiz servono alla cartina, e le città alla categoria delle città.
  const serveIndice = !!imp && (imp.modo === 'cartina' || imp.imparo)
  const ix = useIndiceQuiz(serveIndice)
  const [citta, setCitta] = useState<CittaQuiz[] | null>(null)
  useEffect(() => {
    if (!imp || imp.categoria !== 'citta' || !ix) return
    let vivo = true
    caricaCitta(ix, imp.area)
      .then((c) => vivo && setCitta(c))
      .catch(() => vivo && setCitta([]))
    return () => {
      vivo = false
    }
  }, [imp, ix])
  const datiPronti = !!imp && (!serveIndice || !!ix) && (imp.categoria !== 'citta' || citta !== null)

  // Sono arrivato: quando lo e' anche l'altro, comincia il tre-due-uno.
  const segnato = useRef<string | null>(null)
  const { pronto } = d
  useEffect(() => {
    if (!v || !datiPronti || v.stato !== 'attesa' || v.pronti.io || segnato.current === v.id) return
    segnato.current = v.id
    pronto()
  }, [v, datiPronti, pronto])

  // La rivincita accettata, da chiunque: si va tutti e due al duello nuovo.
  const nuovo = v?.rivincita?.stato === 'accettata' ? v.rivincita.duelloId : null
  useEffect(() => {
    if (nuovo) vai(ROTTE.duelloQuiz(nuovo), { replace: true, direzione: 'nessuna' })
  }, [nuovo, vai])

  const contesto: ContestoCartina | null = useMemo(
    () =>
      imp
        ? {
            area: imp.area,
            citta,
            opzioni: {
              soloZona: imp.soloZona,
              nomiPaesi: imp.nomiPaesi,
              evidenzia: imp.evidenzia,
              imparo: imp.imparo,
            },
          }
        : null,
    [imp, citta],
  )

  const { adesivo, accoda, subito } = useCodaAdesivi()
  useAdesiviDelDuello(d, accoda, subito)

  const inCorso = d.fase === 'caricamento' || d.fase === 'errore' ? null : d.fase !== 'fine' && d.fase !== 'uscito'
  const festa = useFesta(inCorso, d.fase === 'fine' && !!v && v.punti.io > v.punti.avversario)

  // Al rallentatore: il mio tempo scorre alla meta', e la schermata lo dice.
  const lento = d.fase === 'domanda' && !!v?.domanda?.lentoIo && !v.domanda.mia
  const [regole, setRegole] = useState(false)
  const [resa, setResa] = useState(false)
  const inGioco = d.fase === 'attesa' || d.fase === 'via' || d.fase === 'domanda' || d.fase === 'pausa'

  return (
    <Pagina
      titolo="Sfida a quiz"
      intera
      indietro={{ a: ROTTE.libera('quiz'), etichetta: 'Quiz' }}
      azioni={
        <>
          {inGioco && (
            <BottoneBarra etichetta="Abbandona la sfida" onClick={() => setResa(true)}>
              <IconFlag size={19} />
            </BottoneBarra>
          )}
          <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
        </>
      }
    >
      <div className={`quiz duello${lento ? ' is-rallenty' : ''}`}>
        {lento && <span className="duello__velo" aria-hidden="true" />}
        {(d.fase === 'caricamento' || (d.fase !== 'errore' && !datiPronti)) && (
          <div className="quiz__attesa" aria-hidden="true" />
        )}
        {d.fase === 'errore' && (
          <div className="quiz__ripiego">
            <p>{d.errore ?? 'Questa sfida non si apre.'}</p>
            <Button variant="tinted" onClick={() => vai(ROTTE.libera('quiz'))}>
              Torna al quiz
            </Button>
          </div>
        )}
        {v && datiPronti && contesto && (
          <>
            {d.fase === 'attesa' && (
              <Attesa
                v={v}
                onEsci={async () => {
                  await d.esci()
                  vai(ROTTE.libera('quiz'))
                }}
              />
            )}
            {d.fase === 'via' && (
              <Via
                categoria={v.impostazioni.categoria}
                durata={Math.max(1_200, (v.prossimaAt ?? 0) - d.oraServer())}
              />
            )}
            {(d.fase === 'domanda' || d.fase === 'pausa') && <Gioco d={d} v={v} ix={ix} contesto={contesto} />}
            {(d.fase === 'fine' || d.fase === 'uscito') && <Fine d={d} v={v} />}
          </>
        )}
      </div>
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
      <ComeSiGiocaQuiz open={regole} onClose={() => setRegole(false)} />
      <Sheet open={resa} onClose={() => setResa(false)} title="Abbandonare la sfida?">
        <div className="bat-resa">
          <p>La sfida finisce qui.</p>
          <Button
            variant="destructive"
            size="lg"
            fullWidth
            onClick={() => {
              setResa(false)
              void d.esci()
            }}
          >
            Abbandona
          </Button>
          <Button variant="plain" size="lg" fullWidth onClick={() => setResa(false)}>
            Continua a giocare
          </Button>
        </div>
      </Sheet>
    </Pagina>
  )
}

/* ──────────────────────────────  Gli adesivi  ─────────────────────────── */

/**
 * Gli adesivi dei momenti che contano: il punto di una domanda appena chiusa,
 * il rallenty quando l'altro sbaglia, il mio errore, la fine. Solo per quel che
 * si e' visto succedere: riaprire un duello a meta' non rifà i punti di prima.
 */
function useAdesiviDelDuello(
  d: Duello,
  accoda: ReturnType<typeof useCodaAdesivi>['accoda'],
  subito: ReturnType<typeof useCodaAdesivi>['subito'],
) {
  const v = d.vista
  const nome = v?.avversario.displayName ?? ''
  const visti = useRef<number | null>(null)
  const giri = d.giri
  useEffect(() => {
    if (!v) return
    if (visti.current === null) {
      visti.current = giri.length
      return
    }
    if (giri.length <= visti.current) return
    visti.current = giri.length
    const g = giri[giri.length - 1]
    if (g.punto === null) accoda(adesivoNessuno(g.risposta))
    else accoda(adesivoPunto(g.punto === 'io', nome, g.risposta))
  }, [giri, v, nome, accoda])

  const domanda = v?.domanda ?? null
  const segnati = useRef(new Set<string>())
  useEffect(() => {
    if (!domanda) return
    const chiave = (cosa: string) => `${domanda.indice}:${cosa}`
    if (domanda.mia && !segnati.current.has(chiave('fuori'))) {
      segnati.current.add(chiave('fuori'))
      accoda(adesivoFuori(nome))
    } else if (domanda.lentoIo !== null && !domanda.mia && !segnati.current.has(chiave('lento'))) {
      segnati.current.add(chiave('lento'))
      accoda(adesivoRallenty(nome))
    }
  }, [domanda, nome, accoda])

  const vistoInCorso = useRef(false)
  if (d.fase === 'domanda' || d.fase === 'pausa' || d.fase === 'via') vistoInCorso.current = true
  const finito = d.fase === 'fine' && vistoInCorso.current
  useEffect(() => {
    if (!finito || !v) return
    subito(adesivoFineDuello(v.punti.io, v.punti.avversario, v.avversario.displayName))
    // Una volta sola: la fine resta la fine.
    vistoInCorso.current = false
  }, [finito, v, subito])
}

/* ───────────────────────────────  L'attesa  ───────────────────────────── */

function Attesa({ v, onEsci }: { v: VistaDuello; onEsci: () => void }) {
  return (
    <div className="duello-attesa">
      <span className="duello-attesa__avatar">
        <Avatar nickname={v.avversario.nickname} color={v.avversario.avatarColor} size={72} />
      </span>
      <p className="duello-attesa__titolo">Aspetto {v.avversario.displayName}…</p>
      <p className="duello-attesa__testo">
        {NOMI_CATEGORIE[v.impostazioni.categoria]} · {NOMI_MODI[v.impostazioni.modo]} · {v.totale} domande
      </p>
      <Button variant="tinted" onClick={onEsci}>
        Annulla la sfida
      </Button>
    </div>
  )
}

/* ────────────────────────────────  Il gioco  ──────────────────────────── */

/** La risposta di una domanda chiusa, nella forma della partita: e' quel che mostrano risposte e cartina. */
function fattaDi(g: GiroQuizVisto): Fatta {
  return {
    domanda: g.domanda,
    risposta: {
      scelta: g.mia?.scelta ?? null,
      giusta: g.mia?.giusta ?? false,
      corretta: g.corretta,
      risposta: g.risposta,
      ms: 0,
      ...(g.luogo ? { luogo: g.luogo } : {}),
      ...(g.accettate ? { accettate: g.accettate } : {}),
    },
    accettate: g.accettate ?? (g.mia?.giusta ? [g.mia.scelta] : []),
  }
}

function Gioco({
  d,
  v,
  ix,
  contesto,
}: {
  d: Duello
  v: VistaDuello
  ix: ReturnType<typeof useIndiceQuiz>
  contesto: ContestoCartina
}) {
  const aperta = d.fase === 'domanda' ? v.domanda : null
  const giro = d.fase === 'pausa' ? (d.giri[d.giri.length - 1] ?? null) : null
  const domanda: DomandaQuiz | null = aperta?.domanda ?? giro?.domanda ?? null
  const indice = aperta?.indice ?? giro?.indice ?? 0
  const fatta = useMemo(() => (giro ? fattaDi(giro) : null), [giro])
  const [sceltaCartina, setSceltaCartina] = useState<string | null>(null)
  useEffect(() => setSceltaCartina(null), [indice])

  const fuori = aperta?.mia ?? null
  const puoRispondere = !!aperta && !fuori && !d.inviando
  const { rispondi } = d

  // Da tastiera: 1-6 o A-F per rispondere, Invio per confermare sulla cartina.
  useEffect(() => {
    if (!aperta || !puoRispondere) return
    const tasto = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (aperta.domanda.cartina) {
        if (e.key === 'Enter' && sceltaCartina) rispondi(sceltaCartina)
        return
      }
      if (e.key.length !== 1) return
      const i = '123456'.includes(e.key) ? '123456'.indexOf(e.key) : LETTERE.indexOf(e.key.toLowerCase())
      const o = aperta.domanda.opzioni[i]
      if (i >= 0 && o) {
        e.preventDefault()
        rispondi(o.id)
      }
    }
    window.addEventListener('keydown', tasto)
    return () => window.removeEventListener('keydown', tasto)
  }, [aperta, puoRispondere, sceltaCartina, rispondi])

  if (!domanda) return <div className="quiz__attesa" aria-hidden="true" />
  const sullaCartina = !!domanda.cartina
  const rivela = contesto.opzioni.imparo && !!fatta && !sullaCartina
  const esito = giro ? (giro.punto === 'io' ? ' is-giusta' : giro.mia && !giro.mia.giusta ? ' is-sbagliata' : '') : ''
  const altra = { scelta: giro?.sua?.scelta ?? null, nome: v.avversario.displayName, colore: v.avversario.avatarColor }

  return (
    <>
      <Tabellone d={d} v={v} indice={indice} giro={giro} />

      <CartaDomanda
        key={`carta-${indice}`}
        d={domanda}
        categoria={v.impostazioni.categoria}
        esito={esito}
        rivela={rivela}
        cartina={
          rivela && fatta ? (
            <CartinaDellaPartita c={contesto} ix={ix} d={domanda} scelta={null} fatta={fatta} guarda />
          ) : null
        }
      />

      {sullaCartina ? (
        <>
          {/* La cartina resta la stessa per tutto il duello: la vista non salta sulla risposta. */}
          <div className="quiz-mappa">
            <CartinaDellaPartita
              c={contesto}
              ix={ix}
              d={domanda}
              scelta={fuori ?? sceltaCartina}
              onScegli={puoRispondere ? setSceltaCartina : undefined}
              fatta={fatta}
            />
          </div>
          <div className="quiz-conferma">
            {aperta && !fuori ? (
              <Button
                size="lg"
                fullWidth
                disabled={!sceltaCartina}
                loading={d.inviando}
                onClick={() => sceltaCartina && rispondi(sceltaCartina)}
              >
                {sceltaCartina ? 'È qui' : 'Tocca la cartina'}
              </Button>
            ) : (
              <p className={`quiz-conferma__esito${giro?.punto === 'io' ? ' is-giusta' : ''}`}>
                {giro
                  ? `${notiziaDelGiro(giro, v.avversario.displayName)} · giusta: ${giro.risposta}`
                  : `Sbagliato: ora tocca a ${v.avversario.displayName}`}
              </p>
            )}
          </div>
        </>
      ) : (
        <Opzioni
          key={`opzioni-${indice}`}
          d={domanda}
          esito={fatta}
          inviando={d.inviando}
          esclusi={NESSUNO}
          compatte={rivela}
          onScegli={(scelta) => puoRispondere && rispondi(scelta)}
          fuori={fuori}
          altra={altra}
        />
      )}
    </>
  )
}

function notiziaDelGiro(g: GiroQuizVisto, nome: string): string {
  if (g.punto === 'io') return 'Punto a te'
  if (g.punto === 'avversario') return `Punto a ${nome}`
  return 'Nessun punto'
}

/**
 * La testata del duello: la domanda e il tempo, i due con i loro punti, le
 * caselle delle domande — verdi le mie, rosse quelle dell'altro — e la miccia,
 * che al rallentatore brucia piano. Sotto, in una riga sola, la notizia: non
 * galleggia sopra le risposte.
 */
function Tabellone({ d, v, indice, giro }: { d: Duello; v: VistaDuello; indice: number; giro: GiroQuizVisto | null }) {
  const io = usePlayer()
  const aperta = d.fase === 'domanda' ? v.domanda : null
  const [, batti] = useState(0)
  useEffect(() => {
    if (!aperta) return
    const t = setInterval(() => batti((n) => n + 1), 250)
    return () => clearInterval(t)
  }, [aperta])

  const adesso = d.oraServer()
  const lentoIo = !!aperta?.lentoIo && !aperta.mia
  const restaIo = aperta ? aperta.scadeIo - adesso : 0
  const secondi = secondiMostrati(restaIo, lentoIo)
  let destra
  if (giro) {
    destra = (
      <Pillola
        tono={giro.punto === 'io' ? 'buona' : giro.punto === 'avversario' ? 'cattiva' : 'neutra'}
        icona={
          giro.punto === 'io' ? <IconCheck size={13} /> : giro.punto ? <IconClose size={13} /> : <IconClock size={13} />
        }
      >
        {giro.punto === 'io' ? 'Punto tuo' : giro.punto ? `A ${v.avversario.displayName}` : 'Nessun punto'}
      </Pillola>
    )
  } else if (aperta?.mia) {
    destra = (
      <Pillola tono="cattiva" icona={<IconClose size={13} />}>
        Fuori
      </Pillola>
    )
  } else {
    destra = (
      <Pillola tono={secondi <= 5 ? 'cattiva' : 'neutra'} icona={lentoIo ? <Chiocciola /> : <IconClock size={13} />}>
        <span className="u-tabnum">{aperta ? `${secondi} s` : '…'}</span>
        {lentoIo && <span className="duello-lento">×½</span>}
      </Pillola>
    )
  }

  const notizia = notiziaDiAdesso(v, aperta, giro)
  return (
    <Scheda
      className="quiz__tabellone duello-tabellone"
      titolo={
        <>
          <span className="quiz-titolo__parola">Domanda </span>
          {indice + 1} di {v.totale}
        </>
      }
      icona={
        <IconaScheda colore="var(--quiz-1)">
          <IconaCategoria categoria={v.impostazioni.categoria} size={15} />
        </IconaScheda>
      }
      destra={destra}
    >
      <div className="duello-punti">
        <Giocatore
          nome="Tu"
          nickname={io.nickname}
          colore={io.avatarColor}
          punti={v.punti.io}
          stato={aperta?.mia ? 'fuori' : null}
        />
        <span className="duello-punti__contro" aria-hidden="true">
          –
          {v.serie.partite > 0 && (
            <em className="duello-punti__serie u-tabnum">
              serie {v.serie.io + v.punti.io}–{v.serie.avversario + v.punti.avversario}
            </em>
          )}
        </span>
        <Giocatore
          nome={v.avversario.displayName}
          nickname={v.avversario.nickname}
          colore={v.avversario.avatarColor}
          punti={v.punti.avversario}
          stato={aperta?.avversarioFuori ? 'fuori' : aperta?.lentoAvversario ? 'lento' : null}
          secondi={aperta?.lentoAvversario ? secondiMostrati(aperta.scadeAvversario - adesso, true) : null}
          destra
        />
      </div>
      <ol className="quiz-progresso__caselle duello-caselle" aria-label="Le domande della sfida">
        {Array.from({ length: v.totale }, (_, i) => {
          const g = d.giri.find((x) => x.indice === i)
          const classe = g
            ? g.punto === 'io'
              ? ' is-giusta'
              : g.punto === 'avversario'
                ? ' is-sbagliata'
                : ' is-nessuno'
            : i === indice
              ? ' is-corrente'
              : ''
          return <li key={i} className={`quiz-progresso__casella${classe}`} />
        })}
      </ol>
      {aperta && (
        <Miccia
          key={`${aperta.indice}-${lentoIo ? 'lenta' : 'va'}-${aperta.mia ? 'fuori' : ''}`}
          scadenza={performance.now() + restaIo}
          ferma={!!aperta.mia}
          limiteMs={aperta.limiteMs}
          fattore={lentoIo ? RALLENTY : 1}
        />
      )}
      <p className={`duello-notizia${lentoIo ? ' is-lenta' : ''}`} aria-live="polite">
        {notizia}
      </p>
    </Scheda>
  )
}

function notiziaDiAdesso(v: VistaDuello, aperta: VistaDuello['domanda'], giro: GiroQuizVisto | null): string {
  const nome = v.avversario.displayName
  if (giro) {
    if (giro.punto === 'io') {
      return giro.sua && !giro.sua.giusta ? `${nome} aveva sbagliato` : 'Hai risposto prima tu'
    }
    if (giro.punto === 'avversario') {
      return giro.mia && !giro.mia.giusta ? 'Hai sbagliato' : `${nome} ha risposto prima`
    }
    return giro.mia || giro.sua ? 'Avete sbagliato tutti e due' : 'Tempo scaduto'
  }
  if (!aperta) return ''
  if (aperta.mia) return `Hai sbagliato: il tempo di ${nome} rallenta`
  if (aperta.lentoIo) return `${nome} ha sbagliato: il tuo tempo rallenta`
  return 'Chi risponde giusto per primo prende il punto'
}

function Giocatore({
  nome,
  nickname,
  colore,
  punti,
  stato,
  secondi = null,
  destra = false,
}: {
  nome: string
  nickname: string
  colore: string
  punti: number
  stato: 'fuori' | 'lento' | null
  /** Il tempo dell'altro al rallentatore, quando sono io quello fuori: lo guardo scendere piano. */
  secondi?: number | null
  destra?: boolean
}) {
  return (
    <span className={`duello-giocatore${destra ? ' is-destra' : ''}${stato ? ` is-${stato}` : ''}`}>
      <Avatar nickname={nickname} color={colore} size={28} />
      <span className="duello-giocatore__nome">{nome}</span>
      {secondi !== null && <span className="duello-giocatore__tempo u-tabnum">{secondi} s</span>}
      <strong key={punti} className="duello-giocatore__punti u-tabnum">
        {punti}
      </strong>
      {stato === 'lento' && (
        <span className="duello-giocatore__segno" aria-label="al rallentatore">
          <Chiocciola />
        </span>
      )}
      {stato === 'fuori' && (
        <span className="duello-giocatore__segno is-fuori" aria-label="ha sbagliato">
          <IconClose size={11} />
        </span>
      )}
    </span>
  )
}

/** La chiocciola del rallenty, piccola: nella pillola del tempo e accanto a chi va piano. */
function Chiocciola() {
  return (
    <svg className="duello-chiocciola" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="M3 18c0-1.2 1-1.8 2.4-1.8h9.4c1.6 0 2.4-1.2 2.8-2.8.2-.8 1-1.2 1.6-.8.6.4.6 1.2.2 2-.8 2-2 3.4-4 3.4H3z"
        fill="currentColor"
      />
      <circle cx="10" cy="11.5" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M10 11.5c0-1 1.3-1.2 1.7-.4.6 1-.3 2.4-1.7 2.4-2 0-2.8-2-2.2-3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M18.6 13l-.8-3.4M20.2 13l1-3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/* ────────────────────────────────  La fine  ───────────────────────────── */

function Fine({ d, v }: { d: Duello; v: VistaDuello }) {
  const { vai } = useNavigazione()
  const player = usePlayer()
  const ix = useIndiceQuiz(v.impostazioni.area.startsWith('paese:'))
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const io = v.punti.io
  const lui = v.punti.avversario
  const nome = v.avversario.displayName
  const uscito = d.fase === 'uscito'
  const titolo = uscito
    ? v.uscito === 'io'
      ? 'Hai lasciato la sfida'
      : v.uscito === 'avversario'
        ? `${nome} ha lasciato la sfida`
        : 'La sfida non è cominciata'
    : io > lui
      ? 'Hai vinto!'
      : io < lui
        ? `Ha vinto ${nome}`
        : 'Pareggio'
  const serie =
    v.serie.partite > 0 ? { io: v.serie.io + io, lui: v.serie.avversario + lui, partite: v.serie.partite + 1 } : null
  const r = v.rivincita

  const fai = async (azione: () => Promise<string | null | void>) => {
    setOccupato(true)
    setErrore(null)
    try {
      const nuovo = await azione()
      if (typeof nuovo === 'string') vai(ROTTE.duelloQuiz(nuovo), { replace: true, direzione: 'nessuna' })
    } catch (e) {
      setErrore(e instanceof ApiFetchError || e instanceof Error ? e.message : 'Qualcosa è andato storto. Riprova.')
    } finally {
      setOccupato(false)
    }
  }

  return (
    <div className="quiz-fine duello-fine">
      <Scheda
        className="quiz-fine__scheda"
        titolo={NOMI_CATEGORIE[v.impostazioni.categoria]}
        icona={
          <IconaScheda colore="var(--quiz-1)">
            <IconaCategoria categoria={v.impostazioni.categoria} size={15} />
          </IconaScheda>
        }
        destra={<Pillola tono="neutra">{nomeArea(v.impostazioni.area, ix)}</Pillola>}
      >
        <p className="duello-fine__titolo">{titolo}</p>
        <div className="duello-fine__conto">
          <span className="duello-fine__lato">
            <Avatar nickname={player.nickname} color={player.avatarColor} size={44} />
            <strong className="u-tabnum">{io}</strong>
            <em>Tu</em>
          </span>
          <span className="duello-fine__contro" aria-hidden="true">
            –
          </span>
          <span className="duello-fine__lato">
            <Avatar nickname={v.avversario.nickname} color={v.avversario.avatarColor} size={44} />
            <strong className="u-tabnum">{lui}</strong>
            <em>{nome}</em>
          </span>
        </div>
        {serie && (
          <p className="quiz-fine__punti">
            Nella serie: <strong className="u-tabnum">{serie.io}</strong> a{' '}
            <strong className="u-tabnum">{serie.lui}</strong> in {serie.partite} partite
          </p>
        )}
        <ol className="quiz-fine__caselle" aria-hidden="true">
          {d.giri.map((g, i) => (
            <li
              key={g.indice}
              className={g.punto === 'io' ? 'is-giusta' : g.punto === 'avversario' ? 'is-sbagliata' : 'is-nessuno'}
              style={{ '--i': i } as CSSProperties}
            >
              {g.punto === 'io' ? <IconCheck size={13} /> : g.punto ? <IconClose size={13} /> : '·'}
            </li>
          ))}
        </ol>
        <p className="duello-fine__nota">Non conta per la classifica.</p>
      </Scheda>

      <div className="quiz-fine__azioni">
        {!uscito && r?.stato === 'attesa' && r.da === 'avversario' ? (
          <>
            <p className="duello-fine__rivincita">
              <strong>{nome}</strong> vuole la rivincita.
            </p>
            <Button size="lg" fullWidth loading={occupato} onClick={() => fai(d.accettaRivincita)}>
              Accetta la rivincita
            </Button>
            <Button variant="tinted" size="lg" fullWidth disabled={occupato} onClick={() => fai(d.rifiutaRivincita)}>
              No, grazie
            </Button>
          </>
        ) : !uscito && r?.stato === 'attesa' && r.da === 'io' ? (
          <>
            <p className="duello-fine__rivincita">Aspetto la risposta di {nome}…</p>
            <Button variant="tinted" size="lg" fullWidth onClick={() => vai(ROTTE.libera('quiz'))}>
              Esci
            </Button>
          </>
        ) : (
          <>
            {!uscito && r?.stato === 'rifiutata' && (
              <p className="duello-fine__rivincita">
                {r.da === 'io' ? `${nome} non vuole la rivincita.` : 'Hai rifiutato la rivincita.'}
              </p>
            )}
            {!uscito && r?.stato !== 'rifiutata' && (
              <Button size="lg" fullWidth loading={occupato} onClick={() => fai(d.chiediRivincita)}>
                Gioca ancora
              </Button>
            )}
            <Button variant="tinted" size="lg" fullWidth onClick={() => vai(ROTTE.libera('quiz'))}>
              {uscito ? 'Torna al quiz' : 'Esci'}
            </Button>
          </>
        )}
        {errore && <p className="duello-fine__errore">{errore}</p>}
      </div>
    </div>
  )
}

