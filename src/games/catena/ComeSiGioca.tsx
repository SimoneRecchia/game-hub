import { Sheet } from '@/components/Sheet'
import {
  DA_INDOVINARE_CATENA,
  JOLLY_CATENA,
  MONTEPREMI_CATENA,
  TEMPO_FINALE_CATENA_MS,
  TEMPO_PAROLA_CATENA_MS,
} from '@shared/catena'
import '@/games/cruciverba/ComeSiGioca.css'

/** Le regole della Catena, il minimo per giocare. */
export function ComeSiGiocaCatena({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">Ogni parola si lega a quella dopo: completa la catena.</p>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La catena</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              Fra due parole ce n’è una che sta con tutte e due, come in «spirito <strong>libero</strong>» e «tiro{' '}
              <strong>libero</strong>»: ne vedi la prima lettera, ma non quanto è lunga. Scrivila e prova; trovata
              quella, si scende alla coppia dopo.
            </li>
            <li>
              Hai {Math.round(TEMPO_PAROLA_CATENA_MS / 1000)} secondi per parola. Se sbagli il montepremi si dimezza e
              vedi un’altra lettera; al secondo errore, o a tempo finito, si dimezza ancora e vedi la parola.
            </li>
            <li>Hai {JOLLY_CATENA} jolly: ognuno mostra la lettera dopo, senza costare niente. Nella finale no.</li>
          </ul>
        </section>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La parola finale</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              È la {DA_INDOVINARE_CATENA}ª: ne vedi le prime due lettere e l’ultima, e la parola sopra. Quella sotto,
              il terzo elemento, si compra dimezzando il montepremi; se hai ancora tutti e due i jolly è in regalo.
            </li>
            <li>Hai un minuto e mezzo ({Math.round(TEMPO_FINALE_CATENA_MS / 1000)} secondi) e una sola risposta.</li>
          </ul>
        </section>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">I punti</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              Il montepremi parte da {MONTEPREMI_CATENA} punti. Se indovini la parola finale lo vinci; se no, niente.
            </li>
            <li>Una al giorno, la stessa per tutti.</li>
            <li>
              Nella libera scegli il tempo per parola e quello della finale, e puoi sfidare un amico sulla stessa
              catena: vince chi vince di più, e a pari punti chi la scrive prima. Non conta per la classifica.
            </li>
          </ul>
        </section>
        <p className="cru-aiuto__nota">
          Il gioco è quello dell’ultima catena di Reazione a catena, su Rai 1. Le espressioni vengono anche dal{' '}
          <a href="https://it.wiktionary.org" target="_blank" rel="noreferrer">
            Wikizionario
          </a>
          , con licenza CC BY-SA.
        </p>
      </div>
    </Sheet>
  )
}
