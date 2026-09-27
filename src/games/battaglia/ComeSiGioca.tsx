import { Sheet } from '@/components/Sheet'
import { Fuoco } from './Mare'
import './Mare.css'
import { FLOTTA } from '@shared/battaglia'
import { LINK_SCADENZA_MS } from '@shared/config'
import { ACQUE_PER_PUNTO, PUNTI_PER_COLPITA } from '@shared/punti'
import '@/games/cruciverba/ComeSiGioca.css'

const ore = (ms: number) => Math.round(ms / 3_600_000)

export function ComeSiGiocaBattaglia({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">Vince chi affonda per primo tutte le navi dell&rsquo;altro.</p>

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
            Le navi <strong>non si toccano</strong>, nemmeno d&rsquo;angolo. Per spostarne una, toccala e scegli
            la casella della prua.
          </p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Il combattimento</h3>
          <ul className="cru-aiuto__elenco">
            <li>Per sparare, tocca una casella nel mare dell&rsquo;avversario.</li>
            <li>Un colpo per volta, a turno.</li>
          </ul>
          <ul className="legenda" aria-label="I segni sul mare">
            <li>
              <span className="legenda__cella" aria-hidden="true">
                <span className="mare__spruzzo" />
              </span>
              <span>
                <strong>Acqua</strong>: nessuna nave.
              </span>
            </li>
            <li>
              <span className="legenda__cella is-colpito" aria-hidden="true">
                <Fuoco />
              </span>
              <span>
                <strong>Colpito</strong>: una nave ancora a galla.
              </span>
            </li>
            <li>
              <span className="legenda__cella is-affondata" aria-hidden="true">
                <span className="mare__croce" />
              </span>
              <span>
                <strong>Affondata</strong>: tutta la nave è a fondo.
              </span>
            </li>
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Classificata e libera</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              <strong>Classificata.</strong> Una al giorno, contro il computer, con la stessa flotta per tutti.
            </li>
            <li>
              <strong>Punti.</strong> Se vinci, 100 punti meno 1 ogni {ACQUE_PER_PUNTO} colpi in acqua. Se perdi,{' '}
              {PUNTI_PER_COLPITA} punti per casella colpita.
            </li>
            <li>
              <strong>Libera.</strong> Contro il computer o un amico. Non conta per la classifica.
            </li>
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Con un amico</h3>
          <ul className="cru-aiuto__elenco">
            <li>Sfida chi è online, o manda un link che vale {ore(LINK_SCADENZA_MS)} ore.</li>
            <li>
              A partita finita, <strong>Gioca ancora</strong> chiede la rivincita.
            </li>
          </ul>
        </section>
      </div>
    </Sheet>
  )
}
