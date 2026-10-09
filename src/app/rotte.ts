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
 *   /wordle/libera/insieme/:compagnia   una sua partita libera, da guardare
 *   /scarabeo/classificata              le dieci mosse di oggi
 *   /scarabeo/libera                    contro il computer
 *   /scarabeo/insieme/:compagnia        lo Scarabeo di un collega che ti ha invitato
 *   /scarabeo/libera/insieme/:compagnia una sua partita libera, da guardare
 *   /cruciverba/classificata            lo schema di oggi
 *   /cruciverba/libera/:partita         uno schema libero
 *   /cruciverba/insieme/:compagnia      il cruciverba di un collega che ti ha invitato
 *   /cruciverba/libera/insieme/:compagnia  un suo cruciverba libero, da guardare
 *   /sudoku/classificata                lo schema di oggi
 *   /sudoku/libera                      uno schema nuovo, della difficoltà che vuoi
 *   /quiz/classificata                  le dieci domande di oggi
 *   /quiz/libera                        il menu delle materie; con ?categoria=… la partita
 *   /quiz/libera/:materia               le categorie e le opzioni di una materia
 *   /quiz/duello/:id                    una sfida a quiz fra due
 *   /quiz/sfida/:codice                 una sfida a quiz arrivata con un link
 *   /nomi-cose-citta/classificata       la lettera di oggi, la stessa per tutti
 *   /nomi-cose-citta/libera             una lettera a caso, contro il computer o un amico
 *   /nomi-cose-citta/sfida/:id          una sfida con un amico
 *   /nomi-cose-citta/invito/:codice     una sfida arrivata con un link
 *   /tris/libera                        la sala: contro il computer, o con un amico
 *   /tris/libera/computer               la partita contro il computer, nel telefono
 *   /tris/libera/partita/:id            una partita con un amico
 *   /tris/libera/invito/:codice         un invito arrivato con un link
 *   /anagrammi/classificata             le cinque parole di oggi, a tempo
 *   /anagrammi/libera                   parole a caso, della lunghezza che vuoi, da solo o con un amico
 *   /anagrammi/libera/sfida/:id         una sfida con un amico (lo stesso per il sudoku, il Paroliere,
 *                                       la Ghigliottina e la Catena)
 *   /anagrammi/libera/invito/:codice    una sfida arrivata con un link
 *   /ghigliottina/classificata          la ghigliottina di oggi: cinque coppie, poi la parola che le lega
 *   /ghigliottina/libera                una ghigliottina a caso
 *   /paroliere/classificata             la griglia di oggi, tre minuti
 *   /paroliere/libera                   una griglia a caso, quattro per quattro o cinque per cinque
 *   /catena/classificata                la catena di oggi: cinque parole da indovinare, l'ultima decide
 *   /catena/libera                      una catena a caso
 *   /sequenze/classificata              i cinque turni di oggi, gli stessi per tutti
 *   /sequenze/libera                    finché non sbagli, da solo o con un amico
 *   /sequenze/sfida/:id                 una sfida con un amico
 *   /sequenze/invito/:codice            una sfida arrivata con un link
 *   /fortuna                            i giochi d'azzardo: si puntano i punti delle classificate
 *   /crazy-time                         Crazy Time (/ruota ci porta)
 *   /slot                               la slot
 *   /blackjack                          la sala del blackjack: un tavolo nuovo, o quello di un amico
 *   /blackjack/tavolo/:id               un tavolo, fino a cinque giocatori
 *   /roulette                           la sala della roulette: un tavolo nuovo, o quello di un amico
 *   /roulette/tavolo/:id                un tavolo, fino a sei giocatori
 *   /superenalotto                      la schedina, le schede giocate e l'estrazione in diretta
 *   /battaglia-navale                   la sala: contro il computer, o con un amico
 *   /battaglia-navale/partita/:id       una partita
 *   /battaglia-navale/invito/:codice    un invito arrivato con un link
 *   /indovina-chi                       Indovina chi: la sala, i personaggi, le regole
 *   /indovina-chi/partita/:id           una partita
 *   /indovina-chi/invito/:codice        un invito arrivato con un link
 *   /indovina-chi/set/:id               un set di personaggi proprio ('nuovo' per crearne uno)
 *   /lupus                              Lupus: un telefono che passa di mano, o una stanza online
 *   /lupus/telefono                     la partita a un telefono, tutta nel telefono
 *   /lupus/stanza/:codice               una stanza online, con il suo codice: l'attesa, la partita, la fine
 *   /scarabocchi                        Scarabocchi: si apre una stanza, o si entra con un codice
 *   /scarabocchi/stanza/:codice         una stanza: l'attesa, Indovina il disegno o il telefono senza fili, l'album
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
 * I vecchi indirizzi — /insieme/..., /battaglia/..., /wordle/3, la classificata
 * e la libera della battaglia — portano a quelli nuovi (vedi App.tsx), e i
 * vecchi sottodomini dei giochi portano qui
 * (vedi index.html): un link salvato o una schermata aggiunta alla Home non si
 * rompono.
 */

import type { MateriaQuiz } from '@shared/quiz'
import type { GiocoSfidaLibera } from '@shared/sfide-libere'
import type { GiocoAlTavolo, GiocoTavoliere } from '@shared/tavolo'
import type { ChiaveClassifica, GiocoClassificato, GiocoLiberoInCompagnia, ModalitaCompagnia } from '@shared/types'

/** Il pezzo di indirizzo di ogni gioco: "nomi-cose-citta", non "nomi". */
export const SLUG: Record<GiocoClassificato, string> = {
  wordle: 'wordle',
  scarabeo: 'scarabeo',
  cruciverba: 'cruciverba',
  sudoku: 'sudoku',
  quiz: 'quiz',
  nomi: 'nomi-cose-citta',
  anagrammi: 'anagrammi',
  sequenze: 'sequenze',
  ghigliottina: 'ghigliottina',
  paroliere: 'paroliere',
  catena: 'catena',
}

export function giocoDaSlug(slug: string | undefined): GiocoClassificato | null {
  const trovato = (Object.keys(SLUG) as GiocoClassificato[]).find((g) => SLUG[g] === slug)
  return trovato ?? null
}

/**
 * Lo stesso per i giochi da tavoliere: "forza-4", non "forza4". La sala del
 * tris sta a /tris/libera, dove stava quando il tris aveva una classificata:
 * gli inviti con il link di allora funzionano ancora.
 */
export const SLUG_TAVOLIERE: Record<GiocoTavoliere, string> = {
  scacchi: 'scacchi',
  dama: 'dama',
  forza4: 'forza-4',
  go: 'go',
  tris: 'tris/libera',
}

/** Con lo Scarabeo, le cui partite con un amico stanno nella sua libera: la partita, l'invito con il link. */
export const SLUG_AL_TAVOLO: Record<GiocoAlTavolo, string> = { ...SLUG_TAVOLIERE, scarabeo: 'scarabeo/libera' }

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
  roulette: '/roulette',
  tavoloRL: (id: string) => `/roulette/tavolo/${id}`,
  superenalotto: '/superenalotto',
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
  /** La partita di un collega che ti ha invitato: la classificata di oggi, o una sua libera. */
  insiemeA: (gioco: GiocoLiberoInCompagnia, compagnia: string, modalita: ModalitaCompagnia = 'classificata') =>
    modalita === 'libera' ? `/${SLUG[gioco]}/libera/insieme/${compagnia}` : `/${SLUG[gioco]}/insieme/${compagnia}`,
  cruciverbaLibero: (partita: string) => `/cruciverba/libera/${partita}`,
  /** La battaglia navale e' un gioco da tavolo: la sala sta all'indirizzo del gioco. */
  battaglia: '/battaglia-navale',
  partitaBattaglia: (id: string) => `/battaglia-navale/partita/${id}`,
  invitoBattaglia: (codice: string) => `/battaglia-navale/invito/${codice}`,
  /** La pagina di una materia del quiz libero, con le sue categorie e le opzioni. */
  materiaQuiz: (materia: MateriaQuiz) => `/quiz/libera/${materia}`,
  duelloQuiz: (id: string) => `/quiz/duello/${id}`,
  invitoQuiz: (codice: string) => `/quiz/sfida/${codice}`,
  sfidaNomi: (id: string) => `/nomi-cose-citta/sfida/${id}`,
  invitoNomi: (codice: string) => `/nomi-cose-citta/invito/${codice}`,
  sfidaSequenze: (id: string) => `/sequenze/sfida/${id}`,
  invitoSequenze: (codice: string) => `/sequenze/invito/${codice}`,
  /** Le sfide delle libere che si giocano da soli: stanno sotto la libera del gioco. */
  sfidaLibera: (gioco: GiocoSfidaLibera, id: string) => `/${SLUG[gioco]}/libera/sfida/${id}`,
  invitoSfidaLibera: (gioco: GiocoSfidaLibera, codice: string) => `/${SLUG[gioco]}/libera/invito/${codice}`,

  indovina: '/indovina-chi',
  partitaIndovina: (id: string) => `/indovina-chi/partita/${id}`,
  invitoIndovina: (codice: string) => `/indovina-chi/invito/${codice}`,
  setIndovina: (id: string) => `/indovina-chi/set/${id}`,

  lupus: '/lupus',
  telefonoLupus: '/lupus/telefono',
  stanzaLupus: (codice: string) => `/lupus/stanza/${codice}`,
  scarabocchi: '/scarabocchi',
  stanzaScarabocchi: (codice: string) => `/scarabocchi/stanza/${codice}`,

  tavolo: (gioco: GiocoAlTavolo) => `/${SLUG_AL_TAVOLO[gioco]}`,
  computerTavolo: (gioco: GiocoTavoliere) => `/${SLUG_TAVOLIERE[gioco]}/computer`,
  partitaTavolo: (gioco: GiocoAlTavolo, id: string) => `/${SLUG_AL_TAVOLO[gioco]}/partita/${id}`,
  invitoTavolo: (gioco: GiocoAlTavolo, codice: string) => `/${SLUG_AL_TAVOLO[gioco]}/invito/${codice}`,
} as const
