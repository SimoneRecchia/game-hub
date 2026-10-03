/**
 * Gli indirizzi dell'app, in un posto solo.
 *
 * Tutto sta su giochi.simonerecchia.com, e ogni indirizzo dice dove si e' con
 * le parole del gioco: il nome del gioco, poi la modalità, poi la partita.
 *
 *   /                                   le Giornaliere: le classificate di oggi, la pagina d'apertura
 *   /libere                             le Libere: le libere dei giochi e i giochi da tavolo, e chi c'e'
 *   /wordle                             porta alla parola di oggi: un gioco non ha una pagina sua
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
 *   /quiz/libera                        il menu delle materie; con ?categoria=… la partita
 *   /quiz/libera/:materia               le categorie e le opzioni di una materia
 *   /quiz/duello/:id                    una sfida a quiz fra due
 *   /quiz/sfida/:codice                 una sfida a quiz arrivata con un link
 *   /nomi-cose-citta/classificata       la lettera di oggi, la stessa per tutti
 *   /nomi-cose-citta/libera             una lettera a caso, contro il computer
 *   /tris/classificata                  le cinque partite di oggi contro il computer
 *   /tris/libera                        la sala: contro il computer, o con un amico
 *   /tris/libera/computer               la partita contro il computer, nel telefono
 *   /tris/libera/partita/:id            una partita con un amico
 *   /tris/libera/invito/:codice         un invito arrivato con un link
 *   /fortuna                            i giochi d'azzardo: si puntano i punti delle classificate
 *   /crazy-time                         Crazy Time (/ruota ci porta)
 *   /slot                               la slot
 *   /blackjack                          la sala del blackjack: un tavolo nuovo, o quello di un amico
 *   /blackjack/tavolo/:id               un tavolo, fino a cinque giocatori
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
 *   /classifica/fortuna                 chi ha vinto di piu' ai giochi della Fortuna
 *   /classifica/wordle                  quella di un gioco (?periodo=week&indietro=1)
 *   /profilo                            le impostazioni e gli amici online
 *   /amici/:nickname                    il profilo di un amico, da cui lo si invita a giocare
 *
 * I vecchi indirizzi — /insieme/..., /battaglia/..., /wordle/3 — portano a
 * quelli nuovi (vedi App.tsx), e i vecchi sottodomini dei giochi portano qui
 * (vedi index.html): un link salvato o una schermata aggiunta alla Home non si
 * rompono.
 */

import type { MateriaQuiz } from '@shared/quiz'
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
  tris: 'tris',
  nomi: 'nomi-cose-citta',
}

export function giocoDaSlug(slug: string | undefined): GiocoClassificato | null {
  const trovato = (Object.keys(SLUG) as GiocoClassificato[]).find((g) => SLUG[g] === slug)
  return trovato ?? null
}

/**
 * Lo stesso per i giochi da tavoliere: "forza-4", non "forza4". Il tris ha una
 * classificata, e le sue partite fra amici e contro il computer sono la sua
 * libera: la sala sta a /tris/libera.
 */
export const SLUG_TAVOLIERE: Record<GiocoTavoliere, string> = {
  scacchi: 'scacchi',
  dama: 'dama',
  forza4: 'forza-4',
  go: 'go',
  tris: 'tris/libera',
}

export const ROTTE = {
  home: '/',
  libere: '/libere',
  profilo: '/profilo',
  amico: (nickname: string) => `/amici/${encodeURIComponent(nickname)}`,
  fortuna: '/fortuna',
  ruota: '/crazy-time',
  slot: '/slot',
  blackjack: '/blackjack',
  tavoloBJ: (id: string) => `/blackjack/tavolo/${id}`,
  /** Senza niente, tutte le classifiche; con un gioco o 'generale', quella per intero. */
  classifica: (chiave?: ChiaveClassifica) =>
    !chiave
      ? '/classifica'
      : chiave === 'generale' || chiave === 'fortuna'
        ? `/classifica/${chiave}`
        : `/classifica/${SLUG[chiave]}`,
  /** L'indirizzo del gioco, radice delle sue schermate: da solo porta alla classificata. */
  gioco: (gioco: GiocoClassificato) => `/${SLUG[gioco]}`,
  classificata: (gioco: GiocoClassificato) => `/${SLUG[gioco]}/classificata`,
  libera: (gioco: GiocoClassificato) => `/${SLUG[gioco]}/libera`,

  insieme: (stanza: string) => `/wordle/insieme/${stanza}`,
  cruciverbaLibero: (partita: string) => `/cruciverba/libera/${partita}`,
  partitaBattaglia: (id: string) => `/battaglia-navale/partita/${id}`,
  invitoBattaglia: (codice: string) => `/battaglia-navale/invito/${codice}`,
  /** La pagina di una materia del quiz libero, con le sue categorie e le opzioni. */
  materiaQuiz: (materia: MateriaQuiz) => `/quiz/libera/${materia}`,
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
