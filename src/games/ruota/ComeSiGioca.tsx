import { Sheet } from '@/components/Sheet'
import { PUNTATA_MINIMA, SPICCHI, resa, type Spicchio } from '@shared/ruota'
import '@/games/cruciverba/ComeSiGioca.css'

const quanti = (prova: (s: Spicchio) => boolean) => SPICCHI.filter(prova).length

/** Quanto restituisce la ruota ogni cento punti puntati, a chi risponde giusto a tre domande su quattro. */
const RESA = Math.round(resa(0.75) * 100)

export function ComeSiGiocaRuota({ open, onClose }: { open: boolean; onClose: () => void }) {
  const voci: Array<[string, number]> = [
    ['x2', quanti((s) => s.tipo === 'doppio')],
    ['0', quanti((s) => s.tipo === 'niente')],
    ['✕', quanti((s) => s.tipo === 'perdi')],
    ['Testa o croce', quanti((s) => s.tipo === 'moneta')],
    ['Domande', quanti((s) => s.tipo === 'domanda')],
  ]
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Punti quanto vuoi dei punti fatti oggi nelle classificate, da {PUNTATA_MINIMA} a tutti, e giri la ruota,
          quante volte vuoi.
        </p>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Gli spicchi</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              <strong>x2</strong> raddoppia la puntata.
            </li>
            <li>
              <strong>0</strong> lascia tutto com’è.
            </li>
            <li>
              <strong>✕</strong>: la puntata è persa.
            </li>
            <li>
              <strong>Testa o croce</strong>: se indovini vinci la puntata, se no la perdi.
            </li>
            <li>
              Le <strong>domande</strong> di geografia, storia, arte, libri, cinema e scienza valgono un quarto della
              puntata, in più se rispondi giusto e in meno se sbagli.
            </li>
          </ul>
          <p className="cru-aiuto__nota">Una sfida lasciata a metà conta persa.</p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Su {SPICCHI.length} spicchi</h3>
          <table className="ruota-regole">
            <tbody>
              {voci.map(([nome, n]) => (
                <tr key={nome}>
                  <td>{nome}</td>
                  <td className="u-tabnum">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="cru-aiuto__nota">
          In media la ruota restituisce {RESA} punti ogni 100 puntati. Quel che vinci o perdi va nella classifica
          generale di oggi.
        </p>
      </div>
    </Sheet>
  )
}
