import { useMemo } from 'react'
import { Button } from '@/components/Button'
import { Sheet } from '@/components/Sheet'
import { MANI_MASSIME, PUNTATA_MINIMA_BJ, resaBlackjack } from '@shared/blackjack'
import { POSTI_BJ, PUNTATE_MS, TURNO_MS } from '@shared/blackjack-tavolo'
import '@/games/cruciverba/ComeSiGioca.css'

/** Le regole del blackjack, il minimo per giocare: le quattro righe del mockup, e il tavolo con gli amici. */
export function ComeSiGiocaBlackjack({ open, onClose }: { open: boolean; onClose: () => void }) {
  // La resa con la strategia migliore: un conto esatto, che si fa quando le regole si aprono.
  const resa = useMemo(() => (open ? Math.round(resaBlackjack() * 100) : null), [open])
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Fai più punti del banco senza passare 21. Le figure valgono 10, l’asso 1 o 11.
        </p>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Il giro</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              <strong>Carta</strong> ne chiede un’altra, <strong>Stai</strong> si ferma. <strong>Raddoppia</strong>{' '}
              con due carte, anche dopo lo split. <strong>Split</strong> con due carte dello stesso valore, fino a{' '}
              {MANI_MASSIME} mani; gli assi una volta, con una carta.
            </li>
            <li>
              Il banco prende la seconda carta dopo i giocatori e sta su tutti i 17. Se fa blackjack, raddoppi e split
              non pagano.
            </li>
            <li>
              Una mano vinta ti ridà il doppio della puntata, anche il blackjack, che paga 1 a 1; una mano pari ti
              ridà la puntata. Contro l’asso del banco c’è l’assicurazione: costa metà puntata e paga 2 a 1.
            </li>
          </ul>
        </section>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Al tavolo</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              Si punta da {PUNTATA_MINIMA_BJ} punti a tutto il saldo. Fino a {POSTI_BJ} giocatori: con gli amici le
              puntate hanno {PUNTATE_MS / 1000} secondi, e ogni turno {TURNO_MS / 1000}.
            </li>
            <li>Giocando al meglio, in media ti torna il {resa ?? 97}% di quel che punti.</li>
          </ul>
        </section>
        <Button size="lg" fullWidth onClick={onClose}>
          Ho capito
        </Button>
      </div>
    </Sheet>
  )
}
