import { useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, Numero, Vuoto, useFesta } from '@/components/Elementi'
import { IconComputer, IconFlag, IconInfo, IconRefresh, IconTarget, IconTrophy } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Sheet } from '@/components/Sheet'
import { AnnuncioColpo } from '@/games/battaglia/Annuncio'
import { ComeSiGiocaBattaglia } from '@/games/battaglia/ComeSiGioca'
import { Mare } from '@/games/battaglia/Mare'
import { Navi } from '@/games/battaglia/Navi'
import { celleNemiche, celleProprie } from '@/games/battaglia/celle'
import { naviNemiche, naviProprie, notiziaDi } from '@/games/battaglia/racconto'
import { useBattaglia } from '@/games/battaglia/useBattaglia'
import { ApiFetchError, api } from '@/lib/api'
import { usePlayer } from '@/lib/auth'
import { formatCronometro } from '@/lib/format'
import {
  CASELLE_FLOTTA,
  FLOTTA,
  LATO,
  caselleDellaNave,
  disponiACaso,
  naveAmmessa,
  tipoDi,
  type IdNave,
  type Nave,
} from '@shared/battaglia'
import type { VistaBattaglia } from '@shared/types'
import './Battaglia.css'

const LIVELLI_NOME = { facile: 'facile', normale: 'normale', difficile: 'difficile' } as const

/** Contro chi si gioca, detto in mezzo a una frase: "il computer", "Giada". */
export function nomeAvversario(v: VistaBattaglia): string {
  return v.modalita === 'amici' ? v.avversario.displayName : 'il computer'
}

function maiuscola(testo: string): string {
  return testo.charAt(0).toUpperCase() + testo.slice(1)
}

/** Il titolo in alto: la giornata per la classificata, l'avversario per le altre. */
function titoloDi(v: VistaBattaglia | null): string {
  if (!v) return 'Battaglia navale'
  if (v.modalita === 'classificata') return `Battaglia #${v.puzzleNumber ?? ''}`
  if (v.modalita === 'computer') return `Contro il computer`
  return `Contro ${v.avversario.displayName}`
}

/**
 * Una partita di battaglia navale: prima si dispone la flotta, poi si spara, poi
 * si guarda com'e' andata. Tre fasi nella stessa rotta, perché l'indirizzo
 * resti quello della partita dall'inizio alla fine — e chi riapre l'app ci
 * torna dentro.
 *
 * La stessa schermata fa le tre modalità: la classificata del giorno e la
 * libera contro il computer — che risponde subito, nella stessa richiesta — e
 * la partita con un amico, che va a polling.
 */
export default function BattagliaPartita() {
  const { id = '' } = useParams()
  const g = useBattaglia(id)
  const [aiuto, setAiuto] = useState(false)
  const [resa, setResa] = useState(false)
  const v = g.vista
  const classificata = v?.modalita === 'classificata'
  const festa = useFesta(v ? v.stato !== 'finita' : null, v?.stato === 'finita' && v.vincitore === 'io')

  return (
    <Pagina
      titolo={titoloDi(v)}
      intera
      larga
      indietro={
        classificata
          ? { a: ROTTE.gioco('battaglia'), etichetta: 'Battaglia' }
          : { a: ROTTE.libera('battaglia'), etichetta: 'Libera' }
      }
      azioni={
        <>
          {v && v.stato !== 'finita' && (
            <BottoneBarra etichetta="Abbandona la partita" onClick={() => setResa(true)}>
              <IconFlag size={19} />
            </BottoneBarra>
          )}
          <BottoneBarra etichetta="Come si gioca" onClick={() => setAiuto(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
        </>
      }
    >
      <div className="bat">
        {g.errore && !v ? (
          <Vuoto
            titolo="La partita non si è aperta"
            testo={g.errore}
            azione={
              <Button variant="tinted" onClick={() => void g.ricarica()}>
                Riprova
              </Button>
            }
          />
        ) : !v ? (
          <div className="bat__attesa" aria-hidden="true" />
        ) : v.stato === 'disposizione' && !v.miaFlotta ? (
          <Disposizione vista={v} inviando={g.inviando} onConferma={g.disponi} />
        ) : v.stato === 'finita' ? (
          <Fine vista={v} />
        ) : (
          <Combattimento
            vista={v}
            inviando={g.inviando}
            avviso={g.avviso}
            mirata={g.mirata}
            mira={g.mira}
            onSpara={g.spara}
            onReclama={g.reclama}
          />
        )}
      </div>

      <ComeSiGiocaBattaglia open={aiuto} onClose={() => setAiuto(false)} />

      <Sheet open={resa} onClose={() => setResa(false)} title="Abbandonare?">
        <div className="bat-resa">
          <p>
            {!v
              ? ''
              : v.modalita === 'classificata'
                ? 'La battaglia di oggi finisce qui, e non si rigioca. In classifica valgono le navi che hai colpito finora.'
                : v.modalita === 'computer'
                  ? 'La partita finisce subito e conta come una sconfitta contro il computer.'
                  : `La partita finisce subito e vince ${v.avversario.displayName}. Conta come una sconfitta.`}
          </p>
          <Button
            variant="destructive"
            size="lg"
            fullWidth
            onClick={() => {
              setResa(false)
              void g.arrenditi()
            }}
          >
            Abbandona
          </Button>
          <Button variant="plain" size="lg" fullWidth onClick={() => setResa(false)}>
            Continua a giocare
          </Button>
        </div>
      </Sheet>

      <AnnuncioColpo annuncio={g.annuncio} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/* ─────────────────────────────  Disposizione  ──────────────────────────── */

function Disposizione({
  vista,
  inviando,
  onConferma,
}: {
  vista: VistaBattaglia
  inviando: boolean
  onConferma: (navi: Nave[]) => void
}) {
  const [navi, setNavi] = useState<Nave[]>(() => disponiACaso())
  const [scelta, setScelta] = useState<IdNave | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  const celle = useMemo(() => celleProprie(navi, [], scelta), [navi, scelta])

  const sposta = (nave: Nave) => {
    const altre = navi.filter((n) => n.tipo !== nave.tipo)
    const verifica = naveAmmessa(nave, altre)
    if (!verifica.ok) {
      setNota(verifica.errore)
      return false
    }
    setNavi(navi.map((n) => (n.tipo === nave.tipo ? nave : n)))
    setNota(null)
    return true
  }

  const tocca = (k: number) => {
    const sopra = navi.find((n) => caselleDellaNave(n).includes(k))
    if (sopra) {
      setScelta(scelta === sopra.tipo ? null : sopra.tipo)
      setNota(null)
      return
    }
    if (!scelta) {
      setNota('Tocca prima una nave, poi dove vuoi la prua.')
      return
    }
    const nave = navi.find((n) => n.tipo === scelta)!
    sposta({ ...nave, r: Math.floor(k / LATO), c: k % LATO })
  }

  const ruota = () => {
    const nave = navi.find((n) => n.tipo === scelta)
    if (!nave) return
    const { lunghezza } = tipoDi(nave.tipo)
    const verticale = !nave.verticale
    // Girata sul posto; se esce dal mare, la si ritira quanto basta a farla stare.
    const r = verticale ? Math.min(nave.r, LATO - lunghezza) : nave.r
    const c = verticale ? nave.c : Math.min(nave.c, LATO - lunghezza)
    sposta({ ...nave, verticale, r, c })
  }

  return (
    <div className="bat-disposizione">
      <p className="bat__istruzioni">
        Disponi la flotta: tocca una nave, poi la casella dove vuoi la prua. Le navi non si toccano,
        nemmeno d&rsquo;angolo.
      </p>
      <div className="bat__mare-grande">
        <Mare celle={celle} onTocca={tocca} etichetta="La tua flotta" />
      </div>
      <div className="bat-disposizione__navi" role="group" aria-label="Le navi">
        {FLOTTA.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`bat-nave${scelta === t.id ? ' is-scelta' : ''}`}
            onClick={() => setScelta(scelta === t.id ? null : t.id)}
          >
            <span className="bat-nave__nome">{t.nome}</span>
            <span className="bat-nave__pezzi" aria-hidden="true">
              {Array.from({ length: t.lunghezza }, (_, i) => (
                <span key={i} />
              ))}
            </span>
          </button>
        ))}
      </div>
      <p className="bat__nota" aria-live="polite">
        {nota ??
          (vista.modalita !== 'amici'
            ? vista.modalita === 'classificata'
              ? 'La flotta del computer è la stessa per tutti, oggi.'
              : `Il computer gioca a livello ${LIVELLI_NOME[vista.livello ?? 'normale']}.`
            : vista.avversarioPronto
              ? `${vista.avversario.displayName} è già pronto.`
              : ' ')}
      </p>
      <div className="bat-disposizione__comandi">
        <Button variant="plain" onClick={ruota} disabled={!scelta}>
          Ruota
        </Button>
        <Button
          variant="plain"
          onClick={() => {
            setNavi(disponiACaso())
            setScelta(null)
            setNota(null)
          }}
        >
          A caso
        </Button>
        <Button onClick={() => onConferma(navi)} loading={inviando}>
          {vista.modalita === 'amici' ? 'Pronto' : 'Si comincia'}
        </Button>
      </div>
    </div>
  )
}

/* ────────────────────────────  Combattimento  ──────────────────────────── */

function Combattimento({
  vista,
  inviando,
  avviso,
  mirata,
  mira,
  onSpara,
  onReclama,
}: {
  vista: VistaBattaglia
  inviando: boolean
  /** Un errore dell'ultima azione, da dire al posto della notizia. */
  avviso: string | null
  /** Dove ho appena sparato, mentre la risposta arriva. */
  mirata: number | null
  /** Dove il computer sta per sparare: il suo mirino la sta cercando. */
  mira: number | null
  onSpara: (k: number) => void
  onReclama: () => void
}) {
  const io = usePlayer()
  const nome = nomeAvversario(vista)
  const fraAmici = vista.modalita === 'amici'
  const inBattaglia = vista.stato === 'battaglia'
  const miraInCorso = mira !== null
  const mioTurno = inBattaglia && vista.tuoTurno && !miraInCorso
  const sparate = useMemo(() => new Set(vista.colpiMiei.map((c) => c.casella)), [vista.colpiMiei])
  const ultimo = vista.ultimo

  const nemico = useMemo(
    () =>
      celleNemiche(vista.colpiMiei, vista.affondateNemiche, null, ultimo?.mio ? ultimo : null, mirata),
    [mirata, ultimo, vista.affondateNemiche, vista.colpiMiei],
  )
  const mio = useMemo(
    () => celleProprie(vista.miaFlotta ?? [], vista.colpiSubiti, null, ultimo && !ultimo.mio ? ultimo : null),
    [ultimo, vista.colpiSubiti, vista.miaFlotta],
  )

  const colpiPresi = useMemo(
    () => new Set(vista.colpiSubiti.filter((c) => c.esito !== 'acqua').map((c) => c.casella)),
    [vista.colpiSubiti],
  )
  const mieNavi = naviProprie(vista.miaFlotta ?? [], colpiPresi)
  const aGalla = mieNavi.filter((n) => !n.affondata).length
  const aSegno = vista.colpiMiei.filter((c) => c.esito !== 'acqua').length
  const affondate = vista.affondateNemiche.length

  // Il mare trema all'ultimo colpo andato a segno: poco se colpisce, di piu' se affonda.
  const idColpo = vista.colpiMiei.length + vista.colpiSubiti.length
  const scossa = ultimo && ultimo.esito !== 'acqua' ? { id: idColpo, forte: ultimo.esito === 'affondato' } : null

  const turno = !inBattaglia
    ? vista.avversarioPronto
      ? 'Si comincia…'
      : `Aspetta che ${nome} disponga la flotta`
    : miraInCorso
      ? `${fraAmici ? nome : 'Il computer'} prende la mira…`
      : vista.tuoTurno
        ? 'Tocca a te'
        : fraAmici
          ? `Tocca a ${nome}`
          : 'Tocca al computer'
  const notizia = notiziaDi(vista)
  const riga = avviso
    ? { testo: avviso, tono: 'errore' }
    : notizia ?? (mioTurno ? { testo: `Scegli una casella nel mare ${fraAmici ? `di ${nome}` : 'del computer'}`, tono: 'neutra' } : null)

  return (
    <div className="bat-combattimento">
      <div
        className={`bat-plancia${mioTurno ? ' is-tuo' : ''}${miraInCorso ? ' is-mira' : ''}`}
        aria-live="polite"
      >
        <span className="bat-plancia__icona" aria-hidden="true">
          {mioTurno ? (
            <IconTarget size={20} />
          ) : fraAmici ? (
            <Avatar nickname={vista.avversario.nickname} color={vista.avversario.avatarColor} size={34} />
          ) : (
            <IconComputer size={18} />
          )}
        </span>
        <span className="bat-plancia__testi">
          <span className="bat-plancia__turno">{turno}</span>
          <span className={`bat-plancia__notizia is-${riga?.tono ?? 'neutra'}`}>{riga?.testo ?? ' '}</span>
        </span>
        {fraAmici ? (
          <span
            className={`bat__online${vista.avversario.online ? ' is-online' : ''}`}
            title={vista.avversario.online ? `${nome} è online` : `${nome} non è online`}
          />
        ) : (
          <span className="bat-plancia__colpi u-tabnum" title="I colpi sparati">
            <strong>{vista.colpiMiei.length}</strong> colpi
          </span>
        )}
      </div>

      <div className="bat-combattimento__mari">
        <Campo
          className={`bat-campo--nemico${mioTurno ? ' is-attivo' : ''}`}
          etichetta={fraAmici ? `Il mare di ${nome}` : 'Il mare del computer'}
          chi={
            fraAmici ? (
              <Avatar nickname={vista.avversario.nickname} color={vista.avversario.avatarColor} size={26} />
            ) : (
              <span className="bat-campo__computer">
                <IconComputer size={15} />
              </span>
            )
          }
          nota={
            mioTurno
              ? 'Tocca per sparare'
              : `${aSegno} ${aSegno === 1 ? 'casella colpita' : 'caselle colpite'} su ${CASELLE_FLOTTA}`
          }
          notaViva={mioTurno}
        >
          <div className="bat-campo__mare">
            <Mare
              celle={nemico}
              onTocca={mioTurno && !inviando ? onSpara : undefined}
              bloccata={(k) => sparate.has(k)}
              etichetta={fraAmici ? `Il mare di ${nome}` : 'Il mare del computer'}
              scossa={ultimo?.mio ? scossa : null}
            />
          </div>
          <Navi navi={naviNemiche(vista.affondateNemiche)} etichetta={`Le navi di ${nome}`} />
          <p className="bat-campo__piede u-tabnum">
            {affondate === 0
              ? `Cinque navi da trovare, ${CASELLE_FLOTTA} caselle in tutto`
              : affondate === FLOTTA.length
                ? 'Tutte a fondo'
                : `${affondate} ${affondate === 1 ? 'affondata' : 'affondate'}, ne ${FLOTTA.length - affondate === 1 ? 'resta una' : `restano ${FLOTTA.length - affondate}`}`}
          </p>
        </Campo>

        <Campo
          className={`bat-campo--mio${miraInCorso ? ' is-sotto-tiro' : ''}${!mioTurno && inBattaglia && !miraInCorso ? ' is-attesa' : ''}`}
          etichetta="Il tuo mare"
          chi={<Avatar nickname={io.nickname} color={io.avatarColor} size={26} />}
          nota={`${aGalla} ${aGalla === 1 ? 'nave' : 'navi'} su ${FLOTTA.length} a galla`}
        >
          <div className="bat-campo__corpo">
            <div className="bat-campo__mare-piccolo">
              <Mare
                celle={mio}
                piccolo
                etichetta="Il tuo mare"
                scossa={ultimo && !ultimo.mio ? scossa : null}
                mirino={mira}
              />
            </div>
            <Navi navi={mieNavi} etichetta="Le tue navi" colonna />
          </div>
        </Campo>
      </div>

      {fraAmici && <Attesa vista={vista} onReclama={onReclama} inviando={inviando} />}
    </div>
  )
}

/**
 * Uno dei due mari, con il suo nome e di chi e': "Il mare del computer" con
 * la sua icona, "Il tuo mare" con il tuo avatar. Prima il tuo era un mare piu'
 * piccolo in fondo, e non si capiva che fosse il tuo.
 */
function Campo({
  className,
  etichetta,
  chi,
  nota,
  notaViva = false,
  children,
}: {
  className: string
  etichetta: string
  chi: ReactNode
  nota: string
  /** La nota invita a fare qualcosa: si vede di piu'. */
  notaViva?: boolean
  children: ReactNode
}) {
  return (
    <section className={`bat-campo ${className}`} aria-label={etichetta}>
      <header className="bat-campo__testa">
        {chi}
        <h2 className="bat-campo__titolo">{etichetta}</h2>
        <span className={`bat-campo__nota${notaViva ? ' is-viva' : ''}`}>{nota}</span>
      </header>
      {children}
    </section>
  )
}

/** Se l'avversario non muove: da quanto, e quando si puo' chiedere la vittoria. */
function Attesa({
  vista,
  onReclama,
  inviando,
}: {
  vista: VistaBattaglia
  onReclama: () => void
  inviando: boolean
}) {
  const aspetto = vista.stato === 'disposizione' || !vista.tuoTurno
  if (!aspetto) return null
  if (vista.puoiReclamare) {
    return (
      <div className="bat__reclamo">
        <p>{vista.avversario.displayName} non risponde più.</p>
        <Button variant="tinted" onClick={onReclama} loading={inviando}>
          Vinci a tavolino
        </Button>
      </div>
    )
  }
  if (vista.attesaMs < 60_000) return null
  return (
    <p className="bat__nota">
      {vista.avversario.displayName} non muove da {formatCronometro(vista.attesaMs)}
    </p>
  )
}

/* ─────────────────────────────────  Fine  ──────────────────────────────── */

function Fine({ vista }: { vista: VistaBattaglia }) {
  const { vai } = useNavigazione()
  const [errore, setErrore] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)
  const nome = nomeAvversario(vista)
  const vinta = vista.vincitore === 'io'
  const fraAmici = vista.modalita === 'amici'

  const perche =
    vista.motivo === 'flotta'
      ? vinta
        ? `Hai affondato tutta la flotta ${fraAmici ? `di ${nome}` : 'del computer'}.`
        : `${maiuscola(nome)} ha affondato tutta la tua flotta.`
      : vista.motivo === 'resa'
        ? vinta
          ? `${maiuscola(nome)} ha abbandonato la partita.`
          : 'Hai abbandonato la partita.'
        : vinta
          ? `Vittoria a tavolino: ${nome} non ha più mosso.`
          : `Sconfitta a tavolino: non hai più mosso.`

  const io = usePlayer()
  const aSegno = vista.colpiMiei.filter((c) => c.esito !== 'acqua').length
  const nemico = celleNemiche(vista.colpiMiei, vista.affondateNemiche, vista.flottaNemica)
  const mio = celleProprie(vista.miaFlotta ?? [], vista.colpiSubiti)
  const mieNavi = naviProprie(
    vista.miaFlotta ?? [],
    new Set(vista.colpiSubiti.filter((c) => c.esito !== 'acqua').map((c) => c.casella)),
  )
  const aGalla = mieNavi.filter((n) => !n.affondata).length

  /** Fra amici una sfida nuova; contro il computer una partita nuova allo stesso livello. */
  const ancora = async () => {
    setInvio(true)
    setErrore(null)
    try {
      if (fraAmici) {
        await api('/battaglia/sfida', { method: 'POST', body: { playerId: vista.avversario.playerId } })
        vai(ROTTE.libera('battaglia'), { replace: true, direzione: 'indietro' })
      } else {
        const nuova = await api<VistaBattaglia>('/battaglia/computer', {
          method: 'POST',
          body: { livello: vista.livello ?? 'normale' },
        })
        vai(ROTTE.partitaBattaglia(nuova.id), { replace: true, direzione: 'nessuna' })
      }
    } catch (err) {
      setErrore(err instanceof ApiFetchError ? err.message : 'Non riesco a cominciare.')
    } finally {
      setInvio(false)
    }
  }

  return (
    <div className="bat-fine">
      <header className={`bat-fine__testa${vinta ? ' is-vinta' : ''}`}>
        <p className="bat-fine__titolo">{vinta ? 'Hai vinto!' : `Ha vinto ${nome}`}</p>
        <p className="bat-fine__perche">{perche}</p>
        {vista.modalita === 'classificata' && vista.punti !== null && (
          <p className="bat-fine__punti">
            <Numero valore={vista.punti} />
            <span className="bat-fine__su"> / 100 in classifica</span>
          </p>
        )}
        {vista.colpiMiei.length > 0 && (
          <p className="bat-fine__conto u-tabnum">
            {vista.colpiMiei.length} colpi sparati, {aSegno} a segno (
            {Math.round((aSegno / vista.colpiMiei.length) * 100)}%)
          </p>
        )}
      </header>

      {/* Chi si arrende prima di disporre la flotta non ha un mare da mostrare:
          due griglie vuote non direbbero niente. */}
      {(vista.flottaNemica || vista.miaFlotta) && (
        <div className="bat-combattimento__mari">
          {vista.flottaNemica && (
            <Campo
              className="bat-campo--nemico"
              etichetta={fraAmici ? `La flotta di ${nome}` : 'La flotta del computer'}
              chi={
                fraAmici ? (
                  <Avatar nickname={vista.avversario.nickname} color={vista.avversario.avatarColor} size={26} />
                ) : (
                  <span className="bat-campo__computer">
                    <IconComputer size={15} />
                  </span>
                )
              }
              nota={`${vista.affondateNemiche.length} su ${FLOTTA.length} a fondo`}
            >
              <div className="bat-campo__mare">
                <Mare celle={nemico} etichetta={`La flotta di ${nome}`} />
              </div>
            </Campo>
          )}
          {vista.miaFlotta && (
            <Campo
              className="bat-campo--mio"
              etichetta="Il tuo mare"
              chi={<Avatar nickname={io.nickname} color={io.avatarColor} size={26} />}
              nota={`${aGalla} ${aGalla === 1 ? 'nave' : 'navi'} su ${FLOTTA.length} a galla`}
            >
              <div className="bat-campo__corpo">
                <div className="bat-campo__mare-piccolo">
                  <Mare celle={mio} piccolo etichetta="Il tuo mare" />
                </div>
                <Navi navi={mieNavi} etichetta="Le tue navi" colonna />
              </div>
            </Campo>
          )}
        </div>
      )}

      {errore && <p className="bat__nota">{errore}</p>}
      <div className="bat-fine__azioni">
        {vista.modalita === 'classificata' ? (
          <>
            <Button variant="tinted" onClick={() => vai(ROTTE.classifica('battaglia'))}>
              <IconTrophy size={18} /> Classifica
            </Button>
            <Button onClick={() => vai(ROTTE.libera('battaglia'))}>Partita libera</Button>
          </>
        ) : fraAmici ? (
          <>
            <Button onClick={() => void ancora()} loading={invio} disabled={!vista.avversario.online}>
              {vista.avversario.online ? 'Rivincita' : `${nome} non è online`}
            </Button>
            <Button
              variant="tinted"
              onClick={() => vai(ROTTE.libera('battaglia'), { replace: true, direzione: 'indietro' })}
            >
              Altre partite
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => void ancora()} loading={invio}>
              <IconRefresh size={18} /> Un’altra
            </Button>
            <Button
              variant="tinted"
              onClick={() => vai(ROTTE.libera('battaglia'), { replace: true, direzione: 'indietro' })}
            >
              Cambia livello
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
