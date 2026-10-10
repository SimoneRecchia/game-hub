import type { GiocoAlTavolo } from './tavolo'
import type { GiocatoreBreve } from './types'

/**
 * Le notifiche: che cosa si puo' ricevere, e gli inviti a chi non e' online.
 * Il Worker manda quelle che nascono da una richiesta (un invito, una mossa),
 * lo script della notte quelle a orario (scripts/notifiche.ts); le preferenze
 * le guardano tutti e due.
 */

export type CategoriaNotifica = 'inviti' | 'turno' | 'superenalotto' | 'promemoria'

export interface InfoCategoria {
  id: CategoriaNotifica
  nome: string
  descrizione: string
  /** Accese di partenza: le utili si', i promemoria no. */
  predefinita: boolean
}

export const CATEGORIE_NOTIFICHE: readonly InfoCategoria[] = [
  { id: 'inviti', nome: 'Inviti', descrizione: 'Quando qualcuno ti invita a giocare', predefinita: true },
  { id: 'turno', nome: 'Tocca a te', descrizione: 'Nelle partite con gli amici, se non hai l’app aperta', predefinita: true },
  {
    id: 'superenalotto',
    nome: 'Estrazione del SuperEnalotto',
    descrizione: 'Poco prima delle 21:05, lunedì, mercoledì e venerdì',
    predefinita: true,
  },
  { id: 'promemoria', nome: 'Promemoria', descrizione: 'La sera, se ti mancano delle giornaliere', predefinita: false },
]

export type PreferenzeNotifiche = Record<CategoriaNotifica, boolean>

/** Le preferenze salvate (il JSON di `players.notifiche`), con quelle di partenza dove mancano. */
export function preferenzeDa(json: string | null | undefined): PreferenzeNotifiche {
  let salvate: Record<string, unknown> = {}
  try {
    const letto: unknown = json ? JSON.parse(json) : {}
    if (letto && typeof letto === 'object') salvate = letto as Record<string, unknown>
  } catch {
    /* quelle di partenza */
  }
  return Object.fromEntries(
    CATEGORIE_NOTIFICHE.map((c) => [c.id, typeof salvate[c.id] === 'boolean' ? (salvate[c.id] as boolean) : c.predefinita]),
  ) as PreferenzeNotifiche
}

/**
 * Lo stesso controllo in SQL, per gli invii a orario: accesa se l'ha accesa,
 * o se non l'ha mai toccata ed e' accesa di partenza. `colonna` e' il JSON.
 */
export function preferenzaSql(colonna: string, categoria: CategoriaNotifica): string {
  const predefinita = CATEGORIE_NOTIFICHE.find((c) => c.id === categoria)!.predefinita
  return `COALESCE(json_extract(${colonna}, '$.${categoria}'), ${predefinita ? 1 : 0}) = 1`
}

/** I giochi a cui si chiama un amico: quelli che si giocano in due, e Lupus e Scarabocchi, che si giocano in tanti. */
export const GIOCHI_CHIAMATA = [
  'battaglia',
  'quiz',
  'nomi',
  'sequenze',
  'scarabeo',
  'tris',
  'indovina',
  'scacchi',
  'dama',
  'forza4',
  'go',
  'sudoku',
  'anagrammi',
  'paroliere',
  'ghigliottina',
  'catena',
  'lupus',
  'scarabocchi',
] as const

export type GiocoChiamata = (typeof GIOCHI_CHIAMATA)[number]

export function eGiocoChiamata(x: unknown): x is GiocoChiamata {
  return GIOCHI_CHIAMATA.includes(x as GiocoChiamata)
}

/** Come si chiama un gioco in una notifica: "Simone ti invita a Scacchi". */
export const NOMI_CHIAMATA: Record<GiocoChiamata, string> = {
  battaglia: 'Battaglia navale',
  quiz: 'Quiz',
  nomi: 'Nomi, cose e città',
  sequenze: 'Sequenze',
  scarabeo: 'Scarabeo',
  tris: 'Tris',
  indovina: 'Indovina chi',
  scacchi: 'Scacchi',
  dama: 'Dama',
  forza4: 'Forza 4',
  go: 'Go',
  sudoku: 'Sudoku',
  anagrammi: 'Anagrammi',
  paroliere: 'Paroliere',
  ghigliottina: 'Ghigliottina',
  catena: 'Catena',
  lupus: 'Lupus',
  scarabocchi: 'Scarabocchi',
}

/**
 * Quanto vale un invito a chi non era online: mezz'ora. E' un "vieni a
 * giocare": dopo, chi ha invitato fa altro.
 */
export const CHIAMATA_MS = 30 * 60_000

/** Un invito a giocare arrivato quando non si era online. */
export interface ChiamataRicevuta {
  id: string
  da: GiocatoreBreve
  gioco: GiocoChiamata
  createdAt: string
}

/** Quel che il profilo legge per il pannello delle notifiche. */
export interface StatoNotifiche {
  /** La chiave pubblica con cui il telefono si iscrive. */
  chiave: string
  preferenze: PreferenzeNotifiche
  /** Su quanti dispositivi arrivano. */
  dispositivi: number
}

/**
 * Dove sta una partita al tavolo con un amico, per la notifica "Tocca a te":
 * gli stessi indirizzi di `SLUG_AL_TAVOLO` (src/app/rotte.ts), che un test
 * tiene d'accordo.
 */
export const SLUG_PARTITA_TAVOLO: Record<GiocoAlTavolo, string> = {
  scacchi: 'scacchi',
  dama: 'dama',
  forza4: 'forza-4',
  go: 'go',
  tris: 'tris/libera',
  scarabeo: 'scarabeo/libera',
}
