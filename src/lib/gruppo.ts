import type { KeyboardEvent } from 'react'

const VERSI: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/**
 * Le frecce in un gruppo di scelte, come vuole il radio group di WAI-ARIA:
 * destra e giu' vanno alla prossima, sinistra e su alla precedente, in giro, e
 * la scelta segue il fuoco. Va sul contenitore (`role="radiogroup"`); le voci
 * hanno `tabIndex` 0 se sono scelte e -1 se no, così il tasto Tab entra sulla
 * scelta fatta e poi esce dal gruppo invece di passare da tutte.
 */
export function frecceDelGruppo(e: KeyboardEvent<HTMLElement>): void {
  const verso = VERSI[e.key]
  if (!verso) return
  const voci = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)'))
  const qui = voci.indexOf(e.target as HTMLElement)
  if (qui < 0) return
  e.preventDefault()
  const prossima = voci[(qui + verso + voci.length) % voci.length]
  prossima.focus()
  prossima.click()
}
