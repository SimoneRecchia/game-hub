import { useEffect, useMemo, useRef } from 'react'
import type { PropsPartitaSfida } from '@/games/sfide/PaginaSfida'
import { PUNTI_FINITA_ANAGRAMMI } from '@shared/anagrammi'
import { PartitaAnagrammi, Riepilogo, type ComandiAnagrammi } from './Partita'
import { useAnagrammiLiberi } from './useAnagrammiLiberi'
import './Anagrammi.css'

/**
 * Gli Anagrammi di una sfida: le stesse cinque parole e le stesse lettere per
 * tutti e due, dal seme, con il livello e il tempo scelti da chi ha sfidato.
 * Ogni parola chiusa va al server come avanzamento — i punti delle parole e
 * quante se ne sono trovate —, e l'ultima la fine. A pari punti decide il
 * tempo messo a trovarle.
 */
export function PartitaSfidaAnagrammi({ seme, impostazioni, fine, onAvanza, onFine }: PropsPartitaSfida<'anagrammi'>) {
  const g = useAnagrammiLiberi()
  const { comincia } = g
  const cominciata = useRef(false)
  useEffect(() => {
    if (cominciata.current) return
    cominciata.current = true
    comincia(impostazioni.livello, { seme, tempoParolaMs: impostazioni.secondi * 1_000, conta: false })
  }, [comincia, impostazioni, seme])
  const comandi: ComandiAnagrammi = useMemo(
    () => ({ apri: g.apri, prova: g.prova, aiuto: g.aiuto, passo: g.passo, scade: g.scade }),
    [g.apri, g.prova, g.aiuto, g.passo, g.scade],
  )

  const v = g.vista
  // I punti delle parole, senza quelli di chi ha giocato, che hanno tutti e due.
  const punti = Math.max(0, g.punti - PUNTI_FINITA_ANAGRAMMI)
  const chiuse = v ? v.parole.filter((p) => p.esito !== null).length : 0
  const trovate = v ? v.parole.filter((p) => p.esito === 'trovata') : []
  const tempoMs = trovate.reduce((s, p) => s + (p.ms ?? 0), 0)
  const finita = v?.finita ?? false
  useEffect(() => {
    if (finita || chiuse === 0) return
    onAvanza({ punti, passo: trovate.length, tempoMs })
  }, [chiuse, finita, onAvanza, punti, tempoMs, trovate.length])

  const chiusa = useRef(false)
  useEffect(() => {
    if (!finita || chiusa.current) return
    chiusa.current = true
    onFine({ punti, passo: trovate.length, tempoMs })
  }, [finita, onFine, punti, tempoMs, trovate.length])

  if (!v) return <div className="ana" aria-hidden="true" />
  return (
    <PartitaAnagrammi
      vista={v}
      comandi={comandi}
      fine={
        <>
          {fine}
          <Riepilogo parole={v.parole} />
        </>
      }
    />
  )
}
