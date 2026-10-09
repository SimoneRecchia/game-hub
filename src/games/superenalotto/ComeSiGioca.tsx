import { Sheet } from '@/components/Sheet'
import {
  CONSERVA_GIORNI,
  COSTI,
  NUMERI,
  QUOTA_PREMI,
  RIPARTIZIONE,
  SCHEDE_MASSIME,
  unaSu,
  type CategoriaEnalotto,
} from '@shared/superenalotto'
import '@/games/cruciverba/ComeSiGioca.css'

/** "Una su 7.428": le probabilita' per le regole, intere e con il punto delle migliaia. */
const volte = (n: number) => Math.round(n).toLocaleString('it-IT')
const probabilita = (c: CategoriaEnalotto) => `una su ${volte(unaSu(c, 4))}, col 4+1 una su ${volte(unaSu(c, 5))}`

export function ComeSiGiocaEnalotto({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Segna 4 numeri da 1 a {NUMERI} e gioca la scheda: costa {COSTI[4]} punti. Con il 4+1 ne segni 5, costa{' '}
          {COSTI[5]} punti e fai 4 cinque volte più spesso. Se ne giocano fino a {SCHEDE_MASSIME} per estrazione. Si
          estrae il lunedì, il mercoledì e il venerdì: alle 21 il gioco chiude, alle 21:05 escono 4 numeri, in
          diretta.
        </p>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">I premi</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              <strong>4 numeri</strong>: il jackpot, il {RIPARTIZIONE[4]}% del montepremi più quel che è rimasto
              dalle estrazioni prima. Una scheda su {volte(unaSu(4, 4))}, col 4+1 una su {volte(unaSu(4, 5))}.
            </li>
            <li>
              <strong>3 numeri</strong>: il {RIPARTIZIONE[3]}%, {probabilita(3)}.
            </li>
            <li>
              <strong>2 numeri</strong>: il {RIPARTIZIONE[2]}%, {probabilita(2)}.
            </li>
          </ul>
          <p className="cru-aiuto__testo">
            Come nel SuperEnalotto vero, il montepremi è il {QUOTA_PREMI}% delle giocate, e ogni premio si divide in
            parti uguali fra chi ha fatto quella categoria: quanto vale dipende da quanti giocano e da quanti
            indovinano. Una categoria non paga mai meno di quella sotto. Una scheda vince una volta sola.
          </p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Il jackpot</h3>
          <p className="cru-aiuto__testo">
            Se nessuno fa 4, il jackpot passa all’estrazione dopo, e così le parti dei premi che nessuno ha vinto. Le
            vincite arrivano nel saldo da sole, alla fine della diretta; le schede si vedono per {CONSERVA_GIORNI}{' '}
            giorni dopo l’estrazione.
          </p>
        </section>
      </div>
    </Sheet>
  )
}
