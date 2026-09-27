import { useState } from 'react'
import { IconChevronLeft, IconChevronRight } from '@/components/Icons'
import { SegmentedControl } from '@/components/SegmentedControl'
import { nomeDelPeriodo } from '@/games/classifiche'
import { gameDate, puzzleNumberFor } from '@shared/daily'
import { periodoDi } from '@shared/periodi'
import type { LeaderboardScope } from '@shared/types'

const SCELTE: { value: LeaderboardScope; label: string }[] = [
  { value: 'today', label: 'Giorno' },
  { value: 'week', label: 'Settimana' },
  { value: 'month', label: 'Mese' },
  { value: 'all', label: 'Sempre' },
]

const PASSO: Record<LeaderboardScope, [string, string]> = {
  today: ['Il giorno prima', 'Il giorno dopo'],
  week: ['La settimana prima', 'La settimana dopo'],
  month: ['Il mese prima', 'Il mese dopo'],
  all: ['', ''],
}

export function scopeDa(valore: string | null): LeaderboardScope {
  return SCELTE.find((s) => s.value === valore)?.value ?? 'today'
}

export function indietroDa(valore: string | null): number {
  const n = Number(valore)
  return Number.isInteger(n) && n > 0 ? n : 0
}

/** Il numero di oggi, dal calendario del gioco: lo stesso conto che fa il server. */
export function numeroDiOggi(): number {
  return puzzleNumberFor(gameDate())
}

/**
 * Quale periodo: giorno, settimana, mese o sempre, e sotto il suo nome fra due
 * frecce che vanno a quello prima e a quello dopo — "La settimana scorsa,
 * 14–20 settembre". Per "sempre" il nome resta e le frecce no: la riga tiene la
 * sua altezza, e la classifica sotto non salta cambiando periodo.
 */
export function SceltaPeriodo({
  scope,
  indietro,
  onCambia,
}: {
  scope: LeaderboardScope
  indietro: number
  onCambia: (scope: LeaderboardScope, indietro: number) => void
}) {
  const oggi = numeroDiOggi()
  const periodo = periodoDi(scope, oggi, indietro)
  const nome = nomeDelPeriodo(periodo, oggi)
  const [prima, dopo] = PASSO[scope]
  const frecce = scope !== 'all'
  // Da che parte si e' andati: il nome nuovo entra da quella.
  const [verso, setVerso] = useState<'prima' | 'dopo' | null>(null)
  const vai = (nuovo: number) => {
    setVerso(nuovo > periodo.indietro ? 'prima' : 'dopo')
    onCambia(scope, nuovo)
  }

  return (
    <div className="cl-periodo">
      <SegmentedControl
        ariaLabel="Periodo"
        options={SCELTE}
        value={scope}
        onChange={(s) => {
          setVerso(null)
          onCambia(s, 0)
        }}
      />
      <div className="cl-periodo__passo">
        <button
          type="button"
          className="cl-periodo__freccia"
          aria-label={prima}
          hidden={!frecce}
          disabled={periodo.indietro >= periodo.massimo}
          onClick={() => vai(periodo.indietro + 1)}
        >
          <IconChevronLeft size={20} />
        </button>
        <p
          key={`${scope}-${periodo.indietro}`}
          className={`cl-periodo__nome${verso ? ` cl-periodo__nome--${verso}` : ''}`}
          aria-live="polite"
        >
          <span className="cl-periodo__titolo">{nome.titolo}</span>
          {nome.sotto && <span className="cl-periodo__sotto">{nome.sotto}</span>}
        </p>
        <button
          type="button"
          className="cl-periodo__freccia"
          aria-label={dopo}
          hidden={!frecce}
          disabled={periodo.indietro === 0}
          onClick={() => vai(periodo.indietro - 1)}
        >
          <IconChevronRight size={20} />
        </button>
      </div>
    </div>
  )
}
