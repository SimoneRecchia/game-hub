import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerStats, TileState, WordleState } from '@shared/types'
import { keyboardStates } from '@shared/wordle'
import { ApiFetchError, api } from '@/lib/api'
import { haptic } from '@/lib/haptics'

/**
 * Tempi delle animazioni. Devono restare allineati a Tile.css: sono qui
 * perché il codice deve sapere quando la rotazione e' finita, per colorare la
 * tastiera e aprire il riepilogo al momento giusto.
 */
const REVEAL_STAGGER_MS = 200
const REVEAL_TILE_MS = 540
const BOUNCE_MS = 1_000
const SHAKE_MS = 480

/**
 * Il dizionario dei tentativi ammessi pesa ~60 kB: viene caricato a parte,
 * mentre il giocatore legge la griglia, così l'hub non lo paga.
 */
let guessSetPromise: Promise<ReadonlySet<string>> | null = null

function loadGuessSet(): Promise<ReadonlySet<string>> {
  guessSetPromise ??= import('@shared/words/guesses').then((m) => m.GUESS_SET)
  return guessSetPromise
}

export interface WordleController {
  state: WordleState | null
  stats: PlayerStats | null
  loading: boolean
  loadError: string | null
  draft: string
  revealing: number | null
  winningRow: number | null
  shakingRow: number | null
  submitting: boolean
  keyboard: Map<string, TileState>
  message: string | null
  resultOpen: boolean
  press: (letter: string) => void
  backspace: () => void
  /** Riempie la riga con una parola intera, senza inviarla. */
  fill: (word: string) => void
  submit: () => void
  openResult: () => void
  closeResult: () => void
  reload: () => void
}

export function useWordle(): WordleController {
  const [state, setState] = useState<WordleState | null>(null)
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [revealing, setRevealing] = useState<number | null>(null)
  const [winningRow, setWinningRow] = useState<number | null>(null)
  const [shakingRow, setShakingRow] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [resultOpen, setResultOpen] = useState(false)

  const timers = useRef<number[]>([])
  const alive = useRef(true)

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      if (alive.current) fn()
    }, ms)
    timers.current.push(id)
  }, [])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      for (const id of timers.current) window.clearTimeout(id)
      timers.current = []
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      setStats(await api<PlayerStats>('/wordle/stats'))
    } catch {
      /* le statistiche sono un contorno: se non arrivano, il gioco resta giocabile */
    }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const fresh = await api<WordleState>('/wordle/state')
      setState(fresh)
      setDraft('')
      if (fresh.status !== 'playing') void fetchStats()
    } catch (error) {
      setLoadError(
        error instanceof ApiFetchError ? error.message : 'Non riesco a caricare la partita.',
      )
    } finally {
      setLoading(false)
    }
  }, [fetchStats])

  useEffect(() => {
    void reload()
    // Il dizionario si scalda subito: al primo invio e' già pronto.
    void loadGuessSet()
  }, [reload])

  const flash = useCallback(
    (text: string) => {
      setMessage(text)
      later(() => setMessage(null), 1_800)
    },
    [later],
  )

  const shake = useCallback(
    (row: number) => {
      haptic('error')
      setShakingRow(row)
      later(() => setShakingRow(null), SHAKE_MS)
    },
    [later],
  )

  const canType = state?.status === 'playing' && revealing === null && !submitting

  const press = useCallback(
    (letter: string) => {
      if (!canType || !state) return
      if (draft.length >= state.wordLength) return
      haptic('tap')
      setDraft((d) => (d.length >= state.wordLength ? d : d + letter))
    },
    [canType, draft.length, state],
  )

  const backspace = useCallback(() => {
    if (!canType) return
    haptic('tap')
    setDraft((d) => d.slice(0, -1))
  }, [canType])

  /**
   * Scrive una parola intera nella riga senza inviarla.
   *
   * La usa il suggerimento di un invitato: la parola compare pronta, ma
   * l'invio resta un gesto di chi sta giocando. Un suggerimento non deve
   * poter consumare un tentativo.
   */
  const fill = useCallback(
    (word: string) => {
      if (!canType || !state) return
      haptic('tap')
      setDraft(word.slice(0, state.wordLength).toLowerCase())
    },
    [canType, state],
  )

  const submit = useCallback(async () => {
    if (!canType || !state) return
    const row = state.guesses.length
    const word = draft.toLowerCase()

    if (word.length < state.wordLength) {
      flash(`Servono ${state.wordLength} lettere.`)
      shake(row)
      return
    }

    // Controllo locale prima della rete: un tentativo inesistente non deve
    // costare un viaggio al server né far aspettare il giocatore.
    const guessSet = await loadGuessSet()
    if (!guessSet.has(word)) {
      flash(`"${word.toUpperCase()}" non è nel dizionario.`)
      shake(row)
      return
    }

    setSubmitting(true)
    try {
      const next = await api<WordleState>('/wordle/guess', { method: 'POST', body: { guess: word } })
      setState(next)
      setDraft('')
      setRevealing(row)

      const revealMs = (next.wordLength - 1) * REVEAL_STAGGER_MS + REVEAL_TILE_MS
      later(() => {
        // Solo ora la tastiera si colora: prima sarebbe uno spoiler.
        setRevealing(null)
        if (next.status === 'won') {
          haptic('success')
          setWinningRow(row)
          later(() => setResultOpen(true), BOUNCE_MS)
        } else if (next.status === 'lost') {
          haptic('error')
          later(() => setResultOpen(true), 400)
        }
        if (next.status !== 'playing') void fetchStats()
      }, revealMs)
    } catch (error) {
      if (error instanceof ApiFetchError) {
        flash(error.message)
        shake(row)
        // Se il server dice che la partita e' chiusa o che e' arrivato un
        // altro tentativo, la verita' e' la sua: si rilegge.
        if (error.code === 'GAME_OVER' || error.code === 'CONFLICT') void reload()
      } else {
        flash('Non riesco a inviare il tentativo.')
        shake(row)
      }
    } finally {
      setSubmitting(false)
    }
  }, [canType, draft, fetchStats, flash, later, reload, shake, state])

  // Tastiera fisica: comoda da desktop.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Enter') {
        event.preventDefault()
        void submit()
        return
      }
      if (event.key === 'Backspace') {
        event.preventDefault()
        backspace()
        return
      }
      const key = event.key.toLowerCase()
      // Solo le 21 lettere dell'alfabeto italiano, come la tastiera a schermo.
      if (/^[a-hl-vz]$/.test(key) && !'jkwxy'.includes(key)) {
        event.preventDefault()
        press(key)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [backspace, press, submit])

  const keyboard = useMemo(() => {
    if (!state) return new Map<string, TileState>()
    // Durante la rotazione la riga in corso non conta ancora.
    const visible = revealing === null ? state.guesses : state.guesses.slice(0, revealing)
    return keyboardStates(visible)
  }, [revealing, state])

  return {
    state,
    stats,
    loading,
    loadError,
    draft,
    revealing,
    winningRow,
    shakingRow,
    submitting,
    keyboard,
    message,
    resultOpen,
    press,
    backspace,
    fill,
    submit: () => void submit(),
    openResult: () => setResultOpen(true),
    closeResult: () => setResultOpen(false),
    reload: () => void reload(),
  }
}
