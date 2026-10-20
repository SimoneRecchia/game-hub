import { useMemo, useState } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Coriandoli, useFesta, Vuoto } from '@/components/Elementi'
import { IconInfo, IconShuffle, IconTrophy } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { ComeSiGiocaAnagrammi } from '@/games/anagrammi/ComeSiGioca'
import { CartaFine, PartitaAnagrammi, rigaFine, titoloFine, type ComandiAnagrammi } from '@/games/anagrammi/Partita'
import { useAnagrammiDelGiorno } from '@/games/anagrammi/useAnagrammiDelGiorno'
import { useCountdown } from '@/games/wordle/useCountdown'
import { formatCountdown } from '@/lib/format'
import type { AnagrammiStato } from '@shared/types'

/**
 * Gli Anagrammi del giorno: cinque parole, le stesse per tutti, da cinque a
 * nove lettere. Il tempo lo tiene il server, e una parola vale di piu' quanto
 * prima la si trova.
 */
export default function Anagrammi() {
  const g = useAnagrammiDelGiorno()
  const [regole, setRegole] = useState(false)
  const s = g.stato
  const comandi: ComandiAnagrammi = useMemo(
    () => ({ apri: g.apri, prova: g.prova, aiuto: g.aiuto, passo: g.passo, scade: g.scade }),
    [g.apri, g.prova, g.aiuto, g.passo, g.scade],
  )
  const tutte = s !== null && s.status === 'done' && s.parole.every((p) => p.esito === 'trovata')
  const festa = useFesta(s ? s.status === 'playing' : null, tutte)

  return (
    <Pagina
      titolo={s ? `Anagrammi #${s.puzzleNumber}` : 'Anagrammi'}
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
          titolo="Gli anagrammi non si sono aperti"
          testo={g.errore}
          azione={
            <Button variant="tinted" onClick={g.ricarica}>
              Riprova
            </Button>
          }
        />
      ) : g.assente ? (
        <Vuoto titolo="Non ancora pronti" testo="Le parole di oggi arrivano fra poco." />
      ) : !s ? (
        <div className="ana-attesa" aria-hidden="true" />
      ) : (
        <PartitaAnagrammi
          vista={{
            parole: s.parole,
            corrente: s.corrente,
            scadenza: g.scadenza,
            scaduta: g.scaduta,
            tempoParolaMs: s.tempoParolaMs,
            occupato: g.occupato,
            finita: s.status === 'done',
          }}
          comandi={comandi}
          fine={<FineGiornata stato={s} />}
        />
      )}
      <ComeSiGiocaAnagrammi open={regole} onClose={() => setRegole(false)} />
      {festa && <Coriandoli />}
    </Pagina>
  )
}

/** La giornata finita: i punti, le parole, e quando arriva la prossima. */
function FineGiornata({ stato }: { stato: AnagrammiStato }) {
  const restano = useCountdown(stato.msToNextPuzzle)
  return (
    <CartaFine
      titolo={titoloFine(stato.parole)}
      riga={rigaFine(stato.parole)}
      parole={stato.parole}
      punti={`+${stato.punti}`}
    >
      <Collegamento to={ROTTE.home} direzione="indietro" className="ana-tasto ana-tasto--giallo">
        Torna alle Giornaliere
      </Collegamento>
      <div className="ana-azioni">
        <Collegamento to={ROTTE.classifica('anagrammi')} className="ana-link">
          <IconTrophy size={18} />
          Classifica
        </Collegamento>
        <Collegamento to={ROTTE.libera('anagrammi')} className="ana-link">
          <IconShuffle size={18} />
          Parole a caso
        </Collegamento>
      </div>
      <p className="ana-piede">
        Le prossime fra <span className="u-tabnum">{formatCountdown(restano)}</span>
      </p>
    </CartaFine>
  )
}
