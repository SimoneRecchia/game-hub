import { Sheet } from '@/components/Sheet'
import {
  MOLTIPLICATORI,
  MOLTIPLICATORI_MONETA,
  PUNTATA_MINIMA,
  SPICCHI,
  resa,
  scriviMoltiplicatore,
  type Spicchio,
} from '@shared/ruota'
import '@/games/cruciverba/ComeSiGioca.css'

const quanti = (prova: (s: Spicchio) => boolean) => SPICCHI.filter(prova).length

/** Quanto restituisce la ruota ogni cento punti puntati a chi risponde sempre giusto: di piu' non si puo'. */
const RESA = Math.round(resa(1) * 100)

export function ComeSiGiocaRuota({ open, onClose }: { open: boolean; onClose: () => void }) {
  const spicchi: Array<[string, number]> = [
    ['Banco', quanti((s) => s.tipo === 'banco')],
    ['Domande', quanti((s) => s.tipo === 'domanda')],
    ['Moneta', quanti((s) => s.tipo === 'moneta')],
  ]
  const valori = [...new Set(MOLTIPLICATORI)].sort((a, b) => a - b)
  const moneta = MOLTIPLICATORI_MONETA.map(scriviMoltiplicatore).join(', ')
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
              <strong>Banco</strong>: vince il banco.
            </li>
            <li>
              <strong>Domanda</strong> di geografia, storia, arte, libri, cinema o scienza: giri la ruota dei
              moltiplicatori, poi rispondi. Se rispondi giusto vinci la puntata per il moltiplicatore, se sbagli vince
              il banco.
            </li>
            <li>
              <strong>Moneta</strong>: il blu porta un moltiplicatore a caso fra {moneta}. Tocchi la moneta e la
              lanci: blu vinci la puntata per il moltiplicatore, rosso vince il banco.
            </li>
          </ul>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Su {SPICCHI.length} spicchi</h3>
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
