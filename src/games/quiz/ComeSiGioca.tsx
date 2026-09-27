import { Sheet } from '@/components/Sheet'
import {
  CATEGORIE,
  DOMANDE_PER_PARTITA,
  NOMI_CATEGORIE,
  PUNTI_BASE_QUIZ,
  QUANTE_MASSIME,
  SECONDI_CARTINA,
  SECONDI_SCELTA,
  puntiQuiz,
} from '@shared/quiz'
import { descrizione } from './testi'
import '@/games/cruciverba/ComeSiGioca.css'

export function ComeSiGiocaQuiz({ open, onClose }: { open: boolean; onClose: () => void }) {
  const perGiusta = (100 - PUNTI_BASE_QUIZ) / DOMANDE_PER_PARTITA
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Un quiz di geografia, che si gioca in due modi: <strong>a scelta</strong>, fra quattro risposte e una sola
          giusta, o sulla <strong>cartina muta</strong>, dove invece di scegliere si tocca il posto. A risposta data
          la cartina ti mostra dov&rsquo;è la risposta giusta, con i nomi: è un quiz, ma anche un modo per imparare.
        </p>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Le due partite</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              <strong>Classificata.</strong> Una al giorno: {DOMANDE_PER_PARTITA} domande{' '}
              <strong>uguali per tutti</strong>, della stessa categoria, a scelta o sulla cartina — in una settimana
              passano tutte le categorie, due giorni sulla cartina. Hai {SECONDI_SCELTA} secondi per domanda,{' '}
              {SECONDI_CARTINA} sulla cartina; il tempo lo tiene il server, e si passa alla domanda dopo con
              «Avanti», quando hai guardato la risposta. Non si cambia niente: è la stessa partita per tutti.
            </li>
            <li>
              <strong>Libera.</strong> Scegli tu: la categoria — anche le città, che nella classificata non ci sono —
              a scelta o sulla cartina, il continente o un paese, fino a {QUANTE_MASSIME} domande, con il tempo o senza.
              Nelle opzioni avanzate: quali domande, fra quante risposte, quanto note, il ritmo, cosa accendere sulla
              cartina, due «50 e 50», il ripasso delle sbagliate e la morte improvvisa. Non conta per la classifica.
            </li>
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La sfida a due</h3>
          <p className="cru-aiuto__nota">
            Dalla libera, «Sfida un amico»: a chi è online, o con un link. Le stesse domande nello stesso momento,
            sempre a tempo. Il primo che risponde giusto prende il punto; chi sbaglia è fuori da quella domanda, e
            all&rsquo;altro il tempo va <strong>al rallentatore</strong>: i secondi scendono alla metà. Se sbagliate
            tutti e due, o finisce il tempo, il punto non è di nessuno. Alla fine «Gioca ancora»: se l&rsquo;altro
            accetta, il conto della serie continua. È un&rsquo;amichevole: non va in classifica e non resta.
          </p>
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
                <strong>{NOMI_CATEGORIE[c]}.</strong> {descrizione(c, 'scelta')}
              </li>
            ))}
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La cartina muta</h3>
          <p className="cru-aiuto__nota">
            Tocca un paese, un mare, un fiume, un lago o il pallino di una città, poi «È qui». Con due dita la cartina
            si ingrandisce e si sposta; i bottoni + e − fanno lo stesso, e ⤢ torna alla zona della partita. Il mondo
            c&rsquo;è sempre tutto: fuori dalla zona scelta le terre sono attenuate. La cartina resta dove la lasci da
            una domanda all&rsquo;altra, e dopo ogni risposta ti porta a vedere quella giusta, in verde.
          </p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Da dove vengono i dati</h3>
          <p className="cru-aiuto__nota">
            Paesi, capitali, città, confini, fiumi e laghi da Wikidata; le coste, i fiumi e i laghi della cartina da
            Natural Earth; le bandiere da flagcdn. Quale mare bagna quale paese si misura sulla cartina, costa per
            costa, e un paese che tocca un mare per pochi chilometri non viene proposto né come risposta giusta né
            come sbagliata: niente trabocchetti.
          </p>
        </section>
      </div>
    </Sheet>
  )
}
