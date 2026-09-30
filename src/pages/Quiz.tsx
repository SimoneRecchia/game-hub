import { useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaQuiz } from '@/games/quiz/ComeSiGioca'
import { PartitaQuiz } from '@/games/quiz/PartitaQuiz'
import { useQuizDelGiorno } from '@/games/quiz/usePartita'
import { useCountdown } from '@/games/wordle/useCountdown'
import { formatCountdown } from '@/lib/format'

/**
 * Il quiz di oggi: dieci domande uguali per tutti, su una categoria che cambia
 * ogni giorno.
 *
 * Il tempo e le risposte giuste stanno sul server: il telefono riceve una
 * domanda alla volta, senza la risposta, e l'orologio parte quando la chiede.
 * Chi ricarica la pagina a meta' ritrova la domanda dov'era, con il tempo che
 * le resta.
 */
export default function Quiz() {
  const p = useQuizDelGiorno()
  const { vai } = useNavigazione()
  const [regole, setRegole] = useState(false)

  return (
    <Pagina
      titolo="Quiz di oggi"
      intera
      indietro={{ a: ROTTE.home, etichetta: 'Giochi' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      <PartitaQuiz
        p={p}
        classificata
        azioniFine={
          <>
            <Button size="lg" fullWidth onClick={() => vai(ROTTE.classifica('quiz'))}>
              Classifica
            </Button>
            <Button variant="tinted" size="lg" fullWidth onClick={() => vai(ROTTE.libera('quiz'))}>
              Quiz libero
            </Button>
            {p.msToNextPuzzle !== null && <Prossimo ms={p.msToNextPuzzle} />}
          </>
        }
      />
      <ComeSiGiocaQuiz open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

function Prossimo({ ms }: { ms: number }) {
  const restano = useCountdown(ms)
  return (
    <p className="quiz-fine__nota">
      Il prossimo quiz fra <span className="u-tabnum">{formatCountdown(restano)}</span>
    </p>
  )
}
