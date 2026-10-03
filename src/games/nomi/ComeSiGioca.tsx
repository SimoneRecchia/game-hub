import { Sheet } from '@/components/Sheet'
import { TETTI } from '@shared/punti'
import { BASE_NOMI, CATEGORIE_PER_PARTITA, PUNTI_COMUNE, PUNTI_RARA, SECONDI_NOMI } from '@shared/nomi-cose'
import '@/games/cruciverba/ComeSiGioca.css'

/** Le regole di Nomi, cose e città, il minimo per giocare. */
export function ComeSiGiocaNomi({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Una lettera e {CATEGORIE_PER_PARTITA} categorie: per ognuna scrivi una parola che comincia con quella lettera,
          prima che finisca il tempo.
        </p>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La partita</h3>
          <ul className="cru-aiuto__elenco">
            <li>Hai {SECONDI_NOMI / 60} minuti da quando cominci: la lettera la vedi solo allora.</li>
            <li>Vale anche con l’articolo, al plurale o al femminile: «le arance» è «arancia».</li>
            <li>Consegna quando hai finito; allo scadere del tempo si consegna da sola.</li>
          </ul>
        </section>
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">I punti</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              {BASE_NOMI} per aver giocato, da {PUNTI_COMUNE} a {PUNTI_RARA} per ogni risposta valida: di più se l’hanno
              data in pochi. Consegnare presto vale di più. Al massimo {TETTI.nomi}.
            </li>
            <li>I punti arrivano la notte, quando hanno giocato tutti, e valgono nella classifica del giorno dopo.</li>
            <li>
              <strong>Classificata</strong>: una lettera al giorno, la stessa per tutti.
            </li>
            <li>
              <strong>Libera</strong>: una lettera a caso, contro il computer o un amico. Chi finisce per primo dice
              stop, e si smette di scrivere tutti. Venti punti se in una categoria rispondi solo tu, dieci per una
              risposta diversa, cinque per una uguale. Non conta per la classifica.
            </li>
          </ul>
        </section>
        <p className="cru-aiuto__nota">
          Parole dal{' '}
          <a href="https://it.wiktionary.org" target="_blank" rel="noreferrer">
            Wikizionario
          </a>{' '}
          e dal{' '}
          <a href="https://en.wiktionary.org" target="_blank" rel="noreferrer">
            Wiktionary
          </a>
          , con licenza{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.it" target="_blank" rel="noreferrer">
            CC BY-SA 4.0
          </a>
          , e da{' '}
          <a href="https://www.wikidata.org" target="_blank" rel="noreferrer">
            Wikidata
          </a>
          .
        </p>
      </div>
    </Sheet>
  )
}
