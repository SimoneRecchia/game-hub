import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { Collegamento, useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Cursore } from '@/components/Cursore'
import { Opzioni, Scelte } from '@/components/Opzioni'
import { Difficolta } from '@/components/Difficolta'
import { Elenco, Riga, Sezione } from '@/components/Elementi'
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
  nomePartita,
  voceDi,
  type VoceMateria,
} from '@/games/quiz/testi'
import { leggiStatistiche } from '@/games/quiz/statistiche'
import { OPZIONI_PREDEFINITE, categorieDi, useQuizLibero, type ImpostazioniLibera } from '@/games/quiz/usePartita'
import { useDati } from '@/lib/dati'
import { formatPercent } from '@/lib/format'
import { gameDate } from '@shared/daily'
import {
  AMBITI,
  CON_CONTINENTE,
  CON_PAESE,
  CONTINENTI,
  DOMANDE_PER_PARTITA,
  GENERI,
  MATERIE,
  NOMI_MODI,
  QUANTE_LIBERE,
  RISPOSTE_PREDEFINITE,
  SECONDI_LIBERI,
  SECONDI_SCELTA,
  TITOLI_AMBITI,
  PERIODI_MUSICA,
  ambitoValido,
  diGeografia,
  diMusica,
  eCategoria,
  eModo,
  genereValido,
  materiaDi,
  nazioneValida,
  nelPeriodo,
  periodoMusicaValido,
  type CategoriaQuiz,
  type Continente,
  type MateriaQuiz,
  type ModoQuiz,
} from '@shared/quiz'
import { GENERI_CANZONI, giornoDellAnno, giornoInLettere, type DatiCultura } from '@shared/quiz-cultura'
import { QUANTE_SFIDA, SECONDI_SFIDA, SECONDI_SFIDA_PREDEFINITI } from '@shared/quiz-sfida'
import type { AreaQuiz, IndiceQuiz, Notorieta, SezioneQuiz } from '@shared/quiz-domande'
import { eCultura, soggettiDellaMusica } from '@shared/quiz-domande-cultura'
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
 * La sezione di una voce della pagina: la categoria, l'argomento della scienza,
 * il genere delle canzoni. Un ambito che non e' una voce — il periodo dei
 * quadri, gli anni della musica — e' un filtro, e non fa una sezione.
 */
function sezioneDi(categoria: CategoriaQuiz, ambito?: string, genere?: string): SezioneQuiz {
  const voci = VOCI_MATERIE[materiaDi(categoria)].filter((v) => v.categoria === categoria)
  const conAmbito = !!ambito && ambito !== 'tutti' && voci.some((v) => v.ambito === ambito)
  const conGenere = !!genere && genere !== 'tutti' && voci.some((v) => v.genere === genere)
  return { categoria, ...(conAmbito ? { ambito } : {}), ...(conGenere ? { genere } : {}) }
}

/** Come si scrive una sezione nell'indirizzo e nelle chiavi: "bandiere", "scienza.chimica", "canzoni.rock". */
const chiaveSezione = (x: SezioneQuiz) => {
  const dettaglio = x.genere ?? x.ambito
  return dettaglio && dettaglio !== 'tutti' ? `${x.categoria}.${dettaglio}` : x.categoria
}

function daChiave(k: string): SezioneQuiz | null {
  const [categoria, dettaglio] = k.split('.')
  if (!eCategoria(categoria)) return null
  return categoria === 'canzoni' ? sezioneDi(categoria, undefined, dettaglio) : sezioneDi(categoria, dettaglio)
}

/** Le sezioni scelte: quelle della partita, o la sua categoria con il suo argomento o il suo genere. */
function sezioniDi(s: Pick<ImpostazioniLibera, 'categoria' | 'ambito' | 'genere' | 'sezioni'>): SezioneQuiz[] {
  return s.sezioni?.length ? [...s.sezioni] : [sezioneDi(s.categoria, s.ambito, s.genere)]
}

/**
 * Le canzoni di tutti i generi, come sezioni: la pagina della musica ha un genere
 * per voce, e le canzoni senza genere — le scelte di prima — sono tutte le voci.
 */
const TUTTE_LE_CANZONI: readonly SezioneQuiz[] = GENERI_CANZONI.map((genere) => ({ categoria: 'canzoni', genere }))

/** Quanti soggetti vogliono un periodo o un paese della musica, per essere offerti: una partita intera. */
const MINIMO_MUSICA = 10

const eSezione = (x: SezioneQuiz | null): x is SezioneQuiz => x !== null

/**
 * I file della musica, per contare che cosa hanno i generi scelti: la partita
 * li scarica comunque, e qui servono gia' mentre si sceglie. Finché non
 * arrivano, gli anni e i paesi offrono solo quel che e' gia' scelto.
 */
function useDatiMusica(attivo: boolean): Pick<DatiCultura, 'canzoni' | 'classica' | 'lirica'> | null {
  const [dati, setDati] = useState<Pick<DatiCultura, 'canzoni' | 'classica' | 'lirica'> | null>(null)
  useEffect(() => {
    if (!attivo || dati) return
    let vivo = true
    Promise.all([caricaCultura('canzoni'), caricaCultura('classica'), caricaCultura('lirica')])
      .then(([canzoni, classica, lirica]) => vivo && setDati({ canzoni, classica, lirica }))
      .catch(() => {
        // Senza i file si resta su "tutti": la partita, se si puo', li riscarica.
      })
    return () => {
      vivo = false
    }
  }, [attivo, dati])
  return dati
}

/** Quante domande puo' avere una partita, se ha un tetto: gli oceani sulla cartina sono cinque. */
function domandeMassime(s: Pick<ImpostazioniLibera, 'categoria' | 'sezioni' | 'modo'>): number | null {
  return !s.sezioni?.length && s.categoria === 'oceani' && s.modo === 'cartina' ? 5 : null
}

/**
 * Le scelte, se stanno in piedi: sezioni che ci sono, tutte della stessa
 * materia; un'area, un ambito, un genere che vanno bene a tutte; numeri fra
 * quelli previsti. Quel che non torna torna com'era di solito. Le altre
 * materie non hanno ne' la cartina ne' le zone, e con piu' sezioni restano
 * solo i filtri che valgono per tutte: il modo e la zona della geografia, e
 * gli argomenti della scienza, che sono sezioni loro. Gli anni e il genere
 * delle canzoni, il periodo dei quadri e il giorno di "Accadde oggi" sono di
 * una sezione sola.
 *
 * Si scelgono solo le sezioni, dove o su cosa, quante domande, il tempo e la
 * difficoltà: il resto e' come nella classificata, con la spiegazione dopo ogni
 * risposta. Le opzioni di prima — gli aiuti, i tipi di domanda, quante
 * risposte — tornano ai valori di sempre anche se erano salvate o
 * nell'indirizzo.
 */
function valide(s: Partial<ImpostazioniLibera> | null | undefined): ImpostazioniLibera | null {
  if (!s) return null
  const grezze = s.sezioni?.length
    ? s.sezioni
    : eCategoria(s.categoria)
      ? [sezioneDi(s.categoria, ambitoValido(s.categoria, s.ambito), genereValido(s.categoria, s.genere))]
      : []
  const prima = grezze.find((x) => eCategoria(x.categoria))
  if (!prima) return null
  const materia = materiaDi(prima.categoria)
  const viste = new Map<string, SezioneQuiz>()
  for (const x of grezze) {
    if (!eCategoria(x.categoria) || materiaDi(x.categoria) !== materia) continue
    const sezione = sezioneDi(x.categoria, ambitoValido(x.categoria, x.ambito), genereValido(x.categoria, x.genere))
    // Le canzoni senza genere sono tutti i generi: la pagina ne ha uno per voce.
    for (const y of sezione.categoria === 'canzoni' && !sezione.genere ? TUTTE_LE_CANZONI : [sezione]) {
      viste.set(chiaveSezione(y), y)
    }
  }
  const molte = viste.size > 1
  const sezioni = [...viste.values()]
  const categoria = sezioni[0].categoria
  const geografia = diGeografia(categoria)
  const musica = diMusica(categoria)
  const modo = geografia && eModo(s.modo) ? s.modo : 'scelta'
  const area = geografia ? (s.area ?? 'mondo') : 'mondo'
  const tutte = (elenco: readonly CategoriaQuiz[]) => sezioni.every((x) => elenco.includes(x.categoria))
  const areaBuona =
    area === 'mondo' ||
    ((CONTINENTI as readonly string[]).includes(area) && tutte(CON_CONTINENTE)) ||
    (/^paese:[A-Z]{2}$/.test(area) && tutte(CON_PAESE))
  // Con piu' sezioni gli ambiti restano solo dove sono una sezione (gli argomenti della scienza) o dove valgono per
  // tutte (gli anni della musica); il periodo dei quadri e' di una sezione sola.
  const ambito = geografia
    ? 'tutti'
    : musica
      ? periodoMusicaValido(s.ambito)
      : molte
        ? 'tutti'
        : (sezioni[0].ambito ?? ambitoValido(categoria, s.ambito))
  const genere = molte ? 'tutti' : (sezioni[0].genere ?? 'tutti')
  const nazione = musica ? nazioneValida(s.nazione) : null
  const quante = (QUANTE_LIBERE as readonly number[]).includes(s.quante ?? 0) ? s.quante! : DOMANDE_PER_PARTITA
  const secondi =
    s.secondi === null ? null : (SECONDI_LIBERI as readonly number[]).includes(s.secondi ?? 0) ? s.secondi! : SECONDI_SCELTA
  return {
    ...OPZIONI_PREDEFINITE,
    categoria,
    ...(molte ? { sezioni } : {}),
    modo,
    area: areaBuona ? area : 'mondo',
    ...(ambito !== 'tutti' ? { ambito } : {}),
    ...(genere !== 'tutti' ? { genere } : {}),
    ...(nazione ? { nazione } : {}),
    ...(categoria === 'oggi' && !molte && s.giorno === 'caso' ? { giorno: 'caso' as const } : {}),
    quante,
    risposte: RISPOSTE_PREDEFINITE,
    notorieta: s.notorieta === 'noti' || s.notorieta === 'rari' ? s.notorieta : 'misti',
    ordine: 'sale',
    bandieraCapitali: true,
    secondi,
  }
}

/**
 * La partita dall'indirizzo: `?categoria=fiumi&modo=cartina&paese=IT&domande=10`,
 * o con piu' sezioni `?sezioni=citta,bandiere,stati`. Tornare indietro riporta
 * alle scelte.
 */
function daIndirizzo(query: URLSearchParams): ImpostazioniLibera | null {
  const paese = query.get('paese')
  const tempo = query.get('tempo')
  const numero = (k: string) => (query.get(k) === null ? undefined : Number(query.get(k)))
  const sezioni = (query.get('sezioni') ?? '')
    .split(',')
    .map(daChiave)
    .filter((x): x is SezioneQuiz => !!x)
  return valide({
    categoria: (query.get('categoria') ?? sezioni[0]?.categoria) as CategoriaQuiz | undefined,
    ...(sezioni.length > 0 ? { sezioni } : {}),
    modo: (query.get('modo') ?? undefined) as ModoQuiz | undefined,
    area: (paese ? `paese:${paese.toUpperCase()}` : (query.get('dove') ?? 'mondo')) as AreaQuiz,
    quante: numero('domande'),
    notorieta: (query.get('noti') ?? undefined) as Notorieta | undefined,
    secondi: tempo === 'no' ? null : numero('secondi'),
    ambito: query.get('ambito') ?? undefined,
    genere: query.get('genere') ?? undefined,
    nazione: query.get('nazione') ?? undefined,
    giorno: query.get('giorno') === 'caso' ? 'caso' : undefined,
  })
}

/** L'indirizzo della partita: solo quel che non e' come di solito, così resta un indirizzo che si legge. */
function indirizzo(s: ImpostazioniLibera): string {
  const q = new URLSearchParams(
    s.sezioni?.length ? { sezioni: s.sezioni.map(chiaveSezione).join(',') } : { categoria: s.categoria },
  )
  if (s.modo === 'cartina') q.set('modo', 'cartina')
  if (s.area.startsWith('paese:')) q.set('paese', s.area.slice(6))
  else if (s.area !== 'mondo') q.set('dove', s.area)
  if (s.ambito && s.ambito !== 'tutti') q.set('ambito', s.ambito)
  if (s.genere && s.genere !== 'tutti') q.set('genere', s.genere)
  if (s.nazione) q.set('nazione', s.nazione)
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
type Ultima = Pick<
  ImpostazioniLibera,
  'categoria' | 'sezioni' | 'modo' | 'area' | 'ambito' | 'genere' | 'nazione' | 'giorno'
>

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
    ultima && materiaDi(ultima.categoria) === materia
      ? ultima
      : { categoria: prima.categoria, ambito: prima.ambito, genere: prima.genere }
  // Le opzioni della partita restano quelle di prima; le sezioni, la zona e i filtri sono di questa materia.
  const pulite = {
    ...salvate,
    area: 'mondo' as const,
    ambito: undefined,
    genere: undefined,
    nazione: undefined,
    giorno: undefined,
  }
  return valide({ ...pulite, sezioni: undefined, tipi: undefined, ...qui }) ?? salvate
}

function salvaScelte(s: ImpostazioniLibera): void {
  try {
    localStorage.setItem(CHIAVE_SCELTE, JSON.stringify(s))
    const ultima: Ultima = {
      categoria: s.categoria,
      sezioni: s.sezioni,
      modo: s.modo,
      area: s.area,
      ambito: s.ambito,
      genere: s.genere,
      nazione: s.nazione,
      giorno: s.giorno,
    }
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
    ? [nomePartita(ultima), ...dettagliPartita(ultima, ix), `${ultima.quante} domande`]
        // Il modo si dice solo se e' la cartina: "Scelta multipla" e' come di solito.
        .filter((x) => x !== NOMI_MODI.scelta)
        .join(' · ')
    : null

  return (
    <Pagina
      titolo="Quiz"
      gioco="quiz"
      sotto={
        statistiche.domande > 0
          ? `${statistiche.partite} ${statistiche.partite === 1 ? 'partita' : 'partite'} · ${formatPercent(
              statistiche.giuste / statistiche.domande,
            )} di risposte giuste`
          : undefined
      }
      indietro={{ a: ROTTE.libere, etichetta: 'Libere' }}
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
        intro={{
          titolo: nomePartita(impostazioni),
          sotto: extra.join(' · '),
          ...(impostazioni.sezioni?.length ? { testo: 'Le domande delle sezioni scelte, mescolate.' } : {}),
        }}
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
  const [foglio, setFoglio] = useState<'zona' | 'paese' | 'ambito' | 'genere' | 'nazione' | null>(null)
  // `?sfida=1`: si arriva dal menu per sfidare un amico.
  const [query] = useSearchParams()
  const [contro, setContro] = useState<Contro>(() => (query.get('sfida') === '1' ? 'amico' : leggiContro()))
  const [sfida, setSfida] = useState(false)
  const [regole, setRegole] = useState(false)
  const [statistiche] = useState(leggiStatistiche)

  const { categoria, modo = 'scelta' } = scelte
  const sezioni = sezioniDi(scelte)
  const molte = sezioni.length > 1
  const scelteOra = new Set(sezioni.map(chiaveSezione))
  const geografia = diGeografia(categoria)
  const musica = materia === 'musica'
  // La voce scelta, se e' una sola: con piu' sezioni i filtri di una sola non ci sono.
  const voce = molte ? null : voceDi(materia, categoria, scelte.ambito, scelte.genere)
  const conAmico = contro === 'amico'
  const categorie = categorieDi(scelte)
  const datiMusica = useDatiMusica(musica)

  // I dati servono alla partita: scaricarli mentre si sceglie la fa partire subito.
  const ix = useIndiceQuiz(geografia)
  const daScaricare = categorie.join(',')
  useEffect(() => {
    for (const c of daScaricare.split(',') as CategoriaQuiz[]) {
      if (eCultura(c) && c !== 'oggi') caricaCultura(c).catch(() => {})
    }
  }, [daScaricare])
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
  const { dati: delGiorno } = useDati<QuizSummary>(categoria === 'oggi' && !molte ? '/quiz/summary' : null)
  const oggiChiuso = delGiorno?.categoria === 'oggi' && delGiorno.status !== 'done'

  const cambia = (nuove: Partial<ImpostazioniLibera>) => setScelte((s) => valide({ ...s, ...nuove }) ?? s)

  /**
   * Una voce si accende e si spegne: le sezioni si scelgono insieme, quante se
   * ne vuole, e ne resta sempre una. Restano nell'ordine della pagina.
   */
  const tocca = (v: VoceMateria) => {
    const qui = sezioneDi(v.categoria, v.ambito, v.genere)
    const chiave = chiaveSezione(qui)
    if (scelteOra.has(chiave) && scelteOra.size === 1) return
    const ordine = voci.map((x) => chiaveSezione(sezioneDi(x.categoria, x.ambito, x.genere)))
    const nuove = (scelteOra.has(chiave) ? sezioni.filter((x) => chiaveSezione(x) !== chiave) : [...sezioni, qui]).sort(
      (a, b) => ordine.indexOf(chiaveSezione(a)) - ordine.indexOf(chiaveSezione(b)),
    )
    const sola = nuove.length === 1
    cambia({
      categoria: nuove[0].categoria,
      // Gli anni della musica valgono per tutti i generi, e restano.
      ambito: musica ? scelte.ambito : sola ? nuove[0].ambito : undefined,
      genere: sola ? nuove[0].genere : undefined,
      sezioni: sola ? undefined : nuove,
    })
  }

  // La musica offre gli anni e i paesi che i generi scelti hanno: quanti soggetti restano, con gli stessi conti
  // delle domande. Una scelta che non ne ha piu' abbastanza torna a "tutti".
  // Le sezioni cambiano a ogni giro: il conto si rifà quando cambiano davvero, cioe' le loro chiavi.
  const chiaviSezioni = [...scelteOra].join(',')
  const soggetti = useMemo(() => {
    if (!datiMusica) return null
    return soggettiDellaMusica(datiMusica, chiaviSezioni.split(',').map(daChiave).filter(eSezione))
  }, [datiMusica, chiaviSezioni])
  const periodo = musica ? (scelte.ambito ?? 'tutti') : 'tutti'
  const nazione = musica ? (scelte.nazione ?? null) : null
  const periodi = useMemo(
    () =>
      soggetti
        ? PERIODI_MUSICA.filter(
            (p) =>
              p.id === 'tutti' ||
              soggetti.filter((x) => nelPeriodo(x.anno, p.id) && (!nazione || x.nazioni.includes(nazione))).length >=
                MINIMO_MUSICA,
          )
        : PERIODI_MUSICA.filter((p) => p.id === 'tutti' || p.id === periodo),
    [soggetti, nazione, periodo],
  )
  const nazioni = useMemo(() => {
    if (!soggetti) return nazione ? [nazione] : []
    const quanti = new Map<string, number>()
    for (const x of soggetti) {
      if (!nelPeriodo(x.anno, periodo)) continue
      for (const n of new Set(x.nazioni)) quanti.set(n, (quanti.get(n) ?? 0) + 1)
    }
    return [...quanti]
      .filter(([, n]) => n >= MINIMO_MUSICA)
      .sort((a, b) => Number(b[0] === 'Italia') - Number(a[0] === 'Italia') || b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([n]) => n)
  }, [soggetti, periodo, nazione])
  useEffect(() => {
    if (!soggetti) return
    if (periodo !== 'tutti' && !periodi.some((p) => p.id === periodo)) cambia({ ambito: undefined })
    else if (nazione && !nazioni.includes(nazione)) cambia({ nazione: undefined })
  }, [soggetti, periodi, nazioni, periodo, nazione])

  const scegliContro = (c: Contro) => {
    setContro(c)
    try {
      localStorage.setItem(CHIAVE_CONTRO, c)
    } catch {
      // E' una comodita'.
    }
  }

  // Con un amico le domande e i secondi sono quelli della sfida: si vedono quelli, e si gioca con quelli.
  const massime = domandeMassime(scelte)
  const quante = massime ?? (conAmico ? vicino(QUANTE_SFIDA, scelte.quante, 10) : scelte.quante)
  const secondi = conAmico ? vicino(SECONDI_SFIDA, scelte.secondi, SECONDI_SFIDA_PREDEFINITI) : scelte.secondi

  // Comincia fa partire la partita, o la sfida, con la difficoltà scelta; e le scelte restano per la prossima volta.
  const comincia = (notorieta: Notorieta) => {
    const pronte = { ...scelte, notorieta, quante, secondi }
    // Le cinque domande degli oceani sulla cartina sono di quella partita: dopo si torna a quante se ne erano scelte.
    const ricordate = massime === null ? pronte : { ...pronte, quante: scelte.quante }
    setScelte(ricordate)
    salvaScelte(ricordate)
    if (conAmico) {
      setSfida(true)
      return
    }
    // Se oggi non si puo', un giorno a caso: ma la scelta ricordata resta "oggi", che domani si potra'.
    vai(indirizzo(oggiChiuso ? { ...pronte, giorno: 'caso' } : pronte))
  }

  // La zona vale se vale per tutte le sezioni: gli oceani non hanno continenti, le bandiere non hanno paesi.
  const conContinente = categorie.every((c) => CON_CONTINENTE.includes(c))
  const conPaese = categorie.every((c) => CON_PAESE.includes(c))
  const paese = scelte.area.startsWith('paese:') ? scelte.area.slice(6) : null
  const elencoPaesi = useMemo(
    () => (ix && conPaese ? paesiCon(ix, categoria, contiCitta) : []),
    [ix, conPaese, categoria, contiCitta],
  )
  // L'ambito si sceglie solo se la voce non e' gia' un argomento: la chimica non ha altro da scegliere. Nella musica
  // gli anni sono di tutti i generi scelti, e il genere e' una voce.
  const ambiti = musica ? periodi : voce && voce.ambito === undefined ? AMBITI[categoria] : undefined
  const ambito = ambiti?.find((a) => a.id === (scelte.ambito ?? 'tutti'))
  const generi = voce && !musica ? GENERI[categoria] : undefined
  const genere = generi?.find((g) => g.id === (scelte.genere ?? 'tutti'))
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

      <Sezione titolo={musica ? 'Generi' : 'Sezioni'} nota={musica ? 'Scegline uno o più' : 'Scegline una o più'}>
        <div
          className={`quiz-categorie quiz-colori--${materia}`}
          role="group"
          aria-label={musica ? 'Generi' : 'Sezioni'}
        >
          {voci.map((v, i) => {
            const scelta = scelteOra.has(chiaveSezione(sezioneDi(v.categoria, v.ambito, v.genere)))
            // I record sono per categoria: gli argomenti della scienza e i generi delle canzoni non hanno il loro.
            const tutta = (v.ambito === undefined || v.ambito === 'tutti') && v.genere === undefined
            const record = tutta ? statistiche.migliori[v.categoria] : undefined
            return (
              <button
                key={`${v.categoria}:${v.ambito ?? ''}:${v.genere ?? ''}`}
                type="button"
                role="checkbox"
                aria-checked={scelta}
                className={`quiz-tessera${scelta ? ' is-scelta' : ''}`}
                style={{ '--n': i } as CSSProperties}
                onClick={() => tocca(v)}
              >
                <span className="quiz-tessera__icona" aria-hidden="true">
                  <IconaCategoria categoria={v.categoria} ambito={v.ambito} genere={v.genere} size={19} />
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
                  <img className="opzione__bandiera" src={urlBandiera(paese.toLowerCase(), 40)} alt="" />
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
          {/* Una scelta sola non e' una scelta: con le sole colonne sonore non c'e' un decennio da dieci domande. */}
          {ambiti && ambiti.length > 1 && ambito && (
            <RigaFoglio
              titolo={TITOLI_AMBITI[categoria] ?? 'Quali'}
              valore={ambito.nome}
              onClick={() => setFoglio('ambito')}
            />
          )}
          {generi && genere && <RigaFoglio titolo="Genere" valore={genere.nome} onClick={() => setFoglio('genere')} />}
          {musica && nazioni.length > 0 && (
            <RigaFoglio titolo="Paese" valore={nazione ?? 'Tutti i paesi'} onClick={() => setFoglio('nazione')} />
          )}
          {categoria === 'oggi' && !molte && (
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
            {massime === null && (
              <Cursore
                ariaLabel="Domande"
                valori={conAmico ? QUANTE_SFIDA : QUANTE_LIBERE}
                valore={quante}
                etichetta={String}
                onChange={(n) => cambia({ quante: n })}
              />
            )}
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

      <Difficolta
        livelli={LIVELLI.map((l) => ({ id: l.notorieta, nome: l.nome }))}
        scelto={scelte.notorieta ?? 'misti'}
        onScegli={(notorieta) => cambia({ notorieta })}
        onComincia={() => comincia(scelte.notorieta ?? 'misti')}
        colore={colore}
        etichetta={conAmico ? 'Sfida un amico' : 'Comincia'}
      />

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

      {musica && (
        <Sheet open={foglio === 'nazione'} onClose={() => setFoglio(null)} title="Paese">
          <Elenco>
            {[null, ...nazioni].map((n) => (
              <Riga
                key={n ?? 'tutti'}
                titolo={n ?? 'Tutti i paesi'}
                scelta={nazione === n}
                onClick={() => {
                  cambia({ nazione: n ?? undefined })
                  setFoglio(null)
                }}
              />
            ))}
          </Elenco>
        </Sheet>
      )}

      {generi && (
        <Sheet open={foglio === 'genere'} onClose={() => setFoglio(null)} title="Genere">
          <Elenco>
            {generi.map((g) => (
              <Riga
                key={g.id}
                titolo={g.nome}
                scelta={(scelte.genere ?? 'tutti') === g.id}
                onClick={() => {
                  cambia({ genere: g.id })
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
    <button type="button" className="opzione opzione--riga" onClick={onClick}>
      <span className="opzione__titolo">{titolo}</span>
      <span className="opzione__valore">
        {icona}
        <span className="opzione__scelta">{valore}</span>
      </span>
      <IconChevronRight size={18} className="opzione__freccia" />
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
