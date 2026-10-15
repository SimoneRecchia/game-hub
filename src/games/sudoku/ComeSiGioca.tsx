import { Sheet } from '@/components/Sheet'
import { formatCronometro, inPunti } from '@/lib/format'
import type { CostiAiuti } from '@shared/aiuti'
import { PUNTI_COMPLETO, RITMO_SUDOKU } from '@shared/sudoku'
import '@/games/cruciverba/ComeSiGioca.css'

const secondi = (ms: number) => Math.round(ms / 1000)

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
              {costi ? (
                <>
                  Completarlo senza aiuti entro {formatCronometro(RITMO_SUDOKU.pienoMs * costi.daTrovare)} vale{' '}
                  <strong>{PUNTI_COMPLETO} punti</strong>; poi scende, fino a {PUNTI_COMPLETO / 2} a{' '}
                  {formatCronometro(RITMO_SUDOKU.lentoMs * costi.daTrovare)}.
                </>
              ) : (
                <>
                  Completarlo senza aiuti entro {secondi(RITMO_SUDOKU.pienoMs)} secondi a cifra vale{' '}
                  <strong>{PUNTI_COMPLETO} punti</strong>; poi scende, fino a {PUNTI_COMPLETO / 2} a{' '}
                  {secondi(RITMO_SUDOKU.lentoMs)} secondi a cifra.
                </>
              )}{' '}
              Conta il tempo con la pagina aperta.
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
                ? `${inPunti(costi.svelata)} per cifra, anche se l'avevi già scritta giusta.`
                : 'ogni cifra svelata costa tre volte la sua parte dei punti, anche se era giusta.'}{' '}
              Svelato un terzo dello schema, vale zero.
            </li>
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Da sapere</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              <strong>Classificata</strong>: uno schema facile al giorno, uguale per tutti.
            </li>
            <li>
              <strong>Libera</strong>: uno schema nuovo della difficoltà che vuoi, da solo o contro un amico, sullo
              stesso schema e senza aiuti: vince chi lo risolve prima. Non conta per la classifica.
            </li>
          </ul>
        </section>
      </div>
    </Sheet>
  )
}
