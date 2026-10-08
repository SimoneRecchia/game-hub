import { useEffect, useMemo, useRef, useState } from 'react'
import type { PropsPartitaSfida } from '@/games/sfide/PaginaSfida'
import { useRestante } from '@/games/tavolo/TempoMossa'
import { formatCronometro } from '@/lib/format'
import { VUOTA } from '@shared/sudoku'
import { PartitaSudoku } from './PartitaSudoku'
import { useSudokuLibero } from './useSudokuLibero'
import './Sudoku.css'

/**
 * Il sudoku di una sfida: lo stesso schema per tutti e due, dal seme, del
 * livello scelto da chi ha sfidato, senza aiuti e con un tempo. Mentre si
 * scrive va al server quante caselle sono giuste; vince chi lo risolve prima,
 * o allo scadere chi ne ha piu' giuste. Se l'altro l'ha gia' risolto, la
 * partita si chiude: arrivarci dopo non basterebbe.
 */
export function PartitaSfidaSudoku({ seme, impostazioni, fine, onAvanza, onFine, sue }: PropsPartitaSfida<'sudoku'>) {
  const g = useSudokuLibero({ salva: false })
  const { nuova } = g
  const cominciata = useRef(false)
  useEffect(() => {
    if (cominciata.current) return
    cominciata.current = true
    nuova(impostazioni.livello, seme)
  }, [impostazioni, nuova, seme])

  const p = g.partita
  // Il tempo parte con lo schema pronto, ed e' quello vero: non si ferma a pagina nascosta, come nella libera.
  const [inizio, setInizio] = useState<number | null>(null)
  useEffect(() => {
    if (p && inizio === null) setInizio(Date.now())
  }, [inizio, p])
  const scadenza = inizio !== null ? inizio + impostazioni.minuti * 60_000 : null
  const [chiusa, setChiusa] = useState(false)

  const cifre = g.gioco.editor.cifre
  const { giuste, daTrovare } = useMemo(() => {
    if (!p) return { giuste: 0, daTrovare: 0 }
    let giuste = 0
    let daTrovare = 0
    for (let k = 0; k < 81; k += 1) {
      if (p.dati[k] !== VUOTA) continue
      daTrovare += 1
      if (cifre[k] === p.soluzione[k]) giuste += 1
    }
    return { giuste, daTrovare }
  }, [cifre, p])
  const avanzamento = () => ({
    punti: giuste,
    passo: daTrovare > 0 ? Math.round((giuste * 100) / daTrovare) : 0,
    tempoMs: inizio !== null ? Date.now() - inizio : 0,
  })

  useEffect(() => {
    if (!p || p.finita || chiusa || giuste === 0) return
    onAvanza({
      punti: giuste,
      passo: daTrovare > 0 ? Math.round((giuste * 100) / daTrovare) : 0,
      tempoMs: inizio !== null ? Date.now() - inizio : 0,
    })
  }, [chiusa, daTrovare, giuste, inizio, onAvanza, p])

  const mandata = useRef(false)
  const chiudi = () => {
    if (mandata.current) return
    mandata.current = true
    setChiusa(true)
    onFine(avanzamento())
  }
  const chiudiRef = useRef(chiudi)
  chiudiRef.current = chiudi

  // Risolto: la fine, con tutte le caselle e il tempo.
  const risolta = p?.finita ?? false
  useEffect(() => {
    if (risolta) chiudiRef.current()
  }, [risolta])
  // L'altro l'ha risolto per primo: non lo si batte piu'.
  const battuto = sue.finito && sue.passo === 100
  useEffect(() => {
    if (battuto && !risolta) chiudiRef.current()
  }, [battuto, risolta])
  const restante = useRestante(scadenza, () => chiudiRef.current())

  if (!p || g.generando) {
    return (
      <div className="sud-attesa" aria-hidden="true">
        <div className="sud-attesa__griglia" />
      </div>
    )
  }
  return (
    <PartitaSudoku
      p={g.gioco}
      fine={fine}
      dettaglioRisolto={inizio !== null ? `In ${formatCronometro(Date.now() - inizio)}` : ''}
      orologio={restante !== null ? { ms: restante, etichetta: 'Tempo che resta' } : undefined}
      senzaAiuti
      chiusa={chiusa && !risolta}
    />
  )
}
