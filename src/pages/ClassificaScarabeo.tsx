import { useCallback, useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { ApiFetchError, api } from '@/lib/api'
import { formatNumber, pluralize } from '@/lib/format'
import type { LeaderboardScope, ScarabeoLeaderboard } from '@shared/types'

/**
 * La classifica dello Scarabeo.
 *
 * Tenuta separata da quella del Wordle, e non per comodita': i due punteggi non
 * sono commensurabili. Una giornata di Wordle vale al massimo 209 punti per
 * costruzione, una di Scarabeo qualche centinaio, e sommarli richiederebbe un
 * tasso di cambio inventato.
 *
 * Niente podio: qui il numero che conta e' uno — i punti — e le tre colonne del
 * podio del Wordle servono a far stare una divisione (partita e assist) che in
 * questo gioco non esiste.
 */
export function ClassificaScarabeo({ scope, meId }: { scope: LeaderboardScope; meId: string }) {
  const [dati, setDati] = useState<ScarabeoLeaderboard | null>(null)
  const [caricando, setCaricando] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  const carica = useCallback(async (quale: LeaderboardScope) => {
    setCaricando(true)
    setErrore(null)
    try {
      setDati(await api<ScarabeoLeaderboard>(`/leaderboard/scarabeo?scope=${quale}`))
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
            ? 'Nessuno ha ancora giocato a Scarabeo oggi. Puoi essere il primo.'
            : 'Ancora nessuna partita in questo periodo.'}
        </p>
      </div>
    )
  }

  const fuoriElenco = dati?.me && !righe.slice(0, 20).some((r) => r.playerId === meId) ? dati.me : null

  return (
    <>
      <ol className="lbs">
        {righe.slice(0, 20).map((row) => (
          <li className={`lbs__riga${row.playerId === meId ? ' is-me' : ''}`} key={row.playerId}>
            <span className="lbs__rank u-tabnum">{row.rank}º</span>
            <Avatar nickname={row.nickname} color={row.avatarColor} size={34} />
            <span className="lbs__chi">
              <span className="lbs__nome">
                {row.displayName}
                {row.playerId === meId && <span className="lb__you">tu</span>}
                {row.inCorso && <span className="lbs__incorso">in corso</span>}
              </span>
              {/*
                Nella vista di oggi la giornata migliore **e'** il totale, e
                ripeterlo non direbbe niente: la riga secondaria compare solo
                sui periodi piu' larghi, dove distingue chi ha un colpo grosso
                da chi ha molte giornate discrete.
              */}
              {scope !== 'today' && (
                <span className="lbs__sotto u-tabnum">
                  {row.giornate} {pluralize(row.giornate, 'giornata', 'giornate')} · giornata
                  migliore {formatNumber(row.migliore)}
                </span>
              )}
            </span>
            <span className="lbs__punti u-tabnum">{formatNumber(row.punti)}</span>
          </li>
        ))}
      </ol>

      {fuoriElenco && (
        <>
          <p className="lb__divider">La tua posizione</p>
          <ol className="lbs">
            <li className="lbs__riga is-me">
              <span className="lbs__rank u-tabnum">{fuoriElenco.rank}º</span>
              <Avatar
                nickname={fuoriElenco.nickname}
                color={fuoriElenco.avatarColor}
                size={34}
              />
              <span className="lbs__chi">
                <span className="lbs__nome">
                  {fuoriElenco.displayName}
                  <span className="lb__you">tu</span>
                </span>
                <span className="lbs__sotto u-tabnum">
                  {fuoriElenco.giornate} {pluralize(fuoriElenco.giornate, 'giornata', 'giornate')}
                </span>
              </span>
              <span className="lbs__punti u-tabnum">{formatNumber(fuoriElenco.punti)}</span>
            </li>
          </ol>
        </>
      )}
    </>
  )
}
