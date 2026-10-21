import { Sheet } from '@/components/Sheet'
import { PUNTATA_MINIMA_RL, resaRoulette } from '@shared/roulette'
import { POSTI_RL, PUNTATE_RL_MS } from '@shared/roulette-tavolo'
import '@/games/cruciverba/ComeSiGioca.css'

const RESA = Math.round(resaRoulette() * 1000) / 10

/** Le puntate del panno, con quel che pagano: dalla piu' rischiosa. */
const PUNTATE: ReadonlyArray<[string, string, string]> = [
  ['Pieno', 'un numero, sul numero', '35 a 1'],
  ['Cavallo', 'due numeri vicini, sulla riga fra i due', '17 a 1'],
  ['Terzina', 'una riga di tre, sul bordo di fuori', '11 a 1'],
  ['Carré', 'quattro numeri, sull’incrocio', '8 a 1'],
  ['Sestina', 'due righe, sul bordo di fuori fra le due', '5 a 1'],
  ['Dozzina e colonna', 'dodici numeri', '2 a 1'],
  ['Rosso, nero, pari, dispari, 1–18, 19–36', 'diciotto numeri', '1 a 1'],
]

export function ComeSiGiocaRoulette({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">
          Scegli una fiche, toccala sul panno, e lancia: la biglia gira e si ferma su un numero dallo 0 al 36. Si
          punta da {PUNTATA_MINIMA_RL} punto a tutto il saldo, su quante puntate vuoi.
        </p>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Le puntate</h3>
          <ul className="cru-aiuto__elenco">
            {PUNTATE.map(([nome, dove, paga]) => (
              <li key={nome}>
                <strong>{nome}</strong>: {dove}. Paga {paga}.
              </li>
            ))}
          </ul>
          <p className="cru-aiuto__testo">
            Una puntata vinta ti ridà la fiche e quel che paga: un pieno da 1 ne ridà 36. Tenendo il dito sul panno si
            accendono i numeri che la puntata copre; lasciando si posa la fiche.
          </p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Lo zero</h3>
          <p className="cru-aiuto__testo">
            Lo zero non è né rosso né nero, né pari né dispari: quando esce pagano solo le puntate che lo comprendono,
            e quelle semplici no. È la roulette europea, con uno zero solo.
          </p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Al tavolo</h3>
          <p className="cru-aiuto__testo">
            Fino a {POSTI_RL} giocatori, con una biglia per tutti: gli amici online si siedono al tuo tavolo. Dopo
            la prima puntata gli altri hanno {PUNTATE_RL_MS / 1000} secondi per la loro, poi rien ne va plus.
          </p>
        </section>

        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Quanto torna</h3>
          <p className="cru-aiuto__testo">
            In media ogni puntata ti torna il {String(RESA).replace('.', ',')}% di quel che punti, come agli altri
            giochi della Fortuna.
          </p>
        </section>
      </div>
    </Sheet>
  )
}
