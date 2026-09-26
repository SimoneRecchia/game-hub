import { Sheet } from '@/components/Sheet'
import { CASELLE_FLOTTA, FLOTTA } from '@shared/battaglia'
import { BATTAGLIA_ATTESA_FLOTTA_MS, BATTAGLIA_ATTESA_TURNO_MS, LINK_SCADENZA_MS } from '@shared/config'
import { ACQUE_PER_PUNTO, PUNTI_PER_COLPITA, puntiBattaglia } from '@shared/punti'
import '@/games/cruciverba/ComeSiGioca.css'

const minuti = (ms: number) => Math.round(ms / 60_000)
const ore = (ms: number) => Math.round(ms / 3_600_000)

export function ComeSiGiocaBattaglia({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          La battaglia navale classica. Ognuno nasconde la sua flotta in un mare di dieci per dieci;
          vince chi affonda per primo tutte le navi dell&rsquo;altro.
        </p>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Le due partite</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              <strong>Classificata.</strong> Una al giorno, contro il computer, con la sua flotta{' '}
              <strong>uguale per tutti</strong>. Vincendo fai cento punti meno uno ogni{' '}
              {ACQUE_PER_PUNTO} colpi in acqua — cinquanta colpi valgono{' '}
              {puntiBattaglia({ vinta: true, colpi: 50, aSegno: CASELLE_FLOTTA })}; perdendo,{' '}
              {PUNTI_PER_COLPITA} punti per ogni casella nemica colpita. Qui non si invitano amici: la
              partita del giorno è uguale per tutti solo se tutti hanno lo stesso avversario.
            </li>
            <li>
              <strong>Libera.</strong> Contro il computer, a tre livelli, oppure contro un amico. Non
              conta per la classifica.
            </li>
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La flotta</h3>
          <ul className="cru-aiuto__elenco">
            {FLOTTA.map((t) => (
              <li key={t.id}>
                {t.nome}: {t.lunghezza} caselle
              </li>
            ))}
          </ul>
          <p className="cru-aiuto__nota">
            Le navi stanno dritte, in orizzontale o in verticale, e <strong>non si toccano</strong>,
            nemmeno d&rsquo;angolo. Tocca una nave per sceglierla, poi la casella dove vuoi la prua;
            «Ruota» la gira, «A caso» rimescola tutto.
          </p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Il combattimento</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              Contro il computer il primo colpo è tuo, e lui risponde subito. Fra amici chi spara per
              primo si decide a sorte, quando le due flotte sono in mare.
            </li>
            <li>
              Un colpo a testa, a turni alterni. La risposta è quella del gioco su carta:{' '}
              <strong>acqua</strong>, <strong>colpito</strong>, oppure{' '}
              <strong>colpito e affondato</strong> con il nome della nave.
            </li>
            <li>Le navi affondate si vedono intere; le altre restano nascoste fino alla fine.</li>
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Se un amico sparisce</h3>
          <p className="cru-aiuto__nota">
            Se non spara per {minuti(BATTAGLIA_ATTESA_TURNO_MS)} minuti quando tocca a lui, o non
            dispone la flotta in {minuti(BATTAGLIA_ATTESA_FLOTTA_MS)}, puoi chiedere la{' '}
            <strong>vittoria a tavolino</strong>. Chi abbandona perde.
          </p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Sfidare un amico</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              <strong>Chi è online</strong>: puoi sfidare chi ha l&rsquo;app aperta in questo momento,
              in qualunque gioco sia, purché non stia già combattendo. La sfida gli compare sullo
              schermo, e ha due minuti per accettarla o rifiutarla.
            </li>
            <li>
              <strong>Con un link</strong>: lo mandi a chi vuoi, anche a chi non ha ancora un
              account — si registra, e appena entra la partita comincia. Vale {ore(LINK_SCADENZA_MS)}{' '}
              ore, per una persona sola.
            </li>
          </ul>
        </section>
      </div>
    </Sheet>
  )
}
