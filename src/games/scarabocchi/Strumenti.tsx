import type { CSSProperties } from 'react'
import { IconAnnulla, IconCestino } from '@/components/Icons'
import { COLORE_GOMMA, COLORI_SCARABOCCHI, SPESSORI_SCARABOCCHI } from '@shared/scarabocchi'
import type { Strumento } from './Lavagna'

const NOMI_COLORI = [
  'Nero',
  'Grigio',
  'Bianco',
  'Rosso',
  'Arancione',
  'Giallo',
  'Verde',
  'Verde scuro',
  'Azzurro',
  'Blu',
  'Viola',
  'Rosa',
  'Marrone',
  'Rosa pelle',
]

const NOMI_SPESSORI = ['Sottile', 'Medio', 'Grosso', 'Grossissimo']

/**
 * Gli attrezzi di chi disegna: i colori, gli spessori, la gomma, annulla e
 * pulisci. I colori sono bottoni con il loro nome, e quello scelto lo dice
 * `aria-pressed`; la gomma e' il bianco, con il suo tasto.
 */
export function Strumenti({
  strumento,
  onCambia,
  onAnnulla,
  onPulisci,
  disabilitati = false,
}: {
  strumento: Strumento
  onCambia: (s: Strumento) => void
  onAnnulla: () => void
  onPulisci: () => void
  disabilitati?: boolean
}) {
  const gomma = strumento.colore === COLORE_GOMMA
  return (
    <div className="scr-strumenti" role="toolbar" aria-label="Attrezzi">
      <div className="scr-strumenti__colori">
        {COLORI_SCARABOCCHI.map((colore, i) =>
          i === COLORE_GOMMA ? null : (
            <button
              key={colore}
              type="button"
              className="scr-colore"
              style={{ '--colore': colore } as CSSProperties}
              aria-label={NOMI_COLORI[i]}
              aria-pressed={strumento.colore === i}
              disabled={disabilitati}
              onClick={() => onCambia({ ...strumento, colore: i })}
            />
          ),
        )}
      </div>
      <div className="scr-strumenti__riga">
        <div className="scr-strumenti__spessori">
          {SPESSORI_SCARABOCCHI.map((s, i) => (
            <button
              key={s}
              type="button"
              className="scr-spessore"
              style={{ '--punta': `${Math.max(4, Math.min(26, s / 2.2))}px` } as CSSProperties}
              aria-label={NOMI_SPESSORI[i]}
              aria-pressed={strumento.spessore === i}
              disabled={disabilitati}
              onClick={() => onCambia({ ...strumento, spessore: i })}
            />
          ))}
        </div>
        <button
          type="button"
          className="scr-attrezzo"
          aria-pressed={gomma}
          disabled={disabilitati}
          onClick={() => onCambia({ ...strumento, colore: gomma ? 0 : COLORE_GOMMA })}
        >
          <IconaGomma />
          <span className="u-visually-hidden">Gomma</span>
        </button>
        <button type="button" className="scr-attrezzo" onClick={onAnnulla} disabled={disabilitati}>
          <IconAnnulla size={20} />
          <span className="u-visually-hidden">Annulla</span>
        </button>
        <button type="button" className="scr-attrezzo" onClick={onPulisci} disabled={disabilitati}>
          <IconCestino size={20} />
          <span className="u-visually-hidden">Pulisci</span>
        </button>
      </div>
    </div>
  )
}

function IconaGomma() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15.2 4.4a2 2 0 0 1 2.8 0l2.6 2.6a2 2 0 0 1 0 2.8L11.4 19H7.2l-3.8-3.8a2 2 0 0 1 0-2.8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 9.8 14.6 15.4M11.4 19H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
