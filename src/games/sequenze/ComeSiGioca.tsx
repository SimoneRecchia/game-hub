import { Sheet } from '@/components/Sheet'
import {
  PRIMA_LUNGHEZZA,
  PUNTI_FINITA_SEQUENZE,
  SEQUENZE_PER_TURNO,
  TURNI_SEQUENZE,
  ULTIMA_LUNGHEZZA,
} from '@shared/sequenze'
import '@/games/cruciverba/ComeSiGioca.css'

/** Le regole delle Sequenze, il minimo per giocare. */
export function ComeSiGiocaSequenze({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Alcuni cubetti si accendono, uno alla volta: toccali nello stesso ordine.
        </p>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La partita</h3>
          <ul className="cru-aiuto__elenco">
            <li>A ogni sequenza giusta la prossima ha un cubetto in più. Il primo errore chiude.</li>
            <li>
              Ogni giorno {TURNI_SEQUENZE} turni, gli stessi per tutti: ognuno parte da {PRIMA_LUNGHEZZA} cubetti e
              arriva a {ULTIMA_LUNGHEZZA}. Fra un turno e l’altro ti fermi quanto vuoi.
            </li>
            <li>Una sequenza si vede una volta: se chiudi la pagina mentre la ripeti, conta sbagliata.</li>
            <li>Nella libera si va avanti finché non sbagli. Al contrario: dall’ultimo cubetto acceso al primo.</li>
          </ul>
        </section>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">I punti</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              {PUNTI_FINITA_SEQUENZE} per aver giocato i {TURNI_SEQUENZE} turni, e uno per ogni sequenza giusta:
              fino a {SEQUENZE_PER_TURNO} per turno.
            </li>
            <li>Con un amico vince chi arriva più lontano. La libera non conta per la classifica.</li>
          </ul>
        </section>
      </div>
    </Sheet>
  )
}
