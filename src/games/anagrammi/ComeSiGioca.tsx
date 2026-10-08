import { Sheet } from '@/components/Sheet'
import {
  BONUS_ANAGRAMMI,
  COSTO_AIUTO_ANAGRAMMI,
  PAROLE_ANAGRAMMI,
  PUNTI_FINITA_ANAGRAMMI,
  PUNTI_PAROLA_ANAGRAMMI,
  TEMPO_PAROLA_MS,
} from '@shared/anagrammi'
import '@/games/cruciverba/ComeSiGioca.css'

/** Le regole degli Anagrammi, il minimo per giocare. */
export function ComeSiGiocaAnagrammi({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">Le lettere di una parola sono mescolate: rimettile in ordine.</p>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La partita</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              {PAROLE_ANAGRAMMI} parole al giorno, da 5 a 9 lettere, le stesse per tutti. Ognuna ha{' '}
              {Math.round(TEMPO_PAROLA_MS / 1000)} secondi, che partono quando la apri.
            </li>
            <li>Tocca le lettere, o scrivile dalla tastiera. Vale anche un’altra parola con le stesse lettere.</li>
            <li>“Mescola” le rimette in un altro ordine; “Passo” lascia la parola.</li>
          </ul>
        </section>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">I punti</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              {PUNTI_FINITA_ANAGRAMMI} per aver giocato, {PUNTI_PAROLA_ANAGRAMMI} per ogni parola trovata e fino a{' '}
              {BONUS_ANAGRAMMI} in più se la trovi subito.
            </li>
            <li>La definizione aiuta e costa {COSTO_AIUTO_ANAGRAMMI} punti.</li>
            <li>
              Nella libera scegli il tempo per parola, e puoi sfidare un amico sulle stesse parole: vince chi fa più
              punti. Non conta per la classifica.
            </li>
          </ul>
        </section>
        <p className="cru-aiuto__nota">
          Le definizioni vengono dal{' '}
          <a href="https://it.wiktionary.org" target="_blank" rel="noreferrer">
            Wikizionario
          </a>
          , con licenza CC BY-SA.
        </p>
      </div>
    </Sheet>
  )
}
