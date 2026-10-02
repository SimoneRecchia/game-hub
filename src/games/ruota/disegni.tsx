import { memo, type ReactElement } from 'react'
import { ICONE_CATEGORIE } from '@/games/quiz/icone'
import { materiaDi, type CategoriaQuiz } from '@shared/quiz'
import { MOLTIPLICATORI, etichettaDi, scriviMoltiplicatore, type Spicchio } from '@shared/ruota'
import { MOZZO, PIOLI, RAGGIO, punto, scrittaRadiale, spicchioPath } from './geometria'
import './disegni.css'

/** L'icona di una categoria: quella del quiz. */
export const iconaDellaCategoria = (c: CategoriaQuiz): ((p: { size?: number }) => ReactElement) => ICONE_CATEGORIE[c]

/** Il colore di una categoria: quello della sua materia nel quiz. Arte, libri, cinema e lirica sono la cultura. */
export const coloreDellaCategoria = (c: CategoriaQuiz) => `var(--materia-${materiaDi(c)}-1)`

/** Il colore di un moltiplicatore, sulla sua ruota e dovunque lo si mostri: piu' vale, piu' e' prezioso. */
export const COLORI_MOLTIPLICATORI: Record<string, string> = {
  '1.25': 'var(--ct-m125)',
  '1.5': 'var(--ct-m15)',
  '2': 'var(--ct-m2)',
  '3': 'var(--ct-m3)',
}

export const coloreDelMoltiplicatore = (m: number) => COLORI_MOLTIPLICATORI[String(m)] ?? 'var(--ct-oro)'

function classiDi(s: Spicchio): string {
  return s.tipo === 'domanda' ? `is-domanda is-materia-${materiaDi(s.categoria)}` : `is-${s.tipo}`
}

/** I separatori d'oro fra gli spicchi, dal mozzo al bordo, e i pioli dove scatta la lancetta. */
function Raggiere({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const [x0, y0] = punto(MOZZO, (i * 360) / n)
        const [x1, y1] = punto(RAGGIO, (i * 360) / n)
        return <line key={`r${i}`} className="ct-raggio" x1={x0} y1={y0} x2={x1} y2={y1} />
      })}
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = punto(PIOLI, (i * 360) / n)
        return <circle key={`p${i}`} className="ct-piolo" cx={x} cy={y} r={1.9} />
      })}
    </>
  )
}

/** La moneta dello spicchio: mezza blu e mezza rossa, con l'orlo d'oro. */
function IconaMoneta({ lato }: { lato: number }) {
  const r = lato / 2
  return (
    <g className="ct-icona-moneta">
      <circle r={r} className="ct-icona-moneta__orlo" />
      <path d={`M0 ${-r + 1.6}A${r - 1.6} ${r - 1.6} 0 0 0 0 ${r - 1.6}Z`} className="ct-icona-moneta__blu" />
      <path d={`M0 ${-r + 1.6}A${r - 1.6} ${r - 1.6} 0 0 1 0 ${r - 1.6}Z`} className="ct-icona-moneta__rosso" />
      <circle r={r - 1.6} className="ct-icona-moneta__filo" />
    </g>
  )
}

/** Il raggio dove sta l'icona, verso il bordo, e dove sta la scritta, fra l'icona e il mozzo. */
const ICONA_A = 77
const ICONA = 18
const SCRITTA_DA = 65
const SCRITTA_A = 28

/**
 * La ruota di Crazy Time di un giorno. Il banco e' nero con la scritta d'oro;
 * il triplo e' d'oro, con il ×3 grande e dritto; le domande hanno il colore
 * della materia della categoria, la sua icona in alto e il nome lungo il
 * raggio; la moneta e' viola, con la moneta blu e rossa. Le scritte corrono
 * lungo il raggio e si leggono dall'alto in basso quando lo spicchio e' sotto
 * la lancetta; le icone, e il ×3, stanno dritte. Gli spicchi cambiano solo con
 * il giorno: chi la usa li passa sempre uguali, e il disegno non si rifà.
 */
export const DisegnoRuota = memo(function DisegnoRuota({ spicchi }: { spicchi: readonly Spicchio[] }) {
  const n = spicchi.length
  const passo = 360 / n
  return (
    <>
      {spicchi.map((s, i) => (
        <path key={`s${i}`} className={`ct-spicchio ${classiDi(s)}`} d={spicchioPath(i, n)} />
      ))}
      <Raggiere n={n} />
      {spicchi.map((s, i) => {
        const centro = i * passo + passo / 2
        if (s.tipo === 'banco') {
          return (
            <text key={`t${i}`} className="ct-scritta is-banco" {...scrittaRadiale(centro, 88, 34, 'BANCO', 11)}>
              BANCO
            </text>
          )
        }
        if (s.tipo === 'fisso') {
          return (
            <g key={`f${i}`}>
              <text
                className="ct-scritta is-fisso is-numero"
                transform={`rotate(${centro}) translate(0 ${-ICONA_A + 4})`}
              >
                {etichettaDi(s)}
              </text>
              <text
                className="ct-scritta is-fisso"
                {...scrittaRadiale(centro, SCRITTA_DA - 4, SCRITTA_A, 'TRIPLO', 7.6)}
              >
                TRIPLO
              </text>
            </g>
          )
        }
        const testo = etichettaDi(s)
        const Icona = s.tipo === 'domanda' ? iconaDellaCategoria(s.categoria) : null
        return (
          <g key={`c${i}`}>
            <g className={`ct-icona ${classiDi(s)}`} transform={`rotate(${centro}) translate(0 ${-ICONA_A})`}>
              {Icona ? (
                <g transform={`translate(${-ICONA / 2} ${-ICONA / 2})`}>
                  <Icona size={ICONA} />
                </g>
              ) : (
                <IconaMoneta lato={ICONA + 2} />
              )}
            </g>
            <text className="ct-scritta" {...scrittaRadiale(centro, SCRITTA_DA, SCRITTA_A, testo, 7.6)}>
              {testo}
            </text>
          </g>
        )
      })}
    </>
  )
})

/**
 * La ruota dei moltiplicatori: dodici spicchi nel colore del loro valore, e il
 * valore scritto lungo il raggio, grande.
 */
export const DisegnoMoltiplicatori = memo(function DisegnoMoltiplicatori() {
  const n = MOLTIPLICATORI.length
  const passo = 360 / n
  return (
    <>
      {MOLTIPLICATORI.map((m, i) => (
        <path
          key={`s${i}`}
          className={`ct-spicchio is-moltiplicatore is-m${String(m).replace('.', '')}`}
          d={spicchioPath(i, n)}
        />
      ))}
      <Raggiere n={n} />
      {MOLTIPLICATORI.map((m, i) => {
        const testo = scriviMoltiplicatore(m)
        return (
          <text
            key={`t${i}`}
            className={`ct-scritta is-moltiplicatore is-m${String(m).replace('.', '')}`}
            {...scrittaRadiale(i * passo + passo / 2, 89, 33, testo, 15)}
          >
            {testo}
          </text>
        )
      })}
    </>
  )
})
