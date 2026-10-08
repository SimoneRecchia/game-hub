import { Sheet } from '@/components/Sheet'
import { COPPIE_GHIGLIOTTINA, MONTEPREMI_GHIGLIOTTINA, TEMPO_FINALE_MS, TEMPO_SCELTA_MS } from '@shared/ghigliottina'
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
              vincente. Hai {Math.round(TEMPO_SCELTA_MS / 1000)} secondi per coppia.
            </li>
            <li>
              Se sbagli, o se il tempo finisce, la lama dimezza il montepremi. La parola giusta si vede comunque.
            </li>
            <li>
              Con le cinque parole hai un minuto e mezzo ({Math.round(TEMPO_FINALE_MS / 1000)} secondi) per scrivere
              la parola che le lega tutte: una sola risposta.
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
            <li>Una al giorno, la stessa per tutti.</li>
            <li>
              Nella libera scegli il tempo per coppia e quello della parola vincente, e puoi sfidare un amico sulla
              stessa ghigliottina: vince chi vince di più, e a pari punti chi la scrive prima. Non conta per la
              classifica.
            </li>
          </ul>
        </section>
        <p className="cru-aiuto__nota">Il gioco è quello del finale dell’Eredità, su Rai 1.</p>
      </div>
    </Sheet>
  )
}
