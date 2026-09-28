import type { ReactNode } from 'react'

/** Sotto la griglia, a schema risolto: com'e' andata e cosa fare adesso. */
export function FineSudoku({
  titolo,
  valore,
  dettaglio,
  azioni,
  piede,
}: {
  titolo: string
  valore: string
  dettaglio: string
  azioni: ReactNode
  piede?: ReactNode
}) {
  return (
    <div className="sud-fine">
      <p className="sud-fine__titolo">{titolo}</p>
      <p className="sud-fine__valore u-tabnum">{valore}</p>
      <p className="sud-fine__dettaglio u-tabnum">{dettaglio}</p>
      <div className="sud-fine__azioni">{azioni}</div>
      {piede && <p className="sud-fine__piede">{piede}</p>}
    </div>
  )
}
