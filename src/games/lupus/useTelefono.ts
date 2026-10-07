import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/Toast'
import { ErroreLupus } from '@shared/lupus'
import { leggiTelefono, salvaTelefono, sistema, type StatoTelefono } from './telefono'

/**
 * La partita a un telefono, come la tiene la pagina: letta dal `localStorage`
 * quando la pagina si apre e riscritta a ogni cambio. `fai` riceve una delle
 * funzioni di telefono.ts e la applica alla partita di adesso; una mossa che
 * le regole non permettono non cambia niente, e lo dice.
 */
export function useTelefono() {
  const toast = useToast()
  const [stato, setStato] = useState<StatoTelefono | null>(() => {
    const letto = leggiTelefono()
    return letto && sistema(letto, Date.now())
  })
  const ultimo = useRef(stato)
  const lasciata = useRef(false)

  useEffect(() => {
    if (stato && !lasciata.current) salvaTelefono(stato)
  }, [stato])

  const fai = useCallback(
    (cambio: (s: StatoTelefono, adesso: number) => StatoTelefono) => {
      const prima = ultimo.current
      if (!prima || lasciata.current) return
      let dopo: StatoTelefono
      try {
        dopo = cambio(prima, Date.now())
      } catch (e) {
        if (!(e instanceof ErroreLupus)) throw e
        toast.show(e.message, 'error')
        return
      }
      ultimo.current = dopo
      setStato(dopo)
    },
    [toast],
  )

  /**
   * La partita non c'e' piu': la si e' lasciata, e si esce dalla pagina. Resta
   * sullo schermo finché la pagina non se ne va, perché la transizione
   * fotografa quella di prima: vuota, sembrerebbe un errore.
   */
  const lascia = useCallback(() => {
    lasciata.current = true
    salvaTelefono(null)
  }, [])

  return { stato, fai, lascia }
}
