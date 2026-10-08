import { useState } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta, Vuoto } from '@/components/Elementi'
import { IconInfo, IconShuffle, IconTrophy } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaGhigliottina } from '@/games/ghigliottina/ComeSiGioca'
import { PartitaGhigliottina } from '@/games/ghigliottina/Partita'
import { useGhigliottinaDelGiorno } from '@/games/ghigliottina/useGhigliottinaDelGiorno'
import { useCountdown } from '@/games/wordle/useCountdown'
import { formatCountdown } from '@/lib/format'
import type { GhigliottinaStato } from '@shared/types'

/**
 * La Ghigliottina del giorno: cinque coppie di parole, le stesse per tutti, e
 * un minuto per la parola che le lega. Il montepremi si dimezza a ogni scelta
 * sbagliata.
 */
export default function Ghigliottina() {
  const g = useGhigliottinaDelGiorno()
  const [regole, setRegole] = useState(false)
  const s = g.stato
  // La festa aspetta il verdetto: le lettere della parola vincente si girano, poi i coriandoli.
  const festa = useFesta(s ? s.status === 'playing' : null, s?.indovinata === true, 4_300)

  return (
    <Pagina
      titolo={s ? `Ghigliottina #${s.puzzleNumber}` : 'Ghigliottina'}
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
          titolo="La Ghigliottina non si è aperta"
          testo={g.errore}
          azione={
            <Button variant="tinted" onClick={g.ricarica}>
              Riprova
            </Button>
          }
        />
      ) : g.assente ? (
        <Vuoto titolo="Non ancora pronta" testo="La Ghigliottina di oggi arriva fra poco." />
      ) : !s || !g.vista ? (
        <div className="ghi-attesa" aria-hidden="true" />
      ) : (
        <PartitaGhigliottina vista={g.vista} comandi={g.comandi} fine={<FineGiornata stato={s} />} />
      )}
      <ComeSiGiocaGhigliottina open={regole} onClose={() => setRegole(false)} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** La partita finita: i punti, e quando arriva la prossima. */
function FineGiornata({ stato }: { stato: GhigliottinaStato }) {
  const restano = useCountdown(stato.msToNextPuzzle)
  const sbagliate = stato.coppie.filter((c) => c.scelta !== null && c.scelta !== c.giusta).length
  return (
    <>
      <div className="ghi-totale">
        <p className="ghi-totale__valore u-tabnum">{stato.punti} punti</p>
        <p className="ghi-totale__dettaglio">
          {sbagliate === 0 ? 'Nessuna scelta sbagliata' : sbagliate === 1 ? 'Una scelta sbagliata' : `${sbagliate} scelte sbagliate`}
          {stato.indovinata ? '' : ' · parola vincente non indovinata'}
        </p>
      </div>
      <div className="ghi-azioni">
        <Collegamento to={ROTTE.classifica('ghigliottina')} className="ghi-link">
          <IconTrophy size={18} />
          Classifica
        </Collegamento>
        <Collegamento to={ROTTE.libera('ghigliottina')} className="ghi-link">
          <IconShuffle size={18} />
          Un’altra, a caso
        </Collegamento>
      </div>
      <p className="ghi-piede">
        La prossima fra <span className="u-tabnum">{formatCountdown(restano)}</span>
      </p>
    </>
  )
}
