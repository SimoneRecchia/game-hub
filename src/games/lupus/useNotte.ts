import { useEffect } from 'react'

/** Il cielo della notte di Lupus, lo stesso nei due temi: e' `--lupus-notte` in tokens.css. */
const CIELO = '#0d0f1f'

/**
 * Di notte la schermata si fa scura, come la Fortuna: lo fa il CSS con la
 * classe `lupus--notte`. Questo tinge del cielo anche la zona dell'orologio,
 * che Safari colora con il `theme-color`, e la rimette com'era quando torna il
 * giorno o si esce.
 */
export function useNotte(notte: boolean) {
  useEffect(() => {
    if (!notte) return
    const meta = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
    const prima = meta.map((m) => m.content)
    for (const m of meta) m.content = CIELO
    return () => {
      meta.forEach((m, i) => {
        m.content = prima[i]
      })
    }
  }, [notte])
}
