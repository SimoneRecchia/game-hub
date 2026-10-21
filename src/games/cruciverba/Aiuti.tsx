import type { CSSProperties, ReactNode } from 'react'
import './Aiuti.css'

/**
 * I pezzi del foglio degli aiuti del cruciverba e del sudoku, come nell'album:
 * in cima quanto vale adesso la partita, poi un tasto per aiuto con la sua
 * icona nel colore del gioco e quel che costa. Stanno dentro `FoglioAiuti`.
 */
export function AiutoVale({ children }: { children: ReactNode }) {
  return <p className="aiuto-vale">{children}</p>
}

export function AiutoVoce({
  icona,
  nome,
  costo,
  colore,
  onClick,
  disabled = false,
}: {
  icona: ReactNode
  nome: string
  costo?: string
  /** Il fondo dell'icona: il colore chiaro del gioco. */
  colore: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="aiuto-voce"
      onClick={onClick}
      disabled={disabled}
      style={{ '--aiuto-colore': colore } as CSSProperties}
    >
      <span className="aiuto-voce__icona" aria-hidden="true">
        {icona}
      </span>
      <span className="aiuto-voce__testo">
        <span className="aiuto-voce__nome">{nome}</span>
        {costo && <span className="aiuto-voce__costo">{costo}</span>}
      </span>
    </button>
  )
}
