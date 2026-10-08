import type { ReactNode } from 'react'
import { Sheet } from '@/components/Sheet'
import type { GiocoTavoliere } from '@shared/tavolo'
import '@/games/cruciverba/ComeSiGioca.css'

/** Le regole di ogni gioco da tavoliere, il minimo per giocare: lo scopo, come si muove, come finisce. */
const REGOLE: Record<GiocoTavoliere, { lede: string; sezioni: { titolo: string; righe: ReactNode[] }[] }> = {
  tris: {
    lede: 'Metti tre segni in fila, in orizzontale, in verticale o in diagonale, prima dell’altro.',
    sezioni: [
      {
        titolo: 'Il turno',
        righe: [
          'Tocca una casella libera. Comincia la croce.',
          'Hai dieci secondi per ogni mossa: allo scadere perdi.',
          'Con un amico la prima mossa di ciascuno è senza tempo.',
        ],
      },
      {
        titolo: 'La fine',
        righe: ['Vince chi fa tre in fila.', 'Se la griglia si riempie prima, è patta.'],
      },
    ],
  },
  forza4: {
    lede: 'Metti quattro dischi del tuo colore in fila, in orizzontale, in verticale o in diagonale, prima dell’altro.',
    sezioni: [
      {
        titolo: 'Il turno',
        righe: ['Tocca una colonna: il disco cade fino in fondo.', 'Si gioca a turno, e comincia il rosso.'],
      },
      {
        titolo: 'La fine',
        righe: ['Vince chi fa quattro in fila.', 'Se la griglia si riempie prima, è patta.'],
      },
    ],
  },
  scacchi: {
    lede: 'Dai scacco matto: il re dell’altro è attaccato e non ha modo di salvarsi.',
    sezioni: [
      {
        titolo: 'Il turno',
        righe: [
          'Tocca un tuo pezzo: le caselle dove può andare si accendono. Poi tocca quella che vuoi.',
          <>
            <strong>Arrocco</strong>: muovi il re di due caselle verso la torre.
          </>,
          'Un pedone che arriva in fondo diventa il pezzo che scegli.',
          'Comincia il Bianco.',
        ],
      },
      {
        titolo: 'La patta',
        righe: [
          'Stallo, la stessa posizione tre volte, cinquanta mosse senza prese né pedoni, o pezzi che non bastano a dare matto: la partita finisce patta da sola.',
          'Con un amico potete anche mettervi d’accordo.',
        ],
      },
      {
        titolo: 'Le mosse',
        righe: ['Nell’elenco: R re, D donna, T torre, A alfiere, C cavallo; il pedone senza lettera.'],
      },
    ],
  },
  go: {
    lede: 'Circonda più territorio dell’altro: alla fine contano le tue pietre e le intersezioni vuote che chiudi.',
    sezioni: [
      {
        titolo: 'Il turno',
        righe: [
          'Tocca un’intersezione vuota: la pietra si posa. Sul 13 e sul 19 tocca due volte lo stesso punto.',
          'Un gruppo che non ha più intersezioni libere accanto è catturato, e si toglie.',
          'Non si gioca dove la pietra resterebbe senza libertà, a meno che non catturi.',
          <>
            <strong>Ko</strong>: una pietra sola che ha appena catturato una pietra sola non si ricattura subito.
          </>,
          'Comincia il Nero.',
        ],
      },
      {
        titolo: 'La fine',
        righe: [
          'Quando non c’è più niente da fare si passa: due passi di seguito fermano la partita.',
          'Il gioco segna le pietre morte. Con un amico toccate i gruppi per correggerlo, e il conteggio vale quando lo accettate tutti e due; contro il computer, se non sei d’accordo, riprendi a giocare.',
          'Si contano le pietre vive e il territorio; il Bianco ha 7,5 punti di komi.',
        ],
      },
    ],
  },
  dama: {
    lede: 'Mangia o blocca tutti i pezzi dell’altro. Si gioca con le regole italiane.',
    sezioni: [
      {
        titolo: 'I pezzi',
        righe: [
          'La pedina va avanti in diagonale, di una casella. In fondo diventa dama, che va anche indietro.',
          'La pedina non può mangiare la dama.',
          'Comincia il Bianco.',
        ],
      },
      {
        titolo: 'Le prese',
        righe: [
          <>
            Prendere è <strong>obbligatorio</strong>, anche più pezzi di fila: il gioco segna chi deve prendere.
          </>,
          'Se si può prendere in più modi: dove si prendono più pezzi; poi con la dama; poi dove si prendono più dame; poi dove si incontra prima una dama.',
        ],
      },
      {
        titolo: 'La patta',
        righe: [
          'La stessa posizione tre volte, o quaranta mosse a testa di sole dame senza prese.',
          'Con un amico potete anche mettervi d’accordo.',
        ],
      },
    ],
  },
}

export function ComeSiGiocaTavoliere({
  gioco,
  open,
  onClose,
}: {
  gioco: GiocoTavoliere
  open: boolean
  onClose: () => void
}) {
  const r = REGOLE[gioco]
  return (
    <Sheet open={open} onClose={onClose} title="Come si gioca">
      <div className="cru-aiuto">
        <p className="cru-aiuto__lede">{r.lede}</p>
        {r.sezioni.map((s) => (
          <section key={s.titolo} className="cru-aiuto__sezione">
            <h3 className="cru-aiuto__titolo">{s.titolo}</h3>
            <ul className="cru-aiuto__elenco">
              {s.righe.map((riga, i) => (
                <li key={i}>{riga}</li>
              ))}
            </ul>
          </section>
        ))}
        <section className="cru-aiuto__sezione">
          <h3 className="cru-aiuto__titolo">Con chi</h3>
          <ul className="cru-aiuto__elenco">
            <li>
              Contro il computer, a tre livelli: {gioco === 'tris' ? 'il segno' : 'il colore'} cambia a ogni partita, e
              alla prima cominci tu.
            </li>
            <li>
              Con un amico online, o con un link. A partita finita, «Gioca ancora» scambia{' '}
              {gioco === 'tris' ? 'i segni' : 'i colori'}.
            </li>
            <li>Non c’è classifica.</li>
          </ul>
        </section>
      </div>
    </Sheet>
  )
}
