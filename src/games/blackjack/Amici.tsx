import { useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { useToast } from '@/components/Toast'
import { ApiFetchError, api } from '@/lib/api'
import { dimentica } from '@/lib/dati'
import type { TavoloInSala } from '@shared/types'
import './Amici.css'

/**
 * I tavoli degli amici online, al blackjack o alla roulette: chi c'e', e
 * "Siediti", che ti porta al loro tavolo.
 */
export function TavoliDegliAmici({
  tavoli,
  onCambio,
  gioco = 'blackjack',
}: {
  tavoli: readonly TavoloInSala[]
  onCambio?: () => void
  gioco?: 'blackjack' | 'roulette'
}) {
  const { vai } = useNavigazione()
  const toast = useToast()
  const [inCorso, setInCorso] = useState<string | null>(null)
  const siedi = async (id: string) => {
    if (inCorso) return
    setInCorso(id)
    try {
      await api<unknown>(`/${gioco}/tavolo/${id}/siedi`, { method: 'POST', body: {} })
      dimentica('/fortuna')
      vai(gioco === 'roulette' ? ROTTE.tavoloRL(id) : ROTTE.tavoloBJ(id))
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'Non riesco a sederti: riprova.', 'error')
      onCambio?.()
    } finally {
      setInCorso(null)
    }
  }
  return (
    <ul className="fortuna-tavoli">
      {tavoli.map((t) => (
        <li key={t.id} className="fortuna-tavolo">
          <span className="fortuna-tavolo__volti" aria-hidden="true">
            {t.giocatori.slice(0, 4).map((g) => (
              <Avatar key={g.playerId} nickname={g.nickname} color={g.avatarColor} size={34} />
            ))}
          </span>
          <span className="fortuna-tavolo__testo">
            <span className="fortuna-tavolo__chi">{t.giocatori.map((g) => g.displayName).join(', ')}</span>
            <span className="fortuna-tavolo__posti">
              {t.liberi === 0 ? 'Pieno' : t.liberi === 1 ? '1 posto libero' : `${t.liberi} posti liberi`}
            </span>
          </span>
          <button
            type="button"
            className="fortuna-tavolo__siedi"
            disabled={t.liberi === 0 || inCorso !== null}
            onClick={() => void siedi(t.id)}
          >
            Siediti
          </button>
        </li>
      ))}
    </ul>
  )
}
