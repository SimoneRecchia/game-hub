import { Sheet } from '@/components/Sheet'
import {
  CATEGORIE_RUOTA,
  FORTUNATO,
  MOLTIPLICATORE_FISSO,
  MOLTIPLICATORI_MONETA,
  MOLTIPLICATORI_MONETA_FORTUNATA,
  MOLTIPLICATORI_PACHINKO,
  MOLTIPLICATORI_PACHINKO_FORTUNATI,
  MOLTIPLICATORI_QUIZ,
  MURO_CASH_HUNT,
  MURO_CASH_HUNT_FORTUNATO,
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
  ...(['banco', 'split', 'quiz', 'moneta', 'pachinko', 'cashhunt', 'fortuna'] as const).map((tipo) => ({
    nome: nomeDi({ tipo }),
    chiave: tipo,
  })),
  ...[1.5, 3, 5, 10].map((m) => ({ nome: scriviMoltiplicatore(m), chiave: scriviMoltiplicatore(m) })),
]
const quanti = (spicchi: readonly Spicchio[], k: string) => spicchi.filter((s) => chiave(s) === k).length

const elenco = (xs: readonly number[]) => xs.map(scriviMoltiplicatore).join(', ')

/** Le buche del Pachinko da un lato al mezzo: sono le stesse dall'altro lato. "1ª e 9ª", fino alla "5ª". */
const N_BUCHE = MOLTIPLICATORI_PACHINKO.length
const BUCHE = MOLTIPLICATORI_PACHINKO.slice(0, Math.ceil(N_BUCHE / 2)).map((m, k) => ({
  nome: k === N_BUCHE - 1 - k ? `${k + 1}ª` : `${k + 1}ª e ${N_BUCHE - k}ª`,
  m,
  fortunato: MOLTIPLICATORI_PACHINKO_FORTUNATI[k],
}))

/** Le caselle del Cash Hunt, dal moltiplicatore piu' piccolo, con quante sono. */
const CASELLE = [...new Set(MURO_CASH_HUNT)]
  .sort((a, b) => a - b)
  .map((m) => ({
    m,
    quante: MURO_CASH_HUNT.filter((x) => x === m).length,
    fortunato: MURO_CASH_HUNT_FORTUNATO[MURO_CASH_HUNT.indexOf(m)],
  }))

export function ComeSiGiocaRuota({ open, onClose }: { open: boolean; onClose: () => void }) {
  const valori = [...new Set(MOLTIPLICATORI_QUIZ)].sort((a, b) => a - b)
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Punti quanto vuoi dei punti fatti oggi nelle classificate, da {PUNTATA_MINIMA} a tutti, e giri la ruota
          trascinandola col dito. La puntata la paghi al lancio, e quel che esce dice quanto ti torna.
        </p>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Gli spicchi</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              <strong>Banco</strong>: la puntata resta al banco, e si rigira.
            </li>
            <li>
              <strong>Split</strong>: torna metà della puntata, subito.
            </li>
            <li>
              <strong>{nomeDi(SPICCHI_RUOTA[0])}</strong>: la puntata torna per {MOLTIPLICATORE_FISSO}, subito.
            </li>
            <li>
              <strong>Quiz</strong>: giri la ruota del quiz, che si ferma su una categoria con il suo moltiplicatore, e
              rispondi: se è giusta vinci la puntata per il moltiplicatore, se no non paga.
            </li>
            <li>
              <strong>Moneta</strong>: il blu porta un moltiplicatore a caso fra {elenco(MOLTIPLICATORI_MONETA)}. Tocchi
              la moneta e la lanci: blu vinci, rosso non paga.
            </li>
            <li>
              <strong>Pachinko</strong>: lanci la pallina, che cade fra i pioli in una delle nove buche: vinci la
              puntata per il suo moltiplicatore.
            </li>
            <li>
              <strong>Cash Hunt</strong>: dodici caselle si coprono e si mescolano. Ne scegli una, e vinci la puntata
              per il moltiplicatore che c’è sotto.
            </li>
            <li>
              <strong>Fortuna</strong>: la ruota diventa la ruota fortunata, e la rigiri con la stessa puntata.
            </li>
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La ruota fortunata</h3>
          <p className="ruota-regole__testo">
            Gli stessi spicchi, con i premi saliti: il triplo diventa ×10, la fortuna ×5, gli split ×1,5, due banchi ×3
            e uno quiz. Il quiz arriva fino al ×10, la moneta porta {elenco(MOLTIPLICATORI_MONETA_FORTUNATA)}, e i
            premi del Pachinko e del Cash Hunt salgono.
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
          <h3 className="cru-aiuto__titolo">Il Pachinko</h3>
          <p className="ruota-regole__testo">Nove buche: le più ricche ai lati, la più facile in mezzo.</p>
          <table className="ruota-regole">
            <thead>
              <tr>
                <th>Buca</th>
                <th>Ruota</th>
                <th>Fortunata</th>
              </tr>
            </thead>
            <tbody>
              {BUCHE.map(({ nome, m, fortunato }) => (
                <tr key={nome}>
                  <td>{nome}</td>
                  <td>{scriviMoltiplicatore(m)}</td>
                  <td>{scriviMoltiplicatore(fortunato)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Il Cash Hunt</h3>
          <table className="ruota-regole">
            <thead>
              <tr>
                <th>Caselle</th>
                <th>Ruota</th>
                <th>Fortunata</th>
              </tr>
            </thead>
            <tbody>
              {CASELLE.map(({ m, quante, fortunato }) => (
                <tr key={m}>
                  <td className="u-tabnum">{quante}</td>
                  <td>{scriviMoltiplicatore(m)}</td>
                  <td>{scriviMoltiplicatore(fortunato)}</td>
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
          Rispondendo sempre giusto, in media torna il {RESA}% di quel che punti. I punti della ruota contano nella
          classifica generale di oggi.
        </p>
      </div>
    </Sheet>
  )
}
