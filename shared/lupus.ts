/**
 * Lupus in Fabula: la partita e' uno stato che non si modifica, e una funzione
 * che lo fa avanzare (`applica`). Il motore non sa dove gira: lo esegue il
 * telefono che passa di mano, e lo esegue il server per la partita online, e
 * la partita e' la stessa per costruzione. Ogni regola sta qui e solo qui: una
 * regola scritta in una schermata farebbe divergere i due modi di giocare.
 *
 * E' deterministico: il caso passa dal seme (`statoCaso`, vedi lupus-caso.ts) e
 * l'ora la da' chi chiama (`adesso`, in millisecondi), quindi le stesse azioni
 * sulla stessa partita danno sempre la stessa partita.
 *
 * Lo stato contiene tutto, anche i segreti — chi e' lupo, chi ha scelto chi
 * stanotte — e non va mai mandato a un giocatore cosi' com'e': quel che ognuno
 * puo' vedere lo decide lupus-vista.ts.
 *
 * Le regole sono quelle del regolamento di Lupus in Tabula (dV Giochi), con
 * l'espansione "La vendetta della Lupa Mannara". Alcune sembrano sbagliate e
 * non lo sono.
 *
 *  - La Guardia agisce dalla seconda notte e non protegge se stessa, come dice
 *    il regolamento. Anche il Medium e Miss Purple cominciano dalla seconda, i
 *    Massoni e la Mucca hanno solo la prima, il Mitomane solo la seconda.
 *  - Il Mitomane che copia un lupo conta subito come lupo per la fine della
 *    partita, perché "assume immediatamente il ruolo a tutti gli effetti": con
 *    pochi giocatori la partita puo' finire all'istante.
 *  - Il Criceto muore se lo guarda il Veggente o la Cartomante, ma non Darius,
 *    come dice la nota dell'espansione.
 *  - Il "Benvenuto!" va allo sbranato della notte, non al linciato: e' l'ancora
 *    dei pareggi e il bersaglio del Baron Samedi.
 *  - La fase della decisione c'e' solo se in gioco ci sono Amleto o Dorian
 *    Wolf, e allora la passano tutti i nuovi fantasmi (`decisioniAllaMorte`).
 */

import { casoDa, mescola, pescaUno, type Caso } from './lupus-caso'
import { mazzoDi, type Composizione } from './lupus-composizione'
import { PERSONAGGI, type CompitoNotturno, type Fazione, type IdPersonaggio } from './lupus-personaggi'

/* ─────────────────  I tipi  ───────────────── */

export interface ImpostazioniLupus {
  /** La prima notte i lupi si riconoscono soltanto: il regolamento suggerisce di "sbranare il moderatore". */
  primaNotteSenzaVittime: boolean
  /**
   * I fantasmi votano per scegliere gli indiziati. Il regolamento li fa votare,
   * qui di partenza no: e' una regola della partita, e si accende.
   */
  fantasmiVotano: boolean
  /** Il Gufo letale: 'auto' lo accende da venti giocatori, come consiglia il regolamento. */
  gufoLetale: 'auto' | 'si' | 'no'
  /** Alla morte il ruolo lo vedono tutti: una variante per giocare leggeri, il regolamento dice di no. */
  rivelaRuoloAllaMorte: boolean
  /** Quanto dura la discussione, in secondi; 0 e' senza tempo. */
  secondiDiscussione: number
  /** Quanto durano le arringhe degli indiziati, in secondi; 0 e' senza tempo. */
  secondiArringhe: number
}

export const IMPOSTAZIONI_LUPUS: ImpostazioniLupus = {
  primaNotteSenzaVittime: true,
  fantasmiVotano: false,
  gufoLetale: 'auto',
  rivelaRuoloAllaMorte: false,
  secondiDiscussione: 180,
  secondiArringhe: 60,
}

export type FaseLupus =
  | 'ruoli'
  | 'notte'
  /** I nuovi fantasmi ricevono il "Benvenuto!", e Amleto o Dorian Wolf decidono se rivelarsi. */
  | 'decisione'
  | 'alba'
  | 'discussione'
  | 'nomine'
  | 'arringhe'
  | 'ballottaggio'
  | 'finita'

export interface GiocatoreLupus {
  id: string
  nome: string
  /** Il posto attorno al tavolo, da 0, in senso orario. */
  posto: number
  ruolo: IdPersonaggio
  /** Il ruolo che il Mitomane ha preso, se l'ha preso. */
  ruoloAssunto?: IdPersonaggio
  vivo: boolean
  /** Il Mortovivo ucciso: e' un fantasma che continua a giocare come se fosse vivo. */
  nonMorto?: boolean
  /** Il ruolo lo sanno tutti: il Mortovivo ucciso, Amleto e Dorian che si rivelano, o la variante che lo dice. */
  rivelato?: boolean
  /** Quando e' morto, nell'ordine delle morti della partita. */
  ordineDiMorte?: number
}

/** Quel che un giocatore sceglie di notte: un bersaglio, se usare il potere, nessuno, o che ha letto. */
export type SceltaNotturna =
  | { tipo: 'indica'; bersaglio: string }
  | { tipo: 'potere'; usa: boolean }
  | { tipo: 'nessuno' }
  | { tipo: 'letto' }

/**
 * Perché e' morto un giocatore. `sguardo` e' il Criceto guardato dal Veggente o
 * dalla Cartomante, `gufata` il Gufo letale, `hyde` il dottor Jekyll che ha
 * bevuto la pozione: nessuna causa ha il nome di un personaggio, per la stessa
 * ragione dei compiti (vedi `CompitoNotturno` in lupus-personaggi.ts).
 */
export type CausaDiMorte = 'lupi' | 'linciaggio' | 'sguardo' | 'gufata' | 'hyde' | 'teschio' | 'ritratto'

export interface ResocontoAlba {
  notte: number
  /** Chi e' morto stanotte, senza dire perché, come fa il moderatore. */
  morti: string[]
  /** Perché, per la cronaca intera di fine partita. */
  cause: Record<string, CausaDiMorte>
  risorto?: string
  /** Dorian Wolf che si e' rivelato ed e' rimasto in vita. */
  sopravvissuto?: string
  /** Il regolamento vuole che la trasformazione di Jekyll si annunci. */
  jekyll: boolean
  /** Nessuno sbranato: la Guardia, il Criceto, Lara che colpisce un lupo, la prima notte. */
  nessunaVittima: boolean
}

export type VincitoreLupus = 'villaggio' | 'lupi' | 'criceto' | 'darius'

/** La cronaca della partita: quel che il moderatore dice a tutti, man mano. */
export type EventoLupus =
  | { t: 'notte'; n: number }
  | { t: 'giorno'; n: number }
  | { t: 'morte'; giocatore: string; causa: CausaDiMorte; pubblica: boolean }
  | { t: 'nessuna_vittima'; n: number }
  | { t: 'risorto'; giocatore: string }
  | { t: 'hyde'; n: number }
  | { t: 'indiziati'; giocatori: string[]; gufato?: string }
  | { t: 'linciato'; giocatore: string }
  | { t: 'nessun_linciato'; n: number }
  | { t: 'rivelato'; giocatore: string; ruolo: IdPersonaggio }
  | { t: 'sopravvissuto'; giocatore: string }
  | { t: 'fine'; vincitore: VincitoreLupus }

/** Quel che un giocatore ha saputo di notte, e solo lui. */
export type SegretoLupus =
  | { notte: number; tipo: 'sguardo'; bersaglio: string; malvagio: boolean }
  | { notte: number; tipo: 'seduta'; bersaglio: string | null; mannaro: boolean }
  | { notte: number; tipo: 'indagine'; quanti: number }
  | { notte: number; tipo: 'loggia'; altri: string[] }
  | { notte: number; tipo: 'branco'; lupi: string[] }
  | { notte: number; tipo: 'imitazione'; bersaglio: string; diventato: IdPersonaggio | null }
  | { notte: number; tipo: 'resurrezione'; usato: boolean; bersaglio: string | null }
  | { notte: number; tipo: 'pozione'; bersaglio: string | null }
  | { notte: number; tipo: 'segnalino'; segnalino: 'teschio' | 'ritratto'; bersaglio: string }

/** L'esito dell'ultimo ballottaggio, da mostrare: `altriMorti` sono quelli dopo il linciaggio, per il teschio. */
export interface EsitoBallottaggio {
  conteggio: Record<string, number>
  linciato: string | null
  altriMorti: string[]
  sopravvissuto?: string
}

/** La fase della decisione: i nuovi fantasmi che aspettano il Benvenuto, e chi di loro si rivela. */
export interface DecisioneLupus {
  attesi: string[]
  da: 'notte' | 'giorno'
  rivelati: string[]
}

export interface EsitoLupus {
  vincitore: VincitoreLupus
  vincitori: string[]
}

export interface PartitaLupus {
  impostazioni: ImpostazioniLupus
  seme: number
  /** Il punto a cui e' arrivato il caso: la notte dopo riparte da qui. */
  statoCaso: number
  giocatori: GiocatoreLupus[]
  fase: FaseLupus
  /** La notte in corso, o quella appena finita. */
  notte: number
  /** Il giorno in corso. */
  giorno: number
  /** Quando e' cominciata la fase, e quando finisce se ha un tempo. */
  inizioFase: number
  fineFase: number | null
  /** Chi ha gia' visto il suo ruolo, nella fase dei ruoli. */
  visti: string[]
  /** Le scelte della notte, per chiave del compito (`chiaveDi`). */
  scelte: Record<string, SceltaNotturna>
  /** I voti della votazione in corso, delle nomine o del ballottaggio. */
  voti: Record<string, string | null>
  /** L'ordine di voto delle nomine, dal posto a sinistra di chi ha il "Benvenuto!". */
  ordineDiVoto: string[]
  indiziati: string[]
  /** Chi ha ricevuto il "Benvenuto!": l'ultimo sbranato di notte, l'ancora dei pareggi. */
  benvenuto: string | null
  ultimoLinciato: string | null
  /** Il gufato di stanotte, che domani entra fra gli indiziati. */
  gufato: string | null
  pozioneBevuta: boolean
  baronUsato: boolean
  /** Il Mitomane ha gia' avuto la sua notte. */
  mitomaneFatto: boolean
  contaMorti: number
  alba: ResocontoAlba | null
  esitoBallottaggio: EsitoBallottaggio | null
  /** Chi ha il teschio di Amleto e il ritratto di Dorian Wolf: sono segnalini sul tavolo, li vedono tutti. */
  teschio: string | null
  ritratto: string | null
  decisione: DecisioneLupus | null
  /** Il conteggio delle ultime nomine. */
  conteggioNomine: Record<string, number> | null
  cronaca: EventoLupus[]
  segreti: Record<string, SegretoLupus[]>
  esito: EsitoLupus | null
}

export type AzioneLupus =
  | { tipo: 'ruolo_visto'; giocatore: string }
  | { tipo: 'notte'; giocatore: string; scelta: SceltaNotturna }
  | { tipo: 'voto'; giocatore: string; bersaglio: string | null }
  /** Un nuovo fantasma prende atto della morte; Amleto e Dorian Wolf dicono se si rivelano. */
  | { tipo: 'benvenuto'; giocatore: string; rivela?: boolean }
  /** Chi conduce manda avanti la fase, o chiude una raccolta che aspetta ancora qualcuno. */
  | { tipo: 'avanti' }

export class ErroreLupus extends Error {}

/* ────────────  La partita nuova  ──────────── */

export interface IscrittoLupus {
  id: string
  nome: string
}

/** Una partita nuova: i ruoli si mescolano con il seme, e i posti sono nell'ordine degli iscritti. */
export function nuovaPartita(
  iscritti: IscrittoLupus[],
  composizione: Composizione,
  impostazioni: ImpostazioniLupus,
  seme: number,
  adesso: number,
): PartitaLupus {
  const mazzo = mazzoDi(composizione)
  if (mazzo.length !== iscritti.length) {
    throw new ErroreLupus('Il numero di personaggi non corrisponde ai giocatori.')
  }
  const caso = casoDa(seme)
  const ruoli = mescola(mazzo, caso)
  const giocatori: GiocatoreLupus[] = iscritti.map((s, i) => ({
    id: s.id,
    nome: s.nome,
    posto: i,
    ruolo: ruoli[i],
    vivo: true,
  }))
  return {
    impostazioni,
    seme,
    statoCaso: caso.stato(),
    giocatori,
    fase: 'ruoli',
    notte: 0,
    giorno: 0,
    inizioFase: adesso,
    fineFase: null,
    visti: [],
    scelte: {},
    voti: {},
    ordineDiVoto: [],
    indiziati: [],
    benvenuto: null,
    ultimoLinciato: null,
    gufato: null,
    pozioneBevuta: false,
    baronUsato: false,
    mitomaneFatto: false,
    contaMorti: 0,
    alba: null,
    esitoBallottaggio: null,
    conteggioNomine: null,
    teschio: null,
    ritratto: null,
    decisione: null,
    cronaca: [],
    segreti: {},
    esito: null,
  }
}

/* ─────────  Le domande sulla partita  ───────── */

export function cercaGiocatore(partita: PartitaLupus, id: string): GiocatoreLupus {
  const g = partita.giocatori.find((x) => x.id === id)
  if (!g) throw new ErroreLupus(`Giocatore sconosciuto: ${id}`)
  return g
}

/** Il ruolo con cui il giocatore agisce adesso: il Mitomane puo' averlo cambiato. */
export function ruoloAttuale(g: GiocatoreLupus): IdPersonaggio {
  return g.ruoloAssunto ?? g.ruolo
}

export function fazioneDi(g: GiocatoreLupus): Fazione {
  return PERSONAGGI[ruoloAttuale(g)].fazione
}

export function nelBranco(g: GiocatoreLupus): boolean {
  return PERSONAGGI[ruoloAttuale(g)].nelBranco
}

export function contaComeLupo(g: GiocatoreLupus): boolean {
  return PERSONAGGI[ruoloAttuale(g)].contaComeLupo
}

/** Quel che vede chi legge l'aura: i lupi, la Mucca, il Criceto, Darius, il mitomane-lupo. */
export function malvagio(g: GiocatoreLupus): boolean {
  return PERSONAGGI[ruoloAttuale(g)].malvagio
}

/**
 * "Mannaro" per il Gufo letale e per il Medium: i lupi, Lara, la Mucca, il
 * mitomane-lupo. Il Criceto no, e nemmeno Darius, anche se la sua carta dice
 * che il Medium lo vede mannaro.
 */
export function mannaro(g: GiocatoreLupus): boolean {
  const r = ruoloAttuale(g)
  return PERSONAGGI[r].contaComeLupo || r === 'mucca'
}

export function vivi(partita: PartitaLupus): GiocatoreLupus[] {
  return partita.giocatori.filter((g) => g.vivo)
}

/** Chi di giorno gioca da vivo: i vivi, e il Mortovivo che si e' rivelato. */
export function attivi(partita: PartitaLupus): GiocatoreLupus[] {
  return partita.giocatori.filter((g) => g.vivo || g.nonMorto)
}

export function gufoUccide(partita: PartitaLupus): boolean {
  if (partita.impostazioni.gufoLetale === 'si') return true
  if (partita.impostazioni.gufoLetale === 'no') return false
  return partita.giocatori.length >= 20
}

export function personaggioInGioco(partita: PartitaLupus, ruolo: IdPersonaggio): boolean {
  return partita.giocatori.some((g) => g.ruolo === ruolo)
}

/**
 * I compiti della notte: quelli dei personaggi, e due che una carta non ha. Il
 * `branco` e' la prima notte senza vittime, in cui i lupi si riconoscono
 * soltanto; `passa_teschio` e' il teschio di Amleto, che chi lo ha passa a un
 * altro, ed e' un compito in piu' accanto a quello del suo personaggio.
 */
export type TipoCompito = CompitoNotturno | 'branco' | 'passa_teschio'

export interface Compito {
  giocatore: string
  tipo: TipoCompito
  /** Il compito si puo' saltare: Jekyll puo' non bere, il Baron puo' aspettare. */
  facoltativo: boolean
}

/** Chi deve fare qualcosa stanotte, e che cosa. */
export function compitiDellaNotte(partita: PartitaLupus): Compito[] {
  const compiti: Compito[] = []
  const n = partita.notte
  for (const g of partita.giocatori) {
    const ruolo = ruoloAttuale(g)
    // Chi ha il teschio lo passa "al termine del giorno": qui, all'inizio della notte dopo.
    if (g.vivo && n >= 2 && partita.teschio === g.id && vivi(partita).length > 1) {
      compiti.push({ giocatore: g.id, tipo: 'passa_teschio', facoltativo: false })
      if (!PERSONAGGI[ruolo].nelBranco && !PERSONAGGI[ruolo].compitoNotturno) continue
    }
    if (!g.vivo) {
      // Il Baron Samedi agisce anche da fantasma.
      if (ruolo === 'baron' && n >= 2 && !partita.baronUsato && bersaglioDelBaron(partita, g) !== null) {
        compiti.push({ giocatore: g.id, tipo: 'resuscitare', facoltativo: true })
      }
      continue
    }
    if (PERSONAGGI[ruolo].nelBranco) {
      compiti.push({
        giocatore: g.id,
        tipo: n === 1 && partita.impostazioni.primaNotteSenzaVittime ? 'branco' : 'sbranare',
        facoltativo: false,
      })
      continue
    }
    switch (ruolo) {
      case 'guardia':
        if (n >= 2) compiti.push({ giocatore: g.id, tipo: 'proteggere', facoltativo: false })
        break
      case 'veggente':
      case 'cartomante':
      case 'darius':
        compiti.push({ giocatore: g.id, tipo: 'scrutare', facoltativo: false })
        break
      case 'gufo':
        compiti.push({ giocatore: g.id, tipo: 'gufare', facoltativo: false })
        break
      case 'mitomane':
        if (n === 2 && !partita.mitomaneFatto) {
          compiti.push({ giocatore: g.id, tipo: 'imitare', facoltativo: false })
        }
        break
      case 'jekyll':
        if (n >= 2 && !partita.pozioneBevuta) {
          compiti.push({ giocatore: g.id, tipo: 'pozione', facoltativo: true })
        }
        break
      case 'baron':
        if (n >= 2 && !partita.baronUsato && bersaglioDelBaron(partita, g) !== null) {
          compiti.push({ giocatore: g.id, tipo: 'resuscitare', facoltativo: true })
        }
        break
      case 'medium':
        if (n >= 2) compiti.push({ giocatore: g.id, tipo: 'seduta', facoltativo: false })
        break
      case 'purple':
        if (n >= 2) compiti.push({ giocatore: g.id, tipo: 'indagine', facoltativo: false })
        break
      case 'massone':
        if (n === 1) compiti.push({ giocatore: g.id, tipo: 'loggia', facoltativo: false })
        break
      case 'mucca':
        if (n === 1) compiti.push({ giocatore: g.id, tipo: 'sogno', facoltativo: false })
        break
      case 'amleto':
        if (n === 1) compiti.push({ giocatore: g.id, tipo: 'teschio', facoltativo: false })
        break
      case 'dorian':
        if (n === 1) compiti.push({ giocatore: g.id, tipo: 'ritratto', facoltativo: false })
        break
      default:
        break
    }
  }
  return compiti
}

/** Il compito del suo personaggio, se stanotte ne ha uno; se no il passaggio del teschio, se lo ha. */
export function compitoDi(partita: PartitaLupus, id: string): Compito | undefined {
  const miei = compitiDellaNotte(partita).filter((c) => c.giocatore === id)
  return miei.find((c) => c.tipo !== 'passa_teschio') ?? miei[0]
}

/**
 * Tutti i compiti di un giocatore stanotte, nell'ordine in cui li fa: il
 * teschio, se lo ha, viene per primo, perché `compitiDellaNotte` lo mette
 * prima del compito del personaggio.
 */
export function compitiDi(partita: PartitaLupus, id: string): Compito[] {
  return compitiDellaNotte(partita).filter((c) => c.giocatore === id)
}

/**
 * Amleto o Dorian Wolf sono in gioco: dopo ogni morte i nuovi fantasmi passano
 * dalla fase della decisione. Ci passano tutti, non solo loro due: chiamare
 * soltanto loro li smaschererebbe.
 */
export function decisioniAllaMorte(partita: PartitaLupus): boolean {
  return personaggioInGioco(partita, 'amleto') || personaggioInGioco(partita, 'dorian')
}

/** La scelta che un nuovo fantasma puo' avere: rivelarsi Amleto o Dorian Wolf, e chi ha il segnalino. */
export interface SceltaDiMorte {
  tipo: 'amleto' | 'dorian'
  /** Chi ha il teschio o il ritratto, se e' vivo. */
  custode: string | null
}

export function sceltaDiMorte(partita: PartitaLupus, id: string): SceltaDiMorte | null {
  const g = cercaGiocatore(partita, id)
  if (g.vivo || g.rivelato) return null
  if (g.ruolo === 'amleto' && partita.teschio !== null) {
    const custode = cercaGiocatore(partita, partita.teschio)
    return { tipo: 'amleto', custode: custode.vivo ? custode.id : null }
  }
  if (g.ruolo === 'dorian' && partita.ritratto !== null) {
    const custode = cercaGiocatore(partita, partita.ritratto)
    return { tipo: 'dorian', custode: custode.vivo ? custode.id : null }
  }
  return null
}

/** Chi riporterebbe in vita il Baron: chi ha il "Benvenuto!", se e' morto e non e' il Baron stesso. */
export function bersaglioDelBaron(partita: PartitaLupus, baron: GiocatoreLupus): string | null {
  const id = partita.benvenuto
  if (!id || id === baron.id) return null
  const bersaglio = cercaGiocatore(partita, id)
  if (bersaglio.vivo || bersaglio.nonMorto) return null
  return id
}

/** Chi si puo' scegliere per un compito della notte. */
export function bersagliDellaNotte(partita: PartitaLupus, id: string, tipo: TipoCompito): string[] {
  const inVita = vivi(partita)
  switch (tipo) {
    case 'sbranare': {
      const io = cercaGiocatore(partita, id)
      if (ruoloAttuale(io) === 'lara') {
        // Lara puo' sbranare anche un altro lupo, ma non se stessa.
        return inVita.filter((g) => g.id !== id).map((g) => g.id)
      }
      return inVita.filter((g) => !nelBranco(g)).map((g) => g.id)
    }
    case 'proteggere':
      return inVita.filter((g) => g.id !== id).map((g) => g.id)
    case 'scrutare':
    case 'gufare':
    case 'pozione':
    case 'imitare':
    case 'ritratto':
    case 'passa_teschio':
      return inVita.filter((g) => g.id !== id).map((g) => g.id)
    case 'teschio':
      // Amleto "indica un personaggio a sua scelta": il teschio puo' tenerlo anche lui.
      return inVita.map((g) => g.id)
    default:
      return []
  }
}

/** La risposta che il moderatore darebbe a chi guarda quel giocatore. */
export function rispostaAlVeggente(partita: PartitaLupus, id: string): boolean {
  return malvagio(cercaGiocatore(partita, id))
}

/** I malvagi ancora vivi, per Miss Purple. */
export function malvagiVivi(partita: PartitaLupus): number {
  return vivi(partita).filter((g) => malvagio(g)).length
}

/** I compagni che un giocatore conosce: il branco per i lupi, l'altro Massone, i lupi per la Mucca. */
export function compagniDi(partita: PartitaLupus, id: string): string[] {
  const io = cercaGiocatore(partita, id)
  const ruolo = ruoloAttuale(io)
  if (PERSONAGGI[ruolo].nelBranco) {
    // I lupi si riconoscono la prima notte; il mitomane-lupo entra nel branco quando lo diventa.
    if (partita.notte < 1) return []
    return partita.giocatori.filter((g) => g.id !== io.id && nelBranco(g)).map((g) => g.id)
  }
  if (ruolo === 'massone' && partita.notte >= 1) {
    return partita.giocatori.filter((g) => g.id !== io.id && ruoloAttuale(g) === 'massone').map((g) => g.id)
  }
  if (ruolo === 'mucca' && partita.notte >= 1) {
    // La Mucca vede i lupi della prima notte, non il mitomane che lo diventa dopo.
    return partita.giocatori.filter((g) => g.id !== io.id && PERSONAGGI[g.ruolo].nelBranco).map((g) => g.id)
  }
  return []
}

export function votantiDelleNomine(partita: PartitaLupus): string[] {
  return partita.giocatori.filter((g) => g.vivo || g.nonMorto || partita.impostazioni.fantasmiVotano).map((g) => g.id)
}

export function votantiDelBallottaggio(partita: PartitaLupus): string[] {
  return attivi(partita)
    .filter((g) => !partita.indiziati.includes(g.id))
    .map((g) => g.id)
}

export function nominabili(partita: PartitaLupus, votante: string): string[] {
  return vivi(partita)
    .filter((g) => g.id !== votante)
    .map((g) => g.id)
}

/** Chi deve ancora fare la sua parte nella fase in corso. */
export function chiAspetta(partita: PartitaLupus): string[] {
  switch (partita.fase) {
    case 'ruoli':
      return partita.giocatori.filter((g) => !partita.visti.includes(g.id)).map((g) => g.id)
    case 'notte':
      return [
        ...new Set(
          compitiDellaNotte(partita)
            .filter((c) => !sceltaFatta(partita, c))
            .map((c) => c.giocatore),
        ),
      ]
    case 'decisione':
      return partita.decisione?.attesi ?? []
    case 'nomine':
      return votantiDelleNomine(partita).filter((id) => !(id in partita.voti))
    case 'ballottaggio':
      return votantiDelBallottaggio(partita).filter((id) => !(id in partita.voti))
    default:
      return []
  }
}

/* ──────────────  Il riduttore  ────────────── */

/** La chiave di un compito in `scelte`: il passaggio del teschio ha la sua, accanto a quella del giocatore. */
export function chiaveDi(compito: Compito): string {
  return compito.tipo === 'passa_teschio' ? `${compito.giocatore}#teschio` : compito.giocatore
}

function sceltaFatta(partita: PartitaLupus, compito: Compito): boolean {
  return Boolean(partita.scelte[chiaveDi(compito)])
}

/** La partita dopo un'azione. Un'azione che le regole non permettono solleva un `ErroreLupus` e non cambia niente. */
export function applica(partita: PartitaLupus, azione: AzioneLupus, adesso: number): PartitaLupus {
  if (partita.fase === 'finita') throw new ErroreLupus('La partita è finita.')
  switch (azione.tipo) {
    case 'ruolo_visto':
      return ruoloVisto(partita, azione.giocatore, adesso)
    case 'notte':
      return sceltaDellaNotte(partita, azione.giocatore, azione.scelta, adesso)
    case 'voto':
      return voto(partita, azione.giocatore, azione.bersaglio, adesso)
    case 'benvenuto':
      return benvenutoRicevuto(partita, azione.giocatore, azione.rivela ?? false, adesso)
    case 'avanti':
      return avanti(partita, adesso)
  }
}

function ruoloVisto(partita: PartitaLupus, id: string, adesso: number): PartitaLupus {
  if (partita.fase !== 'ruoli') throw new ErroreLupus('Non è il momento di vedere il ruolo.')
  cercaGiocatore(partita, id)
  if (partita.visti.includes(id)) return partita
  const dopo = { ...partita, visti: [...partita.visti, id] }
  if (chiAspetta(dopo).length === 0) return iniziaNotte(dopo, adesso)
  return dopo
}

function sceltaDellaNotte(partita: PartitaLupus, id: string, scelta: SceltaNotturna, adesso: number): PartitaLupus {
  if (partita.fase !== 'notte') throw new ErroreLupus('Non è notte.')
  // Chi ha due compiti li fa nell'ordine di compitiDi: prima il teschio, poi il suo.
  const compito = compitiDi(partita, id).find((c) => !(chiaveDi(c) in partita.scelte))
  if (!compito) throw new ErroreLupus('Stanotte non hai nulla da fare.')
  const io = cercaGiocatore(partita, id)

  let segreti = partita.segreti
  const annota = (s: SegretoLupus) => {
    segreti = { ...segreti, [id]: [...(segreti[id] ?? []), s] }
  }

  switch (compito.tipo) {
    case 'sbranare':
    case 'proteggere':
    case 'gufare':
    case 'imitare':
    case 'scrutare':
    case 'pozione':
    case 'teschio':
    case 'ritratto':
    case 'passa_teschio': {
      if (scelta.tipo === 'nessuno') {
        if (!compito.facoltativo) throw new ErroreLupus('Devi scegliere qualcuno.')
        if (compito.tipo === 'pozione') annota({ notte: partita.notte, tipo: 'pozione', bersaglio: null })
        break
      }
      if (scelta.tipo !== 'indica') throw new ErroreLupus('Devi scegliere un giocatore.')
      const bersagli = bersagliDellaNotte(partita, id, compito.tipo)
      if (!bersagli.includes(scelta.bersaglio)) throw new ErroreLupus('Bersaglio non valido.')
      if (compito.tipo === 'scrutare') {
        annota({
          notte: partita.notte,
          tipo: 'sguardo',
          bersaglio: scelta.bersaglio,
          malvagio: rispostaAlVeggente(partita, scelta.bersaglio),
        })
      }
      if (compito.tipo === 'pozione') {
        annota({ notte: partita.notte, tipo: 'pozione', bersaglio: scelta.bersaglio })
      }
      if (compito.tipo === 'teschio') {
        annota({ notte: partita.notte, tipo: 'segnalino', segnalino: 'teschio', bersaglio: scelta.bersaglio })
      }
      if (compito.tipo === 'ritratto') {
        annota({ notte: partita.notte, tipo: 'segnalino', segnalino: 'ritratto', bersaglio: scelta.bersaglio })
      }
      break
    }
    case 'resuscitare': {
      if (scelta.tipo !== 'potere') throw new ErroreLupus('Devi decidere se usare il potere.')
      annota({
        notte: partita.notte,
        tipo: 'resurrezione',
        usato: scelta.usa,
        bersaglio: scelta.usa ? bersaglioDelBaron(partita, io) : null,
      })
      break
    }
    case 'branco':
    case 'seduta':
    case 'indagine':
    case 'loggia':
    case 'sogno': {
      if (scelta.tipo !== 'letto') throw new ErroreLupus('Conferma di aver letto.')
      if (compito.tipo === 'seduta') {
        annota({
          notte: partita.notte,
          tipo: 'seduta',
          bersaglio: partita.ultimoLinciato,
          mannaro: partita.ultimoLinciato ? mannaro(cercaGiocatore(partita, partita.ultimoLinciato)) : false,
        })
      } else if (compito.tipo === 'indagine') {
        annota({ notte: partita.notte, tipo: 'indagine', quanti: malvagiVivi(partita) })
      } else if (compito.tipo === 'loggia') {
        annota({ notte: partita.notte, tipo: 'loggia', altri: compagniDi(partita, id) })
      } else if (compito.tipo === 'sogno' || compito.tipo === 'branco') {
        annota({ notte: partita.notte, tipo: 'branco', lupi: compagniDi(partita, id) })
      }
      break
    }
  }

  const dopo: PartitaLupus = {
    ...partita,
    segreti,
    scelte: { ...partita.scelte, [chiaveDi(compito)]: scelta },
  }
  if (chiAspetta(dopo).length === 0) return risolviNotte(dopo, adesso)
  return dopo
}

function benvenutoRicevuto(partita: PartitaLupus, id: string, rivela: boolean, adesso: number): PartitaLupus {
  if (partita.fase !== 'decisione' || !partita.decisione) throw new ErroreLupus('Non è il momento.')
  if (!partita.decisione.attesi.includes(id)) throw new ErroreLupus('Non tocca a te.')
  const scelta = sceltaDiMorte(partita, id)
  const rivelati = rivela && scelta ? [...partita.decisione.rivelati, id] : partita.decisione.rivelati
  const dopo: PartitaLupus = {
    ...partita,
    decisione: {
      ...partita.decisione,
      attesi: partita.decisione.attesi.filter((x) => x !== id),
      rivelati,
    },
  }
  if (dopo.decisione!.attesi.length === 0) return chiudiDecisione(dopo, adesso)
  return dopo
}

/** Le rivelazioni di Amleto e di Dorian Wolf, e poi avanti: verso l'alba, o verso la notte. */
function chiudiDecisione(partita: PartitaLupus, adesso: number): PartitaLupus {
  const decisione = partita.decisione!
  const giocatori = partita.giocatori.map((g) => ({ ...g }))
  const perId = new Map(giocatori.map((g) => [g.id, g]))
  const cronaca: EventoLupus[] = [...partita.cronaca]
  let contaMorti = partita.contaMorti
  let teschio = partita.teschio
  let ritratto = partita.ritratto
  const altri: string[] = []
  const cause: Record<string, CausaDiMorte> = {}
  let sopravvissuto: string | undefined

  const uccidi = (id: string, causa: CausaDiMorte) => {
    const g = perId.get(id)!
    if (!g.vivo) return
    g.vivo = false
    g.ordineDiMorte = ++contaMorti
    if (g.ruolo === 'mortovivo') {
      g.nonMorto = true
      g.rivelato = true
      cronaca.push({ t: 'rivelato', giocatore: id, ruolo: 'mortovivo' })
    } else if (partita.impostazioni.rivelaRuoloAllaMorte) {
      g.rivelato = true
    }
    altri.push(id)
    cause[id] = causa
    cronaca.push({ t: 'morte', giocatore: id, causa, pubblica: partita.impostazioni.rivelaRuoloAllaMorte })
  }

  for (const id of decisione.rivelati) {
    const g = perId.get(id)!
    if (g.ruolo === 'amleto' && teschio !== null) {
      g.rivelato = true
      cronaca.push({ t: 'rivelato', giocatore: id, ruolo: 'amleto' })
      uccidi(teschio, 'teschio')
      teschio = null
    } else if (g.ruolo === 'dorian' && ritratto !== null) {
      g.rivelato = true
      g.vivo = true
      g.nonMorto = false
      g.ordineDiMorte = undefined
      sopravvissuto = id
      cronaca.push({ t: 'rivelato', giocatore: id, ruolo: 'dorian' })
      cronaca.push({ t: 'sopravvissuto', giocatore: id })
      uccidi(ritratto, 'ritratto')
      ritratto = null
    }
  }

  let dopo: PartitaLupus = {
    ...partita,
    giocatori,
    contaMorti,
    teschio,
    ritratto,
    decisione: null,
    cronaca,
  }

  if (decisione.da === 'notte') {
    const alba = partita.alba!
    dopo = {
      ...dopo,
      fase: 'alba',
      inizioFase: adesso,
      alba: {
        ...alba,
        morti: [...alba.morti.filter((id) => id !== sopravvissuto), ...altri],
        cause: { ...alba.cause, ...cause },
        sopravvissuto,
      },
      cronaca: [...dopo.cronaca, { t: 'giorno', n: partita.giorno }],
    }
    return controllaFine(dopo)
  }
  dopo = {
    ...dopo,
    esitoBallottaggio: partita.esitoBallottaggio
      ? {
          ...partita.esitoBallottaggio,
          altriMorti: [...partita.esitoBallottaggio.altriMorti, ...altri],
          sopravvissuto,
        }
      : null,
  }
  return controllaFine(notteDalGiorno(dopo, adesso))
}

function voto(partita: PartitaLupus, id: string, bersaglio: string | null, adesso: number): PartitaLupus {
  if (partita.fase === 'nomine') {
    if (!votantiDelleNomine(partita).includes(id)) throw new ErroreLupus('Non puoi votare ora.')
    if (bersaglio === null) throw new ErroreLupus('Devi indicare qualcuno.')
    if (!nominabili(partita, id).includes(bersaglio)) throw new ErroreLupus('Voto non valido.')
  } else if (partita.fase === 'ballottaggio') {
    if (!votantiDelBallottaggio(partita).includes(id)) throw new ErroreLupus('Non puoi votare ora.')
    if (bersaglio !== null && !partita.indiziati.includes(bersaglio)) throw new ErroreLupus('Voto non valido.')
  } else {
    throw new ErroreLupus('Non si vota in questa fase.')
  }
  const dopo: PartitaLupus = { ...partita, voti: { ...partita.voti, [id]: bersaglio } }
  if (chiAspetta(dopo).length === 0) {
    return partita.fase === 'nomine' ? risolviNomine(dopo, adesso) : risolviBallottaggio(dopo, adesso)
  }
  return dopo
}

/** Chi conduce manda avanti: chiude una fase che aspetta lui, o una raccolta a cui manca ancora qualcuno. */
function avanti(partita: PartitaLupus, adesso: number): PartitaLupus {
  switch (partita.fase) {
    case 'ruoli':
      return iniziaNotte(partita, adesso)
    case 'notte':
      return risolviNotte(partita, adesso)
    case 'decisione':
      // Chi non ha risposto non si rivela.
      return chiudiDecisione({ ...partita, decisione: { ...partita.decisione!, attesi: [] } }, adesso)
    case 'alba':
      return iniziaDiscussione(partita, adesso)
    case 'discussione':
      return iniziaNomine(partita, adesso)
    case 'nomine':
      return risolviNomine(partita, adesso)
    case 'arringhe':
      return iniziaBallottaggio(partita, adesso)
    case 'ballottaggio':
      return risolviBallottaggio(partita, adesso)
    case 'finita':
      return partita
  }
}

/* ────────────────  La notte  ──────────────── */

function iniziaNotte(partita: PartitaLupus, adesso: number): PartitaLupus {
  const notte = partita.notte + 1
  // Il teschio di chi e' morto (non per mano di Amleto) passa al vivo dopo di lui, in senso orario.
  let teschio = partita.teschio
  if (teschio !== null && !cercaGiocatore(partita, teschio).vivo) {
    const giro = inSensoOrario(partita, teschio).filter((g) => g.vivo)
    teschio = giro[0]?.id ?? null
  }
  return {
    ...partita,
    teschio,
    fase: 'notte',
    notte,
    inizioFase: adesso,
    fineFase: null,
    scelte: {},
    voti: {},
    indiziati: [],
    gufato: null,
    alba: null,
    esitoBallottaggio: null,
    conteggioNomine: null,
    cronaca: [...partita.cronaca, { t: 'notte', n: notte }],
  }
}

function risolviNotte(partita: PartitaLupus, adesso: number): PartitaLupus {
  const caso = casoDa(partita.statoCaso)
  const compiti = compitiDellaNotte(partita)
  const scelte = partita.scelte
  const giocatori = partita.giocatori.map((g) => ({ ...g }))
  const perId = new Map(giocatori.map((g) => [g.id, g]))
  const cronaca: EventoLupus[] = [...partita.cronaca]
  const segreti: Record<string, SegretoLupus[]> = { ...partita.segreti }
  const annota = (id: string, s: SegretoLupus) => {
    segreti[id] = [...(segreti[id] ?? []), s]
  }
  const indicato = (id: string, chiave = id): string | null => {
    const s = scelte[chiave]
    return s && s.tipo === 'indica' ? s.bersaglio : null
  }

  // 0. I segnalini: il teschio e il ritratto la prima notte, e il teschio che passa di mano.
  let teschio = partita.teschio
  let ritratto = partita.ritratto
  for (const c of compiti) {
    if (c.tipo === 'teschio') teschio = indicato(c.giocatore) ?? teschio
    if (c.tipo === 'ritratto') ritratto = indicato(c.giocatore) ?? ritratto
    if (c.tipo === 'passa_teschio') teschio = indicato(c.giocatore, chiaveDi(c)) ?? teschio
  }

  let mitomaneFatto = partita.mitomaneFatto
  let pozioneBevuta = partita.pozioneBevuta
  let baronUsato = partita.baronUsato
  const resoconto: ResocontoAlba = {
    notte: partita.notte,
    morti: [],
    cause: {},
    jekyll: false,
    nessunaVittima: false,
  }

  // 1. Il Mitomane copia "alla fine della seconda notte", e vale da subito.
  for (const c of compiti) {
    if (c.tipo !== 'imitare') continue
    const bersaglio = indicato(c.giocatore)
    mitomaneFatto = true
    if (!bersaglio) continue
    const b = perId.get(bersaglio)!
    const suo = ruoloAttuale(b)
    let diventato: IdPersonaggio | null = null
    if (PERSONAGGI[suo].nelBranco) diventato = 'lupo'
    else if (suo === 'veggente' || suo === 'cartomante') diventato = 'veggente'
    if (diventato) perId.get(c.giocatore)!.ruoloAssunto = diventato
    annota(c.giocatore, { notte: partita.notte, tipo: 'imitazione', bersaglio, diventato })
  }

  // 2. Il Baron Samedi: chi torna in vita all'alba non si puo' uccidere per tutta la notte.
  let zombi: string | null = null
  for (const c of compiti) {
    if (c.tipo !== 'resuscitare') continue
    const s = scelte[c.giocatore]
    if (s && s.tipo === 'potere' && s.usa) {
      const bersaglio = bersaglioDelBaron(partita, perId.get(c.giocatore)!)
      if (bersaglio) {
        zombi = bersaglio
        baronUsato = true
      }
    }
  }

  const condannati = new Map<string, CausaDiMorte>()
  const condanna = (id: string, causa: CausaDiMorte) => {
    if (id === zombi) return
    const g = perId.get(id)!
    if (!g.vivo) return
    if (!condannati.has(id)) condannati.set(id, causa)
  }

  // 3. Chi guarda il Criceto lo uccide: il Veggente e la Cartomante, non Darius.
  for (const c of compiti) {
    if (c.tipo !== 'scrutare') continue
    const chiGuarda = ruoloAttuale(perId.get(c.giocatore)!)
    if (chiGuarda !== 'veggente' && chiGuarda !== 'cartomante') continue
    const bersaglio = indicato(c.giocatore)
    if (bersaglio && ruoloAttuale(perId.get(bersaglio)!) === 'criceto') condanna(bersaglio, 'sguardo')
  }

  // 4. La Guardia.
  let protetto: string | null = null
  for (const c of compiti) {
    if (c.tipo === 'proteggere') protetto = indicato(c.giocatore)
  }

  // 5. I lupi.
  const branco = compiti.filter((c) => c.tipo === 'sbranare')
  if (branco.length > 0) {
    let vittima: string | null = null
    const sceltaDiLara = branco
      .filter((c) => ruoloAttuale(perId.get(c.giocatore)!) === 'lara')
      .map((c) => indicato(c.giocatore))
      .find((b) => b && nelBranco(perId.get(b)!))
    if (sceltaDiLara) {
      // Lara sbrana un lupo: stanotte nessun villico muore.
      condanna(sceltaDiLara, 'lupi')
      resoconto.nessunaVittima = true
    } else {
      const conteggio = new Map<string, number>()
      for (const c of branco) {
        const b = indicato(c.giocatore)
        if (b) conteggio.set(b, (conteggio.get(b) ?? 0) + 1)
      }
      if (conteggio.size > 0) {
        const massimo = Math.max(...conteggio.values())
        const primi = [...conteggio.entries()].filter(([, n]) => n === massimo).map(([id]) => id)
        // A pari voti decide il caso: e' l'unico punto della notte in cui si pesca.
        vittima = primi.length === 1 ? primi[0] : pescaUno(primi, caso)
      }
      if (vittima) {
        const v = perId.get(vittima)!
        if (vittima === protetto || ruoloAttuale(v) === 'criceto' || vittima === zombi) {
          resoconto.nessunaVittima = true
        } else {
          condanna(vittima, 'lupi')
        }
      } else {
        resoconto.nessunaVittima = true
      }
    }
  } else if (compiti.some((c) => c.tipo === 'branco')) {
    resoconto.nessunaVittima = true
  }

  // 6. Il dottor Jekyll.
  for (const c of compiti) {
    if (c.tipo !== 'pozione') continue
    const bersaglio = indicato(c.giocatore)
    if (!bersaglio) continue
    pozioneBevuta = true
    resoconto.jekyll = true
    condanna(bersaglio, 'hyde')
  }

  // 7. Il Gufo: segna l'indiziato di domani, o uccide se e' letale.
  let gufato: string | null = null
  for (const c of compiti) {
    if (c.tipo !== 'gufare') continue
    const bersaglio = indicato(c.giocatore)
    if (!bersaglio) continue
    if (gufoUccide(partita)) {
      const b = perId.get(bersaglio)!
      if (!mannaro(b) && ruoloAttuale(b) !== 'criceto') condanna(bersaglio, 'gufata')
    } else {
      gufato = bersaglio
    }
  }

  // 8. Le morti, nell'ordine in cui sono arrivate le condanne.
  let contaMorti = partita.contaMorti
  const rivelaAllaMorte = partita.impostazioni.rivelaRuoloAllaMorte
  for (const [id, causa] of condannati) {
    const g = perId.get(id)!
    g.vivo = false
    g.ordineDiMorte = ++contaMorti
    if (g.ruolo === 'mortovivo') {
      g.nonMorto = true
      g.rivelato = true
      cronaca.push({ t: 'rivelato', giocatore: id, ruolo: 'mortovivo' })
    } else if (rivelaAllaMorte) {
      g.rivelato = true
    }
    resoconto.morti.push(id)
    resoconto.cause[id] = causa
    cronaca.push({ t: 'morte', giocatore: id, causa, pubblica: rivelaAllaMorte })
  }
  if (resoconto.jekyll) cronaca.push({ t: 'hyde', n: partita.notte })
  if (resoconto.morti.length === 0) cronaca.push({ t: 'nessuna_vittima', n: partita.notte })

  // 9. Il Baron riporta in vita.
  if (zombi) {
    const z = perId.get(zombi)!
    z.vivo = true
    z.nonMorto = false
    z.ordineDiMorte = undefined
    resoconto.risorto = zombi
    cronaca.push({ t: 'risorto', giocatore: zombi })
  }

  // Il "Benvenuto!" va allo sbranato della notte; se i lupi non hanno colpito, al primo morto; se non e' morto
  // nessuno, resta a chi lo aveva.
  const sbranato = resoconto.morti.find((id) => resoconto.cause[id] === 'lupi')
  const benvenuto = sbranato ?? resoconto.morti[0] ?? partita.benvenuto

  const base: PartitaLupus = {
    ...partita,
    statoCaso: caso.stato(),
    giocatori,
    giorno: partita.giorno + 1,
    inizioFase: adesso,
    fineFase: null,
    scelte: {},
    gufato,
    pozioneBevuta,
    baronUsato,
    mitomaneFatto,
    contaMorti,
    alba: resoconto,
    benvenuto,
    teschio,
    ritratto,
    cronaca,
    segreti,
  }
  if (decisioniAllaMorte(partita) && resoconto.morti.length > 0) {
    // Prima dell'alba i nuovi fantasmi ricevono il Benvenuto, e Amleto o Dorian decidono.
    return {
      ...base,
      fase: 'decisione',
      decisione: { attesi: resoconto.morti, da: 'notte', rivelati: [] },
    }
  }
  return controllaFine({ ...base, fase: 'alba', cronaca: [...cronaca, { t: 'giorno', n: partita.giorno + 1 }] })
}

/* ───────────────  Il giorno  ──────────────── */

function iniziaDiscussione(partita: PartitaLupus, adesso: number): PartitaLupus {
  const secondi = partita.impostazioni.secondiDiscussione
  return {
    ...partita,
    fase: 'discussione',
    inizioFase: adesso,
    fineFase: secondi > 0 ? adesso + secondi * 1000 : null,
  }
}

/** I giocatori in senso orario, dal posto a sinistra dell'ancora: e' l'ordine di voto, e quello dei pareggi. */
export function inSensoOrario(partita: PartitaLupus, ancora: string | null): GiocatoreLupus[] {
  const n = partita.giocatori.length
  const inizio = ancora ? (cercaGiocatore(partita, ancora).posto + 1) % n : 0
  const perPosto = [...partita.giocatori].sort((a, b) => a.posto - b.posto)
  return [...perPosto.slice(inizio), ...perPosto.slice(0, inizio)]
}

function iniziaNomine(partita: PartitaLupus, adesso: number): PartitaLupus {
  const votanti = new Set(votantiDelleNomine(partita))
  const ordine = inSensoOrario(partita, partita.benvenuto)
    .filter((g) => votanti.has(g.id))
    .map((g) => g.id)
  return {
    ...partita,
    fase: 'nomine',
    inizioFase: adesso,
    fineFase: null,
    voti: {},
    ordineDiVoto: ordine,
    indiziati: [],
    conteggioNomine: null,
  }
}

function contaVoti(voti: Record<string, string | null>): Record<string, number> {
  const conteggio: Record<string, number> = {}
  for (const v of Object.values(voti)) {
    if (v) conteggio[v] = (conteggio[v] ?? 0) + 1
  }
  return conteggio
}

/** I candidati con almeno un voto, dal piu' votato; a pari voti prima chi e' piu' vicino al "Benvenuto!". */
function perVoti(partita: PartitaLupus, conteggio: Record<string, number>, candidati: string[]): string[] {
  const ordine = inSensoOrario(partita, partita.benvenuto).map((g) => g.id)
  const distanza = (id: string) => ordine.indexOf(id)
  return candidati
    .filter((id) => (conteggio[id] ?? 0) > 0)
    .sort((a, b) => (conteggio[b] ?? 0) - (conteggio[a] ?? 0) || distanza(a) - distanza(b))
}

function risolviNomine(partita: PartitaLupus, adesso: number): PartitaLupus {
  const conteggio = contaVoti(partita.voti)
  const inVita = vivi(partita).map((g) => g.id)
  const classifica = perVoti(partita, conteggio, inVita)
  // Il gufato entra d'ufficio, e il piu' votato gli si aggiunge: gli indiziati sono due al massimo.
  const gufato = partita.gufato && inVita.includes(partita.gufato) ? partita.gufato : null
  const indiziati: string[] = []
  if (gufato) indiziati.push(gufato)
  for (const id of classifica) {
    if (indiziati.length >= 2) break
    if (!indiziati.includes(id)) indiziati.push(id)
  }
  const cronaca: EventoLupus[] = [...partita.cronaca]
  if (indiziati.length === 0) {
    cronaca.push({ t: 'nessun_linciato', n: partita.giorno })
    return controllaFine(
      notteDalGiorno(
        { ...partita, conteggioNomine: conteggio, indiziati, ultimoLinciato: null, voti: {}, cronaca },
        adesso,
      ),
    )
  }
  cronaca.push({ t: 'indiziati', giocatori: indiziati, gufato: gufato ?? undefined })
  const secondi = partita.impostazioni.secondiArringhe
  return {
    ...partita,
    fase: 'arringhe',
    inizioFase: adesso,
    fineFase: secondi > 0 ? adesso + secondi * 1000 : null,
    voti: {},
    indiziati,
    conteggioNomine: conteggio,
    cronaca,
  }
}

function iniziaBallottaggio(partita: PartitaLupus, adesso: number): PartitaLupus {
  return { ...partita, fase: 'ballottaggio', inizioFase: adesso, fineFase: null, voti: {} }
}

function risolviBallottaggio(partita: PartitaLupus, adesso: number): PartitaLupus {
  const conteggio = contaVoti(partita.voti)
  const classifica = perVoti(partita, conteggio, partita.indiziati)
  const linciato = classifica[0] ?? null
  const giocatori = partita.giocatori.map((g) => ({ ...g }))
  const cronaca: EventoLupus[] = [...partita.cronaca]
  let contaMorti = partita.contaMorti
  if (linciato) {
    const g = giocatori.find((x) => x.id === linciato)!
    g.vivo = false
    g.ordineDiMorte = ++contaMorti
    if (g.ruolo === 'mortovivo') {
      g.nonMorto = true
      g.rivelato = true
      cronaca.push({ t: 'rivelato', giocatore: linciato, ruolo: 'mortovivo' })
    } else if (partita.impostazioni.rivelaRuoloAllaMorte) {
      g.rivelato = true
    }
    cronaca.push({ t: 'linciato', giocatore: linciato })
    cronaca.push({
      t: 'morte',
      giocatore: linciato,
      causa: 'linciaggio',
      pubblica: partita.impostazioni.rivelaRuoloAllaMorte,
    })
  } else {
    cronaca.push({ t: 'nessun_linciato', n: partita.giorno })
  }
  const dopo: PartitaLupus = {
    ...partita,
    giocatori,
    contaMorti,
    ultimoLinciato: linciato,
    esitoBallottaggio: { conteggio, linciato, altriMorti: [] },
    voti: {},
    cronaca,
  }
  if (linciato && decisioniAllaMorte(partita)) {
    return {
      ...dopo,
      fase: 'decisione',
      inizioFase: adesso,
      fineFase: null,
      decisione: { attesi: [linciato], da: 'giorno', rivelati: [] },
    }
  }
  return controllaFine(notteDalGiorno(dopo, adesso))
}

function notteDalGiorno(partita: PartitaLupus, adesso: number): PartitaLupus {
  // Si passa alla notte; l'esito del ballottaggio e le nomine restano, per mostrare com'e' andato il giorno.
  const n = iniziaNotte(partita, adesso)
  return { ...n, esitoBallottaggio: partita.esitoBallottaggio, conteggioNomine: partita.conteggioNomine }
}

/* ─────────  La fine della partita  ────────── */

export function controllaFine(partita: PartitaLupus): PartitaLupus {
  if (partita.esito) return partita
  const inVita = vivi(partita)
  // Il Mortovivo non conta mai fra i vivi, nemmeno prima di morire.
  const contati = inVita.filter((g) => g.ruolo !== 'mortovivo')
  const lupi = contati.filter((g) => contaComeLupo(g)).length
  const altri = contati.length - lupi
  const finita = lupi === 0 || lupi >= altri
  if (!finita) return partita

  let vincitore: VincitoreLupus
  const darius = inVita.find((g) => ruoloAttuale(g) === 'darius')
  const criceto = inVita.find((g) => ruoloAttuale(g) === 'criceto')
  if (darius && contati.length <= 2) vincitore = 'darius'
  else if (criceto) vincitore = 'criceto'
  else vincitore = lupi === 0 ? 'villaggio' : 'lupi'

  const vincitori = partita.giocatori.filter((g) => vince(g, vincitore)).map((g) => g.id)
  return {
    ...partita,
    fase: 'finita',
    fineFase: null,
    esito: { vincitore, vincitori },
    cronaca: [...partita.cronaca, { t: 'fine', vincitore }],
  }
}

export function vince(g: GiocatoreLupus, vincitore: VincitoreLupus): boolean {
  const ruolo = ruoloAttuale(g)
  switch (vincitore) {
    case 'darius':
      return ruolo === 'darius' && g.vivo
    case 'criceto':
      return ruolo === 'criceto' && g.vivo
    case 'villaggio':
      // Darius morto "vince o perde con gli umani".
      return fazioneDi(g) === 'villaggio' || (ruolo === 'darius' && !g.vivo)
    case 'lupi':
      return fazioneDi(g) === 'lupi'
  }
}

/** Il caso della partita, dal punto a cui e' arrivato. */
export function casoDi(partita: PartitaLupus): Caso {
  return casoDa(partita.statoCaso)
}
