import { Sheet } from '@/components/Sheet'
import { COSTO_ERRORE, COSTO_SVELATA, PUNTI_COMPLETO } from '@shared/cruciverba'
import './ComeSiGioca.css'

export function ComeSiGiocaCruciverba({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Un cruciverba nuovo ogni giorno, <strong>lo stesso per tutti</strong>. Le definizioni non
          sono inventate: vengono dal <strong>Wikizionario</strong>, il dizionario libero scritto dai
          volontari, e lo schema lo compone un programma ogni notte.
        </p>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Scrivere</h3>
          <ol className="cru-aiuto__passi">
            <li>Tocca una casella: si colora la parola, e sotto compare la sua definizione.</li>
            <li>
              <strong>Toccala di nuovo</strong>, o usa il tasto <span aria-hidden="true">↕</span> in
              basso a sinistra, per passare da orizzontale a verticale.
            </li>
            <li>Finita una parola si passa da soli alla prossima ancora da scrivere.</li>
            <li>
              Tocca la definizione per vederle tutte. Da computer vanno le frecce, Tab per la parola
              successiva e la barra spaziatrice per cambiare direzione.
            </li>
          </ol>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Le regole dello schema</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              Come nel cruciverba italiano classico, <strong>ogni casella sta in due parole</strong>:
              una orizzontale e una verticale. Nessuna lettera si indovina con un indizio solo.
            </li>
            <li>
              Niente accenti: <em>città</em> si scrive C-I-T-T-A. Le lettere sono le 21 italiane,
              senza J, K, W, X, Y.
            </li>
            <li>
              Accanto alla definizione, <strong>sigla</strong> vuol dire che la risposta è una sigla o
              un simbolo; <strong>plurale</strong> e <strong>femminile</strong> che la definizione è
              quella della parola base, e la risposta va volta.
            </li>
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">I punti</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              Completato senza aiuti vale <strong>{PUNTI_COMPLETO} punti</strong>.
            </li>
            <li>
              <strong>Controlla</strong> ti dice quali lettere sono sbagliate: costa {COSTO_ERRORE}{' '}
              punto per ogni errore trovato. Se è tutto giusto non costa niente, e un errore già
              segnalato non si paga due volte.
            </li>
            <li>
              <strong>Svela</strong> scrive la lettera giusta: {COSTO_SVELATA} punti per ogni lettera
              che non avevi già giusta.
            </li>
            <li>
              Il tempo conta solo a schermo acceso e non toglie punti: in classifica, a parità di
              punti, passa avanti chi ci ha messo meno.
            </li>
            <li>
              Nello <strong>schema libero</strong> le regole sono le stesse, ma lo schema è tutto
              tuo, preso da una scorta che si rinnova ogni notte: non conta per la classifica.
            </li>
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Da dove vengono le parole</h3>
          <p className="cru-aiuto__nota">
            Definizioni dal{' '}
            <a href="https://it.wiktionary.org" target="_blank" rel="noreferrer">
              Wikizionario
            </a>
            , con licenza{' '}
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/deed.it"
              target="_blank"
              rel="noreferrer"
            >
              CC BY-SA 4.0
            </a>
            , attraverso l&rsquo;estrazione di{' '}
            <a href="https://kaikki.org/itwiktionary/" target="_blank" rel="noreferrer">
              kaikki.org
            </a>
            . Sono accorciate, mai riscritte: a cruciverba finito ognuna porta alla sua voce. Lo
            schema preferisce le parole d&rsquo;uso comune, misurate sui sottotitoli di OpenSubtitles.
          </p>
        </section>
      </div>
    </Sheet>
  )
}
