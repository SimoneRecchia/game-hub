/**
 * La Catena: undici parole, ognuna legata alla successiva da un'espressione
 * (spirito LIBERO, tiro libero, TIRO da cavallo...), e una su due da indovinare.
 *
 * Si gioca come l'ultima catena di Reazione a catena, su Rai 1. Si vedono due
 * parole e in mezzo le prime due lettere di quella che le lega, senza sapere
 * quanto e' lunga; trovata quella, si scende: la terza parola e una nuova, e in mezzo
 * la prossima da indovinare. Ogni parola ha un minuto, che riparte dopo una
 * risposta sbagliata o un jolly. Una risposta sbagliata toglie dieci punti al
 * montepremi e mostra un'altra lettera; una seconda ne toglie sei, mostra la
 * parola, e si va avanti; il minuto finito la mostra come due errori. Due jolly
 * mostrano una lettera senza costare niente, ma non nella finale.
 *
 * L'ultima parola e' quella decisiva: si vede la parola prima — l'ultima della
 * catena — e della finale la prima lettera sola, ma non il terzo elemento, la
 * parola dopo. Comprarlo dimezza il montepremi, come alla televisione; chi
 * arriva con tutti e due i jolly lo ha in regalo. Le parole della catena sono
 * fatte per trovarsi, la finale per farsi pensare: con la parola sopra e una
 * lettera puo' essere piu' d'una, con il terzo elemento e' una sola
 * (scripts/build-catena.mjs lo controlla). Fino al 22 ottobre 2026 le lettere
 * erano al contrario — una delle parole della catena, e della finale le prime
 * due e l'ultima —, e la finale si indovinava senza comprare niente. C'e' un
 * minuto e mezzo per una risposta sola: giusta vale il montepremi, sbagliata
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
 * Quel che toglie un errore: il primo su una parola dieci, il gradino di un
 * tentativo del Wordle, come ogni errore degli altri giochi; il secondo, che
 * mostra la parola e chiude il conto di quella, sei. Chi le sbaglia tutte perde
 * sedici punti a parola, sessantaquattro in tutto.
 */
export const ERRORE_CATENA = 10
export const SECONDO_ERRORE_CATENA = 6

/** Quel che costano gli errori su una parola, dal primo: oltre il secondo la parola e' gia' in vista. */
export function costoErrori(errori: number): number {
  if (errori <= 0) return 0
  return ERRORE_CATENA + SECONDO_ERRORE_CATENA * (errori - 1)
}

/** La parola finale sbagliata, o non data: quanto una parola del Wordle non indovinata. */
export const PUNTI_CATENA_PERSA = LOSS_POINTS

/**
 * Il montepremi non scende sotto questo: una finale indovinata non vale mai meno
 * di una sbagliata. Conta solo dopo il terzo elemento, che dimezza: gli errori da
 * soli lasciano almeno trentasei punti.
 */
export const FONDO_CATENA = PUNTI_CATENA_PERSA

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
 * Il montepremi: cento, meno gli errori di ogni parola (`errori`, uno per
 * parola, contati con `costoErrori`), e la meta' se si e' comprato il terzo
 * elemento, che si compra nella finale, dopo tutti gli errori. Mai sotto il
 * fondo. Alla televisione ogni errore lo dimezza, e cosi' era anche qui: due
 * errori lasciavano un quarto, e una giornata storta non valeva piu' niente;
 * poi ogni errore ne toglieva sei, e il terzo elemento anche, ma il bottone
 * diceva ÷2.
 */
export function montepremiCatena(errori: readonly number[], dimezzato = false): number {
  const resta = MONTEPREMI_CATENA - errori.reduce((somma, n) => somma + costoErrori(n), 0)
  return Math.max(FONDO_CATENA, dimezzato ? Math.ceil(resta / 2) : resta)
}

/** Il montepremi di una partita a un suo punto. */
function montepremiDi(parole: readonly ParolaSvolta[], terzo: TerzoElemento): number {
  return montepremiCatena(parole.map((p) => p.errori), terzo === 'comprato')
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

/**
 * La parola che si voleva scrivere. Della parola da indovinare si scrive solo
 * il resto: le lettere che si vedono — le prime, e nella finale l'ultima — ci
 * sono gia', e il telefono le mette ai capi di quel che si e' scritto. Ma capita
 * di riscriverle: la parola intera, o nella finale anche l'ultima, che sta in
 * fondo alla riga. Se quel che si e' scritto, con le lettere date che mancano ai
 * suoi capi, fa la parola giusta, vale la parola giusta, e il gioco non lo dice:
 * era la tastiera, non la parola, e i giochi sono fatti per non stressarsi.
 * Se no, vale quel che si e' scritto.
 *
 * Si applica quando la parola arriva, e la mossa salvata ha la parola giusta:
 * rigiocando le mosse di prima, con il confronto di sempre, non cambia niente.
 */
export function parolaVoluta(giusta: string, scritta: string, date: { prime: number; ultima: boolean }): string {
  const g = normalizzaCatena(giusta)
  const w = normalizzaCatena(scritta)
  const prime = g.slice(0, date.prime)
  const ultima = date.ultima ? g.slice(-1) : ''
  if (w === g || !w.startsWith(prime) || !w.endsWith(ultima)) return w
  const mezzo = w.slice(prime.length, w.length - ultima.length)
  if (!mezzo) return w
  for (let k = 0; k <= prime.length; k += 1) {
    if (prime.slice(0, k) + mezzo === g || prime.slice(0, k) + mezzo + ultima === g) return g
  }
  return w
}

/** La parola voluta per quella da indovinare adesso, nella catena o nella finale. */
export function parolaRiconosciuta(catena: CatenaDelGiorno, s: Svolgimento, scritta: string): string {
  const corrente = s.parole[s.passo]
  if (!corrente) return normalizzaCatena(scritta)
  return parolaVoluta(catena.parole[NASCOSTE_CATENA[s.passo]], scritta, { prime: corrente.lettere, ultima: false })
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
  /** Gli errori: le risposte sbagliate e i minuti finiti, come due errori. */
  errori: number
  montepremi: number
}

/** Le lettere che si vedono di una parola appena arrivata: due per quelle della catena, una per la finale. */
function lettereIniziali(passo: number): number {
  return passo === PASSO_FINALE ? 1 : 2
}

/** Le lettere ancora nascoste. */
export function nascosteDi(catena: CatenaDelGiorno, passo: number, lettere: number): number {
  return normalizzaCatena(catena.parole[NASCOSTE_CATENA[passo]]).length - lettere
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
      dopo: { ...s, parole, errori, montepremi: montepremiDi(parole, s.terzo), ...avanti(s.passo + 1) },
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
    const montepremi = montepremiDi(parole, s.terzo)
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
  return {
    dopo: { ...s, terzo: 'comprato', montepremi: montepremiDi(parole, 'comprato') },
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
  tipo: 'data' | 'nascosta' | 'giusta' | 'rivelata' | 'terzo'
  errori: number
  /**
   * L'espressione che la lega alla successiva, quando si vedono tutte e due:
   * trovata una parola, o mostrata, si legge perché sta con quella sopra e con
   * quella sotto. Non dice niente che non sia gia' sul palco.
   */
  espressione: string | null
}

/**
 * La catena come la vede chi gioca, a un punto della partita: le parole fino
 * alla coppia di adesso, e niente dopo; della parola da indovinare solo le
 * lettere. Nella finale c'e' anche il posto del terzo elemento, vuoto finché
 * non si compra. Fra due parole che si vedono, l'espressione che le lega; a
 * partita finita tutto. Il server la manda cosi', e la soluzione non esce prima
 * del tempo.
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
    const passo = NASCOSTE_CATENA.indexOf(posto as (typeof NASCOSTE_CATENA)[number])
    if (posto === POSTO_TERZO) {
      const vista = fine.finita || s.terzo !== 'no'
      voci.push({
        posto,
        parola: vista ? parola : null,
        lettere: '',
        lunghezza: vista ? normalizzaCatena(parola).length : 0,
        tipo: 'terzo',
        errori: 0,
        espressione: null,
      })
      continue
    }
    if (passo < 0) {
      voci.push({
        posto,
        parola,
        lettere: '',
        lunghezza: normalizzaCatena(parola).length,
        tipo: 'data',
        errori: 0,
        espressione: null,
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
      tipo: esito ?? 'nascosta',
      errori: svolta.errori,
      espressione: null,
    })
  }
  // Un'espressione si legge quando si vedono le sue due parole.
  for (let i = 0; i + 1 < voci.length; i += 1) {
    if (voci[i].parola && voci[i + 1].parola) voci[i].espressione = catena.espressioni[i] ?? null
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
