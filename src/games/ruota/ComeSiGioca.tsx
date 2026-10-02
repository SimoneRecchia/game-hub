import { Sheet } from '@/components/Sheet'
import { NOMI_CATEGORIE } from '@shared/quiz'
import {
  FORMA_RUOTA,
  MOLTIPLICATORE_FISSO,
  MOLTIPLICATORI,
  MOLTIPLICATORI_MONETA,
  PUNTATA_MINIMA,
  categorieDelGiorno,
  resa,
  scriviMoltiplicatore,
  type TipoSpicchio,
} from '@shared/ruota'
import '@/games/cruciverba/ComeSiGioca.css'

const quanti = (tipo: TipoSpicchio) => FORMA_RUOTA.filter((t) => t === tipo).length

/** Quanto restituisce la ruota ogni cento punti puntati a chi risponde sempre giusto: di piu' non si puo'. */
const RESA = Math.round(resa(1) * 100)

export function ComeSiGiocaRuota({ open, onClose, numero }: { open: boolean; onClose: () => void; numero: number }) {
  const spicchi: Array<[string, number]> = [
    ['Banco', quanti('banco')],
    ['Domande', quanti('domanda')],
    ['Moneta', quanti('moneta')],
    ['Triplo', quanti('fisso')],
  ]
  const valori = [...new Set(MOLTIPLICATORI)].sort((a, b) => a - b)
  const moneta = MOLTIPLICATORI_MONETA.map(scriviMoltiplicatore).join(', ')
  const oggi = categorieDelGiorno(numero).map((c) => NOMI_CATEGORIE[c])
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
              <strong>Triplo</strong>: la puntata torna per {MOLTIPLICATORE_FISSO}, subito.
            </li>
            <li>
              <strong>Domanda</strong>: una categoria del quiz, che cambia ogni giorno. Giri la ruota dei
              moltiplicatori, poi rispondi: giusto vinci la puntata per il moltiplicatore, sbagliato perdi tutta la
              puntata. Oggi: {oggi.join(', ')}.
            </li>
            <li>
              <strong>Moneta</strong>: il blu porta un moltiplicatore a caso fra {moneta}. Tocchi la moneta e la
              lanci: blu vinci la puntata per il moltiplicatore, rosso vince il banco.
            </li>
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Su {FORMA_RUOTA.length} spicchi</h3>
          <table className="ruota-regole">
            <tbody>
              {spicchi.map(([nome, n]) => (
                <tr key={nome}>
                  <td>{nome}</td>
                  <td className="u-tabnum">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">La ruota dei moltiplicatori</h3>
          <table className="ruota-regole">
            <tbody>
              {valori.map((m) => (
                <tr key={m}>
                  <td>{scriviMoltiplicatore(m)}</td>
                  <td className="u-tabnum">
                    {MOLTIPLICATORI.filter((x) => x === m).length} su {MOLTIPLICATORI.length}
                  </td>
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
