import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Sezione } from '@/components/Elementi'
import { IconCheck, IconInfo } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Sheet } from '@/components/Sheet'
import { ComeSiGiocaQuiz } from '@/games/quiz/ComeSiGioca'
import { caricaDatiQuiz } from '@/games/quiz/dati'
import { IconaCategoria } from '@/games/quiz/icone'
import { DESCRIZIONI, PartitaQuiz, urlBandiera } from '@/games/quiz/PartitaQuiz'
import { leggiStatistiche, useQuizLibero, type ImpostazioniLibera } from '@/games/quiz/usePartita'
import { formatPercent } from '@/lib/format'
import {
  CATEGORIE,
  CONTINENTI,
  DOMANDE_PER_PARTITA,
  NOMI_CATEGORIE,
  NOMI_CONTINENTI,
  QUANTE_LIBERE,
  SECONDI_CARTINA,
  SECONDI_SCELTA,
  eCategoria,
  type CategoriaQuiz,
  type Continente,
} from '@shared/quiz'
import type { AreaQuiz, IndiceQuiz } from '@shared/quiz-domande'
import './Quiz.css'

/** Le categorie che si possono fare su un paese solo: i fiumi d'Italia, i laghi del Canada. */
const PER_PAESE: readonly CategoriaQuiz[] = ['fiumi', 'laghi']

const PREDEFINITE: ImpostazioniLibera = {
  categoria: 'capitali',
  area: 'mondo',
  quante: DOMANDE_PER_PARTITA,
  aTempo: true,
}

const CHIAVE_SCELTE = 'quiz-libera-scelte-v1'

/** Le scelte, se stanno in piedi: una categoria che c'e', un'area che le va bene, un numero previsto. */
function valide(s: Partial<ImpostazioniLibera> | null | undefined): ImpostazioniLibera | null {
  if (!s || !eCategoria(s.categoria)) return null
  const area = s.area ?? 'mondo'
  const areaBuona =
    area === 'mondo' ||
    (CONTINENTI as readonly string[]).includes(area) ||
    (/^paese:[A-Z]{2}$/.test(area) && PER_PAESE.includes(s.categoria))
  const quante = s.quante ?? DOMANDE_PER_PARTITA
  if (!areaBuona || !(QUANTE_LIBERE as readonly number[]).includes(quante)) return null
  return { categoria: s.categoria, area, quante, aTempo: s.aTempo ?? true }
}

/**
 * La partita dall'indirizzo: `?categoria=fiumi&paese=IT&domande=10`, o
 * `?categoria=bandiere&dove=eu&tempo=no`. L'indirizzo dice che partita e', e
 * tornare indietro riporta alle scelte.
 */
function daIndirizzo(query: URLSearchParams): ImpostazioniLibera | null {
  const paese = query.get('paese')
  return valide({
    categoria: (query.get('categoria') ?? undefined) as CategoriaQuiz | undefined,
    area: (paese ? `paese:${paese.toUpperCase()}` : (query.get('dove') ?? 'mondo')) as AreaQuiz,
    quante: Number(query.get('domande') ?? DOMANDE_PER_PARTITA),
    aTempo: query.get('tempo') !== 'no',
  })
}

function indirizzo(s: ImpostazioniLibera): string {
  const q = new URLSearchParams({ categoria: s.categoria })
  if (s.area.startsWith('paese:')) q.set('paese', s.area.slice(6))
  else if (s.area !== 'mondo') q.set('dove', s.area)
  q.set('domande', String(s.quante))
  if (!s.aTempo) q.set('tempo', 'no')
  return `${ROTTE.libera('quiz')}?${q}`
}

function leggiScelte(): ImpostazioniLibera {
  try {
    return valide(JSON.parse(localStorage.getItem(CHIAVE_SCELTE) ?? 'null')) ?? PREDEFINITE
  } catch {
    return PREDEFINITE
  }
}

function salvaScelte(s: ImpostazioniLibera): void {
  try {
    localStorage.setItem(CHIAVE_SCELTE, JSON.stringify(s))
  } catch {
    // Le scelte ricordate sono una comodità.
  }
}

/** Il riassunto dei dati, quando arriva: serve all'elenco dei paesi e al nome di un paese scelto. */
function useIndice(): { ix: IndiceQuiz | null; errore: string | null } {
  const [ix, setIx] = useState<IndiceQuiz | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    caricaDatiQuiz()
      .then((i) => vivo && setIx(i))
      .catch((e) => vivo && setErrore(e instanceof Error ? e.message : 'I dati del quiz non sono arrivati.'))
    return () => {
      vivo = false
    }
  }, [])
  return { ix, errore }
}

function nomeArea(area: AreaQuiz, ix: IndiceQuiz | null): string {
  if (area === 'mondo') return 'Tutto il mondo'
  if (area.startsWith('paese:')) return ix?.paesi.get(area.slice(6))?.n ?? '…'
  return NOMI_CONTINENTI[area as Continente]
}

/**
 * Il quiz libero: prima si sceglie — categoria, continente o paese, quante
 * domande, se a tempo — poi si gioca. Tutto nel browser, dagli stessi dati e
 * con le stesse regole della classificata, e non conta per la classifica.
 */
export default function QuizLibero() {
  const [query] = useSearchParams()
  const chiave = query.toString()
  const impostazioni = useMemo(() => daIndirizzo(new URLSearchParams(chiave)), [chiave])
  return impostazioni ? <Partita key={chiave} impostazioni={impostazioni} /> : <Scelta />
}

/* ───────────────────────────────  La partita  ──────────────────────────── */

function Partita({ impostazioni }: { impostazioni: ImpostazioniLibera }) {
  const p = useQuizLibero(impostazioni)
  const { indietro } = useNavigazione()
  const { ix } = useIndice()
  const [regole, setRegole] = useState(false)
  const s = p.statistiche

  return (
    <Pagina
      titolo="Quiz libero"
      intera
      indietro={{ a: ROTTE.libera('quiz'), etichetta: 'Scelte' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      <PartitaQuiz
        p={p}
        classificata={false}
        intro={{
          titolo: NOMI_CATEGORIE[impostazioni.categoria],
          sotto: `Libera · ${nomeArea(impostazioni.area, ix)}`,
          azione: impostazioni.aTempo ? 'Comincia' : 'Comincia, senza tempo',
        }}
        azioniFine={
          <>
            <Button size="lg" fullWidth onClick={p.riprova}>
              Un’altra partita
            </Button>
            <Button variant="tinted" size="lg" fullWidth onClick={() => indietro(ROTTE.libera('quiz'))}>
              Cambia le scelte
            </Button>
            {s.domande > 0 && (
              <p className="quiz-fine__nota">
                {s.partite} {s.partite === 1 ? 'partita libera' : 'partite libere'} ·{' '}
                {formatPercent(s.giuste / s.domande)} di risposte giuste
              </p>
            )}
          </>
        }
      />
      <ComeSiGiocaQuiz open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

/* ────────────────────────────────  Le scelte  ─────────────────────────── */

interface PaeseConCorsi {
  id: string
  n: string
  quanti: number
}

/** I paesi con abbastanza fiumi (o laghi) per una partita: almeno quante ne chiede la piu' corta. */
function paesiConCorsi(ix: IndiceQuiz, categoria: 'fiumi' | 'laghi'): PaeseConCorsi[] {
  const conti = new Map<string, number>()
  for (const c of ix.dati[categoria]) for (const id of c.p) conti.set(id, (conti.get(id) ?? 0) + 1)
  return ix.dati.paesi
    .map((p) => ({ id: p.id, n: p.n, quanti: conti.get(p.id) ?? 0 }))
    .filter((p) => p.quanti >= QUANTE_LIBERE[0])
    .sort((a, b) => a.n.localeCompare(b.n, 'it'))
}

const NOTE_DOVE: Partial<Record<CategoriaQuiz, string>> = {
  cartina: 'La cartina si apre sul continente scelto; sul mondo intero si cercano anche gli oceani.',
  fiumi: 'Su un paese solo le domande sono sui suoi fiumi più noti, finché ce ne sono.',
  laghi: 'Su un paese solo le domande sono sui suoi laghi più noti, finché ce ne sono.',
}

function Scelta() {
  const { vai } = useNavigazione()
  const [scelte, setScelte] = useState(leggiScelte)
  const [paesiAperti, setPaesiAperti] = useState(false)
  const [regole, setRegole] = useState(false)
  const [statistiche] = useState(leggiStatistiche)
  // I dati servono alla partita: scaricarli mentre si sceglie la fa partire subito.
  const { ix, errore } = useIndice()

  const cambia = (nuove: Partial<ImpostazioniLibera>) =>
    setScelte((s) => {
      const prossime = { ...s, ...nuove }
      // Un paese solo vale per fiumi e laghi: cambiando categoria si torna al mondo.
      if (prossime.area.startsWith('paese:') && !PER_PAESE.includes(prossime.categoria)) prossime.area = 'mondo'
      return prossime
    })

  const comincia = () => {
    salvaScelte(scelte)
    vai(indirizzo(scelte))
  }

  const perPaese = PER_PAESE.includes(scelte.categoria)
  const paese = scelte.area.startsWith('paese:') ? scelte.area.slice(6) : null
  const conCorsi = useMemo(
    () => (ix && perPaese ? paesiConCorsi(ix, scelte.categoria as 'fiumi' | 'laghi') : []),
    [ix, perPaese, scelte.categoria],
  )
  const aree: AreaQuiz[] = ['mondo', ...CONTINENTI]

  return (
    <Pagina
      titolo="Quiz libero"
      sotto={
        statistiche.domande > 0
          ? `${statistiche.partite} ${statistiche.partite === 1 ? 'partita' : 'partite'} · ${formatPercent(statistiche.giuste / statistiche.domande)} di risposte giuste. Non conta per la classifica.`
          : 'Scegli tu cosa, dove e quante domande. Non conta per la classifica.'
      }
      indietro={{ a: ROTTE.gioco('quiz'), etichetta: 'Quiz' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      <Sezione titolo="Categoria" nota={DESCRIZIONI[scelte.categoria]}>
        <div className="quiz-categorie" role="radiogroup" aria-label="Categoria">
          {CATEGORIE.map((c, i) => {
            const scelta = c === scelte.categoria
            const record = statistiche.migliori[c]
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={scelta}
                className={`quiz-tessera${scelta ? ' is-scelta' : ''}`}
                style={{ '--n': i } as CSSProperties}
                onClick={() => cambia({ categoria: c })}
              >
                <span className="quiz-tessera__icona" aria-hidden="true">
                  <IconaCategoria categoria={c} size={19} />
                </span>
                <span className="quiz-tessera__testi">
                  <span className="quiz-tessera__nome">{NOMI_CATEGORIE[c]}</span>
                  {record !== undefined && <span className="quiz-tessera__record">record {record}%</span>}
                </span>
                {scelta && (
                  <span className="quiz-tessera__segno" aria-hidden="true">
                    <IconCheck size={13} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </Sezione>

      <Sezione titolo="Dove" nota={NOTE_DOVE[scelte.categoria]}>
        <div className="quiz-zone" role="radiogroup" aria-label="Dove">
          {aree.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={scelte.area === a}
              className={`quiz-zona${scelte.area === a ? ' is-scelta' : ''}`}
              onClick={() => cambia({ area: a })}
            >
              {nomeArea(a, ix)}
            </button>
          ))}
          {perPaese && (
            <button
              type="button"
              role="radio"
              aria-checked={paese !== null}
              className={`quiz-zona${paese ? ' is-scelta' : ''}`}
              onClick={() => setPaesiAperti(true)}
              disabled={!ix}
            >
              {paese && (
                <img
                  className="quiz-zona__bandiera"
                  src={urlBandiera(paese.toLowerCase(), 40)}
                  srcSet={`${urlBandiera(paese.toLowerCase(), 80)} 2x`}
                  alt=""
                />
              )}
              {paese ? nomeArea(scelte.area, ix) : 'Un paese…'}
            </button>
          )}
        </div>
      </Sezione>

      <Sezione titolo="Domande">
        <SegmentedControl
          ariaLabel="Quante domande"
          options={QUANTE_LIBERE.map((n) => ({ value: String(n), label: String(n) }))}
          value={String(scelte.quante)}
          onChange={(v) => cambia({ quante: Number(v) })}
        />
        <button
          type="button"
          role="switch"
          aria-checked={scelte.aTempo}
          className="quiz-tempo"
          onClick={() => cambia({ aTempo: !scelte.aTempo })}
        >
          <span className="quiz-tempo__testi">
            <span className="quiz-tempo__titolo">A tempo</span>
            <span className="quiz-tempo__sotto">
              {scelte.aTempo
                ? `${SECONDI_SCELTA} secondi per domanda, ${SECONDI_CARTINA} sulla cartina`
                : 'Pensaci quanto vuoi'}
            </span>
          </span>
          <span className={`quiz-interruttore${scelte.aTempo ? ' is-acceso' : ''}`} aria-hidden="true">
            <span />
          </span>
        </button>
      </Sezione>

      <div className="quiz-scelta__via">
        <Button size="lg" fullWidth onClick={comincia}>
          Comincia
        </Button>
        {errore && <p className="quiz-scelta__errore">{errore}</p>}
      </div>

      <Sheet
        open={paesiAperti}
        onClose={() => setPaesiAperti(false)}
        title={scelte.categoria === 'fiumi' ? 'I fiumi di un paese' : 'I laghi di un paese'}
      >
        <ElencoPaesi
          paesi={conCorsi}
          scelto={paese}
          cosa={scelte.categoria === 'fiumi' ? 'fiumi' : 'laghi'}
          onScegli={(id) => {
            cambia({ area: `paese:${id}` })
            setPaesiAperti(false)
          }}
        />
      </Sheet>
      <ComeSiGiocaQuiz open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

function senzaAccenti(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

function ElencoPaesi({
  paesi,
  scelto,
  cosa,
  onScegli,
}: {
  paesi: PaeseConCorsi[]
  scelto: string | null
  cosa: 'fiumi' | 'laghi'
  onScegli: (id: string) => void
}) {
  const [cerca, setCerca] = useState('')
  const filtrati = useMemo(() => {
    const q = senzaAccenti(cerca.trim())
    return q ? paesi.filter((p) => senzaAccenti(p.n).includes(q)) : paesi
  }, [paesi, cerca])

  return (
    <div className="quiz-paesi">
      <input
        className="quiz-paesi__cerca"
        type="search"
        placeholder="Cerca un paese"
        aria-label="Cerca un paese"
        value={cerca}
        onChange={(e) => setCerca(e.target.value)}
        enterKeyHint="search"
      />
      {filtrati.length === 0 ? (
        <p className="quiz-paesi__vuoto">Nessun paese con abbastanza {cosa} per una partita.</p>
      ) : (
        <ul className="quiz-paesi__elenco">
          {filtrati.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`quiz-paese${p.id === scelto ? ' is-scelto' : ''}`}
                onClick={() => onScegli(p.id)}
              >
                <img
                  className="quiz-paese__bandiera"
                  src={urlBandiera(p.id.toLowerCase(), 40)}
                  srcSet={`${urlBandiera(p.id.toLowerCase(), 80)} 2x`}
                  alt=""
                  loading="lazy"
                />
                <span className="quiz-paese__nome">{p.n}</span>
                <span className="quiz-paese__conto">
                  {p.quanti} {cosa}
                </span>
                {p.id === scelto && <IconCheck size={16} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
