import { useState, type CSSProperties } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Copertina } from '@/components/Copertina'
import { Numero, Sezione } from '@/components/Elementi'
import { IconChevronRight, IconInfo, IconPlay } from '@/components/Icons'
import { BottoneBarra } from '@/components/Pagina'
import { Sheet } from '@/components/Sheet'
import { Vetrina } from '@/components/Vetrina'
import { TavoliDegliAmici } from '@/games/blackjack/Amici'
import { statoBlackjack, statoRuota, statoSlot, type StatoRuota } from '@/games/stato'
import { useDati } from '@/lib/dati'
import { formatGameDate } from '@/lib/format'
import { NOME_BLACKJACK, PUNTATA_MINIMA_BJ } from '@shared/blackjack'
import { gameDate } from '@shared/daily'
import { NOME_CRAZY_TIME, PUNTATA_MINIMA, resa } from '@shared/ruota'
import { NOME_SLOT, PUNTATA_MINIMA_SLOT } from '@shared/slot'
import type { FortunaRisposta, GiocoFortuna } from '@shared/types'
import '@/games/cruciverba/ComeSiGioca.css'
import './Fortuna.css'

/** I giochi della scheda, nell'ordine in cui si vedono. */
const GIOCHI: ReadonlyArray<{ id: GiocoFortuna; nome: string; a: string }> = [
  { id: 'ruota', nome: NOME_CRAZY_TIME, a: ROTTE.ruota },
  { id: 'slot', nome: NOME_SLOT, a: ROTTE.slot },
  { id: 'blackjack', nome: NOME_BLACKJACK, a: ROTTE.blackjack },
]

const RESA = Math.round(resa(1) * 100)

/**
 * La scheda della Fortuna: i giochi d'azzardo, che puntano tutti lo stesso
 * saldo — i punti fatti oggi nelle classificate, piu' quel che i giochi hanno
 * gia' dato o tolto. E' una sala da gioco, scura in tutti e due i temi
 * (Vetrina.css). In cima il saldo, e basta: quanto si e' vinto o perso non si
 * dice, e toccandolo si apre la classifica della Fortuna. Sotto una carta per
 * gioco, e i tavoli del blackjack degli amici online, a cui ci si siede con un
 * tocco.
 *
 * I dati arrivano con una richiesta sola (`/api/fortuna`) e restano in memoria,
 * come quelli della schermata iniziale.
 */
export default function Fortuna() {
  const { dati, ricarica } = useDati<FortunaRisposta>('/fortuna')
  const [regole, setRegole] = useState(false)
  const stati: Record<GiocoFortuna, StatoRuota> | null = dati
    ? { ruota: statoRuota(dati.ruota, dati.puzzleNumber), slot: statoSlot(dati), blackjack: statoBlackjack(dati) }
    : null

  return (
    <Vetrina
      scheda="fortuna"
      titolo="Fortuna"
      sopra={formatGameDate(dati?.date ?? gameDate())}
      classifica={ROTTE.classifica('fortuna')}
      azioni={
        <BottoneBarra etichetta="Come funziona" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      <Saldo dati={dati ?? null} />
      {dati && dati.saldo < PUNTATA_MINIMA_SLOT && (
        <Collegamento to={ROTTE.home} direzione="scheda" className="fortuna-vuoto entra">
          <span>Gioca le classificate di oggi: i loro punti sono il saldo</span>
          <IconChevronRight size={18} />
        </Collegamento>
      )}

      <Sezione titolo="I giochi">
        <ul className="fortuna__giochi">
          {GIOCHI.map((g, i) => (
            <li key={g.id} className="entra" style={{ '--n': i + 1 } as CSSProperties}>
              <CartaFortuna id={g.id} nome={g.nome} a={g.a} stato={stati?.[g.id] ?? null} />
            </li>
          ))}
        </ul>
      </Sezione>

      {dati && dati.blackjack.tavoli.length > 0 && !dati.blackjack.mioTavolo && (
        <Sezione titolo="Al tavolo">
          <TavoliDegliAmici tavoli={dati.blackjack.tavoli} onCambio={() => void ricarica()} />
        </Sezione>
      )}

      <Sheet open={regole} onClose={() => setRegole(false)} title="Come funziona">
        <div className="cru-aiuto">
          <p className="cru-aiuto__lede">
            Si puntano i punti fatti oggi nelle classificate. Il saldo è uno per tutti i giochi: quel che vinci a uno
            lo puoi puntare a un altro, e quel che perdi esce dalla classifica generale di oggi.
          </p>
          <section className="cru-aiuto__sezione">
            <h3 className="cru-aiuto__titolo">Quanto si punta</h3>
            <ul className="cru-aiuto__elenco">
              <li>
                <strong>{NOME_CRAZY_TIME}</strong>: da {PUNTATA_MINIMA} punti a tutto il saldo.
              </li>
              <li>
                <strong>{NOME_SLOT}</strong>: da {PUNTATA_MINIMA_SLOT} a 10 punti a giro.
              </li>
              <li>
                <strong>{NOME_BLACKJACK}</strong>: da {PUNTATA_MINIMA_BJ} punti a tutto il saldo, al tavolo con gli
                amici o da solo.
              </li>
            </ul>
          </section>
          <section className="cru-aiuto__sezione">
            <h3 className="cru-aiuto__titolo">Vince il banco</h3>
            <p className="cru-aiuto__testo">
              In tutti i giochi, chi gioca al meglio riceve in media il {RESA}% di quel che punta: si può avere fortuna
              una volta, e giocando a lungo si perde. Domani si riparte dalle classificate di domani.
            </p>
          </section>
        </div>
      </Sheet>
    </Vetrina>
  )
}

/** Il saldo di oggi, grande: quel che si puo' puntare adesso. Toccandolo si apre la classifica della Fortuna. */
function Saldo({ dati }: { dati: FortunaRisposta | null }) {
  return (
    <Collegamento
      to={ROTTE.classifica('fortuna')}
      className="eroe eroe--fortuna saldo-fortuna"
      aria-label={dati ? `Saldo: ${dati.saldo} punti. La classifica della Fortuna` : 'La classifica della Fortuna'}
    >
      <span className="eroe__testa">
        <span className="eroe__occhiello saldo-fortuna__etichetta">Saldo</span>
        <span className="eroe__capsula">
          Classifica
          <IconChevronRight size={14} />
        </span>
      </span>
      <span className="saldo-fortuna__riga">
        <span className="saldo-fortuna__numero u-tabnum">
          {dati ? <Numero valore={dati.saldo} /> : <span className="scheletro scheletro--riga-corta" />}
          <span className="saldo-fortuna__unita"> punti</span>
        </span>
        <Copertina gioco="fortuna" formato="icona" className="saldo-fortuna__icona" />
      </span>
    </Collegamento>
  )
}

/** La carta di un gioco: la copertina, a che punto e', e il bottone. Tutta la carta porta al gioco. */
function CartaFortuna({ id, nome, a, stato }: { id: GiocoFortuna; nome: string; a: string; stato: StatoRuota | null }) {
  return (
    <Collegamento
      to={stato?.a ?? a}
      className={`fortuna-carta fortuna-carta--${id}`}
      style={{ '--c1': `var(--${id}-1)`, '--c2': `var(--${id}-2)` } as CSSProperties}
    >
      <span className="fortuna-carta__luce" aria-hidden="true" />
      <Copertina gioco={id} formato="icona" className="fortuna-carta__icona" />
      <span className="fortuna-carta__testo">
        <span className="fortuna-carta__nome">{nome}</span>
        {stato ? (
          <>
            <span className="fortuna-carta__stato">{stato.titolo}</span>
            {stato.dettaglio && <span className="fortuna-carta__dettaglio">{stato.dettaglio}</span>}
          </>
        ) : (
          <>
            <span className="fortuna-carta__stato scheletro scheletro--riga" />
            <span className="fortuna-carta__dettaglio scheletro scheletro--riga-corta" />
          </>
        )}
      </span>
      {stato && stato.fase !== 'non-pronta' && (
        <span className="fortuna-carta__bottone">
          <IconPlay size={14} />
          {stato.azione}
        </span>
      )}
    </Collegamento>
  )
}
