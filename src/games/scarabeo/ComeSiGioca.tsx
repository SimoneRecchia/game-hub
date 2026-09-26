import { Sheet } from '@/components/Sheet'
import {
  BONUS_SCARABEO,
  DISTRIBUZIONE,
  JOLLY,
  MOSSE_PER_GIORNATA,
  TESSERE_LEGGIO,
  TESSERE_TOTALI,
  VALORI,
} from '@shared/scarabeo'
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
  { classe: 'tp', nome: 'Parola tripla', quante: 8 },
  { classe: 'dp', nome: 'Parola doppia', quante: 17 },
  { classe: 'tl', nome: 'Lettera tripla', quante: 12 },
  { classe: 'dl', nome: 'Lettera doppia', quante: 24 },
] as const

export function ComeSiGiocaScarabeo({ open, onClose }: { open: boolean; onClose: () => void }) {
  const quanteJolly = DISTRIBUZIONE.find(([l]) => l === JOLLY)?.[1] ?? 0

  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="scr-aiuto">
        <p className="scr-aiuto__lede">
          Hai <strong>{MOSSE_PER_GIORNATA} mosse</strong> per fare più punti che puoi. Le{' '}
          {TESSERE_TOTALI} tessere escono dal sacchetto nello{' '}
          <strong>stesso ordine per tutti</strong>: chi gioca oggi ha la tua stessa mano, quindi i
          punteggi si confrontano davvero.
        </p>

        <section className="scr-aiuto__sezione">
          <h3 className="scr-aiuto__titolo">Posare una parola</h3>
          <ol className="scr-aiuto__passi">
            <li>
              Tocca una casella: compare il cursore. <strong>Toccala di nuovo</strong> per scrivere
              verso il basso invece che verso destra.
            </li>
            <li>Tocca le tessere del leggio: si posano una dopo l&rsquo;altra.</li>
            <li>
              Hai sbagliato? Tocca la tessera sul tabellone e <strong>torna in mano</strong>.
            </li>
            <li>
              La prima parola passa dalla <strong>casella centrale</strong>; le altre devono
              attaccarsi a quel che c&rsquo;è già.
            </li>
          </ol>
        </section>

        <section className="scr-aiuto__sezione">
          <h3 className="scr-aiuto__titolo">Le caselle premio</h3>
          <ul className="scr-aiuto__premi">
            {PREMI.map((p) => (
              <li key={p.classe}>
                <span className={`scr-aiuto__premio scr-aiuto__premio--${p.classe}`} />
                <span className="scr-aiuto__premio-nome">{p.nome}</span>
                <span className="scr-aiuto__premio-quante u-tabnum">{p.quante}</span>
              </li>
            ))}
          </ul>
          <p className="scr-aiuto__nota">
            Un premio vale <strong>solo quando lo copri</strong>: una parola che passa su una
            tripla già usata non la riusa. La casella centrale raddoppia la prima parola.
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
              Usare tutte e {TESSERE_LEGGIO} le tessere in una mossa è <strong>scarabeo</strong>:{' '}
              {BONUS_SCARABEO} punti in più.
            </li>
            <li>
              Contano <strong>tutte</strong> le parole che si formano, anche quelle di traverso.
            </li>
            <li>
              <strong>Passare e cambiare costano una mossa</strong>, come posare: altrimenti il
              limite di {MOSSE_PER_GIORNATA} non vorrebbe dire niente. Le tessere cambiate tornano
              in fondo al sacchetto.
            </li>
            <li>
              Le parole valide sono <strong>271.055</strong> forme italiane da 2 a 15 lettere, senza
              accenti né nomi propri: chi gioca &ldquo;città&rdquo; posa C-I-T-T-A. Vengono da
              dizionari italiani pubblici (<em>napolux/paroleitaliane</em>, licenza MIT), gli stessi
              del Wordle.
            </li>
            <li>
              Le tessere sono <strong>21 lettere</strong>: niente J, K, W, X, Y.
            </li>
          </ul>
        </section>
      </div>
    </Sheet>
  )
}
