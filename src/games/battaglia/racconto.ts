import { FLOTTA, caselleDellaNave, coordinata, tipoDi, type Nave, type TipoNave } from '@shared/battaglia'
import type { VistaBattaglia } from '@shared/types'

/**
 * Quel che si dice di una partita mentre si gioca: l'annuncio al centro dello
 * schermo, la riga sotto il turno, lo stato delle navi.
 *
 * Tutto ricavato dalla vista, che e' la stessa cosa che arriva dal server:
 * qui non si tiene nessuno stato, così una partita riaperta dice le stesse
 * cose di una giocata senza interruzioni.
 */

function maiuscola(testo: string): string {
  return testo.charAt(0).toUpperCase() + testo.slice(1)
}

/** Chi spara dall'altra parte, all'inizio di una frase: "Il computer", "Giada". */
function chiSpara(vista: VistaBattaglia): string {
  return vista.modalita === 'amici' ? vista.avversario.displayName : 'Il computer'
}

/** "La corazzata · 4 caselle": il nome e, come chiede chi gioca, quanto e' lunga. */
export function naveConCaselle(tipo: TipoNave): string {
  return `${maiuscola(tipo.la)} · ${tipo.lunghezza} caselle`
}

/**
 * Quanto resta al centro dello schermo l'annuncio di un colpo. Annuncio.css
 * divide le sue animazioni in proporzione a questa durata, e il colpo del
 * computer aspetta che sia finita.
 */
export const DURATA_ANNUNCIO_MS = { colpito: 1_050, affondato: 1_600 } as const

export interface Annuncio {
  /** Il numero del colpo: cambia a ogni colpo e fa ripartire l'animazione. */
  id: number
  mio: boolean
  esito: 'colpito' | 'affondato'
  titolo: string
  sotto: string
  /** La nave affondata, per disegnarne le caselle; null per un colpo e basta. */
  nave: TipoNave | null
}

/**
 * L'annuncio al centro dello schermo: solo per i colpi che contano.
 *
 * L'acqua no — succede quasi sempre, e un annuncio a ogni colpo smetterebbe di
 * dire qualcosa. Per quella basta lo spruzzo sulla casella e la riga di stato.
 */
export function annuncioDi(vista: VistaBattaglia): Annuncio | null {
  const u = vista.ultimo
  if (!u || u.esito === 'acqua') return null
  const id = vista.colpiMiei.length + vista.colpiSubiti.length
  const dove = coordinata(u.casella)
  if (u.esito === 'colpito') {
    return u.mio
      ? { id, mio: true, esito: 'colpito', titolo: 'Colpito!', sotto: `in ${dove}`, nave: null }
      : {
          id,
          mio: false,
          esito: 'colpito',
          titolo: 'Ti ha colpito',
          sotto: `${chiSpara(vista)} ha sparato in ${dove}`,
          nave: null,
        }
  }
  const nave = tipoDi(u.nave!)
  return {
    id,
    mio: u.mio,
    esito: 'affondato',
    titolo: u.mio ? `${nave.femminile ? 'Affondata' : 'Affondato'}!` : 'Ti ha affondato',
    sotto: naveConCaselle(nave),
    nave,
  }
}

export type Tono = 'buona' | 'cattiva' | 'neutra'

/**
 * La riga sotto il turno: com'e' andato l'ultimo colpo, detto come al tavolo.
 *
 * Deve stare in una riga della plancia anche su un telefono stretto — una riga
 * che va a capo sposterebbe i due mari a ogni colpo — e la nave con il nome
 * piu' lungo e' il cacciatorpediniere: quindi "Hai perso il cacciatorpediniere"
 * e non "Il computer ti ha affondato il cacciatorpediniere".
 */
export function notiziaDi(vista: VistaBattaglia): { testo: string; tono: Tono } | null {
  const u = vista.ultimo
  if (!u) return null
  const dove = coordinata(u.casella)
  const chi = chiSpara(vista)
  if (u.mio) {
    if (u.esito === 'acqua') return { testo: `Acqua in ${dove}`, tono: 'neutra' }
    if (u.esito === 'colpito') return { testo: `Colpito in ${dove}!`, tono: 'buona' }
    const nave = tipoDi(u.nave!)
    return { testo: `${nave.femminile ? 'Affondata' : 'Affondato'} ${nave.la}!`, tono: 'buona' }
  }
  if (u.esito === 'acqua') return { testo: `${chi}: acqua in ${dove}`, tono: 'neutra' }
  if (u.esito === 'colpito') return { testo: `${chi} ti ha colpito in ${dove}`, tono: 'cattiva' }
  return { testo: `Hai perso ${tipoDi(u.nave!).la}`, tono: 'cattiva' }
}

/**
 * La vista com'era dopo il mio colpo e prima di quello del computer.
 *
 * Il server manda la partita dopo tutti e due: qui si toglie il suo ultimo
 * colpo, e se e' stato lui a chiudere la partita si torna alla battaglia in
 * corso. Null se il computer non ha risposto — il mio colpo ha affondato
 * l'ultima nave — e non c'e' niente da rimandare.
 */
export function primaDelComputer(prima: VistaBattaglia, dopo: VistaBattaglia): VistaBattaglia | null {
  if (dopo.modalita === 'amici') return null
  if (dopo.colpiSubiti.length <= prima.colpiSubiti.length || !dopo.ultimo || dopo.ultimo.mio) return null
  const mio = dopo.colpiMiei.at(-1)
  if (!mio) return null
  return senzaFine({
    ...dopo,
    colpiSubiti: dopo.colpiSubiti.slice(0, -1),
    ultimo: { ...mio, mio: true },
    tuoTurno: false,
  })
}

/**
 * La partita chiusa da un colpo, un attimo prima di dirlo.
 *
 * L'ultimo affondamento si guarda sul mare, con il suo annuncio, e solo dopo
 * arriva la schermata di fine: passarci subito farebbe perdere proprio il colpo
 * che ha deciso la partita. Una partita ancora in corso resta com'e'.
 */
export function senzaFine(vista: VistaBattaglia): VistaBattaglia {
  if (vista.stato !== 'finita' || vista.motivo !== 'flotta') return vista
  return {
    ...vista,
    stato: 'battaglia',
    vincitore: null,
    motivo: null,
    flottaNemica: null,
    punti: null,
    tuoTurno: false,
  }
}

export type StatoPezzo = 'intero' | 'colpito' | 'affondato' | 'ignoto'

export interface StatoNave {
  tipo: TipoNave
  pezzi: StatoPezzo[]
  affondata: boolean
}

/**
 * Le navi dell'avversario come le si conosce: la lunghezza di ognuna, che nel
 * gioco su carta si sa dall'inizio, e quali sono gia' a fondo. Dove stanno le
 * altre, e quale nave si e' colpita, si scopre solo all'affondamento.
 */
export function naviNemiche(affondate: readonly Nave[]): StatoNave[] {
  const aFondo = new Set(affondate.map((n) => n.tipo))
  return FLOTTA.map((tipo) => {
    const affondata = aFondo.has(tipo.id)
    return { tipo, affondata, pezzi: Array.from({ length: tipo.lunghezza }, () => (affondata ? 'affondato' : 'ignoto')) }
  })
}

/** Le proprie navi, pezzo per pezzo: intero, colpito, o a fondo con tutta la nave. */
export function naviProprie(navi: readonly Nave[], colpiPresi: ReadonlySet<number>): StatoNave[] {
  return FLOTTA.map((tipo) => {
    const nave = navi.find((n) => n.tipo === tipo.id)
    const caselle = nave ? caselleDellaNave(nave) : []
    const affondata = caselle.length > 0 && caselle.every((k) => colpiPresi.has(k))
    return {
      tipo,
      affondata,
      pezzi: caselle.map((k) => (affondata ? 'affondato' : colpiPresi.has(k) ? 'colpito' : 'intero')),
    }
  })
}
