import { useState } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta, Vuoto } from '@/components/Elementi'
import { IconInfo, IconShuffle, IconTrophy } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaCatena } from '@/games/catena/ComeSiGioca'
import { PartitaCatena } from '@/games/catena/Partita'
import { useCatenaDelGiorno } from '@/games/catena/useCatenaDelGiorno'
import { useCountdown } from '@/games/wordle/useCountdown'
import { formatCountdown } from '@/lib/format'
import type { CatenaStato } from '@shared/types'

/**
 * La Catena del giorno: undici parole, le stesse per tutti, cinque da
 * indovinare e l'ultima che decide. Ogni errore toglie qualcosa al montepremi.
 */
export default function Catena() {
  const g = useCatenaDelGiorno()
  const [regole, setRegole] = useState(false)
  const s = g.stato
  // La festa aspetta il verdetto: le lettere della parola finale si girano, poi i coriandoli.
  const festa = useFesta(s ? s.status === 'playing' : null, s?.indovinata === true, 2_600)

  return (
    <Pagina
      titolo={s ? `Catena #${s.puzzleNumber}` : 'Catena'}
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
          titolo="La Catena non si è aperta"
          testo={g.errore}
          azione={
            <Button variant="tinted" onClick={g.ricarica}>
              Riprova
            </Button>
          }
        />
      ) : g.assente ? (
        <Vuoto titolo="Non ancora pronta" testo="La Catena di oggi arriva fra poco." />
      ) : !s || !g.vista ? (
        <div className="cat-attesa" aria-hidden="true" />
      ) : (
        <PartitaCatena vista={g.vista} comandi={g.comandi} fine={<FineGiornata stato={s} />} />
      )}
      <ComeSiGiocaCatena open={regole} onClose={() => setRegole(false)} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** La partita finita: com'e' andata, dove andare, e quando arriva la prossima. */
function FineGiornata({ stato }: { stato: CatenaStato }) {
  const restano = useCountdown(stato.msToNextPuzzle)
  const errori = stato.voci.reduce((n, v) => n + v.errori, 0)
  return (
    <>
      <p className="cat-fine__nota">
        {errori === 0 ? 'Nessun errore' : errori === 1 ? 'Un errore' : `${errori} errori`}
        {stato.jollyRestanti < 2 ? ` · ${2 - stato.jollyRestanti === 1 ? 'un jolly' : 'due jolly'}` : ''}
        {' · '}la prossima fra <span className="u-tabnum">{formatCountdown(restano)}</span>
      </p>
      <div className="cat-fine__bottoni">
        <Collegamento to={ROTTE.classifica('catena')} className="cat-fine__bottone">
          <IconTrophy size={18} />
          Classifica
        </Collegamento>
        <Collegamento to={ROTTE.libera('catena')} className="cat-fine__bottone is-menta">
          <IconShuffle size={18} />
          Un’altra
        </Collegamento>
      </div>
      <Collegamento to={ROTTE.home} className="cat-fine__bottone is-giallo">
        Torna alle Giornaliere
      </Collegamento>
    </>
  )
}
