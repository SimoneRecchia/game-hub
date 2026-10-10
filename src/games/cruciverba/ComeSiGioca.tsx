import { Sheet } from '@/components/Sheet'
import { inPunti } from '@/lib/format'
import type { CostiAiuti } from '@shared/aiuti'
import { MAX_COOP_GUESTS } from '@shared/config'
import { PUNTI_COMPLETO } from '@shared/cruciverba'
import './ComeSiGioca.css'

/** Le regole. I costi degli aiuti sono quelli dello schema aperto: senza, si dice la regola. */
export function ComeSiGiocaCruciverba({
  open,
  onClose,
  costi = null,
}: {
  open: boolean
  onClose: () => void
  costi?: CostiAiuti | null
}) {
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
              <strong>Controlla</strong>:{' '}
              {costi
                ? `${inPunti(costi.controllo)} la parola, ${costi.controlloSchema} tutto lo schema, ` +
                  `più ${costi.errore} per ogni lettera sbagliata.`
                : 'ogni controllo costa, anche senza errori, e tutto lo schema costa più di una parola.'}
            </li>
            <li>
              <strong>Svela</strong>:{' '}
              {costi
                ? `${inPunti(costi.svelata)} per lettera, anche se l'avevi già scritta giusta.`
                : 'ogni lettera svelata costa tre volte la sua parte dei punti, anche se era giusta.'}{' '}
              Svelato un terzo dello schema, vale zero.
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
              Alcune parole corte hanno definizioni da enigmista: <em>Il cuore di milano</em> è LA,{' '}
              <em>Le vocali di farina</em> è AIA.
            </li>
            <li>
              <strong>Classificata</strong>: uno schema al giorno, uguale per tutti.
            </li>
            <li>
              <strong>Libera</strong>: uno schema a caso. Non conta per la classifica.
            </li>
            <li>
              <strong>In compagnia</strong>: inviti fino a {MAX_COOP_GUESTS} persone a suggerirti parole. Chi gioca
              con te prende il tuo stesso punteggio.
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
