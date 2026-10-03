import { Sheet } from '@/components/Sheet'
import { TETTI } from '@shared/punti'
import { BONUS_SCARABEO, DISTRIBUZIONE, JOLLY, MOSSE_PER_GIORNATA, TESSERE_LEGGIO, VALORI } from '@shared/scarabeo'
import './ComeSiGioca.css'

/** I valori raggruppati: sono sette gradini, non ventuno numeri da leggere. */
const GRADINI = [...new Set(Object.values(VALORI))]
  .sort((a, b) => a - b)
  .map((valore) => ({
    valore,
    lettere: Object.entries(VALORI)
      .filter(([, v]) => v === valore)
      .map(([l]) => l.toUpperCase()),
  }))

const PREMI = [
  { classe: 'tp', nome: 'Parola tripla' },
  { classe: 'dp', nome: 'Parola doppia' },
  { classe: 'tl', nome: 'Lettera tripla' },
  { classe: 'dl', nome: 'Lettera doppia' },
] as const

export function ComeSiGiocaScarabeo({ open, onClose }: { open: boolean; onClose: () => void }) {
  const quanteJolly = DISTRIBUZIONE.find(([l]) => l === JOLLY)?.[1] ?? 0

  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="scr-aiuto">
        <p className="scr-aiuto__lede">
          Fai più punti che puoi in <strong>{MOSSE_PER_GIORNATA} mosse</strong>.
        </p>

        <section className="scr-aiuto__sezione">
          <h3 className="scr-aiuto__titolo">Posare una parola</h3>
          <ol className="scr-aiuto__passi">
            <li>
              Tocca una casella: la <strong>freccia</strong> dice da che parte si scrive. Toccala di nuovo per
              girarla.
            </li>
            <li>Tocca le tessere del leggio per posarle, o trascinale sulla casella che vuoi.</li>
            <li>Trascina una tessera lungo il leggio per cambiarle posto.</li>
            <li>Tocca una tessera posata per riprenderla.</li>
          </ol>
        </section>

        <section className="scr-aiuto__sezione">
          <h3 className="scr-aiuto__titolo">Le parole</h3>
          <ul className="scr-aiuto__elenco">
            <li>
              Le tessere di una mossa stanno su <strong>una sola riga o colonna</strong>, senza caselle vuote in
              mezzo.
            </li>
            <li>Si legge da sinistra a destra e dall’alto in basso.</li>
            <li>
              La prima parola passa dalla <strong>stella</strong>. Le altre si attaccano a quelle già posate:
              le incrociano, le allungano o ci corrono accanto.
            </li>
            <li>
              Devono esistere <strong>tutte</strong> le parole che si formano, anche quelle di due lettere di
              traverso: sopra il tabellone vedi quali sono.
            </li>
          </ul>
        </section>

        <section className="scr-aiuto__sezione">
          <h3 className="scr-aiuto__titolo">Le caselle premio</h3>
          <ul className="scr-aiuto__premi">
            {PREMI.map((p) => (
              <li key={p.classe}>
                <span className={`scr-aiuto__premio scr-aiuto__premio--${p.classe}`} />
                <span className="scr-aiuto__premio-nome">{p.nome}</span>
              </li>
            ))}
          </ul>
          <p className="scr-aiuto__nota">
            Un premio vale <strong>solo quando lo copri</strong>.
          </p>
        </section>

        <section className="scr-aiuto__sezione">
          <h3 className="scr-aiuto__titolo">Quanto vale ogni lettera</h3>
          <ul className="scr-aiuto__valori">
            {GRADINI.map((g) => (
              <li key={g.valore}>
                <span className="scr-aiuto__valore u-tabnum">{g.valore}</span>
                <span className="scr-aiuto__lettere">{g.lettere.join(' ')}</span>
              </li>
            ))}
            <li>
              <span className="scr-aiuto__valore u-tabnum">0</span>
              <span className="scr-aiuto__lettere">
                I {quanteJolly} jolly: prendono la lettera che vuoi
              </span>
            </li>
          </ul>
        </section>

        <section className="scr-aiuto__sezione">
          <h3 className="scr-aiuto__titolo">Da sapere</h3>
          <ul className="scr-aiuto__elenco">
            <li>
              Tutte e {TESSERE_LEGGIO} le tessere in una mossa: <strong>scarabeo</strong>, {BONUS_SCARABEO} punti
              in più.
            </li>
            <li>
              Contano i punti di <strong>tutte</strong> le parole che si formano.
            </li>
            <li>
              <strong>Passare e cambiare</strong> costano una mossa.
            </li>
            <li>
              Valgono anche i verbi coniugati e con i pronomi attaccati: DIMMELO, PORTARLO. Niente accenti, sigle né
              nomi propri: &ldquo;città&rdquo; si scrive CITTA.
            </li>
            <li>
              <strong>Classificata</strong>: tessere uguali per tutti. Pareggiare il computer vale{' '}
              {TETTI.scarabeo} punti in classifica, farne la metà {TETTI.scarabeo / 2}.
            </li>
            <li>
              <strong>Libera</strong>: a turni contro il computer. Non conta per la classifica.
            </li>
          </ul>
        </section>
      </div>
    </Sheet>
  )
}
