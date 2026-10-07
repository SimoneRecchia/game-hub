import { Sheet } from '@/components/Sheet'
import { inPunti } from '@/lib/format'
import type { CostiAiuti } from '@shared/aiuti'
import { PUNTI_COMPLETO } from '@shared/sudoku'
import '@/games/cruciverba/ComeSiGioca.css'

/** Le regole. I costi degli aiuti sono quelli dello schema del giorno: senza, si dice la regola. */
export function ComeSiGiocaSudoku({
  open,
  onClose,
  costi = null,
}: {
  open: boolean
  onClose: () => void
  costi?: CostiAiuti | null
}) {
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
              <strong>Controlla</strong>:{' '}
              {costi
                ? `${inPunti(costi.controllo)} la casella, ${costi.controlloSchema} tutto lo schema, ` +
                  `più ${costi.errore} per ogni cifra sbagliata.`
                : 'ogni controllo costa, anche senza errori, e tutto lo schema costa più di una casella.'}
            </li>
            <li>
              <strong>Svela</strong>:{' '}
              {costi
                ? `${inPunti(costi.svelata)} per cifra.`
                : 'ogni cifra svelata costa tre volte la sua parte dei punti.'}{' '}
              Svelato un terzo dello schema, vale zero.
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
