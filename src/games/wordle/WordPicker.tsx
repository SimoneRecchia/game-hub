import type { DaySlot } from '@shared/types'
import { IconCheck } from '@/components/Icons'
import './WordPicker.css'

interface Props {
  day: DaySlot[]
  active: number
  onPick: (slot: number) => void
}

/**
 * Le cinque parole della giornata.
 *
 * La gerarchia si vede da tre cose insieme, non da un'etichetta: la prima
 * casella e' piu' larga e porta il nome, le altre solo il numero; sotto ognuna
 * c'e' quanto vale al massimo; e le chiuse mostrano i punti fatti invece del
 * massimo. Senza il "quanto vale", nessuno capirebbe perché la terza dovrebbe
 * interessargli meno della prima.
 */
export function WordPicker({ day, active, onPick }: Props) {
  return (
    <div className="parole" role="tablist" aria-label="Le parole di oggi">
      {day.map((d) => {
        const chiusa = d.status === 'won' || d.status === 'lost'
        const stato = chiusa ? (d.status === 'won' ? 'vinta' : 'persa') : d.status
        return (
          <button
            key={d.slot}
            type="button"
            role="tab"
            aria-selected={d.slot === active}
            aria-label={
              d.slot === 1 ? 'Parola del giorno' : `${d.slot}ª parola, vale fino a ${d.maxScore}`
            }
            className={`parola parola--${stato}${d.slot === active ? ' is-attiva' : ''}${
              d.slot === 1 ? ' parola--principale' : ''
            }`}
            onClick={() => onPick(d.slot)}
          >
            <span className="parola__testa">
              {/* Due etichette per la principale: su schermi bassi la barra passa
                  a una riga sola e "Del giorno" non ci sta accanto al numero. */}
              {d.slot === 1 ? (
                <>
                  <span className="parola__lunga">Del giorno</span>
                  <span className="parola__corta">Oggi</span>
                </>
              ) : (
                `${d.slot}ª`
              )}
              {d.status === 'won' && <IconCheck size={11} />}
            </span>
            <span className="parola__punti u-tabnum">
              {chiusa ? `+${d.score ?? 0}` : d.maxScore}
            </span>
          </button>
        )
      })}
    </div>
  )
}
