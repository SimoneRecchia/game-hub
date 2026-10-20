import { useEffect } from 'react'
import './Sala.css'

/** La classe dell'elemento piu' esterno di ogni gioco della Fortuna: la pagina diventa una sala (Sala.css). */
export const SALA = 'sala-fortuna'

/** Il viola della sala in cima alla pagina, lo stesso della scheda della Fortuna. */
const CIMA = '#3a1e7a'

/**
 * La sala e' scura in tutti e due i temi: tinge della sala anche la zona
 * dell'orologio, che Safari colora con il `theme-color`, e la rimette com'era
 * uscendo. Come la notte di Lupus e la scheda della Fortuna.
 */
export function useSala() {
  useEffect(() => {
    const meta = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
    const prima = meta.map((m) => m.content)
    for (const m of meta) m.content = CIMA
    return () => {
      meta.forEach((m, i) => {
        m.content = prima[i]
      })
    }
  }, [])
}
