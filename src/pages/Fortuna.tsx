import { useState, type CSSProperties } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Copertina } from '@/components/Copertina'
import { Numero, Sezione } from '@/components/Elementi'
import { IconInfo, IconPlay } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Sheet } from '@/components/Sheet'
import { statoRuota, statoSlot, type StatoRuota } from '@/games/stato'
import { useDati } from '@/lib/dati'
import { formatGameDate } from '@/lib/format'
import { gameDate } from '@shared/daily'
import { NOME_CRAZY_TIME, PUNTATA_MINIMA, conSegno, resa } from '@shared/ruota'
import { NOME_SLOT, PUNTATA_MINIMA_SLOT } from '@shared/slot'
import type { FortunaRisposta, GiocoFortuna } from '@shared/types'
import '@/games/cruciverba/ComeSiGioca.css'
import './Fortuna.css'

/** I giochi della scheda, nell'ordine in cui si vedono. */
const GIOCHI: ReadonlyArray<{ id: Extract<GiocoFortuna, 'ruota' | 'slot'>; nome: string; a: string }> = [
  { id: 'ruota', nome: NOME_CRAZY_TIME, a: ROTTE.ruota },
  { id: 'slot', nome: NOME_SLOT, a: ROTTE.slot },
]

const RESA = Math.round(resa(1) * 100)

/**
 * La scheda della Fortuna: i giochi d'azzardo, che puntano tutti lo stesso
 * saldo — i punti fatti oggi nelle classificate, piu' quel che i giochi hanno
 * gia' dato o tolto. In cima il saldo, con da dove viene; sotto una carta per
 * gioco, con com'e' andata oggi e quel che si puo' fare.
 *
 * I dati arrivano con una richiesta sola (`/api/fortuna`) e restano in memoria,
 * come quelli della schermata iniziale.
 */
export default function Fortuna() {
  const { dati } = useDati<FortunaRisposta>('/fortuna')
  const [regole, setRegole] = useState(false)
  const stati: Record<string, StatoRuota> | null = dati
    ? { ruota: statoRuota(dati.ruota, dati.puzzleNumber), slot: statoSlot(dati) }
    : null

  return (
    <Pagina
      titolo="Fortuna"
      sopra={formatGameDate(dati?.date ?? gameDate())}
      azioni={
        <BottoneBarra etichetta="Come funziona" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      <Saldo dati={dati ?? null} />

      <Sezione titolo="I giochi">
        <ul className="fortuna__giochi">
          {GIOCHI.map((g, i) => (
            <li key={g.id} className="entra" style={{ '--n': i + 1 } as CSSProperties}>
              <CartaFortuna
                id={g.id}
                nome={g.nome}
                a={g.a}
                netto={dati?.netti[g.id] ?? null}
                stato={stati?.[g.id] ?? null}
              />
            </li>
          ))}
        </ul>
      </Sezione>

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
    </Pagina>
  )
}

/** Il saldo di oggi, grande, con da dove viene: le classificate, e quel che ha dato o tolto ogni gioco. */
function Saldo({ dati }: { dati: FortunaRisposta | null }) {
  const voci: Array<[string, number]> = dati
    ? [
        ['Classificate', dati.classificate],
        [NOME_CRAZY_TIME, dati.netti.ruota],
        [NOME_SLOT, dati.netti.slot],
      ]
    : []
  const vuoto = dati !== null && dati.saldo < PUNTATA_MINIMA_SLOT
  return (
    <section className="fortuna-saldo entra" aria-label="Il saldo di oggi">
      <span className="fortuna-saldo__luci" aria-hidden="true" />
      <Copertina gioco="fortuna" formato="icona" className="fortuna-saldo__icona" />
      <p className="fortuna-saldo__etichetta">Saldo di oggi</p>
      <p className="fortuna-saldo__numero u-tabnum">
        {dati ? <Numero valore={dati.saldo} /> : <span className="scheletro scheletro--riga-corta" />}
        <span className="fortuna-saldo__unita"> punti</span>
      </p>
      {dati && (
        <ul className="fortuna-saldo__voci">
          {voci.map(([nome, valore], i) => (
            <li key={nome} className="fortuna-saldo__voce">
              <span>{nome}</span>
              <span className={`u-tabnum${i > 0 && valore > 0 ? ' is-piu' : i > 0 && valore < 0 ? ' is-meno' : ''}`}>
                {i === 0 ? valore : conSegno(valore)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {vuoto && (
        <Collegamento to={ROTTE.home} direzione="scheda" className="fortuna-saldo__vuoto">
          Gioca le classificate di oggi: i loro punti sono il saldo
        </Collegamento>
      )}
    </section>
  )
}

/** La carta di un gioco: la copertina, com'e' andata oggi, e il bottone. Tutta la carta porta al gioco. */
function CartaFortuna({
  id,
  nome,
  a,
  netto,
  stato,
}: {
  id: 'ruota' | 'slot'
  nome: string
  a: string
  netto: number | null
  stato: StatoRuota | null
}) {
  const tono = netto !== null && netto > 0 ? ' is-piu' : netto !== null && netto < 0 ? ' is-meno' : ''
  return (
    <Collegamento
      to={stato?.a ?? a}
      className={`fortuna-carta fortuna-carta--${id}${tono}`}
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
