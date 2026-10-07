import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Tacche } from '@/components/Elementi'
import { Sheet } from '@/components/Sheet'
import { IconCheck, IconMatita } from '@/components/Icons'
import { suona } from '@/lib/suoni'
import {
  LIVELLI_PAROLA,
  TENTATIVO_MASSIMO,
  type IscrittoStanzaScarabocchi,
  type OpTratto,
  type VistaIndovina,
  type VistaStanzaScarabocchi,
} from '@shared/scarabocchi'
import { Galleria } from './Album'
import { useInvioTratti } from './invio'
import { Lavagna, type ComandiLavagna, type Strumento } from './Lavagna'
import { Strumenti } from './Strumenti'
import { foglioIntero, useOrologio, useStanzaScarabocchi } from './useStanza'

type Stanza = ReturnType<typeof useStanzaScarabocchi>

/** I secondi che restano, dall'ora del server. */
const secondiDa = (fine: number, adesso: number) => Math.max(0, Math.ceil((fine - adesso) / 1000))

/**
 * Indovina il disegno: in cima il giro, la parola (o le sue lettere
 * nascoste) e il tempo; poi la lavagna, con gli attrezzi per chi disegna e le
 * risposte per chi indovina. Su un computer i giocatori stanno a sinistra e
 * le risposte a destra, come nei giochi da browser; sul telefono uno sotto
 * l'altro, con il campo per rispondere in fondo, sotto il pollice.
 */
export function PartitaIndovina({
  v,
  pv,
  s,
  volti,
}: {
  v: VistaStanzaScarabocchi
  pv: VistaIndovina
  s: Stanza
  volti: Map<string, IscrittoStanzaScarabocchi>
}) {
  const io = v.io
  const disegnoIo = pv.disegnatore === io
  const adesso = useOrologio(s.scarto, pv.fase !== 'finita')
  const restano = secondiDa(pv.fine, adesso)
  const disegnatore = pv.giocatori.find((g) => g.id === pv.disegnatore)
  const mio = pv.giocatori.find((g) => g.id === io)
  const indovinata = mio?.fatto ?? false

  // Gli ultimi cinque secondi si sentono, e il proprio turno anche.
  const ultimo = useRef(-1)
  useEffect(() => {
    if (pv.fase !== 'disegno' || restano > 5 || restano === 0 || ultimo.current === restano) return
    ultimo.current = restano
    suona('tic')
  }, [pv.fase, restano])
  const turnoSuonato = useRef(-1)
  useEffect(() => {
    if (pv.fase === 'scelta' && disegnoIo && turnoSuonato.current !== pv.turno) {
      turnoSuonato.current = pv.turno
      suona('via')
    }
  }, [pv.fase, pv.turno, disegnoIo])

  return (
    <div className={`scr-gioco scr-gioco--${pv.fase}`}>
      <Testa pv={pv} restano={restano} disegnoIo={disegnoIo} indovinata={indovinata} />
      <div className="scr-gioco__corpo">
        <Giocatori pv={pv} io={io} volti={volti} />
        <div className="scr-gioco__centro">
          {disegnoIo && pv.fase === 'disegno' ? (
            <MioDisegno
              key={`${v.numero}:${pv.foglio}`}
              codice={v.codice}
              numero={v.numero}
              pv={pv}
              restano={restano}
            />
          ) : (
            <div className="scr-tela-spazio">
              <div className="scr-tela">
                <Lavagna ops={s.disegno?.foglio === pv.foglio ? s.disegno.ops : NIENTE} etichetta="Il disegno" />
                <Sopra pv={pv} v={v} s={s} restano={restano} disegnatore={disegnatore?.nome ?? ''} />
              </div>
            </div>
          )}
        </div>
        {pv.fase !== 'finita' && <Risposte pv={pv} io={io} s={s} disegnoIo={disegnoIo} indovinata={indovinata} />}
      </div>
    </div>
  )
}

const NIENTE: OpTratto[] = []

function Testa({
  pv,
  restano,
  disegnoIo,
  indovinata,
}: {
  pv: VistaIndovina
  restano: number
  disegnoIo: boolean
  indovinata: boolean
}) {
  const parola = pv.parola
  let centro: React.ReactNode
  if (pv.fase === 'scelta') {
    centro = <span className="scr-testa__nota">{disegnoIo ? 'Scegli la parola' : 'Si sceglie la parola'}</span>
  }
  else if (pv.fase === 'finita') centro = <span className="scr-testa__nota">Partita finita</span>
  else if (parola && (disegnoIo || indovinata || pv.fase === 'rivela')) {
    centro = (
      <span className="scr-testa__parola">
        {disegnoIo && pv.fase === 'disegno' && <span className="scr-testa__disegna">Disegna</span>}
        {parola.toUpperCase()}
      </span>
    )
  } else if (pv.indizio) {
    centro = (
      <span className="scr-testa__indizio" aria-label={`${pv.indizio.replace(/ /g, '').length} lettere`}>
        {[...pv.indizio].map((c, i) => (
          <span
            key={i}
            className={c === ' ' ? 'scr-indizio__spazio' : c === '_' ? 'scr-indizio__vuota' : 'scr-indizio__lettera'}
          >
            {c === '_' || c === ' ' ? '' : c.toUpperCase()}
          </span>
        ))}
        <span className="scr-indizio__quante u-tabnum">{pv.indizio.replace(/ /g, '').length}</span>
      </span>
    )
  }
  const aTempo = pv.fase === 'scelta' || pv.fase === 'disegno'
  const quota = aTempo && pv.fine > pv.inizio ? Math.min(1, (restano * 1000) / (pv.fine - pv.inizio)) : 0
  return (
    <div className="scr-testa">
      <span className="scr-testa__giro u-tabnum">
        Giro {pv.giro} di {pv.giri}
      </span>
      <span className="scr-testa__centro">{centro}</span>
      <span
        className={`scr-orologio u-tabnum${aTempo && restano <= 10 ? ' is-urgente' : ''}${aTempo ? '' : ' is-fermo'}`}
        style={{ '--quota': quota } as CSSProperties}
        aria-label={aTempo ? `${restano} secondi` : undefined}
        aria-hidden={aTempo ? undefined : true}
      >
        {aTempo ? restano : ''}
      </span>
    </div>
  )
}

/** I giocatori con i loro punti: chi disegna ha la matita, chi ha indovinato la spunta. */
function Giocatori({
  pv,
  io,
  volti,
}: {
  pv: VistaIndovina
  io: string
  volti: Map<string, IscrittoStanzaScarabocchi>
}) {
  const ordinati = useMemo(() => [...pv.giocatori].sort((a, b) => b.punti - a.punti), [pv.giocatori])
  return (
    <ol className="scr-giocatori" aria-label="Giocatori">
      {ordinati.map((g) => {
        const volto = volti.get(g.id)
        const disegna = g.id === pv.disegnatore && pv.fase !== 'finita'
        return (
          <li
            key={g.id}
            className={[
              'scr-giocatore',
              g.fatto && 'is-fatto',
              disegna && 'is-disegna',
              !g.presente && 'is-assente',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="scr-giocatore__volto">
              <Avatar nickname={volto?.nickname ?? g.nome} color={volto?.avatarColor} size={34} />
              {disegna && (
                <span className="scr-giocatore__segno" aria-label="Disegna">
                  <IconMatita size={12} />
                </span>
              )}
              {g.fatto && (
                <span className="scr-giocatore__segno is-giusto" aria-label="Ha indovinato">
                  <IconCheck size={12} />
                </span>
              )}
            </span>
            <span className="scr-giocatore__nome">
              {g.nome}
              {g.id === io && ' (tu)'}
            </span>
            <span className="scr-giocatore__punti u-tabnum">{g.punti}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** Il disegno di chi disegna: la lavagna che si tocca, gli attrezzi, e i tratti che partono a pezzi. */
function MioDisegno({
  codice,
  numero,
  pv,
  restano,
}: {
  codice: string
  numero: number
  pv: VistaIndovina
  restano: number
}) {
  const lavagna = useRef<ComandiLavagna>(null)
  const [strumento, setStrumento] = useState<Strumento>({ colore: 0, spessore: 1 })
  const [iniziale, setIniziale] = useState<{ ops: OpTratto[]; pezzi: number } | null>(null)

  // Riaprendo la pagina a meta' turno il disegno c'e' gia': lo si riprende da dove era rimasto.
  useEffect(() => {
    let vivo = true
    foglioIntero(codice, pv.foglio)
      .then((f) => vivo && setIniziale(f))
      .catch(() => vivo && setIniziale({ ops: [], pezzi: 0 }))
    return () => {
      vivo = false
    }
  }, [codice, pv.foglio])

  const invio = useInvioTratti(codice, numero, iniziale ? pv.foglio : null, iniziale?.pezzi ?? 0)
  const ferma = restano === 0
  return (
    <>
      <div className="scr-tela-spazio">
        <div className="scr-tela">
          {iniziale ? (
            <Lavagna
              ref={lavagna}
              ops={iniziale.ops}
              onOp={invio.aggiungi}
              strumento={strumento}
              ferma={ferma}
              etichetta={`Disegna ${pv.parola ?? ''}`}
            />
          ) : (
            <div className="scr-lavagna scr-lavagna--attesa" aria-hidden="true" />
          )}
        </div>
      </div>
      <Strumenti
        strumento={strumento}
        onCambia={setStrumento}
        onAnnulla={() => lavagna.current?.annulla()}
        onPulisci={() => lavagna.current?.pulisci()}
        disabilitati={ferma || !iniziale}
      />
    </>
  )
}

/** Quel che sta sopra la lavagna fuori dal disegno: la scelta della parola, la parola del turno, la fine. */
function Sopra({
  pv,
  v,
  s,
  restano,
  disegnatore,
}: {
  pv: VistaIndovina
  v: VistaStanzaScarabocchi
  s: Stanza
  restano: number
  disegnatore: string
}) {
  if (pv.fase === 'scelta') {
    if (pv.scelte) {
      return (
        <div className="scr-sopra">
          <p className="scr-sopra__titolo">Che cosa disegni?</p>
          <div className="scr-scelte">
            {pv.scelte.map((sc, i) => (
              <button
                key={sc.parola}
                type="button"
                className="scr-scelta"
                disabled={s.occupato !== null}
                onClick={() => void s.scegli(i)}
              >
                <span className="scr-scelta__parola">{sc.parola}</span>
                <span className="scr-scelta__livello">
                  <Tacche piene={LIVELLI_PAROLA.indexOf(sc.livello) + 1} colore="var(--scarabocchi-2)" />
                  {sc.livello === 'facile' ? 'Facile' : sc.livello === 'normale' ? 'Normale' : 'Difficile'}
                </span>
              </button>
            ))}
          </div>
          <p className="scr-sopra__nota u-tabnum">Fra {restano} secondi sceglie il gioco.</p>
        </div>
      )
    }
    return (
      <div className="scr-sopra scr-sopra--leggero">
        <p className="scr-sopra__titolo">{disegnatore} sceglie che cosa disegnare</p>
      </div>
    )
  }
  if (pv.fase === 'rivela' && pv.ultimo) {
    const punti = Object.entries(pv.ultimo.punti)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
    const nomi = new Map(pv.giocatori.map((g) => [g.id, g.nome]))
    return (
      <div className="scr-sopra scr-sopra--rivela">
        <p className="scr-sopra__nota">La parola era</p>
        <p className="scr-sopra__parola">{pv.ultimo.parola.toUpperCase()}</p>
        {punti.length === 0 ? (
          <p className="scr-sopra__nota">Nessuno l’ha indovinata.</p>
        ) : (
          <ul className="scr-sopra__punti">
            {punti.map(([id, n]) => (
              <li key={id}>
                <span>{nomi.get(id)}</span>
                <span className="u-tabnum">+{n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
  if (pv.fase === 'finita') {
    return <Classifica pv={pv} v={v} s={s} />
  }
  return null
}

/** La fine: chi ha vinto, e i punti di tutti. */
function Classifica({ pv, v, s }: { pv: VistaIndovina; v: VistaStanzaScarabocchi; s: Stanza }) {
  const [galleria, setGalleria] = useState(false)
  const ordinati = [...pv.giocatori].sort((a, b) => b.punti - a.punti)
  const primi = ordinati.filter((g) => g.punti === ordinati[0]?.punti)
  const nomi = primi.map((g) => g.nome)
  return (
    <div className="scr-sopra scr-sopra--fine">
      <p className="scr-sopra__nota">{primi.length > 1 ? 'Pari, in testa' : 'Ha vinto'}</p>
      <p className="scr-sopra__parola">
        {nomi.length > 1 ? `${nomi.slice(0, -1).join(', ')} e ${nomi.at(-1)}` : nomi[0]}
      </p>
      <ol className="scr-sopra__punti">
        {ordinati.map((g, i) => (
          <li key={g.id}>
            <span>
              {i + 1}. {g.nome}
            </span>
            <span className="u-tabnum">{g.punti}</span>
          </li>
        ))}
      </ol>
      <div className="scr-sopra__azioni">
        <Button variant="tinted" onClick={() => setGalleria(true)}>
          I disegni
        </Button>
        {v.conduco && (
          <Button onClick={() => void s.ancora()} loading={s.occupato === 'ancora'}>
            Un’altra partita
          </Button>
        )}
      </div>
      <Sheet open={galleria} onClose={() => setGalleria(false)} title="I disegni">
        <Galleria codice={v.codice} />
      </Sheet>
    </div>
  )
}

/**
 * Le risposte: quelle sbagliate le vedono tutti, una giusta solo chi l'ha
 * data (gli altri leggono che ha indovinato). Il campo sta in fondo, e si
 * svuota a ogni invio: si prova un'altra parola subito.
 */
function Risposte({
  pv,
  io,
  s,
  disegnoIo,
  indovinata,
}: {
  pv: VistaIndovina
  io: string
  s: Stanza
  disegnoIo: boolean
  indovinata: boolean
}) {
  const [testo, setTesto] = useState('')
  const elenco = useRef<HTMLOListElement>(null)
  const messaggi = s.messaggi
  const visti = useRef(new Set<number>())

  // Una risposta giusta si sente: la propria piu' forte.
  useEffect(() => {
    for (const m of messaggi) {
      if (visti.current.has(m.id)) continue
      visti.current.add(m.id)
      if (m.esito === 'giusta') suona(m.playerId === io ? 'giusto' : 'punto')
    }
  }, [messaggi, io])

  useEffect(() => {
    const el = elenco.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messaggi.length])

  const puo = pv.fase === 'disegno' && !disegnoIo && !indovinata
  const invia = (e: FormEvent) => {
    e.preventDefault()
    const t = testo.trim()
    if (!t || !puo) return
    setTesto('')
    void s.tentativo(t)
  }
  const ultimaMia = [...messaggi].reverse().find((m) => m.playerId === io)
  return (
    <section className="scr-risposte" aria-label="Le risposte">
      <ol className="scr-risposte__elenco" ref={elenco} aria-live="polite">
        {messaggi.length === 0 && pv.fase === 'disegno' && (
          <li className="scr-risposta scr-risposta--nota">
            {disegnoIo ? 'Le risposte arrivano qui.' : 'Scrivi che cosa vedi.'}
          </li>
        )}
        {messaggi.map((m) =>
          m.esito === 'giusta' ? (
            <li key={m.id} className="scr-risposta scr-risposta--giusta">
              {m.playerId === io ? `Hai indovinato! +${m.punti}` : `${m.nome} ha indovinato! +${m.punti}`}
            </li>
          ) : (
            <li key={m.id} className={`scr-risposta${m.esito === 'vicina' ? ' scr-risposta--vicina' : ''}`}>
              <strong>{m.nome}</strong> {m.testo}
              {m.esito === 'vicina' && <span className="scr-risposta__quasi"> · ci sei quasi!</span>}
            </li>
          ),
        )}
      </ol>
      {!disegnoIo && pv.fase !== 'finita' && (
        <form className="scr-risposte__campo" onSubmit={invia}>
          <input
            className="scr-campo"
            value={testo}
            onChange={(e) => setTesto(e.target.value.slice(0, TENTATIVO_MASSIMO))}
            placeholder={indovinata ? 'L’hai indovinata!' : pv.fase === 'disegno' ? 'Che cos’è?' : 'Aspetta il disegno'}
            disabled={!puo}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="send"
            aria-label="La tua risposta"
          />
          <Button type="submit" disabled={!puo || testo.trim() === ''}>
            Invia
          </Button>
        </form>
      )}
      {ultimaMia?.esito === 'vicina' && puo && <p className="scr-risposte__quasi">Ci sei quasi!</p>}
    </section>
  )
}
