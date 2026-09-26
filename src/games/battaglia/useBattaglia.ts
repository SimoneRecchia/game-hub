import { useCallback, useEffect, useRef, useState } from 'react'
import { BATTAGLIA_POLL_ATTESA_MS, BATTAGLIA_POLL_TURNO_MS } from '@shared/config'
import type { Nave } from '@shared/battaglia'
import type { VistaBattaglia } from '@shared/types'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import { haptic } from '@/lib/haptics'
import { DURATA_ANNUNCIO_MS, annuncioDi, primaDelComputer, senzaFine, type Annuncio } from './racconto'

/** Dopo un colpo in acqua, prima che il computer prenda la mira: il tempo di vedere lo spruzzo. */
const PAUSA_ACQUA_MS = 450

/**
 * Il mirino del computer sul mio mare, prima che arrivi il suo colpo.
 *
 * Il colpo e' gia' arrivato, nella stessa risposta del mio — una richiesta sola
 * per turno — ma mostrarli insieme toglierebbe il momento in cui si guarda
 * com'e' andato il proprio. Prima il mio, poi il suo mirino che cerca, poi il
 * suo colpo.
 */
export const MIRA_MS = 850

/** Quanto resta scritto un errore nella riga di stato. */
const AVVISO_MS = 3_200

const totaleColpi = (v: VistaBattaglia) => v.colpiMiei.length + v.colpiSubiti.length

/**
 * Una partita di battaglia navale.
 *
 * Fra amici va a polling, e il ritmo cambia con la situazione: stretto quando
 * si aspetta l'altro — il suo colpo deve comparire subito — largo quando tocca
 * a te, perché lì si guarda solo se l'altro si e' arreso. A partita finita il
 * polling si ferma, e a pagina nascosta non parte: le richieste sono contate.
 *
 * Contro il computer non c'e' niente da aspettare, quindi nessun polling: il
 * suo colpo arriva nella risposta al mio, e qui lo si racconta un pezzo per
 * volta.
 */
export function useBattaglia(id: string) {
  const [vista, setVista] = useState<VistaBattaglia | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inviando, setInviando] = useState(false)
  /** Un errore da dire nella riga di stato, al posto della notizia dell'ultimo colpo. */
  const [avviso, setAvviso] = useState<string | null>(null)
  /** Il colpo che conta, al centro dello schermo. */
  const [annuncio, setAnnuncio] = useState<Annuncio | null>(null)
  /** La casella dove ho appena sparato, mentre la risposta arriva. */
  const [mirata, setMirata] = useState<number | null>(null)
  /** La casella dove il computer sta per sparare: il suo mirino la cerca. */
  const [mira, setMira] = useState<number | null>(null)
  const colpiVisti = useRef<number | null>(null)
  /** Mentre si racconta un turno, il polling non deve saltare avanti. */
  const racconto = useRef(false)
  const timer = useRef(new Set<ReturnType<typeof setTimeout>>())
  const timerAvviso = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerAnnuncio = useRef<ReturnType<typeof setTimeout> | null>(null)

  const aspetta = useCallback(
    (ms: number) =>
      new Promise<void>((risolvi) => {
        const t = setTimeout(() => {
          timer.current.delete(t)
          risolvi()
        }, ms)
        timer.current.add(t)
      }),
    [],
  )

  const avvisa = useCallback((testo: string) => {
    setAvviso(testo)
    if (timerAvviso.current) clearTimeout(timerAvviso.current)
    timerAvviso.current = setTimeout(() => setAvviso(null), AVVISO_MS)
  }, [])

  const annuncia = useCallback((a: Annuncio) => {
    setAnnuncio(a)
    if (timerAnnuncio.current) clearTimeout(timerAnnuncio.current)
    timerAnnuncio.current = setTimeout(() => setAnnuncio(null), DURATA_ANNUNCIO_MS[a.esito])
  }, [])

  /**
   * Mostra una vista, e se porta un colpo nuovo lo racconta: la vibrazione,
   * l'annuncio se ha fatto male, e il tempo di guardarlo. Se il colpo ha chiuso
   * la partita la fine arriva dopo l'annuncio, non al posto suo.
   *
   * `attendi` e' per quando dopo viene altro — il colpo del computer — e il
   * colpo va lasciato finire prima.
   */
  const mostra = useCallback(
    async (v: VistaBattaglia, attendi: boolean) => {
      const nuovo = colpiVisti.current !== null && totaleColpi(v) > colpiVisti.current && v.ultimo !== null
      colpiVisti.current = totaleColpi(v)
      if (!nuovo) {
        setVista(v)
        return
      }
      const chiusa = senzaFine(v) !== v
      setVista(chiusa ? senzaFine(v) : v)
      const u = v.ultimo!
      const a = annuncioDi(v)
      if (a) {
        annuncia(a)
        haptic(u.mio ? 'success' : 'error')
      }
      if (attendi || chiusa) {
        await aspetta(a ? DURATA_ANNUNCIO_MS[a.esito] : PAUSA_ACQUA_MS)
      }
      if (chiusa) setVista(v)
    },
    [annuncia, aspetta],
  )

  const carica = useCallback(async () => {
    try {
      const v = await api<VistaBattaglia>(`/battaglia/partite/${id}`)
      setErrore(null)
      if (racconto.current) return
      racconto.current = true
      try {
        await mostra(v, false)
      } finally {
        racconto.current = false
      }
    } catch (err) {
      setErrore(err instanceof ApiFetchError ? err.message : 'Non riesco a caricare la partita.')
    }
  }, [id, mostra])

  useEffect(() => {
    colpiVisti.current = null
    void carica()
  }, [carica])

  const finita = vista?.stato === 'finita'
  const fraAmici = vista?.modalita === 'amici'
  const ritmo = vista?.tuoTurno ? BATTAGLIA_POLL_TURNO_MS : BATTAGLIA_POLL_ATTESA_MS
  const inCorso = vista !== null && !finita
  useEffect(() => {
    if (!inCorso || !fraAmici) return
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
  }, [carica, fraAmici, inCorso, ritmo])

  useEffect(() => {
    const attesi = timer.current
    return () => {
      for (const t of attesi) clearTimeout(t)
      if (timerAvviso.current) clearTimeout(timerAvviso.current)
      if (timerAnnuncio.current) clearTimeout(timerAnnuncio.current)
    }
  }, [])

  const azione = useCallback(
    async (percorso: string, corpo: Record<string, unknown> = {}) => {
      if (!vista || racconto.current) return
      setInviando(true)
      racconto.current = true
      try {
        const dopo = await api<VistaBattaglia>(`/battaglia/partite/${id}/${percorso}`, {
          method: 'POST',
          body: { ...corpo, versione: vista.versione },
        })
        setMirata(null)
        if (dopo.stato === 'finita') dimentica('/oggi')
        const intermedia = primaDelComputer(vista, dopo)
        if (intermedia) {
          // Prima il mio colpo; poi il mirino del computer che cerca, e intanto non si spara.
          await mostra(intermedia, true)
          setMira(dopo.ultimo!.casella)
          await aspetta(MIRA_MS)
          setMira(null)
        }
        await mostra(dopo, false)
      } catch (err) {
        setMirata(null)
        if (err instanceof ApiFetchError) {
          avvisa(err.message)
          if (err.status === 409) {
            racconto.current = false
            void carica()
          }
        } else {
          avvisa('Connessione assente: riprova.')
        }
      } finally {
        racconto.current = false
        setInviando(false)
      }
    },
    [aspetta, avvisa, carica, id, mostra, vista],
  )

  return {
    vista,
    errore,
    inviando,
    avviso,
    annuncio,
    mirata,
    mira,
    ricarica: carica,
    disponi: (navi: Nave[]) => azione('flotta', { navi }),
    spara: (casella: number) => {
      if (!vista || racconto.current) return
      setMirata(casella)
      void azione('colpo', { casella })
    },
    arrenditi: () => azione('resa'),
    reclama: () => azione('reclama'),
  }
}
