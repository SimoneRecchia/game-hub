import { useMemo } from 'react'
import { Sheet } from '@/components/Sheet'
import { MANI_MASSIME, PUNTATA_MINIMA_BJ, resaBlackjack } from '@shared/blackjack'
import { POSTI_BJ, PUNTATE_MS, TURNO_MS } from '@shared/blackjack-tavolo'
import '@/games/cruciverba/ComeSiGioca.css'

export function ComeSiGiocaBlackjack({ open, onClose }: { open: boolean; onClose: () => void }) {
  // La resa con la strategia migliore: un conto esatto, che si fa quando le regole si aprono.
  const resa = useMemo(() => (open ? Math.round(resaBlackjack() * 100) : null), [open])
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Arriva più vicino a 21 del banco, senza superarlo. Le figure valgono 10, l'asso 1 o 11. Si punta da{' '}
          {PUNTATA_MINIMA_BJ} punti a tutto il saldo.
        </p>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Le mosse</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              <strong>Carta</strong>: ne prendi un'altra.
            </li>
            <li>
              <strong>Stai</strong>: ti fermi.
            </li>
            <li>
              <strong>Raddoppia</strong>: con due carte, punti altrettanto e prendi una carta sola.
            </li>
            <li>
              <strong>Dividi</strong>: due carte dello stesso valore diventano due mani, con un'altra
              puntata. Fino a {MANI_MASSIME} mani; gli assi divisi prendono una carta sola.
            </li>
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Il banco</h3>
          <p className="cru-aiuto__testo">
            Il banco prende la seconda carta dopo i giocatori, e sta su tutti i 17. Se fa blackjack, si prende anche
            i raddoppi e le divisioni.
          </p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">I pagamenti</h3>
          <p className="cru-aiuto__testo">
            Una mano vinta paga la puntata, il pari la restituisce. Il blackjack paga 1 a 1, come una vittoria.
          </p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Al tavolo</h3>
          <p className="cru-aiuto__testo">
            Fino a {POSTI_BJ} giocatori: gli amici online si siedono al tuo tavolo. Dopo la prima puntata gli altri
            hanno {PUNTATE_MS / 1000} secondi per la loro, e chi deve decidere ne ha {TURNO_MS / 1000}.
          </p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Vince il banco</h3>
          <p className="cru-aiuto__testo">
            Chi gioca al meglio riceve in media il {resa ?? 97}% di quel che punta, come agli altri giochi della
            Fortuna.
          </p>
        </section>
      </div>
    </Sheet>
  )
}
