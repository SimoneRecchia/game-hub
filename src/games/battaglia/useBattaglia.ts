import { useCallback, useEffect, useRef, useState } from 'react'
import { BATTAGLIA_POLL_ATTESA_MS, BATTAGLIA_POLL_TURNO_MS } from '@shared/config'
import { coordinata, tipoDi, type Nave } from '@shared/battaglia'
import type { VistaBattaglia } from '@shared/types'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { haptic } from '@/lib/haptics'

/**
 * Quanto aspetta il computer prima di rispondere.
 *
 * Il suo colpo arriva nella stessa risposta del mio — una richiesta sola per
 * turno — ma mostrarli insieme toglierebbe il momento in cui si guarda com'e'
 * andato il proprio. Prima il mio colpo, poi, dopo un respiro, il suo.
 */
const RISPOSTA_COMPUTER_MS = 1_100

/**
 * La vista com'era dopo il mio colpo e prima di quello del computer.
 *
 * Il server manda la partita dopo tutti e due: qui si toglie il suo ultimo
 * colpo, e se e' stato lui a chiudere la partita si torna alla battaglia in
 * corso. Null se il computer non ha risposto — il mio colpo ha affondato
 * l'ultima nave — e non c'e' niente da rimandare.
 */
export function primaDelComputer(prima: VistaBattaglia, dopo: VistaBattaglia): VistaBattaglia | null {
  if (dopo.modalita === 'amici') return null
  if (dopo.colpiSubiti.length <= prima.colpiSubiti.length || !dopo.ultimo || dopo.ultimo.mio) return null
  const mio = dopo.colpiMiei.at(-1)
  if (!mio) return null
  const chiusaDaLui = dopo.stato === 'finita' && dopo.vincitore === 'avversario' && dopo.motivo === 'flotta'
  return {
    ...dopo,
    colpiSubiti: dopo.colpiSubiti.slice(0, -1),
    ultimo: { ...mio, mio: true },
    tuoTurno: false,
    ...(chiusaDaLui
      ? { stato: 'battaglia' as const, vincitore: null, motivo: null, flottaNemica: null, punti: null }
      : {}),
  }
}

/** Quel che si annuncia dopo un colpo, come al tavolo. */
export function annuncio(vista: VistaBattaglia): string | null {
  const u = vista.ultimo
  if (!u) return null
  const dove = coordinata(u.casella)
  const nome = vista.avversario.displayName
  if (u.mio) {
    if (u.esito === 'acqua') return `Acqua in ${dove}`
    if (u.esito === 'colpito') return `Colpito in ${dove}!`
    return `Colpito e affondato: ${tipoDi(u.nave!).nome.toLowerCase()}!`
  }
  if (u.esito === 'acqua') return `${nome} spara in ${dove}: acqua`
  if (u.esito === 'colpito') return `${nome} ti colpisce in ${dove}`
  return `${nome} ti affonda ${tipoDi(u.nave!).la}`
}

/**
 * Una partita di battaglia navale.
 *
 * Fra amici va a polling, e il ritmo cambia con la situazione: stretto quando
 * si aspetta l'altro — il suo colpo deve comparire subito — largo quando tocca
 * a te, perché lì si guarda solo se l'altro si e' arreso. A partita finita il
 * polling si ferma, e a pagina nascosta non parte: le richieste sono contate.
 *
 * Contro il computer non c'e' niente da aspettare, quindi nessun polling: il
 * suo colpo arriva nella risposta al mio.
 */
export function useBattaglia(id: string) {
  const [vista, setVista] = useState<VistaBattaglia | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)
  const [messaggio, setMessaggio] = useState<string | null>(null)
  /** Il computer "sta mirando": il suo colpo e' arrivato ma non si e' ancora visto. */
  const [mira, setMira] = useState(false)
  const colpiVisti = useRef<number | null>(null)
  const timerMessaggio = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerComputer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mostra = useCallback((testo: string) => {
    setMessaggio(testo)
    if (timerMessaggio.current) clearTimeout(timerMessaggio.current)
    timerMessaggio.current = setTimeout(() => setMessaggio(null), 2600)
  }, [])

  const applica = useCallback(
    (v: VistaBattaglia) => {
      setVista(v)
      const colpi = v.colpiMiei.length + v.colpiSubiti.length
      // Un colpo nuovo, di chiunque: l'annuncio, e una vibrazione se ha fatto male.
      if (colpiVisti.current !== null && colpi > colpiVisti.current && v.ultimo) {
        const testo = annuncio(v)
        if (testo) mostra(testo)
        if (v.ultimo.esito !== 'acqua') haptic(v.ultimo.mio ? 'success' : 'error')
      }
      colpiVisti.current = colpi
    },
    [mostra],
  )

  const carica = useCallback(async () => {
    try {
      applica(await api<VistaBattaglia>(`/battaglia/partite/${id}`))
      setErrore(null)
    } catch (err) {
      setErrore(err instanceof ApiFetchError ? err.message : 'Non riesco a caricare la partita.')
    }
  }, [applica, id])

  useEffect(() => {
    colpiVisti.current = null
    void carica()
  }, [carica])

  const finita = vista?.stato === 'finita'
  const fraAmici = vista?.modalita === 'amici'
  const ritmo = vista?.tuoTurno ? BATTAGLIA_POLL_TURNO_MS : BATTAGLIA_POLL_ATTESA_MS
  useEffect(() => {
    if (!vista || finita || !fraAmici) return
    const giro = setInterval(() => {
      if (document.visibilityState === 'visible') void carica()
    }, ritmo)
    const onVisibilita = () => {
      if (document.visibilityState === 'visible') void carica()
    }
    document.addEventListener('visibilitychange', onVisibilita)
    return () => {
      clearInterval(giro)
      document.removeEventListener('visibilitychange', onVisibilita)
    }
  }, [carica, finita, fraAmici, ritmo, vista])

  useEffect(
    () => () => {
      if (timerMessaggio.current) clearTimeout(timerMessaggio.current)
      if (timerComputer.current) clearTimeout(timerComputer.current)
    },
    [],
  )

  const azione = useCallback(
    async (percorso: string, corpo: Record<string, unknown> = {}) => {
      if (!vista) return
      setInviando(true)
      try {
        const dopo = await api<VistaBattaglia>(`/battaglia/partite/${id}/${percorso}`, {
          method: 'POST',
          body: { ...corpo, versione: vista.versione },
        })
        if (dopo.stato === 'finita') dimentica('/oggi')
        const intermedia = primaDelComputer(vista, dopo)
        if (intermedia) {
          // Prima il mio colpo; il suo dopo un respiro, e intanto non si spara.
          applica(intermedia)
          setMira(true)
          await new Promise<void>((risolvi) => {
            timerComputer.current = setTimeout(risolvi, RISPOSTA_COMPUTER_MS)
          })
          setMira(false)
        }
        applica(dopo)
      } catch (err) {
        if (err instanceof ApiFetchError) {
          mostra(err.message)
          if (err.status === 409) void carica()
        } else {
          mostra('Connessione assente: riprova.')
        }
      } finally {
        setInviando(false)
      }
    },
    [applica, carica, id, mostra, vista],
  )

  return {
    vista,
    errore,
    inviando,
    mira,
    messaggio,
    ricarica: carica,
    disponi: (navi: Nave[]) => azione('flotta', { navi }),
    spara: (casella: number) => azione('colpo', { casella }),
    arrenditi: () => azione('resa'),
    reclama: () => azione('reclama'),
  }
}
