import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button } from '@/components/Button'
import { IconCheck, IconClock, IconClose } from '@/components/Icons'
import { IconaScheda, Pillola, Scheda } from '@/components/Scheda'
import { useIndiceQuiz } from '@/games/quiz/dati'
import {
  CartaDomanda,
  CartinaDellaPartita,
  Miccia,
  Opzioni,
  precaricaQuadri,
  type ContestoCartina,
} from '@/games/quiz/PartitaQuiz'
import { OPZIONI_CLASSIFICATA, type Fatta } from '@/games/quiz/usePartita'
import { suona } from '@/lib/suoni'
import { diGeografia } from '@shared/quiz'
import { NOMI_MATERIE_RUOTA, scriviMoltiplicatore } from '@shared/ruota'
import type { SfidaRuotaVista } from '@shared/types'
import { COLORI_MATERIE_RUOTA, ICONE_MATERIE_RUOTA, coloreDelMoltiplicatore } from './disegni'

type SfidaDomanda = Extract<SfidaRuotaVista, { tipo: 'domanda' }>

const NESSUNO: ReadonlySet<string> = new Set()

/** Gli ultimi secondi si contano, come nel quiz. */
const ULTIMI_SECONDI = 5

/** La cartina che insegna, a risposta data, e' quella della classificata: il mondo, con le opzioni di sempre. */
const CONTESTO: ContestoCartina = { area: 'mondo', citta: null, opzioni: OPZIONI_CLASSIFICATA }

/**
 * La domanda di Crazy Time, con la testata, la carta, le risposte e la miccia
 * del quiz: le stesse della partita di tutti i giorni, perché chi la vede la
 * riconosca. Sotto il titolo, quel che c'e' in palio: la puntata per il
 * moltiplicatore uscito. Il tempo lo tiene il server; qui, a tempo finito, si
 * manda la risposta non data. A risposta data restano la giusta e quel che
 * insegna — la cartina per la geografia, la scheda per le altre materie — e il
 * bottone per tornare alla ruota.
 *
 * Arriva a parte dal resto della ruota: si porta dietro la carta del quiz, che
 * serve solo quando la ruota si ferma su una domanda.
 */
export default function DomandaRuota({
  sfida,
  inviando,
  onRispondi,
  onTorna,
}: {
  sfida: SfidaDomanda
  inviando: boolean
  onRispondi: (scelta: string | null) => void
  onTorna: () => void
}) {
  const d = sfida.domanda!
  const fatta: Fatta | null = sfida.risposta ? { domanda: d, risposta: sfida.risposta } : null
  const aperta = !fatta && sfida.restanteMs !== null
  const [scadenza] = useState(() => performance.now() + (sfida.restanteMs ?? 0))
  const rispondi = useRef(onRispondi)
  useEffect(() => {
    rispondi.current = onRispondi
  })

  useEffect(() => {
    precaricaQuadri(d)
  }, [d])

  // A tempo finito la risposta e' quella non data. Si misura dalla scadenza, non da quel che restava all'inizio.
  useEffect(() => {
    if (!aperta || inviando) return
    const t = window.setTimeout(() => rispondi.current(null), Math.max(0, scadenza - performance.now()))
    return () => window.clearTimeout(t)
  }, [aperta, inviando, scadenza])

  const categoria = sfida.categoria ?? 'capitali'
  const geografia = diGeografia(categoria)
  const ix = useIndiceQuiz(geografia)
  const Icona = ICONE_MATERIE_RUOTA[sfida.materia]
  const esito = fatta ? (fatta.risposta.giusta ? ' is-giusta' : ' is-sbagliata') : ''
  const scheda = fatta?.risposta.spiegazione ?? null
  const rivela = !!fatta && (geografia || !!scheda)
  return (
    <div className="quiz ruota-quiz">
      <Scheda
        className="quiz__tabellone"
        titolo={`Domanda di ${NOMI_MATERIE_RUOTA[sfida.materia].toLowerCase()}`}
        icona={
          <IconaScheda colore={COLORI_MATERIE_RUOTA[sfida.materia]}>
            <Icona size={15} />
          </IconaScheda>
        }
        destra={<Tempo fatta={fatta} scadenza={aperta ? scadenza : null} />}
      >
        <div className="quiz-progresso">
          {sfida.moltiplicatore !== null && sfida.vincita !== null && (
            <p className="ct-quiz__palio">
              <span
                className="ct-quiz__moltiplicatore"
                style={{ '--colore': coloreDelMoltiplicatore(sfida.moltiplicatore) } as CSSProperties}
              >
                {scriviMoltiplicatore(sfida.moltiplicatore)}
              </span>
              In palio <span className="u-tabnum">{sfida.vincita}</span> punti
            </p>
          )}
          {sfida.limiteMs !== null && (
            <Miccia
              key={aperta ? 'va' : 'ferma'}
              scadenza={scadenza}
              ferma={!aperta || inviando}
              limiteMs={sfida.limiteMs}
            />
          )}
        </div>
      </Scheda>
      <CartaDomanda
        d={d}
        categoria={categoria}
        esito={esito}
        rivela={rivela}
        cartina={
          fatta && geografia ? (
            <CartinaDellaPartita c={CONTESTO} ix={ix} d={d} scelta={null} fatta={fatta} guarda />
          ) : null
        }
        scheda={scheda}
      />
      <Opzioni
        d={d}
        esito={fatta}
        inviando={inviando}
        esclusi={NESSUNO}
        compatte={rivela}
        onScegli={(id) => onRispondi(id)}
      />
      {fatta && (
        <div className="quiz-avanti">
          <Button size="lg" fullWidth onClick={onTorna} className="quiz-avanti__bottone">
            Torna alla ruota
          </Button>
        </div>
      )}
    </div>
  )
}

/** I secondi che restano, e a risposta data com'e' andata: la capsula della testata del quiz. */
function Tempo({ fatta, scadenza }: { fatta: Fatta | null; scadenza: number | null }) {
  const [adesso, setAdesso] = useState(() => performance.now())
  useEffect(() => {
    if (scadenza === null) return
    const t = window.setInterval(() => setAdesso(performance.now()), 200)
    return () => window.clearInterval(t)
  }, [scadenza])
  const secondi = scadenza === null ? 0 : Math.ceil(Math.max(0, scadenza - adesso) / 1000)
  const ticchetta = scadenza !== null && secondi > 0 && secondi <= ULTIMI_SECONDI ? secondi : null
  useEffect(() => {
    if (ticchetta !== null) suona('tic')
  }, [ticchetta])

  if (fatta) {
    const { giusta, scelta } = fatta.risposta
    return (
      <Pillola
        tono={giusta ? 'buona' : 'cattiva'}
        icona={giusta ? <IconCheck size={13} /> : scelta === null ? <IconClock size={13} /> : <IconClose size={13} />}
      >
        {giusta ? 'Giusta' : scelta === null ? 'Tempo scaduto' : 'Sbagliata'}
      </Pillola>
    )
  }
  const poco = scadenza !== null && secondi <= ULTIMI_SECONDI
  return (
    <Pillola tono={poco ? 'cattiva' : 'neutra'} icona={<IconClock size={13} />} vivo={poco}>
      <span className="u-tabnum">{scadenza === null ? '…' : `${secondi} s`}</span>
    </Pillola>
  )
}
