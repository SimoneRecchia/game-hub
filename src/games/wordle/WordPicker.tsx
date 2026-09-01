import type { DaySlot } from '@shared/types'
import { IconCheck, IconLock } from '@/components/Icons'
import './WordPicker.css'

interface Props {
  day: DaySlot[]
  active: number
  onPick: (slot: number) => void
  /** Chiamato quando si tocca una parola ancora chiusa. */
  onBlocked: (slot: number) => void
}

type Stato = 'vinta' | 'persa' | 'corrente' | 'aperta' | 'bloccata'

function statoDi(d: DaySlot, active: number): Stato {
  if (d.status === 'won') return 'vinta'
  if (d.status === 'lost') return 'persa'
  if (d.locked) return 'bloccata'
  return d.slot === active ? 'corrente' : 'aperta'
}

/**
 * Le cinque parole della giornata, come un percorso.
 *
 * La forma dice la regola senza spiegarla: nodi collegati da una linea, che e'
 * piena fin dove si e' arrivati e tratteggiata dopo. Le parole si aprono una per
 * volta, e un percorso e' l'unica figura che lo rende ovvio — cinque pastiglie
 * affiancate suggerivano il contrario, che si potesse scegliere.
 *
 * Nessun punteggio scritto. Prima ogni parola portava il suo massimo sotto il
 * nome: cinque numeri in fila sopra la griglia sono rumore, e chi gioca non ha
 * bisogno di sceglierli — li fa in ordine. La scala sta nel foglio informativo,
 * dove si va a cercarla una volta.
 */
export function WordPicker({ day, active, onPick, onBlocked }: Props) {
  return (
    <div className="percorso" role="tablist" aria-label="Le parole di oggi">
      {day.map((d, i) => {
        const stato = statoDi(d, active)
        const chiusa = stato === 'vinta' || stato === 'persa'
        return (
          <div className="percorso__tappa" key={d.slot}>
            {/* Il tratto verso la tappa precedente: pieno se quella e' chiusa. */}
            {i > 0 && (
              <span
                className={`percorso__tratto${
                  day[i - 1].status === 'won' || day[i - 1].status === 'lost'
                    ? ' is-percorsa'
                    : ''
                }`}
                aria-hidden="true"
              />
            )}
            <button
              type="button"
              role="tab"
              aria-selected={d.slot === active}
              /*
               * Nessun `aria-disabled`: una parola chiusa non e' un controllo
               * disabilitato, e' un controllo che spiega una precondizione.
               * Marcandola disabilitata il tocco non arrivava piu' — verificato,
               * il browser lo scartava — e chi usa uno screen reader sentiva
               * "non disponibile" invece del motivo. Lo stato sta nell'etichetta.
               */
              aria-label={
                (d.slot === 1 ? 'Parola del giorno' : `${d.slot}ª parola`) +
                (stato === 'bloccata'
                  ? ', ancora chiusa'
                  : stato === 'vinta'
                    ? ', indovinata'
                    : stato === 'persa'
                      ? ', non indovinata'
                      : '')
              }
              /*
               * `is-attiva` sta accanto allo stato, non al suo posto: guardando
               * una parola già chiusa nessun nodo risultava "sei qui", e la
               * posizione nel percorso diventava ambigua. Il colore dice com'e'
               * andata, l'anello dice dove sei.
               */
              className={`nodo nodo--${stato}${d.slot === active ? ' is-attiva' : ''}`}
              onClick={() => (stato === 'bloccata' ? onBlocked(d.slot) : onPick(d.slot))}
            >
              {stato === 'bloccata' ? (
                <IconLock size={13} />
              ) : chiusa ? (
                <IconCheck size={15} />
              ) : (
                <span className="nodo__numero">{d.slot}</span>
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}
