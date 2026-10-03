import { useEffect, useRef, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli, Numero, Vuoto, useFesta } from '@/components/Elementi'
import { IconComputer, IconInfo, IconList, IconTrophy } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { IconaScheda } from '@/components/Scheda'
import { Sheet } from '@/components/Sheet'
import { Campo, ElencoMosse, Tabellino } from '@/games/scarabeo/Campo'
import { ComeSiGiocaScarabeo } from '@/games/scarabeo/ComeSiGioca'
import { adesivoFineScarabeo, adesivoMossa } from '@/games/scarabeo/adesivi'
import { useScarabeo } from '@/games/scarabeo/useScarabeo'
import { useCountdown } from '@/games/wordle/useCountdown'
import { usePlayer } from '@/lib/auth'
import { formatCountdown } from '@/lib/format'
import { TETTI } from '@shared/punti'
import type { ScarabeoState } from '@shared/types'
import './Scarabeo.css'

/**
 * Lo Scarabeo classificato: le dieci mosse di oggi.
 *
 * Le tessere sono le stesse per tutti, e il computer le ha già giocate: il suo
 * punteggio sta sempre in vista a destra, come il traguardo da raggiungere —
 * pareggiarlo vale il tetto dello Scarabeo in classifica. Le sue mosse si vedono
 * solo a giornata chiusa: sarebbero la soluzione.
 */
export default function Scarabeo() {
  const g = useScarabeo()
  const [aiuto, setAiuto] = useState(false)
  const [storia, setStoria] = useState(false)
  const [delComputer, setDelComputer] = useState(false)

  const stato = g.stato
  const finita = stato?.status === 'done'
  // Battere il computer e' la vittoria della classificata: la festa e' per quella.
  const festa = useFesta(
    stato ? !finita : null,
    finita && stato.punti >= stato.computer.punti && stato.punti > 0,
  )
  const io = usePlayer()

  // La mossa appena giocata al centro dello schermo, e poi, se era l'ultima, come e' finita.
  const { adesivo, accoda } = useCodaAdesivi()
  const mossa = g.ultimaMossa
  useEffect(() => {
    if (mossa) accoda(adesivoMossa(mossa))
  }, [accoda, mossa])
  const eraInCorso = useRef<boolean | null>(null)
  useEffect(() => {
    if (!stato) return
    if (eraInCorso.current === true && finita && stato.punti > 0) {
      accoda(adesivoFineScarabeo(0, stato.punti >= stato.computer.punti, stato.punti, stato.computer.punti))
    }
    eraInCorso.current = !finita
  }, [accoda, finita, stato])

  return (
    <Pagina
      titolo={stato ? `Scarabeo #${stato.puzzleNumber}` : 'Scarabeo'}
      intera
      indietro={{ a: ROTTE.home, etichetta: 'Giornaliere' }}
      azioni={
        <>
          <BottoneBarra etichetta="Le tue mosse" onClick={() => setStoria(true)}>
            <IconList size={20} />
          </BottoneBarra>
          <BottoneBarra etichetta="Come si gioca" onClick={() => setAiuto(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
        </>
      }
    >
      {g.loadError ? (
        <Vuoto
          titolo="Il tabellone non si è aperto"
          testo={g.loadError}
          azione={
            <Button variant="tinted" onClick={g.ricarica}>
              Riprova
            </Button>
          }
        />
      ) : !stato ? (
        <div className="scr__attesa" aria-hidden="true" />
      ) : (
        <Campo
          c={g}
          sconosciute={g.sconosciute}
          bloccato={finita || g.inviando}
          restanti={stato.restanti}
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
              io={stato.punti}
              altro={stato.computer.punti}
              nomeAltro="Computer"
              notaAltro="stesse tessere"
              sotto={
                finita
                  ? 'Giornata chiusa'
                  : `Mossa ${Math.min(stato.mosseUsate + 1, stato.mosseTotali)} di ${stato.mosseTotali} · ${stato.restanti} nel sacchetto`
              }
              avanzamento={stato.computer.punti > 0 ? stato.punti / stato.computer.punti : 0}
              onApri={() => setStoria(true)}
            />
          }
          fine={finita ? <Chiusa stato={stato} onMosseComputer={() => setDelComputer(true)} /> : undefined}
          onGioca={g.gioca}
          onPassa={g.passa}
          onCambia={g.cambia}
        />
      )}

      <ComeSiGiocaScarabeo open={aiuto} onClose={() => setAiuto(false)} />

      <Sheet open={storia} onClose={() => setStoria(false)} title="Le tue mosse">
        {stato && (
          <ElencoMosse
            mosse={stato.mosse}
            totale={stato.mosse.length > 0 ? stato.punti : undefined}
            vuoto="Nessuna mossa, per ora."
          />
        )}

        {/*
          Chiudere prima delle dieci mosse: sta qui e non fra i comandi perché
          e' una decisione che si prende una volta, guardando quel che si e'
          fatto — mentre un bottone accanto a "Passa" si preme per sbaglio.
        */}
        {stato && !finita && stato.mosseUsate > 0 && (
          <div className="scr-storia__chiudi">
            <p className="scr-storia__chiudi-nota">
              {stato.mosseTotali - stato.mosseUsate === 1
                ? 'Ti resta una mossa.'
                : `Ti restano ${stato.mosseTotali - stato.mosseUsate} mosse.`}{' '}
              Se chiudi, il punteggio diventa definitivo.
            </p>
            <Button
              variant="tinted"
              onClick={() => {
                setStoria(false)
                g.chiudiGiornata()
              }}
              disabled={g.inviando}
            >
              Chiudi la giornata
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet open={delComputer} onClose={() => setDelComputer(false)} title="Le mosse del computer">
        <p className="scr-storia__lede">Con le tue stesse tessere.</p>
        {stato?.computer.mosse && (
          <ElencoMosse mosse={stato.computer.mosse} totale={stato.computer.punti} vuoto="Il computer non ha mosso." />
        )}
      </Sheet>

      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** Giornata chiusa: com'e' andata contro il computer, i punti in classifica, e cosa fare adesso. */
function Chiusa({ stato, onMosseComputer }: { stato: ScarabeoState; onMosseComputer: () => void }) {
  const { vai } = useNavigazione()
  const restano = useCountdown(stato.msToNextPuzzle)
  const scarto = stato.punti - stato.computer.punti
  const titolo =
    scarto > 0 ? 'Hai battuto il computer' : scarto === 0 ? 'Pari con il computer' : 'Il computer ha fatto di più'

  return (
    <div className="scr-fine">
      <p className="scr-fine__titolo">{titolo}</p>
      <p className="scr-fine__punti">
        <Numero valore={stato.puntiClassifica} />
        <span className="scr-fine__su"> / {TETTI.scarabeo}</span>
      </p>
      <p className="scr-fine__nota">
        punti in classifica · {stato.punti} contro {stato.computer.punti}
      </p>
      <div className="scr-fine__azioni">
        <Button variant="tinted" onClick={onMosseComputer}>
          <IconComputer size={18} /> Le sue mosse
        </Button>
        <Button variant="tinted" onClick={() => vai(ROTTE.classifica('scarabeo'))}>
          <IconTrophy size={18} /> Classifica
        </Button>
      </div>
      <Button variant="plain" onClick={() => vai(ROTTE.libera('scarabeo'))}>
        Gioca una partita libera
      </Button>
      <p className="scr-fine__attesa">
        Tessere nuove fra <span className="u-tabnum">{formatCountdown(restano)}</span>
      </p>
    </div>
  )
}
