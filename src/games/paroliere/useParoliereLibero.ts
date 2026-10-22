import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ROTTE } from '@/app/rotte'
import { grigliaDelParoliere, paroleDelParoliere } from '@/games/scarabeo/computer'
import { chiudiSospesa, riprendiSospesa, segnaSospesa, sospesaDi } from '@/games/sospese/registro'
import {
  LETTERE_MINIME,
  TEMPO_PAROLIERE_MS,
  punteggioDi,
  puntiParola,
  stradaDi,
  traguardoDi,
  type LatoParoliere,
} from '@shared/paroliere'
import { leggiContiParoliere, registraLiberaParoliere } from './conti'
import type { ComandiParoliere, EsitoProva, VistaParoliere } from './Partita'
import {
  CHIAVE_PARTITA_PAROLIERE,
  dettaglioParoliere,
  leggiPartitaParoliere,
  salvaPartitaParoliere,
  type PartitaParoliereSalvata,
} from './sospesa'

export const LATI_LIBERI = ['4', '5'] as const
export type LatoLibero = (typeof LATI_LIBERI)[number]

/** Dove si riprende un Paroliere lasciato: la pagina lo riapre da sola. */
export const RIPRENDI_PAROLIERE = `${ROTTE.libera('paroliere')}?riprendi=1`

/** Ogni quanto si salva il tempo che resta, fra una parola e l'altra. */
const SALVA_TEMPO_MS = 5_000

/** Come si gioca una partita: il seme della sfida, se e' una sfida, il tempo, e se va nei conti del telefono. */
export interface OpzioniPartita {
  seme?: number
  tempoMs?: number
  conta?: boolean
}

interface Partita {
  lato: LatoParoliere
  seme: number | undefined
  tempoMs: number
  conta: boolean
  griglia: string[] | null
  /** I dadi di una partita ripresa: la griglia c'e' gia', e il lavoratore ne ritrova le parole. */
  dadi: string[] | null
  /** Tutte le parole della griglia che il dizionario conosce: valgono queste. */
  tutte: Set<string>
  comuni: string[]
  trovate: string[]
  /** Quando finisce il tempo, mentre corre. */
  scadenza: number | null
  /** Il tempo che resta a clessidra ferma: prima del via, a pagina nascosta, in una partita ripresa. */
  rimastiMs: number
  /** La clessidra si e' girata: da qui la partita e' in gioco, anche ferma. */
  avviata: boolean
  finita: boolean
}

/** Quanto resta adesso: dalla scadenza se il tempo corre, se no quel che restava. */
const rimastiDi = (p: Partita, adesso = Date.now()) =>
  p.scadenza === null ? p.rimastiMs : Math.max(0, Math.min(p.tempoMs, p.scadenza - adesso))

/** Quel che resta di una partita in gioco, nel `localStorage`: i dadi, le parole trovate, il tempo. */
function salvataggioDi(p: Partita | null): PartitaParoliereSalvata | null {
  if (!p || !p.avviata || p.finita) return null
  const griglia = p.griglia ?? p.dadi
  if (!griglia) return null
  return { lato: p.lato, tempoMs: p.tempoMs, griglia, trovate: p.trovate, rimastiMs: rimastiDi(p) }
}

/** Salva la partita, e il suo biglietto fra le sospese dice il tempo che resta e le parole. */
function segna(s: PartitaParoliereSalvata): void {
  salvaPartitaParoliere(s)
  segnaSospesa('paroliere', {
    a: RIPRENDI_PAROLIERE,
    dettaglio: dettaglioParoliere(s),
    chiavi: [CHIAVE_PARTITA_PAROLIERE],
  })
}

/**
 * La partita lasciata a meta', se il registro delle sospese la conosce ancora:
 * lasciata dalle Libere, o scaduta, la sua voce se ne e' andata, e il
 * salvataggio rimasto non vale; e una voce senza salvataggio non ha niente da
 * riprendere.
 */
function partitaInSospeso(): PartitaParoliereSalvata | null {
  const p = leggiPartitaParoliere()
  const voce = sospesaDi('paroliere')
  if (p && !voce) {
    salvaPartitaParoliere(null)
    return null
  }
  if (!p && voce) chiudiSospesa('paroliere', 'annullata')
  return p
}

/** Una partita ripresa: la scatola si riapre sui dadi di allora, con il tempo che restava. */
function daRiprendere(s: PartitaParoliereSalvata): Partita {
  return {
    lato: s.lato,
    seme: undefined,
    tempoMs: s.tempoMs,
    conta: true,
    griglia: null,
    dadi: s.griglia,
    tutte: new Set(),
    comuni: [],
    trovate: s.trovate,
    scadenza: null,
    rimastiMs: s.rimastiMs,
    avviata: false,
    finita: false,
  }
}

/**
 * Il Paroliere libero: i dadi li tira il telefono, nel lavoratore dello
 * Scarabeo, che ha gia' il dizionario e trova tutte le parole della griglia in
 * un colpo. Da li' ogni parola si controlla subito, senza rete. Il tempo parte
 * quando i dadi sono fermi, e la partita non va al server. In una sfida i dadi
 * cadono dal seme, uguali per tutti e due, e la partita non va nei conti.
 *
 * Con `salva` la partita resta in sospeso quando la si lascia: si salva a ogni
 * parola, e a pagina nascosta la clessidra si ferma. Con `riprendi` la pagina
 * si apre sulla partita lasciata, e i dadi ricadono come erano. La sfida non
 * salva niente: il suo tempo e' quello dei due telefoni insieme.
 */
export function useParoliereLibero({ salva = false, riprendi: subito = false } = {}) {
  const [iniziale] = useState(() => {
    const s = salva && subito ? partitaInSospeso() : null
    return s ? daRiprendere(s) : null
  })
  const [partita, setPartita] = useState<Partita | null>(iniziale)
  const [errore, setErrore] = useState<string | null>(null)
  const [conti, setConti] = useState(leggiContiParoliere)
  /** Il numero della partita: una nuova fa ripartire la scena. */
  const [numero, setNumero] = useState(0)
  const ref = useRef(partita)
  ref.current = partita

  const aggiorna = useCallback((p: Partita | null) => {
    ref.current = p
    setPartita(p)
  }, [])

  // Ritrovata la partita lasciata, lo si dice al registro una volta sola; senza, ci si mette d'accordo con lui.
  const vistoIniziale = useRef(false)
  useEffect(() => {
    if (!salva || vistoIniziale.current) return
    vistoIniziale.current = true
    if (iniziale) riprendiSospesa('paroliere')
    else partitaInSospeso()
  }, [salva, iniziale])

  const comincia = useCallback(
    (lato: LatoLibero, opzioni: OpzioniPartita = {}) => {
      setErrore(null)
      // Una partita nuova prende il posto di quella lasciata: la pagina l'ha chiesto prima.
      if (salva) {
        salvaPartitaParoliere(null)
        chiudiSospesa('paroliere', 'annullata')
      }
      const tempoMs = opzioni.tempoMs ?? TEMPO_PAROLIERE_MS
      aggiorna({
        lato: Number(lato) as LatoParoliere,
        seme: opzioni.seme,
        tempoMs,
        conta: opzioni.conta ?? true,
        griglia: null,
        dadi: null,
        tutte: new Set(),
        comuni: [],
        trovate: [],
        scadenza: null,
        rimastiMs: tempoMs,
        avviata: false,
        finita: false,
      })
      setNumero((n) => n + 1)
    },
    [aggiorna, salva],
  )

  const riprendi = useCallback(() => {
    const s = partitaInSospeso()
    if (!s) return
    setErrore(null)
    aggiorna(daRiprendere(s))
    setNumero((n) => n + 1)
    riprendiSospesa('paroliere')
  }, [aggiorna])

  const lascia = useCallback(() => {
    salvaPartitaParoliere(null)
    chiudiSospesa('paroliere', 'annullata')
    aggiorna(null)
  }, [aggiorna])

  const chiudi = useCallback(() => {
    const p = ref.current
    if (!p || p.finita || !p.griglia) return
    aggiorna({ ...p, finita: true, rimastiMs: rimastiDi(p) })
    if (p.conta) setConti(registraLiberaParoliere(p.lato, p.trovate.length, punteggioDi(p.trovate)))
  }, [aggiorna])

  const comandi = useMemo<ComandiParoliere>(
    () => ({
      inizia: async () => {
        const p = ref.current
        if (!p) return false
        try {
          const g = p.dadi ? await paroleDelParoliere(p.dadi) : await grigliaDelParoliere(p.lato, p.seme)
          if (ref.current !== p) return false
          aggiorna({ ...p, griglia: g.griglia, tutte: new Set(g.tutte), comuni: g.comuni })
          return true
        } catch {
          setErrore('Il dizionario non è arrivato. Riprova fra poco.')
          return false
        }
      },
      parti: () => {
        const p = ref.current
        if (p && !p.avviata) aggiorna({ ...p, avviata: true, scadenza: Date.now() + p.rimastiMs })
      },
      prova: async (parola): Promise<EsitoProva> => {
        const p = ref.current
        if (!p?.griglia || p.finita || p.scadenza === null || Date.now() > p.scadenza) {
          return { esito: 'tempo', valore: 0 }
        }
        if (parola.length < LETTERE_MINIME) return { esito: 'corta', valore: 0 }
        if (!stradaDi(p.griglia, parola)) return { esito: 'griglia', valore: 0 }
        if (p.trovate.includes(parola)) return { esito: 'gia', valore: 0 }
        if (!p.tutte.has(parola)) return { esito: 'sconosciuta', valore: 0 }
        aggiorna({ ...p, trovate: [...p.trovate, parola] })
        return { esito: 'nuova', valore: puntiParola(parola.length) }
      },
      basta: async () => chiudi(),
      scade: () => chiudi(),
    }),
    [aggiorna, chiudi],
  )

  // Ogni parola si salva, con il biglietto delle sospese; finita la partita, il salvataggio se ne va.
  const avviata = partita?.avviata ?? false
  const finita = partita?.finita ?? false
  const trovate = partita?.trovate
  useEffect(() => {
    if (!salva || !avviata) return
    if (finita) {
      salvaPartitaParoliere(null)
      chiudiSospesa('paroliere', 'finita')
      return
    }
    const s = salvataggioDi(ref.current)
    if (s) segna(s)
  }, [salva, avviata, finita, trovate])

  /*
   * Il tempo si salva anche fra una parola e l'altra: ogni tanto, a pagina
   * nascosta, e uscendo. A pagina nascosta la clessidra si ferma su quel che
   * restava, e tornando riparte da li'.
   */
  const inGioco = salva && avviata && !finita
  useEffect(() => {
    if (!inGioco) return
    const salvaOra = () => {
      const s = salvataggioDi(ref.current)
      if (s) salvaPartitaParoliere(s)
    }
    const segnaOra = () => {
      const s = salvataggioDi(ref.current)
      if (s) segna(s)
    }
    const onVisibilita = () => {
      const p = ref.current
      if (!p || !p.avviata || p.finita) return
      if (document.visibilityState === 'hidden') {
        if (p.scadenza !== null) aggiorna({ ...p, scadenza: null, rimastiMs: rimastiDi(p) })
        segnaOra()
      } else if (p.scadenza === null) {
        aggiorna({ ...p, scadenza: Date.now() + p.rimastiMs })
      }
    }
    document.addEventListener('visibilitychange', onVisibilita)
    window.addEventListener('pagehide', segnaOra)
    const id = window.setInterval(salvaOra, SALVA_TEMPO_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilita)
      window.removeEventListener('pagehide', segnaOra)
      window.clearInterval(id)
      segnaOra()
    }
  }, [inGioco, aggiorna])

  const vista = useMemo<VistaParoliere | null>(() => {
    if (!partita) return null
    const { griglia, finita: chiusa, scadenza } = partita
    return {
      fase: chiusa ? 'finita' : griglia && partita.avviata ? 'gioca' : 'nuova',
      griglia,
      lato: partita.lato,
      scadenza: chiusa ? null : scadenza,
      tempoMs: partita.tempoMs,
      fermo: partita.rimastiMs,
      trovate: partita.trovate,
      punteggio: punteggioDi(partita.trovate),
      // Il traguardo e' misurato sulla griglia di sedici in tre minuti: altrimenti non vorrebbe dire niente.
      traguardo:
        partita.lato === 4 && partita.tempoMs === TEMPO_PAROLIERE_MS && griglia ? traguardoDi(partita.comuni) : null,
      comuni: chiusa ? partita.comuni : null,
    }
  }, [partita])

  const ricomincia = useCallback(() => {
    aggiorna(null)
  }, [aggiorna])

  return {
    vista,
    comandi,
    comincia,
    ricomincia,
    riprendi,
    lascia,
    errore,
    conti,
    numero,
    lato: partita?.lato ?? null,
  }
}
