import { Avatar } from '@/components/Avatar'
import type { SuggerimentoCompagnia } from '@shared/types'
import '@/games/wordle/coop/SuggestionStrip.css'

/** Quanti se ne vedono: la striscia dice che cosa propongono adesso, non la storia. */
const QUANTI = 8

interface Props {
  suggerimenti: readonly SuggerimentoCompagnia[]
  /** Come si legge una proposta: la parola, e accanto dove va o quanto vale. */
  etichetta: (s: SuggerimentoCompagnia) => { parola: string; nota: string }
  /** Toccarne uno lo mette nella partita, senza giocarlo. */
  onScegli: (s: SuggerimentoCompagnia) => void
  disabled: boolean
}

/**
 * I suggerimenti arrivati all'host, come nel Wordle: una striscia di
 * capsule. Toccarne una scrive la parola nella griglia, o posa le tessere sul
 * tabellone, ma non la gioca: la mossa la decide sempre l'host. Quelli gia'
 * nella partita restano, sbiaditi, in fondo.
 */
export function Suggerimenti({ suggerimenti, etichetta, onScegli, disabled }: Props) {
  if (suggerimenti.length === 0) return null
  const visibili = [...suggerimenti.filter((s) => !s.usato), ...suggerimenti.filter((s) => s.usato)].slice(0, QUANTI)
  return (
    <div className="suggerimenti" role="group" aria-label="Suggerimenti ricevuti">
      <ul className="suggerimenti__lista">
        {visibili.map((s) => {
          const { parola, nota } = etichetta(s)
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`suggerimento${s.usato ? ' is-usato' : ''}`}
                onClick={() => onScegli(s)}
                disabled={disabled}
                title={
                  s.usato ? `${parola}, da ${s.da.displayName}: già fatto` : `${s.da.displayName} suggerisce ${parola}`
                }
              >
                <Avatar nickname={s.da.nickname} color={s.da.avatarColor} size={20} />
                <span className="suggerimento__nome">{s.da.displayName}</span>
                <span className="suggerimento__parola">{parola}</span>
                {nota && <span className="suggerimento__nota u-tabnum">{nota}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
