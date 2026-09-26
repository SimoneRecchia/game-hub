import { useCallback, useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { ApiFetchError, api } from '@/lib/api'
import { pluralize } from '@/lib/format'
import type { BattagliaLeaderboard, BattagliaRow, LeaderboardScope } from '@shared/types'

/**
 * La classifica della battaglia navale: vittorie, poi meno sconfitte.
 *
 * Non la percentuale: con due partite in tutto un cento per cento vale meno di
 * sette vittorie su dieci, e la classifica premierebbe chi gioca poco.
 */
export function ClassificaBattaglia({ scope, meId }: { scope: LeaderboardScope; meId: string }) {
  const [dati, setDati] = useState<BattagliaLeaderboard | null>(null)
  const [caricando, setCaricando] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  const carica = useCallback(async (quale: LeaderboardScope) => {
    setCaricando(true)
    setErrore(null)
    try {
      setDati(await api<BattagliaLeaderboard>(`/leaderboard/battaglia?scope=${quale}`))
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
            ? 'Nessuna battaglia finita oggi. Sfida un collega dalla sala.'
            : 'Ancora nessuna battaglia finita in questo periodo.'}
        </p>
      </div>
    )
  }

  const fuoriElenco = dati?.me && !righe.slice(0, 20).some((r) => r.playerId === meId) ? dati.me : null
  return (
    <>
      <ol className="lbs">
        {righe.slice(0, 20).map((row) => (
          <Riga key={row.playerId} row={row} io={row.playerId === meId} />
        ))}
      </ol>
      {fuoriElenco && (
        <>
          <p className="lb__divider">La tua posizione</p>
          <ol className="lbs">
            <Riga row={fuoriElenco} io />
          </ol>
        </>
      )}
    </>
  )
}

function Riga({ row, io }: { row: BattagliaRow; io: boolean }) {
  return (
    <li className={`lbs__riga${io ? ' is-me' : ''}`}>
      <span className="lbs__rank u-tabnum">{row.rank}º</span>
      <Avatar nickname={row.nickname} color={row.avatarColor} size={34} />
      <span className="lbs__chi">
        <span className="lbs__nome">
          {row.displayName}
          {io && <span className="lb__you">tu</span>}
        </span>
        <span className="lbs__sotto u-tabnum">
          {row.perse} {pluralize(row.perse, 'sconfitta', 'sconfitte')}
        </span>
      </span>
      <span className="lbs__punti u-tabnum">
        {row.vinte} {pluralize(row.vinte, 'vinta', 'vinte')}
      </span>
    </li>
  )
}
