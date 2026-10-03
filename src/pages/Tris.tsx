import { useEffect, useRef, useState } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta, Vuoto } from '@/components/Elementi'
import { IconComputer, IconInfo, IconPeople, IconPlay, IconTrophy } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { adesivoFine, type Chi } from '@/games/tavolo/fine'
import { Tavola, Turno } from '@/games/tavolo/Tavola'
import { ComeSiGiocaTris } from '@/games/tris/ComeSiGioca'
import { TRIS } from '@/games/tris/descrizione'
import { SerieTris } from '@/games/tris/Serie'
import { useTrisDelGiorno } from '@/games/tris/useTrisDelGiorno'
import { useCountdown } from '@/games/wordle/useCountdown'
import { useAuth } from '@/lib/auth'
import { formatCountdown } from '@/lib/format'
import { esito as esitoDi, posizioneIniziale, rigioca, scrivi, segnoDelGiocatore } from '@shared/tris'
import type { PartitaTris, TrisStato } from '@shared/types'
import '@/games/tris/Tris.css'

/** L'adesivo della fine di una partita aspetta che la fila si sia tracciata. */
const ATTESA_FINE_MS = 650

const ORDINALI = ['la prima', 'la seconda', 'la terza', 'la quarta', 'la quinta']

/** Chi ha vinto una partita finita, per gli adesivi della tavola. */
function chiDi(p: PartitaTris): Chi {
  return p.esito === 'vinta' ? 'io' : p.esito === 'persa' ? 'avversario' : null
}

/** Perché e' finita: il tris, la griglia piena, o il tempo. */
function motivoDi(p: PartitaTris) {
  if (p.tempo) return 'tempo' as const
  const posizione = rigioca(p.mosse)
  return posizione && esitoDi(posizione)?.fine === 'pieno' ? ('pieno' as const) : ('tris' as const)
}

/**
 * Il tris del giorno: cinque partite contro il computer di oggi, lo stesso per
 * tutti, con dieci secondi a mossa. Si giocano una dopo l'altra, e la griglia
 * mostra quella in corso; una partita finita si rivede toccandola nella fila.
 */
export default function Tris() {
  const g = useTrisDelGiorno()
  const { player } = useAuth()
  const [regole, setRegole] = useState(false)
  const [scelta, setScelta] = useState<number | null>(null)
  const s = g.stato

  // La partita sulla griglia: quella in corso; fra una partita e l'altra quella scelta, o l'ultima.
  const indice = g.corrente ?? scelta ?? (g.partite.length > 0 ? g.partite.length - 1 : null)
  const mostrata = indice !== null ? (g.partite[indice] ?? null) : null
  const prossima = g.partite.length
  const mia = mostrata?.segno ?? segnoDelGiocatore(prossima)
  const posizione = mostrata ? (rigioca(mostrata.mosse) ?? posizioneIniziale()) : posizioneIniziale()
  const finita = mostrata !== null && mostrata.esito !== null

  // Una partita nuova si guarda da sola: la scelta di prima non vale piu'.
  useEffect(() => {
    if (g.corrente !== null) setScelta(null)
  }, [g.corrente])

  // La fine di una partita vista in corso: l'adesivo, e i coriandoli per una vittoria.
  const { adesivo, accoda } = useCodaAdesivi()
  const vistaInCorso = useRef<number | null>(null)
  const [vinta, setVinta] = useState(false)
  useEffect(() => {
    if (g.corrente !== null) {
      vistaInCorso.current = g.corrente
      setVinta(false)
      return
    }
    const k = vistaInCorso.current
    const p = k !== null ? g.partite[k] : undefined
    if (k === null || !p?.esito) return
    vistaInCorso.current = null
    const t = window.setTimeout(() => {
      accoda(adesivoFine('tris', motivoDi(p), chiDi(p), 'il computer'))
      setVinta(p.esito === 'vinta')
    }, ATTESA_FINE_MS)
    return () => window.clearTimeout(t)
  }, [accoda, g.corrente, g.partite])
  const festa = useFesta(g.corrente !== null, vinta)

  const titolo = s ? `Tris #${s.puzzleNumber}` : 'Tris'

  return (
    <Pagina
      titolo={titolo}
      intera
      indietro={{ a: ROTTE.home, etichetta: 'Giornaliere' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      {g.errore ? (
        <Vuoto
          titolo="Il tris non si è aperto"
          testo={g.errore}
          azione={
            <Button variant="tinted" onClick={g.ricarica}>
              Riprova
            </Button>
          }
        />
      ) : !s ? (
        <div className="tris-attesa" aria-hidden="true" />
      ) : (
        <div className="tris-pagina">
          <SerieTris
            partite={g.partite}
            totale={s.totale}
            scelta={g.corrente === null ? indice : null}
            onScegli={(k) => setScelta(k)}
          />
          <Tavola
            descrizione={TRIS}
            posizione={scrivi(posizione)}
            mosse={mostrata ? mostrata.mosse.map(String) : []}
            mia={mia}
            attivo={g.attivo}
            finita={finita}
            io={{
              nome: player?.displayName ?? 'Tu',
              avatar: <Avatar nickname={player?.nickname ?? '?'} color={player?.avatarColor} size={36} />,
            }}
            altro={{
              nome: 'Computer',
              avatar: (
                <span className="tav-computer tav-computer--tris" aria-hidden="true">
                  <IconComputer size={20} />
                </span>
              ),
              nota: 'di oggi',
            }}
            turno={g.corrente === null ? null : g.attivo ? 'io' : 'altro'}
            onMossa={(m) => g.muovi(Number(m))}
            tempo={
              g.attivo && g.scadenza !== null
                ? { scadenza: g.scadenza, totaleMs: s.tempoMossaMs, di: 'io', onScaduto: g.scaduto }
                : null
            }
            piede={<Piede g={g} stato={s} prossima={prossima} mostrata={indice} />}
          />
        </div>
      )}
      <ComeSiGiocaTris open={regole} onClose={() => setRegole(false)} />
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** Sotto la griglia: il turno, la partita dopo, o com'e' andata la serie. */
function Piede({
  g,
  stato,
  prossima,
  mostrata,
}: {
  g: ReturnType<typeof useTrisDelGiorno>
  stato: TrisStato
  prossima: number
  mostrata: number | null
}) {
  if (g.corrente !== null) {
    return <Turno mio={g.attivo} testo={g.attivo ? 'Tocca a te' : 'Il computer pensa…'} />
  }
  if (stato.status === 'done') return <FineSerie stato={stato} />

  const ultima = g.partite[prossima - 1]
  const comincio = segnoDelGiocatore(prossima) === 0
  // Fra una partita e l'altra: com'e' andata quella appena finita, e la prossima.
  const appena =
    ultima && mostrata === prossima - 1
      ? ultima.esito === 'vinta'
        ? `Hai vinto ${ORDINALI[prossima - 1]}`
        : ultima.esito === 'patta'
          ? `Patta ${ORDINALI[prossima - 1]}`
          : ultima.tempo
            ? 'Tempo scaduto'
            : `Hai perso ${ORDINALI[prossima - 1]}`
      : null
  return (
    <div className="tris-prossima">
      {appena && <p className="tris-prossima__appena">{appena}</p>}
      <p className="tris-prossima__titolo">
        Partita {prossima + 1} di {stato.totale}
      </p>
      <p className="tris-prossima__riga">
        {comincio ? 'Cominci tu, con la croce' : 'Comincia il computer: tu sei il cerchio'}
      </p>
      <Button size="lg" onClick={g.comincia} disabled={g.occupato}>
        <IconPlay size={17} /> {prossima === 0 ? 'Comincia' : 'Gioca la prossima'}
      </Button>
    </div>
  )
}

/** Serie finita: i punti, com'e' andata, e quando arriva la prossima. */
function FineSerie({ stato }: { stato: TrisStato }) {
  const restano = useCountdown(stato.msToNextPuzzle)
  const vinte = stato.partite.filter((p) => p.esito === 'vinta').length
  const patte = stato.partite.filter((p) => p.esito === 'patta').length
  const perse = stato.partite.length - vinte - patte
  const conto = [
    `${vinte} ${vinte === 1 ? 'vinta' : 'vinte'}`,
    `${patte} ${patte === 1 ? 'patta' : 'patte'}`,
    `${perse} ${perse === 1 ? 'persa' : 'perse'}`,
  ].join(' · ')
  return (
    <div className="tris-fine">
      <p className="tris-fine__valore u-tabnum">{stato.punti} punti</p>
      <p className="tris-fine__dettaglio u-tabnum">{conto}</p>
      <div className="tris-fine__azioni">
        <Collegamento to={ROTTE.classifica('tris')} className="tris-fine__link">
          <IconTrophy size={18} />
          Classifica
        </Collegamento>
        <Collegamento to={ROTTE.libera('tris')} className="tris-fine__link">
          <IconPeople size={18} />
          Contro chi vuoi
        </Collegamento>
      </div>
      <p className="tris-fine__piede">
        La prossima serie fra <span className="u-tabnum">{formatCountdown(restano)}</span>
      </p>
    </div>
  )
}
