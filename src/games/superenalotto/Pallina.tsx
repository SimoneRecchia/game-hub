import type { CSSProperties } from 'react'
import { coloreDellaPallina } from './palline'
import './Pallina.css'

/** Una pallina disegnata: il colore del suo gruppo e il numero nel tondo bianco. */
export function Pallina({ n, piccola = false, accesa = false }: { n: number; piccola?: boolean; accesa?: boolean }) {
  return (
    <span
      className={`se-pallina${piccola ? ' is-piccola' : ''}${accesa ? ' is-accesa' : ''}`}
      style={{ '--pallina': coloreDellaPallina(n) } as CSSProperties}
    >
      <span className="se-pallina__numero u-tabnum">{n}</span>
    </span>
  )
}
