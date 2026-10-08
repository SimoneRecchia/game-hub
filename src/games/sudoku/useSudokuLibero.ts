import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { suona } from '@/lib/suoni'
import {
  NOTE_VUOTE,
  VUOTA,
  caselleSbagliate,
  grigliaPiena,
  noteDaTesto,
  noteInTesto,
  type LivelloSudoku,
} from '@shared/sudoku'
import {
  contaCominciata,
  contaRisolta,
  generaSchemaLibero,
  leggiContiSudoku,
  leggiPartitaSudoku,
  salvaPartitaSudoku,
  type ContiSudokuLibero,
  type PartitaSudokuLibera,
} from './libera'
import { useCronometro } from './useCronometro'
import { useEditor } from './useEditor'
import type { SudokuInCorso } from './tipi'

const DURATA_MESSAGGIO_MS = 2400
/** Ogni quanto si salva il tempo, fra una cifra e l'altra: chi chiude la scheda non perde i minuti. */
const SALVA_TEMPO_MS = 15_000

export interface SudokuLiberoController {
  partita: PartitaSudokuLibera | null
  conti: ContiSudokuLibero
  /** Il livello dello schema che si sta preparando. */
  generando: LivelloSudoku | null
  guasto: string | null
  /** Lo schema appena risolto e' il record del suo livello. */
  record: boolean
  /** Uno schema nuovo; con il seme di una sfida, quello dei due telefoni. */
  nuova: (livello: LivelloSudoku, seme?: number) => void
  /** Lascia lo schema, finito o no, e torna alla scelta del livello. */
  lascia: () => void
  gioco: SudokuInCorso
}

/**
 * Il sudoku libero, tutto nel telefono: la soluzione c'e' gia', quindi
 * controlli e svelate si fanno qui, e non costano niente. Rendono pero' la
 * partita "aiutata", che non fa record. Lo schema di una sfida (`salva` a
 * false) non tocca quello salvato da soli, e non va nei conti.
 */
export function useSudokuLibero({ salva = true }: { salva?: boolean } = {}): SudokuLiberoController {
  const [partita, setPartita] = useState<PartitaSudokuLibera | null>(() => (salva ? leggiPartitaSudoku() : null))
  const [conti, setConti] = useState(() => leggiContiSudoku())
  const [generando, setGenerando] = useState<LivelloSudoku | null>(null)
  const [guasto, setGuasto] = useState<string | null>(null)
  const [record, setRecord] = useState(false)
  // Le caselle segnalate, con la cifra che avevano: rosse finché hanno quella cifra.
  const [segnalate, setSegnalate] = useState<ReadonlyMap<number, string>>(new Map())
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const [ultimoControllo, setUltimoControllo] = useState<SudokuInCorso['ultimoControllo']>(null)
  const idControllo = useRef(0)
  const timerMessaggio = useRef<ReturnType<typeof setTimeout> | null>(null)
  const partitaRef = useRef(partita)
  partitaRef.current = partita

  const finita = partita?.finita ?? false
  const inCorso = partita !== null && !finita
  const { ref: tempoRef, tempoMs, imposta: impostaTempo } = useCronometro(inCorso)

  const mostra = useCallback((testo: string) => {
    setMessaggio(testo)
    if (timerMessaggio.current) clearTimeout(timerMessaggio.current)
    timerMessaggio.current = setTimeout(() => setMessaggio(null), DURATA_MESSAGGIO_MS)
  }, [])

  const scrivi = useCallback(
    (p: PartitaSudokuLibera | null) => {
      partitaRef.current = p
      setPartita(p)
      if (salva) salvaPartitaSudoku(p)
    },
    [salva],
  )

  /** La partita dopo una cifra: chiusa se la griglia e' la soluzione, con i conti aggiornati. */
  const chiudiSeRisolta = useCallback(
    (p: PartitaSudokuLibera): PartitaSudokuLibera => {
      if (p.cifre !== p.soluzione) {
        if (grigliaPiena(p.cifre)) mostra('Griglia piena, ma c’è qualche errore')
        return p
      }
      const chiusa = { ...p, finita: true }
      if (salva) {
        const esito = contaRisolta(chiusa)
        setConti(esito.conti)
        setRecord(esito.record)
      }
      return chiusa
    },
    [mostra, salva],
  )

  const onCambio = useCallback(
    (cifre: string, note: Uint16Array) => {
      const p = partitaRef.current
      if (!p || p.finita) return
      scrivi(chiudiSeRisolta({ ...p, cifre, note: noteInTesto(note), tempoMs: tempoRef.current }))
    },
    [chiudiSeRisolta, scrivi, tempoRef],
  )

  const svelate = useMemo(() => new Set(partita?.svelate ?? []), [partita?.svelate])
  const editor = useEditor({ dati: partita?.dati ?? VUOTA.repeat(81), bloccate: svelate, attivo: inCorso, onCambio })
  const { carica, imponi } = editor

  // Uno schema nuovo, o quello ripreso: l'editor riparte dalle sue cifre.
  const iniziata = partita?.iniziata
  useEffect(() => {
    const p = partitaRef.current
    if (!p) return
    carica(p.cifre, noteDaTesto(p.note))
    impostaTempo(p.tempoMs)
    setSegnalate(new Map())
    setUltimoControllo(null)
  }, [iniziata, carica, impostaTempo])

  // Il tempo si salva anche senza cifre nuove: ogni tanto, a pagina nascosta e uscendo.
  useEffect(() => {
    if (!inCorso || !salva) return
    const salvaTempo = () => {
      const p = partitaRef.current
      if (p && !p.finita) salvaPartitaSudoku({ ...p, tempoMs: tempoRef.current })
    }
    const onVisibilita = () => {
      if (document.visibilityState === 'hidden') salvaTempo()
    }
    document.addEventListener('visibilitychange', onVisibilita)
    const id = setInterval(salvaTempo, SALVA_TEMPO_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilita)
      clearInterval(id)
      salvaTempo()
    }
  }, [inCorso, iniziata, salva, tempoRef])

  useEffect(
    () => () => {
      if (timerMessaggio.current) clearTimeout(timerMessaggio.current)
    },
    [],
  )

  const nuova = useCallback(
    (livello: LivelloSudoku, seme?: number) => {
      setGenerando(livello)
      setGuasto(null)
      setRecord(false)
      generaSchemaLibero(livello, seme)
        .then((schema) => {
          if (salva) setConti(contaCominciata(livello))
          scrivi({
            iniziata: Date.now(),
            livello,
            dati: schema.dati,
            soluzione: schema.soluzione,
            cifre: schema.dati,
            note: NOTE_VUOTE,
            svelate: [],
            aiutata: false,
            tempoMs: 0,
            finita: false,
          })
        })
        .catch((e: unknown) => setGuasto(e instanceof Error ? e.message : 'Non riesco a preparare lo schema.'))
        .finally(() => setGenerando(null))
    },
    [salva, scrivi],
  )

  const lascia = useCallback(() => {
    setRecord(false)
    scrivi(null)
  }, [scrivi])

  const selezione = editor.selezione
  const controlla = useCallback(
    (ambito: 'casella' | 'tutto') => {
      const p = partitaRef.current
      if (!p || p.finita) return
      let errate: number[]
      if (ambito === 'casella') {
        if (selezione === null || p.cifre[selezione] === VUOTA) return
        errate = p.cifre[selezione] !== p.soluzione[selezione] ? [selezione] : []
      } else {
        errate = caselleSbagliate(p.cifre, p.soluzione)
      }
      setSegnalate((s) => new Map([...(ambito === 'tutto' ? [] : s), ...errate.map((j) => [j, p.cifre[j]] as const)]))
      idControllo.current += 1
      setUltimoControllo({ id: idControllo.current, ambito, errate: errate.length })
      if (!p.aiutata) scrivi({ ...p, aiutata: true, tempoMs: tempoRef.current })
    },
    [scrivi, selezione, tempoRef],
  )

  const svela = useCallback(() => {
    const p = partitaRef.current
    const k = selezione
    if (!p || p.finita || k === null || p.dati[k] !== VUOTA || p.svelate.includes(k)) return
    const cifra = p.soluzione[k]
    suona('svela')
    imponi({ [k]: cifra })
    const note = noteDaTesto(p.note)
    note[k] = 0
    setSegnalate((s) => new Map([...s].filter(([j]) => j !== k)))
    scrivi(
      chiudiSeRisolta({
        ...p,
        cifre: p.cifre.slice(0, k) + cifra + p.cifre.slice(k + 1),
        note: noteInTesto(note),
        svelate: [...p.svelate, k],
        aiutata: true,
        tempoMs: tempoRef.current,
      }),
    )
  }, [chiudiSeRisolta, imponi, scrivi, selezione, tempoRef])

  // Una cifra segnalata che cambia non e' piu' rossa; rimessa, lo torna.
  const segnalateVive = useMemo(
    () => new Set([...segnalate].filter(([k, d]) => editor.cifre[k] === d).map(([k]) => k)),
    [segnalate, editor.cifre],
  )

  return {
    partita,
    conti,
    generando,
    guasto,
    record,
    nuova,
    lascia,
    gioco: {
      editor,
      dati: partita?.dati ?? null,
      livello: partita?.livello ?? null,
      svelate,
      segnalate: segnalateVive,
      soluzione: finita ? (partita?.soluzione ?? null) : null,
      tempoMs,
      punti: null,
      finita,
      messaggio,
      inviando: false,
      ultimoControllo,
      aiuti: null,
      controlla,
      svela,
    },
  }
}
