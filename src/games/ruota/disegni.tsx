import { memo, useId, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { ICONE_CATEGORIE } from '@/games/quiz/icone'
import { materiaDi, type CategoriaQuiz } from '@shared/quiz'
import {
  MOLTIPLICATORI_QUIZ,
  MOLTIPLICATORI_QUIZ_FORTUNATI,
  SPICCHI_FORTUNATI,
  SPICCHI_QUIZ,
  SPICCHI_RUOTA,
  eSfida,
  nomeSullaRuota,
  scriviMoltiplicatore,
  type Spicchio,
  type TipoSpicchio,
} from '@shared/ruota'
import { MOZZO, PIOLI, RAGGIO, RAGGIO_PIOLO, misureDi, punto, scrittaRadiale } from './geometria'
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

/** Il colore di una categoria: quello della sua materia nel quiz. La lirica e' della musica. */
export const coloreDellaCategoria = (c: CategoriaQuiz) => `var(--materia-${materiaDi(c)}-1)`

/** Il colore di un moltiplicatore, dovunque lo si mostri: piu' vale, piu' e' prezioso. */
export const COLORI_MOLTIPLICATORI: Record<string, string> = {
  '0.5': 'var(--ct-m05)',
  '1.25': 'var(--ct-m125)',
  '1.5': 'var(--ct-m15)',
  '1.75': 'var(--ct-m175)',
  '2': 'var(--ct-m2)',
  '2.5': 'var(--ct-m25)',
  '3': 'var(--ct-m3)',
  '4': 'var(--ct-m4)',
  '5': 'var(--ct-m5)',
  '6': 'var(--ct-m5)',
  '8': 'var(--ct-m10)',
  '10': 'var(--ct-m10)',
  '15': 'var(--ct-m10)',
  '30': 'var(--ct-m10)',
}

export const coloreDelMoltiplicatore = (m: number) => COLORI_MOLTIPLICATORI[String(m)] ?? 'var(--ct-oro)'

/** La classe di un moltiplicatore: "is-m125", "is-m10". */
export const classeDelValore = (m: number) => `is-m${String(m).replace('.', '')}`

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
        return <circle key={`p${i}`} className="ct-piolo" cx={x} cy={y} r={RAGGIO_PIOLO} />
      })}
    </>
  )
}

/* ─────────────────────────────  Le icone degli spicchi  ───────────────────────────── */

/*
 * Ogni icona si disegna dentro un quadrato di lato `lato`, con il centro
 * nell'origine: sulla ruota sta dove dice `misureDi`, e non esce dal suo posto.
 */

/** La moneta dello spicchio: mezza blu e mezza rossa, con l'orlo d'oro. */
export function IconaMoneta({ lato }: { lato: number }) {
  const r = lato / 2
  const dentro = r * 0.82
  return (
    <g className="ct-icona-moneta">
      <circle r={r} className="ct-icona-moneta__orlo" />
      <path d={`M0 ${-dentro}A${dentro} ${dentro} 0 0 0 0 ${dentro}Z`} className="ct-icona-moneta__blu" />
      <path d={`M0 ${-dentro}A${dentro} ${dentro} 0 0 1 0 ${dentro}Z`} className="ct-icona-moneta__rosso" />
      <circle r={dentro} className="ct-icona-moneta__filo" />
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

/** Il taglio a zigzag della moneta dello split, dall'alto in basso, e le sue due meta'. */
const TAGLIO = 'M0 -8.8L1.4 -5.2L-1.1 -1.8L1.3 1.6L-1 5L0 8.8'
const MEZZA_SINISTRA = `${TAGLIO}A8.8 8.8 0 0 1 0 -8.8Z`
const MEZZA_DESTRA = `${TAGLIO}A8.8 8.8 0 0 0 0 -8.8Z`

/**
 * Lo split: una moneta d'oro tagliata in due, le meta' staccate e storte. Si
 * legge come una moneta, e lo e': ne torna meta'.
 */
export function IconaSplit({ lato }: { lato: number }) {
  return (
    <g className="ct-icona-split" transform={`scale(${lato / 24})`}>
      <g transform="translate(-2.3 0.7) rotate(-13)">
        <path className="ct-icona-split__mezza" d={MEZZA_SINISTRA} />
        <path className="ct-icona-split__filo" d="M-1 -6.1A6.2 6.2 0 0 0 -1 6.1" />
      </g>
      <g transform="translate(2.3 -0.7) rotate(13)">
        <path className="ct-icona-split__mezza" d={MEZZA_DESTRA} />
        <path className="ct-icona-split__filo" d="M1 -6.1A6.2 6.2 0 0 1 1 6.1" />
      </g>
    </g>
  )
}

/** I pioli dell'icona del Pachinko: un triangolo di sei, come quelli del tabellone. */
const PIOLI_ICONA: ReadonlyArray<readonly [number, number]> = [
  [0, -0.5], [-4.2, 3.6], [4.2, 3.6], [-8.4, 7.7], [0, 7.7], [8.4, 7.7],
]

/** Il Pachinko: la pallina che cade sul triangolo dei pioli. */
export function IconaPachinko({ lato }: { lato: number }) {
  return (
    <g className="ct-icona-pachinko" transform={`scale(${lato / 24})`}>
      {PIOLI_ICONA.map(([x, y]) => (
        <circle key={`${x},${y}`} className="ct-icona-pachinko__piolo" cx={x} cy={y} r={1.9} />
      ))}
      <path className="ct-icona-pachinko__scia" d="M-6.5 -10.6Q-4.6 -9.6 -3.3 -7.2" />
      <circle className="ct-icona-pachinko__pallina" cx={-1.6} cy={-6.8} r={3.4} />
    </g>
  )
}

/** Il Cash Hunt: il mirino del cannone che sceglie la casella. */
export function IconaCashHunt({ lato }: { lato: number }) {
  return (
    <g className="ct-icona-caccia" transform={`scale(${lato / 24})`}>
      <circle className="ct-icona-caccia__anello" r={7.6} />
      <path className="ct-icona-caccia__croce" d="M0 -10.6V-4.6M0 4.6V10.6M-10.6 0H-4.6M4.6 0H10.6" />
      <circle className="ct-icona-caccia__centro" r={2.4} />
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

/** Quanto e' grande il quadrifoglio disegnato con `lato`: le foglie e il gambo, con il loro filo. */
const QUADRIFOGLIO_PIENO = 16.4

/** L'icona di uno spicchio, dentro il suo quadrato: quella del quiz, della moneta, dei minigiochi, della fortuna. */
export function IconaSpicchio({ tipo, lato }: { tipo: TipoSpicchio; lato: number }) {
  switch (tipo) {
    case 'quiz':
      return <IconaQuiz lato={lato} />
    case 'moneta':
      return <IconaMoneta lato={lato} />
    case 'split':
      return <IconaSplit lato={lato} />
    case 'pachinko':
      return <IconaPachinko lato={lato} />
    case 'cashhunt':
      return <IconaCashHunt lato={lato} />
    case 'fortuna':
      return <Quadrifoglio lato={(lato * 16) / QUADRIFOGLIO_PIENO} />
    default:
      return null
  }
}

/* ─────────────────────────────  La ruota grande  ───────────────────────────── */

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
export function tempiDelConto(passi: readonly PassoDelConto[], k: number): CSSProperties {
  const ultimo = k === passi.length - 1
  return { '--da': `${passi[k].ms}ms`, '--dura': `${ultimo ? 0 : passi[k + 1].ms - passi[k].ms}ms` } as CSSProperties
}

/** La classe di uno spicchio, per il suo colore: "is-banco", "is-fisso is-m3". */
const classeDi = (s: Spicchio) =>
  s.tipo === 'fisso' ? `is-fisso ${classeDelValore(s.moltiplicatore)}` : `is-${s.tipo}`

/**
 * Una faccia di uno spicchio della ruota, disegnata con l'asse in alto: il
 * banco nero con la scritta d'oro dal bordo al mozzo; i premi fissi con il
 * numero dritto verso il bordo, e sotto il nome lungo il raggio, se ce l'hanno;
 * gli altri con l'icona verso il bordo e sotto il nome. Lo split e' rosa con la
 * moneta tagliata, il quiz azzurro con il fumetto, la moneta viola, il Pachinko
 * turchese con la pallina e i pioli, il Cash Hunt verde con il mirino, la
 * fortuna verde con il quadrifoglio d'oro. I minigiochi della ruota fortunata
 * hanno l'oro sul bordo e la scritta d'oro. Il ×10 conta da ×4: e' il triplo
 * che sale. Le misure sono quelle di `misureDi`.
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
  const doro = fortunata && eSfida(s)
  const { icona, numero, scritta } = misureDi(s)
  const valore = s.tipo === 'fisso' ? classeDelValore(s.moltiplicatore) : ''
  const classeScritta = [
    'ct-scritta',
    s.tipo === 'banco' && 'is-banco',
    s.tipo === 'fisso' && `is-fisso ${valore}`,
    s.tipo === 'fortuna' && 'is-fortuna',
    doro && 'is-doro',
  ]
    .filter(Boolean)
    .join(' ')
  let cifre: ReactNode = null
  if (numero) {
    const classeNumero = `ct-scritta is-fisso ${valore} is-numero`
    cifre = conto ? (
      conto.map((p, k) =>
        k === 0 ? null : (
          <text
            key={p.valore}
            className={`${classeNumero} ct-conto${k === conto.length - 1 ? ' is-ultimo' : ''}`}
            y={-numero.centro}
            fontSize={numero.dimensione}
            style={tempiDelConto(conto, k)}
          >
            {scriviMoltiplicatore(p.valore)}
          </text>
        ),
      )
    ) : (
      <text className={classeNumero} y={-numero.centro} fontSize={numero.dimensione}>
        {numero.testo}
      </text>
    )
  }
  return (
    <>
      <path className={`ct-spicchio ${classeDi(s)}`} d={forma} />
      {(doro || s.tipo === 'fortuna') && <path className="ct-spicchio-oro" d={forma} fill={`url(#${oro})`} />}
      {icona && (
        <g className="ct-icona" transform={`translate(0 ${-icona.centro})`}>
          <IconaSpicchio tipo={s.tipo} lato={icona.lato} />
        </g>
      )}
      {cifre}
      {scritta && (
        <text
          className={classeScritta}
          {...scrittaRadiale(0, scritta.da, scritta.a, scritta.testo, scritta.dimensione, 0, scritta.spaziatura)}
        >
          {scritta.testo}
        </text>
      )}
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
  const dieci = misureDi(SPICCHI_FORTUNATI[POSTO_DIECI]).numero
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
        const eDieci = i === POSTO_DIECI
        return (
          <g
            key={i}
            className={`ct-posto${cambia ? ' cambia' : ''}${eDieci ? ' is-dieci' : ''}`}
            transform={`rotate(${i * passo + passo / 2})`}
            style={
              {
                '--ritardo': `${ritardoDellaRuota(i)}ms`,
                ...(eDieci ? { '--fine': `${CONTO_DIECI[CONTO_DIECI.length - 1].ms}ms` } : {}),
              } as CSSProperties
            }
          >
            <g className="ct-faccia is-normale">
              <Faccia s={s} fortunata={false} oro={oro} />
            </g>
            {cambia && (
              <g className="ct-faccia is-fortunata">
                <Faccia s={SPICCHI_FORTUNATI[i]} fortunata oro={oro} conto={eDieci ? CONTO_DIECI : undefined} />
              </g>
            )}
            <path className="ct-lampo" d={spicchioLocale(n)} />
            {cambia && <Stelline y={-56} />}
            {eDieci && dieci && <circle className="ct-onda" cy={-dieci.centro} r={9} />}
          </g>
        )
      })}
      <Raggiere n={n} />
    </>
  )
})

/* ─────────────────────────────  La ruota del quiz  ───────────────────────────── */

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
      {...scrittaRadiale(0, VALORE_DA, VALORE_A, scriviMoltiplicatore(x), 13.5, SCARTO_VALORE, 0.02)}
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
            <text className="ct-scritta is-categoria" {...scrittaRadiale(0, 75, 40, nome, 6.4, SCARTO_NOME, 0.08)}>
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
