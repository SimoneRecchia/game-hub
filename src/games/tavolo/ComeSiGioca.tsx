import type { ReactNode } from 'react'
import { Sheet } from '@/components/Sheet'
import type { GiocoTavoliere } from '@shared/tavolo'
import '@/games/cruciverba/ComeSiGioca.css'

/** Le regole di ogni gioco da tavoliere, il minimo per giocare: lo scopo, come si muove, come finisce. */
const REGOLE: Record<GiocoTavoliere, { lede: string; sezioni: { titolo: string; righe: ReactNode[] }[] }> = {
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
            <li>Contro il computer, a tre livelli: la partita resta nel telefono.</li>
            <li>Con un amico online, o con un link. A partita finita, «Gioca ancora» scambia i colori.</li>
            <li>Non c’è classifica.</li>
          </ul>
        </section>
      </div>
    </Sheet>
  )
}
