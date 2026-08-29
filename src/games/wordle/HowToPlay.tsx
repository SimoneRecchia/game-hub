import { Sheet } from '@/components/Sheet'
import { Tile } from './Tile'
import './HowToPlay.css'
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

        <div className="howto__notes">
          <h3 className="howto__notes-title">Da sapere</h3>
          <ul className="howto__list">
            <li>
              La parola è la <strong>stessa per tutti</strong> e cambia a mezzanotte, ora italiana.
            </li>
            <li>
              La tastiera ha le <strong>21 lettere</strong> dell’alfabeto italiano: niente accenti,
              niente J K W X Y.
            </li>
            <li>
              Il punteggio dipende soprattutto dai <strong>tentativi usati</strong>. Chiudere in
              fretta e giocare tutti i giorni aggiungono qualche punto, ma non ribaltano mai chi ha
              indovinato prima.
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
