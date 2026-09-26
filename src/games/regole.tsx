import type { ReactElement } from 'react'
import type { GiocoClassificato } from '@shared/types'
import { HowToPlay } from '@/games/wordle/HowToPlay'
import { ComeSiGiocaScarabeo } from '@/games/scarabeo/ComeSiGioca'
import { ComeSiGiocaCruciverba } from '@/games/cruciverba/ComeSiGioca'
import { ComeSiGiocaBattaglia } from '@/games/battaglia/ComeSiGioca'
import { ComeSiGiocaQuiz } from '@/games/quiz/ComeSiGioca'

/** Il foglio delle regole di ogni gioco: lo apre la pagina del gioco e la partita. */
export const REGOLE: Record<GiocoClassificato, (p: { open: boolean; onClose: () => void }) => ReactElement> = {
  wordle: HowToPlay,
  scarabeo: ComeSiGiocaScarabeo,
  cruciverba: ComeSiGiocaCruciverba,
  battaglia: ComeSiGiocaBattaglia,
  quiz: ComeSiGiocaQuiz,
}
