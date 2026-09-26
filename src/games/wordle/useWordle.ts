import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  EvaluatedGuess,
  PlayerStats,
  TileState,
  WordleLiberaState,
  WordleState,
  WordleStatus,
} from '@shared/types'
import { isGameLetter, keyboardStates } from '@shared/wordle'
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

/** Quel che serve alla griglia, dalla classificata o dalla libera. */
export interface Griglia {
  wordLength: number
  maxAttempts: number
  guesses: EvaluatedGuess[]
  status: WordleStatus
  answer: string | null
}

/**
 * Da dove viene la partita: come la si carica e come si manda un tentativo.
 *
 * E' l'unica cosa che distingue la classificata dalla libera — la griglia, la
 * tastiera, le animazioni e i controlli sono gli stessi, e restano in un posto
 * solo.
 */
export interface Sorgente<T extends Griglia> {
  /** Cambia quando la partita e' un'altra: una libera nuova, per esempio. */
  chiave: string
  carica: () => Promise<T>
  invia: (parola: string) => Promise<T>
  /** A partita chiusa, per il riepilogo. */
  statistiche?: () => Promise<PlayerStats>
}

export interface WordleController<T extends Griglia = WordleState> {
  state: T | null
  stats: PlayerStats | null
  loading: boolean
  loadError: string | null
  /** Il codice dell'errore di caricamento: la pagina decide cosa farne. */
  loadCode: string | null
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
  /** Sostituisce lo stato senza passare dal server: la libera nuova, per esempio. */
  adotta: (stato: T) => void
}

/** La parola del giorno: una sola, la stessa per tutti. */
export function useWordle(): WordleController<WordleState> {
  const sorgente = useMemo<Sorgente<WordleState>>(
    () => ({
      chiave: 'classificata',
      carica: () => api<WordleState>('/wordle/state'),
      invia: (parola) => api<WordleState>('/wordle/guess', { method: 'POST', body: { guess: parola } }),
      statistiche: () => api<PlayerStats>('/wordle/stats'),
    }),
    [],
  )
  return usePartita(sorgente)
}

/**
 * La parola libera: si apre quella in corso, o una nuova se non ce n'e'.
 *
 * `nuova` chiede una parola nuova al server — che conta come persa quella in
 * corso, se era cominciata — e la mette in griglia.
 */
export function useWordleLibero(): WordleController<WordleLiberaState> & { nuova: () => Promise<void> } {
  const idRef = useRef<string | null>(null)
  const sorgente = useMemo<Sorgente<WordleLiberaState>>(
    () => ({
      chiave: 'libera',
      carica: async () => {
        const { partita } = await api<{ partita: WordleLiberaState | null }>('/wordle/libera')
        const stato = partita ?? (await api<WordleLiberaState>('/wordle/libera', { method: 'POST' }))
        idRef.current = stato.id
        return stato
      },
      invia: (parola) =>
        api<WordleLiberaState>(`/wordle/libera/${idRef.current}/guess`, {
          method: 'POST',
          body: { guess: parola },
        }),
    }),
    [],
  )
  const partita = usePartita(sorgente)
  const { adotta } = partita
  const nuova = useCallback(async () => {
    const stato = await api<WordleLiberaState>('/wordle/libera', { method: 'POST' })
    idRef.current = stato.id
    adotta(stato)
  }, [adotta])
  return { ...partita, nuova }
}

/**
 * La partita di una griglia di Wordle, da qualunque sorgente.
 *
 * Tiene quel che il server non sa: la riga che si sta scrivendo, le
 * animazioni, i messaggi. La verita' — i tentativi, i colori, la soluzione a
 * fine partita — arriva dalla sorgente, e il client non la calcola mai.
 */
function usePartita<T extends Griglia>(sorgente: Sorgente<T>): WordleController<T> {
  const [state, setState] = useState<T | null>(null)
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadCode, setLoadCode] = useState<string | null>(null)
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
    if (!sorgente.statistiche) return
    try {
      setStats(await sorgente.statistiche())
    } catch {
      /* le statistiche sono un contorno: se non arrivano, il gioco resta giocabile */
    }
  }, [sorgente])

  /** Una partita nuova in griglia: niente riga a meta', niente animazioni della precedente. */
  const adotta = useCallback((fresh: T) => {
    setState(fresh)
    setDraft('')
    setRevealing(null)
    setWinningRow(null)
    setShakingRow(null)
    setResultOpen(false)
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setLoadCode(null)
    try {
      const fresh = await sorgente.carica()
      adotta(fresh)
      if (fresh.status !== 'playing') void fetchStats()
    } catch (error) {
      setLoadError(
        error instanceof ApiFetchError ? error.message : 'Non riesco a caricare la partita.',
      )
      setLoadCode(error instanceof ApiFetchError ? error.code : null)
    } finally {
      setLoading(false)
    }
  }, [adotta, fetchStats, sorgente])

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
      const next = await sorgente.invia(word)
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
        /*
         * `GIOCATA_INSIEME` vuol dire che la parola di oggi e' stata giocata
         * nella stanza di un altro: rileggere lo stato fa comparire il rimando
         * a quella partita al posto della griglia.
         */
        if (
          error.code === 'GAME_OVER' ||
          error.code === 'CONFLICT' ||
          error.code === 'GIOCATA_INSIEME'
        ) {
          void reload()
        }
      } else {
        flash('Non riesco a inviare il tentativo.')
        shake(row)
      }
    } finally {
      setSubmitting(false)
    }
  }, [canType, draft, fetchStats, flash, later, reload, shake, sorgente, state])

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
      // Le stesse 21 lettere della tastiera a schermo: la regola sta in un
      // posto solo, perché quel che si tocca si deve anche poter digitare.
      const key = event.key.toLowerCase()
      if (isGameLetter(key)) {
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
    loadCode,
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
    adotta,
  }
}
