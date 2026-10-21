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
      titolo="Ghigliottina"
      sotto={s ? `N° ${s.puzzleNumber} · la ghigliottina di oggi` : 'La ghigliottina di oggi'}
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

/** La partita finita: com'e' andata, dove andare, e quando arriva la prossima. */
function FineGiornata({ stato }: { stato: GhigliottinaStato }) {
  const restano = useCountdown(stato.msToNextPuzzle)
  const sbagliate = stato.coppie.filter((c) => c.scelta !== null && c.scelta !== c.giusta).length
  return (
    <>
      <p className="ghi-fine__nota">
        {sbagliate === 0 ? 'Nessuna coppia sbagliata' : sbagliate === 1 ? 'Una coppia sbagliata' : `${sbagliate} coppie sbagliate`}
        {' · '}la prossima fra <span className="u-tabnum">{formatCountdown(restano)}</span>
      </p>
      <div className="ghi-fine__bottoni">
        <Collegamento to={ROTTE.classifica('ghigliottina')} className="ghi-fine__bottone">
          <IconTrophy size={18} />
          Classifica
        </Collegamento>
        <Collegamento to={ROTTE.libera('ghigliottina')} className="ghi-fine__bottone is-menta">
          <IconShuffle size={18} />
          Un’altra
        </Collegamento>
      </div>
      <Collegamento to={ROTTE.home} className="ghi-fine__bottone is-giallo">
        Torna alle Giornaliere
      </Collegamento>
    </>
  )
}
