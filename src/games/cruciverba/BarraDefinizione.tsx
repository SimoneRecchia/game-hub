import { IconChevronLeft, IconChevronRight } from '@/components/Icons'
import { pluralize } from '@/lib/format'
import type { DefinizioneCruciverba } from '@shared/types'

const NOMI_DIREZIONE = { o: 'orizzontale', v: 'verticale' } as const

/**
 * La definizione su cui si scrive, sopra la tastiera, fra le due frecce: tocca
 * e si aprono tutte. Ha sempre la stessa altezza — una definizione corta non
 * deve far saltare la tastiera, e una lunga non deve spingerla fuori — e a ogni
 * definizione nuova il testo sale al suo posto.
 */
export function BarraDefinizione({
  definizione,
  onPrecedente,
  onSuccessiva,
  onElenco,
}: {
  definizione: DefinizioneCruciverba
  onPrecedente: () => void
  onSuccessiva: () => void
  onElenco: () => void
}) {
  const lettere = definizione.caselle.length
  return (
    <div className="cbarra">
      <button type="button" className="cbarra__freccia" onClick={onPrecedente} aria-label="Definizione precedente">
        <IconChevronLeft size={22} />
      </button>
      <button type="button" className="cbarra__testo" onClick={onElenco} aria-label="Tutte le definizioni">
        <span key={definizione.chiave} className="cbarra__dentro">
          {/* La nota ("sigla", "plurale") sta accanto a dove: in fondo alla definizione la tagliava il clamp. */}
          <span className="cbarra__dove">
            <span className="cbarra__dove-testo">
              {definizione.numero} {NOMI_DIREZIONE[definizione.direzione]} · {lettere}{' '}
              {pluralize(lettere, 'lettera', 'lettere')}
            </span>
            {definizione.nota && <span className="cbarra__nota">{definizione.nota}</span>}
          </span>
          <span className="cbarra__definizione">{definizione.testo}</span>
        </span>
      </button>
      <button type="button" className="cbarra__freccia" onClick={onSuccessiva} aria-label="Definizione successiva">
        <IconChevronRight size={22} />
      </button>
    </div>
  )
}
