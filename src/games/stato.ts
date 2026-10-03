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
import { PUNTATA_MINIMA, nomeDi, spicchiDelGiorno } from '@shared/ruota'
import { PUNTATA_MASSIMA_SLOT, PUNTATA_MINIMA_SLOT } from '@shared/slot'
import { PUNTATA_MINIMA_BJ } from '@shared/blackjack'
import { NOMI_LIVELLI } from '@shared/sudoku'
import type {
  BattagliaSummary,
  CompagniaBreve,
  CruciverbaSummary,
  FortunaRisposta,
  GiocoClassificato,
  NomiSummary,
  OggiRisposta,
  QuizSummary,
  RuotaSummary,
  ScarabeoSummary,
  SudokuSummary,
  TrisSummary,
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

/**
 * La giornata giocata in compagnia di qualcuno: la carta porta alla sua
 * partita, e dice con chi. I punti sono quelli dell'host.
 */
function inCompagnia(
  gioco: 'scarabeo' | 'cruciverba',
  fatta: boolean,
  insieme: CompagniaBreve,
  punti: number | null,
): StatoOggi {
  const con = `Con ${insieme.host.displayName}`
  return {
    gioco,
    fase: fatta ? 'fatta' : 'in-corso',
    titolo: 'In compagnia',
    dettaglio: punti !== null && (fatta || gioco === 'scarabeo') ? `${con} · ${punti} punti` : con,
    punti,
    avanzamento: fatta ? 1 : 0.5,
    azione: fatta ? 'Rivedi' : 'Torna alla partita',
    a: ROTTE.insiemeA(gioco, insieme.id),
  }
}

export function statoScarabeo(s: ScarabeoSummary): StatoOggi {
  if (s.inCompagnia) return inCompagnia('scarabeo', s.status === 'done', s.inCompagnia, s.puntiClassifica)
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
  if (s.inCompagnia) {
    return inCompagnia('cruciverba', s.status === 'done', s.inCompagnia, s.status === 'done' ? s.punti : null)
  }
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

/** Com'e' andata la serie, partita per partita: "2 vinte, 1 patta". */
function contoTris(esiti: readonly string[]): string {
  const vinte = esiti.filter((e) => e === 'vinta').length
  const patte = esiti.filter((e) => e === 'patta').length
  const perse = esiti.length - vinte - patte
  const pezzi = [
    vinte > 0 ? `${vinte} ${vinte === 1 ? 'vinta' : 'vinte'}` : '',
    patte > 0 ? `${patte} ${patte === 1 ? 'patta' : 'patte'}` : '',
    perse > 0 ? `${perse} ${perse === 1 ? 'persa' : 'perse'}` : '',
  ].filter(Boolean)
  return pezzi.join(', ')
}

export function statoTris(s: TrisSummary): StatoOggi {
  const fatte = s.esiti.length
  const base = {
    gioco: 'tris' as const,
    avanzamento: s.totale > 0 ? fatte / s.totale : 0,
    a: ROTTE.classificata('tris'),
  }
  if (s.status === 'done') {
    return {
      ...base,
      avanzamento: 1,
      fase: 'fatta',
      titolo: contoTris(s.esiti),
      dettaglio: `${s.punti} punti`,
      punti: s.punti,
      azione: 'Rivedi',
    }
  }
  if (s.status === 'new' || fatte === 0) {
    return {
      ...base,
      fase: s.status === 'new' ? 'da-giocare' : 'in-corso',
      titolo: s.status === 'new' ? 'Da giocare' : `Partita 1 di ${s.totale}`,
      dettaglio: s.status === 'new' ? `${s.totale} partite contro il computer` : 'In corso',
      punti: null,
      azione: s.status === 'new' ? 'Gioca' : 'Continua',
    }
  }
  return {
    ...base,
    fase: 'in-corso',
    titolo: `${fatte} ${fatte === 1 ? 'partita' : 'partite'} su ${s.totale}`,
    dettaglio: contoTris(s.esiti),
    punti: null,
    azione: 'Continua',
  }
}

/**
 * Nomi, cose e città: la partita di oggi, e nel dettaglio i punti di ieri, che
 * la notte ha contato e valgono oggi. Quelli di oggi arriveranno stanotte.
 */
export function statoNomi(s: NomiSummary): StatoOggi {
  const base = { gioco: 'nomi' as const, a: ROTTE.classificata('nomi'), punti: s.ieri }
  const ieri = s.ieri !== null ? `Ieri ${s.ieri} punti` : null
  if (s.status === 'done') {
    return {
      ...base,
      avanzamento: 1,
      fase: 'fatta',
      titolo:
        s.valide !== null
          ? `${s.valide} ${s.valide === 1 ? 'valida' : 'valide'} su ${s.totale}`
          : `${s.scritte} ${s.scritte === 1 ? 'risposta' : 'risposte'} su ${s.totale}`,
      dettaglio: 'I punti arrivano stanotte',
      azione: 'Rivedi',
    }
  }
  if (s.status === 'nuova') {
    return {
      ...base,
      avanzamento: 0,
      fase: 'da-giocare',
      titolo: 'Da giocare',
      dettaglio: ieri ?? `Una lettera, ${s.totale} categorie`,
      azione: 'Gioca',
    }
  }
  return {
    ...base,
    avanzamento: s.totale > 0 ? s.scritte / s.totale : 0,
    fase: 'in-corso',
    titolo: `${s.scritte} ${s.scritte === 1 ? 'risposta' : 'risposte'} su ${s.totale}`,
    dettaglio: 'Il tempo corre',
    azione: 'Continua',
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
    tris: statoTris(oggi.tris),
    nomi: statoNomi(oggi.nomi),
  }
}

/**
 * Crazy Time, detto come le classificate: non e' un gioco con i suoi punti, e non
 * finisce mai, quindi niente `gioco` ne' `punti`, e l'anello c'e' solo finché
 * mancano i punti per la prima puntata.
 */
export type StatoRuota = Omit<StatoOggi, 'gioco' | 'punti' | 'avanzamento'> & { avanzamento: number | null }

/**
 * Crazy Time nella scheda della Fortuna: quanto si puo' puntare adesso. Quel
 * che ha dato o tolto oggi non si dice: al tavolo si guarda il saldo. `numero`
 * e' il giorno, che dice gli spicchi.
 */
export function statoRuota(s: RuotaSummary, numero: number): StatoRuota {
  const a = ROTTE.ruota
  if (s.stato === 'sfida') {
    const spicchio = s.spicchio === null ? undefined : spicchiDelGiorno(numero)[s.spicchio]
    const dettaglio = spicchio ? nomeDi(spicchio) : ''
    return { fase: 'in-corso', titolo: 'Sfida in corso', dettaglio, avanzamento: null, azione: 'Continua', a }
  }
  if (s.saldo < PUNTATA_MINIMA) {
    return {
      fase: 'non-pronta',
      titolo: 'Prima le classificate',
      dettaglio: `Servono ${PUNTATA_MINIMA} punti di oggi`,
      avanzamento: s.giri > 0 ? null : Math.max(0, s.saldo) / PUNTATA_MINIMA,
      azione: '',
      a,
    }
  }
  return {
    fase: 'da-giocare',
    titolo: 'Da girare',
    dettaglio: `Puoi puntare fino a ${s.saldo} punti`,
    avanzamento: null,
    azione: 'Gira',
    a,
  }
}

/** La slot nella scheda della Fortuna: quanto si puo' puntare adesso. Una domanda in sospeso si riprende dalla slot. */
export function statoSlot(s: FortunaRisposta): StatoRuota {
  const a = ROTTE.slot
  if (s.slot.stato === 'sfida') {
    return { fase: 'in-corso', titolo: 'Domanda in sospeso', dettaglio: '', avanzamento: null, azione: 'Continua', a }
  }
  if (s.saldo < PUNTATA_MINIMA_SLOT) {
    return {
      fase: 'non-pronta',
      titolo: 'Prima le classificate',
      dettaglio: `Serve ${PUNTATA_MINIMA_SLOT} punto di oggi`,
      avanzamento: null,
      azione: '',
      a,
    }
  }
  return {
    fase: 'da-giocare',
    titolo: 'Da giocare',
    dettaglio: `Puntate da ${PUNTATA_MINIMA_SLOT} a ${Math.min(PUNTATA_MASSIMA_SLOT, s.saldo)} punti`,
    avanzamento: null,
    azione: 'Gioca',
    a,
  }
}

/**
 * Il blackjack nella scheda della Fortuna: il tavolo a cui si e' seduti, o
 * quelli degli amici, o un tavolo nuovo.
 */
export function statoBlackjack(s: FortunaRisposta): StatoRuota {
  const { mioTavolo, tavoli } = s.blackjack
  if (mioTavolo) {
    return {
      fase: 'in-corso',
      titolo: 'Al tavolo',
      dettaglio: '',
      avanzamento: null,
      azione: 'Torna al tavolo',
      a: ROTTE.tavoloBJ(mioTavolo),
    }
  }
  const amici = tavoli.flatMap((t) => t.giocatori.map((g) => g.displayName))
  const chi =
    amici.length === 0
      ? ''
      : amici.length === 1
        ? `${amici[0]} è al tavolo`
        : `${amici.slice(0, 2).join(' e ')} al tavolo`
  if (s.saldo < PUNTATA_MINIMA_BJ) {
    return {
      fase: 'non-pronta',
      titolo: chi || 'Prima le classificate',
      dettaglio: `Servono ${PUNTATA_MINIMA_BJ} punti di oggi`,
      avanzamento: null,
      azione: '',
      a: ROTTE.blackjack,
    }
  }
  return {
    fase: 'da-giocare',
    titolo: chi || 'Da giocare',
    dettaglio: `Puntate da ${PUNTATA_MINIMA_BJ} punti`,
    avanzamento: null,
    azione: tavoli.length > 0 ? 'Siediti' : 'Gioca',
    a: ROTTE.blackjack,
  }
}
