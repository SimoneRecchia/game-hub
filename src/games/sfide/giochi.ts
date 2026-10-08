import { ROTTE } from '@/app/rotte'
import { formatCronometro } from '@/lib/format'
import type { GiocoSfida } from '@/games/amici/SalaSfida'
import type {
  GiocoSfidaLibera,
  ImpostazioniAnagrammi,
  ImpostazioniFinale,
  ImpostazioniParoliere,
  ImpostazioniSfidaLibera,
  ImpostazioniSudoku,
} from '@shared/sfide-libere'
import type { LatoSfidaLibera } from '@shared/types'

/**
 * Come si chiamano le sfide delle libere da soli, gioco per gioco: il nome, la
 * frase dell'avviso, il colore, e come si dicono le opzioni e fin dove e'
 * arrivato uno dei due. Leggero di proposito: lo leggono l'avviso, che sta su
 * ogni schermata, e la registrazione.
 */
export interface InfoSfida {
  nome: string
  /** "ti sfida al Paroliere." */
  sfida: string
  colore: string
  colore2: string
}

export const SFIDE_LIBERE: Record<GiocoSfidaLibera, InfoSfida> = {
  sudoku: {
    nome: 'Sudoku',
    sfida: 'ti sfida a sudoku.',
    colore: 'var(--sudoku-1)',
    colore2: 'var(--sudoku-2)',
  },
  anagrammi: {
    nome: 'Anagrammi',
    sfida: 'ti sfida agli Anagrammi.',
    colore: 'var(--anagrammi-1)',
    colore2: 'var(--anagrammi-2)',
  },
  paroliere: {
    nome: 'Paroliere',
    sfida: 'ti sfida al Paroliere.',
    colore: 'var(--paroliere-1)',
    colore2: 'var(--paroliere-2)',
  },
  ghigliottina: {
    nome: 'Ghigliottina',
    sfida: 'ti sfida alla Ghigliottina.',
    colore: 'var(--ghigliottina-1)',
    colore2: 'var(--ghigliottina-2)',
  },
  catena: {
    nome: 'Catena',
    sfida: 'ti sfida alla Catena.',
    colore: 'var(--catena-1)',
    colore2: 'var(--catena-2)',
  },
}

const LIVELLI_SUDOKU: Record<ImpostazioniSudoku['livello'], string> = {
  facile: 'Facile',
  media: 'Medio',
  difficile: 'Difficile',
  esperto: 'Esperto',
}

const LIVELLI_ANAGRAMMI: Record<ImpostazioniAnagrammi['livello'], string> = {
  facile: 'Facile',
  normale: 'Normale',
  difficile: 'Difficile',
}

const minuti = (n: number) => (n === 1 ? 'un minuto' : `${n} minuti`)

/** Le opzioni in una riga: "4×4 · 3 minuti". */
export function descriviOpzioni(gioco: GiocoSfidaLibera, imp: ImpostazioniSfidaLibera): string {
  switch (gioco) {
    case 'sudoku': {
      const i = imp as ImpostazioniSudoku
      return `${LIVELLI_SUDOKU[i.livello]} · ${minuti(i.minuti)}`
    }
    case 'anagrammi': {
      const i = imp as ImpostazioniAnagrammi
      return `${LIVELLI_ANAGRAMMI[i.livello]} · ${i.secondi} secondi a parola`
    }
    case 'paroliere': {
      const i = imp as ImpostazioniParoliere
      return `${i.lato}×${i.lato} · ${minuti(i.minuti)}`
    }
    default:
      return `Finale di ${(imp as ImpostazioniFinale).secondi} secondi`
  }
}

/**
 * Fin dove e' arrivato uno dei due, in poche lettere: i punti dove si contano
 * mentre si gioca, la strada dove i punti arrivano solo alla fine (la
 * Ghigliottina e la Catena si vincono con la parola finale), la percentuale
 * delle caselle giuste nel sudoku.
 */
export function descriviLato(gioco: GiocoSfidaLibera, l: LatoSfidaLibera): string {
  if (!l.partito && !l.finito) return '–'
  switch (gioco) {
    case 'sudoku':
      return l.finito && l.passo === 100 ? formatCronometro(l.tempoMs) : `${l.passo}%`
    case 'anagrammi':
    case 'paroliere':
      return `${l.punti}`
    case 'ghigliottina':
      return l.finito ? `${l.punti}` : l.passo >= 5 ? 'finale' : `${l.passo}/5`
    case 'catena':
      return l.finito ? `${l.punti}` : l.passo >= 4 ? 'finale' : `${l.passo}/4`
  }
}

/** Cosa dice il numero di `descriviLato`, sotto il nome: "punti", "caselle", "coppie". */
export function unitaLato(gioco: GiocoSfidaLibera, l: LatoSfidaLibera): string {
  if (!l.partito && !l.finito) return 'non ancora partito'
  switch (gioco) {
    case 'sudoku':
      return l.finito && l.passo === 100 ? 'risolto' : 'caselle giuste'
    case 'anagrammi':
    case 'paroliere':
      return 'punti'
    case 'ghigliottina':
      return l.finito ? 'punti' : l.passo >= 5 ? 'la parola vincente' : 'coppie'
    case 'catena':
      return l.finito ? 'punti' : l.passo >= 4 ? 'la parola finale' : 'parole'
  }
}

/** Il gioco come lo vuole la sala delle sfide: dove stanno le sue rotte, e come si chiama nel foglio di condivisione. */
export function salaDi(gioco: GiocoSfidaLibera): GiocoSfida {
  return {
    api: `/sfide/${gioco}`,
    partite: '/sfide/partita',
    sfida: (id) => ROTTE.sfidaLibera(gioco, id),
    invito: (codice) => ROTTE.invitoSfidaLibera(gioco, codice),
    nome: SFIDE_LIBERE[gioco].nome,
    domanda: `Una sfida a ${SFIDE_LIBERE[gioco].nome}?`,
  }
}
