import { useEffect, useState } from 'react'

/**
 * Millisecondi che restano, aggiornati ogni secondo.
 *
 * Conta da una scadenza assoluta e non sottraendo mille a ogni giro: un
 * `setInterval` in una scheda in secondo piano viene rallentato dal browser, e
 * un contatore che scala di un secondo per tick perderebbe minuti senza
 * accorgersene. Con la scadenza, tornando sulla scheda il numero e' giusto.
 */
export function useCountdown(ms: number): number {
  const [remaining, setRemaining] = useState(ms)

  useEffect(() => {
    setRemaining(ms)
    const deadline = Date.now() + ms
    const id = window.setInterval(() => {
      setRemaining(Math.max(0, deadline - Date.now()))
    }, 1_000)
    return () => window.clearInterval(id)
  }, [ms])

  return remaining
}
