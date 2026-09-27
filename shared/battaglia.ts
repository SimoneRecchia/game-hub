/**
 * Regole della battaglia navale, condivise fra client e server.
 *
 * Le regole sono quelle classiche del gioco su carta e della scatola Milton
 * Bradley, nella versione che si gioca in Italia:
 *
 *  - due mari di 10 x 10 caselle, colonne dalla A alla J e righe da 1 a 10;
 *  - cinque navi a testa: portaerei (5), corazzata (4), incrociatore (3),
 *    sottomarino (3), cacciatorpediniere (2);
 *  - le navi stanno dritte, in orizzontale o in verticale, e **non si
 *    toccano**, nemmeno d'angolo — "due navi non possono toccarsi", come dice
 *    la voce di Wikipedia;
 *  - un colpo a testa, a turni alterni. L'avversario risponde "acqua",
 *    "colpito", oppure "colpito e affondato" con il nome della nave;
 *  - vince chi affonda per primo tutta la flotta dell'altro.
 *
 * Il server usa queste funzioni come verita' — la flotta dell'avversario non
 * lascia mai il server finché la partita non e' finita — e il client le usa per
 * disporre le navi e per mostrare in anticipo se una disposizione e' valida.
 */

/** Lato del mare. */
export const LATO = 10
export const CASELLE = LATO * LATO

/** Le colonne si chiamano con le lettere, le righe con i numeri: "B-6". */
export const LETTERE_COLONNE = 'ABCDEFGHIJ'

export type IdNave = 'portaerei' | 'corazzata' | 'incrociatore' | 'sottomarino' | 'cacciatorpediniere'

export interface TipoNave {
  id: IdNave
  nome: string
  lunghezza: number
  /** Con l'articolo: "il cacciatorpediniere", non "la" — due navi su cinque sono maschili. */
  la: string
  /** Con l'indeterminativo: "un incrociatore". */
  una: string
  /** Per accordare quel che se ne dice: "affondata" la corazzata, "affondato" il sottomarino. */
  femminile: boolean
}

/** La flotta, dalla nave piu' grande alla piu' piccola: e' l'ordine in cui si dispone. */
export const FLOTTA: readonly TipoNave[] = [
  { id: 'portaerei', nome: 'Portaerei', lunghezza: 5, la: 'la portaerei', una: 'una portaerei', femminile: true },
  { id: 'corazzata', nome: 'Corazzata', lunghezza: 4, la: 'la corazzata', una: 'una corazzata', femminile: true },
  {
    id: 'incrociatore',
    nome: 'Incrociatore',
    lunghezza: 3,
    la: "l'incrociatore",
    una: 'un incrociatore',
    femminile: false,
  },
  {
    id: 'sottomarino',
    nome: 'Sottomarino',
    lunghezza: 3,
    la: 'il sottomarino',
    una: 'un sottomarino',
    femminile: false,
  },
  {
    id: 'cacciatorpediniere',
    nome: 'Cacciatorpediniere',
    lunghezza: 2,
    la: 'il cacciatorpediniere',
    una: 'un cacciatorpediniere',
    femminile: false,
  },
]

/** Quante caselle occupa la flotta intera: diciassette. */
export const CASELLE_FLOTTA = FLOTTA.reduce((n, t) => n + t.lunghezza, 0)

export function tipoDi(id: IdNave): TipoNave {
  const tipo = FLOTTA.find((t) => t.id === id)
  if (!tipo) throw new Error(`Nave sconosciuta: ${id}`)
  return tipo
}

/** Una nave in mare: il tipo, la casella di prua (in alto o a sinistra), il verso. */
export interface Nave {
  tipo: IdNave
  r: number
  c: number
  verticale: boolean
}

export type Esito = 'acqua' | 'colpito' | 'affondato'

export function casella(r: number, c: number): number {
  return r * LATO + c
}

/** "B-6": la lettera della colonna, poi il numero della riga. */
export function coordinata(k: number): string {
  return `${LETTERE_COLONNE[k % LATO]}-${Math.floor(k / LATO) + 1}`
}

/** Le caselle di una nave, dalla prua alla poppa. Fuori dal mare restano fuori: le scarta chi valida. */
export function caselleDellaNave(nave: Nave): number[] {
  const { lunghezza } = tipoDi(nave.tipo)
  return Array.from({ length: lunghezza }, (_, i) =>
    nave.verticale ? casella(nave.r + i, nave.c) : casella(nave.r, nave.c + i),
  )
}

function dentro(nave: Nave): boolean {
  const { lunghezza } = tipoDi(nave.tipo)
  const fondo = nave.verticale ? nave.r + lunghezza - 1 : nave.r
  const destra = nave.verticale ? nave.c : nave.c + lunghezza - 1
  return (
    Number.isInteger(nave.r) &&
    Number.isInteger(nave.c) &&
    nave.r >= 0 &&
    nave.c >= 0 &&
    fondo < LATO &&
    destra < LATO
  )
}

/** Le caselle intorno a una nave, lei compresa: dove un'altra nave non puo' stare. */
function ingombro(nave: Nave): Set<number> {
  const attorno = new Set<number>()
  for (const k of caselleDellaNave(nave)) {
    const r = Math.floor(k / LATO)
    const c = k % LATO
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const rr = r + dr
        const cc = c + dc
        if (rr >= 0 && cc >= 0 && rr < LATO && cc < LATO) attorno.add(casella(rr, cc))
      }
    }
  }
  return attorno
}

export type Verifica = { ok: true } | { ok: false; errore: string }

/**
 * Una nave si puo' aggiungere a quelle gia' in mare?
 *
 * La regola del "non si toccano" vale anche d'angolo: due navi in diagonale si
 * toccano, e nel gioco su carta non si puo'.
 */
export function naveAmmessa(nave: Nave, altre: readonly Nave[]): Verifica {
  if (!dentro(nave)) return { ok: false, errore: 'La nave esce dal mare.' }
  const proprie = caselleDellaNave(nave)
  for (const altra of altre) {
    if (altra.tipo === nave.tipo) continue
    const vicino = ingombro(altra)
    if (proprie.some((k) => vicino.has(k))) {
      return { ok: false, errore: `Non può toccare ${tipoDi(altra.tipo).la}, nemmeno d’angolo.` }
    }
  }
  return { ok: true }
}

/**
 * La flotta e' quella giusta, e sta in mare secondo le regole?
 *
 * Tutto quel che arriva dal client e' da controllare: una flotta con due
 * cacciatorpediniere e nessuna portaerei, o con le navi sovrapposte, sarebbe
 * un modo di rendersi piu' difficili da colpire.
 */
export function flottaValida(navi: readonly Nave[]): Verifica {
  if (!Array.isArray(navi) || navi.length !== FLOTTA.length) {
    return { ok: false, errore: `Servono ${FLOTTA.length} navi.` }
  }
  for (const tipo of FLOTTA) {
    const quante = navi.filter((n) => n?.tipo === tipo.id).length
    if (quante !== 1) return { ok: false, errore: `Serve esattamente ${tipo.una}.` }
  }
  for (const nave of navi) {
    if (typeof nave.verticale !== 'boolean') {
      return { ok: false, errore: 'Una nave non è né orizzontale né verticale.' }
    }
    const verifica = naveAmmessa(nave, navi)
    if (!verifica.ok) return verifica
  }
  return { ok: true }
}

/**
 * Una flotta disposta a caso, secondo le regole.
 *
 * Dalla nave piu' grande alla piu' piccola: le grandi hanno meno posti, e
 * metterle per prime evita di doverle incastrare fra le altre. Con dieci per
 * dieci e diciassette caselle un posto si trova sempre in pochi tentativi; il
 * giro esterno ricomincia da capo nel caso rarissimo in cui le prime navi
 * abbiano chiuso tutto il mare alle ultime.
 */
export function disponiACaso(rng: () => number = Math.random): Nave[] {
  for (;;) {
    const navi: Nave[] = []
    for (const tipo of FLOTTA) {
      let messa = false
      for (let tentativo = 0; tentativo < 400 && !messa; tentativo += 1) {
        const verticale = rng() < 0.5
        const nave: Nave = {
          tipo: tipo.id,
          verticale,
          r: Math.floor(rng() * (verticale ? LATO - tipo.lunghezza + 1 : LATO)),
          c: Math.floor(rng() * (verticale ? LATO : LATO - tipo.lunghezza + 1)),
        }
        if (naveAmmessa(nave, navi).ok) {
          navi.push(nave)
          messa = true
        }
      }
      if (!messa) break
    }
    if (navi.length === FLOTTA.length) return navi
  }
}

/** Le caselle occupate dalla flotta, con la nave che c'e' sopra. */
export function mappaDellaFlotta(navi: readonly Nave[]): Map<number, IdNave> {
  const mappa = new Map<number, IdNave>()
  for (const nave of navi) for (const k of caselleDellaNave(nave)) mappa.set(k, nave.tipo)
  return mappa
}

/**
 * L'esito di un colpo, dati i colpi gia' arrivati su quella flotta.
 *
 * "Affondato" quando il colpo prende l'ultima casella ancora intera di una
 * nave: e' l'unico momento in cui si annuncia il nome, come al tavolo.
 */
export function esitoDelColpo(
  navi: readonly Nave[],
  colpiPrima: ReadonlySet<number>,
  k: number,
): { esito: Esito; nave: IdNave | null } {
  const nave = navi.find((n) => caselleDellaNave(n).includes(k))
  if (!nave) return { esito: 'acqua', nave: null }
  const intere = caselleDellaNave(nave).filter((x) => x !== k && !colpiPrima.has(x))
  return { esito: intere.length === 0 ? 'affondato' : 'colpito', nave: nave.tipo }
}

/** Le navi affondate da questi colpi. */
export function naviAffondate(navi: readonly Nave[], colpi: ReadonlySet<number>): Nave[] {
  return navi.filter((n) => caselleDellaNave(n).every((k) => colpi.has(k)))
}

/** La flotta e' tutta sotto: la partita e' finita. */
export function flottaAffondata(navi: readonly Nave[], colpi: ReadonlySet<number>): boolean {
  return naviAffondate(navi, colpi).length === navi.length
}
