import { frecceDelGruppo } from '@/lib/gruppo'
import './SegmentedControl.css'

interface Option<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
}

/**
 * Una scelta fra poche voci, come il controllo segmentato di iOS. Per chi non
 * vede e' un gruppo di scelte (radio group): una sola, e le frecce passano
 * dall'una all'altra.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: Props<T>) {
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )

  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel} onKeyDown={frecceDelGruppo}>
      {/* Il "pillolo" scorre invece di apparire: è il tell visivo di iOS. */}
      <span
        className="segmented__thumb"
        aria-hidden="true"
        style={{
          width: `calc((100% - 6px) / ${options.length})`,
          transform: `translateX(calc(${activeIndex} * 100%))`,
        }}
      />
      {options.map((option, i) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={i === activeIndex}
          tabIndex={i === activeIndex ? 0 : -1}
          className={`segmented__item${i === activeIndex ? ' is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
