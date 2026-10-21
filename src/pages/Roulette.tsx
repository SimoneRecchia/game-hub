import { useCallback, useEffect, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Numero, Sezione } from '@/components/Elementi'
import { IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { TavoliDegliAmici } from '@/games/blackjack/Amici'
import { finitaLUscita } from '@/games/blackjack/uscita'
import { PochiPunti } from '@/games/fortuna/Avvisi'
import { SALA } from '@/games/fortuna/sala'
import { ComeSiGiocaRoulette } from '@/games/roulette/ComeSiGioca'
import { useFeltro } from '@/games/roulette/feltro'
import { RuotaRoulette } from '@/games/roulette/Ruota'
import { api } from '@/lib/api'
import { PUNTATA_MINIMA_RL } from '@shared/roulette'
import type { SalaRoulette } from '@shared/types'
import { TAVOLO_NUOVO } from '@/games/roulette/nuovo'
import '@/games/fortuna/Tabellone.css'
import '@/games/roulette/Feltro.css'
import './Roulette.css'

/** Ogni quanto la sala guarda i tavoli degli amici, a pagina aperta. */
const SALA_POLL_MS = 5_000

/**
 * La sala della roulette: un tavolo tuo, che gli amici online vedono e a cui
 * si possono sedere, o il tavolo di un amico che sta giocando. Chi e' gia'
 * seduto da qualche parte ci torna. La pagina e' gia' il feltro del tavolo, e
 * in mezzo la ruota gira piano, come quelle dei casinò fra un giro e l'altro;
 * sotto, il saldo sulla targa del tabellone e il bottone verde del tavolo.
 */
export default function Roulette() {
  useFeltro()
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

  /** Il saldo non basta per puntare: prima l'avviso, e il tavolo nuovo si fa da parte (ci si siede solo a guardare). */
  const pochi = !!sala && sala.saldo < PUNTATA_MINIMA_RL

  // Al tavolo si va subito: il tavolo nuovo lo apre la sua pagina (`TAVOLO_NUOVO`), mentre la ruota scende.
  const alTavolo = (id: string) => vai(ROTTE.tavoloRL(id), { direzione: 'tavolo', state: { saldo: sala?.saldo } })

  return (
    <Pagina
      titolo="Roulette"
      sotto="Il pieno paga 35 a 1"
      indietro={{ a: ROTTE.fortuna, etichetta: 'Fortuna' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      <span className={`rl-feltro ${SALA}`} aria-hidden="true" />
      <section className={`rl-sala ${SALA}`} aria-label="Il tuo tavolo">
        <div className="rl-sala__ruota">
          <RuotaRoulette lancio={null} ultimo={null} />
        </div>
        <div className="rl-sala__testo">
          <div className="ct-tabellone is-riga rl-sala__saldo">
            <span className="ct-tabellone__voce">
              <span className="ct-tabellone__etichetta">Saldo</span>
              <span className="ct-tabellone__saldo u-tabnum">{sala ? <Numero valore={sala.saldo} /> : '…'}</span>
            </span>
          </div>
          {pochi && <PochiPunti servono={PUNTATA_MINIMA_RL} saldo={sala.saldo} className="rl-sala__pochi" />}
          {sala?.mioTavolo ? (
            <button type="button" className="rl-sala__vai" onClick={() => alTavolo(sala.mioTavolo!)}>
              Torna al tavolo
            </button>
          ) : (
            <button
              type="button"
              className={`rl-sala__vai${pochi ? ' is-secondario' : ''}`}
              onClick={() => alTavolo(TAVOLO_NUOVO)}
              disabled={!sala}
            >
              Tavolo nuovo
            </button>
          )}
        </div>
      </section>

      {sala && sala.tavoli.length > 0 && (
        <Sezione titolo="Al tavolo degli amici" className="rl-sala__amici">
          <TavoliDegliAmici tavoli={sala.tavoli} gioco="roulette" onCambio={() => void leggi()} />
        </Sezione>
      )}

      <ComeSiGiocaRoulette open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}
