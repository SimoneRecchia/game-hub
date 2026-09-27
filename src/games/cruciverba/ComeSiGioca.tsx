import { Sheet } from '@/components/Sheet'
import { COSTO_ERRORE, COSTO_SVELATA, PUNTI_COMPLETO } from '@shared/cruciverba'
import './ComeSiGioca.css'

export function ComeSiGiocaCruciverba({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">Completa lo schema con meno aiuti che puoi.</p>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Scrivere</h3>
          <ol className="cru-aiuto__passi">
            <li>Tocca una casella per vedere la sua definizione.</li>
            <li>
              <strong>Toccala di nuovo</strong>, o usa il tasto <span aria-hidden="true">↕</span>, per
              cambiare direzione.
            </li>
            <li>Tocca la definizione per vederle tutte.</li>
            <li>Da tastiera: frecce per spostarti, Tab per la parola successiva, spazio per cambiare direzione.</li>
          </ol>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Punteggio</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              Completarlo senza aiuti vale <strong>{PUNTI_COMPLETO} punti</strong>.
            </li>
            <li>
              <strong>Controlla</strong>: {COSTO_ERRORE} punto per ogni lettera sbagliata.
            </li>
            <li>
              <strong>Svela</strong>: {COSTO_SVELATA} punti per ogni lettera mancante o sbagliata.
            </li>
            <li>Il tempo conta solo a pari punti.</li>
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Da sapere</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              Niente accenti: <em>città</em> si scrive CITTA.
            </li>
            <li>
              <strong>sigla</strong>: la risposta è una sigla o un simbolo.
            </li>
            <li>
              <strong>plurale</strong>, <strong>femminile</strong>: la risposta va al plurale o al femminile.
            </li>
            <li>
              <strong>Classificata</strong>: uno schema al giorno, uguale per tutti.
            </li>
            <li>
              <strong>Libera</strong>: uno schema a caso. Non conta per la classifica.
            </li>
          </ul>
        </section>

        <p className="cru-aiuto__nota">
          Definizioni dal{' '}
          <a href="https://it.wiktionary.org" target="_blank" rel="noreferrer">
            Wikizionario
          </a>
          , accorciate, con licenza{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.it" target="_blank" rel="noreferrer">
            CC BY-SA 4.0
          </a>
          , tramite{' '}
          <a href="https://kaikki.org/itwiktionary/" target="_blank" rel="noreferrer">
            kaikki.org
          </a>
          .
        </p>
      </div>
    </Sheet>
  )
}
