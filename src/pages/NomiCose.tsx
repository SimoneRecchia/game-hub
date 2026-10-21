import { useCallback, useEffect, useState } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta, Vuoto } from '@/components/Elementi'
import { IconComputer, IconInfo, IconPlay, IconTrophy } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Pillola } from '@/components/Scheda'
import { adesivoConsegna, adesivoTempo } from '@/games/nomi/adesivi'
import { ComeSiGiocaNomi } from '@/games/nomi/ComeSiGioca'
import { CartaScritta, FoglioInGioco, PostIt, type RigaScritta } from '@/games/nomi/Foglio'
import { piuDateDi, righeDiIeri } from '@/games/nomi/racconto'
import { RulloLettera, VoloLettera, type Tondo } from '@/games/nomi/Rullo'
import { movimentoRidotto, tempiCorrezione } from '@/games/nomi/scena'
import { useNomiDelGiorno } from '@/games/nomi/useNomiDelGiorno'
import { useCorrezione, useDopo, useLetteraInVolo, useTimbro } from '@/games/nomi/useScena'
import { useCountdown } from '@/games/wordle/useCountdown'
import { formatCountdown, formatCronometro } from '@/lib/format'
import { BASE_NOMI, CATEGORIE_PER_PARTITA, SECONDI_NOMI } from '@shared/nomi-cose'
import type { NomiStato, RisultatoNomi } from '@shared/types'
import '@/games/nomi/NomiCose.css'

/**
 * Nomi, cose e città, la partita del giorno: una lettera e cinque categorie,
 * le stesse per tutti, e tre minuti da quando si comincia. Comincia fa girare
 * il rullo delle lettere, che si ferma sulla lettera di oggi e la porta sul
 * foglio. Alla consegna il foglio si corregge davanti a chi guarda — quali
 * risposte valgono si sa subito — e i punti, che dipendono dalle risposte di
 * tutti, arrivano la notte: la mattina dopo il foglio di ieri li ha.
 */
export default function NomiCose() {
  const g = useNomiDelGiorno()
  const [regole, setRegole] = useState(false)
  const s = g.stato
  const { adesivo, accoda } = useCodaAdesivi()
  const timbro = useTimbro(accoda)
  const dopo = useDopo()

  // Il rullo gira dal tocco su Comincia finche' la lettera, ferma, non vola sul foglio.
  const [scena, setScena] = useState(false)
  const volo = useLetteraInVolo(s?.lettera ?? null)
  const comincia = () => {
    // Il rullo va al centro dello schermo: la pagina torna in cima, se si era scesi a guardare ieri.
    document.querySelector('.nomi-pagina')?.scrollTo({ top: 0 })
    setScena(true)
    g.comincia()
  }
  // Se la partenza non va, il rullo si ferma e Comincia torna.
  useEffect(() => {
    if (scena && s?.status === 'nuova' && !g.occupato) setScena(false)
  }, [scena, s, g.occupato])
  const { atterra } = volo
  const arrivata = useCallback(
    (da: Tondo) => {
      atterra(da)
      setScena(false)
    },
    [atterra],
  )

  // La partita vista in corso: alla consegna il foglio si corregge, e poi l'adesivo.
  const [giocataQui, setGiocataQui] = useState(false)
  useEffect(() => {
    if (s?.status === 'playing') setGiocataQui(true)
  }, [s?.status])
  // Il tempo finito: il timbro, e la correzione aspetta che se ne vada.
  const tempoFinito = () => {
    timbro.timbra(adesivoTempo())
    g.consegna()
  }
  const correzione = useCorrezione(giocataQui && s?.status === 'done', timbro.resto)

  const [tutte, setTutte] = useState(false)
  useEffect(() => {
    if (!correzione || !s) return
    const scritte = Object.values(s.risposte).filter((t) => t.trim() !== '').length
    const valide = s.riconosciute ? Object.values(s.riconosciute).filter(Boolean).length : null
    const quando = tempiCorrezione(s.categorie?.length ?? 0, correzione.attesa, movimentoRidotto()).fine
    dopo.programma(quando, () => {
      accoda(adesivoConsegna(valide, scritte))
      setTutte(valide === CATEGORIE_PER_PARTITA)
    })
    // Una volta, quando il foglio corretto compare: la correzione non cambia piu'.
  }, [correzione])
  const festa = useFesta(s ? s.status === 'playing' : null, tutte)

  return (
    <Pagina
      titolo="Nomi, cose e città"
      sotto="La lettera di oggi"
      intera
      indietro={{ a: ROTTE.home, etichetta: 'Giornaliere' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      {g.errore ? (
        <Vuoto
          titolo="La partita non si è aperta"
          testo={g.errore}
          azione={
            <Button variant="tinted" onClick={g.ricarica}>
              Riprova
            </Button>
          }
        />
      ) : !s ? (
        <div className="nomi-attesa" aria-hidden="true" />
      ) : s.status === 'nuova' || scena ? (
        <div className={`nomi-pagina${s.ieri ? ' is-doppia' : ''}${scena ? ' is-via' : ''}`}>
          <Inizio stato={s} gira={scena} occupato={g.occupato} onComincia={comincia} onArrivata={arrivata} />
          {s.ieri && <Ieri ieri={s.ieri} />}
        </div>
      ) : s.status === 'playing' && s.lettera && s.categorie ? (
        <FoglioInGioco
          lettera={s.lettera}
          categorie={s.categorie}
          risposte={g.risposte}
          onScrivi={g.scrivi}
          disabilitato={g.occupato}
          scadenza={g.scadenza}
          totaleMs={s.tempoTotaleMs}
          onScaduto={tempoFinito}
          entrata={volo.arrivata}
          nascondiLettera={volo.volo !== null}
          azione={
            <Button size="lg" fullWidth className="nomi-stop" onClick={g.consegna} disabled={g.occupato}>
              Consegna
            </Button>
          }
        />
      ) : (
        <div className={`nomi-pagina${s.ieri ? ' is-doppia' : ''}`}>
          <Consegnata stato={s} correzione={correzione} />
          {s.ieri && <Ieri ieri={s.ieri} />}
        </div>
      )}
      <ComeSiGiocaNomi open={regole} onClose={() => setRegole(false)} />
      <VoloLettera volo={volo.volo} onFine={volo.finito} />
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** Prima di cominciare: il rullo fermo sul punto di domanda, e il tempo che non corre. */
function Inizio({
  stato,
  gira,
  occupato,
  onComincia,
  onArrivata,
}: {
  stato: NomiStato
  gira: boolean
  occupato: boolean
  onComincia: () => void
  onArrivata: (da: Tondo) => void
}) {
  return (
    <div className={`nomi-inizio${gira ? ' is-via' : ''}`}>
      <RulloLettera lettera={gira ? stato.lettera : null} gira={gira} onArrivato={onArrivata} />
      <div className="nomi-inizio__testi" aria-hidden={gira || undefined}>
        <p className="nomi-inizio__sopra">La lettera di oggi · #{stato.puzzleNumber}</p>
        <h2 className="nomi-inizio__titolo">Una lettera, {CATEGORIE_PER_PARTITA} categorie</h2>
        <p className="nomi-inizio__testo">La lettera la vedi quando cominci, e da lì parte il tempo.</p>
        <div className="nomi-inizio__regole">
          <span>
            <strong className="u-tabnum">{CATEGORIE_PER_PARTITA}</strong> categorie
          </span>
          <span>
            <strong className="u-tabnum">{SECONDI_NOMI / 60}</strong> minuti
          </span>
        </div>
        <Button size="lg" fullWidth onClick={onComincia} disabled={occupato || gira}>
          <IconPlay size={17} /> Comincia
        </Button>
      </div>
    </div>
  )
}

/** La partita di oggi consegnata: quali risposte valgono, e quando arrivano i punti. */
function Consegnata({ stato, correzione }: { stato: NomiStato; correzione: { attesa: number } | null }) {
  const restano = useCountdown(stato.msToNextPuzzle)
  const categorie = stato.categorie ?? []
  const righe: RigaScritta[] = categorie.map((c) => {
    const testo = stato.risposte[c] ?? ''
    const valida = stato.riconosciute?.[c]
    return {
      categoria: c,
      testo,
      segno: !testo.trim() ? 'vuota' : valida === undefined ? null : valida ? 'giusta' : 'sbagliata',
    }
  })
  const valide = stato.riconosciute ? Object.values(stato.riconosciute).filter(Boolean).length : null
  return (
    <div className="nomi-oggi">
      <CartaScritta
        titolo={stato.lettera ? `Oggi, con la ${stato.lettera.toUpperCase()}` : 'Oggi'}
        lettera={stato.lettera}
        destra={
          stato.tempoMs !== null ? <Pillola tono="neutra">in {formatCronometro(stato.tempoMs)}</Pillola> : undefined
        }
        righe={righe}
        totale={valide === null ? undefined : { etichetta: 'Valide', valore: `${valide} su ${categorie.length}` }}
        correzione={correzione}
      />
      <div className="nomi-fine">
        <p className="nomi-fine__dettaglio">I punti arrivano stanotte, e valgono nella classifica di domani.</p>
        <div className="nomi-fine__azioni">
          <Collegamento to={ROTTE.classifica('nomi')} className="nomi-fine__link">
            <IconTrophy size={18} />
            Classifica
          </Collegamento>
          <Collegamento to={ROTTE.libera('nomi')} className="nomi-fine__link">
            <IconComputer size={18} />
            Contro il computer
          </Collegamento>
        </div>
        <p className="nomi-fine__piede">
          La prossima lettera fra <span className="u-tabnum">{formatCountdown(restano)}</span>
        </p>
      </div>
    </div>
  )
}

/** La partita di ieri, contata stanotte: i punti di ogni risposta, e le piu' date da tutti su un post-it. */
function Ieri({ ieri }: { ieri: RisultatoNomi }) {
  const piuDate = piuDateDi(ieri)
  return (
    <div className="nomi-ieri">
      <CartaScritta
        titolo={`Ieri, con la ${ieri.lettera.toUpperCase()}`}
        lettera={ieri.lettera}
        destra={<Pillola tono="buona">{ieri.punti} punti</Pillola>}
        righe={righeDiIeri(ieri)}
        conPunti
        totale={{
          etichetta: 'Totale',
          nota: ieri.punti > 0 ? `${BASE_NOMI} per aver giocato` : undefined,
          valore: ieri.punti,
        }}
      >
        <p className="nomi-ieri__conto">
          {ieri.giocatori} {ieri.giocatori === 1 ? 'giocatore' : 'giocatori'} · consegnata in{' '}
          {formatCronometro(ieri.tempoMs)}
        </p>
      </CartaScritta>
      {piuDate.length > 0 && (
        <PostIt
          titolo="Le più date"
          voci={piuDate.map(({ categoria, nome, risposte }) => ({
            chiave: categoria,
            nome,
            parole: risposte.map((r, i) => (
              <span key={r.testo}>
                {i > 0 && ', '}
                {r.testo} <span className="u-tabnum">×{r.uguali}</span>
              </span>
            )),
          }))}
        />
      )}
    </div>
  )
}
