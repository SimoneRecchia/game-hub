/**
 * A che punto e' la classificata di oggi di ogni gioco, detto nello stesso modo
 * per tutti: la schermata iniziale e le pagine dei giochi lo mostrano uguale.
 *
 * Una fase — da giocare, in corso, fatta — un titolo e un dettaglio da leggere,
 * quanto e' fatto (per l'anello), e dove porta il bottone. Ogni gioco misura
 * l'avanzamento con la sua unità: le parole, le mosse, le caselle, i colpi.
 */

import { CASELLE_FLOTTA } from '@shared/battaglia'
import { NOMI_CATEGORIE } from '@shared/quiz'
import { PUNTATA_MINIMA, SPICCHI, conSegno, nomeDi } from '@shared/ruota'
import { NOMI_LIVELLI } from '@shared/sudoku'
import type {
  BattagliaSummary,
  CruciverbaSummary,
  GiocoClassificato,
  OggiRisposta,
  QuizSummary,
  RuotaSummary,
  ScarabeoSummary,
  SudokuSummary,
  WordleSummary,
} from '@shared/types'
import { ROTTE } from '@/app/rotte'

export type Fase = 'da-giocare' | 'in-corso' | 'fatta' | 'non-pronta'

export interface StatoOggi {
  gioco: GiocoClassificato
  fase: Fase
  titolo: string
  dettaglio: string
  /** I punti in classifica fatti finora, se ce ne sono. */
  punti: number | null
  /** Da 0 a 1. */
  avanzamento: number
  azione: string
  a: string
}

export function statoWordle(s: WordleSummary): StatoOggi {
  const fatta = s.status === 'won' || s.status === 'lost'
  const base = { gioco: 'wordle' as const, punti: s.score }
  if (s.roomId && s.status === 'playing') {
    return {
      ...base,
      avanzamento: 0.5,
      fase: 'in-corso',
      titolo: 'In compagnia',
      dettaglio: 'Partita in corso',
      azione: 'Torna alla partita',
      a: ROTTE.insieme(s.roomId),
    }
  }
  if (fatta) {
    return {
      ...base,
      avanzamento: 1,
      fase: 'fatta',
      titolo: s.status === 'won' ? 'Indovinata' : 'Non indovinata',
      dettaglio:
        s.status === 'won' && s.attempts > 0
          ? `In ${s.attempts} ${s.attempts === 1 ? 'tentativo' : 'tentativi'}, ${s.score ?? 0} punti`
          : `${s.score ?? 0} punti`,
      azione: 'Rivedi',
      a: ROTTE.classificata('wordle'),
    }
  }
  if (s.status === 'new' || s.attempts === 0) {
    return {
      ...base,
      avanzamento: 0,
      fase: 'da-giocare',
      titolo: 'Da giocare',
      dettaglio: '',
      azione: 'Gioca',
      a: ROTTE.classificata('wordle'),
    }
  }
  return {
    ...base,
    avanzamento: s.attempts / 6,
    fase: 'in-corso',
    titolo: `${s.attempts} ${s.attempts === 1 ? 'tentativo' : 'tentativi'} su 6`,
    dettaglio: 'Partita in corso',
    azione: 'Continua',
    a: ROTTE.classificata('wordle'),
  }
}

export function statoScarabeo(s: ScarabeoSummary): StatoOggi {
  const base = {
    gioco: 'scarabeo' as const,
    avanzamento: s.status === 'done' ? 1 : s.mosseUsate / s.mosseTotali,
    a: ROTTE.classificata('scarabeo'),
  }
  if (s.status === 'new') {
    return {
      ...base,
      fase: 'da-giocare',
      titolo: 'Da giocare',
      dettaglio: `Il computer ha fatto ${s.computer} punti`,
      punti: null,
      azione: 'Gioca',
    }
  }
  if (s.status === 'done') {
    return {
      ...base,
      fase: 'fatta',
      titolo: 'Fatta',
      dettaglio: `${s.puntiClassifica} punti · ${s.punti} sul tabellone`,
      punti: s.puntiClassifica,
      azione: 'Rivedi',
    }
  }
  const restano = s.mosseTotali - s.mosseUsate
  return {
    ...base,
    fase: 'in-corso',
    titolo: `${s.punti} contro ${s.computer}`,
    dettaglio: restano === 1 ? 'Resta 1 mossa' : `Restano ${restano} mosse`,
    punti: s.puntiClassifica,
    azione: 'Continua',
  }
}

export function statoCruciverba(s: CruciverbaSummary): StatoOggi {
  const base = {
    gioco: 'cruciverba' as const,
    avanzamento: s.status === 'done' ? 1 : s.bianche > 0 ? s.scritte / s.bianche : 0,
    a: ROTTE.classificata('cruciverba'),
  }
  switch (s.status) {
    case 'assente':
      return {
        ...base,
        fase: 'non-pronta',
        titolo: 'Non ancora pronto',
        dettaglio: 'Riprova più tardi',
        punti: null,
        azione: 'Aspetta',
      }
    case 'new':
      return {
        ...base,
        fase: 'da-giocare',
        titolo: 'Da giocare',
        dettaglio: `${s.bianche} caselle da scrivere`,
        punti: null,
        azione: 'Gioca',
      }
    case 'done':
      return {
        ...base,
        fase: 'fatta',
        titolo: 'Fatto',
        dettaglio: `${s.punti} punti`,
        punti: s.punti,
        azione: 'Rivedi',
      }
    default: {
      const restano = s.bianche - s.scritte
      return {
        ...base,
        fase: 'in-corso',
        titolo: `${Math.round(base.avanzamento * 100)}% scritto`,
        dettaglio: restano > 0 ? `${restano} ${restano === 1 ? 'casella' : 'caselle'} da scrivere` : 'Da controllare',
        punti: null,
        azione: 'Continua',
      }
    }
  }
}

export function statoSudoku(s: SudokuSummary): StatoOggi {
  const base = {
    gioco: 'sudoku' as const,
    avanzamento: s.status === 'done' ? 1 : s.vuote > 0 ? s.scritte / s.vuote : 0,
    a: ROTTE.classificata('sudoku'),
  }
  const livello = s.livello ? NOMI_LIVELLI[s.livello] : ''
  switch (s.status) {
    case 'assente':
      return {
        ...base,
        fase: 'non-pronta',
        titolo: 'Non ancora pronto',
        dettaglio: 'Riprova più tardi',
        punti: null,
        azione: 'Aspetta',
      }
    case 'new':
      return {
        ...base,
        fase: 'da-giocare',
        titolo: 'Da giocare',
        dettaglio: `${livello} · ${s.vuote} caselle da scrivere`,
        punti: null,
        azione: 'Gioca',
      }
    case 'done':
      return {
        ...base,
        fase: 'fatta',
        titolo: 'Fatto',
        dettaglio: `${livello} · ${s.punti} punti`,
        punti: s.punti,
        azione: 'Rivedi',
      }
    default: {
      const restano = s.vuote - s.scritte
      return {
        ...base,
        fase: 'in-corso',
        titolo: `${Math.round(base.avanzamento * 100)}% scritto`,
        dettaglio: restano > 0 ? `${livello} · ${restano === 1 ? 'manca 1 casella' : `mancano ${restano} caselle`}` : 'Da controllare',
        punti: null,
        azione: 'Continua',
      }
    }
  }
}

export function statoBattaglia(s: BattagliaSummary): StatoOggi {
  const c = s.classificata
  const base = { gioco: 'battaglia' as const, a: ROTTE.classificata('battaglia') }
  if (c.stato === 'finita') {
    return {
      ...base,
      fase: 'fatta',
      titolo: c.vinta ? 'Vinta' : 'Persa',
      dettaglio: `${c.punti ?? 0} punti in ${c.colpi} colpi`,
      punti: c.punti,
      avanzamento: 1,
      azione: 'Rivedi',
    }
  }
  if (c.stato === 'nuova') {
    return {
      ...base,
      fase: 'da-giocare',
      titolo: 'Da giocare',
      dettaglio: '',
      punti: null,
      avanzamento: 0,
      azione: 'Gioca',
    }
  }
  return {
    ...base,
    fase: 'in-corso',
    titolo: c.stato === 'disposizione' ? 'Disponi la flotta' : 'In battaglia',
    dettaglio: c.colpi > 0 ? `${c.colpi} ${c.colpi === 1 ? 'colpo sparato' : 'colpi sparati'}` : 'Tocca a te',
    punti: null,
    avanzamento: c.stato === 'disposizione' ? 0.1 : Math.min(0.95, c.colpi / (CASELLE_FLOTTA * 3)),
    azione: 'Continua',
  }
}

export function statoQuiz(s: QuizSummary): StatoOggi {
  const base = {
    gioco: 'quiz' as const,
    avanzamento: s.status === 'done' ? 1 : s.totale > 0 ? s.fatte / s.totale : 0,
    a: ROTTE.classificata('quiz'),
  }
  // "Fiumi sulla cartina muta": il modo del giorno si dice, perché cambia il gioco.
  const categoria = s.categoria
    ? `${NOMI_CATEGORIE[s.categoria]}${s.modo === 'cartina' && s.categoria !== 'cartina' ? ' sulla cartina' : ''}`
    : 'Quiz'
  switch (s.status) {
    case 'assente':
      return {
        ...base,
        fase: 'non-pronta',
        titolo: 'Non ancora pronto',
        dettaglio: 'Riprova più tardi',
        punti: null,
        azione: 'Aspetta',
      }
    case 'nuova':
      return {
        ...base,
        fase: 'da-giocare',
        titolo: 'Da giocare',
        dettaglio: `Oggi: ${categoria}, ${s.totale} domande`,
        punti: null,
        azione: 'Gioca',
      }
    case 'done':
      return {
        ...base,
        fase: 'fatta',
        titolo: `${s.giuste} su ${s.totale}`,
        dettaglio: `${categoria} · ${s.punti} punti`,
        punti: s.punti,
        azione: 'Rivedi',
      }
    default:
      return {
        ...base,
        fase: 'in-corso',
        titolo: `${s.fatte} ${s.fatte === 1 ? 'domanda' : 'domande'} su ${s.totale}`,
        dettaglio: `${categoria} · ${s.giuste} ${s.giuste === 1 ? 'giusta' : 'giuste'} finora`,
        punti: null,
        azione: 'Continua',
      }
  }
}

export function statiDiOggi(oggi: OggiRisposta): Record<GiocoClassificato, StatoOggi> {
  return {
    wordle: statoWordle(oggi.wordle),
    scarabeo: statoScarabeo(oggi.scarabeo),
    cruciverba: statoCruciverba(oggi.cruciverba),
    sudoku: statoSudoku(oggi.sudoku),
    battaglia: statoBattaglia(oggi.battaglia),
    quiz: statoQuiz(oggi.quiz),
  }
}

/** La ruota, detta come le classificate: non e' un gioco con i suoi punti, quindi niente `gioco` ne' `punti`. */
export type StatoRuota = Omit<StatoOggi, 'gioco' | 'punti'>

/**
 * La ruota nella schermata iniziale. Si gira una volta, quando ci sono i punti
 * da puntare: prima, l'anello dice quanto manca alla puntata minima.
 */
export function statoRuota(s: RuotaSummary): StatoRuota {
  const a = ROTTE.ruota
  if (s.stato === 'fatto') {
    const delta = s.delta ?? 0
    const dettaglio = delta === 0 ? 'Niente di più, niente di meno' : `${conSegno(delta)} punti`
    return { fase: 'fatta', titolo: 'Girata', dettaglio, avanzamento: 1, azione: 'Rivedi', a }
  }
  if (s.stato === 'sfida') {
    const spicchio = s.spicchio === null ? undefined : SPICCHI[s.spicchio]
    const dettaglio = spicchio ? nomeDi(spicchio) : ''
    return { fase: 'in-corso', titolo: 'Sfida in corso', dettaglio, avanzamento: 0.5, azione: 'Continua', a }
  }
  if (s.puntiDiOggi < PUNTATA_MINIMA) {
    return {
      fase: 'non-pronta',
      titolo: 'Prima le classificate',
      dettaglio: `Servono ${PUNTATA_MINIMA} punti di oggi`,
      avanzamento: Math.max(0, s.puntiDiOggi) / PUNTATA_MINIMA,
      azione: '',
      a,
    }
  }
  return {
    fase: 'da-giocare',
    titolo: 'Da girare',
    dettaglio: `Puoi puntare fino a ${s.puntiDiOggi} punti`,
    avanzamento: 0,
    azione: 'Gira',
    a,
  }
}
