import { IconAiuto, IconAnnulla, IconBackspace, IconMatita } from '@/components/Icons'
import './Tastierino.css'

/**
 * Sotto la griglia: gli strumenti — annulla, cancella, note, aiuti — e le nove
 * cifre. Una cifra scritta nove volte si spegne: non serve piu'. Con le note
 * accese le cifre diventano piccole e grigie, come a matita, e il bottone delle
 * note resta acceso: si vede sempre in che modo si scrive.
 */
export function Tastierino({
  conteggi,
  modoNote,
  puoAnnullare,
  onCifra,
  onCancella,
  onAnnulla,
  onNote,
  onAiuti,
}: {
  conteggi: number[]
  modoNote: boolean
  puoAnnullare: boolean
  onCifra: (d: number) => void
  onCancella: () => void
  onAnnulla: () => void
  onNote: () => void
  /** Senza, gli aiuti non ci sono: nelle sfide fra amici. Il bottone resta, spento, perché il tastierino non cambi. */
  onAiuti?: () => void
}) {
  return (
    <div className={`sud-tastierino${modoNote ? ' is-note' : ''}`}>
      <div className="sud-strumenti">
        <button type="button" className="sud-strumento" onClick={onAnnulla} disabled={!puoAnnullare} aria-label="Annulla">
          <IconAnnulla size={22} />
          <span className="sud-strumento__nome">Annulla</span>
        </button>
        <button type="button" className="sud-strumento" onClick={onCancella} aria-label="Cancella">
          <IconBackspace size={22} />
          <span className="sud-strumento__nome">Cancella</span>
        </button>
        <button
          type="button"
          className={`sud-strumento${modoNote ? ' is-acceso' : ''}`}
          onClick={onNote}
          aria-pressed={modoNote}
          aria-label="Note"
        >
          <span className="sud-strumento__icona" aria-hidden="true">
            <IconMatita size={22} />
            <span className="sud-strumento__stato">{modoNote ? 'sì' : 'no'}</span>
          </span>
          <span className="sud-strumento__nome">Note</span>
        </button>
        <button type="button" className="sud-strumento" onClick={onAiuti} disabled={!onAiuti} aria-label="Aiuti">
          <IconAiuto size={22} />
          <span className="sud-strumento__nome">Aiuti</span>
        </button>
      </div>
      <div className="sud-cifre" role="group" aria-label={modoNote ? 'Note' : 'Cifre'}>
        {Array.from({ length: 9 }, (_, i) => {
          const d = i + 1
          const finita = conteggi[d] >= 9
          return (
            <button
              key={d}
              type="button"
              className={`sud-cifra${finita ? ' is-finita' : ''}`}
              onClick={() => onCifra(d)}
              disabled={finita && !modoNote}
              aria-label={modoNote ? `Nota ${d}` : `${d}`}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}
