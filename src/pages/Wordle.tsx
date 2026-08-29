import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { IconChevronLeft, IconChart, IconInfo } from '@/components/Icons'
import { Board } from '@/games/wordle/Board'
import { HowToPlay } from '@/games/wordle/HowToPlay'
import { Keyboard } from '@/games/wordle/Keyboard'
import { ResultSheet } from '@/games/wordle/ResultSheet'
import { useWordle } from '@/games/wordle/useWordle'
import { MAX_ATTEMPTS, WORD_LENGTH } from '@shared/config'
import './Wordle.css'

export default function Wordle() {
  const navigate = useNavigate()
  const game = useWordle()
  const [helpOpen, setHelpOpen] = useState(false)

  const title = game.state ? `Wordle #${game.state.puzzleNumber}` : 'Wordle'
  const finished = game.state && game.state.status !== 'playing'

  return (
    <AppShell
      title={title}
      hideTabBar
      leading={
        <button type="button" className="navbtn" onClick={() => navigate('/')} aria-label="Torna all'hub">
          <IconChevronLeft size={22} />
        </button>
      }
      trailing={
        <>
          {finished && (
            <button
              type="button"
              className="navbtn"
              onClick={game.openResult}
              aria-label="Rivedi il risultato"
            >
              <IconChart size={20} />
            </button>
          )}
          <button
            type="button"
            className="navbtn"
            onClick={() => setHelpOpen(true)}
            aria-label="Come si gioca"
          >
            <IconInfo size={21} />
          </button>
        </>
      }
    >
      <div className="wordle">
        {game.loadError ? (
          <div className="wordle__fallback">
            <p className="wordle__fallback-text">{game.loadError}</p>
            <Button variant="tinted" onClick={game.reload}>
              Riprova
            </Button>
          </div>
        ) : (
          <>
            {/* Messaggio effimero sopra la griglia: non sposta il layout. */}
            <div className="wordle__message" aria-live="polite">
              {game.message && <span className="wordle__message-pill">{game.message}</span>}
            </div>

            <div className="wordle__board">
              <Board
                guesses={game.state?.guesses ?? []}
                draft={game.draft}
                wordLength={game.state?.wordLength ?? WORD_LENGTH}
                maxAttempts={game.state?.maxAttempts ?? MAX_ATTEMPTS}
                revealing={game.revealing}
                winningRow={game.winningRow}
                shakingRow={game.shakingRow}
              />
            </div>

            <Keyboard
              states={game.keyboard}
              onLetter={game.press}
              onEnter={game.submit}
              onBackspace={game.backspace}
              disabled={game.loading || !!finished || game.revealing !== null}
            />

            {finished && (
              <button type="button" className="wordle__reopen" onClick={game.openResult}>
                Rivedi il riepilogo
              </button>
            )}
          </>
        )}
      </div>

      <HowToPlay open={helpOpen} onClose={() => setHelpOpen(false)} />

      {game.state && (
        <ResultSheet
          open={game.resultOpen}
          onClose={game.closeResult}
          state={game.state}
          stats={game.stats}
        />
      )}
    </AppShell>
  )
}
