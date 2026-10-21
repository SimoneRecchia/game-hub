import type { ReactNode } from 'react'

/**
 * Sotto la griglia, a schema risolto: il timbro con quel che si e' fatto, com'e'
 * andata e cosa fare adesso. Il timbro, toccato, riapre la carta della fine.
 */
export function FineSudoku({
  titolo,
  valore,
  timbro,
  dettaglio,
  azioni,
  piede,
  onRiepilogo,
}: {
  titolo: string
  /** Per chi legge lo schermo: quel che dice il timbro, per intero. */
  valore: string
  timbro: ReactNode
  dettaglio: string
  azioni: ReactNode
  piede?: ReactNode
  onRiepilogo?: () => void
}) {
  return (
    <div className="sud-fine">
      <div className="sud-fine__testa">
        {onRiepilogo ? (
          <button type="button" className="sud-fine__timbro u-tabnum" onClick={onRiepilogo} aria-label={`${valore}: il riepilogo`}>
            {timbro}
          </button>
        ) : (
          <span className="sud-fine__timbro u-tabnum" aria-label={valore}>
            {timbro}
          </span>
        )}
        <div className="sud-fine__testo">
          <p className="sud-fine__titolo">{titolo}</p>
          <p className="sud-fine__dettaglio u-tabnum">{dettaglio}</p>
        </div>
      </div>
      <div className="sud-fine__azioni">{azioni}</div>
      {piede && <p className="sud-fine__piede">{piede}</p>}
    </div>
  )
}
