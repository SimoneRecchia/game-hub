import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CoopInvite } from '@shared/types'
import { api } from '@/lib/api'
import { haptic } from '@/lib/haptics'
import { usePresenza } from '@/lib/presenza'

/**
 * Gli inviti ricevuti per il Wordle in compagnia.
 *
 * Arrivano dal giro di controllo comune (vedi src/lib/presenza.tsx), che porta
 * anche le sfide a battaglia navale: una richiesta sola ogni otto secondi invece
 * di una per gioco. Qui restano la vibrazione per gli inviti nuovi e le due
 * risposte.
 */
export function useCoopInbox(attivo: boolean) {
  const { dati, aggiorna } = usePresenza()
  // Quelli a cui si e' appena risposto: il giro successivo li togliera', ma
  // intanto non devono ricomparire.
  const [risposti, setRisposti] = useState<Set<string>>(new Set())
  const conosciuti = useRef(new Set<string>())

  const invites = useMemo<CoopInvite[]>(
    () => (attivo ? (dati?.coop ?? []).filter((i) => !risposti.has(i.inviteId)) : []),
    [attivo, dati, risposti],
  )

  useEffect(() => {
    // Vibra solo per gli inviti mai visti, non a ogni giro.
    if (invites.some((i) => !conosciuti.current.has(i.inviteId))) haptic('success')
    conosciuti.current = new Set(invites.map((i) => i.inviteId))
  }, [invites])

  const accetta = useCallback(
    async (inviteId: string) => {
      const { roomId } = await api<{ roomId: string }>(`/coop/invite/${inviteId}/accept`, {
        method: 'POST',
      })
      setRisposti((prima) => new Set(prima).add(inviteId))
      aggiorna()
      return roomId
    },
    [aggiorna],
  )

  const rifiuta = useCallback(
    async (inviteId: string) => {
      await api(`/coop/invite/${inviteId}/decline`, { method: 'POST' })
      setRisposti((prima) => new Set(prima).add(inviteId))
      aggiorna()
    },
    [aggiorna],
  )

  return { invites, accetta, rifiuta, carica: aggiorna }
}
