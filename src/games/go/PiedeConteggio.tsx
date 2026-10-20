import { Button } from '@/components/Button'
import type { Parte } from '@shared/tavolo'
import { contaPunti, punti } from './conteggio'
import './Goban.css'

interface Props {
  posizione: string
  /** Le pietre morte segnate; null mentre il telefono le stima. */
  morte: number[] | null
  mia: Parte
  /** Chi gioca contro: "Giada", "il computer". */
  altro: string
  /** Con un amico il conteggio si corregge toccando i gruppi; contro il computer no. */
  correggibile: boolean
  accettato?: 'io' | 'avversario' | null
  inviando?: boolean
  onAccetta: () => void
  onRiprendi: () => void
}

/**
 * Il piede del go a gioco fermo: i punti di ciascuno con le pietre morte di
 * adesso, chi e' avanti, e le due cose da fare — accettare il conteggio, o
 * riprendere a giocare per catturare quel che per te e' morto.
 */
export function PiedeConteggio({
  posizione,
  morte,
  mia,
  altro,
  correggibile,
  accettato = null,
  inviando = false,
  onAccetta,
  onRiprendi,
}: Props) {
  if (!morte) {
    return (
      <div className="gob-conto" aria-live="polite">
        <p className="gob-conto__titolo">Si conta…</p>
        <p className="gob-conto__nota">Il gioco cerca le pietre morte.</p>
      </div>
    )
  }
  const conto = contaPunti(posizione, morte)
  if (!conto) return null
  const mio = mia === 0 ? 'nero' : 'bianco'
  const scarto = Math.abs(conto.nero - conto.bianco)
  const avanti = conto.vincitore === mio ? 'Sei avanti' : `È avanti ${altro}`
  const Altro = altro.charAt(0).toUpperCase() + altro.slice(1)
  return (
    <div className="gob-conto" aria-live="polite">
      <p className="gob-conto__titolo">
        {avanti} di {punti(scarto)} {scarto === 1 ? 'punto' : 'punti'}
      </p>
      <p className="gob-conto__punti u-tabnum">
        <span>
          <span className="gob-conto__parte is-nero" aria-hidden="true" /> Nero <b>{punti(conto.nero)}</b>
        </span>
        <span>
          Bianco <b>{punti(conto.bianco)}</b> <span className="gob-conto__parte is-bianco" aria-hidden="true" />
        </span>
      </p>
      <p className="gob-conto__nota">
        {correggibile
          ? accettato === 'io'
            ? `Aspetto che ${altro} accetti.`
            : accettato === 'avversario'
              ? `${Altro} ha accettato. Tocca un gruppo per cambiarlo.`
              : 'Tocca un gruppo per segnarlo morto o vivo.'
          : 'Le pietre spente sono morte per il computer.'}
      </p>
      <div className="gob-conto__azioni">
        <Button variant="tinted" onClick={onRiprendi} disabled={inviando}>
          Riprendi
        </Button>
        <Button onClick={onAccetta} disabled={inviando || accettato === 'io'}>
          {correggibile ? 'Accetto' : 'Conferma'}
        </Button>
      </div>
    </div>
  )
}
