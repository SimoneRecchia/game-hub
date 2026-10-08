import { useState } from 'react'
import { Cursore } from '@/components/Cursore'
import { Sezione } from '@/components/Elementi'
import { Opzioni, Scelte } from '@/components/Opzioni'
import type { GiocoAlTavolo } from '@shared/tavolo'
import { TEMPI_MOSSA, TEMPO_DI_SEMPRE, nomeTempoMossa, tempoMossaValido } from '@shared/tavolo-tempi'

const chiave = (gioco: GiocoAlTavolo) => `giochi.${gioco}.tempo`

/**
 * Il tempo per mossa scelto l'ultima volta nella sala, in secondi (null senza
 * tempo); quello di sempre se non se n'e' scelto uno. Il profilo di un amico
 * legge la stessa chiave per mandare l'invito con questo tempo.
 */
export function leggiTempo(gioco: GiocoAlTavolo): number | null {
  try {
    const testo = localStorage.getItem(chiave(gioco))
    return testo === null ? TEMPO_DI_SEMPRE[gioco] : tempoMossaValido(gioco, JSON.parse(testo))
  } catch {
    return TEMPO_DI_SEMPRE[gioco]
  }
}

/** Il tempo per mossa della sala, ricordato per gioco. */
export function useTempoMossa(gioco: GiocoAlTavolo): [number | null, (s: number | null) => void] {
  const [tempo, setTempo] = useState(() => leggiTempo(gioco))
  return [
    tempo,
    (s) => {
      setTempo(s)
      try {
        localStorage.setItem(chiave(gioco), JSON.stringify(s))
      } catch {
        /* e' una comodita' */
      }
    },
  ]
}

/** La carta della partita nelle sale dei giochi al tavolo: il tempo per mossa, su un cursore come nel quiz. */
export function SceltaTempo({
  gioco,
  valore,
  onChange,
}: {
  gioco: GiocoAlTavolo
  valore: number | null
  onChange: (s: number | null) => void
}) {
  return (
    <Sezione titolo="Partita">
      <Opzioni>
        <Scelte titolo="Tempo per mossa" valore={valore === null ? 'Senza limite' : nomeTempoMossa(valore)}>
          <Cursore
            ariaLabel="Tempo per mossa"
            valori={TEMPI_MOSSA[gioco]}
            valore={valore}
            etichetta={nomeTempoMossa}
            voce={(s) => (s === null ? 'senza tempo' : nomeTempoMossa(s))}
            onChange={onChange}
          />
        </Scelte>
      </Opzioni>
    </Sezione>
  )
}
