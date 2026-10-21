import { useEffect, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Adesivo } from '@/components/Adesivo'
import { Coriandoli, useFesta } from '@/components/Elementi'
import { IconChart, IconInfo, IconPeople, IconShuffle } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Sheet } from '@/components/Sheet'
import { useToast } from '@/components/Toast'
import { Board } from '@/games/wordle/Board'
import { adesivoFine } from '@/games/wordle/fine'
import { TestaRiepilogo, titoloRiepilogo } from '@/games/wordle/ResultSheet'
import { Piede } from '@/games/wordle/Piede'
import { HowToPlay } from '@/games/wordle/HowToPlay'
import { Keyboard } from '@/games/wordle/Keyboard'
import { useWordleLibero } from '@/games/wordle/useWordle'
import { PannelloCompagnia } from '@/games/compagnia/PannelloCompagnia'
import { Suggerimenti } from '@/games/compagnia/Suggerimenti'
import { useCompagniaHost } from '@/games/compagnia/useCompagniaHost'
import { api } from '@/lib/api'
import { MAX_ATTEMPTS, WORD_LENGTH } from '@shared/config'
import type { StatisticheWordleLibero, WordleLiberaRisposta } from '@shared/types'
import './Wordle.css'

/**
 * Il Wordle libero: una parola a caso, e poi un'altra.
 *
 * La griglia e la tastiera sono quelle della classificata, e anche la regola
 * che la parola resta sul server finché non si indovina. Cambia quel che c'e'
 * intorno: niente giornata, niente punti, e alla fine il bottone che conta e'
 * "un'altra parola".
 */
export default function WordleLibero() {
  const toast = useToast()
  const { indietro } = useNavigazione()
  const game = useWordleLibero()
  const festa = useFesta(game.state ? game.state.status === 'playing' : null, game.finale?.esito === 'won')
  const [aiuto, setAiuto] = useState(false)
  const [statistiche, setStatistiche] = useState<StatisticheWordleLibero | null>(null)
  const [cambio, setCambio] = useState(false)
  const [compagniaAperta, setCompagniaAperta] = useState(false)
  const finita = !!game.state && game.state.status !== 'playing'
  // Chi guarda segue la parola che si sta giocando, e la prossima.
  const compagnia = useCompagniaHost(
    'wordle',
    'libera',
    !!game.state,
    compagniaAperta,
    game.state ? { partitaId: game.state.id } : null,
  )
  const dentro = compagnia.compagnia?.ospiti.filter((o) => o.stato === 'dentro').length ?? 0

  // Le statistiche delle libere, rilette a ogni partita chiusa.
  useEffect(() => {
    if (!finita) return
    void api<WordleLiberaRisposta>('/wordle/libera')
      .then((r) => setStatistiche(r.statistiche))
      .catch(() => {})
  }, [finita])

  const nuova = async () => {
    try {
      await game.nuova()
      setCambio(false)
    } catch {
      toast.show('Non riesco a cominciare una parola nuova.', 'error')
    }
  }

  const avviata = (game.state?.guesses.length ?? 0) > 0

  return (
    <Pagina
      titolo="Wordle"
      sotto="Libera"
      intera
      indietro={{ a: ROTTE.libere, etichetta: 'Libere' }}
      azioni={
        <>
          {game.state && (
            <BottoneBarra etichetta="Gioca in compagnia" onClick={() => setCompagniaAperta(true)} badge={dentro}>
              <IconPeople size={21} />
            </BottoneBarra>
          )}
          {finita ? (
            <BottoneBarra etichetta="Rivedi il risultato" onClick={game.openResult}>
              <IconChart size={20} />
            </BottoneBarra>
          ) : (
            <BottoneBarra
              etichetta="Cambia parola"
              onClick={() => (avviata ? setCambio(true) : void nuova())}
            >
              <IconShuffle size={20} />
            </BottoneBarra>
          )}
          <BottoneBarra etichetta="Come si gioca" onClick={() => setAiuto(true)}>
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
            <section className="wordle__tavola" aria-label="Parola libera">
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
                <Piede state={game.state} message={game.message} revealing={game.revealing} />
              </div>
            </section>
            {finita ? (
              <div className="wordle__fine-libera">
                <Button size="lg" variant="tinted" onClick={() => indietro(ROTTE.libere)}>
                  Esci
                </Button>
                <Button size="lg" onClick={() => void nuova()}>
                  <IconShuffle size={18} /> Un’altra parola
                </Button>
              </div>
            ) : (
              <>
                {/* I suggerimenti di chi guarda: toccarne uno riempie la riga, non la invia. */}
                <Suggerimenti
                  suggerimenti={compagnia.compagnia?.suggerimenti ?? []}
                  etichetta={(s) => ({
                    parola: s.proposta.gioco === 'wordle' ? s.proposta.parola.toUpperCase() : '',
                    nota: '',
                  })}
                  onScegli={(s) => s.proposta.gioco === 'wordle' && game.fill(s.proposta.parola)}
                  disabled={game.revealing !== null || game.submitting}
                />
                <Keyboard
                  states={game.keyboard}
                  onLetter={game.press}
                  onEnter={game.submit}
                  onBackspace={game.backspace}
                  disabled={game.loading || finita || game.revealing !== null}
                  pronta={game.draft.length === WORD_LENGTH}
                />
              </>
            )}
          </>
        )}
      </div>

      <HowToPlay open={aiuto} onClose={() => setAiuto(false)} />

      <PannelloCompagnia
        gioco="wordle"
        modalita="libera"
        open={compagniaAperta}
        onClose={() => setCompagniaAperta(false)}
        compagnia={compagnia.compagnia}
        giocatori={compagnia.giocatori}
        occupato={compagnia.occupato}
        errore={compagnia.errore}
        onInvita={compagnia.invita}
        onRitira={compagnia.ritira}
        onCaricaGiocatori={compagnia.caricaGiocatori}
        onChiudi={compagnia.chiudi}
      />

      {game.state && (
        <Sheet open={game.resultOpen} onClose={game.closeResult} title={titoloRiepilogo(game.state)}>
          <div className="result">
            <TestaRiepilogo sopra="Parola libera" state={game.state} punti={null} />
            {statistiche && (
              <div className="libero-conti">
                <Conto valore={statistiche.giocate} etichetta="Giocate" />
                <Conto valore={statistiche.vinte} etichetta="Indovinate" />
                <Conto valore={statistiche.serie} etichetta="Di fila" />
              </div>
            )}
            <p className="result__rimaste">Le parole libere non contano per la classifica.</p>
            <div className="result__actions">
              <Button size="lg" fullWidth onClick={() => void nuova()}>
                <IconShuffle size={18} /> Un’altra parola
              </Button>
            </div>
          </div>
        </Sheet>
      )}

      <Sheet open={cambio} onClose={() => setCambio(false)} title="Cambiare parola?">
        <p className="result__lede">Quella in corso conta come non indovinata.</p>
        <div className="result__actions">
          <Button size="lg" fullWidth variant="destructive" onClick={() => void nuova()}>
            Cambia parola
          </Button>
          <Button size="lg" fullWidth variant="tinted" onClick={() => setCambio(false)}>
            Continua questa
          </Button>
        </div>
      </Sheet>

      <Adesivo adesivo={game.finale ? adesivoFine(game.finale, game.finale.id) : null} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

function Conto({ valore, etichetta }: { valore: number; etichetta: string }) {
  return (
    <div className="libero-conti__voce">
      <span className="libero-conti__valore u-tabnum">{valore}</span>
      <span className="libero-conti__etichetta">{etichetta}</span>
    </div>
  )
}
