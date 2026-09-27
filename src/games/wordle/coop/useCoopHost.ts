import { useCallback, useEffect, useRef, useState } from 'react'
import { COOP_POLL_ROOM_MS } from '@shared/config'
import type { CoopRoom, InvitablePlayer } from '@shared/types'
import { ApiFetchError, api } from '@/lib/api'
import { suona } from '@/lib/suoni'

/**
 * Lato host: chi ho invitato e cosa mi stanno suggerendo.
 *
 * Una lettura all'avvio per sapere se c'e' una stanza, poi il polling parte
 * solo se serve davvero: pannello aperto, o almeno un invitato. Chi gioca da
 * solo fa una richiesta e basta.
 */
export function useCoopHost(pannelloAperto: boolean) {
  const [room, setRoom] = useState<CoopRoom | null>(null)
  const [players, setPlayers] = useState<InvitablePlayer[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])

  const ultima = useRef<CoopRoom | null>(null)
  const carica = useCallback(async () => {
    try {
      const fresh = await api<CoopRoom | null>('/coop/room')
      if (!vivo.current) return
      // Chi accetta entra nella partita, e un suggerimento arriva: tutti e due si sentono.
      const prima = ultima.current
      if (prima && fresh) {
        const dentro = (r: CoopRoom) => r.guests.filter((g) => g.status === 'accepted').length
        if (dentro(fresh) > dentro(prima)) suona('entra')
        else if (fresh.suggestions.length > prima.suggestions.length) suona('invito', { volume: 0.6 })
      }
      ultima.current = fresh
      setRoom(fresh)
    } catch {
      /* il polling non deve far comparire errori: si riprova al giro dopo */
    }
  }, [])

  const caricaGiocatori = useCallback(async () => {
    try {
      const { players: fresh } = await api<{ players: InvitablePlayer[] }>('/coop/players')
      if (vivo.current) setPlayers(fresh)
    } catch (err) {
      if (vivo.current) {
        setError(err instanceof ApiFetchError ? err.message : 'Non riesco a caricare i giocatori.')
      }
    }
  }, [])

  // Una lettura all'avvio: serve a sapere se c'e' già una stanza con invitati.
  useEffect(() => {
    void carica()
  }, [carica])

  const conInvitati = (room?.guests ?? []).some((g) => g.status !== 'declined')
  const attivo = pannelloAperto || conInvitati

  useEffect(() => {
    if (!attivo) return
    const id = window.setInterval(() => void carica(), COOP_POLL_ROOM_MS)
    return () => window.clearInterval(id)
  }, [attivo, carica])

  const invita = useCallback(
    async (playerId: string) => {
      setBusy(true)
      setError(null)
      try {
        setRoom(await api<CoopRoom>('/coop/invite', { method: 'POST', body: { playerId } }))
        await caricaGiocatori()
      } catch (err) {
        setError(err instanceof ApiFetchError ? err.message : 'Non riesco a mandare l’invito.')
      } finally {
        setBusy(false)
      }
    },
    [caricaGiocatori],
  )

  const ritira = useCallback(
    async (inviteId: string) => {
      setBusy(true)
      setError(null)
      try {
        setRoom(await api<CoopRoom>(`/coop/invite/${inviteId}/revoke`, { method: 'POST' }))
        await caricaGiocatori()
      } catch (err) {
        setError(err instanceof ApiFetchError ? err.message : 'Non riesco a ritirare l’invito.')
      } finally {
        setBusy(false)
      }
    },
    [caricaGiocatori],
  )

  const chiudi = useCallback(async () => {
    try {
      await api('/coop/room/close', { method: 'POST' })
      await carica()
    } catch {
      /* non critico: la stanza si chiude comunque a fine giornata */
    }
  }, [carica])

  return { room, players, busy, error, carica, caricaGiocatori, invita, ritira, chiudi }
}
