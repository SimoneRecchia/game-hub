/**
 * Gli indirizzi dell'app, in un posto solo.
 *
 * Tutto sta su giochi.simonerecchia.com, e ogni indirizzo dice dove si e' con
 * le parole del gioco: il nome del gioco, poi la modalità, poi la partita.
 *
 *   /                                   i giochi, e le classificate di oggi
 *   /wordle                             la pagina del Wordle
 *   /wordle/classificata                la parola di oggi
 *   /wordle/libera                      una parola a caso
 *   /wordle/insieme/:stanza             la partita di un collega che ti ha invitato
 *   /scarabeo/classificata              le dieci mosse di oggi
 *   /scarabeo/libera                    contro il computer
 *   /cruciverba/classificata            lo schema di oggi
 *   /cruciverba/libera/:partita         uno schema libero
 *   /sudoku/classificata                lo schema di oggi
 *   /sudoku/libera                      uno schema nuovo, della difficoltà che vuoi
 *   /battaglia-navale/classificata      la battaglia di oggi contro il computer
 *   /battaglia-navale/libera            contro il computer o contro un amico
 *   /battaglia-navale/partita/:id       una partita
 *   /battaglia-navale/invito/:codice    un invito arrivato con un link
 *   /quiz/classificata                  le dieci domande di oggi
 *   /quiz/libera                        categoria, zona e domande a scelta
 *   /quiz/duello/:id                    una sfida a quiz fra due
 *   /quiz/sfida/:codice                 una sfida a quiz arrivata con un link
 *   /indovina-chi                       Indovina chi: la sala, i personaggi, le regole
 *   /indovina-chi/partita/:id           una partita
 *   /indovina-chi/invito/:codice        un invito arrivato con un link
 *   /indovina-chi/set/:id               un set di personaggi proprio ('nuovo' per crearne uno)
 *   /scacchi, /dama, /forza-4, /go      la sala: contro il computer, o con un amico
 *   /scacchi/computer                   la partita contro il computer, nel telefono
 *   /scacchi/partita/:id                una partita con un amico
 *   /scacchi/invito/:codice             un invito arrivato con un link
 *   /classifica                         tutte le classifiche: la generale e i giochi
 *   /classifica/generale                la generale per intero
 *   /classifica/wordle                  quella di un gioco (?periodo=week&indietro=1)
 *   /profilo
 *
 * I vecchi indirizzi — /insieme/..., /battaglia/..., /wordle/3 — portano a
 * quelli nuovi (vedi App.tsx), e i vecchi sottodomini dei giochi portano qui
 * (vedi index.html): un link salvato o una schermata aggiunta alla Home non si
 * rompono.
 */

import type { GiocoTavoliere } from '@shared/tavolo'
import type { ChiaveClassifica, GiocoClassificato } from '@shared/types'

/** Il pezzo di indirizzo di ogni gioco: "battaglia-navale", non "battaglia". */
export const SLUG: Record<GiocoClassificato, string> = {
  wordle: 'wordle',
  scarabeo: 'scarabeo',
  cruciverba: 'cruciverba',
  sudoku: 'sudoku',
  battaglia: 'battaglia-navale',
  quiz: 'quiz',
}

export function giocoDaSlug(slug: string | undefined): GiocoClassificato | null {
  const trovato = (Object.keys(SLUG) as GiocoClassificato[]).find((g) => SLUG[g] === slug)
  return trovato ?? null
}

/** Lo stesso per i giochi da tavoliere: "forza-4", non "forza4". */
export const SLUG_TAVOLIERE: Record<GiocoTavoliere, string> = {
  scacchi: 'scacchi',
  dama: 'dama',
  forza4: 'forza-4',
  go: 'go',
}

export const ROTTE = {
  home: '/',
  profilo: '/profilo',
  /** Senza niente, tutte le classifiche; con un gioco o 'generale', quella per intero. */
  classifica: (chiave?: ChiaveClassifica) =>
    !chiave ? '/classifica' : chiave === 'generale' ? '/classifica/generale' : `/classifica/${SLUG[chiave]}`,
  gioco: (gioco: GiocoClassificato) => `/${SLUG[gioco]}`,
  classificata: (gioco: GiocoClassificato) => `/${SLUG[gioco]}/classificata`,
  libera: (gioco: GiocoClassificato) => `/${SLUG[gioco]}/libera`,

  insieme: (stanza: string) => `/wordle/insieme/${stanza}`,
  cruciverbaLibero: (partita: string) => `/cruciverba/libera/${partita}`,
  partitaBattaglia: (id: string) => `/battaglia-navale/partita/${id}`,
  invitoBattaglia: (codice: string) => `/battaglia-navale/invito/${codice}`,
  duelloQuiz: (id: string) => `/quiz/duello/${id}`,
  invitoQuiz: (codice: string) => `/quiz/sfida/${codice}`,

  indovina: '/indovina-chi',
  partitaIndovina: (id: string) => `/indovina-chi/partita/${id}`,
  invitoIndovina: (codice: string) => `/indovina-chi/invito/${codice}`,
  setIndovina: (id: string) => `/indovina-chi/set/${id}`,

  tavolo: (gioco: GiocoTavoliere) => `/${SLUG_TAVOLIERE[gioco]}`,
  computerTavolo: (gioco: GiocoTavoliere) => `/${SLUG_TAVOLIERE[gioco]}/computer`,
  partitaTavolo: (gioco: GiocoTavoliere, id: string) => `/${SLUG_TAVOLIERE[gioco]}/partita/${id}`,
  invitoTavolo: (gioco: GiocoTavoliere, codice: string) => `/${SLUG_TAVOLIERE[gioco]}/invito/${codice}`,
} as const
