import { useCallback, useEffect, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Numero, Sezione } from '@/components/Elementi'
import { IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { TavoliDegliAmici } from '@/games/blackjack/Amici'
import { finitaLUscita } from '@/games/blackjack/uscita'
import { ComeSiGiocaRoulette } from '@/games/roulette/ComeSiGioca'
import { RuotaRoulette } from '@/games/roulette/Ruota'
import { api } from '@/lib/api'
import { PUNTATA_MINIMA_RL } from '@shared/roulette'
import type { SalaRoulette } from '@shared/types'
import { TAVOLO_NUOVO } from '@/games/roulette/nuovo'
import '@/games/roulette/Feltro.css'
import './Roulette.css'

/** Ogni quanto la sala guarda i tavoli degli amici, a pagina aperta. */
const SALA_POLL_MS = 5_000

/**
 * La sala della roulette: un tavolo tuo, che gli amici online vedono e a cui
 * si possono sedere, o il tavolo di un amico che sta giocando. Chi e' gia'
 * seduto da qualche parte ci torna. In cima la ruota gira piano, come quelle
 * dei casinò fra un giro e l'altro.
 */
export default function Roulette() {
  const { vai } = useNavigazione()
  const [sala, setSala] = useState<SalaRoulette | null>(null)
  const [regole, setRegole] = useState(false)

  const leggi = useCallback(async () => {
    await finitaLUscita()
    try {
      setSala(await api<SalaRoulette>('/roulette'))
    } catch {
      /* si riprova al prossimo giro */
    }
  }, [])

  useEffect(() => {
    void leggi()
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void leggi()
    }, SALA_POLL_MS)
    return () => window.clearInterval(t)
  }, [leggi])

  // Il tavolo si scarica mentre si guarda la sala: toccando, c'e' gia'.
  useEffect(() => {
    void import('./RouletteTavolo')
  }, [])

  // Al tavolo si va subito: il tavolo nuovo lo apre la sua pagina (`TAVOLO_NUOVO`), mentre il feltro si allarga.
  const alTavolo = (id: string) => vai(ROTTE.tavoloRL(id), { direzione: 'tavolo', state: { saldo: sala?.saldo } })

  return (
    <Pagina
      titolo="Roulette"
      indietro={{ a: ROTTE.fortuna, etichetta: 'Fortuna' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      <section className="rl-sala entra" aria-label="Il tuo tavolo">
        <span className="rl-feltro" aria-hidden="true">
          <span className="rl-sala__luce" />
        </span>
        <div className="rl-sala__ruota">
          <RuotaRoulette lancio={null} ultimo={null} />
        </div>
        <div className="rl-sala__testo">
          <p className="rl-sala__saldo">
            Saldo <strong className="u-tabnum">{sala ? <Numero valore={sala.saldo} /> : '…'}</strong>
          </p>
          {sala?.mioTavolo ? (
            <Button size="lg" onClick={() => alTavolo(sala.mioTavolo!)}>
              Torna al tavolo
            </Button>
          ) : (
            <Button size="lg" onClick={() => alTavolo(TAVOLO_NUOVO)} disabled={!sala}>
              Tavolo nuovo
            </Button>
          )}
          {sala && sala.saldo < PUNTATA_MINIMA_RL && (
            <p className="rl-sala__nota">Serve almeno un punto di oggi per puntare.</p>
          )}
        </div>
      </section>

      {sala && sala.tavoli.length > 0 && (
        <Sezione titolo="Al tavolo degli amici">
          <TavoliDegliAmici tavoli={sala.tavoli} gioco="roulette" onCambio={() => void leggi()} />
        </Sezione>
      )}

      <ComeSiGiocaRoulette open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}
