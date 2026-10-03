import { Sheet } from '@/components/Sheet'
import { pluralize } from '@/lib/format'
import { COSTO_ERRORE, COSTO_SVELATA, PUNTI_COMPLETO } from '@shared/sudoku'
import '@/games/cruciverba/ComeSiGioca.css'

export function ComeSiGiocaSudoku({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Metti le cifre da 1 a 9 in modo che ogni riga, ogni colonna e ogni riquadro le abbia tutte, una volta sola.
        </p>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Scrivere</h3>
          <ol className="cru-aiuto__passi">
            <li>Tocca una casella, poi una cifra. La stessa cifra una seconda volta la toglie.</li>
            <li>
              <strong>Note</strong>: le cifre diventano piccole, per segnare dove una cifra può ancora stare. Si puliscono da
              sole quando scrivi la cifra accanto.
            </li>
            <li>Due cifre uguali che si vedono diventano rosse.</li>
            <li>Da tastiera: le cifre, le frecce, Canc per cancellare, N per le note.</li>
          </ol>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Punteggio</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              Completarlo senza aiuti vale <strong>{PUNTI_COMPLETO} punti</strong>.
            </li>
            <li>
              <strong>Controlla</strong>: {COSTO_ERRORE} {pluralize(COSTO_ERRORE, 'punto', 'punti')} per ogni cifra
              sbagliata.
            </li>
            <li>
              <strong>Svela</strong>: {COSTO_SVELATA} punti per cifra.
            </li>
            <li>Il tempo conta solo a pari punti.</li>
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Da sapere</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              <strong>Classificata</strong>: uno schema al giorno, uguale per tutti. Facile a inizio settimana, esperto la
              domenica.
            </li>
            <li>
              <strong>Libera</strong>: uno schema nuovo della difficoltà che vuoi. Non conta per la classifica.
            </li>
          </ul>
        </section>
      </div>
    </Sheet>
  )
}
