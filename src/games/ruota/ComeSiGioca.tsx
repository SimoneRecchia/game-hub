import { Sheet } from '@/components/Sheet'
import {
  CATEGORIE_RUOTA,
  FORTUNATO,
  MOLTIPLICATORE_FISSO,
  MOLTIPLICATORI_MONETA,
  MOLTIPLICATORI_MONETA_FORTUNATA,
  MOLTIPLICATORI_QUIZ,
  PUNTATA_MINIMA,
  SPICCHI_FORTUNATI,
  SPICCHI_QUIZ,
  SPICCHI_RUOTA,
  etichettaDi,
  nomeDi,
  resa,
  scriviMoltiplicatore,
  type Spicchio,
} from '@shared/ruota'
import '@/games/cruciverba/ComeSiGioca.css'

/** Quanto restituisce la ruota ogni cento punti puntati a chi risponde sempre giusto: di piu' non si puo'. */
const RESA = Math.round(resa(1) * 100)

/** Gli spicchi delle due ruote, contati: una riga per specie, nell'ordine in cui si leggono le regole. */
const chiave = (s: Spicchio) => (s.tipo === 'fisso' ? etichettaDi(s) : s.tipo)
const SPECIE: Array<{ nome: string; chiave: string }> = [
  { nome: 'Banco', chiave: 'banco' },
  { nome: 'Quiz', chiave: 'quiz' },
  { nome: 'Moneta', chiave: 'moneta' },
  { nome: 'Fortuna', chiave: 'fortuna' },
  ...[3, 5, 10].map((m) => ({ nome: scriviMoltiplicatore(m), chiave: scriviMoltiplicatore(m) })),
]
const quanti = (spicchi: readonly Spicchio[], k: string) => spicchi.filter((s) => chiave(s) === k).length

const elenco = (xs: readonly number[]) => xs.map(scriviMoltiplicatore).join(', ')

export function ComeSiGiocaRuota({ open, onClose }: { open: boolean; onClose: () => void }) {
  const valori = [...new Set(MOLTIPLICATORI_QUIZ)].sort((a, b) => a - b)
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Punti quanto vuoi dei punti fatti oggi nelle classificate, da {PUNTATA_MINIMA} a tutti, e giri la ruota
          trascinandola col dito. La puntata la paghi subito: quel che esce te la restituisce moltiplicata, o se la
          tiene il banco.
        </p>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Gli spicchi</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              <strong>Banco</strong>: vince il banco, e la puntata è persa.
            </li>
            <li>
              <strong>{nomeDi(SPICCHI_RUOTA[0])}</strong>: la puntata torna per {MOLTIPLICATORE_FISSO}, subito.
            </li>
            <li>
              <strong>Quiz</strong>: giri la ruota del quiz, che si ferma su una categoria con il suo moltiplicatore, e
              rispondi. Giusto vinci la puntata per il moltiplicatore, sbagliato la perdi tutta.
            </li>
            <li>
              <strong>Moneta</strong>: il blu porta un moltiplicatore a caso fra {elenco(MOLTIPLICATORI_MONETA)}. Tocchi
              la moneta e la lanci: blu vinci, rosso vince il banco.
            </li>
            <li>
              <strong>Fortuna</strong>: la ruota diventa la ruota fortunata, e la rigiri con la stessa puntata.
            </li>
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La ruota fortunata</h3>
          <p className="ruota-regole__testo">
            Gli stessi spicchi, con i premi saliti: il triplo diventa ×10 e la fortuna ×5, due banchi diventano ×3 e tre
            diventano quiz. Il quiz arriva fino al ×10, e la moneta porta {elenco(MOLTIPLICATORI_MONETA_FORTUNATA)}.
          </p>
          <table className="ruota-regole">
            <thead>
              <tr>
                <th>Su {SPICCHI_RUOTA.length} spicchi</th>
                <th>Ruota</th>
                <th>Fortunata</th>
              </tr>
            </thead>
            <tbody>
              {SPECIE.map(({ nome, chiave: k }) => (
                <tr key={k}>
                  <td>{nome}</td>
                  <td className="u-tabnum">{quanti(SPICCHI_RUOTA, k) || '–'}</td>
                  <td className="u-tabnum">{quanti(SPICCHI_FORTUNATI, k) || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La ruota del quiz</h3>
          <p className="ruota-regole__testo">
            Dodici spicchi: a ogni giro {SPICCHI_QUIZ} categorie fra le {CATEGORIE_RUOTA.length} del quiz, ognuna con un
            moltiplicatore.
          </p>
          <table className="ruota-regole">
            <thead>
              <tr>
                <th>Moltiplicatore</th>
                <th>Spicchi</th>
                <th>Fortunata</th>
              </tr>
            </thead>
            <tbody>
              {valori.map((m) => (
                <tr key={m}>
                  <td>{scriviMoltiplicatore(m)}</td>
                  <td className="u-tabnum">{MOLTIPLICATORI_QUIZ.filter((x) => x === m).length}</td>
                  <td>{scriviMoltiplicatore(FORTUNATO[String(m)])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="cru-aiuto__nota">
          Anche rispondendo sempre giusto, in media la ruota restituisce {RESA} punti ogni 100 puntati. Quel che vinci
          o perdi va nella classifica generale di oggi.
        </p>
      </div>
    </Sheet>
  )
}
