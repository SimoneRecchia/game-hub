import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { Collegamento } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { usePlayer } from '@/lib/auth'
import { Avatar } from './Avatar'
import { IconTrophy } from './Icons'
import { Pagina } from './Pagina'
import './Vetrina.css'

export type SchedaVetrina = 'giornaliere' | 'libere' | 'fortuna'

/**
 * Il colore della barra di stato di iOS: quello in cima al fondale della
 * scheda. La Fortuna e' scura in tutti e due i temi; le Giornaliere hanno
 * quello di sempre (`theme.ts`).
 */
const CIMA: Record<SchedaVetrina, { chiaro: string; scuro: string } | null> = {
  giornaliere: null,
  libere: { chiaro: '#ddf7ec', scuro: '#2a2e55' },
  fortuna: { chiaro: '#3a1e7a', scuro: '#3a1e7a' },
}

/** Il filo delle lucine: un arco su un riquadro di 390 per 60, le lampadine sui suoi punti. */
const LUCI = ['#FF5C9A', '#FFC93C', '#4FD0E0', '#5EDB84', '#FF9A62', '#B48CFF']
const LAMPADINE = Array.from({ length: 12 }, (_, i) => {
  const t = (i + 0.5) / 12
  const x = (1 - t) ** 2 * -10 + 2 * (1 - t) * t * 195 + t ** 2 * 400
  const y = (1 - t) ** 2 * 6 + 2 * (1 - t) * t * 64 + t ** 2 * 6
  return { x: (x / 390) * 100, y: y - 4, luce: LUCI[i % LUCI.length], ritardo: (i * 0.37) % 2.4 }
})

/**
 * La pagina di una scheda: le Libere, le Giornaliere, la Fortuna. Hanno la
 * stessa forma — il titolo grande con la data, in alto a destra la
 * classifica, dove c'e', e l'avatar che porta al profilo, poi l'eroe e le
 * carte — e ognuna il suo carattere, che sta nel CSS: la luce in cima alla
 * pagina nel colore della scheda, e la Fortuna scura come una sala da gioco.
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

  // Safari tinge la zona dell'orologio del colore in cima alla pagina; uscendo torna com'era. Le meta sono
  // due, una per schema, finché il tema non si cambia dal profilo (`theme.ts` le fa una sola).
  useEffect(() => {
    const cima = CIMA[scheda]
    if (!cima) return
    const meta = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
    const prima = meta.map((m) => m.content)
    const tema = document.documentElement.dataset.theme
    const scuro = tema === 'dark' || (tema !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    for (const m of meta) {
      const sua = m.media.includes('dark') ? true : m.media.includes('light') ? false : scuro
      m.content = sua ? cima.scuro : cima.chiaro
    }
    return () => {
      meta.forEach((m, i) => {
        m.content = prima[i]
      })
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
            <Collegamento
              to={classifica}
              stato={{ da: titolo }}
              className="bottone-barra vetrina__trofeo"
              aria-label="Classifica"
            >
              <IconTrophy size={22} />
            </Collegamento>
          )}
          <Collegamento to={ROTTE.profilo} stato={{ da: titolo }} className="vetrina__io" aria-label="Il tuo profilo">
            <Avatar nickname={player.nickname} color={player.avatarColor} size={44} />
          </Collegamento>
        </>
      }
    >
      <div className={`vetrina vetrina--${scheda}`}>
        <div className="lucine" aria-hidden="true">
          <svg className="lucine__filo" viewBox="0 0 390 60" preserveAspectRatio="none">
            <path d="M-10 6 Q195 64 400 6" vectorEffect="non-scaling-stroke" />
          </svg>
          {LAMPADINE.map((l, i) => (
            <span
              key={i}
              className="lucine__lampadina"
              style={{ left: `${l.x}%`, top: l.y, '--luce': l.luce, '--ritardo': `${l.ritardo}s` } as CSSProperties}
            >
              <span className="lucine__vetro" />
            </span>
          ))}
        </div>
        {children}
      </div>
    </Pagina>
  )
}
