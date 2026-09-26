import { useCallback, useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { ApiFetchError, api } from '@/lib/api'
import { formatCronometro, formatNumber, pluralize } from '@/lib/format'
import type { CruciverbaLeaderboard, CruciverbaRow, LeaderboardScope } from '@shared/types'

/**
 * La classifica del cruciverba.
 *
 * Separata dalle altre per la stessa ragione di quella dello Scarabeo: i punti
 * non sono commensurabili. Qui contano solo i cruciverba completati, e a parità
 * di punti passa avanti chi ci ha messo meno — il tempo e' lo spareggio, non
 * una parte del punteggio.
 */
export function ClassificaCruciverba({ scope, meId }: { scope: LeaderboardScope; meId: string }) {
  const [dati, setDati] = useState<CruciverbaLeaderboard | null>(null)
  const [caricando, setCaricando] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  const carica = useCallback(async (quale: LeaderboardScope) => {
    setCaricando(true)
    setErrore(null)
    try {
      setDati(await api<CruciverbaLeaderboard>(`/leaderboard/cruciverba?scope=${quale}`))
    } catch (err) {
      setErrore(err instanceof ApiFetchError ? err.message : 'Non riesco a caricare la classifica.')
    } finally {
      setCaricando(false)
    }
  }, [])

  useEffect(() => {
    void carica(scope)
  }, [carica, scope])

  if (errore) {
    return (
      <div className="lb__fallback">
        <p>{errore}</p>
        <Button variant="tinted" onClick={() => void carica(scope)}>
          Riprova
        </Button>
      </div>
    )
  }

  if (caricando && !dati) {
    return (
      <ul className="lb__skeleton" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} />
        ))}
      </ul>
    )
  }

  const righe = dati?.rows ?? []
  if (righe.length === 0) {
    return (
      <div className="lb__fallback">
        <p>
          {scope === 'today'
            ? 'Nessuno ha ancora finito il cruciverba di oggi. Puoi essere il primo.'
            : 'Ancora nessun cruciverba completato in questo periodo.'}
        </p>
      </div>
    )
  }

  const fuoriElenco = dati?.me && !righe.slice(0, 20).some((r) => r.playerId === meId) ? dati.me : null

  return (
    <>
      <ol className="lbs">
        {righe.slice(0, 20).map((row) => (
          <Riga key={row.playerId} row={row} io={row.playerId === meId} scope={scope} />
        ))}
      </ol>
      {fuoriElenco && (
        <>
          <p className="lb__divider">La tua posizione</p>
          <ol className="lbs">
            <Riga row={fuoriElenco} io scope={scope} />
          </ol>
        </>
      )}
    </>
  )
}

function Riga({ row, io, scope }: { row: CruciverbaRow; io: boolean; scope: LeaderboardScope }) {
  return (
    <li className={`lbs__riga${io ? ' is-me' : ''}`}>
      <span className="lbs__rank u-tabnum">{row.rank}º</span>
      <Avatar nickname={row.nickname} color={row.avatarColor} size={34} />
      <span className="lbs__chi">
        <span className="lbs__nome">
          {row.displayName}
          {io && <span className="lb__you">tu</span>}
          {row.inCorso && <span className="lbs__incorso">in corso</span>}
        </span>
        {row.giornate > 0 && (
          <span className="lbs__sotto u-tabnum">
            {scope === 'today'
              ? `in ${formatCronometro(row.tempoMs)}`
              : `${row.giornate} ${pluralize(row.giornate, 'completato', 'completati')} · ${formatCronometro(row.tempoMs)}`}
          </span>
        )}
      </span>
      <span className="lbs__punti u-tabnum">{formatNumber(row.punti)}</span>
    </li>
  )
}
