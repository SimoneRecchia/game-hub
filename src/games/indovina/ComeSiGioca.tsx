import { Sheet } from '@/components/Sheet'
import '@/games/cruciverba/ComeSiGioca.css'

export function ComeSiGiocaIndovina({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Tu e un amico avete gli stessi personaggi, e ognuno ne ha uno segreto. Scopri il suo prima che lui scopra il tuo.
        </p>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Il turno</h3>
          <ol className="cru-aiuto__passi">
            <li>Fai una domanda a cui si risponde sì o no: «Ha gli occhiali?».</li>
            <li>Tocca i personaggi che la risposta esclude: si abbassano.</li>
            <li>Quando pensi di saperlo, invece di chiedere tocca <strong>Indovina</strong>.</li>
          </ol>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Da sapere</h3>
          <ul className="cru-aiuto__elenco">
            <li>Chi indovina vince; chi sbaglia perde.</li>
            <li>Il tuo personaggio è in alto: rispondi pensando a lui.</li>
            <li>
              <strong>I tuoi set</strong>: personaggi con le tue foto. Restano nel tuo telefono.
            </li>
          </ul>
        </section>
      </div>
    </Sheet>
  )
}
