import { useCallback, useEffect, useRef, useState } from 'react'
import { COOP_POLL_INBOX_MS } from '@shared/config'
import type { CoopInvite } from '@shared/types'
import { api } from '@/lib/api'
import { haptic } from '@/lib/haptics'

/**
 * Gli inviti ricevuti, controllati a polling.
 *
 * È il sostituto delle notifiche push: senza un service worker registrato per
 * il push (che richiederebbe chiavi VAPID e il permesso del browser), otto
 * secondi di attesa sono un compromesso ragionevole per un invito.
 */
export function useCoopInbox(attivo: boolean) {
  const [invites, setInvites] = useState<CoopInvite[]>([])
  const conosciuti = useRef(new Set<string>())
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])

  const carica = useCallback(async () => {
    try {
      const { invites: fresh } = await api<{ invites: CoopInvite[] }>('/coop/inbox')
      if (!vivo.current) return
      // Vibra solo per gli inviti mai visti, non a ogni giro di polling.
      if (fresh.some((i) => !conosciuti.current.has(i.inviteId))) haptic('success')
      conosciuti.current = new Set(fresh.map((i) => i.inviteId))
      setInvites(fresh)
    } catch {
      /* il polling resta silenzioso: si riprova al giro dopo */
    }
  }, [])

  useEffect(() => {
    if (!attivo) return
    void carica()
    const id = window.setInterval(() => void carica(), COOP_POLL_INBOX_MS)
    return () => window.clearInterval(id)
  }, [attivo, carica])

  const accetta = useCallback(
    async (inviteId: string) => {
      const { roomId } = await api<{ roomId: string }>(`/coop/invite/${inviteId}/accept`, {
        method: 'POST',
      })
      setInvites((prev) => prev.filter((i) => i.inviteId !== inviteId))
      return roomId
    },
    [],
  )

  const rifiuta = useCallback(async (inviteId: string) => {
    await api(`/coop/invite/${inviteId}/decline`, { method: 'POST' })
    setInvites((prev) => prev.filter((i) => i.inviteId !== inviteId))
  }, [])

  return { invites, accetta, rifiuta, carica }
}
