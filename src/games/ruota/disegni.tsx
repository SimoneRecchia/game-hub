import { memo, useId, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { ICONE_CATEGORIE } from '@/games/quiz/icone'
import { materiaDi, type CategoriaQuiz } from '@shared/quiz'
import {
  MOLTIPLICATORI_QUIZ,
  MOLTIPLICATORI_QUIZ_FORTUNATI,
  SPICCHI_FORTUNATI,
  SPICCHI_QUIZ,
  SPICCHI_RUOTA,
  etichettaDi,
  nomeSullaRuota,
  scriviMoltiplicatore,
  type Spicchio,
} from '@shared/ruota'
import { MOZZO, PIOLI, RAGGIO, punto, scrittaRadiale } from './geometria'
import {
  CONTO_DIECI,
  CONTO_QUIZ,
  POSTO_DIECI,
  POSTO_QUATTRO,
  cambiaConLaFortuna,
  ritardoDelQuiz,
  ritardoDellaRuota,
  type PassoDelConto,
} from './magia'
import './disegni.css'

/** L'icona di una categoria: quella del quiz. */
export const iconaDellaCategoria = (c: CategoriaQuiz): ((p: { size?: number }) => ReactElement) => ICONE_CATEGORIE[c]

/** Il colore di una categoria: quello della sua materia nel quiz. Arte, libri, cinema e lirica sono la cultura. */
export const coloreDellaCategoria = (c: CategoriaQuiz) => `var(--materia-${materiaDi(c)}-1)`

/** Il colore di un moltiplicatore, dovunque lo si mostri: piu' vale, piu' e' prezioso. */
export const COLORI_MOLTIPLICATORI: Record<string, string> = {
  '1.25': 'var(--ct-m125)',
  '1.5': 'var(--ct-m15)',
  '1.75': 'var(--ct-m175)',
  '2': 'var(--ct-m2)',
  '2.5': 'var(--ct-m25)',
  '3': 'var(--ct-m3)',
  '4': 'var(--ct-m4)',
  '5': 'var(--ct-m5)',
  '10': 'var(--ct-m10)',
}

export const coloreDelMoltiplicatore = (m: number) => COLORI_MOLTIPLICATORI[String(m)] ?? 'var(--ct-oro)'

/** La classe di un moltiplicatore: "is-m125", "is-m10". */
const classeDelValore = (m: number) => `is-m${String(m).replace('.', '')}`

/** Lo spicchio di `n` con l'asse in alto, centrato sull'origine: ogni spicchio si disegna cosi', e poi si gira. */
function spicchioLocale(n: number, raggio = RAGGIO): string {
  const [x0, y0] = punto(raggio, -180 / n)
  const [x1, y1] = punto(raggio, 180 / n)
  return `M0 0L${x0.toFixed(2)} ${y0.toFixed(2)}A${raggio} ${raggio} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`
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

/** Il fumetto del quiz, con il punto di domanda: uno per tutte le categorie. */
export function IconaQuiz({ lato }: { lato: number }) {
  return (
    <g className="ct-icona-quiz" transform={`scale(${lato / 24}) translate(-12 -12)`}>
      <path
        className="ct-icona-quiz__fumetto"
        d="M5 3.2h14a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-7.4L6.4 22.4v-4.2H5a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3z"
      />
      <text className="ct-icona-quiz__segno" x={12} y={11.4}>
        ?
      </text>
    </g>
  )
}

/** Una foglia del quadrifoglio, a cuore, con la punta al centro: la stessa del quadrifoglio della Fortuna. */
const FOGLIA = 'M0 -0.6C-2.2 -2.4-4.3-4.5-3.1-6.8c1-1.9 3.1-1.2 3.1.3 0-1.5 2.1-2.2 3.1-.3 1.2 2.3-.9 4.4-3.1 6.2Z'

/** Il quadrifoglio: quattro foglie e il gambo. Sulla ruota, nel cartello e nella festa della fortuna. */
export function Quadrifoglio({ lato, classe = '' }: { lato: number; classe?: string }) {
  return (
    <g className={`ct-quadrifoglio ${classe}`} transform={`scale(${lato / 16})`}>
      <path className="ct-quadrifoglio__gambo" d="M0.6 0.8c1.6 2 2.3 4.2 2 6.6" />
      {[0, 90, 180, 270].map((g) => (
        <path key={g} className="ct-quadrifoglio__foglia" d={FOGLIA} transform={`rotate(${g})`} />
      ))}
      <circle className="ct-quadrifoglio__cuore" r={0.9} />
    </g>
  )
}

/** Il raggio dove sta l'icona, verso il bordo, e dove sta la scritta, fra l'icona e il mozzo. */
const ICONA_A = 77
const ICONA = 18
const SCRITTA_DA = 65
const SCRITTA_A = 28

/** I nomi dei moltiplicatori fissi, lungo il raggio: il triplo, il quintuplo, il decuplo. */
const NOMI_FISSI: Record<number, string> = { 3: 'TRIPLO', 5: 'QUINTUPLO', 10: 'DECUPLO' }

/** Le stelline di uno spicchio che si gira: escono dal centro dello spicchio, ognuna per la sua strada. */
const STELLINE = Array.from({ length: 7 }, (_, k) => {
  const a = ((k * 360) / 7 + 20) * (Math.PI / 180)
  const d = 15 + (k % 3) * 6
  return { dx: Math.cos(a) * d, dy: Math.sin(a) * d - 6, r: 2.6 + (k % 2) * 1.4, k }
})

/** Una stellina a quattro punte, di raggio `r`. */
const stellina = (r: number) => {
  const q = (r * 0.18).toFixed(2)
  return `M0 ${-r}Q${q} -${q} ${r} 0Q${q} ${q} 0 ${r}Q-${q} ${q} ${-r} 0Q-${q} -${q} 0 ${-r}Z`
}

function Stelline({ y }: { y: number }) {
  return (
    <g className="ct-stelline" transform={`translate(0 ${y})`}>
      {STELLINE.map((s) => (
        <path
          key={s.k}
          className="ct-stellina"
          d={stellina(s.r)}
          style={{ '--dx': `${s.dx.toFixed(1)}px`, '--dy': `${s.dy.toFixed(1)}px`, '--k': s.k } as CSSProperties}
        />
      ))}
    </g>
  )
}

/** Quando compare un passo del conto, e quanto resta: l'ultimo resta. */
function tempiDelConto(passi: readonly PassoDelConto[], k: number): CSSProperties {
  const ultimo = k === passi.length - 1
  return { '--da': `${passi[k].ms}ms`, '--dura': `${ultimo ? 0 : passi[k + 1].ms - passi[k].ms}ms` } as CSSProperties
}

/**
 * Una faccia di uno spicchio della ruota, disegnata con l'asse in alto: il
 * banco nero con la scritta d'oro; i premi fissi con il numero grande e dritto,
 * e il nome lungo il raggio; il quiz azzurro con il fumetto; la moneta viola
 * con la moneta blu e rossa; la fortuna verde con il quadrifoglio d'oro. Il
 * quiz e la moneta della ruota fortunata hanno l'oro sul bordo e la scritta
 * d'oro. Il ×10 conta da ×4: e' il triplo che sale.
 */
function Faccia({
  s,
  fortunata,
  oro,
  conto,
}: {
  s: Spicchio
  fortunata: boolean
  oro: string
  conto?: readonly PassoDelConto[]
}) {
  const forma = spicchioLocale(SPICCHI_RUOTA.length)
  const doro = fortunata && (s.tipo === 'quiz' || s.tipo === 'moneta')
  const classe = s.tipo === 'fisso' ? `is-fisso ${classeDelValore(s.moltiplicatore)}` : `is-${s.tipo}`
  let contenuto: ReactNode
  if (s.tipo === 'banco') {
    contenuto = (
      <text className="ct-scritta is-banco" {...scrittaRadiale(0, 88, 34, 'BANCO', 11)}>
        BANCO
      </text>
    )
  } else if (s.tipo === 'fisso') {
    const numero = etichettaDi(s)
    const nome = NOMI_FISSI[s.moltiplicatore] ?? numero
    const valore = classeDelValore(s.moltiplicatore)
    const classeNumero = `ct-scritta is-fisso ${valore} is-numero${numero.length > 2 ? ' is-lungo' : ''}`
    contenuto = (
      <>
        {conto ? (
          conto.map((p, k) =>
            k === 0 ? null : (
              <text
                key={p.valore}
                className={`${classeNumero} ct-conto${k === conto.length - 1 ? ' is-ultimo' : ''}`}
                y={-ICONA_A + 4}
                style={tempiDelConto(conto, k)}
              >
                {scriviMoltiplicatore(p.valore)}
              </text>
            ),
          )
        ) : (
          <text className={classeNumero} y={-ICONA_A + 4}>
            {numero}
          </text>
        )}
        <text className={`ct-scritta is-fisso ${valore}`} {...scrittaRadiale(0, SCRITTA_DA - 4, SCRITTA_A, nome, 7.6)}>
          {nome}
        </text>
      </>
    )
  } else {
    const testo = etichettaDi(s)
    contenuto = (
      <>
        <g className="ct-icona" transform={`translate(0 ${-ICONA_A})`}>
          {s.tipo === 'quiz' ? (
            <IconaQuiz lato={ICONA + 3} />
          ) : s.tipo === 'moneta' ? (
            <IconaMoneta lato={ICONA + 2} />
          ) : (
            <Quadrifoglio lato={ICONA + 6} />
          )}
        </g>
        <text
          className={`ct-scritta${doro ? ' is-doro' : ''}${s.tipo === 'fortuna' ? ' is-fortuna' : ''}`}
          {...scrittaRadiale(0, SCRITTA_DA, SCRITTA_A, testo, s.tipo === 'quiz' ? 10 : 7.6)}
        >
          {testo}
        </text>
      </>
    )
  }
  return (
    <>
      <path className={`ct-spicchio ${classe}`} d={forma} />
      {(doro || s.tipo === 'fortuna') && <path className="ct-spicchio-oro" d={forma} fill={`url(#${oro})`} />}
      {contenuto}
    </>
  )
}

/**
 * La ruota di Crazy Time, con la ruota fortunata dentro: ogni spicchio ha la
 * sua faccia normale e, se cambia, quella della fortuna, una sopra l'altra.
 * Quale si vede lo decidono le classi della ruota (`is-fortunata`), e la
 * magia che le gira una dopo l'altra (`is-magia`) e' tutta nel CSS, con il
 * ritardo di ogni spicchio nel suo stile: il disegno si fa una volta sola.
 * Le scritte corrono lungo il raggio e si leggono dall'alto in basso quando lo
 * spicchio e' sotto la lancetta; le icone e i numeri stanno dritti.
 */
export const DisegnoRuota = memo(function DisegnoRuota() {
  const oro = `${useId().replace(/:/g, '')}-oro`
  const n = SPICCHI_RUOTA.length
  const passo = 360 / n
  return (
    <>
      <defs>
        <radialGradient id={oro} cx="0" cy="0" r={RAGGIO} gradientUnits="userSpaceOnUse">
          <stop offset="0.72" stopColor="#ffd84d" stopOpacity="0" />
          <stop offset="0.9" stopColor="#ffd84d" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ffe680" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      {SPICCHI_RUOTA.map((s, i) => {
        const cambia = cambiaConLaFortuna(i)
        const dieci = i === POSTO_DIECI
        return (
          <g
            key={i}
            className={`ct-posto${cambia ? ' cambia' : ''}${dieci ? ' is-dieci' : ''}`}
            transform={`rotate(${i * passo + passo / 2})`}
            style={
              {
                '--ritardo': `${ritardoDellaRuota(i)}ms`,
                ...(dieci ? { '--fine': `${CONTO_DIECI[CONTO_DIECI.length - 1].ms}ms` } : {}),
              } as CSSProperties
            }
          >
            <g className="ct-faccia is-normale">
              <Faccia s={s} fortunata={false} oro={oro} />
            </g>
            {cambia && (
              <g className="ct-faccia is-fortunata">
                <Faccia s={SPICCHI_FORTUNATI[i]} fortunata oro={oro} conto={dieci ? CONTO_DIECI : undefined} />
              </g>
            )}
            <path className="ct-lampo" d={spicchioLocale(n)} />
            {cambia && <Stelline y={-58} />}
            {dieci && <circle className="ct-onda" cy={-ICONA_A + 2} r={10} />}
          </g>
        )
      })}
      <Raggiere n={n} />
    </>
  )
})

/** Dove stanno le scritte della ruota del quiz: il moltiplicatore grande e, di fianco, il nome della categoria. */
const VALORE_DA = 70
const VALORE_A = 36
const SCARTO_VALORE = 4.4
const SCARTO_NOME = -7.8

/**
 * La ruota del quiz: dodici spicchi nel colore della materia della loro
 * categoria, con l'icona verso il bordo, e lungo il raggio il moltiplicatore,
 * grande, e il nome della categoria, piccolo. I moltiplicatori della fortuna ci
 * sono gia', sotto quelli normali: la classe della ruota (`is-fortunata`) li
 * mostra, e la magia (`is-aumento`) li fa salire uno dopo l'altro, il ×4 per
 * ultimo, che conta fino al ×10. Le categorie cambiano a ogni giro, e il
 * disegno con loro.
 */
export const DisegnoQuiz = memo(function DisegnoQuiz({ categorie }: { categorie: readonly CategoriaQuiz[] }) {
  const n = SPICCHI_QUIZ
  const passo = 360 / n
  const forma = spicchioLocale(n)
  const valore = (x: number, classe = '', stile?: CSSProperties) => (
    <text
      key={x}
      className={`ct-scritta is-moltiplicatore ${classeDelValore(x)}${classe}`}
      {...scrittaRadiale(0, VALORE_DA, VALORE_A, scriviMoltiplicatore(x), 13.5, SCARTO_VALORE)}
      style={stile}
    >
      {scriviMoltiplicatore(x)}
    </text>
  )
  return (
    <>
      {categorie.map((c, i) => (
        <g key={`s${i}`} transform={`rotate(${i * passo + passo / 2})`}>
          <path
            className={`ct-spicchio is-quiz-categoria is-materia-${materiaDi(c)}${i % 2 === 1 ? ' is-dispari' : ''}`}
            d={forma}
          />
        </g>
      ))}
      <Raggiere n={n} />
      {categorie.map((c, i) => {
        const Icona = iconaDellaCategoria(c)
        const quattro = i === POSTO_QUATTRO
        const nome = nomeSullaRuota(c).toUpperCase()
        return (
          <g
            key={`c${i}`}
            className={`ct-posto-quiz${quattro ? ' is-quattro' : ''}`}
            transform={`rotate(${i * passo + passo / 2})`}
            style={
              {
                '--ritardo': `${ritardoDelQuiz(i)}ms`,
                ...(quattro ? { '--fine': `${CONTO_QUIZ[CONTO_QUIZ.length - 1].ms}ms` } : {}),
              } as CSSProperties
            }
          >
            <path className="ct-lampo" d={forma} />
            <g className="ct-icona" transform="translate(0 -80)">
              <g transform="translate(-7.5 -7.5)">
                <Icona size={15} />
              </g>
            </g>
            <g className="ct-valore is-normale">{valore(MOLTIPLICATORI_QUIZ[i])}</g>
            <g className="ct-valore is-fortunata">
              {quattro
                ? CONTO_QUIZ.slice(1).map((p, k) =>
                    valore(
                      p.valore,
                      ` ct-conto${k === CONTO_QUIZ.length - 2 ? ' is-ultimo' : ''}`,
                      tempiDelConto(CONTO_QUIZ, k + 1),
                    ),
                  )
                : valore(MOLTIPLICATORI_QUIZ_FORTUNATI[i])}
            </g>
            <text className="ct-scritta is-categoria" {...scrittaRadiale(0, 75, 40, nome, 6.4, SCARTO_NOME)}>
              {nome}
            </text>
            <Stelline y={-56} />
            {quattro && <circle className="ct-onda" cy={-53} r={10} />}
          </g>
        )
      })}
    </>
  )
})
