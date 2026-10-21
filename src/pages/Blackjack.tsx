import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Numero, Sezione } from '@/components/Elementi'
import { IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { useToast } from '@/components/Toast'
import { DefinizioniCarte, DorsoCarta, FacciaCarta } from '@/games/blackjack/Carta'
import { TavoliDegliAmici } from '@/games/blackjack/Amici'
import { Panno } from '@/games/blackjack/Tavolo'
import { ComeSiGiocaBlackjack } from '@/games/blackjack/ComeSiGioca'
import { Fiche } from '@/games/blackjack/Fiches'
import { PochiPunti } from '@/games/fortuna/Avvisi'
import { SALA, useSala } from '@/games/fortuna/sala'
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
  useSala()
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

  /** Il saldo non basta per puntare: prima l'avviso, e il tavolo nuovo si fa da parte (ci si siede solo a guardare). */
  const pochi = !!sala && sala.saldo < PUNTATA_MINIMA_BJ

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
      sotto="Paga 1 a 1"
      indietro={{ a: ROTTE.fortuna, etichetta: 'Fortuna' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      <DefinizioniCarte />
      {/* Il tavolo vuoto che aspetta: lo stesso panno del tavolo, con le carte del banco e il saldo. */}
      <section className={`bj-sala entra ${SALA}`} aria-label="Il tuo tavolo">
        <div className="bj-sala__tavolo">
          <Panno sala />
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
          </div>
          <div className="bj-sala__testo">
            <p className="bj-sala__saldo">
              <span className="bj-sala__etichetta">Saldo</span>
              <strong className="u-tabnum">{sala ? <Numero valore={sala.saldo} /> : '…'}</strong>
            </p>
            <span className="bj-sala__fiches" aria-hidden="true">
              {[1, 5, 10, 25].map((v, i) => (
                <span key={v} className="bj-sala__fiche" style={{ '--i': i } as CSSProperties}>
                  <Fiche valore={v} />
                </span>
              ))}
            </span>
            {sala?.mioTavolo ? (
              <button type="button" className="bj-sala__vai" onClick={() => vai(ROTTE.tavoloBJ(sala.mioTavolo!))}>
                Torna al tavolo
              </button>
            ) : (
              <button
                type="button"
                className={`bj-sala__vai${pochi ? ' is-secondario' : ''}`}
                onClick={() => void apri()}
                disabled={apro || !sala}
              >
                Tavolo nuovo
              </button>
            )}
          </div>
        </div>
        {pochi && <PochiPunti servono={PUNTATA_MINIMA_BJ} saldo={sala.saldo} className="bj-sala__pochi" />}
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
