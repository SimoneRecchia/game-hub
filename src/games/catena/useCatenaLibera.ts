import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  JOLLY_CATENA,
  MONTEPREMI_CATENA,
  NASCOSTE_CATENA,
  PASSO_FINALE,
  PREAMBOLO_FINALE_CATENA_MS,
  PREAMBOLO_PAROLA_CATENA_MS,
  PREAMBOLO_RIPRESA_CATENA_MS,
  TEMPO_FINALE_CATENA_MS,
  TEMPO_PAROLA_CATENA_MS,
  applicaCatena,
  compraUsabile,
  jollyUsabile,
  normalizzaCatena,
  parolaRiconosciuta,
  puntiCatena,
  riparteIlMinuto,
  stessaParola,
  svolgiCatena,
  vistaCatena,
  type CatenaDelGiorno,
  type MossaCatena,
} from '@shared/catena'
import { VERSIONE_LIBERE_CATENA } from '@shared/catena-libere'
import { mulberry32 } from '@shared/daily'
import { chiudiSospesa, riprendiSospesa, segnaSospesa, sospesaDi } from '@/games/sospese/registro'
import { adessoVisibile } from '@/lib/tempoVisibile'
import { leggiContiCatena, registraLiberaCatena } from './conti'
import {
  CHIAVE_PARTITA,
  RIPRENDI,
  daSalvare,
  dettaglioDi,
  leggiSalvata,
  nomeDi,
  partitaDa,
  type CatenaSalvata,
} from './sospesa'
import type { ComandiCatena, RispostaCatena, VistaCatena } from './Partita'

/** Il file delle libere: per ogni catena le undici parole e le dieci espressioni. */
interface FileLibere {
  catene: Array<[string[], string[]]>
}

let caricato: Promise<FileLibere> | null = null

/** Il file delle catene, scaricato una volta: sta sotto /dati/, in cache per sempre con la sua impronta. */
function fileLibere(): Promise<FileLibere> {
  caricato ??= fetch(`/dati/catena/libere.json?v=${VERSIONE_LIBERE_CATENA}`).then((r) => {
    if (!r.ok) throw new Error(`Catene: ${r.status}`)
    return r.json() as Promise<FileLibere>
  })
  caricato.catch(() => {
    caricato = null
  })
  return caricato
}

/**
 * Come si gioca una partita: il seme della sfida, se e' una sfida, il tempo di
 * ogni parola e quello della finale, e se va nei conti.
 */
export interface OpzioniPartita {
  seme?: number
  tempoParolaMs?: number
  tempoFinaleMs?: number
  conta?: boolean
}

type Orologio = { inizio: number; scadenza: number }

export interface PartitaCatenaLibera {
  catena: CatenaDelGiorno
  /** Quale catena del file (`nomeDi`), per salvarla. Null in una sfida, che non resta in sospeso. */
  nome: string | null
  tempoParolaMs: number
  tempoFinaleMs: number
  conta: boolean
  /** Si e' premuto Comincia: prima non si vede nessuna parola, come nella classificata. */
  iniziata: boolean
  mosse: MossaCatena[]
  /** Il tempo della parola di adesso, prima della finale, sull'orologio del telefono. */
  parola: Orologio | null
  /** Il tempo della parola finale. */
  finale: Orologio | null
  risposta: string | null
  indovinata: boolean | null
  finita: boolean
}

type Partita = PartitaCatenaLibera

/**
 * L'ora dei tempi di una partita: in una libera si ferma a pagina nascosta,
 * perché lasciata resta in sospeso; in una sfida e' quella di tutti e due.
 */
const oraDi = (p: Partita) => (p.nome ? adessoVisibile() : Date.now())

/** La partita salvata nel telefono, se c'e' ed e' buona. */
function leggiDalTelefono(): CatenaSalvata | null {
  try {
    return leggiSalvata(localStorage.getItem(CHIAVE_PARTITA))
  } catch {
    return null
  }
}

/** Toglie dal telefono la partita salvata. */
function togliSalvata(): void {
  try {
    localStorage.removeItem(CHIAVE_PARTITA)
  } catch {
    /* senza localStorage non c'era niente da togliere */
  }
}

function vistaDa(p: Partita): VistaCatena {
  const s = svolgiCatena(p.catena, p.mosse)
  return {
    chiave: (p.mosse.length + (p.iniziata ? 1 : 0)) * 2 + (p.finita ? 1 : 0),
    nuova: !p.iniziata,
    voci: p.iniziata ? vistaCatena(p.catena, s, { finita: p.finita, indovinata: p.indovinata }) : [],
    passo: s.passo,
    jollyRestanti: JOLLY_CATENA - s.jollyUsati,
    jollyUsabile: !p.finita && jollyUsabile(p.catena, s),
    terzo: s.terzo,
    compraUsabile: !p.finita && compraUsabile(s),
    montepremiIniziale: MONTEPREMI_CATENA,
    montepremi: s.montepremi,
    parola: p.finita ? null : p.parola,
    tempoParolaMs: p.tempoParolaMs,
    finale: p.finita ? null : p.finale,
    tempoFinaleMs: p.tempoFinaleMs,
    risposta: p.risposta,
    indovinata: p.indovinata,
    finita: p.finita,
    punti: p.finita ? puntiCatena(s, p.indovinata === true) : 0,
  }
}

/**
 * La Catena libera: una a caso fra quelle che non sono mai di un giorno, tutta
 * nel telefono, con le stesse regole e i tempi che si scelgono. Non conta per
 * la classifica; il telefono ricorda le ultime giocate per non ripeterle.
 */
export function useCatenaLibera() {
  const [partita, setPartita] = useState<Partita | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [conti, setConti] = useState(leggiContiCatena)
  const ref = useRef(partita)
  ref.current = partita
  /** Il numero della partita: una nuova fa ripartire la scena. */
  const [numero, setNumero] = useState(0)

  const aggiorna = useCallback((p: Partita) => {
    ref.current = p
    setPartita(p)
    return vistaDa(p)
  }, [])

  const chiudi = useCallback(
    (p: Partita, risposta: string | null): RispostaCatena => {
      const finale = p.catena.parole[NASCOSTE_CATENA[PASSO_FINALE]]
      // Come nella classificata, la parola scritta per intero vale la parola giusta.
      const voluta = risposta ? parolaRiconosciuta(p.catena, svolgiCatena(p.catena, p.mosse), risposta) : ''
      const indovinata = stessaParola(finale, voluta)
      const chiusa: Partita = {
        ...p,
        risposta: voluta || null,
        indovinata,
        finita: true,
      }
      const vista = aggiorna(chiusa)
      if (p.conta) setConti(registraLiberaCatena(nomeDi(p.catena.parole), indovinata, vista.punti))
      return { vista, esito: indovinata ? 'giusta' : 'sbagliata' }
    },
    [aggiorna],
  )

  const comincia = useCallback(
    async (opzioni: OpzioniPartita = {}) => {
      setErrore(null)
      try {
        const file = await fileLibere()
        // In una sfida viene dal seme, fra tutte: le gia' giocate non sono le stesse sui due telefoni.
        const caso = opzioni.seme !== undefined ? mulberry32(opzioni.seme) : Math.random
        const giocate = new Set(opzioni.seme !== undefined ? [] : leggiContiCatena().giocate)
        const nuove = file.catene.filter(([p]) => !giocate.has(nomeDi(p)))
        const elenco = nuove.length > 0 ? nuove : file.catene
        const [parole, espressioni] = elenco[Math.floor(caso() * elenco.length)]
        aggiorna({
          catena: { parole, espressioni },
          nome: opzioni.seme === undefined ? nomeDi(parole) : null,
          tempoParolaMs: opzioni.tempoParolaMs ?? TEMPO_PAROLA_CATENA_MS,
          tempoFinaleMs: opzioni.tempoFinaleMs ?? TEMPO_FINALE_CATENA_MS,
          conta: opzioni.conta ?? true,
          iniziata: false,
          mosse: [],
          parola: null,
          finale: null,
          risposta: null,
          indovinata: null,
          finita: false,
        })
        setNumero((n) => n + 1)
      } catch {
        setErrore('Non riesco a scaricare le catene. Riprova fra poco.')
      }
    },
    [aggiorna],
  )

  /** Il tempo della finale e' finito: oltre non si gioca, come nella classificata. */
  const scaduta = (p: Partita) => p.finale !== null && oraDi(p) > p.finale.scadenza

  const comandi = useMemo<ComandiCatena>(() => {
    const gioca = async (mossa: MossaCatena): Promise<RispostaCatena | null> => {
      const p = ref.current
      if (!p || p.finita || !p.iniziata) return null
      if (scaduta(p)) return chiudi(p, null)
      const prima = svolgiCatena(p.catena, p.mosse)
      // Una parola provata a tempo finito e' il tempo finito: la parola si mostra. Una scritta per intero, con le
      // lettere che si vedevano gia', e' la parola giusta, come nella classificata.
      const vera: MossaCatena =
        mossa.k !== 'p'
          ? mossa
          : p.parola && oraDi(p) > p.parola.scadenza
            ? { k: 't' }
            : { k: 'p', w: parolaRiconosciuta(p.catena, prima, mossa.w) }
      const fatta = applicaCatena(p.catena, prima, vera)
      if (!fatta) return null
      const adesso = oraDi(p)
      const cambia = fatta.dopo.passo !== prima.passo
      const finale = cambia && fatta.dopo.passo >= PASSO_FINALE
      // Un errore o un jolly fanno ripartire il minuto della parola, come nella classificata.
      const riparte = !cambia && p.parola !== null && riparteIlMinuto(fatta.esito)
      const inizioParola = adesso + (riparte ? PREAMBOLO_RIPRESA_CATENA_MS : PREAMBOLO_PAROLA_CATENA_MS)
      const inizioFinale = adesso + PREAMBOLO_FINALE_CATENA_MS
      const vista = aggiorna({
        ...p,
        mosse: [...p.mosse, vera],
        parola:
          !cambia && !riparte
            ? p.parola
            : finale
              ? null
              : { inizio: inizioParola, scadenza: inizioParola + p.tempoParolaMs },
        finale: finale ? { inizio: inizioFinale, scadenza: inizioFinale + p.tempoFinaleMs } : p.finale,
      })
      return { vista, esito: fatta.esito }
    }
    return {
      inizia: async () => {
        const p = ref.current
        if (!p || p.finita) return null
        if (p.iniziata) return { vista: vistaDa(p), esito: null }
        const inizio = oraDi(p) + PREAMBOLO_PAROLA_CATENA_MS
        return {
          vista: aggiorna({ ...p, iniziata: true, parola: { inizio, scadenza: inizio + p.tempoParolaMs } }),
          esito: null,
        }
      },
      scadeParola: () => gioca({ k: 't' }),
      prova: (parola) => gioca({ k: 'p', w: normalizzaCatena(parola) }),
      jolly: () => gioca({ k: 'j' }),
      compra: () => gioca({ k: 'c' }),
      rispondi: async (parola) => {
        const p = ref.current
        if (!p || p.finita) return null
        return chiudi(p, scaduta(p) ? null : parola)
      },
      scade: () => {
        const p = ref.current
        if (p && !p.finita) chiudi(p, null)
      },
    }
  }, [aggiorna, chiudi])

  /*
   * Una libera cominciata resta in sospeso: si salva a ogni mossa, e quando la
   * pagina si nasconde o si lascia, con quanto mancava al tempo di adesso.
   * Finita, se ne va dal telefono e dal registro.
   */
  const salva = useCallback(() => {
    const p = ref.current
    const salvata = p && daSalvare(p, adessoVisibile())
    if (!salvata) return
    try {
      localStorage.setItem(CHIAVE_PARTITA, JSON.stringify(salvata))
    } catch {
      /* Safari privato nega lo storage: la partita resta finché la pagina e' aperta */
    }
  }, [])
  useEffect(() => {
    if (!partita?.nome || !partita.iniziata) return
    if (partita.finita) {
      togliSalvata()
      chiudiSospesa('catena', 'finita')
      return
    }
    salva()
    segnaSospesa('catena', { a: RIPRENDI, dettaglio: dettaglioDi(partita), chiavi: [CHIAVE_PARTITA] })
  }, [partita, salva])
  useEffect(() => {
    const nascosta = () => document.hidden && salva()
    document.addEventListener('visibilitychange', nascosta)
    window.addEventListener('pagehide', salva)
    return () => {
      document.removeEventListener('visibilitychange', nascosta)
      window.removeEventListener('pagehide', salva)
      salva()
    }
  }, [salva])

  const [riprendendo, setRiprendendo] = useState(false)
  /**
   * Riapre la partita lasciata, dov'era. Un salvataggio senza la sua voce nel
   * registro e' stato lasciato dalle Libere, o e' scaduto: non c'e' piu'.
   */
  const riprendi = useCallback(async (): Promise<boolean> => {
    const salvata = leggiDalTelefono()
    if (!salvata || !sospesaDi('catena')) {
      togliSalvata()
      chiudiSospesa('catena', 'annullata')
      return false
    }
    setErrore(null)
    setRiprendendo(true)
    try {
      const file = await fileLibere()
      const voce = file.catene.find(([parole]) => nomeDi(parole) === salvata.nome)
      if (!voce) {
        // Il file e' cambiato e quella catena non c'e' piu'.
        togliSalvata()
        chiudiSospesa('catena', 'annullata')
        return false
      }
      aggiorna(partitaDa(salvata, { parole: voce[0], espressioni: voce[1] }, adessoVisibile()))
      setNumero((n) => n + 1)
      riprendiSospesa('catena')
      return true
    } catch {
      setErrore('Non riesco a scaricare le catene. Riprova fra poco.')
      return false
    } finally {
      setRiprendendo(false)
    }
  }, [aggiorna])

  /** Lascia la partita in corso, o quella in sospeso prima di cominciarne un'altra: non si riprende piu'. */
  const lascia = useCallback(() => {
    togliSalvata()
    chiudiSospesa('catena', 'annullata')
    ref.current = null
    setPartita(null)
  }, [])

  const vista = useMemo(() => (partita ? vistaDa(partita) : null), [partita])
  const ricomincia = useCallback(() => {
    ref.current = null
    setPartita(null)
  }, [])
  /** L'ora dei tempi della scena: quella della partita, che da sola si ferma a pagina nascosta. */
  const adesso = partita?.nome ? adessoVisibile : Date.now
  return { vista, comandi, comincia, ricomincia, riprendi, riprendendo, lascia, errore, conti, numero, adesso }
}
