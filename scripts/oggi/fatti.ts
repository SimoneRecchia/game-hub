/**
 * I fatti di un giorno: quelli abbastanza noti, dal piu' noto, con la frase
 * pronta per il quiz e la voce che li racconta.
 *
 * Prima quelli che la prima pagina di Wikipedia sceglie per quel giorno, che
 * sono noti per definizione: fra loro e con gli altri decide il punteggio di
 * `notorieta.ts`. Poi gli altri che passano la soglia, fino a
 * `FATTI_MASSIMI`; se sono meno di `FATTI_MINIMI`, i migliori che restano.
 */

import type { FattoQuiz } from '../../shared/quiz-cultura'
import type { EventoFeed } from './eventi'
import { propria, valuta, visibile, type Valutazione } from './notorieta'
import { perNotorieta } from './ordine'
import {
  accorcia,
  contieneAnno,
  primeFrasi,
  pulisci,
  senzaAnniRelativi,
  senzaIlProprioAnno,
  significative,
  soloContesto,
} from './testi'
import type { Voce } from './voci'

export const FATTI_MASSIMI = 25
export const FATTI_MINIMI = 12

/**
 * Da qui un fatto e' "abbastanza noto": una voce sua in una trentina di
 * Wikipedia, o una persona che ne ha una cinquantina e lo cita fra le prime
 * righe. Sotto, un fatto entra solo per arrivare a `FATTI_MINIMI`.
 */
export const SOGLIA = 25

export type Motivo = 'anno zero' | 'senza testo' | 'contiene il suo anno' | 'doppio'

/**
 * Gli errori del feed che si conoscono, con l'anno giusto. La prima pagina di
 * Wikipedia e' scritta a mano, e un anno sbagliato diventerebbe una risposta
 * giusta sbagliata.
 */
const CORREZIONI: ReadonlyArray<{ giorno: string; anno: number; testo: RegExp; giusto: number }> = [
  // La British Broadcasting Company fu registrata il 15 dicembre 1922: il feed dice 1902.
  { giorno: '12-15', anno: 1902, testo: /fondata la BBC/, giusto: 1922 },
]

function corretto(giorno: string, e: EventoFeed): EventoFeed {
  const c = CORREZIONI.find((x) => x.giorno === giorno && x.anno === e.year && x.testo.test(e.text ?? ''))
  return c ? { ...e, year: c.giusto } : e
}

/**
 * L'elezione o la consacrazione di un papa del primo millennio e mezzo. Le voci
 * dei papi ci sono in molte Wikipedia perché le scrivono i programmi, come
 * quelle degli asteroidi, e quasi nessuno sa quando fu eletto Gelasio II:
 * valgono un terzo (`PESO_ELEZIONI_PAPALI`). Gli altri fatti dei papi di allora
 * restano come sono — Canossa, Avignone, l'incoronazione di Ottone I sono storia
 * che si studia — e restano quelli che sceglie la prima pagina.
 */
const ELEZIONE_PAPALE = new RegExp(
  [
    '\\b(?:eletto|elezione di|consacrazione di|consacrato|diventa|succede a|proclamato) papa\\b',
    '\\bantipapa\\b',
    '\\bsoglio pontificio\\b',
    '\\binizio del pontificato\\b',
    '\\bpapa \\S+(?: \\S+)? viene eletto\\b',
  ].join('|'),
  'i',
)
const ELEZIONI_PAPALI_FINO_A = 1500
const PESO_ELEZIONI_PAPALI = 1 / 3

/** Il punteggio con cui un fatto entra: quello di `notorieta.ts`, tranne le elezioni dei papi di allora. */
function punteggio(c: Candidato): number {
  const p = c.valutazione.punteggio
  const elezione = c.evento.year < ELEZIONI_PAPALI_FINO_A && ELEZIONE_PAPALE.test(c.testo ?? c.evento.text ?? '')
  return elezione ? p * PESO_ELEZIONI_PAPALI : p
}

export interface Candidato {
  evento: EventoFeed
  /** Scelto dalla prima pagina di Wikipedia. */
  scelto: boolean
  /** La frase per il quiz: `null` se e' scartata (vedi `motivo`). */
  testo: string | null
  /** Oltre i 200 caratteri anche accorciata: entra solo se serve ad arrivare al minimo. */
  lungo: boolean
  /** La frase e' stata accorciata, o ha perso il proprio anno. */
  accorciato: boolean
  senzaAnno: boolean
  motivo?: Motivo
  valutazione: Valutazione
}

export interface FattiDelGiorno {
  fatti: FattoQuiz[]
  tenuti: Candidato[]
  scartati: Candidato[]
  /** Frasi accorciate, e frasi che hanno perso il proprio anno, fra le tenute. */
  accorciati: number
  senzaAnno: number
}

function titolo(t: string): string {
  return t.replace(/_/g, ' ')
}

/**
 * La frase di un fatto pronta per il quiz, o perché non va. Per accorciarla si
 * puo' ripiegare sul nome del fatto prima dei due punti, se e' il titolo di
 * una delle sue voci che non sono luoghi: "Strage di Nizza", non "Portogallo".
 */
function frase(
  e: EventoFeed,
  v: Valutazione,
): { testo: string | null; lungo: boolean; accorciato: boolean; senzaAnno: boolean; motivo?: Motivo } {
  const no = (motivo: Motivo) => ({ testo: null, lungo: false, accorciato: false, senzaAnno: false, motivo })
  // L'anno zero non c'e': e' la nascita di Gesù secondo il computo della voce, non una data.
  if (e.year === 0) return no('anno zero')
  const pulito = pulisci(e.text ?? '')
  if (pulito.length < 10 || soloContesto(e.text ?? '')) return no('senza testo')
  const senzaProprio = senzaIlProprioAnno(pulito, e.year)
  const senza = senzaProprio === null ? null : senzaAnniRelativi(senzaProprio)
  if (senza === null) return no('contiene il suo anno')
  /*
   * Per ripiegare sul nome, solo voci che hanno la data del giorno: "Guerra del
   * Golfo: il Consiglio di sicurezza approva la risoluzione 678…" non e' la
   * guerra del Golfo, che quel 29 novembre era gia' cominciata.
   */
  const p = v.principale
  let corto = accorcia(senza, {
    nome: p && propria(p.legame) && p.voce.genere !== 'luogo' ? titolo(p.pagina.title) : undefined,
    delGiorno: v.voci
      .filter((x) => x.legame === 'giorno' && x.voce.genere !== 'luogo' && x.voce.genere !== 'generico')
      .map((x) => titolo(x.pagina.title)),
  })
  // Il nome di una voce puo' avere l'anno ("Terremoto del Nepal del 25 aprile 2015"): allora non serve.
  if (corto !== null && contieneAnno(corto, e.year)) corto = null
  // Qualche frase del feed comincia minuscola ("in Austria Francesco II succede al padre").
  if (corto !== null) corto = corto.charAt(0).toUpperCase() + corto.slice(1)
  return {
    testo: corto ?? senza,
    lungo: corto === null,
    accorciato: corto !== null && corto !== senza,
    senzaAnno: senza !== pulito,
  }
}

/** Le voci che dicono di che fatto si tratta: non i luoghi, non le classi, non il contesto. */
function vociSue(v: Valutazione): Set<string> {
  return new Set(
    v.voci
      .filter((x) => x.voce.genere !== 'generico' && x.voce.genere !== 'luogo' && x.legame !== 'lungo')
      .map((x) => x.voce.id),
  )
}

function doppio(evento: EventoFeed, valutazione: Valutazione): Candidato {
  const niente = { testo: null, lungo: false, accorciato: false, senzaAnno: false }
  return { evento, scelto: false, ...niente, motivo: 'doppio', valutazione }
}

/**
 * Lo stesso fatto nei due elenchi: lo stesso anno, e una voce in comune o quasi
 * le stesse parole. Non quelle di ogni fatto: "Esce nel Regno Unito il primo
 * singolo dei Beatles" e "Esce nel Regno Unito il primo film di James Bond"
 * sono due fatti.
 */
function stessoFatto(a: EventoFeed, va: Valutazione, b: EventoFeed, vb: Valutazione): boolean {
  if (a.year !== b.year) return false
  const sa = vociSue(va)
  if ([...vociSue(vb)].some((id) => sa.has(id))) return true
  const pa = significative(a.text)
  const pb = significative(b.text)
  const comuni = [...pa].filter((p) => pb.has(p)).length
  return comuni >= 0.6 * Math.min(pa.size, pb.size) && comuni >= 2
}

export function fattiDelGiorno(
  giorno: string,
  dalFeed: readonly EventoFeed[],
  sceltiDalFeed: readonly EventoFeed[],
  voci: ReadonlyMap<string, Voce>,
): FattiDelGiorno {
  const eventi = dalFeed.map((e) => corretto(giorno, e))
  const scelti = sceltiDalFeed.map((e) => corretto(giorno, e))
  const valutati = eventi.map((e) => ({ e, v: valuta(e, giorno, voci), preso: false }))
  const candidati: Candidato[] = []

  for (const s of scelti) {
    const vs = valuta(s, giorno, voci)
    const doppi = valutati.filter((x) => !x.preso && stessoFatto(s, vs, x.e, x.v))
    for (const d of doppi) d.preso = true
    // La prima frase che va, di solito quella scelta, che e' la piu' corta.
    const fonti = [{ e: s, v: vs }, ...doppi]
    const frasi = fonti.map((f) => ({ ...frase(f.e, f.v), fonte: f }))
    const { fonte, ...buona } =
      frasi.find((f) => f.testo !== null && !f.lungo) ?? frasi.find((f) => f.testo !== null) ?? frasi[0]
    /*
     * Con le voci degli altri elenchi di cui la frase parla: la riga del feed
     * "…la cattedrale di St. Paul viene colpita dalle bombe. Durante un raid su
     * Liverpool, nasce John Lennon" e' lo stesso fatto, ma John Lennon no.
     */
    const testo = buona.testo ?? s.text
    const pagine = [...(fonte.e.pages ?? [])]
    for (const f of fonti) {
      for (const x of f === fonte ? [] : f.v.voci) {
        if (!pagine.some((q) => q.title === x.pagina.title) && visibile(x, f.e.text ?? '', testo)) pagine.push(x.pagina)
      }
    }
    const unito: EventoFeed = { ...fonte.e, pages: pagine }
    const valutazione = valuta(unito, giorno, voci, testo)
    candidati.push({ evento: { ...unito, text: testo }, scelto: true, ...buona, valutazione })
    for (const d of doppi) candidati.push(doppio(d.e, d.v))
  }
  const visti = new Set(candidati.filter((c) => c.testo).map((c) => `${c.evento.year} ${c.testo!.toLowerCase()}`))
  for (const x of valutati.filter((x) => !x.preso)) {
    const f = frase(x.e, x.v)
    const chiave = `${x.e.year} ${(f.testo ?? '').toLowerCase()}`
    if (f.testo !== null && visti.has(chiave)) {
      candidati.push(doppio(x.e, x.v))
      continue
    }
    visti.add(chiave)
    // Il punteggio e la scheda della frase che si mostra, che puo' aver perso un pezzo.
    const valutazione = f.testo !== null ? valuta(x.e, giorno, voci, f.testo) : x.v
    candidati.push({ evento: x.e, scelto: false, ...f, valutazione })
  }

  // Prima gli scelti, poi dal piu' noto; a pari punteggio il piu' recente, poi la frase: l'ordine non dipende dal feed.
  const ordinati = candidati
    .filter((c) => c.testo !== null)
    .sort(
      (a, b) =>
        Number(b.scelto) - Number(a.scelto) ||
        punteggio(b) - punteggio(a) ||
        b.evento.year - a.evento.year ||
        a.testo!.localeCompare(b.testo!),
    )
  const tenuti = ordinati
    .filter((c) => !c.lungo && (c.scelto || punteggio(c) >= SOGLIA))
    .slice(0, FATTI_MASSIMI)
  // Pochi sopra la soglia: si arriva al minimo con i migliori che restano, le frasi lunghe per ultime.
  for (const c of [...ordinati.filter((c) => !c.lungo), ...ordinati.filter((c) => c.lungo)]) {
    if (tenuti.length >= FATTI_MINIMI) break
    if (!tenuti.includes(c)) tenuti.push(c)
  }
  const fama = perNotorieta(tenuti, (c) => (c.scelto ? 1e6 : 0) + punteggio(c))

  const fatti = tenuti
    .map((c): FattoQuiz => {
      const p = c.valutazione.principale?.pagina
      const d = primeFrasi(p?.extract)
      return {
        anno: c.evento.year,
        t: c.testo!,
        ...(p ? { w: titolo(p.titles?.normalized ?? p.normalizedtitle ?? p.title) } : {}),
        ...(p && d ? { d } : {}),
        f: fama.get(c) ?? 0,
      }
    })
    .sort((a, b) => a.anno - b.anno || a.t.localeCompare(b.t))

  for (const f of fatti) if (contieneAnno(f.t, f.anno)) throw new Error(`${giorno}: "${f.t}" dice il suo anno`)
  return {
    fatti,
    tenuti,
    scartati: candidati.filter((c) => !tenuti.includes(c)),
    accorciati: tenuti.filter((c) => c.accorciato).length,
    senzaAnno: tenuti.filter((c) => c.senzaAnno).length,
  }
}
