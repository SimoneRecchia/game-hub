/**
 * La Catena: undici parole, ognuna legata alla successiva da un'espressione
 * (spirito LIBERO, tiro libero, TIRO da cavallo...), e una su due da indovinare.
 *
 * Si gioca come l'ultima catena di Reazione a catena, su Rai 1. Si vedono due
 * parole e in mezzo la prima lettera di quella che le lega, senza sapere quanto
 * e' lunga; trovata quella, si scende: la terza parola e una nuova, e in mezzo
 * la prossima da indovinare. Ogni parola ha un minuto, che riparte dopo una
 * risposta sbagliata o un jolly. Una risposta sbagliata toglie sei punti al
 * montepremi e mostra un'altra lettera; una seconda mostra la parola, e si va
 * avanti; il minuto finito la mostra come due errori. Due jolly mostrano una
 * lettera senza costare niente, ma non nella finale.
 *
 * L'ultima parola e' quella decisiva: si vede la parola prima — l'ultima della
 * catena — e della finale le prime due lettere e l'ultima, ma non il terzo
 * elemento, la parola dopo. Comprarlo costa quanto un errore; chi arriva con
 * tutti e due i jolly lo ha in regalo. C'e' un minuto e mezzo per una risposta
 * sola: giusta vale il montepremi, che non scende sotto cinquanta, sbagliata
 * venti.
 *
 * Le catene vengono dalle espressioni scritte a mano per la Ghigliottina e
 * dal Wikizionario (scripts/build-catena.mjs).
 */

import { mulberry32, solutionPermutation } from './daily'
import { LOSS_POINTS } from './scoring'

export const NOME_CATENA = 'Catena'

/** Le parole di una catena: quattro da indovinare, la finale e il terzo elemento, con le date fra loro. */
export const PAROLE_CATENA = 11

/** I posti delle parole da indovinare, in ordine: le quattro della catena, poi la finale. */
export const NASCOSTE_CATENA = [1, 3, 5, 7, 9] as const
export const DA_INDOVINARE_CATENA = NASCOSTE_CATENA.length

/** Il passo della parola finale, e il posto del suo terzo elemento. */
export const PASSO_FINALE = 4
export const POSTO_TERZO = 10

/** Il montepremi di partenza: cento, come ogni classificata e come la Ghigliottina, che si gioca allo stesso modo. */
export const MONTEPREMI_CATENA = 100
export const MASSIMO_CATENA = MONTEPREMI_CATENA

/**
 * Quel che toglie un errore, o il terzo elemento comprato. Gli errori possibili
 * sono otto, due per parola, quindi un errore vale un po' meno del gradino del
 * Wordle: chi le sbaglia tutte arriva al fondo del montepremi, e il fondo e'
 * cinquanta, quanto il Wordle indovinato al sesto tentativo.
 */
export const ERRORE_CATENA = 6

/** Il montepremi non scende sotto questo: la parola finale indovinata vale sempre almeno la meta'. */
export const FONDO_CATENA = 50

/** La parola finale sbagliata, o non data: quanto una parola del Wordle non indovinata. */
export const PUNTI_CATENA_PERSA = LOSS_POINTS

/** I jolly: una lettera in piu', senza costare niente. */
export const JOLLY_CATENA = 2

/** Gli errori che una parola della catena regge: al secondo si vede, e si va avanti. */
export const ERRORI_PER_PAROLA = 2

/** Il tempo della parola finale: un minuto e mezzo, come quello della Ghigliottina. */
export const TEMPO_FINALE_CATENA_MS = 90_000

/**
 * Il minuto di ogni parola della catena. Finito, la parola si mostra e costa
 * come i due errori che l'avrebbero mostrata: senza un tempo chi ci pensa
 * abbastanza troverebbe ogni parola, e gli errori non costerebbero niente a chi
 * non prova finché non e' sicuro. Una risposta sbagliata o un jolly lo fanno
 * ripartire: c'e' una lettera nuova, e un minuto per pensarci.
 */
export const TEMPO_PAROLA_CATENA_MS = 60_000

/**
 * Quanto aspetta il minuto che riparte: il tempo che la scena mette a far cadere
 * le lettere sbagliate e ad accendere quella nuova.
 */
export const PREAMBOLO_RIPRESA_CATENA_MS = 1_500

/** Le mosse dopo cui il minuto della parola riparte: una lettera nuova, e la parola ancora da trovare. */
export function riparteIlMinuto(esito: EsitoMossaCatena): boolean {
  return esito === 'sbagliata' || esito === 'jolly'
}

/**
 * Quanto aspetta il minuto di una parola: il tempo che la scena mette a
 * portarla al centro, dopo Comincia o dopo la parola di prima. Come quello
 * della finale, parte da solo, scritto con la mossa che ci porta.
 */
export const PREAMBOLO_PAROLA_CATENA_MS = 2_500

/**
 * Quanto aspetta il minuto, arrivati alla finale: il tempo che la scena mette a
 * presentarla. Il minuto parte da solo, scritto con la mossa che ci porta, perché
 * la finale si vede appena ci si arriva: se lo facesse partire il telefono, chi
 * volesse pensarci con calma non lo farebbe partire.
 */
export const PREAMBOLO_FINALE_CATENA_MS = 4_500

/** Quanto arriva in ritardo una risposta per la rete e vale lo stesso, come nel quiz. */
export const MARGINE_CATENA_MS = 3_000

/**
 * Il montepremi dopo `errori` errori o acquisti: sei in meno per ognuno, e mai
 * meno di cinquanta. Alla televisione ogni errore lo dimezza, e cosi' era anche
 * qui: due errori lasciavano un quarto, e una giornata storta non valeva piu'
 * niente.
 */
export function montepremiCatena(errori: number): number {
  return Math.max(FONDO_CATENA, MONTEPREMI_CATENA - ERRORE_CATENA * Math.max(0, errori))
}

const ACCENTI: Record<string, string> = {
  à: 'a',
  á: 'a',
  è: 'e',
  é: 'e',
  ì: 'i',
  í: 'i',
  ò: 'o',
  ó: 'o',
  ù: 'u',
  ú: 'u',
}

/** Una parola come la confronta il gioco: minuscola, senza accenti, solo lettere. */
export function normalizzaCatena(parola: string): string {
  return parola
    .toLowerCase()
    .replace(/[àáèéìíòóùú]/g, (c) => ACCENTI[c])
    .replace(/[^a-z]/g, '')
}

export function stessaParola(giusta: string, tentativo: string): boolean {
  const t = normalizzaCatena(tentativo)
  return t.length > 0 && t === normalizzaCatena(giusta)
}

/** Una catena: le undici parole, e le dieci espressioni che legano ognuna alla successiva. */
export interface CatenaDelGiorno {
  parole: string[]
  espressioni: string[]
}

/** Una catena dell'elenco, come la scrive scripts/build-catena.mjs. */
export interface CatenaDellElenco {
  p: string[]
  e: string[]
}

/**
 * Una mossa: una parola provata, un jolly, il terzo elemento comprato, il tempo
 * di una parola finito (`t`). La risposta finale sta a parte.
 */
export type MossaCatena = { k: 'p'; w: string } | { k: 'j' } | { k: 'c' } | { k: 't' }

export interface ParolaSvolta {
  /** Quante lettere si vedono, dall'inizio. */
  lettere: number
  errori: number
  esito: 'giusta' | 'rivelata' | null
}

export type TerzoElemento = 'no' | 'comprato' | 'regalato'

export interface Svolgimento {
  /** La parola da indovinare: da 0 a 3 nella catena, 4 la finale. */
  passo: number
  parole: ParolaSvolta[]
  jollyUsati: number
  terzo: TerzoElemento
  /** Gli errori che costano: le risposte sbagliate, i minuti finiti (come due errori) e il terzo elemento comprato. */
  errori: number
  montepremi: number
}

/** Le lettere che si vedono di una parola appena arrivata: la prima, e per la finale anche la seconda. */
function lettereIniziali(passo: number): number {
  return passo === PASSO_FINALE ? 2 : 1
}

/** Le lettere ancora nascoste: della finale si vede anche l'ultima. */
export function nascosteDi(catena: CatenaDelGiorno, passo: number, lettere: number): number {
  const parola = normalizzaCatena(catena.parole[NASCOSTE_CATENA[passo]])
  return parola.length - lettere - (passo === PASSO_FINALE ? 1 : 0)
}

export function inizio(): Svolgimento {
  return {
    passo: 0,
    parole: NASCOSTE_CATENA.map((_, i) => ({ lettere: lettereIniziali(i), errori: 0, esito: null })),
    jollyUsati: 0,
    terzo: 'no',
    errori: 0,
    montepremi: MONTEPREMI_CATENA,
  }
}

export type EsitoMossaCatena = 'giusta' | 'sbagliata' | 'rivelata' | 'scaduta' | 'jolly' | 'comprato'

/**
 * Una mossa sulla partita, o null se non si puo' fare: una parola, o il suo
 * tempo finito, quando c'e' una parola della catena da indovinare; un jolly
 * quando ne resta uno, si e' ancora nella catena e la parola ha almeno due
 * lettere nascoste (l'ultima resta da trovare); il terzo elemento nella finale,
 * se non c'e' gia'. Una funzione pura: il server e il telefono della libera ci
 * fanno passare le stesse mosse.
 */
export function applicaCatena(
  catena: CatenaDelGiorno,
  s: Svolgimento,
  mossa: MossaCatena,
): { dopo: Svolgimento; esito: EsitoMossaCatena } | null {
  const parole = s.parole.map((p) => ({ ...p }))
  const corrente = parole[s.passo]
  const avanti = (passo: number) => ({
    passo,
    // Si arriva alla finale con tutti e due i jolly: il terzo elemento e' un regalo.
    terzo: passo === PASSO_FINALE && s.jollyUsati === 0 ? ('regalato' as const) : s.terzo,
  })
  if (mossa.k === 't') {
    // Il tempo finito mostra la parola, e costa gli errori che mancavano a mostrarla.
    if (s.passo >= PASSO_FINALE || !corrente) return null
    const mancano = Math.max(1, ERRORI_PER_PAROLA - corrente.errori)
    corrente.errori += mancano
    corrente.esito = 'rivelata'
    const errori = s.errori + mancano
    return {
      dopo: { ...s, parole, errori, montepremi: montepremiCatena(errori), ...avanti(s.passo + 1) },
      esito: 'scaduta',
    }
  }
  if (mossa.k === 'p') {
    if (s.passo >= PASSO_FINALE || !corrente) return null
    if (stessaParola(catena.parole[NASCOSTE_CATENA[s.passo]], mossa.w)) {
      corrente.esito = 'giusta'
      return { dopo: { ...s, parole, ...avanti(s.passo + 1) }, esito: 'giusta' }
    }
    corrente.errori += 1
    const errori = s.errori + 1
    const montepremi = montepremiCatena(errori)
    if (corrente.errori >= ERRORI_PER_PAROLA) {
      corrente.esito = 'rivelata'
      return { dopo: { ...s, parole, errori, montepremi, ...avanti(s.passo + 1) }, esito: 'rivelata' }
    }
    if (nascosteDi(catena, s.passo, corrente.lettere) > 1) corrente.lettere += 1
    return { dopo: { ...s, parole, errori, montepremi }, esito: 'sbagliata' }
  }
  if (mossa.k === 'j') {
    if (!jollyUsabile(catena, s)) return null
    corrente.lettere += 1
    return { dopo: { ...s, parole, jollyUsati: s.jollyUsati + 1 }, esito: 'jolly' }
  }
  if (!compraUsabile(s)) return null
  const errori = s.errori + 1
  return {
    dopo: { ...s, terzo: 'comprato', errori, montepremi: montepremiCatena(errori) },
    esito: 'comprato',
  }
}

/** La partita dopo le sue mosse: quelle che non si potevano fare non contano. */
export function svolgiCatena(catena: CatenaDelGiorno, mosse: readonly MossaCatena[]): Svolgimento {
  let s = inizio()
  for (const m of mosse) s = applicaCatena(catena, s, m)?.dopo ?? s
  return s
}

/**
 * Il jolly si puo' usare adesso: ne resta uno, si e' ancora nella catena — nella
 * finale no, anche se avanza: li' i jolly rimasti valgono il terzo elemento — e
 * la parola ha almeno due lettere nascoste.
 */
export function jollyUsabile(catena: CatenaDelGiorno, s: Svolgimento): boolean {
  const corrente = s.parole[s.passo]
  return (
    !!corrente &&
    s.passo < PASSO_FINALE &&
    s.jollyUsati < JOLLY_CATENA &&
    nascosteDi(catena, s.passo, corrente.lettere) >= 2
  )
}

/** Il terzo elemento si puo' comprare: si e' alla finale, e non c'e' ancora. */
export function compraUsabile(s: Svolgimento): boolean {
  return s.passo === PASSO_FINALE && s.terzo === 'no'
}

/** I punti di una partita finita: il montepremi rimasto, se la parola finale e' giusta; se no venti. */
export function puntiCatena(s: Svolgimento, indovinata: boolean): number {
  return indovinata ? s.montepremi : PUNTI_CATENA_PERSA
}

/** Una parola della catena come la vede chi gioca. */
export interface VoceCatena {
  /** Il posto nella catena, da 0 a 10. */
  posto: number
  /** La parola, se si vede: le date, quelle indovinate o mostrate, il terzo elemento. */
  parola: string | null
  /** Di una parola da indovinare, le lettere che si vedono dall'inizio. */
  lettere: string
  /**
   * Quante lettere ha la parola, se si vede; zero per quella da indovinare: chi
   * gioca non sa quanto e' lunga, e la scrive finché non gli sembra finita.
   * Con le caselle tutte in vista sbagliare sarebbe quasi impossibile.
   */
  lunghezza: number
  /** L'ultima lettera, per la parola finale. */
  ultima: string | null
  tipo: 'data' | 'nascosta' | 'giusta' | 'rivelata' | 'terzo'
  errori: number
  /** L'espressione che la lega alla successiva: a partita finita. */
  espressione: string | null
}

/**
 * La catena come la vede chi gioca, a un punto della partita: le parole fino
 * alla coppia di adesso, e niente dopo; della parola da indovinare solo le
 * lettere. Nella finale c'e' anche il posto del terzo elemento, vuoto finché
 * non si compra. A partita finita tutto, con le espressioni. Il server la manda
 * cosi', e la soluzione non esce prima del tempo.
 */
export function vistaCatena(
  catena: CatenaDelGiorno,
  s: Svolgimento,
  fine: { finita: boolean; indovinata: boolean | null },
): VoceCatena[] {
  const ultimoVisto = fine.finita ? POSTO_TERZO : s.passo >= PASSO_FINALE ? POSTO_TERZO : 2 * s.passo + 2
  const voci: VoceCatena[] = []
  for (let posto = 0; posto <= ultimoVisto; posto += 1) {
    const parola = catena.parole[posto]
    const espressione = fine.finita ? (catena.espressioni[posto] ?? null) : null
    const passo = NASCOSTE_CATENA.indexOf(posto as (typeof NASCOSTE_CATENA)[number])
    if (posto === POSTO_TERZO) {
      const vista = fine.finita || s.terzo !== 'no'
      voci.push({
        posto,
        parola: vista ? parola : null,
        lettere: '',
        lunghezza: vista ? normalizzaCatena(parola).length : 0,
        ultima: null,
        tipo: 'terzo',
        errori: 0,
        espressione,
      })
      continue
    }
    if (passo < 0) {
      voci.push({
        posto,
        parola,
        lettere: '',
        lunghezza: normalizzaCatena(parola).length,
        ultima: null,
        tipo: 'data',
        errori: 0,
        espressione,
      })
      continue
    }
    const svolta = s.parole[passo]
    const finale = passo === PASSO_FINALE
    const esito = finale && fine.finita ? (fine.indovinata ? 'giusta' : 'rivelata') : svolta.esito
    const lettere = normalizzaCatena(parola).slice(0, svolta.lettere).toUpperCase()
    voci.push({
      posto,
      parola: esito ? parola : null,
      lettere: esito ? '' : lettere,
      lunghezza: esito ? normalizzaCatena(parola).length : 0,
      ultima: finale && !esito ? normalizzaCatena(parola).slice(-1).toUpperCase() : null,
      tipo: esito ?? 'nascosta',
      errori: svolta.errori,
      espressione,
    })
  }
  return voci
}

/** Il seme della sequenza delle catene: cambiarlo cambierebbe quelle dei giorni ancora da scrivere. */
const SEME_SEQUENZA = 0xca7e
/** Quanti posti salta la sequenza, quando la catena del giorno va evitata. */
const SALTO = 97

/**
 * La catena di un giorno: quella che una permutazione fissa dell'elenco mette
 * al giorno `numero`, come la parola del Wordle. Se va evitata — ha la parola
 * vincente della Ghigliottina dello stesso giorno, che direbbe — si passa a
 * un'altra posizione della sequenza, sempre la stessa per lo stesso giorno.
 */
export function catenaDelGiorno(
  numero: number,
  elenco: readonly CatenaDellElenco[],
  evita: (catena: CatenaDellElenco) => boolean = () => false,
): CatenaDelGiorno {
  if (elenco.length === 0) throw new Error("L'elenco delle catene e' vuoto")
  const ordine = solutionPermutation(elenco.length, SEME_SEQUENZA)
  for (let salto = 0; salto < elenco.length; salto += 1) {
    const k = (((numero + salto * SALTO) % elenco.length) + elenco.length) % elenco.length
    const voce = elenco[ordine[k]]
    if (!evita(voce)) return { parole: voce.p, espressioni: voce.e }
  }
  const voce = elenco[ordine[((numero % elenco.length) + elenco.length) % elenco.length]]
  return { parole: voce.p, espressioni: voce.e }
}

/** Una catena a caso dall'elenco, per la libera: il generatore decide, le altre condizioni le mette chi chiama. */
export function catenaACaso(elenco: readonly CatenaDellElenco[], caso: () => number = mulberry32(Date.now())): CatenaDelGiorno {
  const voce = elenco[Math.floor(caso() * elenco.length)]
  return { parole: voce.p, espressioni: voce.e }
}

/** Una giornata letta dal database: tiene solo quel che ha la forma giusta. */
export function giornataValida(valore: unknown): valore is CatenaDelGiorno {
  if (!valore || typeof valore !== 'object') return false
  const g = valore as CatenaDelGiorno
  return (
    Array.isArray(g.parole) &&
    g.parole.length === PAROLE_CATENA &&
    g.parole.every((p) => typeof p === 'string' && p.length > 0) &&
    Array.isArray(g.espressioni) &&
    g.espressioni.length === PAROLE_CATENA - 1 &&
    g.espressioni.every((e) => typeof e === 'string')
  )
}

/** Le mosse lette dal database: tiene solo quelle che hanno la forma giusta. */
export function mosseValide(valore: unknown): MossaCatena[] {
  if (!Array.isArray(valore)) return []
  return valore.filter(
    (m): m is MossaCatena =>
      !!m &&
      typeof m === 'object' &&
      ((m.k === 'p' && typeof m.w === 'string') || m.k === 'j' || m.k === 'c' || m.k === 't'),
  )
}
