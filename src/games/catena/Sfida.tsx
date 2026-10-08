import { useEffect, useRef } from 'react'
import type { PropsPartitaSfida } from '@/games/sfide/PaginaSfida'
import { PartitaCatena } from './Partita'
import { useCatenaLibera } from './useCatenaLibera'
import './Catena.css'

/**
 * La Catena di una sfida: la stessa per tutti e due, dal seme, con i tempi
 * scelti da chi ha sfidato. Mentre si gioca va al server a che
 * parola si e' arrivati — i punti arrivano solo con la parola finale —, e alla
 * fine il montepremi vinto e quanto ci si e' messo a scriverla.
 */
export function PartitaSfidaCatena({ seme, impostazioni, fine, onAvanza, onFine }: PropsPartitaSfida<'catena'>) {
  const g = useCatenaLibera()
  const { comincia } = g
  const cominciata = useRef(false)
  useEffect(() => {
    if (cominciata.current) return
    cominciata.current = true
    void comincia({
      seme,
      tempoParolaMs: impostazioni.passo * 1_000,
      tempoFinaleMs: impostazioni.secondi * 1_000,
      conta: false,
    })
  }, [comincia, impostazioni, seme])

  const v = g.vista
  const passo = v?.passo ?? 0
  useEffect(() => {
    if (!v || v.finita || passo === 0) return
    onAvanza({ punti: 0, passo, tempoMs: 0 })
  }, [onAvanza, passo, v])

  const chiusa = useRef(false)
  /** La finale, com'era quando si e' risposto: chiusa, la vista non la dice piu'. */
  const finale = useRef<{ inizio: number; scadenza: number } | null>(null)
  if (v?.finale) finale.current = v.finale
  useEffect(() => {
    if (!v || !v.finita || chiusa.current) return
    chiusa.current = true
    const f = finale.current
    const usato = f ? Math.max(0, Math.min(v.tempoFinaleMs, Date.now() - f.inizio)) : v.tempoFinaleMs
    onFine({ punti: v.punti, passo, tempoMs: usato })
  }, [onFine, passo, v])

  if (!v) return <div className="cat-attesa" aria-hidden="true" />
  return <PartitaCatena key={g.numero} vista={v} comandi={g.comandi} fine={fine} subito />
}
