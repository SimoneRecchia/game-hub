import { IconCheck, IconClock, IconClose } from '@/components/Icons'
import type { PartitaTris } from '@shared/types'

const ESITI = { vinta: 'vinta', patta: 'patta', persa: 'persa' } as const

/**
 * La serie del giorno in una fila: una tessera per partita, con com'e'
 * finita. Una partita finita si tocca per rivederne la griglia; quella in
 * corso pulsa.
 */
export function SerieTris({
  partite,
  totale,
  scelta,
  onScegli,
}: {
  partite: readonly PartitaTris[]
  totale: number
  /** La partita che si guarda sulla griglia. */
  scelta: number | null
  onScegli: (k: number) => void
}) {
  return (
    <ol className="tris-serie" aria-label="Le partite di oggi">
      {Array.from({ length: totale }, (_, k) => {
        const p = partite[k]
        const stato = !p ? 'da-giocare' : p.esito === null ? 'in-corso' : p.esito
        const nome = `Partita ${k + 1}: ${!p ? 'da giocare' : p.esito === null ? 'in corso' : ESITI[p.esito]}${
          p?.tempo ? ', tempo scaduto' : ''
        }`
        return (
          <li key={k}>
            <button
              type="button"
              className={`tris-serie__tessera is-${stato}${scelta === k ? ' is-scelta' : ''}`}
              aria-label={nome}
              aria-pressed={p?.esito ? scelta === k : undefined}
              disabled={!p || p.esito === null}
              onClick={() => onScegli(k)}
            >
              {p?.esito === 'vinta' ? (
                <IconCheck size={16} />
              ) : p?.esito === 'persa' ? (
                p.tempo ? (
                  <IconClock size={15} />
                ) : (
                  <IconClose size={14} />
                )
              ) : p?.esito === 'patta' ? (
                <span className="tris-serie__uguale" aria-hidden="true">
                  =
                </span>
              ) : (
                <span className="tris-serie__numero u-tabnum" aria-hidden="true">
                  {k + 1}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ol>
  )
}
