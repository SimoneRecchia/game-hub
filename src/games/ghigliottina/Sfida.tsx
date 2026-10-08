import { useEffect, useRef } from 'react'
import type { PropsPartitaSfida } from '@/games/sfide/PaginaSfida'
import { PartitaGhigliottina } from './Partita'
import { useGhigliottinaLibera } from './useGhigliottinaLibera'
import './Ghigliottina.css'

/**
 * La Ghigliottina di una sfida: la stessa per tutti e due, dal seme, con il
 * tempo della finale scelto da chi ha sfidato. Mentre si sceglie va al server
 * quante coppie si sono fatte — i punti arrivano solo con la parola vincente —,
 * e alla fine il montepremi vinto e quanto ci si e' messo a scriverla, che a
 * pari punti decide.
 */
export function PartitaSfidaGhigliottina({
  seme,
  impostazioni,
  fine,
  onAvanza,
  onFine,
}: PropsPartitaSfida<'ghigliottina'>) {
  const g = useGhigliottinaLibera()
  const { comincia } = g
  const cominciata = useRef(false)
  useEffect(() => {
    if (cominciata.current) return
    cominciata.current = true
    void comincia({ seme, tempoFinaleMs: impostazioni.secondi * 1_000, conta: false })
  }, [comincia, impostazioni, seme])

  const v = g.vista
  const scelte = v ? v.coppie.filter((c) => c.scelta !== null).length : 0
  useEffect(() => {
    if (!v || v.finita || scelte === 0) return
    onAvanza({ punti: 0, passo: scelte, tempoMs: 0 })
  }, [onAvanza, scelte, v])

  const chiusa = useRef(false)
  useEffect(() => {
    if (!v || !v.finita || chiusa.current) return
    chiusa.current = true
    const usato = v.scadenza !== null ? v.tempoFinaleMs - Math.max(0, v.scadenza - Date.now()) : v.tempoFinaleMs
    onFine({ punti: v.punti, passo: scelte, tempoMs: Math.max(0, Math.min(v.tempoFinaleMs, usato)) })
  }, [onFine, scelte, v])

  if (!v) return <div className="ghi-attesa" aria-hidden="true" />
  return <PartitaGhigliottina key={g.numero} vista={v} comandi={g.comandi} fine={fine} subito />
}
