import type { ReactNode } from 'react'
import { Etichetta } from '@/components/Elementi'
import { IconFlame, IconPeople } from '@/components/Icons'
import type { ChiaveClassifica } from '@/games/classifiche'
import { formatDuration, formatNumber, formatPercent } from '@/lib/format'
import { DOMANDE_PER_PARTITA } from '@shared/quiz'
import type {
  BattagliaLeaderboard,
  CruciverbaLeaderboard,
  GeneraleLeaderboard,
  GiocoClassificato,
  LeaderboardResponse,
  QuizLeaderboard,
  ScarabeoLeaderboard,
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
  | BattagliaLeaderboard
  | QuizLeaderboard

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
  composizione?: Record<GiocoClassificato, number>
  dettaglio: { etichetta: string; valore: string; forte?: boolean; gioco?: GiocoClassificato }[]
  nota?: string
}

export const NOMI_CLASSIFICHE: Record<ChiaveClassifica, string> = {
  generale: 'Generale',
  wordle: 'Wordle',
  scarabeo: 'Scarabeo',
  cruciverba: 'Cruciverba',
  battaglia: 'Battaglia navale',
  quiz: 'Quiz',
}

/** I giochi, nell'ordine in cui si mostrano. */
export const ORDINE_GIOCHI: GiocoClassificato[] = ['wordle', 'scarabeo', 'cruciverba', 'battaglia', 'quiz']

const partite = (n: number) => `${formatNumber(n)} ${n === 1 ? 'partita' : 'partite'}`
const giornate = (n: number) => `${formatNumber(n)} ${n === 1 ? 'giornata' : 'giornate'}`
const decimale = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const inCorso = <Etichetta tono="arancio">in corso</Etichetta>

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
        const giochi = ORDINE_GIOCHI.filter((g) => r.perGioco[g] > 0).length
        return {
          ...r,
          sotto:
            r.partite === 0
              ? oggi
                ? 'In corso'
                : 'Non finita'
              : `${partite(r.partite)} · ${giochi} ${giochi === 1 ? 'gioco' : 'giochi'}`,
          breve: partite(r.partite),
          composizione: r.perGioco,
          segni:
            r.assist > 0 ? (
              <span className="cl-segno" title={`${r.assist} punti in compagnia`}>
                <IconPeople size={13} />
                {r.assist}
              </span>
            ) : undefined,
          dettaglio: [
            ...ORDINE_GIOCHI.map((g) => ({ etichetta: NOMI_CLASSIFICHE[g], valore: formatNumber(r.perGioco[g]), gioco: g })),
            { etichetta: 'Totale', valore: formatNumber(r.punti), forte: true },
            ...(r.assist > 0 ? [{ etichetta: 'Di cui in compagnia', valore: formatNumber(r.assist) }] : []),
            { etichetta: 'Partite classificate', valore: formatNumber(r.partite) },
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
        segni: r.inCorso ? inCorso : undefined,
        dettaglio: [
          { etichetta: 'Punti in classifica', valore: formatNumber(r.punti), forte: true },
          { etichetta: 'Punteggio sul tabellone', valore: formatNumber(r.punteggio) },
          { etichetta: 'Giornate', valore: formatNumber(r.giornate) },
          { etichetta: 'Giornata migliore', valore: formatNumber(r.migliore) },
        ],
        nota: 'A pari punti conta il punteggio sul tabellone.',
      }))

    case 'cruciverba':
      return (risposta as CruciverbaLeaderboard).rows.map((r) => ({
        ...r,
        sotto:
          r.giornate === 0
            ? 'In corso'
            : `${r.giornate} ${r.giornate === 1 ? 'completato' : 'completati'} · ${formatDuration(r.tempoMs)}`,
        breve: r.giornate > 0 ? formatDuration(r.tempoMs) : 'in corso',
        segni: r.inCorso ? inCorso : undefined,
        dettaglio: [
          { etichetta: 'Punti', valore: formatNumber(r.punti), forte: true },
          { etichetta: 'Schemi completati', valore: formatNumber(r.giornate) },
          { etichetta: 'Tempo', valore: formatDuration(r.tempoMs) },
        ],
        nota: 'A pari punti conta il tempo.',
      }))

    case 'battaglia':
      return (risposta as BattagliaLeaderboard).rows.map((r) => ({
        ...r,
        sotto:
          r.giornate === 0
            ? r.inCorso
              ? 'In corso'
              : 'Non finita'
            : `${r.vinte} ${r.vinte === 1 ? 'vinta' : 'vinte'} su ${r.giornate}${r.vinte > 0 ? ` · ${r.colpi} colpi` : ''}`,
        breve: r.giornate === 0 ? (r.inCorso ? 'in corso' : 'non finita') : `${r.vinte}/${r.giornate} vinte`,
        segni: r.inCorso ? inCorso : undefined,
        dettaglio: [
          { etichetta: 'Punti', valore: formatNumber(r.punti), forte: true },
          { etichetta: 'Battaglie', valore: formatNumber(r.giornate) },
          { etichetta: 'Vinte', valore: formatNumber(r.vinte) },
          { etichetta: 'Colpi nelle vittorie', valore: formatNumber(r.colpi) },
        ],
        nota: 'A pari punti contano le vittorie, poi i colpi.',
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
