import { useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Adesivo } from '@/components/Adesivo'
import { Coriandoli, useFesta } from '@/components/Elementi'
import { IconChart, IconInfo, IconPeople } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Scheda } from '@/components/Scheda'
import { Board } from '@/games/wordle/Board'
import { IconaWordle, Tentativi, adesivoFine, notaWordle } from '@/games/wordle/fine'
import { HowToPlay } from '@/games/wordle/HowToPlay'
import { Keyboard } from '@/games/wordle/Keyboard'
import { ResultSheet } from '@/games/wordle/ResultSheet'
import { useWordle } from '@/games/wordle/useWordle'
import { InvitePanel } from '@/games/wordle/coop/InvitePanel'
import { SuggestionStrip } from '@/games/wordle/coop/SuggestionStrip'
import { useCoopHost } from '@/games/wordle/coop/useCoopHost'
import { MAX_ATTEMPTS, WORD_LENGTH } from '@shared/config'
import './Wordle.css'

/**
 * La parola del giorno: una sola, la stessa per tutti.
 *
 * E' la classificata del Wordle. Chi ne vuole giocare altre le trova nella
 * libera, a caso e senza punti: il riepilogo di fine partita ci porta.
 */
export default function Wordle() {
  const { vai } = useNavigazione()
  const game = useWordle()
  const [helpOpen, setHelpOpen] = useState(false)
  const [invitiOpen, setInvitiOpen] = useState(false)

  // Il hook decide da solo quando fare polling: qui basta dirgli se il
  // pannello e' aperto.
  const coop = useCoopHost(invitiOpen)
  const attivi = coop.room?.guests.filter((g) => g.status === 'accepted') ?? []

  const title = game.state ? `Wordle #${game.state.puzzleNumber}` : 'Parola del giorno'
  const finished = game.state && game.state.status !== 'playing'

  // La festa con l'adesivo di una vittoria appena fatta, non di una riaperta.
  const festa = useFesta(game.state ? game.state.status === 'playing' : null, game.finale?.esito === 'won')

  return (
    <Pagina
      titolo={title}
      intera
      indietro={{ a: ROTTE.home, etichetta: 'Giochi' }}
      azioni={
        <>
          {!finished && (
            <BottoneBarra etichetta="Gioca in compagnia" onClick={() => setInvitiOpen(true)} badge={attivi.length}>
              <IconPeople size={21} />
            </BottoneBarra>
          )}
          {finished && (
            <BottoneBarra etichetta="Rivedi il risultato" onClick={game.openResult}>
              <IconChart size={20} />
            </BottoneBarra>
          )}
          <BottoneBarra etichetta="Come si gioca" onClick={() => setHelpOpen(true)}>
            <IconInfo size={21} />
          </BottoneBarra>
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
                <p className="wordle__insieme-testo">La parola di oggi la giochi in compagnia.</p>
                {game.state.roomId && (
                  <Button
                    variant="tinted"
                    onClick={() => vai(ROTTE.insieme(game.state!.roomId!))}
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

            <Scheda
              className="wordle__tavola"
              titolo="La parola del giorno"
              icona={<IconaWordle />}
              destra={
                game.state && (
                  <Tentativi
                    guesses={game.state.guesses}
                    maxAttempts={game.state.maxAttempts}
                    status={game.state.status}
                  />
                )
              }
            >
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
              {/* I messaggi stanno qui, sotto la griglia: prima erano una pillola che la copriva. */}
              <p className={`wordle__piede${game.message ? ' is-messaggio' : ''}`} aria-live="polite">
                {game.message ??
                  (game.state
                    ? notaWordle(
                        game.revealing === null ? game.state.guesses : game.state.guesses.slice(0, game.revealing),
                        game.revealing === null ? game.state.status : 'playing',
                        game.state.answer,
                      )
                    : ' ')}
              </p>
            </Scheda>

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
          onLibera={() => vai(ROTTE.libera('wordle'))}
        />
      )}
      <Adesivo adesivo={game.finale ? adesivoFine(game.finale, game.finale.id) : null} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}
