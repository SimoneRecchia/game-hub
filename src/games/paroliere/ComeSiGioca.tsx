import { Sheet } from '@/components/Sheet'
import { LETTERE_MINIME, PUNTI_GIOCATA_PAROLIERE, TEMPO_PAROLIERE_MS } from '@shared/paroliere'
import { TETTI } from '@shared/punti'
import '@/games/cruciverba/ComeSiGioca.css'

/** Le regole del Paroliere, il minimo per giocare. */
export function ComeSiGiocaParoliere({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Trova più parole che puoi in {Math.round(TEMPO_PAROLIERE_MS / 60_000)} minuti.
        </p>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Le parole</h3>
          <ul className="cru-aiuto__elenco">
            <li>Scorri col dito su lettere vicine, anche in diagonale, e lascia: la parola parte.</li>
            <li>Ogni dado si usa una volta per parola. «Qu» vale due lettere.</li>
            <li>Almeno {LETTERE_MINIME} lettere. Valgono plurali e voci dei verbi.</li>
            <li>Si gioca anche a tocchi: tocca le lettere una dopo l’altra, e di nuovo l’ultima per mandarla.</li>
          </ul>
        </section>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">I punti</h3>
          <ul className="cru-aiuto__elenco">
            <li>3 o 4 lettere 1 punto, 5 lettere 2, 6 lettere 3, 7 lettere 5, da 8 in su 11.</li>
            <li>
              In classifica {PUNTI_GIOCATA_PAROLIERE} punti per aver giocato, fino a {TETTI.paroliere} arrivando al
              traguardo della griglia.
            </li>
            <li>Una griglia al giorno, la stessa per tutti. La libera non conta per la classifica.</li>
          </ul>
        </section>
        <p className="cru-aiuto__nota">Il gioco è il Boggle, che in Italia si chiama Paroliere.</p>
      </div>
    </Sheet>
  )
}
