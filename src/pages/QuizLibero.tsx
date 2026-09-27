import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useNavigazione } from '@/app/navigazione'
import { ROTTE } from '@/app/rotte'
import { Button } from '@/components/Button'
import { Sezione } from '@/components/Elementi'
import { IconCheck, IconChevronRight, IconInfo, IconPeople } from '@/components/Icons'
import { BottoneBarra, Pagina } from '@/components/Pagina'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Sheet } from '@/components/Sheet'
import { urlBandiera } from '@/games/quiz/bandiere'
import { contaCitta } from '@/games/quiz/citta'
import { ComeSiGiocaQuiz } from '@/games/quiz/ComeSiGioca'
import { useIndiceQuiz } from '@/games/quiz/dati'
import { IconaCategoria } from '@/games/quiz/icone'
import { PartitaQuiz } from '@/games/quiz/PartitaQuiz'
import { SfidaQuiz } from '@/games/quiz/sfida/SfidaQuiz'
import { descrizione, nomeArea } from '@/games/quiz/testi'
import {
  OPZIONI_PREDEFINITE,
  leggiStatistiche,
  useQuizLibero,
  type ImpostazioniLibera,
  type OpzioniPartita,
} from '@/games/quiz/usePartita'
import { formatPercent } from '@/lib/format'
import {
  CATEGORIE,
  CON_CONTINENTE,
  CON_PAESE,
  CONTINENTI,
  DOMANDE_PER_PARTITA,
  NOMI_CATEGORIE,
  NOMI_MODI,
  QUANTE_LIBERE,
  RISPOSTE_LIBERE,
  RISPOSTE_PREDEFINITE,
  SECONDI_LIBERI,
  SECONDI_SCELTA,
  eCategoria,
  eModo,
  type CategoriaQuiz,
  type ModoQuiz,
} from '@shared/quiz'
import { NOMI_TIPI, TIPI, type AreaQuiz, type IndiceQuiz, type Notorieta, type TipoDomanda } from '@shared/quiz-domande'
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
  { value: 'noti', label: 'I più noti' },
  { value: 'misti', label: 'Di tutto' },
  { value: 'rari', label: 'I meno noti' },
]

/** I tipi di domanda di una categoria in un modo: quelli che si possono scegliere nelle opzioni. */
function tipiDi(categoria: CategoriaQuiz, modo: ModoQuiz): readonly TipoDomanda[] {
  return categoria === 'cartina' ? [] : TIPI[categoria][modo]
}

/**
 * Le scelte, se stanno in piedi: una categoria che c'e', un'area che le va
 * bene, numeri fra quelli previsti. Quel che non torna torna com'era di solito.
 */
function valide(s: Partial<ImpostazioniLibera> | null | undefined): ImpostazioniLibera | null {
  if (!s || !eCategoria(s.categoria)) return null
  const categoria = s.categoria
  const modo = eModo(s.modo) ? s.modo : 'scelta'
  const area = s.area ?? 'mondo'
  const areaBuona =
    area === 'mondo' ||
    ((CONTINENTI as readonly string[]).includes(area) && CON_CONTINENTE.includes(categoria)) ||
    (/^paese:[A-Z]{2}$/.test(area) && CON_PAESE.includes(categoria))
  const quante = (QUANTE_LIBERE as readonly number[]).includes(s.quante ?? 0) ? s.quante! : DOMANDE_PER_PARTITA
  const risposte = (RISPOSTE_LIBERE as readonly number[]).includes(s.risposte ?? 0) ? s.risposte! : RISPOSTE_PREDEFINITE
  const secondi =
    s.secondi === null ? null : (SECONDI_LIBERI as readonly number[]).includes(s.secondi ?? 0) ? s.secondi! : SECONDI_SCELTA
  const possibili = tipiDi(categoria, modo)
  const tipi = (s.tipi ?? []).filter((t) => possibili.includes(t))
  const si = (v: boolean | undefined, predefinito: boolean) => (typeof v === 'boolean' ? v : predefinito)
  return {
    categoria,
    modo,
    area: areaBuona ? area : 'mondo',
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

/**
 * Il quiz libero: prima si sceglie — categoria, a scelta o sulla cartina,
 * dove, quante domande, se a tempo, e sotto le opzioni avanzate — poi si gioca.
 * Tutto nel browser, dagli stessi dati e con le stesse regole della
 * classificata, e non conta per la classifica.
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
  const ix = useIndiceQuiz()
  const [regole, setRegole] = useState(false)
  const s = p.statistiche
  const extra = [
    NOMI_MODI[impostazioni.modo ?? 'scelta'],
    nomeArea(impostazioni.area, ix),
    impostazioni.morteImprovvisa ? 'morte improvvisa' : null,
  ].filter(Boolean)

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
          sotto: `Libera · ${extra.join(' · ')}`,
          azione: impostazioni.secondi === null ? 'Comincia, senza tempo' : 'Comincia',
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

function Scelta() {
  const { vai } = useNavigazione()
  const [scelte, setScelte] = useState(leggiScelte)
  const [paesiAperti, setPaesiAperti] = useState(false)
  const [sfida, setSfida] = useState(false)
  const [avanzate, setAvanzate] = useState(false)
  const [regole, setRegole] = useState(false)
  const [statistiche] = useState(leggiStatistiche)
  // I dati servono alla partita: scaricarli mentre si sceglie la fa partire subito.
  const ix = useIndiceQuiz()
  const [contiCitta, setContiCitta] = useState<Map<string, number> | null>(null)
  useEffect(() => {
    if (!ix || scelte.categoria !== 'citta' || contiCitta) return
    let vivo = true
    contaCitta(ix)
      .then((c) => vivo && setContiCitta(c))
      .catch(() => {
        // Senza le città l'elenco dei paesi resta vuoto: lo dice lui.
      })
    return () => {
      vivo = false
    }
  }, [ix, scelte.categoria, contiCitta])

  const cambia = (nuove: Partial<ImpostazioniLibera>) => setScelte((s) => valide({ ...s, ...nuove }) ?? s)

  const comincia = () => {
    salvaScelte(scelte)
    vai(indirizzo(scelte))
  }

  const { categoria, modo = 'scelta' } = scelte
  const cartina = modo === 'cartina'
  const conContinente = CON_CONTINENTE.includes(categoria)
  const conPaese = CON_PAESE.includes(categoria)
  const paese = scelte.area.startsWith('paese:') ? scelte.area.slice(6) : null
  const elencoPaesi = useMemo(
    () => (ix && conPaese ? paesiCon(ix, categoria, contiCitta) : []),
    [ix, conPaese, categoria, contiCitta],
  )
  const aree: AreaQuiz[] = conContinente ? ['mondo', ...CONTINENTI] : ['mondo']
  const tipi = tipiDi(categoria, modo)
  const tipiScelti = scelte.tipi?.length ? scelte.tipi : tipi
  const secondi = scelte.secondi ?? SECONDI_SCELTA

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
      <Sezione titolo="Categoria">
        <div className="quiz-categorie" role="radiogroup" aria-label="Categoria">
          {CATEGORIE.map((c, i) => {
            const scelta = c === categoria
            const record = statistiche.migliori[c]
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={scelta}
                className={`quiz-tessera${scelta ? ' is-scelta' : ''}`}
                style={{ '--n': i } as CSSProperties}
                onClick={() => cambia({ categoria: c, tipi: undefined })}
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

      <Sezione titolo="Come si risponde" nota={descrizione(categoria, modo)}>
        <SegmentedControl
          ariaLabel="Come si risponde"
          options={[
            { value: 'scelta', label: NOMI_MODI.scelta },
            { value: 'cartina', label: NOMI_MODI.cartina },
          ]}
          value={modo}
          onChange={(v) => cambia({ modo: v, tipi: undefined })}
        />
      </Sezione>

      <Sezione
        titolo="Dove"
        nota={
          !conContinente
            ? 'Gli oceani bagnano tutti i continenti: si gioca sul mondo intero.'
            : paese
              ? `Le domande sono sui suoi ${PAROLE_PAESE[categoria]} più noti, finché ce ne sono.`
              : cartina && scelte.area !== 'mondo'
                ? 'La cartina mostra tutto il mondo: fuori dalla zona scelta le terre sono attenuate.'
                : undefined
        }
      >
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
          {conPaese && (
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
        <Interruttore
          titolo="A tempo"
          sotto={
            scelte.secondi === null ? 'Pensaci quanto vuoi' : `${secondi} secondi per domanda, ${secondi * 2} sulla cartina`
          }
          acceso={scelte.secondi !== null}
          onCambia={(si) => cambia({ secondi: si ? SECONDI_SCELTA : null })}
        />
      </Sezione>

      <button
        type="button"
        className={`quiz-avanzate${avanzate ? ' is-aperte' : ''}`}
        aria-expanded={avanzate}
        onClick={() => setAvanzate((a) => !a)}
      >
        <span className="quiz-avanzate__testi">
          <span className="quiz-avanzate__titolo">Opzioni avanzate</span>
          <span className="quiz-avanzate__sotto">{riassuntoAvanzate(scelte)}</span>
        </span>
        <IconChevronRight size={18} className="quiz-avanzate__freccia" />
      </button>

      {avanzate && (
        <div className="quiz-avanzate__corpo">
          <Sezione titolo="Le domande">
            {tipi.length > 1 && (
              <Gruppo titolo="Cosa si chiede">
                {tipi.map((t) => {
                  const acceso = tipiScelti.includes(t)
                  return (
                    <Interruttore
                      key={t}
                      titolo={NOMI_TIPI[t]}
                      acceso={acceso}
                      // Almeno un tipo resta acceso: senza domande non c'e' partita.
                      disabilitato={acceso && tipiScelti.length === 1}
                      onCambia={(si) => cambia({ tipi: si ? [...tipiScelti, t] : tipiScelti.filter((x) => x !== t) })}
                    />
                  )
                })}
              </Gruppo>
            )}
            {!cartina && (
              <Gruppo titolo="Quante risposte" nota="Fra quante si sceglie quella giusta.">
                <SegmentedControl
                  ariaLabel="Quante risposte"
                  options={RISPOSTE_LIBERE.map((n) => ({ value: String(n), label: String(n) }))}
                  value={String(scelte.risposte ?? RISPOSTE_PREDEFINITE)}
                  onChange={(v) => cambia({ risposte: Number(v) })}
                />
              </Gruppo>
            )}
            <Gruppo titolo="Quanto noti">
              <SegmentedControl
                ariaLabel="Quanto noti"
                options={NOTORIETA}
                value={scelte.notorieta ?? 'misti'}
                onChange={(v) => cambia({ notorieta: v })}
              />
            </Gruppo>
            <Gruppo titolo="In che ordine">
              <SegmentedControl
                ariaLabel="In che ordine"
                options={[
                  { value: 'sale', label: 'Dal più facile' },
                  { value: 'caso', label: 'A caso' },
                ]}
                value={scelte.ordine ?? 'sale'}
                onChange={(v) => cambia({ ordine: v })}
              />
            </Gruppo>
            {categoria === 'capitali' && !cartina && (
              <Interruttore
                titolo="La bandiera con la domanda"
                sotto="Accanto a «qual è la capitale di…»; a «di quale stato è capitale…» si vede solo dopo."
                acceso={scelte.bandieraCapitali ?? true}
                onCambia={(si) => cambia({ bandieraCapitali: si })}
              />
            )}
          </Sezione>

          <Sezione titolo="Tempo e ritmo">
            {scelte.secondi !== null && (
              <Gruppo titolo="Secondi per domanda" nota="Sulla cartina sono il doppio.">
                <SegmentedControl
                  ariaLabel="Secondi per domanda"
                  options={SECONDI_LIBERI.map((n) => ({ value: String(n), label: `${n} s` }))}
                  value={String(secondi)}
                  onChange={(v) => cambia({ secondi: Number(v) })}
                />
              </Gruppo>
            )}
            <Interruttore
              titolo="Avanti da solo"
              sotto="La domanda dopo arriva da sola, senza toccare «Avanti»."
              acceso={scelte.avantiDaSolo}
              onCambia={(si) => cambia({ avantiDaSolo: si })}
            />
          </Sezione>

          <Sezione titolo="La cartina">
            <Interruttore
              titolo="La cartina che insegna"
              sotto="Dopo ogni risposta, dove sta la risposta giusta — e quella scelta — con i nomi."
              acceso={scelte.imparo}
              onCambia={(si) => cambia({ imparo: si })}
            />
            {cartina && (
              <Interruttore
                titolo="Accendi cosa si può toccare"
                sotto="I fiumi, i laghi, i mari e i pallini di città e capitali si vedono meglio."
                acceso={scelte.evidenzia}
                onCambia={(si) => cambia({ evidenzia: si })}
              />
            )}
            {cartina && scelte.area !== 'mondo' && (
              <Interruttore
                titolo="Si tocca solo nella zona"
                sotto="Fuori dalla zona scelta la cartina è attenuata e non si tocca."
                acceso={scelte.soloZona}
                onCambia={(si) => cambia({ soloZona: si })}
              />
            )}
            {cartina && categoria !== 'stati' && categoria !== 'bandiere' && (
              <Interruttore
                titolo="I nomi dei paesi"
                sotto="Per orientarsi mentre si cerca un fiume, un lago o una città."
                acceso={scelte.nomiPaesi}
                onCambia={(si) => cambia({ nomiPaesi: si })}
              />
            )}
          </Sezione>

          <Sezione titolo="Aiuti e sfide">
            {!cartina && (
              <Interruttore
                titolo="Due «50 e 50»"
                sotto="Tolgono metà delle risposte sbagliate, due volte per partita."
                acceso={scelte.aiuti}
                onCambia={(si) => cambia({ aiuti: si })}
              />
            )}
            <Interruttore
              titolo="Ripasso delle sbagliate"
              sotto="Alla fine si rifanno, una volta, le domande sbagliate."
              acceso={scelte.ripasso}
              onCambia={(si) => cambia({ ripasso: si })}
            />
            <Interruttore
              titolo="Morte improvvisa"
              sotto="La partita finisce alla prima risposta sbagliata."
              acceso={scelte.morteImprovvisa}
              onCambia={(si) => cambia({ morteImprovvisa: si })}
            />
          </Sezione>

          <button
            type="button"
            className="quiz-avanzate__ripristina"
            onClick={() =>
              setScelte((s) => ({ ...PREDEFINITE, categoria: s.categoria, modo: s.modo, area: s.area, quante: s.quante }))
            }
          >
            Rimetti le opzioni di sempre
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

      <Sheet
        open={paesiAperti}
        onClose={() => setPaesiAperti(false)}
        title={`${categoria === 'citta' ? 'Le città' : categoria === 'fiumi' ? 'I fiumi' : 'I laghi'} di un paese`}
      >
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

/** Le opzioni avanzate in una riga, sotto il titolo: quel che non e' come di solito. */
function riassuntoAvanzate(s: ImpostazioniLibera): string {
  const diverse: string[] = []
  if (s.modo === 'scelta' && s.risposte !== RISPOSTE_PREDEFINITE) diverse.push(`${s.risposte} risposte`)
  if (s.notorieta === 'noti') diverse.push('i più noti')
  if (s.notorieta === 'rari') diverse.push('i meno noti')
  if (s.ordine === 'caso') diverse.push('a caso')
  if (s.tipi?.length) diverse.push('alcune domande')
  if (s.secondi !== null && s.secondi !== SECONDI_SCELTA) diverse.push(`${s.secondi} s`)
  if (s.avantiDaSolo) diverse.push('avanti da solo')
  if (!s.imparo) diverse.push('senza cartina dopo')
  if (s.aiuti) diverse.push('50 e 50')
  if (s.ripasso) diverse.push('ripasso')
  if (s.morteImprovvisa) diverse.push('morte improvvisa')
  const cartina: Array<[keyof OpzioniPartita, string, boolean]> = [
    ['evidenzia', 'senza evidenze', true],
    ['soloZona', 'tutto si tocca', true],
    ['nomiPaesi', 'con i nomi', false],
  ]
  if (s.modo === 'cartina') for (const [k, nome, di] of cartina) if (s[k] !== di) diverse.push(nome)
  return diverse.length > 0 ? diverse.join(' · ') : 'Domande, risposte, tempo, cartina, aiuti'
}

function Gruppo({ titolo, nota, children }: { titolo: string; nota?: string; children: ReactNode }) {
  return (
    <div className="quiz-gruppo">
      <p className="quiz-gruppo__titolo">{titolo}</p>
      {children}
      {nota && <p className="quiz-gruppo__nota">{nota}</p>}
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
      className="quiz-tempo"
      disabled={disabilitato}
      onClick={() => onCambia(!acceso)}
    >
      <span className="quiz-tempo__testi">
        <span className="quiz-tempo__titolo">{titolo}</span>
        {sotto && <span className="quiz-tempo__sotto">{sotto}</span>}
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
