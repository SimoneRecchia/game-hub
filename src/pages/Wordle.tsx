import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { IconChevronLeft, IconChart, IconInfo, IconPeople } from '@/components/Icons'
import { Board } from '@/games/wordle/Board'
import { HowToPlay } from '@/games/wordle/HowToPlay'
import { Keyboard } from '@/games/wordle/Keyboard'
import { ResultSheet } from '@/games/wordle/ResultSheet'
import { useWordle } from '@/games/wordle/useWordle'
import { InvitePanel } from '@/games/wordle/coop/InvitePanel'
import { SuggestionStrip } from '@/games/wordle/coop/SuggestionStrip'
import { useCoopHost } from '@/games/wordle/coop/useCoopHost'
import { MAX_ATTEMPTS, WORD_LENGTH } from '@shared/config'
import './Wordle.css'

export default function Wordle() {
  const navigate = useNavigate()
  const game = useWordle()
  const [helpOpen, setHelpOpen] = useState(false)
  const [invitiOpen, setInvitiOpen] = useState(false)

  // Il hook decide da solo quando fare polling: qui basta dirgli se il
  // pannello e' aperto.
  const coop = useCoopHost(invitiOpen)
  const attivi = coop.room?.guests.filter((g) => g.status === 'accepted') ?? []

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
          {!finished && (
            <button
              type="button"
              className="navbtn wordle__invita"
              onClick={() => setInvitiOpen(true)}
              aria-label="Gioca in compagnia"
            >
              <IconPeople size={21} />
              {attivi.length > 0 && <span className="wordle__invita-badge">{attivi.length}</span>}
            </button>
          )}
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
            {/*
              La parola di oggi la sta giocando altrove: qui non c'e' niente da
              giocare, e' la stessa parola. Invece di lasciarlo davanti a una
              griglia che rifiuta i tentativi, lo si riporta lì.
            */}
            {game.state?.spectated && (
              <div className="wordle__insieme">
                <p className="wordle__insieme-testo">
                  La parola di oggi la stai giocando in compagnia. Il punteggio è quello di quella
                  partita.
                </p>
                {game.state.roomId && (
                  <Button
                    variant="tinted"
                    onClick={() => navigate(`/insieme/${game.state!.roomId}`)}
                  >
                    Torna alla partita
                  </Button>
                )}
              </div>
            )}

            {attivi.length > 0 && (
              <div className="wordle__spettatori">
                <span className="wordle__spettatori-avatar">
                  {attivi.slice(0, 5).map((g) => (
                    <Avatar key={g.playerId} nickname={g.nickname} color={g.avatarColor} size={22} />
                  ))}
                </span>
                <span className="wordle__spettatori-testo">
                  {attivi.length === 1
                    ? `${attivi[0].displayName} sta guardando`
                    : `${attivi.length} persone stanno guardando`}
                </span>
              </div>
            )}

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

            {/* I suggerimenti degli invitati: toccarne uno riempie la riga,
                non la invia. La parola la decide sempre l'host. */}
            {!finished && (
              <SuggestionStrip
                suggestions={coop.room?.suggestions ?? []}
                onPick={game.fill}
                disabled={game.revealing !== null || game.submitting}
              />
            )}

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

      <InvitePanel
        open={invitiOpen}
        onClose={() => setInvitiOpen(false)}
        room={coop.room}
        players={coop.players}
        busy={coop.busy}
        error={coop.error}
        onInvite={coop.invita}
        onRevoke={coop.ritira}
        onLoadPlayers={coop.caricaGiocatori}
      />

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
