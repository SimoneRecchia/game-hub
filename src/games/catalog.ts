import type { GiocoClassificato, GiocoDaTavolo } from '@shared/types'

export interface Gioco {
  id: GiocoClassificato
  nome: string
  /** Una riga, sotto il nome. */
  motto: string
  /** Cosa e' la classificata di questo gioco, in una frase. */
  classificata: string
  /** Cosa e' la libera. */
  libera: string
  /** Il nome della partita libera, come si legge su un bottone. */
  liberaBreve: string
}

/**
 * I giochi dell'app, nell'ordine in cui si mostrano.
 *
 * Il colore di ogni gioco non sta qui: sta nei token (`--wordle-1`, ...), e la
 * copertina lo prende da lì. Aggiungere un gioco = una voce qui, una copertina
 * in Copertina.tsx, le sue rotte in App.tsx.
 */
export const GIOCHI: readonly Gioco[] = [
  {
    id: 'wordle',
    nome: 'Wordle',
    motto: 'Cinque lettere, sei tentativi',
    classificata: 'Una parola al giorno, la stessa per tutti.',
    libera: 'Una parola a caso, quante ne vuoi.',
    liberaBreve: 'Parola libera',
  },
  {
    id: 'scarabeo',
    nome: 'Scarabeo',
    motto: 'Le tessere di oggi contro il computer',
    classificata: 'Dieci mosse a testa, lo stesso sacchetto per tutti.',
    libera: 'Fino in fondo al sacchetto, contro il computer o un amico.',
    liberaBreve: 'Amici o computer',
  },
  {
    id: 'cruciverba',
    nome: 'Cruciverba',
    motto: 'Orizzontali e verticali',
    classificata: 'Uno schema al giorno, lo stesso per tutti.',
    libera: 'Uno schema nuovo, quando vuoi.',
    liberaBreve: 'Schema libero',
  },
  {
    id: 'sudoku',
    nome: 'Sudoku',
    motto: 'Nove righe, nove colonne, nove riquadri',
    classificata: 'Uno schema al giorno, lo stesso per tutti.',
    libera: 'Uno schema nuovo, della difficoltà che vuoi.',
    liberaBreve: 'Schema libero',
  },
  {
    id: 'quiz',
    nome: 'Quiz',
    motto: 'Geografia, storia, arte, libri, cinema e scienza',
    classificata: 'Dieci domande al giorno, le stesse per tutti.',
    libera: 'Scegli materia, categoria e numero di domande.',
    liberaBreve: 'Quiz libero',
  },
  {
    id: 'ghigliottina',
    nome: 'Ghigliottina',
    motto: 'Cinque parole, una che le lega tutte',
    classificata: 'Una ghigliottina al giorno, la stessa per tutti: ogni scelta sbagliata dimezza il montepremi.',
    libera: 'Una ghigliottina a caso, quante ne vuoi.',
    liberaBreve: 'Ghigliottina libera',
  },
  {
    id: 'catena',
    nome: 'Catena',
    motto: 'Ogni parola si lega a quella dopo',
    classificata: 'Una catena al giorno, la stessa per tutti: ogni errore dimezza il montepremi.',
    libera: 'Una catena a caso, quante ne vuoi.',
    liberaBreve: 'Catena libera',
  },
  {
    id: 'nomi',
    nome: 'Nomi, cose e città',
    motto: 'Una lettera, cinque categorie',
    classificata: 'Una lettera al giorno, la stessa per tutti.',
    libera: 'Una lettera a caso, contro il computer o contro un amico.',
    liberaBreve: 'Contro chi vuoi',
  },
  {
    id: 'anagrammi',
    nome: 'Anagrammi',
    motto: 'Le lettere mescolate, e la parola giusta',
    classificata: 'Cinque parole al giorno, le stesse per tutti: più presto le trovi, più valgono.',
    libera: 'Cinque parole a caso, della lunghezza che vuoi.',
    liberaBreve: 'Parole a caso',
  },
  {
    id: 'paroliere',
    nome: 'Paroliere',
    motto: 'Sedici dadi, tre minuti, tutte le parole che vedi',
    classificata: 'Una griglia al giorno, la stessa per tutti.',
    libera: 'Una griglia a caso, quattro per quattro o cinque per cinque.',
    liberaBreve: 'Griglia libera',
  },
  {
    id: 'sequenze',
    nome: 'Sequenze',
    motto: 'I cubetti si accendono: tocca nello stesso ordine',
    classificata: 'Cinque turni al giorno, gli stessi per tutti, da tre a nove cubetti.',
    libera: 'Finché non sbagli, da solo o contro un amico.',
    liberaBreve: 'Solo o con un amico',
  },
  {
    id: 'tris',
    nome: 'Tris',
    motto: 'Tre in fila, dieci secondi a mossa',
    classificata: 'Cinque partite contro il computer del giorno, lo stesso per tutti.',
    libera: 'Contro il computer o contro un amico.',
    liberaBreve: 'Contro chi vuoi',
  },
]

export function giocoDi(id: GiocoClassificato): Gioco {
  return GIOCHI.find((g) => g.id === id)!
}

export interface GiocoTavolo {
  id: GiocoDaTavolo
  nome: string
  motto: string
  /** Contro chi: fra amici e basta, o anche contro il computer. */
  conChi: string
  /** Dove sta: il pezzo di indirizzo. */
  slug: string
}

/**
 * I giochi da tavolo: niente partita del giorno e niente classifica, solo
 * partite quando si vuole, con gli amici — e contro il computer dove ha senso.
 * Indovina chi, Lupus e Scarabocchi non ce l'hanno: si giocano parlandosi, o
 * disegnando. Il tris non sta
 * qui: ha la sua classificata, e le partite da tavolo sono la sua libera. La
 * battaglia navale si': la sua classificata misurava piu' la fortuna che il gioco.
 */
export const GIOCHI_DA_TAVOLO: readonly GiocoTavolo[] = [
  {
    id: 'battaglia',
    nome: 'Battaglia navale',
    motto: 'Cinque navi, un colpo per volta',
    conChi: 'Amici o computer',
    slug: 'battaglia-navale',
  },
  {
    id: 'scacchi',
    nome: 'Scacchi',
    motto: 'Scacco matto al re dell’altro',
    conChi: 'Amici o computer',
    slug: 'scacchi',
  },
  {
    id: 'dama',
    nome: 'Dama',
    motto: 'All’italiana: si mangia per forza',
    conChi: 'Amici o computer',
    slug: 'dama',
  },
  {
    id: 'forza4',
    nome: 'Forza 4',
    motto: 'Quattro in fila, prima dell’altro',
    conChi: 'Amici o computer',
    slug: 'forza-4',
  },
  {
    id: 'go',
    nome: 'Go',
    motto: 'Circonda più territorio dell’altro',
    conChi: 'Amici o computer',
    slug: 'go',
  },
  {
    id: 'indovina',
    nome: 'Indovina chi',
    motto: 'Sì o no, finché resta una faccia',
    conChi: 'Con un amico',
    slug: 'indovina-chi',
  },
  {
    id: 'lupus',
    nome: 'Lupus',
    motto: 'Di notte i lupi, di giorno il villaggio',
    conChi: 'Con gli amici',
    slug: 'lupus',
  },
  {
    id: 'scarabocchi',
    nome: 'Scarabocchi',
    motto: 'Uno disegna, gli altri indovinano',
    conChi: 'Con gli amici',
    slug: 'scarabocchi',
  },
]

/** Il tris fra i tavolieri: la sua sala e' la libera della classificata, e non sta fra i giochi da tavolo. */
const TRIS_DA_TAVOLO: GiocoTavolo = {
  id: 'tris',
  nome: 'Tris',
  motto: 'Tre in fila, dieci secondi a mossa',
  conChi: 'Amici o computer',
  slug: 'tris/libera',
}

/**
 * Le famiglie dei giochi nelle Libere, come li cerca chi vuole giocare: un
 * gioco con la classificata e uno senza stanno insieme se si somigliano. Prima
 * erano due, "I giochi" e "Da tavolo", cioe' quelli con la classificata e gli
 * altri, che e' come sono fatti e non a che cosa si gioca. Lupus sta da solo:
 * e' l'unico che si gioca in tanti con i ruoli segreti. Scarabocchi anche: si
 * disegna. Le Sequenze sono la memoria, e la famiglia aspetta i giochi che
 * verranno.
 */
export const CATEGORIE_LIBERE: readonly CategoriaLibere[] = [
  { nome: 'Enigmistica', giochi: ['wordle', 'cruciverba', 'sudoku', 'anagrammi'] },
  { nome: 'Parole', giochi: ['scarabeo', 'paroliere', 'ghigliottina', 'catena', 'nomi'] },
  { nome: 'Cultura', giochi: ['quiz'] },
  { nome: 'Memoria', giochi: ['sequenze'] },
  { nome: 'Strategia', giochi: ['scacchi', 'dama', 'go', 'forza4', 'tris'] },
  { nome: 'Da tavolo', giochi: ['battaglia', 'indovina'] },
  { nome: 'In gruppo', giochi: ['lupus'] },
  { nome: 'Disegno', giochi: ['scarabocchi'] },
]

/** Una famiglia di giochi nelle Libere: il nome e i giochi, nell'ordine in cui si mostrano. */
export interface CategoriaLibere {
  nome: string
  giochi: ReadonlyArray<GiocoClassificato | GiocoDaTavolo>
}

export function giocoTavoloDi(id: GiocoDaTavolo): GiocoTavolo {
  return [...GIOCHI_DA_TAVOLO, TRIS_DA_TAVOLO].find((g) => g.id === id)!
}
