import { Sheet } from '@/components/Sheet'
import { JOLLY, VALORI } from '@shared/scarabeo'
import './Leggio.css'

interface Props {
  mano: string[]
  /** Indici già posati sul tabellone: restano visibili ma spenti. */
  impegnate: Set<number>
  /** Modo cambio: toccare una tessera la seleziona invece di posarla. */
  cambio: boolean
  selezione: Set<number>
  bloccato: boolean
  onUsa: (indice: number) => void
}

/**
 * Il leggio.
 *
 * Le tessere impegnate non sparoscono: restano al loro posto, spente. Sparendo,
 * le altre slitterebbero sotto il dito mentre si compone una parola — e chi sta
 * scrivendo "quantile" toccherebbe la tessera sbagliata al terzo tocco.
 */
export function Leggio({ mano, impegnate, cambio, selezione, bloccato, onUsa }: Props) {
  return (
    <div className="leggio" role="group" aria-label="Le tue tessere">
      {mano.map((tessera, i) => {
        const usata = impegnate.has(i)
        const scelta = selezione.has(i)
        const jolly = tessera === JOLLY
        return (
          <button
            type="button"
            key={`${tessera}-${i}`}
            className={`tessera${usata ? ' is-usata' : ''}${scelta ? ' is-scelta' : ''}${
              jolly ? ' tessera--jolly' : ''
            }`}
            disabled={bloccato || (usata && !cambio)}
            aria-pressed={cambio ? scelta : undefined}
            aria-label={
              jolly ? 'Jolly, vale zero e prende la lettera che vuoi' : tessera.toUpperCase()
            }
            onClick={() => onUsa(i)}
          >
            <span className="tessera__lettera">{jolly ? '★' : tessera.toUpperCase()}</span>
            <span className="tessera__valore" aria-hidden="true">
              {jolly ? 0 : VALORI[tessera]}
            </span>
          </button>
        )
      })}
      {mano.length === 0 && <p className="leggio__vuoto">Sacchetto e leggio vuoti.</p>}
    </div>
  )
}

/** Le 21 lettere, per dare un valore al jolly appena posato. */
export function ScegliJolly({
  aperto,
  onScegli,
  onChiudi,
}: {
  aperto: boolean
  onScegli: (lettera: string) => void
  onChiudi: () => void
}) {
  return (
    <Sheet open={aperto} onClose={onChiudi} title="Che lettera è?">
      <p className="jolly__lede">
        Il jolly prende la lettera che scegli e <strong>vale zero punti</strong>. Sul tabellone
        resta un jolly: la lettera conta per la parola, non per il punteggio.
      </p>
      <div className="jolly__griglia">
        {Object.keys(VALORI).map((lettera) => (
          <button
            type="button"
            key={lettera}
            className="tessera tessera--scelta-jolly"
            onClick={() => onScegli(lettera)}
          >
            <span className="tessera__lettera">{lettera.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
