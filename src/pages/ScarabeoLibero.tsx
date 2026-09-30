import { useEffect, useRef, useState } from 'react'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, Elenco, Riga, Sezione, Tacche, Vuoto, useFesta } from '@/components/Elementi'
import { IconComputer, IconFlag, IconInfo, IconList, IconRefresh } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { IconaScheda } from '@/components/Scheda'
import { Sheet } from '@/components/Sheet'
import { Campo, ElencoMosse, Tabellino } from '@/games/scarabeo/Campo'
import { ComeSiGiocaScarabeo } from '@/games/scarabeo/ComeSiGioca'
import {
  ADESIVO_FINE_SCARABEO_MS,
  ADESIVO_MOSSA_MS,
  MOSSA_DEL_COMPUTER_DA_ADESIVO,
  adesivoFineScarabeo,
  adesivoMossa,
} from '@/games/scarabeo/adesivi'
import { useScarabeoLibero, type ScarabeoLiberoController } from '@/games/scarabeo/useScarabeoLibero'
import { usePlayer } from '@/lib/auth'
import { LIVELLI, MOSSE_A_TESTA, type Livello } from '@shared/scarabeo-computer'
import './Scarabeo.css'

const NOMI: Record<Livello, string> = { facile: 'Facile', normale: 'Normale', difficile: 'Difficile' }

/**
 * Lo Scarabeo libero: una partita a turni contro il computer.
 *
 * Tutto nel browser — il computer gira in un Web Worker con il dizionario
 * intero, la partita si salva come mosse a ogni turno — e al server va solo il
 * risultato, per le statistiche. Non conta per la classifica: il sacchetto e'
 * nuovo ogni volta, e due partite non si possono confrontare.
 */
export default function ScarabeoLibero() {
  const g = useScarabeoLibero()
  const [aiuto, setAiuto] = useState(false)
  const [storia, setStoria] = useState(false)
  const [risultato, setRisultato] = useState(false)
  const [abbandono, setAbbandono] = useState(false)
  const stato = g.stato
  const finita = stato?.finita ?? false
  const festa = useFesta(stato ? !stato.finita : null, risultato && finita && stato?.esito === 'vinta')

  const io = usePlayer()
  const { adesivo, accoda } = useCodaAdesivi()

  // Le mosse al centro: tutte le mie, e quelle del computer che fanno male.
  const mossa = g.ultimaMossa
  useEffect(() => {
    if (!mossa) return
    if (mossa.mia || mossa.scarabeo || mossa.punti >= MOSSA_DEL_COMPUTER_DA_ADESIVO) accoda(adesivoMossa(mossa))
  }, [accoda, mossa])

  // A partita finita: l'adesivo della fine, e dopo il risultato, una volta. Una
  // partita riaperta gia' finita va dritta al risultato. La dipendenza e' lo
  // stato a tre valori e non `finita`: con `finita` l'effetto non ripartiva
  // quando la partita compariva, non vedeva mai "in corso", e la fine arrivava
  // senza adesivo.
  const inCorso = stato ? !stato.finita : null
  const eraInCorso = useRef<boolean | null>(null)
  const statoRef = useRef(stato)
  statoRef.current = stato
  useEffect(() => {
    const s = statoRef.current
    if (inCorso === null || !s) return
    if (inCorso) {
      eraInCorso.current = true
      return
    }
    if (eraInCorso.current !== true) {
      setRisultato(true)
      return
    }
    eraInCorso.current = false
    accoda(adesivoFineScarabeo(0, s.esito === 'vinta', s.mieiPunti, s.puntiComputer))
    const t = window.setTimeout(() => setRisultato(true), ADESIVO_FINE_SCARABEO_MS + ADESIVO_MOSSA_MS)
    return () => window.clearTimeout(t)
  }, [accoda, inCorso])

  if (!g.partita || !stato) {
    return (
      <Pagina
        key="scelta"
        titolo="Scarabeo"
        indietro={{ a: ROTTE.home, etichetta: 'Giochi' }}
        azioni={
          <BottoneBarra etichetta="Come si gioca" onClick={() => setAiuto(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
        }
      >
        <SceltaLivello g={g} />
        <ComeSiGiocaScarabeo open={aiuto} onClose={() => setAiuto(false)} />
      </Pagina>
    )
  }

  const livello = g.partita.livello
  const turno = stato.turno === 'io' ? 'io' : stato.turno === 'computer' ? 'altro' : null

  return (
    <Pagina
      key="partita"
      titolo="Contro il computer"
      intera
      indietro={{ a: ROTTE.home, etichetta: 'Giochi' }}
      azioni={
        <>
          <BottoneBarra etichetta="Le mosse" onClick={() => setStoria(true)}>
            <IconList size={20} />
          </BottoneBarra>
          {!finita && (
            <BottoneBarra etichetta="Abbandona la partita" onClick={() => setAbbandono(true)}>
              <IconFlag size={19} />
            </BottoneBarra>
          )}
          <BottoneBarra etichetta="Come si gioca" onClick={() => setAiuto(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
        </>
      }
    >
      {g.guasto ? (
        <Vuoto
          icona={<IconComputer size={28} />}
          titolo="Il computer non può giocare"
          testo={g.guasto}
          azione={
            <Button variant="tinted" onClick={() => window.location.reload()}>
              Riprova
            </Button>
          }
        />
      ) : (
        <Campo
          c={g}
          sconosciute={g.sconosciute}
          bloccato={finita || stato.turno !== 'io' || g.pensa}
          attesa={g.pensa ? 'Il computer pensa…' : null}
          restanti={stato.restanti}
          evidenziate={g.ultimaDelComputer}
          testa={
            <Tabellino
              iconaIo={<Avatar nickname={io.nickname} color={io.avatarColor} size={20} />}
              iconaAltro={
                <IconaScheda>
                  <IconComputer size={12} />
                </IconaScheda>
              }
              avviso={g.messaggio}
              posa={g.anteprima}
              sconosciute={g.sconosciute}
              io={stato.mieiPunti}
              altro={stato.puntiComputer}
              nomeAltro="Computer"
              notaAltro={NOMI[livello].toLowerCase()}
              turno={turno}
              sotto={
                finita
                  ? 'Partita finita'
                  : `Mossa ${Math.min(stato.mieMosse + (stato.turno === 'io' ? 1 : 0), MOSSE_A_TESTA)} di ${MOSSE_A_TESTA} · ${stato.restanti} nel sacchetto`
              }
              onApri={() => setStoria(true)}
            />
          }
          fine={finita ? <FineLibera g={g} onRisultato={() => setRisultato(true)} /> : undefined}
          onGioca={g.gioca}
          onPassa={g.passa}
          onCambia={g.cambia}
        />
      )}

      <ComeSiGiocaScarabeo open={aiuto} onClose={() => setAiuto(false)} />

      <Sheet open={storia} onClose={() => setStoria(false)} title="Le mosse">
        <ElencoMosse
          mosse={stato.giocate.map((m) => ({ ...m, autore: m.mia ? 'Tu' : 'Computer' }))}
          vuoto="Nessuna mossa, per ora."
        />
      </Sheet>

      <Sheet open={abbandono} onClose={() => setAbbandono(false)} title="Abbandonare la partita?">
        <p className="scr-storia__lede">Non conterà nelle statistiche.</p>
        <Button
          size="lg"
          fullWidth
          variant="destructive"
          onClick={() => {
            setAbbandono(false)
            g.abbandona()
          }}
        >
          Abbandona
        </Button>
        <Button size="lg" fullWidth variant="plain" onClick={() => setAbbandono(false)}>
          Continua a giocare
        </Button>
      </Sheet>

      <Sheet open={risultato && finita} onClose={() => setRisultato(false)} title={titoloEsito(stato.esito)}>
        <div className="scr-esito">
          <div className="scr-esito__punteggi">
            <span className={`scr-esito__lato${stato.esito === 'vinta' ? ' is-vincitore' : ''}`}>
              <span className="scr-esito__nome">Tu</span>
              <span className="scr-esito__valore u-tabnum">{stato.mieiPunti}</span>
            </span>
            <span className="scr-esito__vs">contro</span>
            <span className={`scr-esito__lato${stato.esito === 'persa' ? ' is-vincitore' : ''}`}>
              <span className="scr-esito__nome">Computer</span>
              <span className="scr-esito__valore u-tabnum">{stato.puntiComputer}</span>
            </span>
          </div>
          {g.statistiche && (
            <p className="scr-esito__statistiche">
              Al livello {NOMI[livello].toLowerCase()} ne hai vinte{' '}
              <strong>{g.statistiche.perLivello[livello].vinte}</strong> su{' '}
              {g.statistiche.perLivello[livello].giocate}. La tua migliore: {g.statistiche.migliore} punti.
            </p>
          )}
          <p className="scr-esito__nota">Le partite libere non contano per la classifica.</p>
          <Button
            size="lg"
            fullWidth
            onClick={() => {
              setRisultato(false)
              g.nuova(livello)
            }}
          >
            <IconRefresh size={18} /> Un’altra partita
          </Button>
          <Button
            size="lg"
            fullWidth
            variant="plain"
            onClick={() => {
              setRisultato(false)
              g.abbandona()
            }}
          >
            Cambia livello
          </Button>
        </div>
      </Sheet>

      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

function titoloEsito(esito: 'vinta' | 'persa' | 'pari' | null): string {
  if (esito === 'vinta') return 'Hai vinto!'
  if (esito === 'persa') return 'Ha vinto il computer'
  return 'Pari'
}

/**
 * Prima di cominciare: tre livelli, con quel che uno ne ha già fatto. E' lo
 * stesso elenco della battaglia navale libera: stesse tacche, stesso conto.
 */
function SceltaLivello({ g }: { g: ScarabeoLiberoController }) {
  return (
    <Sezione titolo="Difficoltà">
      <Elenco>
        {LIVELLI.map((livello, i) => {
          const conti = g.statistiche?.perLivello[livello]
          return (
            <Riga
              key={livello}
              icona={<Tacche piene={i + 1} colore="var(--scarabeo-1)" />}
              titolo={NOMI[livello]}
              valore={conti && conti.giocate > 0 ? `${conti.vinte}/${conti.giocate}` : undefined}
              onClick={() => g.nuova(livello)}
            />
          )
        })}
      </Elenco>
      {g.guasto && <p className="livelli__guasto">{g.guasto}</p>}
    </Sezione>
  )
}

/** Sotto il tabellone, a partita finita. */
function FineLibera({ g, onRisultato }: { g: ScarabeoLiberoController; onRisultato: () => void }) {
  const stato = g.stato!
  return (
    <div className="scr-fine">
      <p className="scr-fine__titolo">{titoloEsito(stato.esito)}</p>
      <p className="scr-fine__nota">
        {stato.mieiPunti} contro {stato.puntiComputer}
      </p>
      <div className="scr-fine__azioni">
        <Button variant="tinted" onClick={onRisultato}>
          Risultato
        </Button>
        <Button onClick={() => g.nuova(g.partita!.livello)}>
          <IconRefresh size={18} /> Un’altra
        </Button>
      </div>
    </div>
  )
}
