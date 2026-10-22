import { chiudiSospesa, riprendiSospesa, segnaSospesa, sospesaDi } from '@/games/sospese/registro'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, Vuoto, useFesta } from '@/components/Elementi'
import {
  IconChevronRight,
  IconComputer,
  IconFlag,
  IconInfo,
  IconRefresh,
  IconTarget,
} from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { IconaScheda, Pillola, Scheda } from '@/components/Scheda'
import { Sheet } from '@/components/Sheet'
import { Affondamento, AnnuncioColpo, Esplosione } from '@/games/battaglia/Annuncio'
import { ComeSiGiocaBattaglia } from '@/games/battaglia/ComeSiGioca'
import { Mare } from '@/games/battaglia/Mare'
import { Navi } from '@/games/battaglia/Navi'
import { celleNemiche, celleProprie } from '@/games/battaglia/celle'
import { naveConCaselle, naviNemiche, naviProprie, notiziaDi } from '@/games/battaglia/racconto'
import { useBattaglia } from '@/games/battaglia/useBattaglia'
import { ApiFetchError, api } from '@/lib/api'
import { usePlayer } from '@/lib/auth'
import { formatCronometro } from '@/lib/format'
import { suona } from '@/lib/suoni'
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

const LIVELLI_NOME = { facile: 'facile', normale: 'normale', difficile: 'difficile' } as const

/** Contro chi si gioca, detto in mezzo a una frase: "il computer", "Giada". */
export function nomeAvversario(v: VistaBattaglia): string {
  return v.modalita === 'amici' ? v.avversario.displayName : 'il computer'
}

function maiuscola(testo: string): string {
  return testo.charAt(0).toUpperCase() + testo.slice(1)
}

/**
 * Il titolo in alto: l'avversario. Le classificate dei giorni in cui la
 * battaglia ne aveva una erano contro il computer, e si vedono cosi'.
 */
function controChi(v: VistaBattaglia | null): string | undefined {
  if (!v) return undefined
  if (v.modalita === 'amici') return `Con ${v.avversario.displayName}`
  return 'Contro il computer'
}

/**
 * Una partita di battaglia navale: prima si dispone la flotta, poi si spara, poi
 * si guarda com'e' andata. Tre fasi nella stessa rotta, perché l'indirizzo
 * resti quello della partita dall'inizio alla fine — e chi riapre l'app ci
 * torna dentro.
 *
 * La stessa schermata fa le due modalità: la partita contro il computer — che
 * risponde subito, nella stessa richiesta — e quella con un amico, che va a
 * polling.
 */
export default function BattagliaPartita() {
  const { id = '' } = useParams()
  const g = useBattaglia(id)
  const [aiuto, setAiuto] = useState(false)
  const [resa, setResa] = useState(false)
  const v = g.vista
  const festa = useFesta(v ? v.stato !== 'finita' : null, v?.stato === 'finita' && v.vincitore === 'io')
  // Le flotte in mare: comincia il combattimento.
  const inBattaglia = v?.stato === 'battaglia'
  const primaDisposta = useRef(false)
  useEffect(() => {
    if (v?.stato === 'disposizione') primaDisposta.current = true
    else if (inBattaglia && primaDisposta.current) {
      primaDisposta.current = false
      suona('via')
    }
  }, [v?.stato, inBattaglia])
  const persa = useFesta(v ? v.stato !== 'finita' : null, v?.stato === 'finita' && v.vincitore !== 'io')
  // La fine si sente solo per una partita vista giocare, come la festa.
  useEffect(() => {
    if (festa) suona('vittoria')
  }, [festa])
  useEffect(() => {
    if (persa) suona('sconfitta')
  }, [persa])
  // L'altro che se ne va: la vittoria a tavolino si sente come qualcuno che esce.
  const abbandonata = v?.stato === 'finita' && v.motivo === 'resa' && v.vincitore === 'io'

  // Contro il computer, la partita con le flotte in mare e' una libera in sospeso: si riprende dalla sala o
  // dalle Libere, e lasciata da li' la chiude la resa.
  const controComputer = v?.modalita === 'computer'
  const colpi = v?.colpiMiei.length ?? 0
  const vista = useRef(false)
  useEffect(() => {
    if (!controComputer || !v) return
    if (v.stato === 'finita') {
      chiudiSospesa('battaglia', v.motivo === 'resa' && v.vincitore !== 'io' ? 'annullata' : 'finita')
      return
    }
    if (v.stato !== 'battaglia') return
    if (!vista.current && sospesaDi('battaglia')) riprendiSospesa('battaglia')
    vista.current = true
    segnaSospesa('battaglia', {
      a: ROTTE.partitaBattaglia(v.id),
      dettaglio: `Contro il computer · ${colpi} ${colpi === 1 ? 'colpo' : 'colpi'}`,
      chiudi: `/battaglia/partite/${v.id}/resa`,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controComputer, v?.id, v?.stato, colpi])
  useEffect(() => {
    if (abbandonata && festa) suona('esce', { ritardo: 0.5 })
  }, [abbandonata, festa])

  return (
    <Pagina
      titolo="Battaglia navale"
      sotto={controChi(v)}
      intera
      larga
      indietro={{ a: ROTTE.battaglia, etichetta: 'Battaglia' }}
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
          <Fine vista={v} ricarica={g.ricarica} />
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

      <Sheet open={resa} onClose={() => setResa(false)} title="Abbandonare la partita?">
        <div className="bat-resa">
          <p>
            {!v ? '' : v.modalita === 'amici' ? `Vince ${v.avversario.displayName}.` : 'Conta come una sconfitta.'}
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
  const io = usePlayer()
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
    suona('posa')
    return true
  }

  const tocca = (k: number) => {
    const sopra = navi.find((n) => caselleDellaNave(n).includes(k))
    if (sopra) {
      setScelta(scelta === sopra.tipo ? null : sopra.tipo)
      setNota(null)
      suona('tocco')
      return
    }
    if (!scelta) {
      setNota('Prima tocca una nave.')
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

  const tipoScelto = scelta ? tipoDi(scelta) : null
  const avversario =
    vista.modalita !== 'amici'
      ? `Livello ${LIVELLI_NOME[vista.livello ?? 'normale']}`
      : vista.avversarioPronto
        ? `${vista.avversario.displayName} ti aspetta`
        : `${vista.avversario.displayName} si prepara`

  return (
    <div className="bat-disposizione">
      <Scheda
        className="bat-disposizione__scheda"
        titolo="La tua flotta"
        icona={<Avatar nickname={io.nickname} color={io.avatarColor} size={26} />}
        destra={
          <Pillola tono={vista.modalita === 'amici' && vista.avversarioPronto ? 'buona' : 'neutra'}>
            {avversario}
          </Pillola>
        }
      >
        <div className="bat-disposizione__mare">
          <Mare celle={celle} onTocca={tocca} etichetta="La tua flotta" />
        </div>
        <p className="bat__nota" aria-live="polite">
          {nota ??
            (tipoScelto ? `${naveConCaselle(tipoScelto)}: tocca dove vuoi la prua.` : 'Tocca una nave per spostarla.')}
        </p>
      </Scheda>
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
      <div className="bat-disposizione__comandi">
        <Button variant="tinted" onClick={ruota} disabled={!scelta}>
          Ruota
        </Button>
        <Button
          variant="tinted"
          onClick={() => {
            setNavi(disponiACaso())
            setScelta(null)
            setNota(null)
            // Le navi rimescolate: tre colpi di legno di fila.
            ;[0, 0.06, 0.12].forEach((ritardo) => suona('posa', { ritardo, volume: 0.7 }))
          }}
        >
          A caso
        </Button>
        <Button onClick={() => onConferma(navi)} loading={inviando}>
          {vista.modalita === 'amici' ? 'Conferma' : 'Comincia'}
        </Button>
      </div>
    </div>
  )
}

/* ────────────────────────────  Combattimento  ──────────────────────────── */

/** L'icona dell'avversario in testata: il suo avatar, o il computer. */
function IconaAvversario({ vista }: { vista: VistaBattaglia }) {
  if (vista.modalita === 'amici') {
    return <Avatar nickname={vista.avversario.nickname} color={vista.avversario.avatarColor} size={26} />
  }
  return (
    <IconaScheda>
      <IconComputer size={15} />
    </IconaScheda>
  )
}

/**
 * La battaglia in corso: il mare dell'avversario, dove si spara, e il proprio.
 *
 * Sta tutta nello schermo, senza scorrere: le misure dei due mari si ricavano
 * dallo spazio che c'e' (vedi Battaglia.css). Il turno e' la pillola nella
 * testata del mare avversario, e l'ultimo colpo la riga sotto: prima erano una
 * plancia in cima che prendeva settanta punti d'altezza. Sugli schermi troppo
 * bassi per due mari il proprio si ripiega in una riga, e si apre in un foglio.
 */
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
  const [mioAperto, setMioAperto] = useState(false)
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
  const affondate = vista.affondateNemiche.length

  // Il mare trema all'ultimo colpo andato a segno: poco se colpisce, di piu' se affonda.
  const idColpo = vista.colpiMiei.length + vista.colpiSubiti.length
  const scossa = ultimo && ultimo.esito !== 'acqua' ? { id: idColpo, forte: ultimo.esito === 'affondato' } : null

  const pillola = !inBattaglia ? (
    <Pillola>{vista.avversarioPronto ? 'Si comincia…' : `${fraAmici ? nome : 'Il computer'} si prepara`}</Pillola>
  ) : mioTurno ? (
    <Pillola tono="turno" icona={<IconTarget size={14} />} vivo>
      Tocca a te
    </Pillola>
  ) : (
    <Pillola vivo>{fraAmici ? `Tocca a ${nome}` : 'Tocca al computer'}</Pillola>
  )

  const notizia = notiziaDi(vista)
  const riga = avviso
    ? { testo: avviso, tono: 'errore' }
    : fraAmici && !vista.tuoTurno && vista.attesaMs >= 60_000 && !vista.puoiReclamare
      ? { testo: `${vista.avversario.displayName} non risponde da ${formatCronometro(vista.attesaMs)}`, tono: 'neutra' }
      : (notizia ??
        (affondate === 0
          ? { testo: 'Cinque navi da trovare', tono: 'neutra' }
          : {
              testo: `${affondate} ${affondate === 1 ? 'affondata' : 'affondate'}, ne ${FLOTTA.length - affondate === 1 ? 'resta una' : `restano ${FLOTTA.length - affondate}`}`,
              tono: 'neutra',
            }))

  const notaMia = miraInCorso
    ? `${fraAmici ? nome : 'Il computer'} ti mira…`
    : `${aGalla} ${aGalla === 1 ? 'nave' : 'navi'} su ${FLOTTA.length} a galla`
  const reclamo = fraAmici && vista.puoiReclamare && (vista.stato === 'disposizione' || !vista.tuoTurno)

  return (
    <div className={`bat-combattimento${reclamo ? ' has-avviso' : ''}`}>
      {reclamo && (
        <div className="bat__reclamo">
          <p>{vista.avversario.displayName} non risponde più.</p>
          <Button variant="tinted" onClick={onReclama} loading={inviando}>
            Vinci a tavolino
          </Button>
        </div>
      )}

      <div className="bat-combattimento__mari">
        <Scheda
          className="bat-campo bat-campo--nemico"
          accesa={mioTurno}
          titolo={fraAmici ? `Il mare di ${nome}` : 'Il mare del computer'}
          icona={<IconaAvversario vista={vista} />}
          destra={pillola}
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
          <Navi
            navi={naviNemiche(vista.affondateNemiche)}
            etichetta={fraAmici ? `Le navi di ${nome}` : 'Le navi del computer'}
          />
          <p className="bat-campo__piede" aria-live="polite">
            {!fraAmici && (
              <span className="bat-campo__colpi u-tabnum">
                <strong>{vista.colpiMiei.length}</strong> {vista.colpiMiei.length === 1 ? 'colpo' : 'colpi'}
              </span>
            )}
            <span className={`bat-campo__notizia is-${riga.tono}`}>{riga.testo}</span>
          </p>
        </Scheda>

        <Scheda
          className="bat-campo bat-campo--mio"
          allerta={miraInCorso}
          titolo="Il tuo mare"
          icona={<Avatar nickname={io.nickname} color={io.avatarColor} size={26} />}
          destra={<span className={`bat-campo__nota${miraInCorso ? ' is-mira' : ''}`}>{notaMia}</span>}
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
        </Scheda>

        {/* Sugli schermi bassi, al posto della scheda qui sopra (Battaglia.css). */}
        <button
          type="button"
          className={`bat-mio-ripiegato${miraInCorso ? ' is-mira' : ''}`}
          onClick={() => setMioAperto(true)}
          aria-label={`Il tuo mare: ${notaMia}. Apri`}
        >
          <Avatar nickname={io.nickname} color={io.avatarColor} size={26} />
          <span className="bat-mio-ripiegato__testo">
            <strong>Il tuo mare</strong>
            <span>{notaMia}</span>
          </span>
          <Navi navi={mieNavi} etichetta="Le tue navi" mini />
          <IconChevronRight size={18} />
        </button>
      </div>

      <Sheet open={mioAperto} onClose={() => setMioAperto(false)} title="Il tuo mare">
        <div className="bat-mio-foglio">
          <Mare celle={mio} etichetta="Il tuo mare" scossa={ultimo && !ultimo.mio ? scossa : null} mirino={mira} />
          <Navi navi={mieNavi} etichetta="Le tue navi" />
        </div>
      </Sheet>
    </div>
  )
}

/* ─────────────────────────────────  Fine  ──────────────────────────────── */

/** Com'e' la rivincita, in una riga: nella testata della fine, perché sotto ci sono solo i bottoni. */
function messaggioRivincita(r: VistaBattaglia['rivincita'], nome: string): string | null {
  if (!r) return null
  if (r.stato === 'attesa') {
    return r.da === 'io' ? `Aspetto la risposta di ${nome}…` : `${maiuscola(nome)} vuole la rivincita.`
  }
  if (r.stato === 'rifiutato') {
    return r.da === 'io' ? `${maiuscola(nome)} non vuole la rivincita.` : 'Hai rifiutato la rivincita.'
  }
  if (r.stato === 'scaduto' && r.da === 'io') return `${maiuscola(nome)} non ha risposto alla rivincita.`
  return null
}

function Fine({ vista, ricarica }: { vista: VistaBattaglia; ricarica: () => Promise<void> }) {
  // L'altro chiede la rivincita: arriva come una sfida.
  const chiesta = vista.rivincita
  const richiesta = chiesta?.stato === 'attesa' && chiesta.da === 'avversario' ? chiesta.id : null
  useEffect(() => {
    if (richiesta) suona('invito')
  }, [richiesta])
  const { vai } = useNavigazione()
  const [errore, setErrore] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)
  const nome = nomeAvversario(vista)
  const vinta = vista.vincitore === 'io'
  const fraAmici = vista.modalita === 'amici'
  const r = vista.rivincita
  // La serie dopo questa partita: le vittorie di prima, piu' questa.
  const serie =
    vista.serie && vista.serie.partite > 0
      ? { io: vista.serie.io + (vinta ? 1 : 0), lui: vista.serie.avversario + (vinta ? 0 : 1) }
      : null

  // La rivincita accettata, da chiunque dei due: si va tutti e due alla partita nuova.
  const nuova = r?.stato === 'accettato' ? r.partitaId : null
  useEffect(() => {
    if (nuova) vai(ROTTE.partitaBattaglia(nuova), { replace: true, direzione: 'nessuna' })
  }, [nuova, vai])

  const fai = async (azione: () => Promise<void>) => {
    setInvio(true)
    setErrore(null)
    try {
      await azione()
    } catch (err) {
      setErrore(err instanceof ApiFetchError ? err.message : 'Qualcosa è andato storto. Riprova.')
    } finally {
      setInvio(false)
    }
  }

  /** Gioca ancora fra amici: se l'altro l'aveva gia' chiesta, e' un si' e si parte subito. */
  const rivincita = () =>
    fai(async () => {
      const esito = await api<{ partitaId?: string }>(`/battaglia/partite/${vista.id}/rivincita`, { method: 'POST' })
      if (esito.partitaId) vai(ROTTE.partitaBattaglia(esito.partitaId), { replace: true, direzione: 'nessuna' })
      else await ricarica()
    })
  const accetta = () =>
    fai(async () => {
      const { partitaId } = await api<{ partitaId: string }>(`/battaglia/sfide/${r!.id}/accetta`, { method: 'POST' })
      vai(ROTTE.partitaBattaglia(partitaId), { replace: true, direzione: 'nessuna' })
    })
  const rifiuta = () =>
    fai(async () => {
      await api(`/battaglia/sfide/${r!.id}/rifiuta`, { method: 'POST' })
      await ricarica()
    })

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
          ? `${maiuscola(nome)} non ha risposto in tempo.`
          : 'Non hai risposto in tempo.'

  const io = usePlayer()
  const aSegno = vista.colpiMiei.filter((c) => c.esito !== 'acqua').length
  const nemico = celleNemiche(vista.colpiMiei, vista.affondateNemiche, vista.flottaNemica)
  const mio = celleProprie(vista.miaFlotta ?? [], vista.colpiSubiti)
  const mieNavi = naviProprie(
    vista.miaFlotta ?? [],
    new Set(vista.colpiSubiti.filter((c) => c.esito !== 'acqua').map((c) => c.casella)),
  )
  const aGalla = mieNavi.filter((n) => !n.affondata).length

  /** Contro il computer, una partita nuova allo stesso livello. */
  const ancora = () =>
    fai(async () => {
      const partita = await api<VistaBattaglia>('/battaglia/computer', {
        method: 'POST',
        body: { livello: vista.livello ?? 'normale' },
      })
      vai(ROTTE.partitaBattaglia(partita.id), { replace: true, direzione: 'nessuna' })
    })

  return (
    <div className="bat-fine">
      <header className={`bat-fine__testa${vinta ? ' is-vinta' : ''}`}>
        <span className="bat-fine__disegno" aria-hidden="true">
          {vinta ? <Esplosione /> : <Affondamento />}
        </span>
        <p className="bat-fine__titolo">{vinta ? 'Hai vinto!' : `Ha vinto ${nome}`}</p>
        <p className="bat-fine__perche">{perche}</p>
        {fraAmici && messaggioRivincita(r, nome) && (
          <p className="bat-fine__rivincita" aria-live="polite">
            {messaggioRivincita(r, nome)}
          </p>
        )}
        {(vista.colpiMiei.length > 0 || serie) && (
          <ul className="bat-fine__dati u-tabnum" aria-label="Com'è andata">
            {vista.colpiMiei.length > 0 && (
              <li>
                {vista.colpiMiei.length === 1 ? 'Colpo' : 'Colpi'} <b>{vista.colpiMiei.length}</b>
              </li>
            )}
            {vista.colpiMiei.length > 0 && (
              <li>
                A segno <b>{Math.round((aSegno / vista.colpiMiei.length) * 100)}%</b>
              </li>
            )}
            {serie && (
              <li>
                Tu e {nome}{' '}
                <b>
                  {serie.io}–{serie.lui}
                </b>
              </li>
            )}
          </ul>
        )}
      </header>

      {/* Chi si arrende prima di disporre la flotta non ha un mare da mostrare:
          due griglie vuote non direbbero niente. I due mari stanno affiancati,
          della stessa misura: a partita finita si guardano insieme. */}
      {(vista.flottaNemica || vista.miaFlotta) && (
        <div className="bat-fine__mari">
          {vista.flottaNemica && (
            <Scheda
              className="bat-campo bat-fine__mare"
              titolo={fraAmici ? nome : 'Computer'}
              icona={<IconaAvversario vista={vista} />}
            >
              <Mare celle={nemico} piccolo etichetta={fraAmici ? `La flotta di ${nome}` : 'La flotta del computer'} />
              <p className="bat-campo__piede bat-fine__piede">
                {vista.affondateNemiche.length} {vista.affondateNemiche.length === 1 ? 'nave' : 'navi'} su{' '}
                {FLOTTA.length} a fondo
              </p>
            </Scheda>
          )}
          {vista.miaFlotta && (
            <Scheda
              className="bat-campo bat-fine__mare"
              titolo="Tu"
              icona={<Avatar nickname={io.nickname} color={io.avatarColor} size={26} />}
            >
              <Mare celle={mio} piccolo etichetta="Il tuo mare" />
              <p className="bat-campo__piede bat-fine__piede">
                {aGalla} {aGalla === 1 ? 'nave' : 'navi'} su {FLOTTA.length} a galla
              </p>
            </Scheda>
          )}
        </div>
      )}

      {errore && <p className="bat__nota">{errore}</p>}
      <div className="bat-fine__azioni">
        {fraAmici ? (
          <>
            {r?.stato === 'attesa' && r.da === 'avversario' ? (
              <>
                <Button onClick={() => void accetta()} loading={invio}>
                  Accetta la rivincita
                </Button>
                <Button variant="tinted" disabled={invio} onClick={() => void rifiuta()}>
                  No, grazie
                </Button>
              </>
            ) : r?.stato === 'attesa' && r.da === 'io' ? null : (
              <Button
                onClick={() => void rivincita()}
                loading={invio}
                disabled={!vista.avversario.online || r?.stato === 'rifiutato'}
              >
                {vista.avversario.online ? 'Gioca ancora' : `${maiuscola(nome)} non è online`}
              </Button>
            )}
            {!(r?.stato === 'attesa' && r.da === 'avversario') && (
              <Button
                variant="tinted"
                onClick={() => vai(ROTTE.battaglia, { replace: true, direzione: 'indietro' })}
              >
                Altre partite
              </Button>
            )}
          </>
        ) : (
          <>
            <Button onClick={() => void ancora()} loading={invio}>
              <IconRefresh size={18} /> Gioca ancora
            </Button>
            <Button
              variant="tinted"
              onClick={() => vai(ROTTE.battaglia, { replace: true, direzione: 'indietro' })}
            >
              Cambia livello
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
