import { useCallback, useEffect, useRef } from 'react'

/** Le attese di una pagina, tutte spente quando la pagina se ne va. */
export function useDopo() {
  const attese = useRef(new Set<number>())
  useEffect(() => {
    const tutte = attese.current
    return () => tutte.forEach((t) => window.clearTimeout(t))
  }, [])
  return useCallback((ms: number, fai: () => void) => {
    const t = window.setTimeout(() => {
      attese.current.delete(t)
      fai()
    }, ms)
    attese.current.add(t)
  }, [])
}
