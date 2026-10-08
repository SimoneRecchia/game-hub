import { Sheet } from '@/components/Sheet'
import { COPPIE_GHIGLIOTTINA, MONTEPREMI_GHIGLIOTTINA, TEMPO_FINALE_MS } from '@shared/ghigliottina'
import '@/games/cruciverba/ComeSiGioca.css'

/** Le regole della Ghigliottina, il minimo per giocare. */
export function ComeSiGiocaGhigliottina({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">Cinque parole nascondono una parola vincente: trovala.</p>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La partita</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              Arrivano {COPPIE_GHIGLIOTTINA} coppie di parole: in ogni coppia scegli quella legata alla parola
              vincente.
            </li>
            <li>Se sbagli, la lama dimezza il montepremi. La parola giusta si vede comunque.</li>
            <li>
              Con le cinque parole hai {Math.round(TEMPO_FINALE_MS / 1000)} secondi per scrivere la parola che le
              lega tutte: una sola risposta.
            </li>
          </ul>
        </section>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">I punti</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              Il montepremi parte da {MONTEPREMI_GHIGLIOTTINA} punti. Se indovini la parola vincente lo vinci; se no,
              niente.
            </li>
            <li>Una al giorno, la stessa per tutti. La libera non conta per la classifica.</li>
          </ul>
        </section>
        <p className="cru-aiuto__nota">Il gioco è quello del finale dell’Eredità, su Rai 1.</p>
      </div>
    </Sheet>
  )
}
