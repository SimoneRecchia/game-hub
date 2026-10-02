import { useEffect, type ReactNode } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { usePlayer } from '@/lib/auth'
import { Avatar } from './Avatar'
import { IconTrophy } from './Icons'
import { Pagina } from './Pagina'
import './Vetrina.css'

export type SchedaVetrina = 'arena' | 'salotto' | 'fortuna'

/** Il colore della barra di stato di iOS sulla Fortuna, che e' scura in tutti e due i temi: quello del suo fondo. */
const FONDO_FORTUNA = '#0d0716'

/**
 * La pagina di una scheda: l'Arena, il Salotto, la Fortuna. Hanno la stessa
 * forma — il titolo grande con la data, in alto a destra la classifica, dove
 * c'e', e l'avatar che porta al profilo, poi l'eroe e le carte — e ognuna il
 * suo carattere, che sta nel CSS: la luce in cima alla pagina nel colore della
 * scheda, e la Fortuna scura come una sala da gioco.
 */
export function Vetrina({
  scheda,
  titolo,
  sopra,
  classifica,
  azioni,
  children,
}: {
  scheda: SchedaVetrina
  titolo: string
  sopra: ReactNode
  /** Dove porta il trofeo: la classifica di questa scheda. */
  classifica?: string
  /** Altri bottoni della barra, prima del trofeo: le regole della Fortuna. */
  azioni?: ReactNode
  children: ReactNode
}) {
  const player = usePlayer()

  // Sulla Fortuna Safari tinge la zona dell'orologio di scuro, come la pagina; uscendo torna com'era.
  useEffect(() => {
    if (scheda !== 'fortuna') return
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) return
    const prima = meta.content
    meta.content = FONDO_FORTUNA
    return () => {
      meta.content = prima
    }
  }, [scheda])

  return (
    <Pagina
      titolo={titolo}
      sopra={sopra}
      azioni={
        <>
          {azioni}
          {classifica && (
            <Collegamento to={classifica} className="bottone-barra vetrina__trofeo" aria-label="Classifica">
              <IconTrophy size={20} />
            </Collegamento>
          )}
          <Collegamento to={ROTTE.profilo} stato={{ da: titolo }} className="vetrina__io" aria-label="Il tuo profilo">
            <Avatar nickname={player.nickname} color={player.avatarColor} size={36} />
          </Collegamento>
        </>
      }
    >
      <div className={`vetrina vetrina--${scheda}`}>{children}</div>
    </Pagina>
  )
}
