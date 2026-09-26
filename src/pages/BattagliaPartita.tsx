import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Sheet } from '@/components/Sheet'
import { IconChevronLeft, IconInfo } from '@/components/Icons'
import { ComeSiGiocaBattaglia } from '@/games/battaglia/ComeSiGioca'
import { Mare } from '@/games/battaglia/Mare'
import { celleNemiche, celleProprie } from '@/games/battaglia/celle'
import { useBattaglia } from '@/games/battaglia/useBattaglia'
import { ApiFetchError, api } from '@/lib/api'
import { formatCronometro } from '@/lib/format'
import {
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

/**
 * Una partita di battaglia navale: prima si dispone la flotta, poi si spara, poi
 * si guarda com'e' andata. Tre fasi nella stessa rotta, perché l'indirizzo
 * resti quello della partita dall'inizio alla fine — e chi riapre l'app ci
 * torna dentro.
 */
export default function BattagliaPartita() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const g = useBattaglia(id)
  const [aiuto, setAiuto] = useState(false)
  const [resa, setResa] = useState(false)
  const v = g.vista

  return (
    <AppShell
      title={v ? `Contro ${v.avversario.displayName}` : 'Battaglia navale'}
      hideTabBar
      wide
      leading={
        <button
          type="button"
          className="navbtn"
          onClick={() => navigate('/battaglia')}
          aria-label="Torna alla sala"
        >
          <IconChevronLeft size={22} />
        </button>
      }
      trailing={
        <button type="button" className="navbtn" onClick={() => setAiuto(true)} aria-label="Come si gioca">
          <IconInfo size={21} />
        </button>
      }
    >
      <div className="bat">
        {/* In alto, e non in fondo: li' copriva i bottoni di fine partita. */}
        <div className="bat__messaggio" aria-live="polite">
          {g.messaggio && <span className="bat__pillola">{g.messaggio}</span>}
        </div>

        {g.errore && !v ? (
          <div className="bat__ripiego">
            <p>{g.errore}</p>
            <Button variant="tinted" onClick={() => void g.ricarica()}>
              Riprova
            </Button>
          </div>
        ) : !v ? (
          <div className="bat__attesa" aria-hidden="true" />
        ) : v.stato === 'disposizione' && !v.miaFlotta ? (
          <Disposizione vista={v} inviando={g.inviando} onConferma={g.disponi} />
        ) : v.stato === 'finita' ? (
          <Fine vista={v} />
        ) : (
          <Combattimento vista={v} inviando={g.inviando} onSpara={g.spara} onReclama={g.reclama} />
        )}

        {v && v.stato !== 'finita' && (
          <button type="button" className="bat__resa" onClick={() => setResa(true)}>
            Abbandona la partita
          </button>
        )}
      </div>

      <ComeSiGiocaBattaglia open={aiuto} onClose={() => setAiuto(false)} />

      <Sheet open={resa} onClose={() => setResa(false)} title="Abbandonare?">
        <div className="bat-resa">
          <p>
            La partita finisce subito e vince {v?.avversario.displayName}. Conta come una sconfitta.
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
    </AppShell>
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
        {nota ?? (vista.avversarioPronto ? `${vista.avversario.displayName} è già pronto.` : ' ')}
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
          Pronto
        </Button>
      </div>
    </div>
  )
}

/* ────────────────────────────  Combattimento  ──────────────────────────── */

function Combattimento({
  vista,
  inviando,
  onSpara,
  onReclama,
}: {
  vista: VistaBattaglia
  inviando: boolean
  onSpara: (k: number) => void
  onReclama: () => void
}) {
  const nome = vista.avversario.displayName
  const inBattaglia = vista.stato === 'battaglia'
  const sparate = useMemo(() => new Set(vista.colpiMiei.map((c) => c.casella)), [vista.colpiMiei])
  const ultimo = vista.ultimo

  const nemico = useMemo(() => {
    const celle = celleNemiche(vista.colpiMiei, vista.affondateNemiche, null)
    if (ultimo?.mio) celle[ultimo.casella] = { ...celle[ultimo.casella], nuovo: true }
    return celle
  }, [ultimo, vista.affondateNemiche, vista.colpiMiei])

  const mio = useMemo(() => {
    const celle = celleProprie(vista.miaFlotta ?? [], vista.colpiSubiti)
    if (ultimo && !ultimo.mio) celle[ultimo.casella] = { ...celle[ultimo.casella], nuovo: true }
    return celle
  }, [ultimo, vista.colpiSubiti, vista.miaFlotta])

  const affondateNemiche = new Set(vista.affondateNemiche.map((n) => n.tipo))
  const colpiPresi = new Set(vista.colpiSubiti.filter((c) => c.esito !== 'acqua').map((c) => c.casella))
  const mieAfondo = (vista.miaFlotta ?? []).filter((n) =>
    caselleDellaNave(n).every((k) => colpiPresi.has(k)),
  ).length

  const stato = !inBattaglia
    ? vista.avversarioPronto
      ? 'Si comincia…'
      : `Aspetta che ${nome} disponga la flotta`
    : vista.tuoTurno
      ? 'Tocca a te: scegli dove sparare'
      : `Tocca a ${nome}`

  return (
    <div className="bat-combattimento">
      <div className={`bat__stato${vista.tuoTurno ? ' is-tuo' : ''}`}>
        <Avatar nickname={vista.avversario.nickname} color={vista.avversario.avatarColor} size={28} />
        <span className="bat__stato-testo">{stato}</span>
        <span
          className={`bat__online${vista.avversario.online ? ' is-online' : ''}`}
          title={vista.avversario.online ? `${nome} è online` : `${nome} non è online`}
        />
      </div>

      <div className="bat-combattimento__mari">
        <section className="bat__mare-grande" aria-label={`Il mare di ${nome}`}>
          <Mare
            celle={nemico}
            onTocca={inBattaglia && vista.tuoTurno && !inviando ? onSpara : undefined}
            bloccata={(k) => sparate.has(k)}
            etichetta={`Il mare di ${nome}`}
          />
          <ul className="bat__flotta" aria-label={`Le navi di ${nome}`}>
            {FLOTTA.map((t) => (
              <li key={t.id} className={affondateNemiche.has(t.id) ? 'is-affondata' : ''}>
                {t.nome}
              </li>
            ))}
          </ul>
        </section>

        <section className="bat__mare-mio" aria-label="La tua flotta">
          <div className="bat__mare-piccolo">
            <Mare celle={mio} piccolo etichetta="La tua flotta" />
          </div>
          <p className="bat__conto u-tabnum">
            La tua flotta: {FLOTTA.length - mieAfondo} navi su {FLOTTA.length}
          </p>
        </section>
      </div>

      <Attesa vista={vista} onReclama={onReclama} inviando={inviando} />
    </div>
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
  const navigate = useNavigate()
  const [errore, setErrore] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)
  const nome = vista.avversario.displayName
  const vinta = vista.vincitore === 'io'

  const perche =
    vista.motivo === 'flotta'
      ? vinta
        ? `Hai affondato tutta la flotta di ${nome}.`
        : `${nome} ha affondato tutta la tua flotta.`
      : vista.motivo === 'resa'
        ? vinta
          ? `${nome} ha abbandonato la partita.`
          : 'Hai abbandonato la partita.'
        : vinta
          ? `Vittoria a tavolino: ${nome} non ha più mosso.`
          : `Sconfitta a tavolino: non hai più mosso.`

  const aSegno = vista.colpiMiei.filter((c) => c.esito !== 'acqua').length
  const nemico = celleNemiche(vista.colpiMiei, vista.affondateNemiche, vista.flottaNemica)
  const mio = celleProprie(vista.miaFlotta ?? [], vista.colpiSubiti)

  const rivincita = async () => {
    setInvio(true)
    setErrore(null)
    try {
      await api('/battaglia/sfida', { method: 'POST', body: { playerId: vista.avversario.playerId } })
      navigate('/battaglia')
    } catch (err) {
      setErrore(err instanceof ApiFetchError ? err.message : 'La sfida non è partita.')
    } finally {
      setInvio(false)
    }
  }

  return (
    <div className="bat-fine">
      <header className={`bat-fine__testa${vinta ? ' is-vinta' : ''}`}>
        <p className="bat-fine__titolo">{vinta ? 'Hai vinto!' : `Ha vinto ${nome}`}</p>
        <p className="bat-fine__perche">{perche}</p>
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
            <section className="bat__mare-grande" aria-label={`La flotta di ${nome}`}>
              <p className="bat__didascalia">La flotta di {nome}</p>
              <Mare celle={nemico} etichetta={`La flotta di ${nome}`} />
            </section>
          )}
          {vista.miaFlotta && (
            <section className="bat__mare-mio" aria-label="La tua flotta">
              <div className="bat__mare-piccolo">
                <p className="bat__didascalia">La tua flotta</p>
                <Mare celle={mio} piccolo etichetta="La tua flotta" />
              </div>
            </section>
          )}
        </div>
      )}

      {errore && <p className="bat__nota">{errore}</p>}
      <div className="bat-fine__azioni">
        <Button onClick={() => void rivincita()} loading={invio} disabled={!vista.avversario.online}>
          {vista.avversario.online ? 'Rivincita' : `${nome} non è online`}
        </Button>
        <Link to="/battaglia" className="bat-fine__sala">
          Torna alla sala
        </Link>
      </div>
    </div>
  )
}
