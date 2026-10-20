import { Button } from '@/components/Button'
import { Sheet } from '@/components/Sheet'
import { Tile } from './Tile'
import './HowToPlay.css'
import { MAX_ATTEMPTS, MAX_COOP_GUESTS } from '@shared/config'
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
    text: 'La P è al posto giusto.',
  },
  {
    word: 'verde',
    pattern: [null, null, 'present', null, null],
    text: 'La R c’è, ma in un altro posto.',
  },
  {
    word: 'salto',
    pattern: [null, null, null, 'absent', null],
    text: 'La T non c’è.',
  },
]

export function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="howto">
        <p className="howto__text">
          Indovina la parola di <strong>cinque lettere</strong> in <strong>sei tentativi</strong>.
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
              <strong>Classificata</strong>: una parola al giorno, uguale per tutti.
            </li>
            <li>
              <strong>Libera</strong>: parole a caso, quante vuoi. Non conta per la classifica.
            </li>
            <li>
              <strong>In compagnia</strong>: inviti fino a {MAX_COOP_GUESTS} persone a suggerirti parole.
              Chi gioca con te prende il tuo stesso punteggio.
            </li>
            <li>Niente accenti, niente J K W X Y.</li>
          </ul>
        </div>

        <Button size="lg" fullWidth onClick={onClose}>
          Ho capito
        </Button>
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
      <h3 className="howto__notes-title">Punteggio</h3>
      <p className="howto__text">Meno tentativi, più punti.</p>

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
        <strong>✗</strong> è la parola non indovinata. Bonus: fino a {MAX_SPEED_BONUS} punto se indovini in
        fretta, fino a {MAX_STREAK_BONUS} per i giorni di fila.
      </p>
    </div>
  )
}
