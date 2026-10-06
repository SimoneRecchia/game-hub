import { useEffect, useMemo, useRef, useState } from 'react'
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
import { giocoTavoloDi } from '@/games/catalog'
import { cambiaGruppo, contaPunti } from '@/games/go/conteggio'
import { PiedeConteggio } from '@/games/go/PiedeConteggio'
import { ComeSiGiocaTavoliere } from '@/games/tavolo/ComeSiGioca'
import { adesivoFine, testoFine, useFineVista } from '@/games/tavolo/fine'
import { giocoDelTavoliere } from '@/games/tavolo/giochi'
import { ElencoMosse, Fine, Tavola, Turno } from '@/games/tavolo/Tavola'
import { useTavolo, type PartitaConAmico } from '@/games/tavolo/useTavolo'
import { useAuth } from '@/lib/auth'
import type { GiocoTavoliere } from '@shared/tavolo'
import { regoleDi } from '@shared/tavolo-regole'
import type { VistaTavolo } from '@shared/types'
import './Tavolo.css'

/** L'adesivo della fine aspetta che l'ultima mossa sia arrivata al suo posto. */
const ATTESA_FINE_MS = 450

/**
 * Una partita con un amico a scacchi, a dama, a Forza 4, a go o a tris. Le mosse passano
 * dal server, che le controlla con le stesse regole del telefono; qui si
 * vedono subito, e l'altro le riceve al suo prossimo giro di controllo.
 */
export default function TavoloPartita({ gioco }: { gioco: GiocoTavoliere }) {
  const { id = '' } = useParams()
  const { vai } = useNavigazione()
  const g = useTavolo(id)
  const v = g.vista
  const nomeGioco = giocoTavoloDi(gioco).nome

  // Un indirizzo con il gioco sbagliato (un link scritto a mano): si va a quello giusto.
  useEffect(() => {
    if (v && v.gioco !== gioco) vai(ROTTE.partitaTavolo(v.gioco, v.id), { replace: true, direzione: 'nessuna' })
  }, [gioco, v, vai])

  if (g.errore && !v) {
    return (
      <Pagina titolo={nomeGioco} intera indietro={{ a: ROTTE.tavolo(gioco), etichetta: nomeGioco }}>
        <Vuoto titolo="Partita non trovata" testo={g.errore} />
      </Pagina>
    )
  }
  if (!v || v.gioco !== gioco) {
    return (
      <Pagina titolo={nomeGioco} intera indietro={{ a: ROTTE.tavolo(gioco), etichetta: nomeGioco }}>
        <div className="tav-attesa" aria-hidden="true" />
      </Pagina>
    )
  }
  return <Partita g={g} v={v} />
}

function Partita({ g, v }: { g: PartitaConAmico; v: VistaTavolo }) {
  const { player } = useAuth()
  const descrizione = giocoDelTavoliere(v.gioco)
  const [regole, setRegole] = useState(false)
  const [elenco, setElenco] = useState(false)
  const [resa, setResa] = useState(false)
  const nome = v.avversario?.displayName ?? 'l’altro'

  // La fine: l'adesivo, una volta, e i coriandoli, solo per una partita vista in corso.
  const { adesivo, accoda } = useCodaAdesivi()
  const inCorso = v.stato === 'in_corso'
  const attesaFine = v.motivo ? (descrizione.attesaFine?.(v.motivo) ?? ATTESA_FINE_MS) : ATTESA_FINE_MS
  const festa = useFesta(inCorso, v.stato === 'finita' && v.vincitore === 'io', attesaFine)
  const fineVista = useFineVista(v.stato === 'finita', attesaFine)
  const eraInCorso = useRef(false)
  const vRef = useRef(v)
  vRef.current = v
  useEffect(() => {
    if (inCorso) {
      eraInCorso.current = true
      return
    }
    if (!eraInCorso.current) return
    eraInCorso.current = false
    const ora = vRef.current
    if (ora.stato !== 'finita' || !ora.motivo) return
    const motivo = ora.motivo
    const adesivo = adesivoFine(ora.gioco, motivo, ora.vincitore, ora.avversario?.displayName ?? 'l’altro', ora.punti)
    const attesa = giocoDelTavoliere(ora.gioco).attesaFine?.(motivo) ?? ATTESA_FINE_MS
    const t = setTimeout(() => accoda(adesivo), attesa)
    return () => clearTimeout(t)
  }, [accoda, inCorso])

  const storia = useMemo(() => (descrizione.storia ? descrizione.storia(v.mosse) : null), [descrizione, v.mosse])
  const mia = v.parte ?? 0

  // Nel go, dopo due passi: si conta, e le pietre morte le segnano i due.
  const conteggio = v.conteggio
  // A partita finita ai punti il goban resta con il conteggio accettato, che non si tocca piu'.
  const morte = conteggio ? conteggio.morte : v.morte
  const conto = morte ? contaPunti(v.posizione, morte) : null

  const reclamo = v.puoiReclamare && (
    <div className="tav-domanda">
      <span>{conteggio ? `${nome} non accetta il conteggio.` : `${nome} non muove da un po’.`}</span>
      <Button variant="tinted" onClick={g.reclama} disabled={g.inviando}>
        {conteggio ? 'Chiudi con questo conteggio' : 'Chiudi e vinci'}
      </Button>
    </div>
  )

  const piede =
    v.stato === 'finita' ? (
      fineVista && <FinePartita g={g} v={v} />
    ) : conteggio ? (
      <>
        <PiedeConteggio
          posizione={v.posizione}
          morte={morte}
          mia={mia}
          altro={nome}
          correggibile
          accettato={conteggio.accettato}
          inviando={g.inviando}
          onAccetta={g.accettaConteggio}
          onRiprendi={g.riprendiGioco}
        />
        {reclamo}
      </>
    ) : (
      <>
        <Turno
          mio={v.tuoTurno}
          testo={v.tuoTurno ? 'Tocca a te' : `Tocca a ${nome}`}
          avviso={descrizione.avviso(v.posizione, v.tuoTurno)}
          onPassa={descrizione.passo && v.tuoTurno && !g.inviando ? () => g.muovi(descrizione.passo!) : undefined}
        />
        {v.patta === 'avversario' && (
          <div className="tav-domanda" role="alert">
            <span>{nome} propone la patta.</span>
            <span className="tav-domanda__azioni">
              <Button onClick={() => g.patta('accetta')} disabled={g.inviando}>
                Accetta
              </Button>
              <Button variant="tinted" onClick={() => g.patta('rifiuta')} disabled={g.inviando}>
                No
              </Button>
            </span>
          </div>
        )}
        {v.patta === 'io' && <p className="tav-fine__nota">Hai proposto la patta: aspetto {nome}.</p>}
        {reclamo}
      </>
    )

  // Finché l'altro non accetta, la partita e' un invito: non c'e' ancora un tavoliere da mostrare.
  const soloInvito = v.stato === 'invito' || v.stato === 'rifiutata' || v.stato === 'annullata'
  return (
    <Pagina
      titolo={v.avversario ? `Con ${v.avversario.displayName}` : descrizione.nome}
      intera
      indietro={{ a: ROTTE.tavolo(v.gioco), etichetta: descrizione.nome }}
      azioni={
        <>
          <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
          {storia && v.mosse.length > 0 && (
            <BottoneBarra etichetta="Le mosse" onClick={() => setElenco(true)}>
              <IconList size={20} />
            </BottoneBarra>
          )}
          {inCorso && (
            <BottoneBarra
              etichetta={regoleDi(v.gioco).patta ? 'Patta o abbandona' : 'Abbandona'}
              onClick={() => setResa(true)}
            >
              <IconFlag size={19} />
            </BottoneBarra>
          )}
        </>
      }
    >
      {soloInvito ? (
        <InvitoChiuso v={v} />
      ) : (
        <Tavola
          descrizione={descrizione}
          posizione={v.posizione}
          mosse={v.mosse}
          mia={mia}
          attivo={inCorso && v.tuoTurno && !g.inviando}
          finita={v.stato === 'finita'}
          io={{
            nome: player?.displayName ?? 'Tu',
            avatar: <Avatar nickname={player?.nickname ?? '?'} color={player?.avatarColor} size={36} />,
          }}
          altro={{
            nome,
            avatar: <Avatar nickname={v.avversario?.nickname ?? '?'} color={v.avversario?.avatarColor} size={36} />,
            nota: v.avversario && !v.avversario.online && inCorso ? 'non è online' : undefined,
          }}
          turno={inCorso && !conteggio ? (v.tuoTurno ? 'io' : 'altro') : null}
          onMossa={g.muovi}
          tempo={
            inCorso && v.tempo && g.scadenza !== null
              ? {
                  scadenza: g.scadenza,
                  totaleMs: v.tempo.mossaMs,
                  di: v.tuoTurno ? 'io' : 'altro',
                  onScaduto: v.tuoTurno ? g.scaduto : undefined,
                }
              : null
          }
          conteggio={
            conto && morte
              ? {
                  morte: new Set(morte),
                  proprietario: conto.proprietario,
                  onTocca:
                    !conteggio || g.inviando ? undefined : (k) => g.proponiMorte(cambiaGruppo(v.posizione, morte, k)),
                }
              : undefined
          }
          piede={piede}
        />
      )}

      <ComeSiGiocaTavoliere gioco={v.gioco} open={regole} onClose={() => setRegole(false)} />

      <Sheet open={elenco} onClose={() => setElenco(false)} title="Le mosse">
        {storia && <ElencoMosse mosse={storia} />}
      </Sheet>

      <Sheet
        open={resa}
        onClose={() => setResa(false)}
        title={regoleDi(v.gioco).patta ? 'Patta o abbandono?' : 'Abbandonare la partita?'}
      >
        <div className="tav-foglio">
          {regoleDi(v.gioco).patta && (
            <Button
              size="lg"
              fullWidth
              variant="tinted"
              disabled={!v.puoiProporre}
              onClick={() => {
                setResa(false)
                g.patta('proponi')
              }}
            >
              {v.patta === 'io' ? 'Patta già proposta' : 'Proponi la patta'}
            </Button>
          )}
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

function FinePartita({ g, v }: { g: PartitaConAmico; v: VistaTavolo }) {
  const { vai } = useNavigazione()
  const [chiedendo, setChiedendo] = useState(false)
  const r = v.rivincita
  const nome = v.avversario?.displayName ?? 'L’altro'
  const { titolo, riga } = testoFine(v.motivo ?? 'patta', v.vincitore, nome, v.punti)

  // La rivincita accettata: si va alla partita nuova, tutti e due.
  useEffect(() => {
    if (r?.stato === 'accettato' && r.partitaId) vai(ROTTE.partitaTavolo(v.gioco, r.partitaId), { replace: true })
  }, [r?.stato, r?.partitaId, v.gioco, vai])

  const ancora = async () => {
    setChiedendo(true)
    const esito = await g.rivincita()
    setChiedendo(false)
    if (esito?.partitaId) vai(ROTTE.partitaTavolo(v.gioco, esito.partitaId), { replace: true })
  }

  const attesaMia = r?.da === 'io' && r.stato === 'attesa'
  const sua = r?.da === 'avversario' && r.stato === 'attesa'
  const partite = v.serie.partite + 1
  const io = v.serie.io + (v.vincitore === 'io' ? 1 : 0)
  const lui = v.serie.avversario + (v.vincitore === 'avversario' ? 1 : 0)
  return (
    <Fine
      titolo={titolo}
      riga={
        <>
          {riga}
          {partite > 1 && (
            <>
              {riga ? ' · ' : ''}
              <span className="u-tabnum">
                {io} a {lui}
              </span>
            </>
          )}
        </>
      }
      note={
        <>
          {sua && <p className="tav-fine__nota">{nome} vuole la rivincita.</p>}
          {attesaMia && <p className="tav-fine__nota">Aspetto {nome}…</p>}
          {r?.da === 'avversario' && r.stato === 'rifiutato' && (
            <p className="tav-fine__nota">{nome} non vuole la rivincita.</p>
          )}
          {!v.avversario?.online && !sua && <p className="tav-fine__nota">{nome} non è più online.</p>}
        </>
      }
    >
      <Button onClick={() => void ancora()} loading={chiedendo} disabled={attesaMia || !v.avversario?.online}>
        <IconRefresh size={17} /> {sua ? 'Accetta la rivincita' : 'Gioca ancora'}
      </Button>
      <Button variant="tinted" onClick={() => vai(ROTTE.tavolo(v.gioco))}>
        Esci
      </Button>
    </Fine>
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
        <Button variant="tinted" onClick={() => vai(ROTTE.tavolo(v.gioco))}>
          Torna alla sala
        </Button>
      }
    />
  )
}
