import { Sheet } from '@/components/Sheet'
import { Tile } from './Tile'
import './HowToPlay.css'
import { MAX_ATTEMPTS } from '@shared/config'
import { ATTEMPT_POINTS, LOSS_POINTS, MAX_SPEED_BONUS, MAX_STREAK_BONUS } from '@shared/scoring'
import type { TileState } from '@shared/types'

interface Row {
  word: string
  pattern: (TileState | null)[]
  text: string
}

const EXAMPLES: Row[] = [
  {
    word: 'porta',
    pattern: ['correct', null, null, null, null],
    text: 'La P è nella parola e al posto giusto.',
  },
  {
    word: 'verde',
    pattern: [null, null, 'present', null, null],
    text: 'La R è nella parola, ma in un altro punto.',
  },
  {
    word: 'salto',
    pattern: [null, null, null, 'absent', null],
    text: 'La T non c’è da nessuna parte.',
  },
]

export function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="howto">
        <p className="howto__text">
          Indovina la parola italiana di <strong>cinque lettere</strong> in{' '}
          <strong>sei tentativi</strong>. Dopo ogni tentativo i colori dicono quanto ti sei
          avvicinato.
        </p>

        <ul className="howto__examples">
          {EXAMPLES.map((row) => (
            <li className="howto__example" key={row.word}>
              <div className="howto__row">
                {[...row.word].map((letter, i) => (
                  <Tile key={i} index={i} letter={letter} state={row.pattern[i]} />
                ))}
              </div>
              <p className="howto__caption">{row.text}</p>
            </li>
          ))}
        </ul>

        <Punteggi />

        <div className="howto__notes">
          <h3 className="howto__notes-title">Da sapere</h3>
          <ul className="howto__list">
            <li>
              La parola è <strong>una al giorno, la stessa per tutti</strong>, e cambia a
              mezzanotte, ora italiana.
            </li>
            <li>
              La tastiera ha le <strong>21 lettere</strong> dell’alfabeto italiano: niente accenti,
              niente J K W X Y.
            </li>
            <li>
              Puoi <strong>invitare fino a cinque persone</strong> sulla parola del giorno: vedono
              la griglia in diretta e possono suggerirti una parola, ma decidi sempre tu cosa
              giocare.
            </li>
            <li>
              Chi gioca la parola con te prende il <strong>tuo stesso punteggio</strong>. Giocare in
              compagnia non vale meno che giocare da soli; solo, a pari punti in classifica passa
              avanti chi ne ha fatti meno in compagnia.
            </li>
            <li>
              La parola vale al massimo <strong>cento punti</strong>, come la classificata di ogni
              altro gioco: è quel che permette di sommarle nella classifica generale.
            </li>
            <li>
              Nella <strong>parola libera</strong> la parola è a caso, e se ne gioca quante se ne
              vuole: non conta per la classifica, e non pesca mai fra le parole dei prossimi giorni.
            </li>
            <li>
              Le parole arrivano da dizionari italiani pubblici, filtrate per tenere solo quelle di
              uso comune.
            </li>
          </ul>
        </div>
      </div>
    </Sheet>
  )
}

/**
 * Come si contano i punti.
 *
 * La tabella si genera dalle costanti invece di essere scritta a mano: e' l'unico
 * modo perché non racconti una scala diversa da quella che il server applica.
 */
function Punteggi() {
  const tentativi = Array.from({ length: MAX_ATTEMPTS }, (_, i) => i + 1)

  return (
    <div className="howto__punti">
      <h3 className="howto__notes-title">Come si contano i punti</h3>
      <p className="howto__text">
        Meno tentativi, più punti. Anche al sesto la parola vale metà di una indovinata al primo
        colpo: una giornata storta si recupera il giorno dopo.
      </p>

      <div className="howto__tabella-scroll">
        <table className="howto__tabella">
          <thead>
            <tr>
              <th scope="col">
                <span className="howto__th-parola">Tentativi</span>
              </th>
              {tentativi.map((t) => (
                <th scope="col" key={t}>
                  {t}
                </th>
              ))}
              <th scope="col" className="howto__th-persa">
                ✗
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Punti</th>
              {tentativi.map((t) => (
                <td key={t} className="u-tabnum">
                  {ATTEMPT_POINTS[t - 1]}
                </td>
              ))}
              <td className="u-tabnum howto__td-persa">{LOSS_POINTS}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="howto__nota">
        La colonna <strong>✗</strong> è la parola giocata e non indovinata: meglio di non giocarla.
        Si aggiungono fino a {MAX_SPEED_BONUS} punto se chiudi in fretta e fino a {MAX_STREAK_BONUS}{' '}
        per i giorni di fila: servono da spareggio, e restano sotto la differenza fra due tentativi.
      </p>
    </div>
  )
}
