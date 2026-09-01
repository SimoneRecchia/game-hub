import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { IconChevronLeft, IconInfo } from '@/components/Icons'
import { useToast } from '@/components/Toast'
import { HowToPlay } from '@/games/wordle/HowToPlay'
import { Percorso } from '@/games/wordle/Percorso'
import { chiusa, prossimaTappa } from '@/games/wordle/percorso'
import { useCountdown } from '@/games/wordle/useCountdown'
import { ApiFetchError, api } from '@/lib/api'
import { formatCountdown, formatGameDate } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import type { DayView } from '@shared/types'
import './WordlePercorso.css'

/**
 * La schermata da cui si entra nel gioco: le cinque parole come un percorso.
 *
 * Sta davanti alla griglia e non sopra di essa. Da striscia in cima alla board
 * le cinque parole erano cinque pastiglie in fila: una fila non dice che si
 * fanno in ordine, e per stare in una riga sola sopra la griglia dovevano essere
 * piccole al punto di non dire nemmeno come e' andata. Una schermata sua ha lo
 * spazio per la forma giusta — una strada — e per il nome di ogni tappa.
 *
 * Il costo e' un tocco in piu' per arrivare alla parola del giorno, e per questo
 * il bottone grande in basso ci porta comunque in uno.
 */
export default function WordlePercorso() {
  const navigate = useNavigate()
  const toast = useToast()
  const [view, setView] = useState<DayView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setView(await api<DayView>('/wordle/day'))
    } catch (err) {
      setError(err instanceof ApiFetchError ? err.message : 'Non riesco a caricare la giornata.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const day = view?.day ?? []
  const fatte = day.filter(chiusa).length
  const punti = day.reduce((somma, d) => somma + (d.score ?? 0), 0)
  const prossima = prossimaTappa(day)

  /*
   * Toccare una tappa chiusa dice quale la apre, invece di non reagire: un
   * bottone che al tocco non fa niente sembra rotto.
   */
  const spiegaChiusa = useCallback(
    (slot: number) => {
      haptic('error')
      toast.show(
        slot === 2 ? 'Prima finisci la parola del giorno' : `Prima finisci la ${slot - 1}ª parola`,
      )
    },
    [toast],
  )

  return (
    <AppShell
      title={view ? `Wordle #${view.puzzleNumber}` : 'Wordle'}
      hideTabBar
      leading={
        <button
          type="button"
          className="navbtn"
          onClick={() => navigate('/')}
          aria-label="Torna all'hub"
        >
          <IconChevronLeft size={22} />
        </button>
      }
      trailing={
        <button
          type="button"
          className="navbtn"
          onClick={() => setHelpOpen(true)}
          aria-label="Come si gioca"
        >
          <IconInfo size={21} />
        </button>
      }
    >
      <div className="giornata">
        {error ? (
          <div className="giornata__fallback">
            <p>{error}</p>
            <Button variant="tinted" onClick={() => void load()}>
              Riprova
            </Button>
          </div>
        ) : loading && !view ? (
          <div className="giornata__attesa" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} />
            ))}
          </div>
        ) : (
          view && (
            <>
              <header className="giornata__testa">
                <p className="giornata__data">{formatGameDate(view.date)}</p>
                <p className="giornata__stato u-tabnum">
                  {fatte === 0
                    ? 'Cinque parole, una per volta'
                    : `${fatte} ${fatte === 1 ? 'parola' : 'parole'} su ${day.length} · ${punti} punti`}
                </p>
              </header>

              {/*
                La mappa prende l'altezza che resta fra l'intestazione e il
                bottone: la schermata non scorre — la shell senza tab bar e'
                ancorata al viewport — e una mappa a misura fissa, su uno schermo
                basso, si sarebbe fatta tagliare l'ultima tappa.
              */}
              <div className="giornata__mappa">
                <Percorso
                  day={view.day}
                  onOpen={(slot) => navigate(`/wordle/${slot}`)}
                  onBlocked={spiegaChiusa}
                />
              </div>

              <footer className="giornata__piede">
                {/*
                  La giornata giocata nella stanza di un altro: la propria board
                  rifiuterebbe i tentativi, quindi il bottone porta dov'e' la
                  partita davvero.
                */}
                {view.roomId ? (
                  <Button size="lg" fullWidth onClick={() => navigate(`/insieme/${view.roomId}`)}>
                    Torna alla partita in compagnia
                  </Button>
                ) : prossima ? (
                  <Button size="lg" fullWidth onClick={() => navigate(`/wordle/${prossima.slot}`)}>
                    {prossima.attempts > 0
                      ? prossima.slot === 1
                        ? 'Continua la parola del giorno'
                        : `Continua la ${prossima.slot}ª parola`
                      : prossima.slot === 1
                        ? 'Gioca la parola del giorno'
                        : `Gioca la ${prossima.slot}ª parola`}
                  </Button>
                ) : (
                  <Attesa ms={view.msToNextPuzzle} />
                )}
              </footer>
            </>
          )
        )}
      </div>

      <HowToPlay open={helpOpen} onClose={() => setHelpOpen(false)} />
    </AppShell>
  )
}

/**
 * Giornata finita: quanto manca alle prossime cinque.
 *
 * Niente punteggio qui: la riga in cima lo dice già, e il momento in cui il
 * numero conta e' il riepilogo che si apre chiudendo l'ultima parola. Ripeterlo
 * a due centimetri di distanza lo faceva sembrare un altro numero.
 */
function Attesa({ ms }: { ms: number }) {
  const restano = useCountdown(ms)

  return (
    <div className="giornata__fine">
      <p className="giornata__fine-label">Nuove parole fra</p>
      <p className="giornata__fine-valore u-tabnum">{formatCountdown(restano)}</p>
    </div>
  )
}
