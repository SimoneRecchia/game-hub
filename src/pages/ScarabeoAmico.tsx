import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, Vuoto, useFesta } from '@/components/Elementi'
import { IconFlag, IconInfo, IconList, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Sheet } from '@/components/Sheet'
import { Campo, ElencoMosse, Tabellino } from '@/games/scarabeo/Campo'
import { ComeSiGiocaScarabeo } from '@/games/scarabeo/ComeSiGioca'
import {
  ADESIVO_FINE_SCARABEO_MS,
  MOSSA_DEL_COMPUTER_DA_ADESIVO,
  adesivoFineScarabeo,
  adesivoMossa,
  type MossaAppena,
} from '@/games/scarabeo/adesivi'
import { preparaComputer } from '@/games/scarabeo/computer'
import { ILLUMINATA_MS, annuncioDi, nelSacchetto, parolaDi } from '@/games/scarabeo/turni'
import { useComposizione } from '@/games/scarabeo/useComposizione'
import { nonNelDizionario, tessereCambiate, useParoleSconosciute } from '@/games/scarabeo/useScarabeo'
import { useScarabeoAmico, type PartitaScarabeoAmico } from '@/games/scarabeo/useScarabeoAmico'
import { TempoMossa } from '@/games/tavolo/TempoMossa'
import { usePlayer } from '@/lib/auth'
import { haptic } from '@/lib/haptics'
import { suona } from '@/lib/suoni'
import { LATO, rigioca } from '@shared/scarabeo'
import { mossaInTesto, type VistaScarabeo } from '@shared/scarabeo-amici'
import { caselleDi } from '@shared/scarabeo-computer'
import type { CellaPiena, VistaTavolo } from '@shared/types'
import './Scarabeo.css'
import './Tavolo.css'

/**
 * Una partita a Scarabeo con un amico: la partita intera, a turno, fino in
 * fondo al sacchetto. Si gioca sul tavolo del server dei tavolieri — l'invito,
 * i turni, la rivincita, la vittoria a tavolino — e ognuno vede il suo leggio:
 * quello dell'altro e il sacchetto restano sul server.
 */
export default function ScarabeoAmico() {
  const { id = '' } = useParams()
  const { vai } = useNavigazione()
  const g = useScarabeoAmico(id)
  const v = g.vista

  // Un indirizzo che porta a una partita di un altro gioco: si va a quello giusto.
  useEffect(() => {
    if (v && v.gioco !== 'scarabeo') vai(ROTTE.partitaTavolo(v.gioco, v.id), { replace: true, direzione: 'nessuna' })
  }, [v, vai])
  // Il dizionario si scalda mentre si guarda il tabellone: dice subito se una parola non esiste.
  useEffect(() => {
    void preparaComputer().catch(() => {})
  }, [])

  const indietro = { a: ROTTE.tavolo('scarabeo'), etichetta: 'Scarabeo' }
  if (g.errore && !v) {
    return (
      <Pagina titolo="Scarabeo" intera indietro={indietro}>
        <Vuoto titolo="Partita non trovata" testo={g.errore} />
      </Pagina>
    )
  }
  if (!v || v.gioco !== 'scarabeo' || !g.scarabeo) {
    return (
      <Pagina titolo="Scarabeo" intera indietro={indietro}>
        <div className="scr__attesa" aria-hidden="true" />
      </Pagina>
    )
  }
  return <Partita g={g} v={v} s={g.scarabeo} />
}

function Partita({ g, v, s }: { g: PartitaScarabeoAmico; v: VistaTavolo; s: VistaScarabeo }) {
  const io = usePlayer()
  const [regole, setRegole] = useState(false)
  const [storia, setStoria] = useState(false)
  const [resa, setResa] = useState(false)
  const nome = v.avversario?.displayName ?? 'l’altro'
  const inCorso = v.stato === 'in_corso'
  const finita = v.stato === 'finita'
  const mia = v.parte ?? 0

  const { tabellone, giocate } = useMemo(() => rigioca(s.mosse), [s.mosse])
  const celle = useMemo(() => {
    const c: CellaPiena[] = []
    tabellone.forEach((casella, i) => {
      if (casella) c.push({ r: Math.floor(i / LATO), c: i % LATO, lettera: casella.lettera, jolly: casella.jolly })
    })
    return c
  }, [tabellone])

  const composizione = useComposizione({
    celle,
    leggio: s.leggio,
    bloccata: !inCorso || !v.tuoTurno || g.inviando,
    ricordo: `amico:${v.id}`,
  })
  const { anteprima, sospese, annulla, avvisa } = composizione
  const sconosciute = useParoleSconosciute(anteprima)

  // Le mosse al centro: tutte le mie, e quelle dell'altro che fanno male.
  const { adesivo, accoda } = useCodaAdesivi()
  const idMossa = useRef(0)
  const racconta = useCallback(
    (m: Omit<MossaAppena, 'id'>) => {
      idMossa.current += 1
      if (!m.mia && !m.scarabeo && m.punti < MOSSA_DEL_COMPUTER_DA_ADESIVO) return
      accoda(adesivoMossa({ ...m, id: idMossa.current }))
    },
    [accoda],
  )

  // La mossa dell'altro, arrivata con il giro di controllo: si illumina, si dice e si sente.
  const [illuminate, setIlluminate] = useState<Set<number>>(new Set())
  const viste = useRef<number | null>(null)
  const spegni = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(spegni.current), [])
  useEffect(() => {
    const prima = viste.current
    viste.current = s.mosse.length
    if (prima === null || s.mosse.length <= prima) return
    const i = s.mosse.length - 1
    if (i % 2 === mia) return
    const giocata = giocate[i]
    avvisa(annuncioDi(giocata, nome))
    if (giocata?.tipo === 'posa') {
      const { punti, scarabeo } = giocata
      racconta({ mia: false, chi: nome, parola: parolaDi(giocata.parole), punti, scarabeo })
      haptic('tap')
      suona('posa', { volume: 0.6 })
    }
    setIlluminate(new Set(caselleDi(s.mosse[i])))
    window.clearTimeout(spegni.current)
    spegni.current = window.setTimeout(() => setIlluminate(new Set()), ILLUMINATA_MS)
  }, [avvisa, giocate, mia, nome, racconta, s.mosse])

  // La fine: l'adesivo, una volta, per una partita vista in corso; poi i coriandoli a chi ha vinto.
  const vinta = finita && v.vincitore === 'io'
  const festa = useFesta(inCorso ? true : finita ? false : null, vinta, ADESIVO_FINE_SCARABEO_MS)
  const eraInCorso = useRef(false)
  useEffect(() => {
    if (inCorso) {
      eraInCorso.current = true
      return
    }
    if (!eraInCorso.current || !finita) return
    eraInCorso.current = false
    accoda(adesivoFineScarabeo(0, v.vincitore === 'io', s.punti.io, s.punti.altro, nome))
  }, [accoda, finita, inCorso, nome, s.punti.altro, s.punti.io, v.vincitore])

  const invia = async (mossa: string, riuscita: () => void) => {
    const errore = await g.muovi(mossa)
    if (errore) {
      haptic('error')
      suona('sbagliato', { volume: 0.6 })
      avvisa(errore)
      return
    }
    riuscita()
  }

  const gioca = () => {
    if (sospese.length === 0) {
      avvisa('Posa almeno una tessera.')
      return
    }
    if (anteprima && !anteprima.ok) {
      haptic('error')
      suona('sbagliato', { volume: 0.6 })
      avvisa(anteprima.errore)
      return
    }
    if (sconosciute === null) {
      avvisa('Controllo il dizionario…')
      return
    }
    if (sconosciute.length > 0) {
      haptic('error')
      suona('sbagliato', { volume: 0.6 })
      avvisa(nonNelDizionario(sconosciute))
      return
    }
    const fatta = {
      mia: true,
      parola: anteprima?.ok ? parolaDi(anteprima.parole.map((p) => p.parola)) : '',
      punti: anteprima?.ok ? anteprima.punti : 0,
      scarabeo: anteprima?.ok ? anteprima.scarabeo : false,
    }
    void invia(mossaInTesto({ tipo: 'posa', posa: sospese }), () => {
      annulla()
      racconta(fatta)
      haptic('success')
    })
  }

  const elenco = giocate.map((m, i) => ({ ...m, mia: i % 2 === mia, autore: i % 2 === mia ? 'Tu' : nome }))
  const soloInvito = v.stato === 'invito' || v.stato === 'rifiutata' || v.stato === 'annullata'

  return (
    <Pagina
      titolo={v.avversario ? `Con ${v.avversario.displayName}` : 'Scarabeo'}
      intera
      indietro={{ a: ROTTE.tavolo('scarabeo'), etichetta: 'Scarabeo' }}
      azioni={
        <>
          <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
          {s.mosse.length > 0 && (
            <BottoneBarra etichetta="Le mosse" onClick={() => setStoria(true)}>
              <IconList size={20} />
            </BottoneBarra>
          )}
          {inCorso && (
            <BottoneBarra etichetta="Abbandona" onClick={() => setResa(true)}>
              <IconFlag size={19} />
            </BottoneBarra>
          )}
        </>
      }
    >
      {soloInvito ? (
        <InvitoChiuso v={v} />
      ) : (
        <Campo
          c={composizione}
          sconosciute={sconosciute}
          bloccato={!inCorso || !v.tuoTurno || g.inviando}
          attesa={inCorso && !v.tuoTurno ? `Tocca a ${nome}` : null}
          restanti={s.restanti}
          evidenziate={illuminate}
          testa={
            <>
              <Tabellino
                iconaIo={<Avatar nickname={io.nickname} color={io.avatarColor} size={20} />}
                iconaAltro={
                  <Avatar nickname={v.avversario?.nickname ?? '?'} color={v.avversario?.avatarColor} size={20} />
                }
                avviso={composizione.messaggio}
                posa={anteprima}
                sconosciute={sconosciute}
                io={s.punti.io}
                altro={s.punti.altro}
                nomeAltro={nome}
                notaAltro={v.avversario && !v.avversario.online && inCorso ? 'non è online' : undefined}
                turno={inCorso ? (v.tuoTurno ? 'io' : 'altro') : null}
                sotto={finita ? 'Partita finita' : nelSacchetto(s.restanti)}
                onApri={() => setStoria(true)}
              />
              {inCorso && v.tempo && g.scadenza !== null && (
                <TempoMossa
                  scadenza={g.scadenza}
                  totaleMs={v.tempo.mossaMs}
                  mio={v.tuoTurno}
                  onScaduto={v.tuoTurno ? g.scaduto : undefined}
                />
              )}
              {v.puoiReclamare && (
                <div className="tav-domanda">
                  <span>{nome} non muove da un po’.</span>
                  <Button variant="tinted" onClick={g.reclama} disabled={g.inviando}>
                    Chiudi e vinci
                  </Button>
                </div>
              )}
            </>
          }
          fine={finita ? <FineAmico g={g} v={v} s={s} /> : undefined}
          onGioca={gioca}
          onPassa={() => {
            annulla()
            void invia('passo', () => avvisa('Mossa passata.'))
          }}
          onCambia={(tessere) => {
            annulla()
            void invia(mossaInTesto({ tipo: 'cambio', tessere }), () => avvisa(tessereCambiate(tessere.length)))
          }}
        />
      )}

      <ComeSiGiocaScarabeo open={regole} onClose={() => setRegole(false)} />

      <Sheet open={storia} onClose={() => setStoria(false)} title="Le mosse">
        <ElencoMosse mosse={elenco} vuoto="Nessuna mossa, per ora." />
      </Sheet>

      <Sheet open={resa} onClose={() => setResa(false)} title="Abbandonare la partita?">
        <div className="tav-foglio">
          <Button
            size="lg"
            fullWidth
            variant="destructive"
            onClick={() => {
              setResa(false)
              g.arrenditi()
            }}
          >
            Abbandona: vince {nome}
          </Button>
          <Button size="lg" fullWidth variant="plain" onClick={() => setResa(false)}>
            Continua a giocare
          </Button>
        </div>
      </Sheet>

      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** Com'e' finita: chi ha posato l'ultima tessera, o i sei turni senza parole, l'abbandono, il tavolino. */
function rigaDellaFine(v: VistaTavolo, s: VistaScarabeo, nome: string): string {
  if (v.motivo === 'resa') return v.vincitore === 'io' ? `${nome} ha abbandonato` : 'Hai abbandonato'
  if (v.motivo === 'assenza') return v.vincitore === 'io' ? `${nome} non ha più mosso` : 'Vinta a tavolino'
  if (s.fine === 'chiusa') {
    return s.aggiustamento.io > 0
      ? `Hai posato l’ultima tessera: +${s.aggiustamento.io} dalle tessere di ${nome}`
      : `${nome} ha posato l’ultima tessera: −${-s.aggiustamento.io} per le tue tessere`
  }
  if (s.fine === 'ferma') return `Sei turni senza parole: ognuno perde le sue tessere`
  return ''
}

/** Sotto il tabellone, a partita finita: il risultato, la serie e la rivincita. */
function FineAmico({ g, v, s }: { g: PartitaScarabeoAmico; v: VistaTavolo; s: VistaScarabeo }) {
  const { vai } = useNavigazione()
  const [chiedendo, setChiedendo] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const r = v.rivincita
  const nome = v.avversario?.displayName ?? 'L’altro'
  const titolo = v.vincitore === 'io' ? 'Hai vinto' : v.vincitore === 'avversario' ? `Ha vinto ${nome}` : 'Pari'

  // La rivincita accettata: si va alla partita nuova, tutti e due.
  useEffect(() => {
    if (r?.stato === 'accettato' && r.partitaId) vai(ROTTE.partitaTavolo('scarabeo', r.partitaId), { replace: true })
  }, [r?.stato, r?.partitaId, vai])

  const ancora = async () => {
    setChiedendo(true)
    const esito = await g.rivincita()
    setChiedendo(false)
    setErrore(esito.errore ?? null)
    if (esito.partitaId) vai(ROTTE.partitaTavolo('scarabeo', esito.partitaId), { replace: true })
  }

  const attesaMia = r?.da === 'io' && r.stato === 'attesa'
  const sua = r?.da === 'avversario' && r.stato === 'attesa'
  const partite = v.serie.partite + 1
  const vinteIo = v.serie.io + (v.vincitore === 'io' ? 1 : 0)
  const vinteLui = v.serie.avversario + (v.vincitore === 'avversario' ? 1 : 0)
  const riga = rigaDellaFine(v, s, nome)
  return (
    <div className="scr-fine">
      <p className="scr-fine__titolo">{titolo}</p>
      <p className="scr-fine__nota">
        <span className="u-tabnum">
          {s.punti.io} a {s.punti.altro}
        </span>
        {partite > 1 && (
          <>
            {' · serie '}
            <span className="u-tabnum">
              {vinteIo} a {vinteLui}
            </span>
          </>
        )}
      </p>
      {riga && <p className="scr-fine__nota">{riga}</p>}
      {sua && <p className="scr-fine__nota">{nome} vuole la rivincita.</p>}
      {attesaMia && <p className="scr-fine__nota">Aspetto {nome}…</p>}
      {r?.da === 'avversario' && r.stato === 'rifiutato' && (
        <p className="scr-fine__nota">{nome} non vuole la rivincita.</p>
      )}
      {!v.avversario?.online && !sua && <p className="scr-fine__nota">{nome} non è più online.</p>}
      {errore && <p className="scr-fine__nota">{errore}</p>}
      <div className="scr-fine__azioni">
        <Button onClick={() => void ancora()} loading={chiedendo} disabled={attesaMia || !v.avversario?.online}>
          <IconRefresh size={17} /> {sua ? 'Accetta la rivincita' : 'Gioca ancora'}
        </Button>
        <Button variant="tinted" onClick={() => vai(ROTTE.tavolo('scarabeo'))}>
          Esci
        </Button>
      </div>
    </div>
  )
}

/** La partita e' ancora un invito: chi l'ha mandato aspetta; se e' stato rifiutato o ritirato, lo dice. */
function InvitoChiuso({ v }: { v: VistaTavolo }) {
  const { vai } = useNavigazione()
  const nome = v.avversario?.displayName
  const chiuso = v.stato !== 'invito'
  return (
    <Vuoto
      titolo={chiuso ? 'Invito chiuso' : nome ? `Aspetto ${nome}` : 'Aspetto chi apre il link'}
      testo={chiuso && v.stato === 'rifiutata' ? `${nome ?? 'L’amico'} non può giocare adesso.` : undefined}
      azione={
        <Button variant="tinted" onClick={() => vai(ROTTE.tavolo('scarabeo'))}>
          Torna alla sala
        </Button>
      }
    />
  )
}
