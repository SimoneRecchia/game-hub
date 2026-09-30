import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { Collegamento, useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Sezione } from '@/components/Elementi'
import { IconCheck, IconChevronRight, IconInfo, IconPeople, IconPlay } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Sheet } from '@/components/Sheet'
import { urlBandiera } from '@/games/quiz/bandiere'
import { contaCitta } from '@/games/quiz/citta'
import { ComeSiGiocaQuiz } from '@/games/quiz/ComeSiGioca'
import { useIndiceQuiz } from '@/games/quiz/dati'
import { caricaCultura } from '@/games/quiz/fonti'
import { ICONE_MATERIE, IconaCategoria } from '@/games/quiz/icone'
import { PartitaQuiz } from '@/games/quiz/PartitaQuiz'
import { SfidaQuiz } from '@/games/quiz/sfida/SfidaQuiz'
import {
  COSA_INSEGNA,
  DESCRIZIONI_MATERIE,
  VOCI_MATERIE,
  descrizione,
  dettagliPartita,
  nomeArea,
  nomeTipo,
  voceDi,
  type VoceMateria,
} from '@/games/quiz/testi'
import { leggiStatistiche } from '@/games/quiz/statistiche'
import { OPZIONI_PREDEFINITE, useQuizLibero, type ImpostazioniLibera } from '@/games/quiz/usePartita'
import { useDati } from '@/lib/dati'
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
  RISPOSTE_LIBERE,
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
  type MateriaQuiz,
  type ModoQuiz,
} from '@shared/quiz'
import { giornoDellAnno, giornoInLettere } from '@shared/quiz-cultura'
import { tipiPossibili, type AreaQuiz, type IndiceQuiz, type Notorieta, type TipoDomanda } from '@shared/quiz-domande'
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

const NOTORIETA: Array<{ value: Notorieta; label: string }> = [
  { value: 'noti', label: 'Facile' },
  { value: 'misti', label: 'Mista' },
  { value: 'rari', label: 'Difficile' },
]

/**
 * Le scelte, se stanno in piedi: una categoria che c'e', un'area o un ambito
 * che le vanno bene, numeri fra quelli previsti. Quel che non torna torna
 * com'era di solito. Le altre materie non hanno ne' la cartina ne' le zone.
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
  const risposte = (RISPOSTE_LIBERE as readonly number[]).includes(s.risposte ?? 0) ? s.risposte! : RISPOSTE_PREDEFINITE
  const secondi =
    s.secondi === null ? null : (SECONDI_LIBERI as readonly number[]).includes(s.secondi ?? 0) ? s.secondi! : SECONDI_SCELTA
  const possibili = tipiPossibili(categoria, modo, ambito)
  const tipi = (s.tipi ?? []).filter((t) => possibili.includes(t))
  const si = (v: boolean | undefined, predefinito: boolean) => (typeof v === 'boolean' ? v : predefinito)
  return {
    categoria,
    modo,
    area: areaBuona ? area : 'mondo',
    ...(ambito !== 'tutti' ? { ambito } : {}),
    ...(categoria === 'oggi' && s.giorno === 'caso' ? { giorno: 'caso' as const } : {}),
    quante,
    risposte,
    ...(tipi.length > 0 && tipi.length < possibili.length ? { tipi } : {}),
    notorieta: s.notorieta === 'noti' || s.notorieta === 'rari' ? s.notorieta : 'misti',
    ordine: s.ordine === 'caso' ? 'caso' : 'sale',
    bandieraCapitali: si(s.bandieraCapitali, true),
    secondi,
    imparo: si(s.imparo, OPZIONI_PREDEFINITE.imparo),
    avantiDaSolo: si(s.avantiDaSolo, OPZIONI_PREDEFINITE.avantiDaSolo),
    evidenzia: si(s.evidenzia, OPZIONI_PREDEFINITE.evidenzia),
    soloZona: si(s.soloZona, OPZIONI_PREDEFINITE.soloZona),
    nomiPaesi: si(s.nomiPaesi, OPZIONI_PREDEFINITE.nomiPaesi),
    aiuti: si(s.aiuti, OPZIONI_PREDEFINITE.aiuti),
    morteImprovvisa: si(s.morteImprovvisa, OPZIONI_PREDEFINITE.morteImprovvisa),
    ripasso: si(s.ripasso, OPZIONI_PREDEFINITE.ripasso),
  }
}

/**
 * I segni dell'indirizzo: solo quel che non e' come di solito, così
 * `?categoria=fiumi&paese=IT` resta un indirizzo che si legge.
 */
const BANDIERINE: Array<[keyof ImpostazioniLibera, string, boolean]> = [
  ['bandieraCapitali', 'bandiera', true],
  ['imparo', 'imparo', true],
  ['avantiDaSolo', 'avanti', false],
  ['evidenzia', 'evidenzia', true],
  ['soloZona', 'zona', true],
  ['nomiPaesi', 'nomi', false],
  ['aiuti', 'aiuti', false],
  ['morteImprovvisa', 'morte', false],
  ['ripasso', 'ripasso', false],
]

/** La partita dall'indirizzo: `?categoria=fiumi&modo=cartina&paese=IT&domande=10`. Tornare indietro riporta alle scelte. */
function daIndirizzo(query: URLSearchParams): ImpostazioniLibera | null {
  const paese = query.get('paese')
  const tempo = query.get('tempo')
  const numero = (k: string) => (query.get(k) === null ? undefined : Number(query.get(k)))
  const scelte: Partial<ImpostazioniLibera> = {
    categoria: (query.get('categoria') ?? undefined) as CategoriaQuiz | undefined,
    modo: (query.get('modo') ?? undefined) as ModoQuiz | undefined,
    area: (paese ? `paese:${paese.toUpperCase()}` : (query.get('dove') ?? 'mondo')) as AreaQuiz,
    quante: numero('domande'),
    risposte: numero('risposte'),
    tipi: (query.get('tipi') ?? '').split(',').filter(Boolean) as TipoDomanda[],
    notorieta: (query.get('noti') ?? undefined) as Notorieta | undefined,
    ordine: query.get('ordine') === 'caso' ? 'caso' : 'sale',
    secondi: tempo === 'no' ? null : numero('secondi'),
    ambito: query.get('ambito') ?? undefined,
    giorno: query.get('giorno') === 'caso' ? 'caso' : undefined,
  }
  for (const [chiave, segno, predefinito] of BANDIERINE) {
    const v = query.get(segno)
    ;(scelte as Record<string, unknown>)[chiave] = v === null ? predefinito : v === 'si'
  }
  return valide(scelte)
}

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
  if (s.risposte !== RISPOSTE_PREDEFINITE && s.modo === 'scelta') q.set('risposte', String(s.risposte))
  if (s.tipi?.length) q.set('tipi', s.tipi.join(','))
  if (s.notorieta !== 'misti') q.set('noti', s.notorieta ?? 'misti')
  if (s.ordine === 'caso') q.set('ordine', 'caso')
  for (const [chiave, segno, predefinito] of BANDIERINE) {
    if (s[chiave] !== predefinito) q.set(segno, s[chiave] ? 'si' : 'no')
  }
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
      titolo="Quiz libero"
      sotto={
        statistiche.domande > 0
          ? `${statistiche.partite} ${statistiche.partite === 1 ? 'partita' : 'partite'} · ${formatPercent(
              statistiche.giuste / statistiche.domande,
            )} di risposte giuste`
          : 'Non conta per la classifica.'
      }
      indietro={{ a: ROTTE.gioco('quiz'), etichetta: 'Quiz' }}
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

function Scelta({ materia }: { materia: MateriaQuiz }) {
  const { vai } = useNavigazione()
  const [scelte, setScelte] = useState(() => scelteDellaMateria(materia))
  const [paesiAperti, setPaesiAperti] = useState(false)
  // `?sfida=1`: si arriva dalla pagina del quiz con il foglio della sfida gia' aperto.
  const [query] = useSearchParams()
  const [sfida, setSfida] = useState(query.get('sfida') === '1')
  const [avanzate, setAvanzate] = useState(false)
  const [regole, setRegole] = useState(false)
  const [statistiche] = useState(leggiStatistiche)

  const { categoria, modo = 'scelta' } = scelte
  const geografia = diGeografia(categoria)
  const voce = voceDi(materia, categoria, scelte.ambito)

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

  const scegliVoce = (v: VoceMateria) => cambia({ categoria: v.categoria, ambito: v.ambito, tipi: undefined })

  const comincia = () => {
    salvaScelte(scelte)
    // Se oggi non si puo', un giorno a caso: ma la scelta ricordata resta "oggi", che domani si potra'.
    vai(indirizzo(oggiChiuso ? { ...scelte, giorno: 'caso' } : scelte))
  }

  const conContinente = CON_CONTINENTE.includes(categoria)
  const conPaese = CON_PAESE.includes(categoria)
  const paese = scelte.area.startsWith('paese:') ? scelte.area.slice(6) : null
  const elencoPaesi = useMemo(
    () => (ix && conPaese ? paesiCon(ix, categoria, contiCitta) : []),
    [ix, conPaese, categoria, contiCitta],
  )
  const aree: AreaQuiz[] = conContinente ? ['mondo', ...CONTINENTI] : ['mondo']
  // L'ambito si sceglie sotto solo se la voce non e' gia' un argomento: la chimica non ha altro da scegliere.
  const ambiti = voce?.ambito === undefined ? AMBITI[categoria] : undefined
  const tipi = tipiPossibili(categoria, modo, scelte.ambito)
  const tipiScelti = scelte.tipi?.length ? scelte.tipi : tipi
  const secondi = scelte.secondi ?? SECONDI_SCELTA
  // Sulla cartina il tempo e' il doppio: si mostrano i secondi veri del modo scelto.
  const perModo = cartina(scelte) ? 2 : 1
  const riassunto = riassuntoAvanzate(scelte)
  const voci = VOCI_MATERIE[materia]
  const sullaCartina = cartina(scelte)
  const nome = MATERIE.find((m) => m.id === materia)!.nome

  return (
    <Pagina
      titolo={nome}
      indietro={{ a: ROTTE.libera('quiz'), etichetta: 'Quiz libero' }}
      azioni={
        <BottoneBarra etichetta="Come si gioca" onClick={() => setRegole(true)}>
          <IconInfo size={21} />
        </BottoneBarra>
      }
    >
      <Sezione titolo="Categoria">
        <div className={`quiz-categorie quiz-colori--${materia}`} role="radiogroup" aria-label="Categoria">
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
        {/* Che cosa si chiede, in una riga: cambia con la categoria e con il modo. */}
        <p className="quiz-scelta__cosa" aria-live="polite">
          {voce?.descrizione ?? descrizione(categoria, modo)}
        </p>
      </Sezione>

      {geografia && (
        <>
          <Sezione titolo="Come rispondi">
            <SegmentedControl
              ariaLabel="Come rispondi"
              options={[
                { value: 'scelta', label: NOMI_MODI.scelta },
                { value: 'cartina', label: NOMI_MODI.cartina },
              ]}
              value={modo}
              onChange={(v) => cambia({ modo: v, tipi: undefined })}
            />
          </Sezione>

          <Sezione titolo="Dove">
            <div className="quiz-zone" role="radiogroup" aria-label="Dove">
              {aree.map((a) => (
                <Capsula key={a} scelta={scelte.area === a} onClick={() => cambia({ area: a })}>
                  {nomeArea(a, ix)}
                </Capsula>
              ))}
              {conPaese && (
                <Capsula scelta={paese !== null} onClick={() => setPaesiAperti(true)} disabilitata={!ix}>
                  {paese && (
                    <img
                      className="quiz-zona__bandiera"
                      src={urlBandiera(paese.toLowerCase(), 40)}
                      srcSet={`${urlBandiera(paese.toLowerCase(), 80)} 2x`}
                      alt=""
                    />
                  )}
                  {paese ? nomeArea(scelte.area, ix) : 'Un paese…'}
                </Capsula>
              )}
            </div>
          </Sezione>
        </>
      )}

      {ambiti && (
        <Sezione titolo={TITOLI_AMBITI[categoria]}>
          <div className="quiz-zone" role="radiogroup" aria-label={TITOLI_AMBITI[categoria]}>
            {ambiti.map((a) => (
              <Capsula
                key={a.id}
                scelta={(scelte.ambito ?? 'tutti') === a.id}
                onClick={() => cambia({ ambito: a.id, tipi: undefined })}
              >
                {a.nome}
              </Capsula>
            ))}
          </div>
        </Sezione>
      )}

      {categoria === 'oggi' && (
        <Sezione titolo="Quale giorno" nota={oggiChiuso ? 'Oggi si gioca dopo il quiz del giorno.' : undefined}>
          <div className="quiz-zone" role="radiogroup" aria-label="Quale giorno">
            <Capsula
              scelta={scelte.giorno !== 'caso' && !oggiChiuso}
              disabilitata={oggiChiuso}
              onClick={() => cambia({ giorno: undefined })}
            >
              Oggi, {giornoInLettere(giornoDellAnno(gameDate()))}
            </Capsula>
            <Capsula scelta={scelte.giorno === 'caso' || oggiChiuso} onClick={() => cambia({ giorno: 'caso' })}>
              Un giorno a caso
            </Capsula>
          </div>
        </Sezione>
      )}

      <Sezione titolo="Partita">
        <Opzioni>
          <Scelte titolo="Domande">
            <SegmentedControl
              ariaLabel="Quante domande"
              options={QUANTE_LIBERE.map((n) => ({ value: String(n), label: String(n) }))}
              value={String(scelte.quante)}
              onChange={(v) => cambia({ quante: Number(v) })}
            />
          </Scelte>
          <Scelte titolo="Difficoltà" sotto={DIFFICOLTA[categoria]}>
            <SegmentedControl
              ariaLabel="Difficoltà"
              options={NOTORIETA}
              value={scelte.notorieta ?? 'misti'}
              onChange={(v) => cambia({ notorieta: v })}
            />
          </Scelte>
          <Scelte titolo="Tempo per domanda">
            <SegmentedControl
              ariaLabel="Tempo per domanda"
              options={[
                { value: 'senza', label: 'No' },
                ...SECONDI_LIBERI.map((n) => ({ value: String(n), label: `${n * perModo} s` })),
              ]}
              value={scelte.secondi === null ? 'senza' : String(secondi)}
              onChange={(v) => cambia({ secondi: v === 'senza' ? null : Number(v) })}
            />
          </Scelte>
        </Opzioni>
      </Sezione>

      <Sezione titolo="Impara">
        <Opzioni>
          <Interruttore
            titolo={geografia ? 'Cartina dopo ogni risposta' : 'Spiegazione dopo ogni risposta'}
            sotto={COSA_INSEGNA[categoria]}
            acceso={scelte.imparo}
            onCambia={(si) => cambia({ imparo: si })}
          />
        </Opzioni>
      </Sezione>

      <button
        type="button"
        className={`quiz-avanzate${avanzate ? ' is-aperte' : ''}`}
        aria-expanded={avanzate}
        onClick={() => setAvanzate((a) => !a)}
      >
        <span className="quiz-avanzate__testi">
          <span className="quiz-avanzate__titolo">Opzioni avanzate</span>
          <span className="quiz-avanzate__sotto">{riassunto ?? 'Risposte, aiuti e tipi di domanda'}</span>
        </span>
        <IconChevronRight size={18} className="quiz-avanzate__freccia" />
      </button>

      {avanzate && (
        <div className="quiz-avanzate__corpo">
          <Sezione titolo="Risposte">
            <Opzioni>
              {!sullaCartina && (
                <Scelte titolo="Risposte tra cui scegliere">
                  <SegmentedControl
                    ariaLabel="Risposte tra cui scegliere"
                    options={RISPOSTE_LIBERE.map((n) => ({ value: String(n), label: String(n) }))}
                    value={String(scelte.risposte ?? RISPOSTE_PREDEFINITE)}
                    onChange={(v) => cambia({ risposte: Number(v) })}
                  />
                </Scelte>
              )}
              <Scelte titolo="Ordine delle domande">
                <SegmentedControl
                  ariaLabel="Ordine delle domande"
                  options={[
                    { value: 'sale', label: 'Dalla più facile' },
                    { value: 'caso', label: 'A caso' },
                  ]}
                  value={scelte.ordine ?? 'sale'}
                  onChange={(v) => cambia({ ordine: v })}
                />
              </Scelte>
              <Interruttore
                titolo="Avanti automatico"
                sotto="Passa da solo alla domanda dopo"
                acceso={scelte.avantiDaSolo}
                onCambia={(si) => cambia({ avantiDaSolo: si })}
              />
            </Opzioni>
          </Sezione>

          <Sezione titolo="Aiuti e sfide">
            <Opzioni>
              {!sullaCartina && (
                <Interruttore
                  titolo="Due aiuti 50 e 50"
                  sotto="Tolgono metà delle risposte sbagliate"
                  acceso={scelte.aiuti}
                  onCambia={(si) => cambia({ aiuti: si })}
                />
              )}
              <Interruttore
                titolo="Ripeti le sbagliate"
                sotto="Alla fine, un’altra volta"
                acceso={scelte.ripasso}
                onCambia={(si) => cambia({ ripasso: si })}
              />
              <Interruttore
                titolo="Morte improvvisa"
                sotto="La partita finisce al primo errore"
                acceso={scelte.morteImprovvisa}
                onCambia={(si) => cambia({ morteImprovvisa: si })}
              />
            </Opzioni>
          </Sezione>

          {sullaCartina && (
            <Sezione titolo="Cartina">
              <Opzioni>
                <Interruttore
                  titolo="Evidenzia cosa si può toccare"
                  acceso={scelte.evidenzia}
                  onCambia={(si) => cambia({ evidenzia: si })}
                />
                {scelte.area !== 'mondo' && (
                  <Interruttore
                    titolo="Blocca fuori dalla zona"
                    sotto="Fuori dalla zona non si tocca niente"
                    acceso={scelte.soloZona}
                    onCambia={(si) => cambia({ soloZona: si })}
                  />
                )}
                {categoria !== 'stati' && categoria !== 'bandiere' && (
                  <Interruttore
                    titolo="Nomi dei paesi"
                    sotto="Per orientarsi"
                    acceso={scelte.nomiPaesi}
                    onCambia={(si) => cambia({ nomiPaesi: si })}
                  />
                )}
              </Opzioni>
            </Sezione>
          )}

          {(tipi.length > 1 || (categoria === 'capitali' && !sullaCartina)) && (
            <Sezione titolo="Tipi di domanda">
              <Opzioni>
                {tipi.length > 1 &&
                  tipi.map((t) => {
                    const acceso = tipiScelti.includes(t)
                    return (
                      <Interruttore
                        key={t}
                        titolo={nomeTipo(t, categoria)}
                        acceso={acceso}
                        // Almeno un tipo resta acceso: senza domande non c'e' partita.
                        disabilitato={acceso && tipiScelti.length === 1}
                        onCambia={(si) =>
                          cambia({ tipi: si ? [...tipiScelti, t] : tipiScelti.filter((x) => x !== t) })
                        }
                      />
                    )
                  })}
                {categoria === 'capitali' && !sullaCartina && (
                  <Interruttore
                    titolo="Bandiera nella domanda"
                    sotto="Quando si chiede la capitale di uno stato"
                    acceso={scelte.bandieraCapitali ?? true}
                    onCambia={(si) => cambia({ bandieraCapitali: si })}
                  />
                )}
              </Opzioni>
            </Sezione>
          )}

          <button
            type="button"
            className="quiz-avanzate__ripristina"
            onClick={() =>
              setScelte((s) => ({
                ...PREDEFINITE,
                categoria: s.categoria,
                modo: s.modo,
                area: s.area,
                ...(s.ambito ? { ambito: s.ambito } : {}),
                ...(s.giorno ? { giorno: s.giorno } : {}),
                quante: s.quante,
                notorieta: s.notorieta,
                secondi: s.secondi,
                imparo: s.imparo,
              }))
            }
          >
            Ripristina le opzioni
          </button>
        </div>
      )}

      <div className="quiz-scelta__via">
        <Button size="lg" fullWidth onClick={comincia}>
          Comincia
        </Button>
        <Button
          variant="tinted"
          size="lg"
          fullWidth
          onClick={() => {
            salvaScelte(scelte)
            setSfida(true)
          }}
        >
          <IconPeople size={20} /> Sfida un amico
        </Button>
      </div>

      <SfidaQuiz open={sfida} onClose={() => setSfida(false)} scelte={scelte} />

      <Sheet open={paesiAperti} onClose={() => setPaesiAperti(false)} title="Scegli un paese">
        <ElencoPaesi
          paesi={elencoPaesi}
          scelto={paese}
          cosa={PAROLE_PAESE[categoria] ?? ''}
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

function cartina(s: ImpostazioniLibera): boolean {
  return s.modo === 'cartina'
}

/** Cosa vuol dire "facile" in ogni materia: i posti piu' noti, i quadri piu' famosi. */
const DIFFICOLTA: Partial<Record<CategoriaQuiz, string>> = {
  arte: 'Facile: i quadri più famosi',
  libri: 'Facile: i libri più famosi',
  cinema: 'Facile: i film più famosi',
  lirica: 'Facile: le opere più famose',
  nobel: 'Facile: i premiati più famosi',
  storia: 'Facile: i fatti più famosi',
  oggi: 'Facile: i fatti e le persone più famosi',
  scienza: 'Facile: le cose più note',
}

/** Una capsula da scegliere: una zona, un ambito, un giorno. */
function Capsula({
  scelta,
  disabilitata = false,
  onClick,
  children,
}: {
  scelta: boolean
  disabilitata?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={scelta}
      className={`quiz-zona${scelta ? ' is-scelta' : ''}`}
      disabled={disabilitata}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** Le opzioni avanzate cambiate, in una riga sotto il titolo; niente se sono quelle di sempre. */
function riassuntoAvanzate(s: ImpostazioniLibera): string | null {
  const sullaCartina = cartina(s)
  const diverse: string[] = []
  if (s.tipi?.length) diverse.push('alcuni tipi di domanda')
  if (!sullaCartina && s.risposte !== RISPOSTE_PREDEFINITE) diverse.push(`${s.risposte} risposte`)
  if (s.ordine === 'caso') diverse.push('a caso')
  if (s.categoria === 'capitali' && !sullaCartina && !s.bandieraCapitali) diverse.push('senza bandiera')
  if (s.avantiDaSolo) diverse.push('avanti automatico')
  if (sullaCartina && !s.evidenzia) diverse.push('senza evidenziare')
  if (sullaCartina && s.area !== 'mondo' && !s.soloZona) diverse.push('si tocca anche fuori zona')
  if (sullaCartina && s.nomiPaesi) diverse.push('nomi dei paesi')
  if (!sullaCartina && s.aiuti) diverse.push('50 e 50')
  if (s.ripasso) diverse.push('ripeti le sbagliate')
  if (s.morteImprovvisa) diverse.push('morte improvvisa')
  return diverse.length > 0 ? diverse.join(' · ') : null
}

/** Un gruppo di opzioni in una carta, una riga per opzione, come nelle Impostazioni. */
function Opzioni({ children }: { children: ReactNode }) {
  return <div className="quiz-impostazioni">{children}</div>
}

/** Una riga con il suo nome, se serve una riga che spiega, e sotto il controllo segmentato. */
function Scelte({ titolo, sotto, children }: { titolo: string; sotto?: string; children: ReactNode }) {
  return (
    <div className="quiz-impostazione">
      <span className="quiz-impostazione__testi">
        <span className="quiz-impostazione__titolo">{titolo}</span>
        {sotto && <span className="quiz-impostazione__sotto">{sotto}</span>}
      </span>
      {children}
    </div>
  )
}

/** Una riga con l'interruttore di iOS: tutta la riga si tocca. */
function Interruttore({
  titolo,
  sotto,
  acceso,
  disabilitato = false,
  onCambia,
}: {
  titolo: string
  sotto?: string
  acceso: boolean
  disabilitato?: boolean
  onCambia: (acceso: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={acceso}
      className="quiz-impostazione quiz-impostazione--interruttore"
      disabled={disabilitato}
      onClick={() => onCambia(!acceso)}
    >
      <span className="quiz-impostazione__testi">
        <span className="quiz-impostazione__titolo">{titolo}</span>
        {sotto && <span className="quiz-impostazione__sotto">{sotto}</span>}
      </span>
      <span className={`quiz-interruttore${acceso ? ' is-acceso' : ''}`} aria-hidden="true">
        <span />
      </span>
    </button>
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
