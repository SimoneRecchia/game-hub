import { useEffect, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Sheet } from '@/components/Sheet'
import { ThemeButton } from '@/components/ThemeButton'
import { IconLogout } from '@/components/Icons'
import { StatsPanel } from '@/games/wordle/StatsPanel'
import { useAuth, usePlayer } from '@/lib/auth'
import { api } from '@/lib/api'
import { formatGameDate } from '@/lib/format'
import type { PlayerStats } from '@shared/types'
import './Profilo.css'

export default function Profilo() {
  const player = usePlayer()
  const { logout } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState<PlayerStats | null>(null)

  useEffect(() => {
    let cancelled = false
    void api<PlayerStats>('/wordle/stats')
      .then((fresh) => {
        if (!cancelled) setStats(fresh)
      })
      .catch(() => {
        /* le statistiche sono un contorno: il profilo resta utilizzabile */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <AppShell title="Profilo" trailing={<ThemeButton />}>
      <header className="profilo__head">
        <Avatar nickname={player.nickname} color={player.avatarColor} size={88} />
        <h2 className="profilo__name">{player.displayName}</h2>
        <p className="profilo__since">
          Nel gruppo dal {formatGameDate(player.createdAt.slice(0, 10))}
        </p>
      </header>

      <Card sectionTitle="Wordle">
        {stats === null ? (
          <p className="profilo__loading">Carico le statistiche…</p>
        ) : stats.played === 0 ? (
          <p className="profilo__loading">
            Nessuna partita, per ora. La prima parola ti aspetta nell'hub.
          </p>
        ) : (
          <StatsPanel stats={stats} />
        )}
      </Card>

      <Card
        sectionTitle="Account"
        padded={false}
        footnote="Il browser resta collegato per un anno: non serve rifare l'accesso a ogni visita."
      >
        <div className="card-row">
          <span className="card-row__body">
            <span className="card-row__title">Nickname</span>
          </span>
          <span className="card-row__value">{player.nickname}</span>
        </div>
        <button type="button" className="card-row profilo__logout" onClick={() => setConfirming(true)}>
          <IconLogout size={20} />
          <span className="card-row__body">
            <span className="card-row__title">Esci</span>
          </span>
        </button>
      </Card>

      <Sheet open={confirming} onClose={() => setConfirming(false)} title="Vuoi uscire?">
        <p className="profilo__sheet-text">
          I punteggi restano salvati. Per rientrare ti servono nickname e password.
        </p>
        <Button
          variant="destructive"
          size="lg"
          fullWidth
          loading={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await logout()
            } finally {
              setBusy(false)
              setConfirming(false)
            }
          }}
        >
          Esci
        </Button>
        <Button variant="plain" size="lg" fullWidth onClick={() => setConfirming(false)}>
          Annulla
        </Button>
      </Sheet>
    </AppShell>
  )
}
