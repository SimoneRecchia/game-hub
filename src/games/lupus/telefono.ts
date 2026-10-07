/**
 * Lupus a un telefono solo: il telefono fa da moderatore e passa di mano. Qui
 * si decide a chi va, e quando torna sul tavolo; le regole sono tutte del
 * motore (shared/lupus.ts), lo stesso della partita online.
 *
 * Il telefono passa di mano in quattro momenti — i ruoli, la notte, il
 * "Benvenuto!" ai nuovi fantasmi, il ballottaggio segreto — e ognuno e' un
 * giro (`Giro`): l'elenco di chi lo riceve, fissato quando il giro comincia.
 * Fissato perché il motore va avanti da solo appena l'ultimo ha fatto la sua
 * parte: di notte, quando l'ultimo con un potere ha scelto, la notte e' gia'
 * risolta. Il telefono passa comunque a tutti gli altri, che fingono di
 * scegliere come prima, e l'alba si vede solo quando l'ha avuto l'ultimo: se
 * arrivasse subito direbbe che chi viene dopo non ha poteri. Per la stessa
 * ragione chi finge sceglie fra i vivi di quando la notte e' cominciata
 * (`vivi`), non fra quelli di adesso, che non hanno piu' lo sbranato.
 *
 * Tre cose che vengono dal regolamento, e dal Lupus di prima:
 *
 *  - di notte il telefono passa a tutti i vivi, anche a chi non ha poteri; se
 *    c'e' il Baron Samedi anche ai fantasmi, perché lui agisce da morto e
 *    chiamare solo lui lo smaschererebbe;
 *  - chi ha appena agito legge l'esito prima di passare il telefono (`fatto`):
 *    senza, il Veggente non vedrebbe mai la risposta;
 *  - dalla seconda notte, prima che il telefono giri, il tavolo vede com'e'
 *    andato il giorno (`notteAnnunciata`).
 *
 * La partita sta nel `localStorage`: un ricaricamento o una telefonata non la
 * mandano a monte. Il telefono riaperto chiede di nuovo chi lo tiene in mano
 * (`aperto` torna falso): una schermata privata non si riapre da sola.
 */

import {
  applica,
  chiaveDi,
  compitiDi,
  inSensoOrario,
  IMPOSTAZIONI_LUPUS,
  nuovaPartita,
  personaggioInGioco,
  votantiDelBallottaggio,
  type AzioneLupus,
  type ImpostazioniLupus,
  type PartitaLupus,
  type SceltaNotturna,
} from '@shared/lupus'
import {
  composizioneAutomatica,
  controllaComposizione,
  GIOCATORI_MASSIMI,
  GIOCATORI_MINIMI,
  type Composizione,
} from '@shared/lupus-composizione'
import { composizioneValida, regoleValide } from '@shared/lupus-stanza'

/** Perché si passa il telefono: lo dice la schermata a chi lo riceve. */
export type PerChe = 'ruolo' | 'notte' | 'notizia' | 'voto'

export interface Giro {
  /** Il momento della partita: cambiata la chiave, comincia un altro giro. */
  chiave: string
  perche: PerChe
  /** A chi passa il telefono, nell'ordine. */
  elenco: string[]
  /** Chi era vivo quando il giro e' cominciato: chi finge di scegliere sceglie fra loro. */
  vivi: string[]
  /** La notte del giro: i segreti da leggere sono i suoi. */
  notte: number
  /** A chi tocca; quando e' la lunghezza dell'elenco il giro e' finito. */
  indice: number
  /** Chi lo tiene ha detto di essere lui: la sua schermata e' aperta. */
  aperto: boolean
  /** Ha agito, e legge l'esito prima di passare il telefono. */
  fatto: boolean
}

export interface StatoTelefono {
  partita: PartitaLupus
  giro: Giro | null
  /** La notte per cui il tavolo ha gia' visto com'e' andato il giorno: dopo, il telefono gira. */
  notteAnnunciata: number
}

/** Come si gioca: i nomi in senso orario, il mazzo (null quello del regolamento) e le regole. */
export interface Preparazione {
  nomi: string[]
  composizione: Composizione | null
  regole: ImpostazioniLupus
}

export const NOME_MASSIMO = 20

/* ─────────────────────────────  I giri  ───────────────────────────── */

/** Il giro che la partita vuole adesso, o null se il telefono sta sul tavolo. */
export function chiaveDelGiro(partita: PartitaLupus, notteAnnunciata: number): string | null {
  switch (partita.fase) {
    case 'ruoli':
      return 'ruoli'
    case 'notte':
      // Dalla seconda notte prima si guarda il giorno che e' finito, tutti insieme.
      return partita.notte > 1 && notteAnnunciata < partita.notte ? null : `notte-${partita.notte}`
    case 'decisione':
      return `decisione-${partita.notte}-${partita.giorno}-${partita.decisione?.da ?? ''}`
    case 'ballottaggio':
      return `ballottaggio-${partita.giorno}`
    default:
      return null
  }
}

const PERCHE: Record<string, PerChe> = { ruoli: 'ruolo', notte: 'notte', decisione: 'notizia', ballottaggio: 'voto' }

/** A chi passa il telefono nel giro che comincia adesso, nell'ordine dei posti. */
export function elencoDelGiro(partita: PartitaLupus): string[] {
  const perPosto = [...partita.giocatori].sort((a, b) => a.posto - b.posto)
  switch (partita.fase) {
    case 'ruoli':
      return perPosto.map((g) => g.id)
    case 'notte': {
      const vivi = perPosto.filter((g) => g.vivo)
      // Il Baron agisce anche da fantasma: si chiamano tutti i fantasmi, perché nessuno capisca chi fra loro.
      const fantasmi = personaggioInGioco(partita, 'baron') ? perPosto.filter((g) => !g.vivo && !g.nonMorto) : []
      return [...vivi, ...fantasmi].map((g) => g.id)
    }
    case 'decisione':
      return perPosto.filter((g) => partita.decisione?.attesi.includes(g.id)).map((g) => g.id)
    case 'ballottaggio': {
      // Si vota dal posto a sinistra di chi ha il "Benvenuto!", come alle nomine.
      const votanti = new Set(votantiDelBallottaggio(partita))
      return inSensoOrario(partita, partita.benvenuto)
        .filter((g) => votanti.has(g.id))
        .map((g) => g.id)
    }
    default:
      return []
  }
}

function nuovoGiro(partita: PartitaLupus, chiave: string): Giro {
  return {
    chiave,
    perche: PERCHE[partita.fase] ?? 'notte',
    elenco: elencoDelGiro(partita),
    vivi: partita.giocatori.filter((g) => g.vivo).map((g) => g.id),
    notte: partita.notte,
    indice: 0,
    aperto: false,
    fatto: false,
  }
}

/** Il giro in corso, se il telefono e' in giro; null se sta sul tavolo. */
export function giroInCorso(s: StatoTelefono): Giro | null {
  return s.giro && s.giro.indice < s.giro.elenco.length ? s.giro : null
}

/** Chi ha il telefono in mano, o deve prenderlo. */
export function chiHaIlTelefono(s: StatoTelefono): string | null {
  const giro = giroInCorso(s)
  return giro ? giro.elenco[giro.indice] : null
}

/**
 * La discussione e le arringhe finite da sole: si va avanti come avrebbe fatto
 * chi conduce. E' la regola della stanza online (lupusStore.ts), qui sul
 * telefono: la fase dopo comincia quando il tempo e' finito, non adesso.
 */
export function scadute(partita: PartitaLupus, adesso: number): PartitaLupus {
  let p = partita
  for (let i = 0; i < 4; i += 1) {
    const aTempo = p.fase === 'discussione' || p.fase === 'arringhe'
    if (!aTempo || p.fineFase === null || adesso < p.fineFase) break
    p = applica(p, { tipo: 'avanti' }, p.fineFase)
  }
  return p
}

/**
 * Lo stato dopo un cambio: il giro in corso resta finché non l'hanno avuto
 * tutti; finito, comincia quello che la partita vuole adesso. Se il telefono e'
 * passato a tutti e la fase aspetta ancora qualcuno, la chiude il telefono,
 * che conduce: come "avanti" nella stanza online.
 */
export function sistema(s: StatoTelefono, adesso: number): StatoTelefono {
  let partita = scadute(s.partita, adesso)
  let giro = s.giro
  for (let i = 0; i < 8; i += 1) {
    if (giro && giro.indice < giro.elenco.length) break
    const chiave = chiaveDelGiro(partita, s.notteAnnunciata)
    if (chiave === null) {
      giro = null
      break
    }
    if (!giro || giro.chiave !== chiave) {
      giro = nuovoGiro(partita, chiave)
      if (giro.elenco.length > 0) break
    }
    partita = applica(partita, { tipo: 'avanti' }, adesso)
  }
  if (partita === s.partita && giro === s.giro) return s
  return { ...s, partita, giro }
}

/* ─────────────────────────────  Le azioni  ───────────────────────────── */

/** Una partita nuova: i nomi nell'ordine scritto sono i posti, in senso orario. */
export function comincia(prep: Preparazione, seme: number, adesso: number): StatoTelefono {
  const nomi = nomiDellaPartita(prep.nomi)
  const iscritti = nomi.map((nome, i) => ({ id: `g${i + 1}`, nome }))
  const composizione = prep.composizione ?? composizioneAutomatica(nomi.length)
  const partita = nuovaPartita(iscritti, composizione, prep.regole, seme, adesso)
  return sistema({ partita, giro: null, notteAnnunciata: 0 }, adesso)
}

/** Chi ha il telefono dice di essere lui: si apre la sua schermata. */
export function apri(s: StatoTelefono): StatoTelefono {
  const giro = giroInCorso(s)
  return giro ? { ...s, giro: { ...giro, aperto: true } } : s
}

/** Il telefono al prossimo; dopo l'ultimo torna sul tavolo, o comincia il giro dopo. */
export function passa(s: StatoTelefono, adesso: number): StatoTelefono {
  const giro = giroInCorso(s)
  if (!giro) return sistema(s, adesso)
  return sistema({ ...s, giro: { ...giro, indice: giro.indice + 1, aperto: false, fatto: false } }, adesso)
}

/** Un'azione del motore che non decide a chi passa il telefono: le fasi del tavolo, le nomine. */
export function agisci(s: StatoTelefono, azione: AzioneLupus, adesso: number): StatoTelefono {
  return sistema({ ...s, partita: applica(s.partita, azione, adesso) }, adesso)
}

/** Un'azione di chi ha il telefono, e poi il telefono passa: il ruolo visto, il Benvenuto, il voto segreto. */
export function agisciEPassa(s: StatoTelefono, azione: AzioneLupus, adesso: number): StatoTelefono {
  return passa({ ...s, partita: applica(s.partita, azione, adesso) }, adesso)
}

/**
 * La scelta della notte di chi ha il telefono. Se ha un altro compito — chi ha
 * il teschio lo passa, e poi fa quel che fa il suo personaggio — resta sulla
 * sua schermata; se ha saputo qualcosa lo legge (`fatto`); se no il telefono
 * passa. Quel che ha letto per scegliere — il branco, la seduta — non si
 * ripete.
 */
export function sceltaDellaNotte(s: StatoTelefono, id: string, scelta: SceltaNotturna, adesso: number): StatoTelefono {
  const prima = (s.partita.segreti[id] ?? []).length
  const partita = applica(s.partita, { tipo: 'notte', giocatore: id, scelta }, adesso)
  const dopo: StatoTelefono = { ...s, partita }
  if (partita.fase === 'notte' && compitiDi(partita, id).some((c) => !(chiaveDi(c) in partita.scelte))) return dopo
  const giro = giroInCorso(dopo)
  const saputo = (partita.segreti[id] ?? []).length > prima && scelta.tipo !== 'letto'
  if (giro && saputo) return { ...dopo, giro: { ...giro, fatto: true } }
  return passa(dopo, adesso)
}

/** Il tavolo ha visto com'e' andato il giorno: comincia la notte, e il telefono gira. */
export function annunciaLaNotte(s: StatoTelefono, adesso: number): StatoTelefono {
  return sistema({ ...s, notteAnnunciata: s.partita.notte }, adesso)
}

/** Il tempo che passa: la discussione e le arringhe che finiscono da sole. */
export function tempoPassato(s: StatoTelefono, adesso: number): StatoTelefono {
  return sistema(s, adesso)
}

/* ─────────────────────────────  La preparazione  ───────────────────────────── */

export const PREPARAZIONE_INIZIALE: Preparazione = {
  nomi: ['', '', '', '', '', ''],
  composizione: null,
  regole: IMPOSTAZIONI_LUPUS,
}

/** I nomi scritti, senza le righe vuote. */
export function nomiDellaPartita(nomi: readonly string[]): string[] {
  return nomi.map((n) => n.trim()).filter(Boolean)
}

/** Che cosa manca per cominciare, detto a chi prepara la partita; null se si puo'. */
export function problemaDellaPreparazione(prep: Preparazione): string | null {
  const nomi = nomiDellaPartita(prep.nomi)
  if (nomi.length < GIOCATORI_MINIMI) return `Servono almeno ${GIOCATORI_MINIMI} giocatori.`
  if (nomi.length > GIOCATORI_MASSIMI) return `Al massimo ${GIOCATORI_MASSIMI} giocatori.`
  const visti = new Set<string>()
  for (const nome of nomi) {
    const chiave = nome.toLocaleLowerCase('it-IT')
    if (visti.has(chiave)) return `Due giocatori si chiamano ${nome}.`
    visti.add(chiave)
  }
  const mazzo = prep.composizione ?? composizioneAutomatica(nomi.length)
  return controllaComposizione(mazzo, nomi.length).find((p) => p.livello === 'errore')?.messaggio ?? null
}

/* ─────────────────────────────  Il salvataggio  ───────────────────────────── */

const CHIAVE_PARTITA = 'giochi.lupus.telefono'
const CHIAVE_PREPARAZIONE = 'giochi.lupus.preparazione'
/** Cambia se cambia la forma di quel che si salva: una partita di prima non si riprende. */
const FORMATO = 1

function leggiJson(chiave: string): unknown {
  try {
    const testo = localStorage.getItem(chiave)
    return testo ? (JSON.parse(testo) as unknown) : null
  } catch {
    return null
  }
}

function scriviJson(chiave: string, valore: unknown) {
  try {
    if (valore === null) localStorage.removeItem(chiave)
    else localStorage.setItem(chiave, JSON.stringify(valore))
  } catch {
    /* senza localStorage la partita vale per questa visita */
  }
}

const eStringhe = (x: unknown): x is string[] => Array.isArray(x) && x.every((v) => typeof v === 'string')

function giroValido(x: unknown): Giro | null {
  const g = x as Partial<Giro> | null
  if (!g || typeof g !== 'object' || typeof g.chiave !== 'string' || !eStringhe(g.elenco) || !eStringhe(g.vivi)) {
    return null
  }
  if (typeof g.indice !== 'number' || typeof g.notte !== 'number') return null
  const perche = (['ruolo', 'notte', 'notizia', 'voto'] as const).find((p) => p === g.perche) ?? 'notte'
  // Riaperto, il telefono chiede di nuovo chi lo tiene: una schermata privata non si riapre da sola.
  return { ...(g as Giro), perche, aperto: false, fatto: g.fatto === true }
}

/** La partita salvata, se c'e' e se ha la forma di adesso. */
export function leggiTelefono(): StatoTelefono | null {
  const s = leggiJson(CHIAVE_PARTITA) as { formato?: number; partita?: PartitaLupus; giro?: unknown } | null
  if (!s || s.formato !== FORMATO || !s.partita || !Array.isArray(s.partita.giocatori)) return null
  if (typeof s.partita.fase !== 'string' || s.partita.giocatori.length < GIOCATORI_MINIMI) return null
  const notteAnnunciata = (s as { notteAnnunciata?: unknown }).notteAnnunciata
  return {
    partita: s.partita,
    giro: s.giro ? giroValido(s.giro) : null,
    notteAnnunciata: typeof notteAnnunciata === 'number' ? notteAnnunciata : 0,
  }
}

export function salvaTelefono(s: StatoTelefono | null) {
  scriviJson(CHIAVE_PARTITA, s && { formato: FORMATO, ...s })
}

export function leggiPreparazione(): Preparazione {
  const p = leggiJson(CHIAVE_PREPARAZIONE) as Partial<Preparazione> | null
  if (!p || typeof p !== 'object') return PREPARAZIONE_INIZIALE
  const nomi = eStringhe(p.nomi) ? p.nomi.slice(0, GIOCATORI_MASSIMI).map((n) => n.slice(0, NOME_MASSIMO)) : []
  return {
    nomi: nomi.length > 0 ? nomi : PREPARAZIONE_INIZIALE.nomi,
    composizione: composizioneValida(p.composizione ?? null),
    regole: regoleValide(p.regole ?? {}),
  }
}

export function salvaPreparazione(p: Preparazione) {
  scriviJson(CHIAVE_PREPARAZIONE, p)
}
