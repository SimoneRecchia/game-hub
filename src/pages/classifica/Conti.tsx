import { useState } from 'react'
import { StatsPanel } from '@/games/wordle/StatsPanel'
import { leggiStatistiche } from '@/games/quiz/statistiche'
import { leggiContiSudoku } from '@/games/sudoku/libera'
import { leggiContiNomi } from '@/games/nomi/conti'
import { leggiContiAnagrammi } from '@/games/anagrammi/conti'
import { leggiContiGhigliottina } from '@/games/ghigliottina/conti'
import { leggiContiParoliere } from '@/games/paroliere/conti'
import { leggiContiCatena } from '@/games/catena/conti'
import { useDati } from '@/lib/dati'
import { formatDuration, formatNumber } from '@/lib/format'
import { CATEGORIE, DOMANDE_PER_PARTITA, NOMI_CATEGORIE } from '@shared/quiz'
import { LIVELLI, NOMI_LIVELLI } from '@shared/sudoku'
import type {
  AnagrammiLeaderboard,
  GhigliottinaLeaderboard,
  CatenaLeaderboard,
  ParoliereLeaderboard,
  CruciverbaLeaderboard,
  CruciverbaLiberaRisposta,
  GiocoClassificato,
  NomiLeaderboard,
  PlayerStats,
  QuizLeaderboard,
  ScarabeoLeaderboard,
  StatisticheScarabeoLibero,
  SudokuLeaderboard,
  WordleLiberaRisposta,
} from '@shared/types'
import './Conti.css'

/**
 * I tuoi numeri in un gioco: le classificate da sempre — punti, giornate,
 * posizione — e le libere, quelle che il server conosce e quelle che stanno
 * nel telefono. Si aprono dalla classifica del gioco, che e' dove si guarda
 * come si sta andando; i dettagli si chiedono al server solo quando si aprono.
 */
export function ContiDi({ gioco }: { gioco: GiocoClassificato }) {
  switch (gioco) {
    case 'wordle':
      return <ContiWordle />
    case 'scarabeo':
      return <ContiScarabeo />
    case 'cruciverba':
      return <ContiCruciverba />
    case 'sudoku':
      return <ContiSudoku />
    case 'quiz':
      return <ContiQuiz />
    case 'nomi':
      return <ContiNomi />
    case 'anagrammi':
      return <ContiAnagrammi />
    case 'ghigliottina':
      return <ContiGhigliottinaDi />
    case 'paroliere':
      return <ContiParoliereDi />
    case 'catena':
      return <ContiCatenaDi />
  }
}

function Conti({ titolo, voci }: { titolo: string; voci: { etichetta: string; valore: string }[] }) {
  return (
    <div className="conti__gruppo">
      <p className="conti__titolo">{titolo}</p>
      <dl className="conti__voci">
        {voci.map((v) => (
          <div key={v.etichetta} className="conti__voce">
            <dt>{v.etichetta}</dt>
            <dd className="u-tabnum">{v.valore}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function Attesa() {
  return <div className="conti__attesa scheletro" aria-hidden="true" />
}

function ContiWordle() {
  const { dati: stats } = useDati<PlayerStats>('/wordle/stats')
  const { dati: libera } = useDati<WordleLiberaRisposta>('/wordle/libera')
  return (
    <div className="conti">
      {!stats ? (
        <Attesa />
      ) : stats.played === 0 && stats.assistScore === 0 ? (
        <p className="conti__testo">Ancora nessuna classificata.</p>
      ) : (
        // Gli assist bastano a riempire il pannello: chi ha giocato solo in
        // compagnia ha punti in classifica, e vederli qui a zero sarebbe una smentita.
        <StatsPanel stats={stats} />
      )}
      {libera && libera.statistiche.giocate > 0 && (
        <Conti
          titolo="Parole libere"
          voci={[
            { etichetta: 'Giocate', valore: formatNumber(libera.statistiche.giocate) },
            { etichetta: 'Indovinate', valore: formatNumber(libera.statistiche.vinte) },
            { etichetta: 'Di fila', valore: formatNumber(libera.statistiche.serie) },
          ]}
        />
      )}
    </div>
  )
}

function ContiScarabeo() {
  const { dati } = useDati<ScarabeoLeaderboard>('/leaderboard/scarabeo?scope=all')
  const { dati: libera } = useDati<StatisticheScarabeoLibero>('/scarabeo/libera')
  const me = dati?.me
  return (
    <div className="conti">
      {!dati ? (
        <Attesa />
      ) : (
        <Conti
          titolo="Classificate"
          voci={[
            { etichetta: 'Punti in classifica', valore: formatNumber(me?.punti ?? 0) },
            { etichetta: 'Giornate', valore: formatNumber(me?.giornate ?? 0) },
            { etichetta: 'Giornata migliore', valore: `${formatNumber(me?.migliore ?? 0)} sul tabellone` },
            { etichetta: 'Posizione', valore: me ? `${me.rank}º` : '—' },
          ]}
        />
      )}
      {libera && libera.giocate > 0 && (
        <Conti
          titolo="Contro il computer"
          voci={[
            { etichetta: 'Partite', valore: formatNumber(libera.giocate) },
            { etichetta: 'Vinte', valore: formatNumber(libera.vinte) },
            { etichetta: 'Perse', valore: formatNumber(libera.perse) },
            { etichetta: 'Miglior punteggio', valore: formatNumber(libera.migliore) },
          ]}
        />
      )}
    </div>
  )
}

function ContiCruciverba() {
  const { dati } = useDati<CruciverbaLeaderboard>('/leaderboard/cruciverba?scope=all')
  const { dati: libera } = useDati<CruciverbaLiberaRisposta>('/cruciverba/libera')
  const me = dati?.me
  return (
    <div className="conti">
      {!dati ? (
        <Attesa />
      ) : (
        <Conti
          titolo="Classificate"
          voci={[
            { etichetta: 'Punti in classifica', valore: formatNumber(me?.punti ?? 0) },
            { etichetta: 'Schemi completati', valore: formatNumber(me?.giornate ?? 0) },
            {
              etichetta: 'Tempo medio',
              valore: me && me.giornate > 0 ? formatDuration(me.tempoMs / me.giornate) : '—',
            },
            { etichetta: 'Posizione', valore: me ? `${me.rank}º` : '—' },
          ]}
        />
      )}
      {libera && libera.completate > 0 && (
        <Conti
          titolo="Schemi liberi"
          voci={[{ etichetta: 'Completati', valore: formatNumber(libera.completate) }]}
        />
      )}
    </div>
  )
}

function ContiSudoku() {
  const { dati } = useDati<SudokuLeaderboard>('/leaderboard/sudoku?scope=all')
  // Le libere stanno nel telefono: si leggono una volta, all'apertura del foglio.
  const [libere] = useState(leggiContiSudoku)
  const me = dati?.me
  const risolti = LIVELLI.filter((l) => libere[l].risolti > 0)
  return (
    <div className="conti">
      {!dati ? (
        <Attesa />
      ) : (
        <Conti
          titolo="Classificate"
          voci={[
            { etichetta: 'Punti in classifica', valore: formatNumber(me?.punti ?? 0) },
            { etichetta: 'Sudoku risolti', valore: formatNumber(me?.giornate ?? 0) },
            {
              etichetta: 'Tempo medio',
              valore: me && me.giornate > 0 ? formatDuration(me.tempoMs / me.giornate) : '—',
            },
            { etichetta: 'Posizione', valore: me ? `${me.rank}º` : '—' },
          ]}
        />
      )}
      {risolti.length > 0 && (
        <Conti
          titolo="Schemi liberi"
          voci={risolti.map((l) => {
            const record = libere[l].record
            return {
              etichetta: NOMI_LIVELLI[l],
              valore: `${formatNumber(libere[l].risolti)}${record !== null ? ` · ${formatDuration(record)}` : ''}`,
            }
          })}
        />
      )}
    </div>
  )
}

function ContiQuiz() {
  const { dati } = useDati<QuizLeaderboard>('/leaderboard/quiz?scope=all')
  // Le libere del quiz non vanno al server: i loro conti stanno in questo browser.
  const [libere] = useState(leggiStatistiche)
  const me = dati?.me
  const domande = (me?.giornate ?? 0) * DOMANDE_PER_PARTITA
  return (
    <div className="conti">
      {!dati ? (
        <Attesa />
      ) : (
        <Conti
          titolo="Classificate"
          voci={[
            { etichetta: 'Punti in classifica', valore: formatNumber(me?.punti ?? 0) },
            { etichetta: 'Quiz finiti', valore: formatNumber(me?.giornate ?? 0) },
            {
              etichetta: 'Risposte giuste',
              valore: me && domande > 0 ? `${formatNumber(me.giuste)} su ${formatNumber(domande)}` : '—',
            },
            { etichetta: 'Posizione', valore: me ? `${me.rank}º` : '—' },
          ]}
        />
      )}
      {libere.partite > 0 && (
        <Conti
          titolo="Quiz liberi, su questo dispositivo"
          voci={[
            { etichetta: 'Partite', valore: formatNumber(libere.partite) },
            {
              etichetta: 'Risposte giuste',
              valore: `${formatNumber(libere.giuste)} su ${formatNumber(libere.domande)}`,
            },
            ...CATEGORIE.filter((c) => libere.migliori[c] !== undefined).map((c) => ({
              etichetta: NOMI_CATEGORIE[c],
              valore: `record ${libere.migliori[c]}%`,
            })),
          ]}
        />
      )}
    </div>
  )
}

function ContiAnagrammi() {
  const { dati } = useDati<AnagrammiLeaderboard>('/leaderboard/anagrammi?scope=all')
  // Le libere stanno nel telefono: si leggono una volta, all'apertura del foglio.
  const [libere] = useState(leggiContiAnagrammi)
  const me = dati?.me
  return (
    <div className="conti">
      {!dati ? (
        <Attesa />
      ) : (
        <Conti
          titolo="Classificate"
          voci={[
            { etichetta: 'Punti in classifica', valore: formatNumber(me?.punti ?? 0) },
            { etichetta: 'Giornate', valore: formatNumber(me?.giornate ?? 0) },
            { etichetta: 'Parole trovate', valore: formatNumber(me?.trovate ?? 0) },
            { etichetta: 'Posizione', valore: me ? `${me.rank}º` : '—' },
          ]}
        />
      )}
      {libere.partite > 0 && (
        <Conti
          titolo="Parole a caso"
          voci={[
            { etichetta: 'Partite', valore: formatNumber(libere.partite) },
            { etichetta: 'Parole trovate', valore: formatNumber(libere.trovate) },
            { etichetta: 'Partita migliore', valore: `${formatNumber(libere.migliore)} punti` },
          ]}
        />
      )}
    </div>
  )
}

function ContiNomi() {
  const { dati } = useDati<NomiLeaderboard>('/leaderboard/nomi?scope=all')
  // Le partite contro il computer stanno nel telefono: si leggono una volta, all'apertura del foglio.
  const [libere] = useState(leggiContiNomi)
  const me = dati?.me
  return (
    <div className="conti">
      {!dati ? (
        <Attesa />
      ) : (
        <Conti
          titolo="Classificate"
          voci={[
            { etichetta: 'Punti in classifica', valore: formatNumber(me?.punti ?? 0) },
            { etichetta: 'Partite contate', valore: formatNumber(me?.giornate ?? 0) },
            { etichetta: 'Risposte valide', valore: formatNumber(me?.valide ?? 0) },
            { etichetta: 'Posizione', valore: me ? `${me.rank}º` : '—' },
          ]}
        />
      )}
      {libere.partite > 0 && (
        <Conti
          titolo="Contro il computer"
          voci={[
            { etichetta: 'Partite', valore: formatNumber(libere.partite) },
            { etichetta: 'Vinte', valore: formatNumber(libere.vinte) },
            { etichetta: 'Risposte valide', valore: formatNumber(libere.valide) },
          ]}
        />
      )}
    </div>
  )
}

function ContiGhigliottinaDi() {
  const { dati } = useDati<GhigliottinaLeaderboard>('/leaderboard/ghigliottina?scope=all')
  // Le libere stanno nel telefono: si leggono una volta, all'apertura del foglio.
  const [libere] = useState(leggiContiGhigliottina)
  const me = dati?.me
  return (
    <div className="conti">
      {!dati ? (
        <Attesa />
      ) : (
        <Conti
          titolo="Classificate"
          voci={[
            { etichetta: 'Punti in classifica', valore: formatNumber(me?.punti ?? 0) },
            { etichetta: 'Giornate', valore: formatNumber(me?.giornate ?? 0) },
            { etichetta: 'Parole vincenti', valore: formatNumber(me?.indovinate ?? 0) },
            { etichetta: 'Posizione', valore: me ? `${me.rank}º` : '—' },
          ]}
        />
      )}
      {libere.partite > 0 && (
        <Conti
          titolo="Libere"
          voci={[
            { etichetta: 'Partite', valore: formatNumber(libere.partite) },
            { etichetta: 'Parole vincenti', valore: formatNumber(libere.indovinate) },
            { etichetta: 'Montepremi migliore', valore: `${formatNumber(libere.migliore)} punti` },
          ]}
        />
      )}
    </div>
  )
}

function ContiCatenaDi() {
  const { dati } = useDati<CatenaLeaderboard>('/leaderboard/catena?scope=all')
  // Le libere stanno nel telefono: si leggono una volta, all'apertura del foglio.
  const [libere] = useState(leggiContiCatena)
  const me = dati?.me
  return (
    <div className="conti">
      {!dati ? (
        <Attesa />
      ) : (
        <Conti
          titolo="Classificate"
          voci={[
            { etichetta: 'Punti in classifica', valore: formatNumber(me?.punti ?? 0) },
            { etichetta: 'Giornate', valore: formatNumber(me?.giornate ?? 0) },
            { etichetta: 'Parole finali', valore: formatNumber(me?.indovinate ?? 0) },
            { etichetta: 'Posizione', valore: me ? `${me.rank}º` : '—' },
          ]}
        />
      )}
      {libere.partite > 0 && (
        <Conti
          titolo="Libere"
          voci={[
            { etichetta: 'Partite', valore: formatNumber(libere.partite) },
            { etichetta: 'Parole finali', valore: formatNumber(libere.indovinate) },
            { etichetta: 'Montepremi migliore', valore: `${formatNumber(libere.migliore)} punti` },
          ]}
        />
      )}
    </div>
  )
}

function ContiParoliereDi() {
  const { dati } = useDati<ParoliereLeaderboard>('/leaderboard/paroliere?scope=all')
  // Le libere stanno nel telefono: si leggono una volta, all'apertura del foglio.
  const [libere] = useState(leggiContiParoliere)
  const me = dati?.me
  const record = (n: number) => (n > 0 ? formatNumber(n) : '—')
  return (
    <div className="conti">
      {!dati ? (
        <Attesa />
      ) : (
        <Conti
          titolo="Classificate"
          voci={[
            { etichetta: 'Punti in classifica', valore: formatNumber(me?.punti ?? 0) },
            { etichetta: 'Giornate', valore: formatNumber(me?.giornate ?? 0) },
            { etichetta: 'Parole trovate', valore: formatNumber(me?.trovate ?? 0) },
            { etichetta: 'Posizione', valore: me ? `${me.rank}º` : '—' },
          ]}
        />
      )}
      {libere.partite > 0 && (
        <Conti
          titolo="Libere"
          voci={[
            { etichetta: 'Partite', valore: formatNumber(libere.partite) },
            { etichetta: 'Parole trovate', valore: formatNumber(libere.parole) },
            { etichetta: 'Record, 4×4', valore: record(libere.migliore[4]) },
            { etichetta: 'Record, 5×5', valore: record(libere.migliore[5]) },
          ]}
        />
      )}
    </div>
  )
}
