import { useEffect } from 'react'
import '@/games/fortuna/Sala.css'

/** Il verde del feltro in cima alla pagina (Feltro.css). */
const CIMA = '#14713f'

/**
 * La roulette e' un tavolo da cima a fondo: la pagina e' tutta feltro, come
 * nel mockup, e non la sala viola degli altri giochi della Fortuna. Fa quel
 * che fa `useSala` — la pagina scura in tutti e due i temi, con `SALA` sulla
 * radice del gioco —, ma tinge di verde la zona dell'orologio (il
 * `theme-color`), e la rimette com'era uscendo. Non si chiama insieme a
 * `useSala`: le due rimesse a posto si pesterebbero.
 */
export function useFeltro() {
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
