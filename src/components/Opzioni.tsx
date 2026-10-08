import type { ReactNode } from 'react'
import './Opzioni.css'

/**
 * Le opzioni di una partita in una carta, una riga per opzione, come nelle
 * Impostazioni: il quiz e le libere le scrivono tutte cosi', quindi una pagina
 * di opzioni si legge allo stesso modo in ogni gioco.
 */
export function Opzioni({ children }: { children: ReactNode }) {
  return <div className="opzioni">{children}</div>
}

/**
 * Una riga con il suo nome, se serve una riga che spiega, e sotto il
 * controllo. `valore` e' quel che dice un cursore, scritto a destra del nome:
 * sotto la pista lo coprirebbe il dito che lo trascina.
 */
export function Scelte({
  titolo,
  sotto,
  valore,
  children,
}: {
  titolo: string
  sotto?: string
  valore?: string
  children?: ReactNode
}) {
  return (
    <div className="opzione">
      <span className="opzione__testa">
        <span className="opzione__testi">
          <span className="opzione__titolo">{titolo}</span>
          {sotto && <span className="opzione__sotto">{sotto}</span>}
        </span>
        {valore && (
          <span className="opzione__numero" aria-hidden="true">
            {valore}
          </span>
        )}
      </span>
      {children}
    </div>
  )
}
