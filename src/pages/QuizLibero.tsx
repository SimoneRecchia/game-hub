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
import { nomeArea, nomeTipo } from '@/games/quiz/testi'
import {
  OPZIONI_PREDEFINITE,
  leggiStatistiche,
  useQuizLibero,
  type ImpostazioniLibera,
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
import { TIPI, type AreaQuiz, type IndiceQuiz, type Notorieta, type TipoDomanda } from '@shared/quiz-domande'
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
  const extra = [nomeArea(impostazioni.area, ix), impostazioni.morteImprovvisa ? 'morte improvvisa' : null].filter(
    Boolean,
  )

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
        intro={{ titolo: NOMI_CATEGORIE[impostazioni.categoria], sotto: `Libera · ${extra.join(' · ')}` }}
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
  // `?sfida=1`: si arriva dalla pagina del quiz con il foglio della sfida gia' aperto.
  const [query] = useSearchParams()
  const [sfida, setSfida] = useState(query.get('sfida') === '1')
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
  // Sulla cartina il tempo e' il doppio: si mostrano i secondi veri del modo scelto.
  const perModo = cartina ? 2 : 1
  const riassunto = riassuntoAvanzate(scelte)

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

      <Sezione titolo="Modalità">
        <SegmentedControl
          ariaLabel="Modalità"
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
          sotto={scelte.secondi === null ? undefined : `${secondi * perModo} secondi a domanda`}
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
          {riassunto && <span className="quiz-avanzate__sotto">{riassunto}</span>}
        </span>
        <IconChevronRight size={18} className="quiz-avanzate__freccia" />
      </button>

      {avanzate && (
        <div className="quiz-avanzate__corpo">
          <Sezione titolo="Domande e risposte">
            {tipi.length > 1 && (
              <Gruppo titolo="Tipi di domanda">
                {tipi.map((t) => {
                  const acceso = tipiScelti.includes(t)
                  return (
                    <Interruttore
                      key={t}
                      titolo={nomeTipo(t, categoria)}
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
              <Gruppo titolo="Risposte tra cui scegliere">
                <SegmentedControl
                  ariaLabel="Risposte tra cui scegliere"
                  options={RISPOSTE_LIBERE.map((n) => ({ value: String(n), label: String(n) }))}
                  value={String(scelte.risposte ?? RISPOSTE_PREDEFINITE)}
                  onChange={(v) => cambia({ risposte: Number(v) })}
                />
              </Gruppo>
            )}
            <Gruppo titolo="Difficoltà">
              <SegmentedControl
                ariaLabel="Difficoltà"
                options={NOTORIETA}
                value={scelte.notorieta ?? 'misti'}
                onChange={(v) => cambia({ notorieta: v })}
              />
            </Gruppo>
            <Gruppo titolo="Ordine">
              <SegmentedControl
                ariaLabel="Ordine delle domande"
                options={[
                  { value: 'sale', label: 'Dalla più facile' },
                  { value: 'caso', label: 'A caso' },
                ]}
                value={scelte.ordine ?? 'sale'}
                onChange={(v) => cambia({ ordine: v })}
              />
            </Gruppo>
            {categoria === 'capitali' && !cartina && (
              <Interruttore
                titolo="Bandiera nella domanda"
                sotto="Quando si chiede la capitale di uno stato"
                acceso={scelte.bandieraCapitali ?? true}
                onCambia={(si) => cambia({ bandieraCapitali: si })}
              />
            )}
          </Sezione>

          <Sezione titolo="Tempo">
            {scelte.secondi !== null && (
              <Gruppo titolo="Secondi per domanda">
                <SegmentedControl
                  ariaLabel="Secondi per domanda"
                  options={SECONDI_LIBERI.map((n) => ({ value: String(n), label: `${n * perModo} s` }))}
                  value={String(secondi)}
                  onChange={(v) => cambia({ secondi: Number(v) })}
                />
              </Gruppo>
            )}
            <Interruttore
              titolo="Avanti automatico"
              acceso={scelte.avantiDaSolo}
              onCambia={(si) => cambia({ avantiDaSolo: si })}
            />
          </Sezione>

          <Sezione titolo="Cartina">
            <Interruttore
              titolo="Cartina dopo la risposta"
              sotto="Mostra dove si trova la risposta giusta"
              acceso={scelte.imparo}
              onCambia={(si) => cambia({ imparo: si })}
            />
            {cartina && (
              <Interruttore
                titolo="Evidenzia cosa si può toccare"
                acceso={scelte.evidenzia}
                onCambia={(si) => cambia({ evidenzia: si })}
              />
            )}
            {cartina && scelte.area !== 'mondo' && (
              <Interruttore
                titolo="Blocca fuori dalla zona"
                acceso={scelte.soloZona}
                onCambia={(si) => cambia({ soloZona: si })}
              />
            )}
            {cartina && categoria !== 'stati' && categoria !== 'bandiere' && (
              <Interruttore
                titolo="Nomi dei paesi"
                acceso={scelte.nomiPaesi}
                onCambia={(si) => cambia({ nomiPaesi: si })}
              />
            )}
          </Sezione>

          <Sezione titolo="Aiuti e sfide">
            {!cartina && (
              <Interruttore
                titolo="Due aiuti 50 e 50"
                sotto="Tolgono metà delle risposte sbagliate"
                acceso={scelte.aiuti}
                onCambia={(si) => cambia({ aiuti: si })}
              />
            )}
            <Interruttore
              titolo="Ripeti le sbagliate"
              sotto="Alla fine della partita"
              acceso={scelte.ripasso}
              onCambia={(si) => cambia({ ripasso: si })}
            />
            <Interruttore
              titolo="Morte improvvisa"
              sotto="La partita finisce al primo errore"
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

      <Sheet
        open={paesiAperti}
        onClose={() => setPaesiAperti(false)}
        title="Scegli un paese"
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

/** Le opzioni avanzate cambiate, in una riga sotto il titolo; niente se sono quelle di sempre. */
function riassuntoAvanzate(s: ImpostazioniLibera): string | null {
  const cartina = s.modo === 'cartina'
  const diverse: string[] = []
  if (s.tipi?.length) diverse.push('alcuni tipi di domanda')
  if (!cartina && s.risposte !== RISPOSTE_PREDEFINITE) diverse.push(`${s.risposte} risposte`)
  if (s.notorieta === 'noti') diverse.push('facile')
  if (s.notorieta === 'rari') diverse.push('difficile')
  if (s.ordine === 'caso') diverse.push('a caso')
  if (s.categoria === 'capitali' && !cartina && !s.bandieraCapitali) diverse.push('senza bandiera')
  if (s.secondi !== null && s.secondi !== SECONDI_SCELTA) diverse.push(`${s.secondi * (cartina ? 2 : 1)} secondi`)
  if (s.avantiDaSolo) diverse.push('avanti automatico')
  if (!s.imparo) diverse.push('senza cartina dopo la risposta')
  if (cartina && !s.evidenzia) diverse.push('senza evidenziare')
  if (cartina && s.area !== 'mondo' && !s.soloZona) diverse.push('si tocca anche fuori zona')
  if (cartina && s.nomiPaesi) diverse.push('nomi dei paesi')
  if (!cartina && s.aiuti) diverse.push('50 e 50')
  if (s.ripasso) diverse.push('ripeti le sbagliate')
  if (s.morteImprovvisa) diverse.push('morte improvvisa')
  return diverse.length > 0 ? diverse.join(' · ') : null
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
