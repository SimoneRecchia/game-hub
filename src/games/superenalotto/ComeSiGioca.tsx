import { Sheet } from '@/components/Sheet'
import {
  COSTO_SCHEDA,
  DA_SCEGLIERE,
  NUMERI,
  QUOTA_PREMI,
  RIPARTIZIONE,
  SCHEDE_MASSIME,
  unaSu,
} from '@shared/superenalotto'
import '@/games/cruciverba/ComeSiGioca.css'

const volte = (n: number) => (n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10).replace('.', ','))

export function ComeSiGiocaEnalotto({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Segna {DA_SCEGLIERE} numeri da 1 a {NUMERI} e gioca la scheda: costa {COSTO_SCHEDA} punto, e se ne giocano
          fino a {SCHEDE_MASSIME} per estrazione. Si estrae il lunedì, il mercoledì e il venerdì: alle 21 il gioco
          chiude, alle 21:05 c’è l’estrazione in diretta.
        </p>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">I premi</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              <strong>4 numeri</strong>: il jackpot, il {RIPARTIZIONE[4]}% del montepremi più quel che è rimasto
              dalle estrazioni prima. Una scheda su {volte(unaSu(4))}.
            </li>
            <li>
              <strong>3 numeri</strong>: il {RIPARTIZIONE[3]}%. Una scheda su {volte(unaSu(3))}.
            </li>
            <li>
              <strong>2 numeri</strong>: il {RIPARTIZIONE[2]}%. Una scheda su {volte(unaSu(2))}.
            </li>
          </ul>
          <p className="cru-aiuto__testo">
            Come nel SuperEnalotto vero, il montepremi è il {QUOTA_PREMI}% delle giocate, e ogni premio si divide in
            parti uguali fra chi ha fatto quella categoria: quanto vale dipende da quanti giocano e da quanti
            indovinano. Una categoria non paga mai meno di quella sotto.
          </p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Il jackpot</h3>
          <p className="cru-aiuto__testo">
            Se nessuno fa 4, il jackpot passa all’estrazione dopo, e così le parti dei premi che nessuno ha vinto. Le
            vincite arrivano nel saldo alla fine della diretta.
          </p>
        </section>
      </div>
    </Sheet>
  )
}
