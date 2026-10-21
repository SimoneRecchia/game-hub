import { Sheet } from '@/components/Sheet'
import { LIVELLI_SEQUENZE, PRIMA_LUNGHEZZA } from '@shared/sequenze'
import '@/games/cruciverba/ComeSiGioca.css'

/** Le regole delle Sequenze, il minimo per giocare. */
export function ComeSiGiocaSequenze({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto is-sequenze">
        <p className="cru-aiuto__lede">
          Alcuni cubetti si accendono, uno alla volta: toccali nello stesso ordine.
        </p>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La partita</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              Si parte da {PRIMA_LUNGHEZZA} cubetti ({LIVELLI_SEQUENZE.facile.prima} nel facile), e a ogni sequenza
              giusta la prossima ne ha uno in più. Il primo errore chiude.
            </li>
            <li>Al contrario: dall’ultimo cubetto acceso al primo.</li>
          </ul>
        </section>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Il record</h3>
          <ul className="cru-aiuto__elenco">
            <li>Conta la sequenza più lunga ripetuta giusta: ogni livello ha il suo record.</li>
            <li>Con un amico, al livello che scegli, vince chi arriva più lontano. Non conta per la classifica.</li>
          </ul>
        </section>
        <button type="button" className="cru-aiuto__capito" onClick={onClose}>
          Ho capito
        </button>
      </div>
    </Sheet>
  )
}
