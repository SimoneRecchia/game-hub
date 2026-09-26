import { useCallback, useEffect, useRef, useState } from 'react'
import { BATTAGLIA_POLL_ATTESA_MS, BATTAGLIA_POLL_TURNO_MS } from '@shared/config'
import { coordinata, tipoDi, type Nave } from '@shared/battaglia'
import type { VistaBattaglia } from '@shared/types'
import { ApiFetchError, api } from '@/lib/api'
import { haptic } from '@/lib/haptics'

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
 * Una partita di battaglia navale, a polling.
 *
 * Il ritmo cambia con la situazione: stretto quando si aspetta l'altro — il suo
 * colpo deve comparire subito — largo quando tocca a te, perché lì si guarda
 * solo se l'altro si e' arreso. A partita finita il polling si ferma, e a
 * pagina nascosta non parte: le richieste sono contate.
 */
export function useBattaglia(id: string) {
  const [vista, setVista] = useState<VistaBattaglia | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const colpiVisti = useRef<number | null>(null)
  const timerMessaggio = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const ritmo = vista?.tuoTurno ? BATTAGLIA_POLL_TURNO_MS : BATTAGLIA_POLL_ATTESA_MS
  useEffect(() => {
    if (!vista || finita) return
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
  }, [carica, finita, ritmo, vista])

  useEffect(
    () => () => {
      if (timerMessaggio.current) clearTimeout(timerMessaggio.current)
    },
    [],
  )

  const azione = useCallback(
    async (percorso: string, corpo: Record<string, unknown> = {}) => {
      if (!vista) return
      setInviando(true)
      try {
        applica(
          await api<VistaBattaglia>(`/battaglia/partite/${id}/${percorso}`, {
            method: 'POST',
            body: { ...corpo, versione: vista.versione },
          }),
        )
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
    messaggio,
    ricarica: carica,
    disponi: (navi: Nave[]) => azione('flotta', { navi }),
    spara: (casella: number) => azione('colpo', { casella }),
    arrenditi: () => azione('resa'),
    reclama: () => azione('reclama'),
  }
}
