import { useCallback, useEffect, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Numero, Sezione } from '@/components/Elementi'
import { IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { useToast } from '@/components/Toast'
import { DefinizioniCarte, DorsoCarta, FacciaCarta } from '@/games/blackjack/Carta'
import { TavoliDegliAmici } from '@/games/blackjack/Amici'
import { ComeSiGiocaBlackjack } from '@/games/blackjack/ComeSiGioca'
import { Fiche } from '@/games/blackjack/Fiches'
import { finitaLUscita } from '@/games/blackjack/uscita'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { PUNTATA_MINIMA_BJ } from '@shared/blackjack'
import type { SalaBlackjack, VistaTavoloBJ } from '@shared/types'
import './Blackjack.css'

/** Ogni quanto la sala guarda i tavoli degli amici, a pagina aperta. */
const SALA_POLL_MS = 5_000

/**
 * La sala del blackjack: un tavolo tuo, che gli amici online vedono e a cui
 * si possono sedere, o il tavolo di un amico che sta giocando. Chi e' gia'
 * seduto da qualche parte ci torna.
 */
export default function Blackjack() {
  const { vai } = useNavigazione()
  const toast = useToast()
  const [sala, setSala] = useState<SalaBlackjack | null>(null)
  const [regole, setRegole] = useState(false)
  const [apro, setApro] = useState(false)

  const leggi = useCallback(async () => {
    await finitaLUscita()
    try {
      setSala(await api<SalaBlackjack>('/blackjack'))
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

  const apri = async () => {
    if (apro) return
    setApro(true)
    try {
      const t = await api<VistaTavoloBJ>('/blackjack/tavoli', { method: 'POST', body: {} })
      dimentica('/fortuna')
      vai(ROTTE.tavoloBJ(t.id))
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Non riesco ad aprire il tavolo: riprova.', 'error')
    } finally {
      setApro(false)
    }
  }

  return (
    <Pagina
      titolo="Blackjack"
      indietro={{ a: ROTTE.fortuna, etichetta: 'Fortuna' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      <DefinizioniCarte />
      <section className="bj-sala entra" aria-label="Il tuo tavolo">
        <span className="bj-sala__luce" aria-hidden="true" />
        <div className="bj-sala__ventaglio" aria-hidden="true">
          <span className="bj-sala__carta is-1">
            <DorsoCarta />
          </span>
          <span className="bj-sala__carta is-2">
            <FacciaCarta carta="Ap" />
          </span>
          <span className="bj-sala__carta is-3">
            <FacciaCarta carta="Kc" />
          </span>
          <span className="bj-sala__fiche is-1">
            <Fiche valore={100} />
          </span>
          <span className="bj-sala__fiche is-2">
            <Fiche valore={25} />
          </span>
        </div>
        <div className="bj-sala__testo">
          <p className="bj-sala__saldo">
            Saldo{' '}
            <strong className="u-tabnum">{sala ? <Numero valore={sala.saldo} /> : '…'}</strong>
          </p>
          {sala?.mioTavolo ? (
            <Button size="lg" onClick={() => vai(ROTTE.tavoloBJ(sala.mioTavolo!))}>
              Torna al tavolo
            </Button>
          ) : (
            <Button size="lg" onClick={() => void apri()} disabled={apro || !sala}>
              Tavolo nuovo
            </Button>
          )}
          {sala && sala.saldo < PUNTATA_MINIMA_BJ && (
            <p className="bj-sala__nota">Servono {PUNTATA_MINIMA_BJ} punti di oggi per puntare.</p>
          )}
        </div>
      </section>

      {sala && sala.tavoli.length > 0 && (
        <Sezione titolo="Al tavolo degli amici">
          <TavoliDegliAmici tavoli={sala.tavoli} onCambio={() => void leggi()} />
        </Sezione>
      )}

      <ComeSiGiocaBlackjack open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}
