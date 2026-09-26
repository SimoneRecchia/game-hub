import { Sheet } from '@/components/Sheet'
import {
  CATEGORIE,
  DOMANDE_PER_PARTITA,
  NOMI_CATEGORIE,
  PUNTI_BASE_QUIZ,
  QUANTE_LIBERE,
  SECONDI_CARTINA,
  SECONDI_SCELTA,
  puntiQuiz,
} from '@shared/quiz'
import { DESCRIZIONI } from './PartitaQuiz'
import '@/games/cruciverba/ComeSiGioca.css'

export function ComeSiGiocaQuiz({ open, onClose }: { open: boolean; onClose: () => void }) {
  const perGiusta = (100 - PUNTI_BASE_QUIZ) / DOMANDE_PER_PARTITA
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Un quiz di geografia: ogni domanda ha quattro risposte e una sola giusta. Sulla cartina muta, invece di
          scegliere, si tocca il posto.
        </p>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Le due partite</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              <strong>Classificata.</strong> Una al giorno: {DOMANDE_PER_PARTITA} domande{' '}
              <strong>uguali per tutti</strong>, tutte della stessa categoria, che cambia ogni giorno — in una
              settimana passano tutte. Hai {SECONDI_SCELTA} secondi per domanda, {SECONDI_CARTINA} sulla cartina; il
              tempo lo tiene il server, quindi una domanda aperta corre anche se chiudi l&rsquo;app.
            </li>
            <li>
              <strong>Libera.</strong> Scegli la categoria, il continente — o un paese, per fiumi e laghi — e quante
              domande ({QUANTE_LIBERE.join(', ')}), con il tempo o senza. Non conta per la classifica.
            </li>
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">I punti</h3>
          <p className="cru-aiuto__nota">
            {PUNTI_BASE_QUIZ} per aver giocato, e {perGiusta} per ogni risposta giusta: dieci su dieci fanno{' '}
            {puntiQuiz(DOMANDE_PER_PARTITA, DOMANDE_PER_PARTITA)}, cinque ne fanno{' '}
            {puntiQuiz(DOMANDE_PER_PARTITA / 2, DOMANDE_PER_PARTITA)}. A pari punti passa avanti chi ci ha messo meno
            tempo.
          </p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Le categorie</h3>
          <ul className="cru-aiuto__elenco">
            {CATEGORIE.map((c) => (
              <li key={c}>
                <strong>{NOMI_CATEGORIE[c]}.</strong> {DESCRIZIONI[c]}
              </li>
            ))}
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La cartina muta</h3>
          <p className="cru-aiuto__nota">
            Tocca un paese o un mare, poi «È qui». Con due dita la cartina si ingrandisce e si sposta; i bottoni + e −
            fanno lo stesso. A risposta data il posto giusto si accende in verde.
          </p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Da dove vengono i dati</h3>
          <p className="cru-aiuto__nota">
            Paesi, capitali, fiumi e laghi da Wikidata; le coste e la cartina da Natural Earth; le bandiere da
            flagcdn. Quale mare bagna quale paese si misura sulla cartina, costa per costa, e un paese che tocca un
            mare per pochi chilometri non viene proposto né come risposta giusta né come sbagliata: niente
            trabocchetti.
          </p>
        </section>
      </div>
    </Sheet>
  )
}
