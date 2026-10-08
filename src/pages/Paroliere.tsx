import { useState } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta, Vuoto } from '@/components/Elementi'
import { IconInfo, IconShuffle, IconTrophy } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaParoliere } from '@/games/paroliere/ComeSiGioca'
import { PartitaParoliere } from '@/games/paroliere/Partita'
import { useParoliereDelGiorno } from '@/games/paroliere/useParoliereDelGiorno'
import { useCountdown } from '@/games/wordle/useCountdown'
import { formatCountdown } from '@/lib/format'
import { MASSIMO_PAROLIERE } from '@shared/paroliere'
import type { ParoliereStato } from '@shared/types'

/**
 * Il Paroliere del giorno: sedici dadi, gli stessi per tutti, e tre minuti per
 * trovarci piu' parole che si puo'. La griglia si vede da quando si gira la
 * clessidra.
 */
export default function Paroliere() {
  const g = useParoliereDelGiorno()
  const [regole, setRegole] = useState(false)
  const s = g.stato
  // La festa e' per chi arriva al traguardo, dopo il timbro.
  const festa = useFesta(s ? s.status === 'playing' : null, s?.status === 'done' && s.punti >= MASSIMO_PAROLIERE, 1_900)

  return (
    <Pagina
      titolo={s ? `Paroliere #${s.puzzleNumber}` : 'Paroliere'}
      intera
      indietro={{ a: ROTTE.home, etichetta: 'Giornaliere' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      {g.errore && !s ? (
        <Vuoto
          titolo="Il Paroliere non si è aperto"
          testo={g.errore}
          azione={
            <Button variant="tinted" onClick={g.ricarica}>
              Riprova
            </Button>
          }
        />
      ) : g.assente ? (
        <Vuoto titolo="Non ancora pronto" testo="La griglia di oggi arriva fra poco." />
      ) : !s || !g.vista ? (
        <div className="par-attesa" aria-hidden="true" />
      ) : (
        <PartitaParoliere vista={g.vista} comandi={g.comandi} fine={<FineGiornata stato={s} />} />
      )}
      <ComeSiGiocaParoliere open={regole} onClose={() => setRegole(false)} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** La partita finita: i punti in classifica, e quando arriva la prossima griglia. */
function FineGiornata({ stato }: { stato: ParoliereStato }) {
  const restano = useCountdown(stato.msToNextPuzzle)
  return (
    <>
      <div className="par-totale">
        <p className="par-totale__valore u-tabnum">{stato.punti} punti</p>
        <p className="par-totale__dettaglio u-tabnum">
          {stato.punteggio >= stato.traguardo
            ? 'Traguardo raggiunto'
            : `${stato.punteggio} sulla griglia, il traguardo era ${stato.traguardo}`}
        </p>
      </div>
      <div className="par-azioni">
        <Collegamento to={ROTTE.classifica('paroliere')} className="par-link">
          <IconTrophy size={18} />
          Classifica
        </Collegamento>
        <Collegamento to={ROTTE.libera('paroliere')} className="par-link">
          <IconShuffle size={18} />
          Una griglia a caso
        </Collegamento>
      </div>
      <p className="par-piede-fine">
        La prossima fra <span className="u-tabnum">{formatCountdown(restano)}</span>
      </p>
    </>
  )
}
