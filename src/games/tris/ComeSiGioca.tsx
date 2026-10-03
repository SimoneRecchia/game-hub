import { Sheet } from '@/components/Sheet'
import { BASE_TRIS, PARTITE_TRIS, PUNTI_PATTA_TRIS, PUNTI_VINTA_TRIS, SECONDI_MOSSA_TRIS } from '@shared/tris'
import '@/games/cruciverba/ComeSiGioca.css'

/** Le regole della serie del giorno, il minimo per giocare. */
export function ComeSiGiocaTris({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Metti tre segni in fila, in orizzontale, in verticale o in diagonale, prima del computer.
        </p>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La serie</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              {PARTITE_TRIS} partite contro il computer di oggi, lo stesso per tutti. Nella prima, nella terza e nella
              quinta cominci tu, con la croce.
            </li>
            <li>Hai {SECONDI_MOSSA_TRIS} secondi per ogni mossa: allo scadere perdi la partita.</li>
            <li>Il computer non è perfetto: ogni partita si può vincere.</li>
          </ul>
        </section>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">I punti</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              {BASE_TRIS} per aver finito la serie, {PUNTI_VINTA_TRIS} per ogni vittoria, {PUNTI_PATTA_TRIS} per ogni
              patta.
            </li>
            <li>La libera, contro il computer o un amico, non conta per la classifica.</li>
          </ul>
        </section>
      </div>
    </Sheet>
  )
}
