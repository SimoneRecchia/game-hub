import { useEffect, useRef } from 'react'
import { preparaComputer } from '@/games/scarabeo/computer'
import type { PropsPartitaSfida } from '@/games/sfide/PaginaSfida'
import { PartitaParoliere } from './Partita'
import { useParoliereLibero, type LatoLibero } from './useParoliereLibero'
import './Paroliere.css'

/**
 * Il Paroliere di una sfida: la griglia del seme, uguale sui due telefoni, con
 * il tempo scelto da chi ha sfidato. Ogni parola trovata va al server come
 * avanzamento — i punti, quante parole, e quando e' arrivata l'ultima, che a
 * pari punti decide —, e allo scadere la fine.
 */
export function PartitaSfidaParoliere({ seme, impostazioni, fine, onAvanza, onFine }: PropsPartitaSfida<'paroliere'>) {
  const g = useParoliereLibero()
  const { comincia } = g
  const cominciata = useRef(false)
  useEffect(() => {
    if (cominciata.current) return
    cominciata.current = true
    void preparaComputer().catch(() => {})
    comincia(String(impostazioni.lato) as LatoLibero, {
      seme,
      tempoMs: impostazioni.minuti * 60_000,
      conta: false,
    })
  }, [comincia, impostazioni, seme])

  const v = g.vista
  /** Quando e' arrivata l'ultima parola, dall'inizio della clessidra. */
  const ultima = useRef(0)
  const parole = v?.trovate.length ?? 0
  useEffect(() => {
    if (!v || v.fase !== 'gioca' || v.scadenza === null || parole === 0) return
    ultima.current = Math.max(0, Date.now() - (v.scadenza - v.tempoMs))
    onAvanza({ punti: v.punteggio, passo: parole, tempoMs: ultima.current })
  }, [onAvanza, parole, v])

  const chiusa = useRef(false)
  useEffect(() => {
    if (!v || v.fase !== 'finita' || chiusa.current) return
    chiusa.current = true
    onFine({ punti: v.punteggio, passo: v.trovate.length, tempoMs: ultima.current })
  }, [onFine, v])

  if (!v) return <div className="par" aria-hidden="true" />
  return <PartitaParoliere key={g.numero} vista={v} comandi={g.comandi} subito fine={fine} />
}
