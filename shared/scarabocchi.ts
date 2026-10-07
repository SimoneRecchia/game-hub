/**
 * Scarabocchi: si disegna e si indovina, con gli amici, ognuno dal suo
 * telefono. Due modi:
 *
 *  - **Indovina il disegno**: a turno uno sceglie una parola fra tre e la
 *    disegna, gli altri la scrivono; chi la indovina prima prende di piu', e
 *    chi disegna prende la media di quel che hanno preso gli altri.
 *  - **Telefono senza fili**: ognuno scrive una situazione, poi i fogli
 *    girano: chi riceve una frase la disegna, chi riceve un disegno scrive che
 *    cosa ci vede, e cosi' via. Alla fine l'album mostra come e' cambiata
 *    ogni catena. Nessuno lavora due volte sulla stessa catena: chi lavora a
 *    ogni foglio lo decide un quadrato latino (`assegnazione`).
 *
 * Le regole sono funzioni pure su una partita: il server le applica alle
 * richieste che arrivano, e i tempi li applica la prima richiesta che arriva
 * dopo la scadenza, da chiunque venga, come nelle stanze di Lupus.
 */

import { mulberry32 } from './daily'
import type { GiocatoreBreve } from './types'

export const NOME_SCARABOCCHI = 'Scarabocchi'

export type ModoScarabocchi = 'indovina' | 'telefono'

export const MODI_SCARABOCCHI: readonly ModoScarabocchi[] = ['indovina', 'telefono']

export const NOMI_MODI_SCARABOCCHI: Record<ModoScarabocchi, string> = {
  indovina: 'Indovina il disegno',
  telefono: 'Telefono senza fili',
}

/* ─────────────────────────────  La stanza  ───────────────────────────── */

/** Le lettere dei codici: niente I e O, che si confondono con 1 e 0. Cinque, perché quelli di Lupus sono quattro. */
export const ALFABETO_CODICE_SCARABOCCHI = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
export const LUNGHEZZA_CODICE_SCARABOCCHI = 5

export function codiceScarabocchiValido(x: unknown): x is string {
  return (
    typeof x === 'string' &&
    new RegExp(`^[${ALFABETO_CODICE_SCARABOCCHI}]{${LUNGHEZZA_CODICE_SCARABOCCHI}}$`).test(x)
  )
}

/** Un codice scritto a mano: maiuscolo, senza spazi. */
export function codiceScarabocchiDaTesto(testo: string): string {
  return testo.replace(/\s+/g, '').toUpperCase().slice(0, LUNGHEZZA_CODICE_SCARABOCCHI)
}

/** Una stanza ferma da tanto si cancella quando se ne apre una nuova. */
export const SCARABOCCHI_STANZA_FERMA_MS = 12 * 60 * 60_000

/** Un invito a una stanza vale due ore: si gioca adesso. */
export const SCARABOCCHI_INVITO_MS = 2 * 60 * 60_000

export const GIOCATORI_MASSIMI_SCARABOCCHI = 10

/** In due si indovina; il telefono senza fili vuole almeno tre catene, se no si rivede la propria. */
export const GIOCATORI_MINIMI_SCARABOCCHI: Record<ModoScarabocchi, number> = { indovina: 2, telefono: 3 }

export type StatoStanzaScarabocchi = 'attesa' | 'partita' | 'finita'

/* ─────────────────────────────  I tempi  ───────────────────────────── */

/** Quanto ha chi disegna per scegliere la parola: poi la sceglie il gioco. */
export const SCELTA_MS = 15_000
/** Quanto resta in vista la parola di un turno finito, con i punti. */
export const RIVELA_MS = 6_000
/** Nel telefono senza fili: quanto si ha per scrivere la prima frase, e per descrivere un disegno. */
export const SCRIVI_MS = 45_000
export const DESCRIVI_MS = 40_000
/** Una consegna arrivata poco dopo il tempo vale ancora: e' la rete. */
export const MARGINE_SCARABOCCHI_MS = 3_000

/** Il giro di controllo: prima della partita, mentre si disegna e si indovina, nel telefono senza fili. */
export const SCARABOCCHI_POLL_ATTESA_MS = 3_000
export const SCARABOCCHI_POLL_GIOCO_MS = 1_200
export const SCARABOCCHI_POLL_TELEFONO_MS = 2_500
/** Ogni quanto chi disegna manda i tratti nuovi: chi guarda li vede arrivare a pezzi. */
export const INVIO_TRATTI_MS = 600

/* ─────────────────────────────  Le impostazioni  ───────────────────────────── */

export interface ImpostazioniScarabocchi {
  modo: ModoScarabocchi
  /** Indovina il disegno: quante volte disegna ognuno. */
  giri: number
  /** Indovina il disegno: i secondi per disegnare. */
  secondi: number
  /** Telefono senza fili: i secondi per disegnare. */
  secondiTelefono: number
}

export const GIRI_SCARABOCCHI = [1, 2, 3, 4] as const
export const SECONDI_SCARABOCCHI = [60, 80, 100, 120] as const
export const SECONDI_TELEFONO = [60, 90, 120] as const

export const IMPOSTAZIONI_SCARABOCCHI: ImpostazioniScarabocchi = {
  modo: 'indovina',
  giri: 2,
  secondi: 80,
  secondiTelefono: 90,
}

/** Le impostazioni arrivate dal telefono, sopra quelle di prima: quel che non va resta com'era. */
export function impostazioniScarabocchiValide(x: unknown, prima: ImpostazioniScarabocchi): ImpostazioniScarabocchi {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
  const tra = <T extends number>(v: unknown, ammessi: readonly T[], d: T): T =>
    ammessi.includes(v as T) ? (v as T) : d
  return {
    modo: MODI_SCARABOCCHI.includes(o.modo as ModoScarabocchi) ? (o.modo as ModoScarabocchi) : prima.modo,
    giri: tra(o.giri, GIRI_SCARABOCCHI, prima.giri as (typeof GIRI_SCARABOCCHI)[number]),
    secondi: tra(o.secondi, SECONDI_SCARABOCCHI, prima.secondi as (typeof SECONDI_SCARABOCCHI)[number]),
    secondiTelefono: tra(
      o.secondiTelefono,
      SECONDI_TELEFONO,
      prima.secondiTelefono as (typeof SECONDI_TELEFONO)[number],
    ),
  }
}

/* ─────────────────────────────  Le parole  ───────────────────────────── */

export type LivelloParola = 'facile' | 'normale' | 'difficile'

export const LIVELLI_PAROLA: readonly LivelloParola[] = ['facile', 'normale', 'difficile']

/** Un testo come lo confronta il gioco: minuscolo, senza accenti ne' segni, con uno spazio fra le parole. */
export function normalizzaScarabocchio(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()
}

const ARTICOLI = /^(?:il|lo|la|i|gli|le|un|uno|una|l)\s+/

/** La distanza fra due parole, fermandosi quando supera `tetto`: e' tutto quel che serve a dire "ci sei quasi". */
function distanza(a: string, b: string, tetto: number): number {
  if (Math.abs(a.length - b.length) > tetto) return tetto + 1
  let prima = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i += 1) {
    const riga = [i]
    let minimo = i
    for (let j = 1; j <= b.length; j += 1) {
      const v = Math.min(prima[j] + 1, riga[j - 1] + 1, prima[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      riga.push(v)
      minimo = Math.min(minimo, v)
    }
    if (minimo > tetto) return tetto + 1
    prima = riga
  }
  return prima[b.length]
}

export type EsitoTentativo = 'giusta' | 'vicina' | 'no'

/**
 * Com'e' un tentativo: giusto se e' la parola, anche con l'articolo davanti
 * ("un gatto"), senza accenti ne' maiuscole; vicino se ci manca una lettera,
 * o due nelle parole lunghe (il plurale, un errore di battitura).
 */
export function esitoTentativo(parola: string, tentativo: string): EsitoTentativo {
  const p = normalizzaScarabocchio(parola)
  const t = normalizzaScarabocchio(tentativo).replace(ARTICOLI, '')
  if (!t || !p) return 'no'
  if (t === p) return 'giusta'
  const tetto = p.length >= 9 ? 2 : p.length >= 4 ? 1 : 0
  return tetto > 0 && distanza(t, p, tetto) <= tetto ? 'vicina' : 'no'
}

/** Quante lettere si vedono, a che punto del tempo: una a meta', due ai tre quarti, tre verso la fine. */
export function lettereSvelate(lettere: number, frazione: number): number {
  if (frazione >= 0.9 && lettere >= 9) return 3
  if (frazione >= 0.75 && lettere >= 6) return 2
  if (frazione >= 0.5 && lettere >= 4) return 1
  return 0
}

/**
 * L'indizio di chi indovina: la parola con le lettere nascoste ("_ _ _ _ _"),
 * e con il passare del tempo qualcuna in chiaro, sempre le stesse per lo
 * stesso turno (`seme`). Gli spazi restano spazi.
 */
export function indizio(parola: string, frazione: number, seme: number): string {
  const caratteri = [...parola]
  const posti = caratteri.flatMap((c, i) => (c === ' ' ? [] : [i]))
  const caso = mulberry32(seme)
  for (let i = posti.length - 1; i > 0; i -= 1) {
    const j = Math.floor(caso() * (i + 1))
    ;[posti[i], posti[j]] = [posti[j], posti[i]]
  }
  const svelate = new Set(posti.slice(0, lettereSvelate(posti.length, frazione)))
  return caratteri.map((c, i) => (c === ' ' ? ' ' : svelate.has(i) ? c : '_')).join('')
}

/** I punti di chi indovina: trecento subito, cinquanta allo scadere, a decine. */
export function puntiIndovino(frazione: number): number {
  const f = Math.min(1, Math.max(0, frazione))
  return Math.round((50 + 250 * (1 - f)) / 10) * 10
}

/** I punti di chi disegna: la media dei punti di chi doveva indovinare, contando anche chi non ce l'ha fatta. */
export function puntiDisegnatore(punti: readonly number[], indovini: number): number {
  if (indovini <= 0) return 0
  return Math.round(punti.reduce((t, p) => t + p, 0) / indovini / 10) * 10
}

/* ─────────────────────────────  Indovina il disegno  ───────────────────────────── */

export interface GiocatoreScarabocchi {
  id: string
  nome: string
}

export type FaseIndovina = 'scelta' | 'disegno' | 'rivela' | 'finita'

export interface TurnoChiuso {
  turno: number
  disegnatore: string
  parola: string
  /** I punti del turno: di chi ha indovinato e di chi ha disegnato. */
  punti: Record<string, number>
  /** Quanti hanno indovinato. */
  indovinati: number
}

export interface PartitaIndovina {
  modo: 'indovina'
  giocatori: GiocatoreScarabocchi[]
  /** L'ordine in cui si disegna, lo stesso a ogni giro. */
  ordine: string[]
  giri: number
  /** Il turno in corso: il giro per quanti sono, piu' il posto di chi disegna. */
  turno: number
  disegnatore: string | null
  fase: FaseIndovina
  inizio: number
  fine: number
  secondi: number
  /** Le tre parole di ogni turno, pescate al via: una facile, una normale, una difficile. */
  mazzo: string[][]
  parola: string | null
  livello: LivelloParola | null
  seme: number
  /** I punti dei turni chiusi. */
  punti: Record<string, number>
  chiusi: TurnoChiuso[]
}

/** Il foglio di un turno, dove stanno i suoi tratti. */
export const foglioDelTurno = (turno: number) => `t${turno}`

function mescola<T>(v: readonly T[], caso: () => number): T[] {
  const out = [...v]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(caso() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Le tre parole di ogni turno, senza ripetere una parola nella stessa partita. */
export function mazzoDiParole(
  turni: number,
  parole: Readonly<Record<LivelloParola, readonly string[]>>,
  caso: () => number,
): string[][] {
  const pile = Object.fromEntries(LIVELLI_PAROLA.map((l) => [l, mescola(parole[l], caso)])) as Record<
    LivelloParola,
    string[]
  >
  return Array.from({ length: turni }, (_, k) => LIVELLI_PAROLA.map((l) => pile[l][k % pile[l].length]))
}

export function nuovaPartitaIndovina(
  giocatori: readonly GiocatoreScarabocchi[],
  impostazioni: ImpostazioniScarabocchi,
  parole: Readonly<Record<LivelloParola, readonly string[]>>,
  seme: number,
  adesso: number,
): PartitaIndovina {
  const caso = mulberry32(seme)
  const ordine = mescola(
    giocatori.map((g) => g.id),
    caso,
  )
  const turni = ordine.length * impostazioni.giri
  return {
    modo: 'indovina',
    giocatori: giocatori.map((g) => ({ id: g.id, nome: g.nome })),
    ordine,
    giri: impostazioni.giri,
    turno: 0,
    disegnatore: ordine[0],
    fase: 'scelta',
    inizio: adesso,
    fine: adesso + SCELTA_MS,
    secondi: impostazioni.secondi,
    mazzo: mazzoDiParole(turni, parole, caso),
    parola: null,
    livello: null,
    seme,
    punti: Object.fromEntries(giocatori.map((g) => [g.id, 0])),
    chiusi: [],
  }
}

export const turniDi = (p: PartitaIndovina) => p.ordine.length * p.giri

export class ErroreScarabocchi extends Error {}

/** Chi disegna sceglie la parola: il tempo per disegnare parte adesso. */
export function scegliParola(p: PartitaIndovina, io: string, indice: number, adesso: number): PartitaIndovina {
  if (p.fase !== 'scelta') throw new ErroreScarabocchi('La parola è già scelta.')
  if (p.disegnatore !== io) throw new ErroreScarabocchi('Non tocca a te disegnare.')
  const parola = p.mazzo[p.turno]?.[indice]
  if (!parola) throw new ErroreScarabocchi('Scegli una delle tre parole.')
  return {
    ...p,
    fase: 'disegno',
    parola,
    livello: LIVELLI_PAROLA[indice],
    inizio: adesso,
    fine: adesso + p.secondi * 1000,
  }
}

/** Quel che serve a far andare avanti un turno, oltre all'orologio: chi c'e', e chi ha indovinato. */
export interface ContestoIndovina {
  presenti: ReadonlySet<string>
  /** Le risposte giuste del turno in corso, con i loro punti e quando sono arrivate. */
  indovinati: ReadonlyArray<{ playerId: string; punti: number; at: number }>
}

/** Il primo turno da `da` in poi con chi disegna ancora nella stanza; oltre l'ultimo, la partita e' finita. */
function prossimoTurno(p: PartitaIndovina, da: number, presenti: ReadonlySet<string>, quando: number): PartitaIndovina {
  for (let t = da; t < turniDi(p); t += 1) {
    const chi = p.ordine[t % p.ordine.length]
    if (!presenti.has(chi)) continue
    return {
      ...p,
      turno: t,
      disegnatore: chi,
      fase: 'scelta',
      inizio: quando,
      fine: quando + SCELTA_MS,
      parola: null,
      livello: null,
    }
  }
  return { ...p, fase: 'finita', disegnatore: null, parola: null, livello: null, inizio: quando, fine: quando }
}

/** Il turno si chiude: i punti di chi ha indovinato, e quelli di chi ha disegnato. */
function chiudiTurno(p: PartitaIndovina, ctx: ContestoIndovina, quando: number): PartitaIndovina {
  const disegnatore = p.disegnatore!
  const indovini = [...ctx.presenti].filter((id) => id !== disegnatore).length
  const delTurno: Record<string, number> = {}
  for (const g of ctx.indovinati) delTurno[g.playerId] = g.punti
  delTurno[disegnatore] = puntiDisegnatore(
    ctx.indovinati.map((g) => g.punti),
    Math.max(indovini, ctx.indovinati.length),
  )
  const punti = { ...p.punti }
  for (const [id, n] of Object.entries(delTurno)) punti[id] = (punti[id] ?? 0) + n
  return {
    ...p,
    fase: 'rivela',
    inizio: quando,
    fine: quando + RIVELA_MS,
    punti,
    chiusi: [
      ...p.chiusi,
      {
        turno: p.turno,
        disegnatore,
        parola: p.parola ?? '',
        punti: delTurno,
        indovinati: ctx.indovinati.length,
      },
    ],
  }
}

/** Un passo solo: la stessa partita se non c'e' niente da fare. */
function passoIndovina(p: PartitaIndovina, ctx: ContestoIndovina, adesso: number): PartitaIndovina {
  if (p.fase === 'finita') return p
  // In uno non si gioca: la partita finisce con i punti che ci sono.
  if (ctx.presenti.size < 2) return { ...p, fase: 'finita', disegnatore: null, inizio: adesso, fine: adesso }
  const disegnatore = p.disegnatore
  const presente = disegnatore !== null && ctx.presenti.has(disegnatore)
  switch (p.fase) {
    case 'scelta':
      // Chi doveva disegnare se n'e' andato: il suo turno salta.
      if (!presente) return prossimoTurno(p, p.turno + 1, ctx.presenti, adesso)
      if (adesso < p.fine) return p
      // Il tempo per scegliere e' finito: la parola la sceglie il gioco, quella di mezzo.
      return { ...scegliParola(p, disegnatore, 1, p.fine), inizio: p.fine, fine: p.fine + p.secondi * 1000 }
    case 'disegno': {
      const indovini = [...ctx.presenti].filter((id) => id !== disegnatore)
      const tutti = indovini.length > 0 && indovini.every((id) => ctx.indovinati.some((g) => g.playerId === id))
      if (tutti) {
        const ultima = Math.max(...ctx.indovinati.map((g) => g.at))
        return chiudiTurno(p, ctx, Math.min(p.fine, Math.max(p.inizio, ultima)))
      }
      if (!presente) return chiudiTurno(p, ctx, Math.min(adesso, p.fine))
      if (adesso < p.fine) return p
      return chiudiTurno(p, ctx, p.fine)
    }
    case 'rivela':
      if (adesso < p.fine) return p
      return prossimoTurno(p, p.turno + 1, ctx.presenti, p.fine)
  }
}

/**
 * La partita portata a `adesso`: le scadenze passate si applicano una dopo
 * l'altra, ognuna dalla sua ora e non da adesso, cosi' una stanza letta dopo
 * un minuto e' quella che sarebbe stata guardandola tutto il tempo. Le
 * risposte giuste sono del turno in corso: quelli dopo non ne hanno ancora.
 */
export function avanzaIndovina(p: PartitaIndovina, ctx: ContestoIndovina, adesso: number): PartitaIndovina {
  let q = p
  let contesto = ctx
  for (let i = 0; i < 4 * turniDi(p) + 4; i += 1) {
    const dopo = passoIndovina(q, contesto, adesso)
    if (dopo === q) break
    if (dopo.turno !== q.turno) contesto = { presenti: ctx.presenti, indovinati: [] }
    q = dopo
  }
  return q
}

/** La frazione del tempo per disegnare gia' passata: per i punti e per l'indizio. */
export function frazioneDelTurno(p: Pick<PartitaIndovina, 'inizio' | 'fine'>, quando: number): number {
  const durata = p.fine - p.inizio
  return durata > 0 ? Math.min(1, Math.max(0, (quando - p.inizio) / durata)) : 1
}

/* ─────────────────────────────  Telefono senza fili  ───────────────────────────── */

export type TipoPasso = 'scrivi' | 'disegna' | 'descrivi'

/** Al primo passo si scrive, poi si disegna e si descrive, un passo per uno. */
export function tipoDelPasso(passo: number): TipoPasso {
  return passo === 0 ? 'scrivi' : passo % 2 === 1 ? 'disegna' : 'descrivi'
}

export function durataDelPasso(passo: number, secondiDisegno: number): number {
  const tipo = tipoDelPasso(passo)
  return tipo === 'scrivi' ? SCRIVI_MS : tipo === 'disegna' ? secondiDisegno * 1000 : DESCRIVI_MS
}

export const foglioDellaCatena = (catena: number, passo: number) => `c${catena}p${passo}`

/**
 * Chi lavora a ogni foglio: `[passo][catena]` e' il posto del giocatore.
 * E' un quadrato latino — in ogni passo ognuno ha una catena, e in ogni
 * catena ognuno lavora una volta — quindi nessuno rivede una catena su cui ha
 * gia' lavorato, la sua compresa. Il quadrato e' quello ciclico con i posti e
 * i passi mescolati: da un passo all'altro i fogli girano ogni volta di un
 * numero diverso di posti, e chi passa a chi non si indovina.
 */
export function assegnazione(n: number, caso: () => number): number[][] {
  const posti = mescola(
    Array.from({ length: n }, (_, i) => i),
    caso,
  )
  const passi = mescola(
    Array.from({ length: n }, (_, i) => i),
    caso,
  )
  return Array.from({ length: n }, (_, passo) =>
    Array.from({ length: n }, (_, catena) => posti[(catena + passi[passo]) % n]),
  )
}

export interface PartitaTelefono {
  modo: 'telefono'
  giocatori: GiocatoreScarabocchi[]
  /** Quanti passi: uno per giocatore, cosi' ogni catena passa da tutti. */
  passi: number
  passo: number
  fase: 'gioco' | 'album'
  inizio: number
  fine: number
  secondiDisegno: number
  /** Chi lavora a ogni foglio, per nome del foglio: 'c0p1' e' la catena 0 al passo 1. */
  autori: Record<string, string>
}

export function nuovaPartitaTelefono(
  giocatori: readonly GiocatoreScarabocchi[],
  impostazioni: ImpostazioniScarabocchi,
  seme: number,
  adesso: number,
): PartitaTelefono {
  const n = giocatori.length
  const quadrato = assegnazione(n, mulberry32(seme))
  const autori: Record<string, string> = {}
  quadrato.forEach((riga, passo) =>
    riga.forEach((posto, catena) => {
      autori[foglioDellaCatena(catena, passo)] = giocatori[posto].id
    }),
  )
  return {
    modo: 'telefono',
    giocatori: giocatori.map((g) => ({ id: g.id, nome: g.nome })),
    passi: n,
    passo: 0,
    fase: 'gioco',
    inizio: adesso,
    fine: adesso + durataDelPasso(0, impostazioni.secondiTelefono),
    secondiDisegno: impostazioni.secondiTelefono,
    autori,
  }
}

/** La catena su cui lavoro a un passo, se ce n'e' una. */
export function catenaDi(p: PartitaTelefono, io: string, passo: number): number | null {
  for (let c = 0; c < p.passi; c += 1) if (p.autori[foglioDellaCatena(c, passo)] === io) return c
  return null
}

/**
 * La partita portata a `adesso`: un passo finisce quando tutti quelli che ci
 * sono hanno consegnato, o quando il tempo e' passato (con il margine della
 * rete). `consegnati` sono gli autori che hanno consegnato il passo in corso.
 */
export function avanzaTelefono(
  p: PartitaTelefono,
  presenti: ReadonlySet<string>,
  consegnati: ReadonlySet<string>,
  adesso: number,
): PartitaTelefono {
  let q = p
  let fatti = consegnati
  for (let i = 0; i <= p.passi; i += 1) {
    if (q.fase !== 'gioco') break
    if (presenti.size < 2) return { ...q, fase: 'album', inizio: adesso, fine: adesso }
    const attesi = Array.from({ length: q.passi }, (_, c) => q.autori[foglioDellaCatena(c, q.passo)]).filter(
      (id) => presenti.has(id),
    )
    const tutti = attesi.every((id) => fatti.has(id))
    const scaduto = adesso >= q.fine + MARGINE_SCARABOCCHI_MS
    if (!tutti && !scaduto) break
    const quando = tutti ? Math.min(adesso, q.fine + MARGINE_SCARABOCCHI_MS) : q.fine + MARGINE_SCARABOCCHI_MS
    const passo = q.passo + 1
    q =
      passo >= q.passi
        ? { ...q, fase: 'album', inizio: quando, fine: quando }
        : { ...q, passo, inizio: quando, fine: quando + durataDelPasso(passo, q.secondiDisegno) }
    fatti = new Set()
  }
  return q
}

export type PartitaScarabocchi = PartitaIndovina | PartitaTelefono

/* ─────────────────────────────  I tratti  ───────────────────────────── */

/** La lavagna e' sempre la stessa, in unita' sue: ogni telefono la scala sulla sua larghezza. */
export const LARGHEZZA_LAVAGNA = 1600
export const ALTEZZA_LAVAGNA = 1200

export const COLORI_SCARABOCCHI = [
  '#1d1d1f',
  '#8e8e93',
  '#ffffff',
  '#ff3b30',
  '#ff9500',
  '#ffcc00',
  '#34c759',
  '#0c7a43',
  '#5ac8fa',
  '#007aff',
  '#af52de',
  '#ff2d78',
  '#a2845e',
  '#f5c7a1',
] as const

/** Il bianco e' la gomma: la lavagna e' bianca. */
export const COLORE_GOMMA = 2

export const SPESSORI_SCARABOCCHI = [6, 14, 30, 60] as const

export type OpTratto =
  | { tipo: 'tratto'; colore: number; spessore: number; punti: number[] }
  | { tipo: 'segue'; punti: number[] }
  | { tipo: 'annulla' }
  | { tipo: 'pulisci' }

export interface Tratto {
  colore: number
  spessore: number
  /** x e y in fila, nelle unita' della lavagna. */
  punti: number[]
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const VALORE = new Map([...B64].map((c, i) => [c, i]))

function puntiInTesto(punti: readonly number[]): string {
  let s = ''
  for (const v of punti) {
    const n = Math.max(0, Math.min(4095, Math.round(v)))
    s += B64[n >> 6] + B64[n & 63]
  }
  return s
}

function puntiDaTesto(testo: string): number[] {
  const out: number[] = []
  for (let i = 0; i + 1 < testo.length; i += 2) {
    const a = VALORE.get(testo[i])
    const b = VALORE.get(testo[i + 1])
    if (a === undefined || b === undefined) return out
    out.push(a * 64 + b)
  }
  return out.length % 2 === 0 ? out : out.slice(0, -1)
}

/**
 * Le mosse sulla lavagna in testo: un tratto nuovo (`s`, colore, spessore,
 * punti), i punti che lo continuano (`p`), annulla (`u`) e pulisci (`x`),
 * separati da `~`. Ogni coordinata sono due caratteri: un tratto di cento
 * punti fa quattrocento caratteri, e un pezzo mandato ogni mezzo secondo ne fa
 * qualche centinaio.
 */
export function codificaOps(ops: readonly OpTratto[]): string {
  return ops
    .map((op) => {
      switch (op.tipo) {
        case 'tratto':
          return `s${B64[op.colore & 63]}${B64[op.spessore & 63]}${puntiInTesto(op.punti)}`
        case 'segue':
          return `p${puntiInTesto(op.punti)}`
        case 'annulla':
          return 'u'
        case 'pulisci':
          return 'x'
      }
    })
    .join('~')
}

export function decodificaOps(testo: string): OpTratto[] {
  const ops: OpTratto[] = []
  for (const pezzo of testo.split('~')) {
    if (!pezzo) continue
    switch (pezzo[0]) {
      case 's': {
        const colore = VALORE.get(pezzo[1] ?? '') ?? 0
        const spessore = VALORE.get(pezzo[2] ?? '') ?? 0
        ops.push({
          tipo: 'tratto',
          colore: colore < COLORI_SCARABOCCHI.length ? colore : 0,
          spessore: spessore < SPESSORI_SCARABOCCHI.length ? spessore : 0,
          punti: puntiDaTesto(pezzo.slice(3)),
        })
        break
      }
      case 'p':
        ops.push({ tipo: 'segue', punti: puntiDaTesto(pezzo.slice(1)) })
        break
      case 'u':
        ops.push({ tipo: 'annulla' })
        break
      case 'x':
        ops.push({ tipo: 'pulisci' })
        break
    }
  }
  return ops
}

/** I tratti che restano sulla lavagna dopo tutte le mosse. */
export function trattiDa(ops: readonly OpTratto[]): Tratto[] {
  const tratti: Tratto[] = []
  for (const op of ops) {
    switch (op.tipo) {
      case 'tratto':
        tratti.push({ colore: op.colore, spessore: op.spessore, punti: [...op.punti] })
        break
      case 'segue':
        tratti.at(-1)?.punti.push(...op.punti)
        break
      case 'annulla':
        tratti.pop()
        break
      case 'pulisci':
        tratti.length = 0
        break
    }
  }
  return tratti
}

/** Un pezzo come lo accetta il server: solo i caratteri delle mosse, e non troppo lungo. */
export const PEZZO_MASSIMO = 24_000
export const PEZZI_MASSIMI = 400

export function pezzoValido(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0 && x.length <= PEZZO_MASSIMO && /^[A-Za-z0-9_~-]+$/.test(x)
}

/* ─────────────────────────────  Quel che vede ognuno  ───────────────────────────── */

export interface IscrittoStanzaScarabocchi extends GiocatoreBreve {
  conduce: boolean
  online: boolean
}

export interface GiocatoreInPartita {
  id: string
  nome: string
  punti: number
  /** Ancora nella stanza. */
  presente: boolean
  /** Indovina il disegno: ha indovinato il turno in corso. Telefono senza fili: ha consegnato il passo. */
  fatto: boolean
}

export interface SceltaParola {
  parola: string
  livello: LivelloParola
}

export interface VistaIndovina {
  modo: 'indovina'
  giocatori: GiocatoreInPartita[]
  turno: number
  turni: number
  /** Il giro in corso, da uno. */
  giro: number
  giri: number
  disegnatore: string | null
  fase: FaseIndovina
  inizio: number
  fine: number
  /** Le tre parole fra cui scegliere: solo a chi disegna, mentre sceglie. */
  scelte: SceltaParola[] | null
  /** La parola: a chi disegna mentre disegna, e a tutti quando il turno e' chiuso. */
  parola: string | null
  livello: LivelloParola | null
  /** A chi indovina: la parola con le lettere nascoste. */
  indizio: string | null
  foglio: string
  /** Il turno appena chiuso, per la rivelazione. */
  ultimo: TurnoChiuso | null
}

export interface CompitoTelefono {
  catena: number
  passo: number
  tipo: TipoPasso
  /** Quel che c'e' da disegnare o da descrivere: il foglio prima, nella stessa catena. */
  spunto: { tipo: 'testo'; testo: string | null } | { tipo: 'disegno'; foglio: string } | null
  /** Dove scrivo o disegno io. */
  foglio: string
  consegnato: boolean
  /** Il testo salvato, per ritrovarlo riaprendo la pagina. */
  bozza: string | null
}

export interface VistaTelefono {
  modo: 'telefono'
  giocatori: GiocatoreInPartita[]
  passo: number
  passi: number
  fase: 'gioco' | 'album'
  tipo: TipoPasso
  inizio: number
  fine: number
  compito: CompitoTelefono | null
}

export interface MessaggioScarabocchi {
  id: number
  playerId: string
  nome: string
  /** Null per la risposta giusta di un altro: direbbe la parola. */
  testo: string | null
  esito: EsitoTentativo
  punti: number
}

/** I pezzi nuovi di un foglio: da `da` in poi. */
export interface TrattiNuovi {
  foglio: string
  da: number
  pezzi: string[]
}

export interface VistaStanzaScarabocchi {
  codice: string
  stato: StatoStanzaScarabocchi
  io: string
  conduco: boolean
  iscritti: IscrittoStanzaScarabocchi[]
  impostazioni: ImpostazioniScarabocchi
  /** Quante partite si sono cominciate nella stanza: i tratti e le risposte sono di una partita. */
  numero: number
  partita: VistaIndovina | VistaTelefono | null
  /** I tratti del foglio che si guarda, da quel che si aveva in poi. */
  tratti: TrattiNuovi | null
  /** Le risposte del turno, da quella che si aveva in poi. */
  messaggi: MessaggioScarabocchi[]
  versione: number
  adesso: number
}

/** Un invito a una stanza, come arriva con la presenza. */
export interface InvitoScarabocchi {
  id: string
  codice: string
  da: GiocatoreBreve
  iscritti: number
  modo: ModoScarabocchi
  createdAt: string
}

/** La stanza in cui sono, in breve: per tornarci dalle Libere. */
export interface StanzaScarabocchiBreve {
  codice: string
  stato: StatoStanzaScarabocchi
  iscritti: number
  modo: ModoScarabocchi
}

/** Un foglio dell'album del telefono senza fili. */
export interface FoglioAlbum {
  passo: number
  tipo: TipoPasso
  autore: GiocatoreScarabocchi
  testo: string | null
  /** Le mosse del disegno, tutte in fila. */
  tratti: string | null
}

export interface CatenaAlbum {
  catena: number
  fogli: FoglioAlbum[]
}

/** Un disegno di Indovina il disegno, a partita finita: i tratti si chiedono a parte, uno alla volta (`foglio`). */
export interface DisegnoGalleria {
  turno: number
  disegnatore: GiocatoreScarabocchi
  parola: string
  indovinati: number
  foglio: string
}

export type AlbumScarabocchi =
  | { modo: 'telefono'; catene: CatenaAlbum[] }
  | { modo: 'indovina'; disegni: DisegnoGalleria[] }

/** Una frase o una risposta: una riga, non troppo lunga. */
export const TESTO_MASSIMO = 90
export const TENTATIVO_MASSIMO = 40

export function testoPulito(x: unknown, massimo: number): string | null {
  if (typeof x !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const t = x.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length > 0 && t.length <= massimo ? t : null
}
