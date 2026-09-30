import { Sheet } from '@/components/Sheet'
import { DOMANDE_PER_PARTITA, PUNTI_BASE_QUIZ, SECONDI_CARTINA, SECONDI_LUNGA, SECONDI_SCELTA } from '@shared/quiz'
import '@/games/cruciverba/ComeSiGioca.css'

export function ComeSiGiocaQuiz({ open, onClose }: { open: boolean; onClose: () => void }) {
  const perGiusta = (100 - PUNTI_BASE_QUIZ) / DOMANDE_PER_PARTITA
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Domande di geografia, storia, arte, libri, cinema, lirica e scienza: scegli la risposta giusta. In geografia
          puoi anche trovare il posto sulla <strong>cartina muta</strong>.
        </p>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Le partite</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              <strong>Classificata.</strong> Una al giorno, uguale per tutti, su una categoria che cambia ogni
              giorno: {DOMANDE_PER_PARTITA} domande, {SECONDI_SCELTA} secondi l’una ({SECONDI_LUNGA} se le risposte
              sono lunghe, {SECONDI_CARTINA} sulla cartina).
            </li>
            <li>
              <strong>Libera.</strong> Scegli materia, categoria, zona o periodo, domande, tempo e difficoltà. Non conta
              per la classifica.
            </li>
            <li>
              <strong>Sfida un amico.</strong> Stesse domande, nello stesso momento: il primo che risponde giusto
              prende il punto. Se l’altro sbaglia, il tuo tempo va al rallentatore.
            </li>
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">I punti</h3>
          <p className="cru-aiuto__nota">
            {PUNTI_BASE_QUIZ} per aver giocato, più {perGiusta} per ogni risposta giusta. A pari punti passa avanti chi
            ci mette meno.
          </p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Dopo ogni risposta</h3>
          <p className="cru-aiuto__nota">
            La cartina con la risposta, o una scheda che la spiega: di chi è il quadro, quando, dove. Poi «Avanti».
          </p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La cartina muta</h3>
          <p className="cru-aiuto__nota">
            Tocca il posto, poi «È qui». Con due dita la ingrandisci e la sposti; ⤢ torna alla zona della partita.
          </p>
        </section>

        <p className="cru-aiuto__nota">
          Spiegazioni da{' '}
          <a href="https://it.wikipedia.org" target="_blank" rel="noreferrer">
            Wikipedia
          </a>
          , con licenza{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.it" target="_blank" rel="noreferrer">
            CC BY-SA 4.0
          </a>
          ; quadri da{' '}
          <a href="https://commons.wikimedia.org" target="_blank" rel="noreferrer">
            Wikimedia Commons
          </a>
          .
        </p>
      </div>
    </Sheet>
  )
}
