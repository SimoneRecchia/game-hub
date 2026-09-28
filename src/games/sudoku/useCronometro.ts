import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Il tempo di gioco, a pagina visibile: un sudoku si fa a pezzi, e il tempo
 * col telefono in tasca non e' tempo di gioco. Si somma il tempo trascorso
 * davvero fra un giro e l'altro, con un tetto, perché al ritorno da una scheda
 * nascosta il primo giro non porti con se' l'assenza. Come il cruciverba.
 */
export function useCronometro(acceso: boolean) {
  const ref = useRef(0)
  const [tempoMs, setTempoMs] = useState(0)

  useEffect(() => {
    if (!acceso) return
    let ultimo = performance.now()
    const id = setInterval(() => {
      const adesso = performance.now()
      const passato = Math.min(adesso - ultimo, 2000)
      ultimo = adesso
      if (document.visibilityState !== 'visible') return
      ref.current += passato
      setTempoMs(ref.current)
    }, 1000)
    const onVisibilita = () => {
      ultimo = performance.now()
    }
    document.addEventListener('visibilitychange', onVisibilita)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibilita)
    }
  }, [acceso])

  const imposta = useCallback((ms: number) => {
    ref.current = ms
    setTempoMs(ms)
  }, [])

  return useMemo(() => ({ ref, tempoMs, imposta }), [tempoMs, imposta])
}
