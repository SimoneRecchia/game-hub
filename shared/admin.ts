/**
 * Il pannello di amministrazione: i tipi delle risposte di /api/admin, e i
 * limiti del piano gratuito di Cloudflare con cui il pannello misura quanto si
 * e' pieni. Il server e il browser li leggono da qui, cosi' non possono non
 * essere d'accordo.
 *
 * Chi e' amministratore lo decide il server: il proprietario e' chi ha
 * un'email, confermata, fra quelle di `ADMIN_EMAILS` (wrangler.toml), e puo'
 * dare il ruolo di amministratore ad altri giocatori (`players.ruolo`). Per
 * aprire il pannello non basta la sessione, che dura un anno: serve un codice
 * mandato all'email, che sblocca il pannello su quel dispositivo per
 * `SBLOCCO_ADMIN_ORE` ore (vedi server/lib/admin.ts).
 */

import type { GiocoClassificato } from './types'

/** Quanto resta aperto il pannello dopo il codice: una giornata di lavoro, poi lo si richiede. */
export const SBLOCCO_ADMIN_ORE = 12

/**
 * I limiti del piano gratuito, per le barre del pannello. Le richieste e la
 * CPU sono delle Pages Functions (le pagine e i file statici non contano), le
 * righe e la dimensione di D1, le email di Resend.
 */
export const LIMITI_GRATUITI = {
  richiesteGiorno: 100_000,
  cpuMs: 10,
  d1RigheLetteGiorno: 5_000_000,
  d1RigheScritteGiorno: 100_000,
  d1Dimensione: 500 * 1024 * 1024,
  d1QueryPerRichiesta: 50,
  emailMese: 3_000,
} as const

export type RuoloAdmin = 'proprietario' | 'admin'

/** Una serie per giorno: la data del gioco (YYYY-MM-DD, giornata italiana) e un valore. */
export interface SerieGiorno {
  data: string
  valore: number
}

/* ─────────────────────────────  L'accesso  ───────────────────────────── */

/** GET /admin/io: chi sono per il pannello. Risponde a tutti, anche a chi non e' amministratore. */
export interface AdminIo {
  admin: boolean
  ruolo: RuoloAdmin | null
  /** Fin quando il pannello e' sbloccato su questo dispositivo; null se serve il codice. */
  sbloccatoFino: string | null
  /** L'email a cui arriva il codice, mascherata ("re•••@gmail.com"). */
  email: string | null
}

/** POST /admin/codice: il codice per sbloccare e' partito. */
export interface AdminCodice {
  ok: true
  email: string
  /** Secondi prima di poterne chiedere un altro. */
  attesa: number
  /** Solo in locale, senza la posta: il codice, perché non ci sarebbe altro modo di leggerlo. */
  codiceDiProva?: string
}

/* ─────────────────────────────  La panoramica  ───────────────────────────── */

export interface PartiteDelGiorno {
  gioco: GiocoClassificato
  iniziate: number
  finite: number
  /** La media dei punti delle partite finite; null se nessuna. */
  mediaPunti: number | null
}

/** GET /admin/panoramica */
export interface AdminPanoramica {
  adesso: string
  giornata: { data: string; numero: number }
  giocatori: {
    totali: number
    verificati: number
    nuoviOggi: number
    nuovi7: number
    nuovi30: number
    sospesi: number
    amministratori: number
  }
  attivi: {
    /** Con l'app aperta adesso, per la presenza. */
    online: number
    oggi: number
    settimana: number
    mese: number
  }
  /** Chi ha aperto l'app, giorno per giorno, negli ultimi trenta giorni. */
  serieAttivi: SerieGiorno[]
  /** Le iscrizioni, giorno per giorno, negli ultimi trenta giorni. */
  serieIscrizioni: SerieGiorno[]
  partiteOggi: PartiteDelGiorno[]
  database: { dimensione: number; limite: number; tabelle: number }
  sessioni: number
  /** I dispositivi iscritti alle notifiche. */
  dispositiviNotifiche: number
  /** Gli errori del server nelle ultime ventiquattr'ore. */
  errori24h: number
  /** Il pannello legge le statistiche di Cloudflare (servono CF_ACCOUNT_ID e CF_API_TOKEN). */
  cloudflare: boolean
}

/* ─────────────────────────────  I giocatori  ───────────────────────────── */

export type OrdineGiocatori = 'recenti' | 'iscritti' | 'nome' | 'attivi'
export type FiltroGiocatori = 'tutti' | 'online' | 'non-verificati' | 'sospesi' | 'amministratori'

export interface AdminGiocatoreRiga {
  id: string
  nickname: string
  displayName: string
  avatarColor: string
  email: string | null
  emailVerificata: boolean
  creatoIl: string
  /** L'ultima volta che la presenza l'ha visto; null se mai. */
  vistoIl: string | null
  online: boolean
  /** Che cosa sta facendo, se e' online: l'attivita' della presenza ("wordle", "fortuna"...). */
  attivita: string | null
  ruolo: RuoloAdmin | null
  sospeso: boolean
  /**
   * Una registrazione che aspetta il codice: tiene nickname ed email fino a
   * quest'ora, poi, se non la conferma, se ne va. null per gli account confermati.
   */
  inAttesaFino: string | null
  /** In quanti degli ultimi trenta giorni ha aperto l'app. */
  giorniAttivi30: number
}

/** GET /admin/giocatori?q=&ordine=&filtro=&pagina= */
export interface AdminGiocatori {
  righe: AdminGiocatoreRiga[]
  totale: number
  pagina: number
  perPagina: number
}

export interface AdminSessione {
  /** L'impronta del token (non il token): serve a chiuderla. */
  id: string
  creataIl: string
  usataIl: string
  scadeIl: string
  dispositivo: string | null
  /** Il pannello e' sbloccato su questa sessione fino a quest'ora. */
  adminFino: string | null
}

export interface AdminGiocoDelGiocatore {
  gioco: GiocoClassificato
  /** Le giornate finite, da sempre. */
  giornate: number
  punti: number
  ultima: string | null
  /** La partita di oggi: null se non l'ha aperta. */
  oggi: { stato: 'in corso' | 'finita'; punti: number } | null
}

/** GET /admin/giocatori/:id */
export interface AdminGiocatore {
  giocatore: AdminGiocatoreRiga & {
    nicknameCambiatoIl: string | null
    /** Le notifiche scelte, per categoria; null se mai toccate. */
    notifiche: Record<string, boolean> | null
  }
  sessioni: AdminSessione[]
  /** Gli ultimi trenta giorni: 1 se ha aperto l'app, 0 se no. */
  attivita: SerieGiorno[]
  giochi: AdminGiocoDelGiocatore[]
  fortuna: { oggi: number; sempre: number; giocate: number }
  dispositiviNotifiche: number
}

/**
 * PATCH /admin/giocatori/:id: quel che si cambia, solo i campi presenti. Il
 * ruolo lo cambia solo il proprietario; il proprietario non si sospende.
 */
export interface ModificaGiocatore {
  displayName?: string
  nickname?: string
  email?: string | null
  emailVerificata?: boolean
  ruolo?: 'admin' | null
  sospeso?: boolean
  /** Il nickname si puo' cambiare subito, senza aspettare la settimana. */
  sbloccaNickname?: true
}

/** I giochi di cui il pannello azzera una giornata (POST /admin/giocatori/:id/azzera). */
export type GiocoAzzerabile = Exclude<GiocoClassificato, 'nomi'>

/* ─────────────────────────────  I giochi  ───────────────────────────── */

export interface AdminGiornoDiGioco {
  numero: number
  data: string
  giocate: number
  finite: number
  mediaPunti: number | null
}

export interface AdminStatisticheGioco {
  gioco: GiocoClassificato
  /** Gli ultimi quattordici giorni, oggi per ultimo. */
  giorni: AdminGiornoDiGioco[]
  /** I migliori di oggi. */
  migliori: Array<{ id: string; nickname: string; punti: number }>
  /** Da sempre. */
  totale: { giocate: number; giocatori: number; mediaPunti: number | null }
}

/** GET /admin/giochi */
export interface AdminGiochi {
  oggi: number
  giochi: AdminStatisticheGioco[]
}

/** I contenuti che la notte prepara, per gioco. */
export type ContenutoDelGiorno =
  | 'wordle'
  | 'cruciverba'
  | 'sudoku'
  | 'quiz'
  | 'ghigliottina'
  | 'catena'
  | 'anagrammi'
  | 'paroliere'
  | 'scarabeo'
  | 'crazy-time'

/** GET /admin/contenuti: dai tre giorni passati ai quattordici che vengono, che cosa e' pronto. */
export interface AdminContenuti {
  oggi: number
  giorni: Array<{ numero: number; data: string }>
  contenuti: Array<{ contenuto: ContenutoDelGiorno; pronti: boolean[] }>
  /** Le scorte delle libere che la notte tiene piene. */
  scorte: Array<{ nome: string; quanti: number }>
}

/** GET /admin/contenuti/:contenuto/:numero: il contenuto di un giorno, soluzioni comprese. */
export interface AdminContenuto {
  contenuto: ContenutoDelGiorno
  numero: number
  data: string
  dati: unknown
}

/* ─────────────────────────────  La Fortuna  ───────────────────────────── */

export interface AdminFortunaGioco {
  gioco: 'crazy-time' | 'slot' | 'blackjack' | 'roulette' | 'superenalotto' | string
  giocatori: number
  giocate: number
  /** Quel che i giocatori hanno vinto meno quel che hanno perso: il banco ha guadagnato il contrario. */
  netto: number
}

/** GET /admin/fortuna */
export interface AdminFortuna {
  oggi: AdminFortunaGioco[]
  sempre: AdminFortunaGioco[]
  /** Il netto dei giocatori, giorno per giorno, negli ultimi trenta giorni. */
  serie: SerieGiorno[]
  enalotto: {
    jackpot: number
    concorsi: Array<{
      data: string
      numero: number
      estratti: number[] | null
      raccolta: number
      schede: number
      vincitori: number
      pagato: boolean
    }>
  }
}

/* ─────────────────────────────  Il database  ───────────────────────────── */

export interface AdminTabella {
  nome: string
  colonne: string[]
  indici: number
  sql: string
}

/** GET /admin/database */
export interface AdminDatabase {
  dimensione: number
  limite: number
  tabelle: AdminTabella[]
  migrazioni: Array<{ nome: string; applicataIl: string | null }>
}

/** GET /admin/database/righe?tabelle=a,b: le righe di ogni tabella, contate su richiesta (costano letture). */
export interface AdminConteggi {
  conteggi: Record<string, number>
}

/** POST /admin/sql { sql, scrittura } */
export interface AdminSqlRisultato {
  colonne: string[]
  righe: unknown[][]
  /** Le righe erano di piu': se ne mostrano `MASSIMO_RIGHE_SQL`. */
  troncato: boolean
  meta: {
    righeLette: number
    righeScritte: number
    modifiche: number
    durataMs: number
    dimensione: number | null
  }
}

export const MASSIMO_RIGHE_SQL = 500

/* ─────────────────────────────  Cloudflare  ───────────────────────────── */

export interface AdminCloudflare {
  configurato: boolean
  /** Le variabili che mancano per leggerle. */
  mancano: string[]
  /** Quel che non si e' potuto leggere, sezione per sezione. */
  errori: Array<{ sezione: string; messaggio: string }>
  da: string
  a: string
  /** Le Pages Functions: le richieste all'API, quelle che il piano conta. */
  funzioni: Array<{ data: string; richieste: number; errori: number; cpuP50: number | null; cpuP99: number | null }> | null
  d1: {
    giorni: Array<{ data: string; letture: number; scritture: number; righeLette: number; righeScritte: number }>
    dimensione: number | null
    tabelle: number | null
  } | null
  /** Tutto il dominio, dalle analisi della zona (serve CF_ZONE_ID). */
  traffico: Array<{ data: string; richieste: number; pagine: number; visitatori: number; byte: number }> | null
  /** Le visite dalle Web Analytics (serve CF_WEB_ANALYTICS_TAG). */
  visite: Array<{ data: string; visite: number; pagine: number }> | null
  deploy: Array<{
    id: string
    creatoIl: string
    stato: string
    ambiente: string
    url: string
    commit: string | null
    messaggio: string | null
  }> | null
}

/* ─────────────────────────────  Gli annunci  ───────────────────────────── */

export type TonoAnnuncio = 'info' | 'avviso' | 'festa'

/** Un avviso a tutti, in cima alle Giornaliere: una manutenzione, un gioco nuovo. */
export interface Annuncio {
  id: string
  testo: string
  tono: TonoAnnuncio
  attivo: boolean
  /** Dopo quest'ora non si vede piu'; null se resta finché lo si spegne. */
  fino: string | null
  creatoIl: string
  creatoDa: string | null
}

/** L'annuncio come arriva a chi gioca, con /api/oggi. */
export type AnnuncioVisibile = Pick<Annuncio, 'id' | 'testo' | 'tono'>

export const MASSIMO_TESTO_ANNUNCIO = 280

/** GET /admin/annunci */
export interface AdminAnnunci {
  annunci: Annuncio[]
}

/* ─────────────────────────────  Il registro  ───────────────────────────── */

export interface VoceRegistro {
  id: string
  at: string
  admin: { id: string; nickname: string } | null
  /** Che cosa e' stato fatto: "giocatore.modifica", "sql.scrittura", "annuncio.nuovo"... */
  azione: string
  /** Su che cosa: il nickname di un giocatore, una tabella. */
  oggetto: string | null
  dettagli: unknown
}

/** GET /admin/registro?pagina= */
export interface AdminRegistro {
  voci: VoceRegistro[]
  totale: number
  pagina: number
  perPagina: number
}

export interface ErroreServer {
  id: string
  at: string
  metodo: string
  percorso: string
  messaggio: string
  stack: string | null
  giocatore: string | null
}

/** GET /admin/errori */
export interface AdminErrori {
  errori: ErroreServer[]
  totale: number
}

/* ─────────────────────────────  Il sistema  ───────────────────────────── */

/** GET /admin/sistema */
export interface AdminSistema {
  adesso: string
  giornata: { data: string; numero: number }
  prossimaGiornataMs: number
  configurazione: Array<{ nome: string; valore: string; stato: 'ok' | 'avviso' | 'spento' }>
  amministratori: Array<{ id: string; nickname: string; avatarColor: string; email: string | null; ruolo: RuoloAdmin }>
}

/** Un'email mascherata per lo schermo: "re•••@gmail.com". */
export function mascheraEmail(email: string): string {
  const [nome, dominio] = email.split('@')
  if (!dominio) return email
  return `${nome.slice(0, 2)}•••@${dominio}`
}
