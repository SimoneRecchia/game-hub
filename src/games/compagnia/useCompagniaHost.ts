import { useCallback, useEffect, useRef, useState } from 'react'
import { COOP_POLL_ROOM_MS } from '@shared/config'
import type { CompagniaHost, GiocoLiberoInCompagnia, InvitabileCompagnia, ModalitaCompagnia } from '@shared/types'
import { ApiFetchError, api } from '@/lib/api'
import { suona } from '@/lib/suoni'

/**
 * La partita libera che l'host sta giocando, come la segue chi guarda: il suo
 * indirizzo sul server, o le mosse dello Scarabeo, che sta nel telefono.
 */
export type PartitaInCompagnia = { partitaId: string | null } | { stato: unknown }

/**
 * L'host di una partita in compagnia: chi ha invitato e che cosa gli
 * suggeriscono. Come `useCoopHost` del Wordle: una lettura all'avvio, e il
 * polling solo se serve — il pannello aperto, o qualcuno invitato. Chi gioca
 * da solo fa una richiesta e basta.
 *
 * Nella classificata la compagnia e' della giornata; nelle libere segue la
 * partita che l'host sta giocando (`partita`), e quando cambia — una partita
 * nuova, una mossa dello Scarabeo — la manda a chi guarda.
 *
 * `abilitata` e' false quando la compagnia non c'entra: una giornata gia'
 * finita, o giocata nella partita di un altro.
 */
export function useCompagniaHost(
  gioco: GiocoLiberoInCompagnia,
  modalita: ModalitaCompagnia,
  abilitata: boolean,
  pannelloAperto: boolean,
  partita: PartitaInCompagnia | null = null,
) {
  const base = modalita === 'libera' ? `/compagnia/libera/${gioco}` : `/compagnia/${gioco}`
  const [compagnia, setCompagnia] = useState<CompagniaHost | null>(null)
  const [giocatori, setGiocatori] = useState<InvitabileCompagnia[] | null>(null)
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const vivo = useRef(true)
  const ultima = useRef<CompagniaHost | null>(null)
  const partitaRef = useRef(partita)
  partitaRef.current = partita

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])

  const aggiorna = useCallback((fresca: CompagniaHost | null) => {
    // Chi entra si sente, e un suggerimento nuovo pure: l'host ha gli occhi sulla partita.
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
      const fresca = await api<CompagniaHost | null>(base)
      if (vivo.current) aggiorna(fresca)
    } catch {
      /* il polling non fa comparire errori: si riprova al giro dopo */
    }
  }, [aggiorna, base])

  const caricaGiocatori = useCallback(async () => {
    try {
      const { giocatori: freschi } = await api<{ giocatori: InvitabileCompagnia[] }>(`${base}/giocatori`)
      if (vivo.current) setGiocatori(freschi)
    } catch (err) {
      if (vivo.current) setErrore(err instanceof ApiFetchError ? err.message : 'Non riesco a vedere chi c’è.')
    }
  }, [base])

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

  // Nelle libere chi guarda segue l'host: a ogni partita nuova, o mossa, la si manda.
  const chiavePartita = partita ? JSON.stringify(partita) : null
  const mandata = useRef<string | null>(null)
  useEffect(() => {
    if (modalita !== 'libera' || !abilitata || !conOspiti || !chiavePartita || mandata.current === chiavePartita) return
    mandata.current = chiavePartita
    void api<CompagniaHost | null>(`${base}/partita`, { method: 'POST', body: JSON.parse(chiavePartita) })
      .then((fresca) => vivo.current && aggiorna(fresca))
      .catch(() => {
        mandata.current = null
      })
  }, [abilitata, aggiorna, base, chiavePartita, conOspiti, modalita])

  const scrivi = useCallback(
    async (azione: 'invita' | 'ritira', playerId: string) => {
      setOccupato(true)
      setErrore(null)
      try {
        // L'invito a una libera porta con se' la partita di adesso: chi accetta la vede subito.
        const corpo = azione === 'invita' && modalita === 'libera' ? { playerId, ...partitaRef.current } : { playerId }
        aggiorna(await api<CompagniaHost>(`${base}/${azione}`, { method: 'POST', body: corpo }))
        if (azione === 'invita' && modalita === 'libera') mandata.current = JSON.stringify(partitaRef.current)
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
    [aggiorna, base, caricaGiocatori, modalita],
  )

  /** Nelle libere: basta compagnia. Chi guardava smette. */
  const chiudi = useCallback(async () => {
    setOccupato(true)
    try {
      await api(`${base}/chiudi`, { method: 'POST' })
      mandata.current = null
      aggiorna(null)
    } catch (err) {
      setErrore(err instanceof ApiFetchError ? err.message : 'Non riesco a chiudere.')
    } finally {
      setOccupato(false)
    }
  }, [aggiorna, base])

  return {
    compagnia,
    giocatori,
    occupato,
    errore,
    caricaGiocatori,
    invita: (playerId: string) => void scrivi('invita', playerId),
    ritira: (playerId: string) => void scrivi('ritira', playerId),
    chiudi: () => void chiudi(),
  }
}
