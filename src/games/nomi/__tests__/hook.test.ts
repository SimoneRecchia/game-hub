import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatiAdesivo } from '@/components/Adesivo'
import { TEMPO_NOMI_MS } from '@shared/nomi-cose'
import { TIMBRO_MS } from '../scena'
import { useNomiLibera } from '../useNomiLibera'
import { useCorrezione, useTimbro } from '../useScena'

/**
 * Gli hook di Nomi, cose e città su un React da banco: quel che serve a far
 * girare un hook senza DOM — lo stato, i ref, i callback e gli effetti con le
 * loro dipendenze — perché il test guardi l'hook vero e non una sua copia.
 * `aggiorna` rifa' il giro, con gli effetti dopo ogni disegno, finche' lo
 * stato non si ferma.
 */
const banco = vi.hoisted(() => {
  let celle: unknown[] = []
  let k = 0
  let sporco = false
  let effetti: (() => void)[] = []
  const diverse = (a?: readonly unknown[], b?: readonly unknown[]) =>
    !a || !b || a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]))
  function cella<T>(crea: () => T): T {
    const i = k++
    if (!(i in celle)) celle[i] = crea()
    return celle[i] as T
  }
  const react = {
    useState<T>(iniziale: T | (() => T)) {
      const s = cella(() => {
        const box = {
          v: typeof iniziale === 'function' ? (iniziale as () => T)() : iniziale,
          imposta: (n: T | ((prima: T) => T)) => {
            const v = typeof n === 'function' ? (n as (prima: T) => T)(box.v) : n
            if (!Object.is(v, box.v)) {
              box.v = v
              sporco = true
            }
          },
        }
        return box
      })
      return [s.v, s.imposta] as const
    },
    useRef<T>(iniziale: T) {
      return cella(() => ({ current: iniziale }))
    },
    useMemo<T>(crea: () => T, deps: readonly unknown[]) {
      const m = cella(() => ({ deps: undefined as readonly unknown[] | undefined, v: undefined as T }))
      if (diverse(m.deps, deps)) {
        m.deps = deps
        m.v = crea()
      }
      return m.v
    },
    useCallback<T>(fn: T, deps: readonly unknown[]) {
      return react.useMemo(() => fn, deps)
    },
    useEffect(fa: () => (() => void) | void, deps?: readonly unknown[]) {
      const e = cella(() => ({ deps: undefined as readonly unknown[] | undefined, pulisci: undefined as unknown }))
      if (!diverse(e.deps, deps)) return
      e.deps = deps
      effetti.push(() => {
        if (typeof e.pulisci === 'function') e.pulisci()
        e.pulisci = fa()
      })
    },
  }
  function rendi<T>(hook: () => T) {
    let corrente = undefined as T
    const aggiorna = () => {
      for (let giri = 0; giri < 50; giri += 1) {
        sporco = false
        k = 0
        corrente = hook()
        const daFare = effetti
        effetti = []
        daFare.forEach((f) => f())
        if (!sporco) return
      }
      throw new Error('Lo stato non si ferma')
    }
    aggiorna()
    return {
      get corrente() {
        return corrente
      },
      aggiorna,
    }
  }
  const azzera = () => {
    celle = []
    effetti = []
  }
  return { react, rendi, azzera }
})

vi.mock('react', () => banco.react)

// Le parole della lettera arrivano subito, e i conti non si scrivono.
vi.mock('../libera', async (originale) => ({
  ...(await originale<typeof import('../libera')>()),
  letteraACaso: () => ({ lettera: 'a', categorie: ['nomi', 'citta', 'animali', 'colori', 'frutta'] }),
  caricaLessico: () =>
    Promise.resolve({
      versione: 'prova',
      lettera: 'a',
      categorie: {
        nomi: ['anna', 'andrea'],
        citta: ['ancona', 'asti'],
        animali: ['aquila', 'asino'],
        colori: ['azzurro', 'arancione'],
        frutta: ['arancia', 'ananas'],
      },
      note: {
        nomi: ['Anna', 'Andrea'],
        citta: ['Ancona', 'Asti'],
        animali: ['aquila', 'asino'],
        colori: ['azzurro', 'arancione'],
        frutta: ['arancia', 'ananas'],
      },
    }),
}))
vi.mock('../conti', () => ({ registraPartitaNomi: () => {} }))

// Il registro delle partite in sospeso, in memoria: niente server, niente eventi della pagina.
const registro = vi.hoisted(() => ({ voci: new Map<string, { dettaglio?: string }>(), eventi: [] as string[] }))
vi.mock('@/games/sospese/registro', () => ({
  segnaSospesa: (gioco: string, info: { dettaglio?: string }) => {
    if (!registro.voci.has(gioco)) registro.eventi.push('inizio')
    registro.voci.set(gioco, info)
  },
  riprendiSospesa: () => registro.eventi.push('ripresa'),
  chiudiSospesa: (gioco: string, esito = 'finita') => {
    registro.voci.delete(gioco)
    registro.eventi.push(esito)
  },
  sospesaDi: (gioco: string) => registro.voci.get(gioco) ?? null,
}))

/** Un `localStorage` e un `document` da banco: il salvataggio e la pagina che si nasconde. */
function pagina() {
  const dati = new Map<string, string>()
  const ascolta = new Map<string, () => void>()
  const doc = {
    visibilityState: 'visible',
    addEventListener: (tipo: string, fa: () => void) => ascolta.set(tipo, fa),
    removeEventListener: (tipo: string) => ascolta.delete(tipo),
  }
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => dati.get(k) ?? null,
    setItem: (k: string, v: string) => dati.set(k, v),
    removeItem: (k: string) => dati.delete(k),
  })
  vi.stubGlobal('document', doc)
  return {
    dati,
    nascondi(nascosta: boolean) {
      doc.visibilityState = nascosta ? 'hidden' : 'visible'
      ascolta.get('visibilitychange')?.()
    },
  }
}

describe('la libera contro il computer', () => {
  let pag: ReturnType<typeof pagina>
  beforeEach(() => {
    banco.azzera()
    vi.useFakeTimers()
    // Gli orologi dell'hook sono quelli di `window`: qui sono quelli finti del test.
    vi.stubGlobal('window', Object.assign(Object.create(globalThis), { addEventListener() {}, removeEventListener() {} }))
    registro.voci.clear()
    registro.eventi = []
    pag = pagina()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('lasciata a meta’ si riprende con le risposte e il tempo che restava, e a pagina nascosta l’orologio sta fermo', async () => {
    const banco2 = pag
    const h = banco.rendi(useNomiLibera)
    h.corrente.nuova('normale')
    h.aggiorna()
    await vi.advanceTimersByTimeAsync(0)
    h.aggiorna()
    expect(registro.eventi).toEqual(['inizio'])
    h.corrente.parti()
    h.aggiorna()
    const p = h.corrente.partita!
    h.corrente.scrivi('nomi', 'Anna')
    h.aggiorna()
    await vi.advanceTimersByTimeAsync(10_000)
    h.aggiorna()

    // Nascosta: il tempo non corre, neanche per il computer.
    banco2.nascondi(true)
    h.aggiorna()
    expect(h.corrente.scadenza).toBeNull()
    await vi.advanceTimersByTimeAsync(p.stopMs + 60_000)
    h.aggiorna()
    expect(h.corrente.fase).toBe('gioco')
    banco2.nascondi(false)
    h.aggiorna()
    expect(h.corrente.scadenza).toBe(Date.now() + p.tempoMs - 10_000)

    // Un'altra pagina, il giorno dopo: si riprende da li', senza il rullo.
    await vi.advanceTimersByTimeAsync(5_000)
    h.aggiorna()
    banco2.nascondi(true)
    h.aggiorna()
    expect(registro.voci.get('nomi')?.dettaglio).toBe('Lettera A · 2:45 rimasti')
    banco.azzera()
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000)
    const r = banco.rendi(useNomiLibera)
    expect(r.corrente.fase).toBe('scelta')
    r.corrente.riprendi()
    r.aggiorna()
    expect(r.corrente.fase).toBe('riprende')
    await vi.advanceTimersByTimeAsync(0)
    r.aggiorna()
    expect(r.corrente).toMatchObject({ fase: 'gioco', risposte: { nomi: 'Anna' }, partita: p })
    expect(r.corrente.scadenza).toBe(Date.now() + p.tempoMs - 15_000)
    expect(registro.eventi).toEqual(['inizio', 'ripresa'])

    // Finita, se ne va: dal registro e dal telefono.
    r.corrente.dicoStop()
    r.aggiorna()
    expect(r.corrente.fase).toBe('fine')
    expect(registro.eventi).toEqual(['inizio', 'ripresa', 'finita'])
    expect(banco2.dati.size).toBe(0)
  })

  it('lasciata, non si ritrova; e un salvataggio che il registro non ha piu’ si butta', async () => {
    const banco2 = pag
    const h = banco.rendi(useNomiLibera)
    h.corrente.nuova('facile')
    h.aggiorna()
    await vi.advanceTimersByTimeAsync(0)
    h.aggiorna()
    h.corrente.parti()
    h.aggiorna()
    h.corrente.lascia()
    h.aggiorna()
    expect(h.corrente.fase).toBe('scelta')
    expect(registro.eventi).toEqual(['inizio', 'annullata'])
    expect(banco2.dati.size).toBe(0)

    h.corrente.nuova('facile')
    h.aggiorna()
    await vi.advanceTimersByTimeAsync(0)
    h.aggiorna()
    expect(banco2.dati.size).toBe(1)
    // Le Libere l'hanno lasciata da fuori: il registro non c'e' piu', e la pagina dopo non la riprende.
    registro.voci.clear()
    banco.azzera()
    const r = banco.rendi(useNomiLibera)
    expect(banco2.dati.size).toBe(0)
    r.corrente.riprendi()
    r.aggiorna()
    expect(r.corrente.fase).toBe('scelta')
  })

  it('il tempo parte quando la lettera si vede, per tutti e due: il rullo non lo toglie a chi gioca', async () => {
    const h = banco.rendi(useNomiLibera)
    h.corrente.nuova('normale')
    h.aggiorna()
    expect(h.corrente.fase).toBe('carica')
    await vi.advanceTimersByTimeAsync(0)
    h.aggiorna()
    expect(h.corrente.fase).toBe('pronta')
    const p = h.corrente.partita!

    // Il rullo gira quanto vuole: il tempo non corre, non si scrive, e il computer aspetta.
    await vi.advanceTimersByTimeAsync(p.stopMs + 5_000)
    h.corrente.scrivi('nomi', 'Anna')
    h.aggiorna()
    expect(h.corrente).toMatchObject({ fase: 'pronta', scadenza: null, scritteComputer: 0, stop: null, risposte: {} })

    // La lettera si vede: da qui corrono i tre minuti, e il computer comincia a scrivere.
    h.corrente.parti()
    h.aggiorna()
    expect(h.corrente.fase).toBe('gioco')
    expect(h.corrente.scadenza).toBe(Date.now() + TEMPO_NOMI_MS)
    h.corrente.scrivi('nomi', 'Anna')
    h.aggiorna()
    expect(h.corrente.risposte).toEqual({ nomi: 'Anna' })

    await vi.advanceTimersByTimeAsync(p.stopMs - 1)
    h.aggiorna()
    expect(h.corrente.fase).toBe('gioco')
    await vi.advanceTimersByTimeAsync(1)
    h.aggiorna()
    expect(h.corrente).toMatchObject({ fase: 'fine', stop: 'computer' })
  })

  it('una partita nuova aspetta di nuovo la lettera', async () => {
    const h = banco.rendi(useNomiLibera)
    h.corrente.nuova('facile')
    h.aggiorna()
    await vi.advanceTimersByTimeAsync(0)
    h.aggiorna()
    h.corrente.parti()
    h.aggiorna()
    h.corrente.dicoStop()
    h.aggiorna()
    expect(h.corrente.fase).toBe('fine')

    h.corrente.nuova('facile')
    h.aggiorna()
    await vi.advanceTimersByTimeAsync(0)
    h.aggiorna()
    expect(h.corrente).toMatchObject({ fase: 'pronta', scadenza: null, stop: null, risultato: null })
  })
})

describe('il timbro e la correzione', () => {
  const STOP: Omit<DatiAdesivo, 'id'> = { tono: 'vivace', titolo: 'Stop!', durata: TIMBRO_MS }

  beforeEach(() => {
    banco.azzera()
    vi.useFakeTimers()
    vi.stubGlobal('document', { querySelector: () => null })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('il foglio si corregge quando il timbro se n’e’ andato, e l’attesa non cambia piu’', () => {
    const accodati: unknown[] = []
    let finita = false
    const h = banco.rendi(() => {
      const timbro = useTimbro((d) => accodati.push(d))
      return { timbro, correzione: useCorrezione(finita, timbro.resto) }
    })
    h.corrente.timbro.timbra(STOP)
    expect(accodati).toEqual([STOP])
    vi.advanceTimersByTime(300)
    h.aggiorna()
    expect(h.corrente.correzione).toBeNull()

    // La fine arriva mentre il timbro e' ancora li': la correzione aspetta il resto.
    finita = true
    h.aggiorna()
    const correzione = h.corrente.correzione
    expect(correzione).toEqual({ attesa: TIMBRO_MS - 300 })
    vi.advanceTimersByTime(500)
    h.aggiorna()
    expect(h.corrente.correzione).toBe(correzione)
  })

  it('senza timbro, o con un timbro gia’ passato, si corregge subito', () => {
    let finita = false
    const h = banco.rendi(() => {
      const timbro = useTimbro(() => {})
      return { timbro, correzione: useCorrezione(finita, timbro.resto) }
    })
    expect(h.corrente.timbro.resto()).toBe(0)
    h.corrente.timbro.timbra(STOP)
    vi.advanceTimersByTime(TIMBRO_MS + 1)
    finita = true
    h.aggiorna()
    expect(h.corrente.correzione).toEqual({ attesa: 0 })
  })
})
