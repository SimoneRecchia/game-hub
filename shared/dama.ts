/**
 * La dama italiana: la damiera, le regole della Federazione Italiana Dama e le
 * patte automatiche. Le stesse funzioni girano nel browser, nel Web Worker del
 * computer e nel server, che con queste convalida ogni mossa.
 *
 * Le regole sono quelle del Regolamento tecnico della FID, Capo I
 * (https://www.fid.it/regolamenti/capo1.htm), e gli articoli citati sono i suoi:
 *
 *  - la damiera ha 8 x 8 caselle e si gioca sulle 32 scure; per ciascun
 *    giocatore la casella in basso a destra e' scura (art. 2.3);
 *  - le caselle scure si numerano da 1 a 32 guardando la damiera dalla parte del
 *    Bianco: da sinistra a destra, fila per fila, dalla prima scura in alto a
 *    sinistra (art. 2.4). La 1 e la 32 sono i due cantoni; il Nero parte dalle
 *    1-12, il Bianco dalle 21-32 (art. 2.6), e muove per primo il Bianco (art. 3.4);
 *  - la pedina va avanti in diagonale di una casella (art. 4.1) e, arrivata sulla
 *    base avversaria, diventa dama (art. 4.2). Prende solo in avanti, e **solo
 *    pedine**: una dama la pedina non la puo' prendere (art. 5.3);
 *  - la dama va avanti e indietro di una casella (art. 4.7): non e' la dama
 *    "volante" della dama internazionale. Prende avanti e indietro, pedine e dame;
 *  - la presa e' obbligatoria (art. 6.1) e continua finché il pezzo puo' ancora
 *    prendere (art. 5.7 e 5.9). I pezzi presi si tolgono solo alla fine (art.
 *    5.12): fino ad allora restano sulla damiera, quindi non si scavalcano due
 *    volte (art. 6.4) e non ci si atterra sopra. Le caselle libere invece si
 *    possono ripassare, anche quella da cui il pezzo e' partito, che e' libera;
 *  - una pedina che arriva sulla base avversaria prendendo si ferma lì: sara'
 *    dama dalla mossa dopo (art. 6.5). Del resto da quella traversa, andando
 *    solo in avanti, non avrebbe piu' niente da prendere.
 *
 * Fra piu' prese possibili decidono, nell'ordine, le precedenze degli art.
 * 6.6-6.10: il maggior numero di pezzi presi; a parita', prendere con la dama
 * piuttosto che con la pedina; poi prendere piu' dame; poi prendere dove una dama
 * si presenta prima. L'ordine e' quello del regolamento, e ognuna vale solo a
 * parita' di tutte quelle prima: una presa di tre pedine batte una di due dame.
 * L'ultima si legge "confrontando le sequenze di presa" pezzo per pezzo, come
 * dice l'art. 6.9: se la prima dama arriva allo stesso punto si guarda la
 * seconda, e così via. Quando anche questa e' pari si sceglie liberamente
 * (art. 6.10), e `mosseLegali` le restituisce tutte.
 *
 * Il regolamento finisce la partita quando chi ha il tratto non puo' muovere,
 * perché non ha pezzi o perché li ha tutti bloccati (art. 9.2), e la da' patta
 * per accordo o per il conteggio delle mosse dell'art. 10, che un arbitro
 * applica su richiesta. Qui non c'e' un arbitro, e due patte sono automatiche,
 * come nelle app di dama:
 *
 *  - la **ripetizione**: la stessa posizione — gli stessi pezzi sulle stesse
 *    caselle e lo stesso giocatore al tratto — per la terza volta, anche non di
 *    seguito. Il contatore delle quaranta mosse non fa parte della posizione;
 *  - le **quaranta mosse**: quaranta mosse per parte (ottanta semimosse) di sole
 *    dame, senza prese. E' il conteggio dell'art. 10 reso automatico: si azzera
 *    a ogni presa e a ogni mossa di pedina (art. 10.5), e la condizione
 *    dell'art. 10.1, almeno una dama per parte, viene da sé: chi non ha dame
 *    muove una pedina, e il conteggio ricomincia.
 *
 * Il testo di una posizione, per il database, e' il contenuto delle 32 caselle
 * dalla 1 alla 32 — `.` vuota, `b` pedina bianca, `B` dama bianca, `n` pedina
 * nera, `N` dama nera — poi uno spazio, il tratto (`b` o `n`), uno spazio e il
 * contatore delle quaranta mosse. La posizione iniziale e'
 * `nnnnnnnnnnnn........bbbbbbbbbbbb b 0`, e la chiave della ripetizione e' lo
 * stesso testo senza il contatore.
 */

export type Colore = 'bianco' | 'nero'

export interface Pezzo {
  colore: Colore
  dama: boolean
}

/** Le 32 caselle scure: indice 0 = casella 1 della numerazione ufficiale, indice 31 = casella 32. */
export interface Posizione {
  readonly caselle: readonly (Pezzo | null)[]
  readonly tratto: Colore
  /** Semimosse di sole dame senza prese, di seguito: a ottanta la partita e' patta. */
  readonly senzaProgresso: number
}

export interface Mossa {
  /** Le caselle toccate, dalla partenza all'arrivo, numerate 1..32: [22, 18] o, per una presa multipla, [22, 13, 6]. */
  readonly percorso: readonly number[]
  /** Le caselle dei pezzi presi (1..32), nell'ordine della presa; vuoto se non e' una presa. */
  readonly prese: readonly number[]
}

export type Fine = 'bloccato' | 'ripetizione' | 'quaranta'

export const CASELLE = 32

/** Ottanta semimosse: quaranta mosse di dama per ciascuno. */
export const LIMITE_SENZA_PROGRESSO = 80

/** La terza volta della stessa posizione e' patta. */
export const RIPETIZIONI_PER_PATTA = 3

/** Pezzi a testa all'inizio, e al massimo. */
export const PEZZI_PER_PARTE = 12

export function avversario(colore: Colore): Colore {
  return colore === 'bianco' ? 'nero' : 'bianco'
}

/* ─────────────────────────────  La damiera  ───────────────────────────── */

/**
 * La riga (0 in alto, dalla parte del Nero) e la colonna (0 a sinistra) di una
 * casella 1..32, guardando la damiera dal Bianco.
 *
 * Nelle righe pari le caselle scure sono nelle colonne pari, a cominciare dalla
 * 1 nell'angolo in alto a sinistra; nelle dispari sono nelle dispari, fino alla
 * 32 nell'angolo in basso a destra: e' l'angolo scuro dell'art. 2.3.
 */
export function rigaColonna(casella: number): { riga: number; colonna: number } {
  if (!Number.isInteger(casella) || casella < 1 || casella > CASELLE) {
    throw new RangeError(`Casella fuori dalla damiera: ${casella}`)
  }
  const k = casella - 1
  const riga = k >> 2
  return { riga, colonna: 2 * (k & 3) + (riga & 1) }
}

/** La casella 1..32 di una riga e una colonna; null sulle caselle chiare e fuori dalla damiera. */
export function casellaDi(riga: number, colonna: number): number | null {
  if (!Number.isInteger(riga) || !Number.isInteger(colonna)) return null
  if (riga < 0 || riga > 7 || colonna < 0 || colonna > 7) return null
  if ((riga + colonna) % 2 !== 0) return null
  return riga * 4 + (colonna >> 1) + 1
}

/**
 * Le quattro direzioni, guardando dal Bianco: in alto a sinistra, in alto a
 * destra, in basso a sinistra, in basso a destra. Il Bianco va verso l'alto,
 * cioe' verso le caselle di numero minore; il Nero verso il basso.
 */
const PASSI: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]
const TUTTE: readonly number[] = [0, 1, 2, 3]
const AVANTI: Record<Colore, readonly number[]> = { bianco: [0, 1], nero: [2, 3] }

/** Per ogni casella (indice 0..31) e direzione: la casella accanto, e quella dopo il salto; -1 fuori dalla damiera. */
const VICINA = new Int8Array(CASELLE * 4).fill(-1)
const OLTRE = new Int8Array(CASELLE * 4).fill(-1)
for (let k = 0; k < CASELLE; k += 1) {
  const { riga, colonna } = rigaColonna(k + 1)
  PASSI.forEach(([dr, dc], d) => {
    const vicina = casellaDi(riga + dr, colonna + dc)
    const oltre = casellaDi(riga + 2 * dr, colonna + 2 * dc)
    if (vicina !== null) VICINA[k * 4 + d] = vicina - 1
    if (vicina !== null && oltre !== null) OLTRE[k * 4 + d] = oltre - 1
  })
}

/** La traversa dove le pedine di un colore diventano dame: la base dell'avversario. */
function rigaDellaDama(colore: Colore): number {
  return colore === 'bianco' ? 0 : 7
}

function direzioni(pezzo: Pezzo): readonly number[] {
  return pezzo.dama ? TUTTE : AVANTI[pezzo.colore]
}

/* ─────────────────────────────  La posizione  ───────────────────────────── */

const PEDINA_BIANCA: Pezzo = Object.freeze({ colore: 'bianco', dama: false })
const DAMA_BIANCA: Pezzo = Object.freeze({ colore: 'bianco', dama: true })
const PEDINA_NERA: Pezzo = Object.freeze({ colore: 'nero', dama: false })
const DAMA_NERA: Pezzo = Object.freeze({ colore: 'nero', dama: true })

function damaDi(colore: Colore): Pezzo {
  return colore === 'bianco' ? DAMA_BIANCA : DAMA_NERA
}

export function posizioneIniziale(): Posizione {
  const caselle = Array.from({ length: CASELLE }, (_, k) => (k < 12 ? PEDINA_NERA : k >= 20 ? PEDINA_BIANCA : null))
  return { caselle, tratto: 'bianco', senzaProgresso: 0 }
}

/** Quanti pezzi ha ciascuno, pedine e dame. */
export function contaPezzi(p: Posizione): Record<Colore, { pedine: number; dame: number }> {
  const conto = { bianco: { pedine: 0, dame: 0 }, nero: { pedine: 0, dame: 0 } }
  for (const pezzo of p.caselle) {
    if (!pezzo) continue
    if (pezzo.dama) conto[pezzo.colore].dame += 1
    else conto[pezzo.colore].pedine += 1
  }
  return conto
}

const SIMBOLI: Record<string, Pezzo> = { b: PEDINA_BIANCA, B: DAMA_BIANCA, n: PEDINA_NERA, N: DAMA_NERA }

function simbolo(pezzo: Pezzo | null): string {
  if (!pezzo) return '.'
  const lettera = pezzo.colore === 'bianco' ? 'b' : 'n'
  return pezzo.dama ? lettera.toUpperCase() : lettera
}

/** Pezzi e tratto: quel che conta per la ripetizione. E' il testo di `scrivi` senza il contatore. */
export function chiaveRipetizione(p: Posizione): string {
  let caselle = ''
  for (const pezzo of p.caselle) caselle += simbolo(pezzo)
  return `${caselle} ${p.tratto === 'bianco' ? 'b' : 'n'}`
}

/** La posizione in un testo compatto e stabile (il formato e' in testa al file). */
export function scrivi(p: Posizione): string {
  return `${chiaveRipetizione(p)} ${p.senzaProgresso}`
}

const FORMATO = /^([.bBnN]{32}) ([bn])(?: (0|[1-9][0-9]?))?$/

/**
 * La posizione di un testo di `scrivi`; null se il testo non e' valido.
 *
 * Oltre alla forma controlla quel che una partita non potrebbe mai produrre: una
 * pedina sulla base avversaria (sarebbe gia' dama), piu' di dodici pezzi per
 * parte, un contatore oltre le ottanta semimosse.
 */
export function leggi(testo: string): Posizione | null {
  const m = typeof testo === 'string' ? FORMATO.exec(testo) : null
  if (!m || m[3] === undefined) return null
  return composta(m[1], m[2], Number(m[3]))
}

/** La posizione di una chiave di `chiaveRipetizione`, con il contatore a zero; null se non e' valida. */
export function posizioneDaChiave(chiave: string): Posizione | null {
  const m = typeof chiave === 'string' ? FORMATO.exec(chiave) : null
  if (!m || m[3] !== undefined) return null
  return composta(m[1], m[2], 0)
}

function composta(testo: string, tratto: string, senzaProgresso: number): Posizione | null {
  if (senzaProgresso > LIMITE_SENZA_PROGRESSO) return null
  const caselle: (Pezzo | null)[] = []
  const quanti = { bianco: 0, nero: 0 }
  for (let k = 0; k < CASELLE; k += 1) {
    const pezzo = testo[k] === '.' ? null : SIMBOLI[testo[k]]
    if (pezzo) {
      if (!pezzo.dama && rigaColonna(k + 1).riga === rigaDellaDama(pezzo.colore)) return null
      quanti[pezzo.colore] += 1
    }
    caselle.push(pezzo)
  }
  if (quanti.bianco > PEZZI_PER_PARTE || quanti.nero > PEZZI_PER_PARTE) return null
  return { caselle, tratto: tratto === 'b' ? 'bianco' : 'nero', senzaProgresso }
}

/* ─────────────────────────────  Le mosse  ───────────────────────────── */

/** Una presa trovata, prima delle precedenze. Le caselle sono indici 0..31. */
interface Presa {
  percorso: number[]
  prese: number[]
  conDama: boolean
  /** Per ogni pezzo preso, nell'ordine della presa: era una dama? */
  dame: boolean[]
}

/**
 * Tutte le prese complete di un pezzo: ogni sequenza continua finché ha
 * qualcosa da prendere, perché fermarsi prima non e' ammesso.
 */
function preseDelPezzo(caselle: readonly (Pezzo | null)[], da: number, pezzo: Pezzo, trovate: Presa[]): void {
  const percorso = [da]
  const prese: number[] = []
  const dame: boolean[] = []
  let presi = 0
  const salta = (k: number): void => {
    let prosegue = false
    // Art. 6.5: la pedina che arriva prendendo sulla base avversaria si ferma.
    const ferma = !pezzo.dama && prese.length > 0 && k >> 2 === rigaDellaDama(pezzo.colore)
    for (const d of ferma ? [] : direzioni(pezzo)) {
      const oltre = OLTRE[k * 4 + d]
      if (oltre < 0) continue
      const vicina = VICINA[k * 4 + d]
      const bersaglio = caselle[vicina]
      // Solo pezzi avversari (art. 6.2 e 6.3), e la pedina solo pedine (art. 5.3).
      if (!bersaglio || bersaglio.colore === pezzo.colore) continue
      if (bersaglio.dama && !pezzo.dama) continue
      // Lo stesso pezzo non si prende due volte (art. 6.4), e i presi restano sulla damiera fino alla fine.
      if (presi & (1 << vicina)) continue
      if (caselle[oltre] !== null && oltre !== da) continue
      prosegue = true
      presi |= 1 << vicina
      percorso.push(oltre)
      prese.push(vicina)
      dame.push(bersaglio.dama)
      salta(oltre)
      presi &= ~(1 << vicina)
      percorso.pop()
      prese.pop()
      dame.pop()
    }
    if (!prosegue && prese.length > 0) {
      trovate.push({ percorso: [...percorso], prese: [...prese], conDama: pezzo.dama, dame: [...dame] })
    }
  }
  salta(da)
}

/**
 * Le precedenze degli art. 6.6-6.9, in ordine: positivo se la presa `a` va fatta
 * prima della `b`, zero se si puo' scegliere fra le due (art. 6.10).
 */
function precedenza(a: Presa, b: Presa): number {
  // 6.6: il maggior numero di pezzi.
  if (a.prese.length !== b.prese.length) return a.prese.length - b.prese.length
  // 6.7: con il pezzo di maggior valore, la dama.
  if (a.conDama !== b.conDama) return a.conDama ? 1 : -1
  // 6.8: i pezzi di maggior valore, cioe' il maggior numero di dame.
  const dameA = a.dame.filter(Boolean).length
  const dameB = b.dame.filter(Boolean).length
  if (dameA !== dameB) return dameA - dameB
  // 6.9: confrontando le sequenze pezzo per pezzo, dove una dama si presenta prima.
  for (let i = 0; i < a.dame.length; i += 1) if (a.dame[i] !== b.dame[i]) return a.dame[i] ? 1 : -1
  return 0
}

/** Le mosse legali di chi ha il tratto, con la presa obbligatoria e le precedenze gia' applicate. */
export function mosseLegali(p: Posizione): Mossa[] {
  const { caselle, tratto } = p
  const prese: Presa[] = []
  for (let k = 0; k < CASELLE; k += 1) {
    const pezzo = caselle[k]
    if (pezzo && pezzo.colore === tratto) preseDelPezzo(caselle, k, pezzo, prese)
  }
  if (prese.length > 0) {
    let migliore = prese[0]
    for (const presa of prese) if (precedenza(presa, migliore) > 0) migliore = presa
    return prese
      .filter((presa) => precedenza(presa, migliore) === 0)
      .map((presa) => ({ percorso: presa.percorso.map((k) => k + 1), prese: presa.prese.map((k) => k + 1) }))
  }

  const mosse: Mossa[] = []
  for (let k = 0; k < CASELLE; k += 1) {
    const pezzo = caselle[k]
    if (!pezzo || pezzo.colore !== tratto) continue
    for (const d of direzioni(pezzo)) {
      const vicina = VICINA[k * 4 + d]
      if (vicina >= 0 && caselle[vicina] === null) mosse.push({ percorso: [k + 1, vicina + 1], prese: [] })
    }
  }
  return mosse
}

/** Chi ha il tratto puo' muovere? Come `mosseLegali(p).length > 0`, senza costruire le mosse. */
function puoMuovere(p: Posizione): boolean {
  const { caselle, tratto } = p
  for (let k = 0; k < CASELLE; k += 1) {
    const pezzo = caselle[k]
    if (!pezzo || pezzo.colore !== tratto) continue
    for (const d of direzioni(pezzo)) {
      const vicina = VICINA[k * 4 + d]
      if (vicina < 0) continue
      const occupante = caselle[vicina]
      if (occupante === null) return true
      const oltre = OLTRE[k * 4 + d]
      const prendibile = occupante.colore !== tratto && (pezzo.dama || !occupante.dama)
      if (prendibile && oltre >= 0 && caselle[oltre] === null) return true
    }
  }
  return false
}

/** '22-18' per un movimento, '22x13x6' per una presa, con tutte le caselle d'arrivo. */
export function notazione(m: Mossa): string {
  return m.percorso.join(m.prese.length > 0 ? 'x' : '-')
}

/**
 * La mossa legale scritta in `testo`, o null.
 *
 * Il percorso intero individua sempre una mossa sola: la dama non vola, quindi
 * dalle caselle d'arrivo si ricava quali pezzi ha preso. Si accetta anche la
 * forma corta di una presa, partenza e arrivo ('22x6'), quando una sola mossa
 * legale va da lì a lì.
 */
export function mossaDaNotazione(p: Posizione, testo: string): Mossa | null {
  if (typeof testo !== 'string' || !/^\s*\d{1,2}(\s*[-xX]\s*\d{1,2})+\s*$/.test(testo)) return null
  const caselle = testo.split(/[-xX]/).map((s) => Number(s.trim()))
  const legali = mosseLegali(p)
  const uguale = legali.find(
    (m) => m.percorso.length === caselle.length && m.percorso.every((c, i) => c === caselle[i]),
  )
  if (uguale) return uguale
  if (caselle.length !== 2) return null
  const corte = legali.filter((m) => m.percorso[0] === caselle[0] && m.percorso[m.percorso.length - 1] === caselle[1])
  return corte.length === 1 ? corte[0] : null
}

/**
 * La posizione dopo la mossa, senza toccare quella di prima.
 *
 * La mossa deve venire da `mosseLegali` o da `mossaDaNotazione`: qui si
 * controlla solo che abbia senso sulla damiera — un pezzo di chi ha il tratto
 * alla partenza, l'arrivo libero, pezzi avversari dove si prende — non le
 * precedenze, che costerebbero un'altra ricerca delle prese.
 */
export function gioca(p: Posizione, m: Mossa): Posizione {
  const da = m.percorso[0] - 1
  const a = m.percorso[m.percorso.length - 1] - 1
  const pezzo = p.caselle[da]
  if (!pezzo || pezzo.colore !== p.tratto) throw new Error(`Nessun pezzo da muovere in ${da + 1}`)
  if (a !== da && p.caselle[a] !== null) throw new Error(`La casella ${a + 1} è occupata`)
  const caselle = [...p.caselle]
  caselle[da] = null
  for (const presa of m.prese) {
    const preso = caselle[presa - 1]
    if (!preso || preso.colore === p.tratto) throw new Error(`Niente da prendere in ${presa}`)
    caselle[presa - 1] = null
  }
  const promossa = !pezzo.dama && a >> 2 === rigaDellaDama(pezzo.colore)
  caselle[a] = promossa ? damaDi(pezzo.colore) : pezzo
  // Il conteggio delle quaranta mosse ricomincia a ogni presa e a ogni mossa di pedina (art. 10.5).
  const senzaProgresso = m.prese.length > 0 || !pezzo.dama ? 0 : p.senzaProgresso + 1
  return { caselle, tratto: avversario(p.tratto), senzaProgresso }
}

/**
 * A partita finita il vincitore (o null per la patta); null se si gioca ancora.
 * `chiaviPrecedenti`: le chiavi delle posizioni precedenti (l'iniziale compresa,
 * l'attuale esclusa).
 *
 * Chi non puo' muovere ha perso anche se la stessa mossa chiude le quaranta o
 * ripete la posizione: la vittoria e' arrivata con quella mossa, come lo scacco
 * matto all'ultima delle cinquanta mosse negli scacchi.
 */
export function esito(
  p: Posizione,
  chiaviPrecedenti: readonly string[],
): { fine: Fine; vincitore: Colore | null } | null {
  if (!puoMuovere(p)) return { fine: 'bloccato', vincitore: avversario(p.tratto) }
  if (p.senzaProgresso >= LIMITE_SENZA_PROGRESSO) return { fine: 'quaranta', vincitore: null }
  const chiave = chiaveRipetizione(p)
  let volte = 1
  for (const precedente of chiaviPrecedenti) if (precedente === chiave) volte += 1
  if (volte >= RIPETIZIONI_PER_PATTA) return { fine: 'ripetizione', vincitore: null }
  return null
}
