import { useState } from 'react'

/**
 * Gli ultimi dati arrivati, finché non arrivano quelli nuovi.
 *
 * Cambiando periodo la richiesta e' nuova e la memoria di `useDati` non ce
 * l'ha: invece di tornare allo scheletro a ogni freccia si lasciano quelli di
 * prima, velati (`vecchi`), e la pagina non salta.
 */
export function useUltimi<T>(dati: T | undefined): { mostrati: T | undefined; vecchi: boolean } {
  const [ultimi, setUltimi] = useState(dati)
  if (dati !== undefined && dati !== ultimi) setUltimi(dati)
  return { mostrati: dati ?? ultimi, vecchi: dati === undefined && ultimi !== undefined }
}
