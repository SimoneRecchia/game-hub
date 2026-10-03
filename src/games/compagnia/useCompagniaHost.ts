import { useCallback, useEffect, useRef, useState } from 'react'
import { COOP_POLL_ROOM_MS } from '@shared/config'
import type { CompagniaHost, GiocoInCompagnia, InvitabileCompagnia } from '@shared/types'
import { ApiFetchError, api } from '@/lib/api'
import { suona } from '@/lib/suoni'

/**
 * L'host del cruciverba o dello Scarabeo: chi ha invitato e che cosa gli
 * suggeriscono. Come `useCoopHost` del Wordle: una lettura all'avvio, e il
 * polling solo se serve — il pannello aperto, o qualcuno invitato. Chi gioca
 * da solo fa una richiesta e basta.
 *
 * `abilitata` e' false quando la compagnia non c'entra: una partita libera, o
 * una giornata gia' finita, o giocata nella partita di un altro.
 */
export function useCompagniaHost(gioco: GiocoInCompagnia, abilitata: boolean, pannelloAperto: boolean) {
  const [compagnia, setCompagnia] = useState<CompagniaHost | null>(null)
  const [giocatori, setGiocatori] = useState<InvitabileCompagnia[] | null>(null)
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const vivo = useRef(true)
  const ultima = useRef<CompagniaHost | null>(null)

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])

  const aggiorna = useCallback((fresca: CompagniaHost | null) => {
    // Chi entra si sente, e un suggerimento nuovo pure: l'host ha gli occhi sulla griglia.
    const prima = ultima.current
    if (prima && fresca) {
      const dentro = (c: CompagniaHost) => c.ospiti.filter((o) => o.stato === 'dentro').length
      const ultimo = (c: CompagniaHost) => c.suggerimenti[0]?.createdAt ?? ''
      if (dentro(fresca) > dentro(prima)) suona('entra')
      else if (ultimo(fresca) > ultimo(prima)) suona('invito', { volume: 0.6 })
    }
    ultima.current = fresca
    setCompagnia(fresca)
  }, [])

  const carica = useCallback(async () => {
    try {
      const fresca = await api<CompagniaHost | null>(`/compagnia/${gioco}`)
      if (vivo.current) aggiorna(fresca)
    } catch {
      /* il polling non fa comparire errori: si riprova al giro dopo */
    }
  }, [aggiorna, gioco])

  const caricaGiocatori = useCallback(async () => {
    try {
      const { giocatori: freschi } = await api<{ giocatori: InvitabileCompagnia[] }>(`/compagnia/${gioco}/giocatori`)
      if (vivo.current) setGiocatori(freschi)
    } catch (err) {
      if (vivo.current) setErrore(err instanceof ApiFetchError ? err.message : 'Non riesco a vedere chi c’è.')
    }
  }, [gioco])

  useEffect(() => {
    if (abilitata) void carica()
  }, [abilitata, carica])

  const conOspiti = (compagnia?.ospiti ?? []).some((o) => o.stato !== 'rifiutato')
  const attivo = abilitata && (pannelloAperto || conOspiti)
  useEffect(() => {
    if (!attivo) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carica()
    }, COOP_POLL_ROOM_MS)
    return () => window.clearInterval(id)
  }, [attivo, carica])

  const scrivi = useCallback(
    async (azione: 'invita' | 'ritira', playerId: string) => {
      setOccupato(true)
      setErrore(null)
      try {
        aggiorna(await api<CompagniaHost>(`/compagnia/${gioco}/${azione}`, { method: 'POST', body: { playerId } }))
        await caricaGiocatori()
      } catch (err) {
        setErrore(
          err instanceof ApiFetchError
            ? err.message
            : azione === 'invita'
              ? 'Non riesco a mandare l’invito.'
              : 'Non riesco a ritirare l’invito.',
        )
      } finally {
        setOccupato(false)
      }
    },
    [aggiorna, caricaGiocatori, gioco],
  )

  return {
    compagnia,
    giocatori,
    occupato,
    errore,
    caricaGiocatori,
    invita: (playerId: string) => void scrivi('invita', playerId),
    ritira: (playerId: string) => void scrivi('ritira', playerId),
  }
}
