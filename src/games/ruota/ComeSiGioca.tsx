import { Sheet } from '@/components/Sheet'
import { PUNTATA_MINIMA, SPICCHI, eSfida, type Spicchio } from '@shared/ruota'
import '@/games/cruciverba/ComeSiGioca.css'

const quanti = (prova: (s: Spicchio) => boolean) => SPICCHI.filter(prova).length

export function ComeSiGiocaRuota({ open, onClose }: { open: boolean; onClose: () => void }) {
  const poste = SPICCHI.flatMap((s) => (eSfida(s) ? [s.posta] : []))
  const voci: Array<[string, number]> = [
    ['x2', quanti((s) => s.tipo === 'doppio')],
    ['Niente', quanti((s) => s.tipo === 'niente')],
    ['Testa o croce', quanti((s) => s.tipo === 'moneta')],
    ['Domande', quanti((s) => s.tipo === 'domanda')],
  ]
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Una volta al giorno punti una parte dei punti fatti oggi nelle classificate, da {PUNTATA_MINIMA} a tutti, e
          giri la ruota.
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
              <strong>Testa o croce</strong> e le <strong>domande</strong> di geografia, storia, arte, libri, cinema e
              scienza: il numero sullo spicchio, da {Math.min(...poste)} a {Math.max(...poste)}, è quanto vinci se va
              bene e quanto perdi se va male. Lasciate a metà contano perse.
            </li>
          </ul>
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

        <p className="cru-aiuto__nota">Quel che vinci o perdi va nella classifica generale di oggi.</p>
      </div>
    </Sheet>
  )
}
