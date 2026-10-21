import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta } from '@/components/Elementi'
import { IconComputer, IconFlag, IconInfo, IconList, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Sheet } from '@/components/Sheet'
import { contaPunti } from '@/games/go/conteggio'
import { PiedeConteggio } from '@/games/go/PiedeConteggio'
import { ComeSiGiocaTavoliere } from '@/games/tavolo/ComeSiGioca'
import { ADESIVO_FINE_MS, adesivoFine, testoFine, useFineVista, type Chi, type PuntiFine } from '@/games/tavolo/fine'
import { giocoDelTavoliere } from '@/games/tavolo/giochi'
import { ElencoMosse, Fine, PiedePasso, SottoTavola, Tavola } from '@/games/tavolo/Tavola'
import { leggiConti } from '@/games/tavolo/locale'
import { useTavoloComputer } from '@/games/tavolo/useTavoloComputer'
import { useAuth } from '@/lib/auth'
import type { GiocoTavoliere } from '@shared/tavolo'
import { regoleDi } from '@shared/tavolo-regole'
import { NOMI_LIVELLI } from './TavoloSala'
import './Tavolo.css'

/** L'adesivo della fine aspetta che l'ultima mossa sia arrivata al suo posto, se il tavoliere non chiede di piu'. */
const ATTESA_FINE_MS = 450

/**
 * Una partita contro il computer, a scacchi, a dama, a Forza 4, a go o a tris. Sta tutta
 * nel telefono: il computer pensa in un Web Worker, e la partita si salva a
 * ogni mossa, cosi' si riprende da dove la si era lasciata.
 */
export default function TavoloComputer({ gioco }: { gioco: GiocoTavoliere }) {
  const { vai } = useNavigazione()
  const { player } = useAuth()
  const g = useTavoloComputer(gioco)
  const p = g.partita
  const descrizione = giocoDelTavoliere(gioco)
  const [regole, setRegole] = useState(false)
  const [elenco, setElenco] = useState(false)
  const [resa, setResa] = useState(false)

  const finita = p.esito !== null
  // Nel go, dopo due passi: nessuno muove, si conta.
  const fermo = !finita && (regoleDi(gioco).conteggio?.(p.posizione) ?? false)
  const mioTurno = !finita && !fermo && regoleDi(gioco).tratto(p.posizione) === p.mia
  const vincitore: Chi =
    p.esito && p.esito.vincitore !== null ? (p.esito.vincitore === p.mia ? 'io' : 'avversario') : null
  const puntiFine: PuntiFine = p.punti
    ? { io: p.mia === 0 ? p.punti.nero : p.punti.bianco, avversario: p.mia === 0 ? p.punti.bianco : p.punti.nero }
    : null
  const puntiRef = useRef(puntiFine)
  puntiRef.current = puntiFine

  // La fine: l'adesivo, una volta, e i coriandoli, solo per una partita vista in corso.
  const { adesivo, accoda } = useCodaAdesivi()
  const attesaFine = p.esito ? (descrizione.attesaFine?.(p.esito.motivo) ?? ATTESA_FINE_MS) : ATTESA_FINE_MS
  const festa = useFesta(!finita, finita && vincitore === 'io', attesaFine)
  const fine = useFineVista(finita, attesaFine)
  const eraInCorso = useRef(false)
  const esitoRef = useRef(p.esito)
  esitoRef.current = p.esito
  useEffect(() => {
    if (!finita) {
      eraInCorso.current = true
      return
    }
    if (!eraInCorso.current) return
    eraInCorso.current = false
    const esito = esitoRef.current
    if (!esito) return
    const chi: Chi = esito.vincitore === null ? null : esito.vincitore === p.mia ? 'io' : 'avversario'
    const adesivo = adesivoFine(gioco, esito.motivo, chi, 'il computer', puntiRef.current)
    const attesa = giocoDelTavoliere(gioco).attesaFine?.(esito.motivo) ?? ATTESA_FINE_MS
    const t = setTimeout(() => accoda(adesivo), attesa)
    return () => clearTimeout(t)
  }, [accoda, finita, gioco, p.mia])

  const storia = useMemo(() => (descrizione.storia ? descrizione.storia(p.mosse) : null), [descrizione, p.mosse])

  // Il conto del livello, a partita finita: la partita appena chiusa e' gia' dentro.
  const conti = useMemo(() => (finita ? leggiConti(gioco)[p.livello] : null), [finita, gioco, p.livello])
  const chiediResa = () => setResa(true)

  const piede = finita ? (
    fine.vista &&
    (() => {
      const { titolo, riga } = testoFine(p.esito!.motivo, vincitore, 'il computer', puntiFine)
      return (
        <Fine
          gioco={gioco}
          esito={vincitore === 'io' ? 'vinta' : vincitore === null ? 'patta' : 'persa'}
          titolo={titolo}
          riga={`${riga ? `${riga} · ` : ''}${NOMI_LIVELLI[p.livello]}`}
          conto={
            conti
              ? [
                  { etichetta: 'Tu', valore: conti.vinte },
                  { etichetta: 'Computer', valore: conti.perse },
                  { etichetta: 'Patte', valore: conti.patte },
                ]
              : undefined
          }
          ritardo={fine.dalVivo ? ADESIVO_FINE_MS : 0}
        >
          <Button size="lg" fullWidth onClick={() => g.nuova()}>
            <IconRefresh size={18} /> Gioca ancora
          </Button>
          <Button size="lg" fullWidth variant="tinted" onClick={() => vai(ROTTE.tavolo(gioco))}>
            Cambia livello
          </Button>
        </Fine>
      )
    })()
  ) : fermo ? (
    <PiedeConteggio
      posizione={p.posizione}
      morte={g.morte}
      mia={p.mia}
      altro="il computer"
      correggibile={false}
      onAccetta={g.confermaConteggio}
      onRiprendi={g.riprendi}
    />
  ) : g.errore ? (
    <div className="tav-errore" role="alert">
      <span>{g.errore}</span>
      <Button variant="tinted" onClick={g.riprova}>
        Riprova
      </Button>
    </div>
  ) : descrizione.sotto === 'mosse' ? (
    <SottoTavola
      storia={storia ?? []}
      onMosse={() => setElenco(true)}
      resa={{ etichetta: 'Abbandona', onClick: chiediResa }}
    />
  ) : descrizione.sotto === 'passo' ? (
    <PiedePasso
      avviso={descrizione.avviso(p.posizione, mioTurno)}
      puoi={mioTurno}
      onPassa={() => descrizione.passo && g.muovi(descrizione.passo)}
    />
  ) : null

  // Il conteggio sul goban: mentre si conta, e a partita finita ai punti, con le pietre che si sono contate morte.
  const morte = fermo ? g.morte : p.esito?.motivo === 'punti' ? (p.morte ?? null) : null
  const conto = morte ? contaPunti(p.posizione, morte) : null

  return (
    <Pagina
      titolo={descrizione.nome}
      sotto={`Contro il computer · ${NOMI_LIVELLI[p.livello]}`}
      intera
      indietro={{ a: ROTTE.tavolo(gioco), etichetta: descrizione.nome }}
      azioni={
        <>
          <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
          {/* Scacchi e dama hanno le mosse e la resa sotto la scacchiera; gli altri qui. */}
          {storia && p.mosse.length > 0 && (descrizione.sotto !== 'mosse' || finita) && (
            <BottoneBarra etichetta="Le mosse" onClick={() => setElenco(true)}>
              <IconList size={20} />
            </BottoneBarra>
          )}
          {!finita && descrizione.sotto !== 'mosse' && (
            <BottoneBarra etichetta="Abbandona" onClick={chiediResa}>
              <IconFlag size={19} />
            </BottoneBarra>
          )}
        </>
      }
    >
      <Tavola
        descrizione={descrizione}
        posizione={p.posizione}
        mosse={p.mosse}
        mia={p.mia}
        attivo={mioTurno}
        finita={finita}
        io={{
          nome: player?.displayName ?? 'Tu',
          avatar: <Avatar nickname={player?.nickname ?? '?'} color={player?.avatarColor} size={42} />,
        }}
        altro={{
          nome: 'Computer',
          avatar: (
            <span className="tav-computer" aria-hidden="true">
              <IconComputer size={24} />
            </span>
          ),
          nota: `Livello ${NOMI_LIVELLI[p.livello].toLowerCase()}`,
        }}
        turno={finita || fermo ? null : mioTurno ? 'io' : 'altro'}
        vincitore={finita ? (vincitore === 'io' ? 'io' : vincitore === null ? 'patta' : 'altro') : null}
        onMossa={g.muovi}
        tempo={
          g.scadenza !== null && g.tempoMs !== null
            ? { scadenza: g.scadenza, totaleMs: g.tempoMs, di: 'io', onScaduto: g.scaduto }
            : null
        }
        conteggio={conto && morte ? { morte: new Set(morte), proprietario: conto.proprietario } : undefined}
        piede={piede}
      />

      <ComeSiGiocaTavoliere gioco={gioco} open={regole} onClose={() => setRegole(false)} />

      <Sheet open={elenco} onClose={() => setElenco(false)} title="Le mosse">
        {storia && <ElencoMosse mosse={storia} />}
      </Sheet>

      <Sheet open={resa} onClose={() => setResa(false)} title="Abbandonare la partita?">
        <div className="tav-foglio">
          <p className="tav-foglio__testo">Vince il computer.</p>
          <Button
            size="lg"
            fullWidth
            variant="destructive"
            onClick={() => {
              setResa(false)
              g.arrenditi()
            }}
          >
            Abbandona
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
