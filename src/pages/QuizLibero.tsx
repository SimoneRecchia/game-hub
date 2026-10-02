import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { Collegamento, useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Cursore } from '@/components/Cursore'
import { Elenco, Riga, Sezione, Tacche } from '@/components/Elementi'
import { IconCheck, IconChevronRight, IconInfo, IconPlay } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Sheet } from '@/components/Sheet'
import { urlBandiera } from '@/games/quiz/bandiere'
import { contaCitta } from '@/games/quiz/citta'
import { ComeSiGiocaQuiz } from '@/games/quiz/ComeSiGioca'
import { useIndiceQuiz } from '@/games/quiz/dati'
import { caricaCultura } from '@/games/quiz/fonti'
import { ICONE_MATERIE, IconBandiera, IconaCategoria } from '@/games/quiz/icone'
import { PartitaQuiz } from '@/games/quiz/PartitaQuiz'
import { SAGOME } from '@/games/quiz/sagome'
import { SfidaQuiz } from '@/games/quiz/sfida/SfidaQuiz'
import {
  DESCRIZIONI_MATERIE,
  VOCI_MATERIE,
  dettagliPartita,
  nomeArea,
  voceDi,
  type VoceMateria,
} from '@/games/quiz/testi'
import { leggiStatistiche } from '@/games/quiz/statistiche'
import { OPZIONI_PREDEFINITE, useQuizLibero, type ImpostazioniLibera } from '@/games/quiz/usePartita'
import { useDati } from '@/lib/dati'
import { frecceDelGruppo } from '@/lib/gruppo'
import { formatPercent } from '@/lib/format'
import { gameDate } from '@shared/daily'
import {
  AMBITI,
  CON_CONTINENTE,
  CON_PAESE,
  CONTINENTI,
  DOMANDE_PER_PARTITA,
  MATERIE,
  NOMI_CATEGORIE,
  NOMI_MODI,
  QUANTE_LIBERE,
  RISPOSTE_PREDEFINITE,
  SECONDI_LIBERI,
  SECONDI_SCELTA,
  TITOLI_AMBITI,
  ambitoValido,
  diGeografia,
  eCategoria,
  eModo,
  materiaDi,
  type CategoriaQuiz,
  type Continente,
  type MateriaQuiz,
  type ModoQuiz,
} from '@shared/quiz'
import { giornoDellAnno, giornoInLettere } from '@shared/quiz-cultura'
import { QUANTE_SFIDA, SECONDI_SFIDA, SECONDI_SFIDA_PREDEFINITI } from '@shared/quiz-sfida'
import type { AreaQuiz, IndiceQuiz, Notorieta } from '@shared/quiz-domande'
import { eCultura } from '@shared/quiz-domande-cultura'
import type { QuizSummary } from '@shared/types'
import './Quiz.css'

const PREDEFINITE: ImpostazioniLibera = {
  categoria: 'capitali',
  modo: 'scelta',
  area: 'mondo',
  quante: DOMANDE_PER_PARTITA,
  risposte: RISPOSTE_PREDEFINITE,
  notorieta: 'misti',
  ordine: 'sale',
  bandieraCapitali: true,
  ...OPZIONI_PREDEFINITE,
}

const CHIAVE_SCELTE = 'quiz-libera-scelte-v2'

/** La difficoltà, come nelle altre libere: una riga con le tacche per livello, e ognuna fa partire la partita. */
const LIVELLI: Array<{ notorieta: Notorieta; nome: string }> = [
  { notorieta: 'noti', nome: 'Facile' },
  { notorieta: 'misti', nome: 'Normale' },
  { notorieta: 'rari', nome: 'Difficile' },
]

/**
 * Le scelte, se stanno in piedi: una categoria che c'e', un'area o un ambito
 * che le vanno bene, numeri fra quelli previsti. Quel che non torna torna
 * com'era di solito. Le altre materie non hanno ne' la cartina ne' le zone.
 *
 * Si scelgono solo la categoria, dove o su cosa, quante domande, il tempo e la
 * difficoltà: il resto e' come nella classificata, con la spiegazione dopo ogni
 * risposta. Le opzioni di prima — gli aiuti, i tipi di domanda, quante
 * risposte — tornano ai valori di sempre anche se erano salvate o
 * nell'indirizzo.
 */
function valide(s: Partial<ImpostazioniLibera> | null | undefined): ImpostazioniLibera | null {
  if (!s || !eCategoria(s.categoria)) return null
  const categoria = s.categoria
  const geografia = diGeografia(categoria)
  const modo = geografia && eModo(s.modo) ? s.modo : 'scelta'
  const area = geografia ? (s.area ?? 'mondo') : 'mondo'
  const ambito = geografia ? 'tutti' : ambitoValido(categoria, s.ambito)
  const areaBuona =
    area === 'mondo' ||
    ((CONTINENTI as readonly string[]).includes(area) && CON_CONTINENTE.includes(categoria)) ||
    (/^paese:[A-Z]{2}$/.test(area) && CON_PAESE.includes(categoria))
  const quante = (QUANTE_LIBERE as readonly number[]).includes(s.quante ?? 0) ? s.quante! : DOMANDE_PER_PARTITA
  const secondi =
    s.secondi === null ? null : (SECONDI_LIBERI as readonly number[]).includes(s.secondi ?? 0) ? s.secondi! : SECONDI_SCELTA
  return {
    ...OPZIONI_PREDEFINITE,
    categoria,
    modo,
    area: areaBuona ? area : 'mondo',
    ...(ambito !== 'tutti' ? { ambito } : {}),
    ...(categoria === 'oggi' && s.giorno === 'caso' ? { giorno: 'caso' as const } : {}),
    quante,
    risposte: RISPOSTE_PREDEFINITE,
    notorieta: s.notorieta === 'noti' || s.notorieta === 'rari' ? s.notorieta : 'misti',
    ordine: 'sale',
    bandieraCapitali: true,
    secondi,
  }
}

/** La partita dall'indirizzo: `?categoria=fiumi&modo=cartina&paese=IT&domande=10`. Tornare indietro riporta alle scelte. */
function daIndirizzo(query: URLSearchParams): ImpostazioniLibera | null {
  const paese = query.get('paese')
  const tempo = query.get('tempo')
  const numero = (k: string) => (query.get(k) === null ? undefined : Number(query.get(k)))
  return valide({
    categoria: (query.get('categoria') ?? undefined) as CategoriaQuiz | undefined,
    modo: (query.get('modo') ?? undefined) as ModoQuiz | undefined,
    area: (paese ? `paese:${paese.toUpperCase()}` : (query.get('dove') ?? 'mondo')) as AreaQuiz,
    quante: numero('domande'),
    notorieta: (query.get('noti') ?? undefined) as Notorieta | undefined,
    secondi: tempo === 'no' ? null : numero('secondi'),
    ambito: query.get('ambito') ?? undefined,
    giorno: query.get('giorno') === 'caso' ? 'caso' : undefined,
  })
}

/** L'indirizzo della partita: solo quel che non e' come di solito, così resta un indirizzo che si legge. */
function indirizzo(s: ImpostazioniLibera): string {
  const q = new URLSearchParams({ categoria: s.categoria })
  if (s.modo === 'cartina') q.set('modo', 'cartina')
  if (s.area.startsWith('paese:')) q.set('paese', s.area.slice(6))
  else if (s.area !== 'mondo') q.set('dove', s.area)
  if (s.ambito && s.ambito !== 'tutti') q.set('ambito', s.ambito)
  if (s.giorno === 'caso') q.set('giorno', 'caso')
  q.set('domande', String(s.quante))
  if (s.secondi === null) q.set('tempo', 'no')
  else if (s.secondi !== SECONDI_SCELTA) q.set('secondi', String(s.secondi))
  if (s.notorieta !== 'misti') q.set('noti', s.notorieta ?? 'misti')
  return `${ROTTE.libera('quiz')}?${q}`
}

/** Le scelte dell'ultima partita, se ce n'e' stata una. */
function scelteSalvate(): ImpostazioniLibera | null {
  try {
    return valide(JSON.parse(localStorage.getItem(CHIAVE_SCELTE) ?? 'null'))
  } catch {
    return null
  }
}

/**
 * Cosa si e' scelto l'ultima volta in ogni materia: tornando alla geografia si
 * ritrovano le capitali d'Europa anche se in mezzo si e' giocato all'arte. Le
 * opzioni della partita invece sono una sola, per tutte le materie.
 */
const CHIAVE_ULTIME = 'quiz-libera-materie-v1'
type Ultima = Pick<ImpostazioniLibera, 'categoria' | 'modo' | 'area' | 'ambito' | 'giorno'>

function ultimeScelte(): Partial<Record<MateriaQuiz, Ultima>> {
  try {
    return (JSON.parse(localStorage.getItem(CHIAVE_ULTIME) ?? 'null') as Partial<Record<MateriaQuiz, Ultima>>) ?? {}
  } catch {
    return {}
  }
}

/** Le scelte con cui si apre la pagina di una materia. */
function scelteDellaMateria(materia: MateriaQuiz): ImpostazioniLibera {
  const salvate = scelteSalvate() ?? PREDEFINITE
  if (materiaDi(salvate.categoria) === materia) return salvate
  const ultima = ultimeScelte()[materia]
  const prima = VOCI_MATERIE[materia][0]
  const qui =
    ultima && materiaDi(ultima.categoria) === materia ? ultima : { categoria: prima.categoria, ambito: prima.ambito }
  // Le opzioni della partita restano quelle di prima; la categoria, la zona e l'ambito sono di questa materia.
  return valide({ ...salvate, area: 'mondo', ambito: undefined, giorno: undefined, tipi: undefined, ...qui }) ?? salvate
}

function salvaScelte(s: ImpostazioniLibera): void {
  try {
    localStorage.setItem(CHIAVE_SCELTE, JSON.stringify(s))
    const ultima: Ultima = { categoria: s.categoria, modo: s.modo, area: s.area, ambito: s.ambito, giorno: s.giorno }
    localStorage.setItem(CHIAVE_ULTIME, JSON.stringify({ ...ultimeScelte(), [materiaDi(s.categoria)]: ultima }))
  } catch {
    // Le scelte ricordate sono una comodità.
  }
}

const eMateria = (m: string | undefined): m is MateriaQuiz => MATERIE.some((x) => x.id === m)

/**
 * Il quiz libero, in tre schermate: il menu delle materie, la pagina di una
 * materia — le sue categorie, su cosa, la partita, le opzioni — e la partita.
 * Tutto nel browser, dagli stessi dati e con le stesse regole della
 * classificata, e non conta per la classifica.
 *
 * La partita sta nell'indirizzo del menu, con le scelte (`?categoria=…`): i
 * link condivisi di prima, che non avevano la materia, portano ancora alla
 * partita.
 */
export default function QuizLibero() {
  const [query] = useSearchParams()
  const { materia } = useParams()
  const chiave = query.toString()
  const impostazioni = useMemo(() => daIndirizzo(new URLSearchParams(chiave)), [chiave])
  if (impostazioni) return <Partita key={chiave} impostazioni={impostazioni} />
  if (eMateria(materia)) return <Scelta key={materia} materia={materia} />
  if (materia) return <Navigate to={ROTTE.libera('quiz')} replace />
  return <Menu />
}

/* ──────────────────────────────  Il menu  ─────────────────────────────── */

function Menu() {
  const { vai } = useNavigazione()
  const [query] = useSearchParams()
  const [statistiche] = useState(leggiStatistiche)
  const [regole, setRegole] = useState(false)
  const [ultima] = useState(scelteSalvate)
  const ix = useIndiceQuiz(!!ultima && diGeografia(ultima.categoria))

  // Dalla pagina del quiz, "Sfida un amico": si sfida con le scelte dell'ultima materia.
  const sfida = query.get('sfida') === '1'
  useEffect(() => {
    if (!sfida) return
    const materia = materiaDi(ultima?.categoria ?? PREDEFINITE.categoria)
    vai(`${ROTTE.materiaQuiz(materia)}?sfida=1`, { replace: true, direzione: 'nessuna' })
  }, [sfida, ultima, vai])

  const riassunto = ultima
    ? [NOMI_CATEGORIE[ultima.categoria], ...dettagliPartita(ultima, ix), `${ultima.quante} domande`]
        // Il modo si dice solo se e' la cartina: "Scelta multipla" e' come di solito.
        .filter((x) => x !== NOMI_MODI.scelta)
        .join(' · ')
    : null

  return (
    <Pagina
      titolo="Quiz"
      sotto={
        statistiche.domande > 0
          ? `${statistiche.partite} ${statistiche.partite === 1 ? 'partita' : 'partite'} · ${formatPercent(
              statistiche.giuste / statistiche.domande,
            )} di risposte giuste`
          : undefined
      }
      indietro={{ a: ROTTE.salotto, etichetta: 'Salotto' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      {ultima && riassunto && (
        <Sezione titolo="Gioca ancora">
          <button
            type="button"
            className={`quiz-ancora quiz-colori--${materiaDi(ultima.categoria)}`}
            onClick={() => vai(indirizzo(ultima))}
          >
            <span className="quiz-ancora__icona" aria-hidden="true">
              <IconaCategoria categoria={ultima.categoria} ambito={ultima.ambito} size={20} />
            </span>
            <span className="quiz-ancora__testi">
              <span className="quiz-ancora__titolo">Come l’ultima volta</span>
              <span className="quiz-ancora__sotto">{riassunto}</span>
            </span>
            <span className="quiz-ancora__via" aria-hidden="true">
              <IconPlay size={16} />
            </span>
          </button>
        </Sezione>
      )}

      <Sezione titolo="Scegli il quiz">
        <nav className="quiz-materie" aria-label="Materie">
          {MATERIE.map((m, i) => {
            const Icona = ICONE_MATERIE[m.id]
            const record = Math.max(-1, ...m.categorie.map((c) => statistiche.migliori[c] ?? -1))
            return (
              <Collegamento
                key={m.id}
                to={ROTTE.materiaQuiz(m.id)}
                className={`quiz-materia quiz-colori--${m.id}`}
                style={{ '--n': i } as CSSProperties}
              >
                <span className="quiz-materia__icona" aria-hidden="true">
                  <Icona size={28} />
                </span>
                <span className="quiz-materia__testi">
                  <span className="quiz-materia__nome">{m.nome}</span>
                  <span className="quiz-materia__sotto">{DESCRIZIONI_MATERIE[m.id]}</span>
                  {record >= 0 && <span className="quiz-materia__record">record {record}%</span>}
                </span>
                <IconChevronRight size={20} className="quiz-materia__freccia" />
              </Collegamento>
            )
          })}
        </nav>
      </Sezione>
      <ComeSiGiocaQuiz open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

/* ───────────────────────────────  La partita  ──────────────────────────── */

function Partita({ impostazioni }: { impostazioni: ImpostazioniLibera }) {
  const p = useQuizLibero(impostazioni)
  const { indietro } = useNavigazione()
  const geografia = diGeografia(impostazioni.categoria)
  const ix = useIndiceQuiz(geografia)
  const [regole, setRegole] = useState(false)
  const s = p.statistiche
  // Dove si gioca, o su cosa: la zona per la geografia, l'ambito o il giorno per le altre materie.
  const dove = geografia
    ? [nomeArea(impostazioni.area, ix)]
    : dettagliPartita({ ...impostazioni, giorno: p.giorno }, ix)
  const extra = ['Libera', ...dove, impostazioni.morteImprovvisa ? 'morte improvvisa' : null].filter(Boolean)

  const materia = materiaDi(impostazioni.categoria)
  const scelte = ROTTE.materiaQuiz(materia)
  return (
    <Pagina
      titolo="Quiz libero"
      intera
      indietro={{ a: scelte, etichetta: MATERIE.find((m) => m.id === materia)!.nome }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      <PartitaQuiz
        p={p}
        classificata={false}
        intro={{ titolo: NOMI_CATEGORIE[impostazioni.categoria], sotto: extra.join(' · ') }}
        azioniFine={
          <>
            <Button size="lg" fullWidth onClick={p.riprova}>
              Un’altra partita
            </Button>
            <Button variant="tinted" size="lg" fullWidth onClick={() => indietro(scelte)}>
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

interface PaeseConVoci {
  id: string
  n: string
  quanti: number
}

/** Quanti ce ne vogliono, al minimo, per una partita su un paese solo. */
const MINIMO_PER_PAESE = 5

/** I paesi con abbastanza città, fiumi o laghi per una partita. */
function paesiCon(ix: IndiceQuiz, categoria: CategoriaQuiz, conti: Map<string, number> | null): PaeseConVoci[] {
  const quanti = new Map<string, number>()
  if (categoria === 'citta') {
    for (const [id, n] of conti ?? []) quanti.set(id, n)
  } else if (categoria === 'fiumi' || categoria === 'laghi') {
    for (const c of ix.dati[categoria]) for (const id of c.p) quanti.set(id, (quanti.get(id) ?? 0) + 1)
  }
  return ix.dati.paesi
    .map((p) => ({ id: p.id, n: p.n, quanti: quanti.get(p.id) ?? 0 }))
    .filter((p) => p.quanti >= MINIMO_PER_PAESE)
    .sort((a, b) => a.n.localeCompare(b.n, 'it'))
}

const PAROLE_PAESE: Partial<Record<CategoriaQuiz, string>> = { citta: 'città', fiumi: 'fiumi', laghi: 'laghi' }

/** Da soli o contro un amico: come Computer | Amico nelle sale dei giochi da tavolo, e si ricorda. */
type Contro = 'solo' | 'amico'
const CHIAVE_CONTRO = 'quiz-libera-contro'

function leggiContro(): Contro {
  try {
    return localStorage.getItem(CHIAVE_CONTRO) === 'amico' ? 'amico' : 'solo'
  } catch {
    return 'solo'
  }
}

/** Il valore piu' vicino fra quelli che si possono scegliere: 50 domande da soli sono 20 in una sfida. */
function vicino<T extends number>(valori: readonly T[], x: number | null | undefined, predefinito: T): T {
  if (x === null || x === undefined) return predefinito
  return valori.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a))
}

/** Il tempo da soli: i secondi, e in fondo senza tempo, che e' il piu' lungo di tutti. */
const TEMPI_LIBERI: ReadonlyArray<number | null> = [...SECONDI_LIBERI, null]

function Scelta({ materia }: { materia: MateriaQuiz }) {
  const { vai } = useNavigazione()
  const [scelte, setScelte] = useState(() => scelteDellaMateria(materia))
  const [foglio, setFoglio] = useState<'zona' | 'paese' | 'ambito' | null>(null)
  // `?sfida=1`: si arriva dal menu per sfidare un amico.
  const [query] = useSearchParams()
  const [contro, setContro] = useState<Contro>(() => (query.get('sfida') === '1' ? 'amico' : leggiContro()))
  const [sfida, setSfida] = useState(false)
  const [regole, setRegole] = useState(false)
  const [statistiche] = useState(leggiStatistiche)

  const { categoria, modo = 'scelta' } = scelte
  const geografia = diGeografia(categoria)
  const voce = voceDi(materia, categoria, scelte.ambito)
  const conAmico = contro === 'amico'

  // I dati servono alla partita: scaricarli mentre si sceglie la fa partire subito.
  const ix = useIndiceQuiz(geografia)
  useEffect(() => {
    if (eCultura(categoria) && categoria !== 'oggi') caricaCultura(categoria).catch(() => {})
  }, [categoria])
  const [contiCitta, setContiCitta] = useState<Map<string, number> | null>(null)
  useEffect(() => {
    if (!ix || categoria !== 'citta' || contiCitta) return
    let vivo = true
    contaCitta(ix)
      .then((c) => vivo && setContiCitta(c))
      .catch(() => {
        // Senza le città l'elenco dei paesi resta vuoto: lo dice lui.
      })
    return () => {
      vivo = false
    }
  }, [ix, categoria, contiCitta])

  // "Accadde oggi" di oggi aspetta la classificata, se oggi la classificata e' proprio quella.
  const { dati: delGiorno } = useDati<QuizSummary>(categoria === 'oggi' ? '/quiz/summary' : null)
  const oggiChiuso = delGiorno?.categoria === 'oggi' && delGiorno.status !== 'done'

  const cambia = (nuove: Partial<ImpostazioniLibera>) => setScelte((s) => valide({ ...s, ...nuove }) ?? s)

  const scegliVoce = (v: VoceMateria) => cambia({ categoria: v.categoria, ambito: v.ambito })

  const scegliContro = (c: Contro) => {
    setContro(c)
    try {
      localStorage.setItem(CHIAVE_CONTRO, c)
    } catch {
      // E' una comodita'.
    }
  }

  // Con un amico le domande e i secondi sono quelli della sfida: si vedono quelli, e si gioca con quelli.
  const quante = conAmico ? vicino(QUANTE_SFIDA, scelte.quante, 10) : scelte.quante
  const secondi = conAmico ? vicino(SECONDI_SFIDA, scelte.secondi, SECONDI_SFIDA_PREDEFINITI) : scelte.secondi

  // La difficoltà scelta fa partire la partita, o la sfida; e resta per la prossima volta.
  const comincia = (notorieta: Notorieta) => {
    const pronte = { ...scelte, notorieta, quante, secondi }
    setScelte(pronte)
    salvaScelte(pronte)
    if (conAmico) {
      setSfida(true)
      return
    }
    // Se oggi non si puo', un giorno a caso: ma la scelta ricordata resta "oggi", che domani si potra'.
    vai(indirizzo(oggiChiuso ? { ...pronte, giorno: 'caso' } : pronte))
  }

  const conContinente = CON_CONTINENTE.includes(categoria)
  const conPaese = CON_PAESE.includes(categoria)
  const paese = scelte.area.startsWith('paese:') ? scelte.area.slice(6) : null
  const elencoPaesi = useMemo(
    () => (ix && conPaese ? paesiCon(ix, categoria, contiCitta) : []),
    [ix, conPaese, categoria, contiCitta],
  )
  // L'ambito si sceglie solo se la voce non e' gia' un argomento: la chimica non ha altro da scegliere.
  const ambiti = voce?.ambito === undefined ? AMBITI[categoria] : undefined
  const ambito = ambiti?.find((a) => a.id === (scelte.ambito ?? 'tutti'))
  // Sulla cartina il tempo e' il doppio: si mostrano i secondi veri del modo scelto.
  const perModo = modo === 'cartina' ? 2 : 1
  const voci = VOCI_MATERIE[materia]
  const nome = MATERIE.find((m) => m.id === materia)!.nome
  const colore = `var(--materia-${materia}-1)`
  const dove = geografia && (conContinente || conPaese)

  return (
    <Pagina
      titolo={nome}
      indietro={{ a: ROTTE.libera('quiz'), etichetta: 'Quiz' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      <SegmentedControl
        ariaLabel="Contro chi"
        value={contro}
        onChange={scegliContro}
        options={[
          { value: 'solo', label: 'Da solo' },
          { value: 'amico', label: 'Con un amico' },
        ]}
      />

      <Sezione titolo="Categoria">
        <div
          className={`quiz-categorie quiz-colori--${materia}`}
          role="radiogroup"
          aria-label="Categoria"
          onKeyDown={frecceDelGruppo}
        >
          {voci.map((v, i) => {
            const scelta = v === voce
            // I record sono per categoria: gli argomenti della scienza non hanno il loro.
            const tutta = v.ambito === undefined || v.ambito === 'tutti'
            const record = tutta ? statistiche.migliori[v.categoria] : undefined
            return (
              <button
                key={`${v.categoria}:${v.ambito ?? ''}`}
                type="button"
                role="radio"
                aria-checked={scelta}
                tabIndex={scelta || (!voce && i === 0) ? 0 : -1}
                className={`quiz-tessera${scelta ? ' is-scelta' : ''}`}
                style={{ '--n': i } as CSSProperties}
                onClick={() => scegliVoce(v)}
              >
                <span className="quiz-tessera__icona" aria-hidden="true">
                  <IconaCategoria categoria={v.categoria} ambito={v.ambito} size={19} />
                </span>
                <span className="quiz-tessera__testi">
                  <span className="quiz-tessera__nome">{v.nome}</span>
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

      <Sezione titolo="Partita">
        <Opzioni>
          {geografia && (
            <Scelte titolo="Come rispondi">
              <SegmentedControl
                ariaLabel="Come rispondi"
                options={[
                  { value: 'scelta', label: NOMI_MODI.scelta },
                  { value: 'cartina', label: NOMI_MODI.cartina },
                ]}
                value={modo}
                onChange={(v) => cambia({ modo: v })}
              />
            </Scelte>
          )}
          {dove && (
            <RigaFoglio
              titolo="Dove"
              valore={nomeArea(scelte.area, ix)}
              icona={
                paese ? (
                  <img className="quiz-impostazione__bandiera" src={urlBandiera(paese.toLowerCase(), 40)} alt="" />
                ) : (
                  <Sagoma
                    zona={scelte.area === 'mondo' ? 'mondo' : (scelte.area as Continente)}
                    piccola
                    colore={colore}
                  />
                )
              }
              onClick={() => setFoglio('zona')}
            />
          )}
          {ambiti && ambito && (
            <RigaFoglio
              titolo={TITOLI_AMBITI[categoria] ?? 'Quali'}
              valore={ambito.nome}
              onClick={() => setFoglio('ambito')}
            />
          )}
          {categoria === 'oggi' && (
            <Scelte titolo="Giorno" sotto={oggiChiuso ? 'Oggi si gioca dopo il quiz del giorno' : undefined}>
              <SegmentedControl
                ariaLabel="Quale giorno"
                value={scelte.giorno === 'caso' || oggiChiuso ? 'caso' : 'oggi'}
                onChange={(v) => {
                  if (v === 'oggi' && oggiChiuso) return
                  cambia({ giorno: v === 'caso' ? 'caso' : undefined })
                }}
                options={[
                  { value: 'oggi', label: `Oggi, ${giornoInLettere(giornoDellAnno(gameDate()))}` },
                  { value: 'caso', label: 'A caso' },
                ]}
              />
            </Scelte>
          )}
          <Scelte titolo="Domande" valore={String(quante)}>
            <Cursore
              ariaLabel="Domande"
              valori={conAmico ? QUANTE_SFIDA : QUANTE_LIBERE}
              valore={quante}
              etichetta={String}
              onChange={(n) => cambia({ quante: n })}
            />
          </Scelte>
          <Scelte titolo="Tempo per domanda" valore={secondi === null ? 'Senza limite' : `${secondi * perModo} s`}>
            <Cursore
              ariaLabel="Tempo per domanda"
              valori={conAmico ? SECONDI_SFIDA : TEMPI_LIBERI}
              valore={secondi}
              etichetta={(t) => (t === null ? 'Senza' : `${t * perModo} s`)}
              voce={(t) => (t === null ? 'senza tempo' : `${t * perModo} secondi`)}
              onChange={(t) => cambia({ secondi: t })}
            />
          </Scelte>
        </Opzioni>
      </Sezione>

      <Sezione titolo="Difficoltà">
        <Elenco>
          {LIVELLI.map((l, i) => (
            <Riga
              key={l.notorieta}
              icona={<Tacche piene={i + 1} colore={colore} />}
              titolo={l.nome}
              onClick={() => comincia(l.notorieta)}
            />
          ))}
        </Elenco>
      </Sezione>

      <SfidaQuiz open={sfida} onClose={() => setSfida(false)} scelte={{ ...scelte, quante, secondi }} />

      <Sheet open={foglio === 'zona'} onClose={() => setFoglio(null)} title="Dove">
        <div className={`quiz-zone-tessere quiz-colori--${materia}`}>
          {(['mondo', ...(conContinente ? CONTINENTI : [])] as Array<'mondo' | Continente>).map((z) => (
            <button
              key={z}
              type="button"
              aria-current={scelte.area === z || undefined}
              className={`quiz-zona-tessera${scelte.area === z ? ' is-scelta' : ''}`}
              onClick={() => {
                cambia({ area: z })
                setFoglio(null)
              }}
            >
              <Sagoma zona={z} />
              <span className="quiz-zona-tessera__nome">{nomeArea(z, ix)}</span>
            </button>
          ))}
          {conPaese && (
            <button
              type="button"
              aria-current={paese !== null || undefined}
              className={`quiz-zona-tessera quiz-zona-tessera--paese${paese ? ' is-scelta' : ''}`}
              disabled={!ix}
              onClick={() => setFoglio('paese')}
            >
              <span className="quiz-zona-tessera__bandiera" aria-hidden="true">
                {paese ? <img src={urlBandiera(paese.toLowerCase(), 80)} alt="" /> : <IconBandiera size={30} />}
              </span>
              <span className="quiz-zona-tessera__nome">{paese ? nomeArea(scelte.area, ix) : 'Un paese'}</span>
            </button>
          )}
        </div>
      </Sheet>

      <Sheet open={foglio === 'paese'} onClose={() => setFoglio(null)} title="Scegli un paese">
        <ElencoPaesi
          paesi={elencoPaesi}
          scelto={paese}
          cosa={PAROLE_PAESE[categoria] ?? ''}
          onScegli={(id) => {
            cambia({ area: `paese:${id}` })
            setFoglio(null)
          }}
        />
      </Sheet>

      {ambiti && (
        <Sheet open={foglio === 'ambito'} onClose={() => setFoglio(null)} title={TITOLI_AMBITI[categoria] ?? ''}>
          <Elenco>
            {ambiti.map((a) => (
              <Riga
                key={a.id}
                titolo={a.nome}
                scelta={(scelte.ambito ?? 'tutti') === a.id}
                onClick={() => {
                  cambia({ ambito: a.id })
                  setFoglio(null)
                }}
              />
            ))}
          </Elenco>
        </Sheet>
      )}

      <ComeSiGiocaQuiz open={regole} onClose={() => setRegole(false)} />
    </Pagina>
  )
}

/** Una riga che apre un foglio: il nome a sinistra, la scelta a destra, come nelle Impostazioni. */
function RigaFoglio({
  titolo,
  valore,
  icona,
  onClick,
}: {
  titolo: string
  valore: string
  icona?: ReactNode
  onClick: () => void
}) {
  return (
    <button type="button" className="quiz-impostazione quiz-impostazione--riga" onClick={onClick}>
      <span className="quiz-impostazione__titolo">{titolo}</span>
      <span className="quiz-impostazione__valore">
        {icona}
        <span className="quiz-impostazione__scelta">{valore}</span>
      </span>
      <IconChevronRight size={18} className="quiz-impostazione__freccia" />
    </button>
  )
}

/** La sagoma di una zona: le sue terre nel colore della materia, quelle intorno in grigio. */
function Sagoma({ zona, piccola = false, colore }: { zona: 'mondo' | Continente; piccola?: boolean; colore?: string }) {
  const s = SAGOME[zona]
  return (
    <svg
      className={`sagoma${piccola ? ' sagoma--piccola' : ''}`}
      viewBox={`0 0 ${s.larga} ${s.alta}`}
      style={colore ? ({ '--m1': colore } as CSSProperties) : undefined}
      aria-hidden="true"
    >
      <path className="sagoma__resto" d={s.resto} />
      <path className="sagoma__zona" d={s.zona} />
    </svg>
  )
}

/** Un gruppo di opzioni in una carta, una riga per opzione, come nelle Impostazioni. */
function Opzioni({ children }: { children: ReactNode }) {
  return <div className="quiz-impostazioni">{children}</div>
}

/**
 * Una riga con il suo nome, se serve una riga che spiega, e sotto il
 * controllo. `valore` e' quel che dice un cursore, scritto a destra del nome:
 * sotto la pista lo coprirebbe il dito che lo trascina.
 */
function Scelte({
  titolo,
  sotto,
  valore,
  children,
}: {
  titolo: string
  sotto?: string
  valore?: string
  children: ReactNode
}) {
  return (
    <div className="quiz-impostazione">
      <span className="quiz-impostazione__testa">
        <span className="quiz-impostazione__testi">
          <span className="quiz-impostazione__titolo">{titolo}</span>
          {sotto && <span className="quiz-impostazione__sotto">{sotto}</span>}
        </span>
        {valore && (
          <span className="quiz-impostazione__numero" aria-hidden="true">
            {valore}
          </span>
        )}
      </span>
      {children}
    </div>
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
  paesi: PaeseConVoci[]
  scelto: string | null
  cosa: string
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
        <p className="quiz-paesi__vuoto">
          {paesi.length === 0 ? 'Nessun paese disponibile.' : 'Nessun paese trovato.'}
        </p>
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
