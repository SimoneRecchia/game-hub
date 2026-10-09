import type { ReactNode } from 'react'
import { Etichetta } from '@/components/Elementi'
import { IconFlame, IconPeople } from '@/components/Icons'
import type { ChiaveClassifica } from '@/games/classifiche'
import { formatDuration, formatNumber, formatPercent } from '@/lib/format'
import { DOMANDE_PER_PARTITA } from '@shared/quiz'
import { NOME_BLACKJACK } from '@shared/blackjack'
import { NOME_ROULETTE } from '@shared/roulette'
import { NOME_CRAZY_TIME, conSegno } from '@shared/ruota'
import { NOME_SLOT } from '@shared/slot'
import { NOME_SUPERENALOTTO } from '@shared/superenalotto'
import type {
  AnagrammiLeaderboard,
  CatenaLeaderboard,
  CruciverbaLeaderboard,
  FortunaLeaderboard,
  GeneraleLeaderboard,
  GhigliottinaLeaderboard,
  GiocoClassificato,
  GiocoFortuna,
  LeaderboardResponse,
  NomiLeaderboard,
  ParoliereLeaderboard,
  QuizLeaderboard,
  ScarabeoLeaderboard,
  SequenzeLeaderboard,
  SudokuLeaderboard,
} from '@shared/types'

/**
 * Le righe di ogni classifica, pronte da mostrare: ogni gioco dice le sue cose
 * a modo suo — i tentativi del Wordle, il tabellone dello Scarabeo, il tempo
 * del cruciverba — dentro la stessa riga.
 */

export type Risposta =
  | GeneraleLeaderboard
  | LeaderboardResponse
  | ScarabeoLeaderboard
  | CruciverbaLeaderboard
  | SudokuLeaderboard
  | QuizLeaderboard
  | NomiLeaderboard
  | AnagrammiLeaderboard
  | SequenzeLeaderboard
  | GhigliottinaLeaderboard
  | ParoliereLeaderboard
  | CatenaLeaderboard
  | FortunaLeaderboard

export interface Voce {
  rank: number
  playerId: string
  nickname: string
  displayName: string
  avatarColor: string
  punti: number
  /** Sotto il nome, nell'elenco. */
  sotto: string
  /** Sotto i punti, nel podio: c'e' un terzo della larghezza. */
  breve: string
  /** A destra del nome: la serie, gli assist, "in corso". */
  segni?: ReactNode
  /** Nella generale, i punti di ogni gioco: la barra sotto il nome. */
  composizione?: Record<GiocoDellaGenerale, number>
  /** Nella generale, quel che hanno dato o tolto i giochi della Fortuna: e' gia' nei punti. */
  fortuna?: Record<GiocoFortuna, number>
  /** I punti si leggono con il segno: nella Fortuna si puo' andare sotto zero. */
  conSegno?: boolean
  dettaglio: { etichetta: string; valore: string; forte?: boolean; gioco?: GiocoDellaGenerale | GiocoFortuna }[]
  nota?: string
}

export const NOMI_CLASSIFICHE: Record<ChiaveClassifica, string> = {
  generale: 'Generale',
  wordle: 'Wordle',
  scarabeo: 'Scarabeo',
  cruciverba: 'Cruciverba',
  sudoku: 'Sudoku',
  quiz: 'Quiz',
  nomi: 'Nomi, cose e città',
  anagrammi: 'Anagrammi',
  sequenze: 'Sequenze',
  ghigliottina: 'Ghigliottina',
  paroliere: 'Paroliere',
  catena: 'Catena',
  fortuna: 'Fortuna',
}

/** I giochi della Fortuna, nell'ordine in cui si mostrano, con il loro nome. */
export const GIOCHI_FORTUNA: ReadonlyArray<[GiocoFortuna, string]> = [
  ['ruota', NOME_CRAZY_TIME],
  ['slot', NOME_SLOT],
  ['blackjack', NOME_BLACKJACK],
  ['roulette', NOME_ROULETTE],
  ['superenalotto', NOME_SUPERENALOTTO],
]

/** I giochi, nell'ordine in cui si mostrano. */
export const ORDINE_GIOCHI: GiocoClassificato[] = [
  'wordle',
  'scarabeo',
  'cruciverba',
  'sudoku',
  'quiz',
  'ghigliottina',
  'catena',
  'nomi',
  'anagrammi',
  'paroliere',
  'sequenze',
]

/**
 * Quel che compone un totale della generale: le classificate di adesso, e la
 * battaglia navale e il tris nei periodi in cui avevano la loro. Si mostrano
 * solo dove ci sono.
 */
export type GiocoDellaGenerale = GiocoClassificato | 'battaglia' | 'tris'

/** I giochi che hanno avuto una classificata, e non l'hanno piu'. */
const DI_UNA_VOLTA = ['battaglia', 'tris'] as const

export const ORDINE_GENERALE: GiocoDellaGenerale[] = [...ORDINE_GIOCHI, ...DI_UNA_VOLTA]

export const NOMI_GENERALE: Record<GiocoDellaGenerale, string> = {
  ...(NOMI_CLASSIFICHE as Record<GiocoClassificato, string>),
  battaglia: 'Battaglia navale',
  tris: 'Tris',
}

const partite = (n: number) => `${formatNumber(n)} ${n === 1 ? 'partita' : 'partite'}`
const giornate = (n: number) => `${formatNumber(n)} ${n === 1 ? 'giornata' : 'giornate'}`
const decimale = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const inCorso = <Etichetta tono="arancio">in corso</Etichetta>

/** I punti fatti in compagnia, accanto al nome: spiegano gli spareggi. */
function segniDi(assist: number, aperta: boolean) {
  if (assist <= 0) return aperta ? inCorso : undefined
  return (
    <>
      <span className="cl-segno" title={`${assist} punti in compagnia`}>
        <IconPeople size={13} />
        {assist}
      </span>
      {aperta && inCorso}
    </>
  )
}

const diCuiInCompagnia = (assist: number) =>
  assist > 0 ? [{ etichetta: 'Di cui in compagnia', valore: formatNumber(assist) }] : []
const inArrivo = <Etichetta tono="brand">in arrivo</Etichetta>

interface Contesto {
  /** Il periodo e' un giorno solo: si racconta com'e' andata quel giorno. */
  giorno: boolean
  /** Il periodo arriva a oggi: ci sono partite in corso e serie vive. */
  oggi: boolean
}

export function vociDi(chiave: ChiaveClassifica, risposta: Risposta, { giorno, oggi }: Contesto): Voce[] {
  switch (chiave) {
    case 'generale':
      return (risposta as GeneraleLeaderboard).rows.map((r) => {
        const composizione: Record<GiocoDellaGenerale, number> = { ...r.perGioco, battaglia: r.battaglia, tris: r.tris }
        const giochi = ORDINE_GENERALE.filter((g) => composizione[g] > 0).length
        return {
          ...r,
          sotto:
            r.partite === 0
              ? oggi
                ? 'In corso'
                : 'Non finita'
              : `${partite(r.partite)} · ${giochi} ${giochi === 1 ? 'gioco' : 'giochi'}`,
          breve: partite(r.partite),
          composizione,
          fortuna: {
            ruota: r.ruota,
            slot: r.slot,
            blackjack: r.blackjack,
            roulette: r.roulette,
            superenalotto: r.superenalotto,
          },
          segni:
            r.assist > 0 ? (
              <span className="cl-segno" title={`${r.assist} punti in compagnia`}>
                <IconPeople size={13} />
                {r.assist}
              </span>
            ) : undefined,
          dettaglio: [
            ...ORDINE_GIOCHI.map((g) => ({ etichetta: NOMI_CLASSIFICHE[g], valore: formatNumber(r.perGioco[g]), gioco: g })),
            ...DI_UNA_VOLTA.filter((g) => r[g] !== 0).map((g) => ({
              etichetta: NOMI_GENERALE[g],
              valore: formatNumber(r[g]),
              gioco: g,
            })),
            ...GIOCHI_FORTUNA.filter(([g]) => r[g] !== 0).map(([g, nome]) => ({
              etichetta: nome,
              valore: conSegno(r[g]),
              gioco: g,
            })),
            { etichetta: 'Totale', valore: formatNumber(r.punti), forte: true },
            ...(r.assist > 0 ? [{ etichetta: 'Di cui in compagnia', valore: formatNumber(r.assist) }] : []),
            { etichetta: 'Partite classificate', valore: formatNumber(r.partite) },
          ],
        }
      })

    case 'fortuna':
      return (risposta as FortunaLeaderboard).rows.map((r) => {
        const giocate = `${formatNumber(r.giocate)} ${r.giocate === 1 ? 'giocata' : 'giocate'}`
        const conti = GIOCHI_FORTUNA.filter(([g]) => r.netti[g] !== 0).map(
          ([g, nome]) => `${nome} ${conSegno(r.netti[g])}`,
        )
        return {
          ...r,
          conSegno: true,
          sotto: [...conti, giocate].join(' · '),
          breve: giocate,
          dettaglio: [
            ...GIOCHI_FORTUNA.map(([g, nome]) => ({ etichetta: nome, valore: conSegno(r.netti[g]), gioco: g })),
            { etichetta: 'Totale', valore: conSegno(r.punti), forte: true },
            { etichetta: 'Giocate', valore: formatNumber(r.giocate) },
          ],
        }
      })

    case 'wordle':
      return (risposta as LeaderboardResponse).rows.map((r) => ({
        ...r,
        punti: r.score,
        sotto: giorno ? descriviWordle(r, oggi) : descriviWordlePeriodo(r),
        breve: giorno ? descriviWordleBreve(r, oggi) : partite(r.played),
        segni: (
          <>
            {r.assistScore > 0 && (
              <span className="cl-segno" title={`${r.assistScore} punti in compagnia`}>
                <IconPeople size={13} />
                {r.assistScore}
              </span>
            )}
            {oggi && r.currentStreak >= 2 && (
              <span className="cl-segno cl-segno--serie" title={`${r.currentStreak} giorni di fila`}>
                <IconFlame size={13} />
                {r.currentStreak}
              </span>
            )}
          </>
        ),
        dettaglio: [
          { etichetta: 'Punti giocando da sé', valore: formatNumber(r.playScore) },
          { etichetta: 'Punti in compagnia', valore: formatNumber(r.assistScore) },
          { etichetta: 'Totale', valore: formatNumber(r.score), forte: true },
          { etichetta: 'Giornate giocate', valore: formatNumber(r.played) },
          ...(r.played > 0 ? [{ etichetta: 'Parole indovinate', valore: formatPercent(r.wins / r.played) }] : []),
          ...(r.avgAttempts !== null ? [{ etichetta: 'Media tentativi', valore: decimale.format(r.avgAttempts) }] : []),
          { etichetta: 'Serie attuale', valore: formatNumber(r.currentStreak) },
        ],
        nota: r.assists > 0 ? `${giornate(r.assists)} in compagnia.` : undefined,
      }))

    case 'scarabeo':
      return (risposta as ScarabeoLeaderboard).rows.map((r) => ({
        ...r,
        sotto: giorno
          ? `${r.inCorso ? 'In corso · ' : ''}${formatNumber(r.punteggio)} sul tabellone`
          : `${giornate(r.giornate)} · migliore ${formatNumber(r.migliore)}`,
        breve: giorno ? `${formatNumber(r.punteggio)} sul tabellone` : giornate(r.giornate),
        segni: segniDi(r.assist, r.inCorso),
        dettaglio: [
          { etichetta: 'Punti in classifica', valore: formatNumber(r.punti), forte: true },
          ...diCuiInCompagnia(r.assist),
          { etichetta: 'Punteggio sul tabellone', valore: formatNumber(r.punteggio) },
          { etichetta: 'Giornate', valore: formatNumber(r.giornate) },
          { etichetta: 'Giornata migliore', valore: formatNumber(r.migliore) },
        ],
        nota:
          r.assist > 0
            ? 'A pari punti passa avanti chi ne ha fatti meno in compagnia.'
            : 'A pari punti conta il punteggio sul tabellone.',
      }))

    case 'cruciverba':
      return (risposta as CruciverbaLeaderboard).rows.map((r) => {
        // Il tempo di una giornata in compagnia era dell'host: chi ha solo quelle non ne ha.
        const soloInCompagnia = r.assist > 0 && r.tempoMs === 0
        return {
          ...r,
          sotto:
            r.giornate === 0
              ? 'In corso'
              : `${r.giornate} ${r.giornate === 1 ? 'completato' : 'completati'}${
                  soloInCompagnia ? ' in compagnia' : ` · ${formatDuration(r.tempoMs)}`
                }`,
          breve: r.giornate === 0 ? 'in corso' : soloInCompagnia ? 'in compagnia' : formatDuration(r.tempoMs),
          segni: segniDi(r.assist, r.inCorso),
          dettaglio: [
            { etichetta: 'Punti', valore: formatNumber(r.punti), forte: true },
            ...diCuiInCompagnia(r.assist),
            { etichetta: 'Schemi completati', valore: formatNumber(r.giornate) },
            { etichetta: 'Tempo', valore: formatDuration(r.tempoMs) },
          ],
          nota:
            r.assist > 0
              ? 'A pari punti passa avanti chi ne ha fatti meno in compagnia.'
              : 'A pari punti conta il tempo.',
        }
      })

    case 'sudoku':
      return (risposta as SudokuLeaderboard).rows.map((r) => ({
        ...r,
        sotto:
          r.giornate === 0
            ? 'In corso'
            : giorno
              ? `Risolto in ${formatDuration(r.tempoMs)}`
              : `${r.giornate} ${r.giornate === 1 ? 'risolto' : 'risolti'} · ${formatDuration(r.tempoMs)}`,
        breve: r.giornate > 0 ? formatDuration(r.tempoMs) : 'in corso',
        segni: r.inCorso ? inCorso : undefined,
        dettaglio: [
          { etichetta: 'Punti', valore: formatNumber(r.punti), forte: true },
          { etichetta: 'Sudoku risolti', valore: formatNumber(r.giornate) },
          { etichetta: 'Tempo', valore: formatDuration(r.tempoMs) },
        ],
        nota: 'A pari punti conta il tempo.',
      }))

    case 'quiz':
      return (risposta as QuizLeaderboard).rows.map((r) => {
        const domande = r.giornate * DOMANDE_PER_PARTITA
        const giuste = `${r.giuste} ${r.giuste === 1 ? 'giusta' : 'giuste'}`
        return {
          ...r,
          sotto:
            r.giornate === 0
              ? 'In corso'
              : giorno
                ? `${giuste} su ${DOMANDE_PER_PARTITA} · ${formatDuration(r.tempoMs)}`
                : `${giornate(r.giornate)} · ${formatPercent(domande > 0 ? r.giuste / domande : 0)} giuste`,
          breve: r.giornate > 0 ? `${r.giuste}/${domande} giuste` : 'in corso',
          segni: r.inCorso ? inCorso : undefined,
          dettaglio: [
            { etichetta: 'Punti', valore: formatNumber(r.punti), forte: true },
            { etichetta: 'Quiz finiti', valore: formatNumber(r.giornate) },
            { etichetta: 'Risposte giuste', valore: `${formatNumber(r.giuste)} su ${formatNumber(domande)}` },
            { etichetta: 'Tempo', valore: formatDuration(r.tempoMs) },
          ],
          nota: 'A pari punti conta il tempo.',
        }
      })

    case 'nomi':
      return (risposta as NomiLeaderboard).rows.map((r) => {
        const valide = `${formatNumber(r.valide)} ${r.valide === 1 ? 'risposta valida' : 'risposte valide'}`
        return {
          ...r,
          sotto: r.giornate === 0 ? 'Punti in arrivo' : giorno ? valide : `${giornate(r.giornate)} · ${valide}`,
          breve: r.giornate > 0 ? `${r.valide} valide` : 'in arrivo',
          // Chi ha gia' dei punti e ne aspetta altri: chi non ne ha ancora lo dice gia' la riga.
          segni: r.inAttesa && oggi && r.giornate > 0 ? inArrivo : undefined,
          dettaglio: [
            { etichetta: 'Punti', valore: formatNumber(r.punti), forte: true },
            { etichetta: 'Partite contate', valore: formatNumber(r.giornate) },
            { etichetta: 'Risposte valide', valore: formatNumber(r.valide) },
          ],
          nota: 'I punti arrivano la notte e valgono il giorno dopo. A pari punti contano le risposte valide.',
        }
      })

    case 'anagrammi':
      return (risposta as AnagrammiLeaderboard).rows.map((r) => {
        const trovate = `${formatNumber(r.trovate)} ${r.trovate === 1 ? 'parola trovata' : 'parole trovate'}`
        return {
          ...r,
          sotto:
            r.giornate === 0
              ? 'In corso'
              : giorno
                ? `${trovate} · ${formatDuration(r.tempoMs)}`
                : `${giornate(r.giornate)} · ${trovate}`,
          breve: r.giornate > 0 ? `${r.trovate} trovate` : 'in corso',
          segni: r.inCorso ? inCorso : undefined,
          dettaglio: [
            { etichetta: 'Punti', valore: formatNumber(r.punti), forte: true },
            { etichetta: 'Giornate finite', valore: formatNumber(r.giornate) },
            { etichetta: 'Parole trovate', valore: formatNumber(r.trovate) },
            { etichetta: 'Tempo', valore: formatDuration(r.tempoMs) },
          ],
          nota: 'A pari punti contano le parole trovate, poi il tempo.',
        }
      })

    case 'sequenze':
      return (risposta as SequenzeLeaderboard).rows.map((r) => {
        const fino = r.migliore > 0 ? `fino a ${formatNumber(r.migliore)} cubetti` : 'nessuna sequenza'
        return {
          ...r,
          sotto:
            r.giornate === 0
              ? 'In corso'
              : giorno
                ? fino.charAt(0).toUpperCase() + fino.slice(1)
                : `${giornate(r.giornate)} · ${fino}`,
          breve: r.giornate > 0 ? `${r.migliore} cubetti` : 'in corso',
          segni: r.inCorso ? inCorso : undefined,
          dettaglio: [
            { etichetta: 'Punti', valore: formatNumber(r.punti), forte: true },
            { etichetta: 'Giornate finite', valore: formatNumber(r.giornate) },
            { etichetta: 'La sequenza più lunga', valore: `${formatNumber(r.migliore)} cubetti` },
            { etichetta: 'Tempo', valore: formatDuration(r.tempoMs) },
          ],
          nota: 'A pari punti conta la sequenza più lunga, poi il tempo.',
        }
      })

    case 'ghigliottina':
      return (risposta as GhigliottinaLeaderboard).rows.map((r) => {
        const indovinate = `${formatNumber(r.indovinate)} ${r.indovinate === 1 ? 'indovinata' : 'indovinate'}`
        return {
          ...r,
          sotto:
            r.giornate === 0
              ? 'In corso'
              : giorno
                ? r.indovinate > 0
                  ? `Indovinata in ${formatDuration(r.tempoMs)}`
                  : 'Non indovinata'
                : `${giornate(r.giornate)} · ${indovinate}`,
          breve: r.giornate === 0 ? 'in corso' : giorno ? (r.indovinate > 0 ? 'indovinata' : 'non indovinata') : indovinate,
          segni: r.inCorso ? inCorso : undefined,
          dettaglio: [
            { etichetta: 'Punti', valore: formatNumber(r.punti), forte: true },
            { etichetta: 'Giornate finite', valore: formatNumber(r.giornate) },
            { etichetta: 'Parole vincenti indovinate', valore: formatNumber(r.indovinate) },
            { etichetta: 'Tempo per la parola vincente', valore: formatDuration(r.tempoMs) },
          ],
          nota: 'A pari punti contano le parole vincenti indovinate, poi il tempo.',
        }
      })

    case 'catena':
      return (risposta as CatenaLeaderboard).rows.map((r) => {
        const indovinate = `${formatNumber(r.indovinate)} ${r.indovinate === 1 ? 'finale' : 'finali'}`
        return {
          ...r,
          sotto:
            r.giornate === 0
              ? 'In corso'
              : giorno
                ? r.indovinate > 0
                  ? `Finale in ${formatDuration(r.tempoMs)}`
                  : 'Finale non indovinata'
                : `${giornate(r.giornate)} · ${indovinate}`,
          breve: r.giornate === 0 ? 'in corso' : giorno ? (r.indovinate > 0 ? 'indovinata' : 'non indovinata') : indovinate,
          segni: r.inCorso ? inCorso : undefined,
          dettaglio: [
            { etichetta: 'Punti', valore: formatNumber(r.punti), forte: true },
            { etichetta: 'Giornate finite', valore: formatNumber(r.giornate) },
            { etichetta: 'Parole finali indovinate', valore: formatNumber(r.indovinate) },
            { etichetta: 'Tempo per la parola finale', valore: formatDuration(r.tempoMs) },
          ],
          nota: 'A pari punti contano le parole finali indovinate, poi il tempo.',
        }
      })

    case 'paroliere':
      return (risposta as ParoliereLeaderboard).rows.map((r) => {
        const trovate = `${formatNumber(r.trovate)} ${r.trovate === 1 ? 'parola' : 'parole'}`
        return {
          ...r,
          sotto:
            r.giornate === 0
              ? 'In corso'
              : giorno
                ? `${trovate} · ${formatNumber(r.punteggio)} sulla griglia`
                : `${giornate(r.giornate)} · ${trovate}`,
          breve: r.giornate > 0 ? trovate : 'in corso',
          segni: r.inCorso ? inCorso : undefined,
          dettaglio: [
            { etichetta: 'Punti', valore: formatNumber(r.punti), forte: true },
            { etichetta: 'Giornate finite', valore: formatNumber(r.giornate) },
            { etichetta: 'Parole trovate', valore: formatNumber(r.trovate) },
            { etichetta: 'Punteggio sulla griglia', valore: formatNumber(r.punteggio) },
          ],
          nota: 'A pari punti conta il punteggio sulla griglia, poi le parole trovate.',
        }
      })
  }
}

type RigaWordle = LeaderboardResponse['rows'][number]

/** Com'e' andata la parola del giorno. Una partita rimasta aperta in un giorno passato non e' "in corso". */
function descriviWordle(r: RigaWordle, oggi: boolean): string {
  // In compagnia i tentativi sono dell'host: si dice dove ha giocato.
  if (r.todaySpectated) {
    if (r.todayStatus === 'won') return 'Indovinata in compagnia'
    if (r.todayStatus === 'lost') return 'Non indovinata, in compagnia'
    return oggi ? 'Sta giocando in compagnia' : 'Non finita, in compagnia'
  }
  if (r.todayStatus === 'won') return `Indovinata al ${r.todayAttempts}º tentativo`
  if (r.todayStatus === 'lost') return 'Non indovinata'
  if (r.todayStatus === 'playing') {
    if (!oggi) return 'Non finita'
    if (!r.todayAttempts) return 'Ha appena iniziato'
    return `In corso · ${r.todayAttempts} ${r.todayAttempts === 1 ? 'tentativo' : 'tentativi'}`
  }
  return 'Non ha giocato'
}

function descriviWordleBreve(r: RigaWordle, oggi: boolean): string {
  if (r.todaySpectated) return 'in compagnia'
  if (r.todayStatus === 'won') return `${r.todayAttempts} ${r.todayAttempts === 1 ? 'tentativo' : 'tentativi'}`
  if (r.todayStatus === 'lost') return 'non indovinata'
  if (r.todayStatus === 'playing') return oggi ? 'in corso' : 'non finita'
  return '—'
}

function descriviWordlePeriodo(r: RigaWordle): string {
  if (r.played === 0) return r.assists > 0 ? `${giornate(r.assists)} in compagnia` : 'In corso'
  const pezzi = [partite(r.played)]
  if (r.avgAttempts !== null) pezzi.push(`media ${decimale.format(r.avgAttempts)}`)
  return pezzi.join(' · ')
}
