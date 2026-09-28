import type { ReactNode } from 'react'
import { Sheet } from './Sheet'
import './Aiuti.css'

/**
 * Il foglio degli aiuti dei giochi a griglia, il cruciverba e il sudoku: in
 * cima quanto vale adesso la partita, sotto un bottone per aiuto con quel che
 * costa.
 */
export function FoglioAiuti({
  open,
  onClose,
  nota,
  children,
}: {
  open: boolean
  onClose: () => void
  nota?: ReactNode
  children: ReactNode
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Aiuti">
      <div className="aiuti">
        {nota && <p className="aiuti__nota">{nota}</p>}
        {children}
      </div>
    </Sheet>
  )
}

export function VoceAiuto({
  nome,
  costo,
  onClick,
  disabled = false,
}: {
  nome: string
  costo?: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button type="button" className="aiuti__voce" onClick={onClick} disabled={disabled}>
      <span className="aiuti__nome">{nome}</span>
      {costo && <span className="aiuti__costo">{costo}</span>}
    </button>
  )
}
