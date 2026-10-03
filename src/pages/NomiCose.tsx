import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Adesivo, useCodaAdesivi } from '@/components/Adesivo'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta, Vuoto } from '@/components/Elementi'
import { IconComputer, IconInfo, IconPlay, IconTrophy } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { Pillola, Scheda } from '@/components/Scheda'
import { ComeSiGiocaNomi } from '@/games/nomi/ComeSiGioca'
import { FoglioDaScrivere, FoglioScritto, Lettera, type RigaScritta } from '@/games/nomi/Foglio'
import { Matita } from '@/games/nomi/Matita'
import { piuDateDi, righeDiIeri } from '@/games/nomi/racconto'
import { useNomiDelGiorno } from '@/games/nomi/useNomiDelGiorno'
import { useCountdown } from '@/games/wordle/useCountdown'
import { formatCountdown, formatCronometro } from '@/lib/format'
import { BASE_NOMI, CATEGORIE_PER_PARTITA, SECONDI_NOMI } from '@shared/nomi-cose'
import type { NomiStato, RisultatoNomi } from '@shared/types'
import '@/games/nomi/NomiCose.css'

/** Il colore dell'adesivo della consegna: la matita gialla. */
const COLORE = 'linear-gradient(135deg, var(--nomi-1), var(--nomi-2))'

/**
 * Nomi, cose e città, la partita del giorno: una lettera e cinque categorie,
 * le stesse per tutti, e tre minuti da quando si comincia. Alla consegna si sa
 * subito quali risposte valgono; i punti, che dipendono dalle risposte di
 * tutti, arrivano la notte, e la mattina dopo la pagina li racconta.
 */
export default function NomiCose() {
  const g = useNomiDelGiorno()
  const [regole, setRegole] = useState(false)
  const s = g.stato

  // La consegna vista in corso: l'adesivo con le valide, e i coriandoli se valgono tutte.
  const { adesivo, accoda } = useCodaAdesivi()
  const vistaInCorso = useRef(false)
  const [tutte, setTutte] = useState(false)
  useEffect(() => {
    if (s?.status === 'playing') {
      vistaInCorso.current = true
      return
    }
    if (s?.status !== 'done' || !vistaInCorso.current) return
    vistaInCorso.current = false
    const scritte = Object.values(s.risposte).filter((t) => t.trim() !== '').length
    const valide = s.riconosciute ? Object.values(s.riconosciute).filter(Boolean).length : null
    accoda({
      tono: valide === null || valide >= 3 ? 'vivace' : 'bordato',
      titolo: valide === null ? 'Consegnata' : `${valide} su ${CATEGORIE_PER_PARTITA}`,
      sotto: valide === null ? `${scritte} su ${CATEGORIE_PER_PARTITA}` : 'I punti arrivano stanotte',
      colore: COLORE,
      durata: 2_200,
      suono: valide !== null && valide < 3 ? 'sbagliato' : 'giusto',
    })
    setTutte(valide === CATEGORIE_PER_PARTITA)
  }, [accoda, s])
  const festa = useFesta(s ? s.status === 'playing' : null, tutte)

  return (
    <Pagina
      titolo="Nomi, cose e città"
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
      ) : s.status === 'nuova' ? (
        <div className="nomi-pagina">
          <Inizio stato={s} occupato={g.occupato} onComincia={g.comincia} />
          {s.ieri && <Ieri ieri={s.ieri} />}
        </div>
      ) : s.status === 'playing' && s.lettera && s.categorie ? (
        <div className="nomi-pagina is-in-gioco">
          <header className="nomi-testa">
            <Lettera lettera={s.lettera} />
            <div className="nomi-testa__tempo">
              <p className="nomi-testa__con">Con la {s.lettera.toUpperCase()}</p>
              {g.scadenza !== null && (
                <Matita scadenza={g.scadenza} totaleMs={s.tempoTotaleMs} onScaduto={g.consegna} />
              )}
            </div>
          </header>
          <FoglioDaScrivere
            lettera={s.lettera}
            categorie={s.categorie}
            risposte={g.risposte}
            onScrivi={g.scrivi}
            disabilitato={g.occupato}
          />
          <Button size="lg" fullWidth onClick={g.consegna} disabled={g.occupato}>
            Consegna
          </Button>
        </div>
      ) : (
        <div className="nomi-pagina">
          <Consegnata stato={s} />
          {s.ieri && <Ieri ieri={s.ieri} />}
        </div>
      )}
      <ComeSiGiocaNomi open={regole} onClose={() => setRegole(false)} />
      <Adesivo adesivo={adesivo} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** Prima di cominciare: la lettera e' nascosta, e il tempo non corre. */
function Inizio({ stato, occupato, onComincia }: { stato: NomiStato; occupato: boolean; onComincia: () => void }) {
  return (
    <div className="nomi-inizio">
      <Lettera lettera={null} />
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
      <Button size="lg" fullWidth onClick={onComincia} disabled={occupato}>
        <IconPlay size={17} /> Comincia
      </Button>
    </div>
  )
}

/** La partita di oggi consegnata: quali risposte valgono, e quando arrivano i punti. */
function Consegnata({ stato }: { stato: NomiStato }) {
  const restano = useCountdown(stato.msToNextPuzzle)
  const categorie = stato.categorie ?? []
  const righe: RigaScritta[] = categorie.map((c) => {
    const testo = stato.risposte[c] ?? ''
    const valida = stato.riconosciute?.[c]
    return {
      categoria: c,
      testo,
      segno: !testo ? 'vuota' : valida === undefined ? null : valida ? 'giusta' : 'sbagliata',
    }
  })
  const valide = stato.riconosciute ? Object.values(stato.riconosciute).filter(Boolean).length : null
  return (
    <Scheda
      className="nomi-scheda"
      titolo={stato.lettera ? `Oggi, con la ${stato.lettera.toUpperCase()}` : 'Oggi'}
      icona={<Lettera lettera={stato.lettera} piccola />}
      destra={
        stato.tempoMs !== null ? (
          <Pillola tono="neutra">in {formatCronometro(stato.tempoMs)}</Pillola>
        ) : undefined
      }
    >
      <FoglioScritto righe={righe} />
      <div className="nomi-fine">
        <p className="nomi-fine__valore u-tabnum">
          {valide === null ? 'Consegnata' : `${valide} ${valide === 1 ? 'valida' : 'valide'} su ${categorie.length}`}
        </p>
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
    </Scheda>
  )
}

/** La partita di ieri, contata stanotte: i punti di ogni risposta, e le piu' date da tutti. */
function Ieri({ ieri }: { ieri: RisultatoNomi }) {
  const lettera = ieri.lettera.toUpperCase()
  const piuDate = piuDateDi(ieri)
  return (
    <Scheda
      className="nomi-scheda"
      titolo={`Ieri, con la ${lettera}`}
      icona={<Lettera lettera={ieri.lettera} piccola />}
      destra={<Pillola tono="buona">{ieri.punti} punti</Pillola>}
    >
      <FoglioScritto righe={righeDiIeri(ieri)} />
      <p className="nomi-ieri__conto">
        {ieri.giocatori} {ieri.giocatori === 1 ? 'giocatore' : 'giocatori'} · consegnata in{' '}
        {formatCronometro(ieri.tempoMs)}
        {ieri.punti > 0 && ` · ${BASE_NOMI} per aver giocato`}
      </p>
      {piuDate.length > 0 && (
        <div className="nomi-ieri__piu">
          <p className="nomi-ieri__titolo">Le più date</p>
          <ul className="nomi-ieri__elenco">
            {piuDate.map(({ categoria, nome, risposte }) => (
              <li key={categoria} style={{ '--n': risposte.length } as CSSProperties}>
                <span className="nomi-ieri__categoria">{nome}</span>
                <span className="nomi-ieri__risposte">
                  {risposte.map((r) => (
                    <span key={r.testo} className="nomi-ieri__risposta">
                      {r.testo} <span className="u-tabnum">×{r.uguali}</span>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Scheda>
  )
}
