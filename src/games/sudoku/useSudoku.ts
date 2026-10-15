import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { suona } from '@/lib/suoni'
import { NOTE_VUOTE, PUNTI_COMPLETO, costiSudoku, noteDaTesto, noteInTesto, puntiDelTempoSudoku } from '@shared/sudoku'
import type { SudokuEsito, SudokuState } from '@shared/types'
import { useCronometro } from './useCronometro'
import { useEditor } from './useEditor'
import type { SudokuInCorso } from './tipi'

/** Dopo quanto dall'ultima cifra si salva: abbastanza per non scrivere a ogni tocco. */
const ATTESA_SALVATAGGIO_MS = 900
const DURATA_MESSAGGIO_MS = 2400

/**
 * Il sudoku del giorno.
 *
 * Come il cruciverba: la griglia si scrive **in locale** e si salva dopo un
 * attimo di pausa (una richiesta per tocco sarebbero cinquanta scritture a
 * partita), e le scritture passano da una **coda**, una alla volta, ciascuna con
 * la versione restituita dalla precedente. Controllo e svelamento viaggiano
 * nella stessa coda e portano la griglia di quel momento. La soluzione resta sul
 * server: e' lui a dire se una cifra e' sbagliata, e se lo schema e' finito.
 */
export function useSudoku(): SudokuInCorso & { stato: SudokuState | null; loadError: string | null; ricarica: () => Promise<void> } {
  const [stato, setStato] = useState<SudokuState | null>(null)
  const [svelate, setSvelate] = useState<ReadonlySet<number>>(new Set())
  // Le caselle segnalate, con la cifra che avevano: rosse finché hanno quella cifra.
  const [segnalate, setSegnalate] = useState<ReadonlyMap<number, string>>(new Map())
  // I punti fatti, a partita chiusa; prima quel che gli aiuti hanno tolto, e il resto lo dice il tempo che corre.
  const [punti, setPunti] = useState(PUNTI_COMPLETO)
  const [spesi, setSpesi] = useState(0)
  const [finita, setFinita] = useState(false)
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)
  const [ultimoControllo, setUltimoControllo] = useState<SudokuInCorso['ultimoControllo']>(null)
  const idControllo = useRef(0)

  // Gli ultimi valori, per le scritture in coda: partono dopo, e devono mandare la griglia di quel momento.
  const cifreRef = useRef('')
  const noteRef = useRef(NOTE_VUOTE)
  const salvateRef = useRef('')
  const versioneRef = useRef(0)
  const finitaRef = useRef(false)
  const coda = useRef<Promise<void>>(Promise.resolve())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerMessaggio = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { ref: tempoRef, tempoMs, imposta: impostaTempo } = useCronometro(stato !== null && !finita)

  const mostra = useCallback((testo: string) => {
    setMessaggio(testo)
    if (timerMessaggio.current) clearTimeout(timerMessaggio.current)
    timerMessaggio.current = setTimeout(() => setMessaggio(null), DURATA_MESSAGGIO_MS)
  }, [])

  const salvaOraRef = useRef<(keepalive?: boolean) => Promise<void>>(async () => {})
  const onCambio = useCallback((cifre: string, note: Uint16Array, subito: boolean) => {
    cifreRef.current = cifre
    noteRef.current = noteInTesto(note)
    if (timer.current) clearTimeout(timer.current)
    if (subito) void salvaOraRef.current()
    else timer.current = setTimeout(() => void salvaOraRef.current(), ATTESA_SALVATAGGIO_MS)
  }, [])

  const editor = useEditor({ dati: stato?.dati ?? '.'.repeat(81), bloccate: svelate, attivo: !finita && stato !== null, onCambio })
  const { carica, imponi } = editor

  const applicaStato = useCallback(
    (s: SudokuState) => {
      setStato(s)
      carica(s.cifre, noteDaTesto(s.note))
      cifreRef.current = s.cifre
      noteRef.current = s.note
      salvateRef.current = s.cifre + s.note
      versioneRef.current = s.versione
      impostaTempo(s.tempoMs)
      setSvelate(new Set(s.svelate))
      setSegnalate(new Map(s.segnalate.map((k) => [k, s.cifre[k]])))
      setPunti(s.punti)
      setSpesi(s.spesi)
      setFinita(s.status === 'done')
      finitaRef.current = s.status === 'done'
    },
    [carica, impostaTempo],
  )

  const ricarica = useCallback(async () => {
    setLoadError(null)
    try {
      applicaStato(await api<SudokuState>('/sudoku/state'))
    } catch (err) {
      setLoadError(err instanceof ApiFetchError ? err.message : 'Non riesco a caricare il sudoku.')
    }
  }, [applicaStato])

  useEffect(() => {
    void ricarica()
  }, [ricarica])

  const applicaEsito = useCallback(
    (esito: SudokuEsito) => {
      versioneRef.current = esito.versione
      setPunti(esito.punti)
      setSpesi(esito.spesi)
      if (esito.stato) {
        dimentica('/oggi')
        dimentica('/leaderboard')
        applicaStato(esito.stato)
        return
      }
      if (esito.pienaConErrori) mostra('Griglia piena, ma c’è qualche errore')
    },
    [applicaStato, mostra],
  )

  const accoda = useCallback(
    (lavoro: () => Promise<void>) => {
      coda.current = coda.current.then(async () => {
        if (finitaRef.current) return
        try {
          await lavoro()
        } catch (err) {
          if (err instanceof ApiFetchError && (err.code === 'CONFLITTO' || err.code === 'GRIGLIA')) {
            // Un altro dispositivo, o la mezzanotte: la versione del server e' piu' nuova.
            mostra(err.code === 'CONFLITTO' ? 'Aggiornato da un altro dispositivo' : 'È arrivato il sudoku nuovo')
            await ricarica()
          } else if (err instanceof ApiFetchError) {
            mostra(err.message)
          }
        }
      })
      return coda.current
    },
    [mostra, ricarica],
  )

  const corpo = () => ({
    cifre: cifreRef.current,
    note: noteRef.current,
    tempoMs: tempoRef.current,
    versione: versioneRef.current,
  })

  const salvaOra = useCallback(
    (keepalive = false) =>
      accoda(async () => {
        const firma = cifreRef.current + noteRef.current
        if (firma === salvateRef.current && !keepalive) return
        const esito = await api<SudokuEsito>('/sudoku/cifre', { method: 'PUT', body: corpo(), keepalive })
        salvateRef.current = firma
        applicaEsito(esito)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accoda, applicaEsito],
  )
  salvaOraRef.current = salvaOra

  // A pagina nascosta si salva subito: potrebbe non tornare.
  useEffect(() => {
    if (!stato || finita) return
    const onVisibilita = () => {
      if (document.visibilityState === 'hidden') {
        if (timer.current) clearTimeout(timer.current)
        void salvaOra(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibilita)
    return () => document.removeEventListener('visibilitychange', onVisibilita)
  }, [stato, finita, salvaOra])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (timerMessaggio.current) clearTimeout(timerMessaggio.current)
    },
    [],
  )

  const controlla = useCallback(
    (ambito: 'casella' | 'tutto') => {
      const k = editor.selezione
      if (ambito === 'casella' && (k === null || editor.cifre[k] === '.')) return
      if (timer.current) clearTimeout(timer.current)
      setInviando(true)
      void accoda(async () => {
        const esito = await api<SudokuEsito>('/sudoku/controlla', {
          method: 'POST',
          body: { ...corpo(), ...(ambito === 'casella' ? { caselle: [k] } : {}) },
        })
        salvateRef.current = cifreRef.current + noteRef.current
        const errate = esito.errate ?? []
        const griglia = cifreRef.current
        setSegnalate((s) => new Map([...(ambito === 'tutto' ? [] : s), ...errate.map((j) => [j, griglia[j]] as const)]))
        idControllo.current += 1
        setUltimoControllo({ id: idControllo.current, ambito, errate: errate.length })
        applicaEsito(esito)
      }).finally(() => setInviando(false))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accoda, applicaEsito, editor.cifre, editor.selezione],
  )

  const svela = useCallback(() => {
    const k = editor.selezione
    if (k === null || stato?.dati[k] !== '.' || svelate.has(k)) return
    if (timer.current) clearTimeout(timer.current)
    setInviando(true)
    void accoda(async () => {
      const esito = await api<SudokuEsito>('/sudoku/svela', { method: 'POST', body: { ...corpo(), caselle: [k] } })
      if (esito.rivelate) {
        suona('svela')
        imponi(esito.rivelate)
        for (const [j, d] of Object.entries(esito.rivelate)) {
          const n = Number(j)
          cifreRef.current = cifreRef.current.slice(0, n) + d + cifreRef.current.slice(n + 1)
        }
        salvateRef.current = cifreRef.current + noteRef.current
        setSvelate(new Set(esito.svelate ?? []))
        setSegnalate((s) => new Map([...s].filter(([j]) => !(j in (esito.rivelate ?? {})))))
      }
      applicaEsito(esito)
    }).finally(() => setInviando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accoda, applicaEsito, editor.selezione, imponi, stato?.dati, svelate])

  // Una cifra segnalata che cambia non e' piu' rossa; rimessa, lo torna.
  const segnalateVive = useMemo(
    () => new Set([...segnalate].filter(([k, d]) => editor.cifre[k] === d).map(([k]) => k)),
    [segnalate, editor.cifre],
  )

  // Dallo schema, con gli stessi conti del server: erano scritti qui, e quando il server li ha cambiati sono rimasti.
  const aiuti = useMemo(() => (stato ? costiSudoku(stato.dati) : null), [stato?.dati])
  // Quanto varrebbe finirlo adesso: il tempo che corre, meno gli aiuti.
  const valore = finita || !aiuti ? punti : Math.max(0, puntiDelTempoSudoku(tempoMs, aiuti) - spesi)

  return {
    stato,
    loadError,
    ricarica,
    editor,
    dati: stato?.dati ?? null,
    livello: stato?.livello ?? null,
    svelate,
    segnalate: segnalateVive,
    soluzione: stato?.soluzione ?? null,
    tempoMs,
    punti: valore,
    finita,
    messaggio,
    inviando,
    ultimoControllo,
    aiuti,
    controlla,
    svela,
  }
}
