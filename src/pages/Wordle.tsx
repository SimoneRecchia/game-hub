import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Coriandoli } from '@/components/Elementi'
import { IconChart, IconInfo, IconPeople } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Board } from '@/games/wordle/Board'
import { HowToPlay } from '@/games/wordle/HowToPlay'
import { Keyboard } from '@/games/wordle/Keyboard'
import { ResultSheet } from '@/games/wordle/ResultSheet'
import { useWordle } from '@/games/wordle/useWordle'
import { InvitePanel } from '@/games/wordle/coop/InvitePanel'
import { SuggestionStrip } from '@/games/wordle/coop/SuggestionStrip'
import { useCoopHost } from '@/games/wordle/coop/useCoopHost'
import { useToast } from '@/components/Toast'
import { MAX_ATTEMPTS, WORD_LENGTH, WORDS_PER_DAY } from '@shared/config'
import './Wordle.css'

/**
 * La griglia di una delle cinque parole della giornata.
 *
 * Quale, lo dice la rotta: `/wordle/classificata/3` e' la terza. La scelta sta
 * nella schermata del percorso, quindi qui sopra la griglia non c'e' nessun
 * selettore — la freccia in alto a sinistra torna alla mappa, che e' anche il
 * gesto che il tasto indietro del telefono fa da solo.
 */
export default function Wordle() {
  const { vai } = useNavigazione()
  const toast = useToast()
  const { slot: param } = useParams()
  const slot = slotValido(param)
  const game = useWordle(slot)
  const [helpOpen, setHelpOpen] = useState(false)
  const [invitiOpen, setInvitiOpen] = useState(false)

  /*
   * Indirizzo di una parola ancora chiusa: si torna al percorso.
   *
   * Il server la rifiuta comunque (`PAROLA_BLOCCATA`), ma lasciare in piedi il
   * messaggio d'errore su una griglia vuota non spiega niente: la mappa dice
   * quale parola apre questa.
   */
  useEffect(() => {
    if (game.loadCode !== 'PAROLA_BLOCCATA') return
    toast.show(
      slot === 2 ? 'Prima finisci la parola del giorno' : `Prima finisci la ${slot - 1}ª parola`,
    )
    vai(ROTTE.classificata('wordle'), { replace: true, direzione: 'indietro' })
  }, [game.loadCode, vai, slot, toast])

  // Il hook decide da solo quando fare polling: qui basta dirgli se il
  // pannello e' aperto.
  const coop = useCoopHost(invitiOpen)
  const attivi = coop.room?.guests.filter((g) => g.status === 'accepted') ?? []

  const title = slot === 1 ? 'Parola del giorno' : `${slot}ª parola`
  const finished = game.state && game.state.status !== 'playing'

  const vinta = game.state?.status === 'won' && game.resultOpen

  return (
    <Pagina
      titolo={title}
      intera
      indietro={{ a: ROTTE.classificata('wordle'), etichetta: 'Oggi' }}
      azioni={
        <>
          {/* In compagnia si gioca la parola del giorno: sulle altre il
              pulsante prometterebbe una cosa che non esiste. */}
          {!finished && slot === 1 && (
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
                <p className="wordle__insieme-testo">
                  La parola di oggi la stai giocando in compagnia. Il punteggio è quello di quella
                  partita.
                </p>
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
          onNextWord={(next) => vai(ROTTE.parola(next), { replace: true })}
        />
      )}
      {vinta && <Coriandoli />}
    </Pagina>
  )
}

/**
 * Lo slot chiesto dall'indirizzo, dentro i limiti.
 *
 * Un `/wordle/9` scritto a mano finisce sulla parola del giorno invece che su
 * una schermata rotta: il server rifiuterebbe con `BAD_SLOT`, e un errore per
 * un indirizzo battuto male e' una cortesia sprecata.
 */
function slotValido(param: string | undefined): number {
  const n = Number(param)
  if (!Number.isInteger(n) || n < 1 || n > WORDS_PER_DAY) return 1
  return n
}
