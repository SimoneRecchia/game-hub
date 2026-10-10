import { useMemo, useState } from 'react'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Avatar } from '@/components/Avatar'
import { IconChevronRight } from '@/components/Icons'
import { useDati } from '@/lib/dati'
import { DOVE } from '@/lib/presenza'
import type { AmiciRisposta } from '@shared/types'
import './Persone.css'

/** Il nome senza accenti e in minuscolo: "Niccolò" si trova scrivendo "nicco". */
const piano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Tutte le persone del gruppo, in un foglio: chi e' online per primo, e un
 * campo per cercarne una per nome o per nickname. Toccandola se ne apre il
 * profilo, da cui la si invita anche se non c'e': le arriva una notifica.
 * L'elenco si chiede solo quando il foglio si apre.
 */
export function Persone({ onScelta }: { onScelta?: () => void }) {
  const { vai } = useNavigazione()
  const { dati } = useDati<AmiciRisposta>('/amici?tutti=1')
  const [cerca, setCerca] = useState('')
  const tutti = dati?.tutti
  const trovati = useMemo(() => {
    const q = piano(cerca.trim().replace(/^@/, ''))
    if (!tutti || !q) return tutti ?? []
    return tutti.filter((p) => piano(p.displayName).includes(q) || piano(p.nickname).includes(q))
  }, [tutti, cerca])

  return (
    <div className="persone">
      <input
        className="persone__cerca"
        type="search"
        placeholder="Cerca per nome o nickname"
        aria-label="Cerca una persona"
        value={cerca}
        onChange={(e) => setCerca(e.target.value)}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
      />
      {!tutti ? (
        <div className="persone__attesa scheletro" aria-hidden="true" />
      ) : trovati.length === 0 ? (
        <p className="persone__vuoto">{tutti.length === 0 ? 'Nel gruppo ci sei solo tu.' : 'Nessuno con questo nome.'}</p>
      ) : (
        <ul className="persone__elenco">
          {trovati.map((p) => (
            <li key={p.playerId}>
              <button
                type="button"
                className="persona"
                onClick={() => {
                  onScelta?.()
                  vai(ROTTE.amico(p.nickname), { state: { da: 'Profilo' } })
                }}
              >
                <span className="persona__avatar">
                  <Avatar nickname={p.nickname} color={p.avatarColor} size={40} />
                  {p.online && <span className="persona__online" aria-hidden="true" />}
                </span>
                <span className="persona__chi">
                  <span className="persona__nome">{p.displayName}</span>
                  <span className="persona__sotto">
                    {p.online ? (p.attivita ? DOVE[p.attivita] : 'Online') : `@${p.nickname}`}
                  </span>
                </span>
                <IconChevronRight size={18} className="persona__freccia" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
