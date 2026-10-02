/**
 * I suoni dell'app, fatti nel browser con Web Audio: nessun file da scaricare
 * e niente sul server.
 *
 * Ogni suono e' una piccola partitura di strumenti sintetizzati: marimba e
 * campanello per le cose musicali, un colpo di legno per i tocchi, rumore
 * filtrato per l'acqua e le esplosioni, un tonfo per i colpi. Tutto passa da un
 * filo di riverbero e da un compressore: e' quel che li fa sembrare suonati in
 * una stanza, invece che usciti da un chip, e tiene alla stessa altezza quelli
 * che si sommano.
 *
 * Il contesto audio nasce al primo tocco — i browser non suonano prima di un
 * gesto — e si ferma a pagina nascosta. Su iOS la sessione e' "ambient": segue
 * l'interruttore del silenzioso e non interrompe la musica che sta suonando.
 * Si spengono dal profilo, e la scelta resta nel browser.
 */

import { useSyncExternalStore } from 'react'

export type NomeSuono =
  /** Un tasto, una tessera, una lettera: appena un clic. */
  | 'tocco'
  /** Una tessera di legno posata sul tabellone. */
  | 'posa'
  /** Una mossa dello Scarabeo accettata. */
  | 'mossa'
  | 'giusto'
  | 'sbagliato'
  /** Gli ultimi secondi del tempo, e il tre-due-uno. */
  | 'tic'
  | 'scaduto'
  | 'via'
  | 'vittoria'
  | 'sconfitta'
  | 'pareggio'
  /** Qualcuno arriva nella partita, o accetta la sfida. */
  | 'entra'
  /** Qualcuno se ne va. */
  | 'esce'
  /** Una sfida, un invito, una rivincita: una notifica. */
  | 'invito'
  | 'punto'
  | 'puntoAltro'
  | 'rallenty'
  | 'acqua'
  | 'colpito'
  | 'affondato'
  /** Tutte le tessere in una mossa. */
  | 'scarabeo'
  /** Un aiuto usato: una lettera svelata, il 50 e 50. */
  | 'svela'
  /** Le caselle del Wordle che si girano, dal colore. */
  | 'assente'
  | 'presente'
  | 'esatta'
  /** La lancetta di Crazy Time contro un piolo. */
  | 'scatto'
  /** Una ruota lanciata col dito. */
  | 'lancio'
  /** La ruota si ferma su un minigioco. */
  | 'bonus'
  /** Vince il banco. */
  | 'banco'
  /** La ruota dei moltiplicatori si ferma. */
  | 'moltiplicatore'
  | 'monetaLancio'
  | 'monetaCade'
  /** Una puntata vinta: la fanfara, e le monete. */
  | 'vincita'
  /** Le fiches della puntata posate sulla ruota. */
  | 'fiche'
  /** Una moneta della vincita che arriva sul saldo. */
  | 'incasso'
  /** Il passaggio da una scena all'altra di Crazy Time. */
  | 'intermezzo'

export interface OpzioniSuono {
  /** Da 0 a 1: un colpo dell'avversario suona piu' piano di uno mio. */
  volume?: number
  /** Secondi di attesa prima di suonare. */
  ritardo?: number
}

/* ─────────────────────────────  Acceso o spento  ──────────────────────────── */

const CHIAVE = 'suoni'
const ascoltatori = new Set<() => void>()
let attivi = leggiScelta()

function leggiScelta(): boolean {
  try {
    return localStorage.getItem(CHIAVE) !== 'no'
  } catch {
    return true
  }
}

export function suoniAttivi(): boolean {
  return attivi
}

export function impostaSuoni(si: boolean): void {
  attivi = si
  try {
    localStorage.setItem(CHIAVE, si ? 'si' : 'no')
  } catch {
    // Senza memoria del browser la scelta vale fino a quando si chiude la pagina.
  }
  ascoltatori.forEach((f) => f())
  // Acceso adesso: un tocco per sentire che c'e'.
  if (si) suona('tocco')
}

/** La scelta dei suoni per un interruttore: cambia insieme in tutte le schermate. */
export function useSuoni(): [boolean, (si: boolean) => void] {
  const acceso = useSyncExternalStore(
    (f) => {
      ascoltatori.add(f)
      return () => ascoltatori.delete(f)
    },
    () => attivi,
    () => true,
  )
  return [acceso, impostaSuoni]
}

/* ─────────────────────────────  Il contesto audio  ────────────────────────── */

/** Dove si collegano le voci: diretto al compressore, o anche nel riverbero. */
interface Uscita {
  ctx: BaseAudioContext
  secco: AudioNode
  eco: AudioNode
  rumore: AudioBuffer
}

let contesto: AudioContext | null = null
let uscita: Uscita | null = null
const ultimi = new Map<NomeSuono, number>()

/** Il banco degli strumenti su un contesto qualunque: quello vero, o uno offline per le prove. */
export function preparaUscita(ctx: BaseAudioContext, destinazione: AudioNode = ctx.destination): Uscita {
  const compressore = ctx.createDynamicsCompressor()
  compressore.threshold.value = -16
  compressore.knee.value = 10
  compressore.ratio.value = 4
  compressore.attack.value = 0.002
  compressore.release.value = 0.18
  const volume = ctx.createGain()
  volume.gain.value = 0.85
  compressore.connect(volume).connect(destinazione)

  const riverbero = ctx.createConvolver()
  riverbero.buffer = rispostaDellaStanza(ctx)
  riverbero.connect(compressore)

  return { ctx, secco: compressore, eco: riverbero, rumore: rumoreBianco(ctx) }
}

function prepara(): Uscita | null {
  if (uscita) return uscita
  if (typeof window === 'undefined') return null
  const vecchio = window as unknown as { webkitAudioContext?: typeof AudioContext }
  const Ctx = window.AudioContext ?? vecchio.webkitAudioContext
  if (!Ctx) return null
  try {
    // "ambient": su iOS segue il silenzioso e si mescola alla musica di altre app.
    const sessione = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (sessione) sessione.type = 'ambient'
    contesto = new Ctx({ latencyHint: 'interactive' })
    uscita = preparaUscita(contesto)
    return uscita
  } catch {
    return null
  }
}

/*
 * Il primo gesto accende l'audio: i browser non lasciano suonare una pagina
 * che non e' stata toccata, e iOS vuole che il contesto riparta proprio dentro
 * un gesto. Dopo, i suoni partono anche da una risposta del server.
 */
if (typeof window !== 'undefined') {
  const sblocca = () => {
    if (!attivi) return
    const u = prepara()
    if (contesto?.state === 'suspended') void contesto.resume()
    if (u && contesto) {
      // Un attimo di silenzio: su iOS e' quel che sblocca davvero l'uscita.
      const vuoto = contesto.createBufferSource()
      vuoto.buffer = contesto.createBuffer(1, 1, contesto.sampleRate)
      vuoto.connect(contesto.destination)
      vuoto.start()
    }
  }
  window.addEventListener('pointerdown', sblocca, { capture: true, passive: true })
  window.addEventListener('keydown', sblocca, { capture: true })
  document.addEventListener('visibilitychange', () => {
    if (!contesto) return
    if (document.visibilityState === 'hidden') void contesto.suspend()
    else if (attivi) void contesto.resume()
  })
}

/**
 * Suona un suono, se i suoni sono accesi e l'audio c'e'. Lo stesso suono due
 * volte nello stesso istante suona una volta sola; quelli con un ritardo sono
 * una sequenza voluta, come il tre-due-uno, e partono tutti.
 */
export function suona(nome: NomeSuono, opzioni: OpzioniSuono = {}): void {
  if (!attivi) return
  const u = prepara()
  if (!u || !contesto || contesto.state === 'closed') return
  if (contesto.state === 'suspended') void contesto.resume()
  if (!opzioni.ritardo) {
    const adesso = performance.now()
    if (adesso - (ultimi.get(nome) ?? 0) < 35) return
    ultimi.set(nome, adesso)
  }
  try {
    PARTITURE[nome](u, contesto.currentTime + 0.01 + (opzioni.ritardo ?? 0), opzioni.volume ?? 1)
  } catch {
    // Un suono che non parte non ferma il gioco.
  }
}

/* ───────────────────────────────  Gli strumenti  ─────────────────────────── */

/** Il riverbero di una stanza piccola: rumore che si spegne, piu' scuro in coda. */
function rispostaDellaStanza(ctx: BaseAudioContext): AudioBuffer {
  const durata = 1.5
  const n = Math.floor(ctx.sampleRate * durata)
  const risposta = ctx.createBuffer(2, n, ctx.sampleRate)
  const entrata = ctx.sampleRate * 0.008
  for (let canale = 0; canale < 2; canale += 1) {
    const dati = risposta.getChannelData(canale)
    let filtrato = 0
    for (let i = 0; i < n; i += 1) {
      filtrato += (Math.random() * 2 - 1 - filtrato) * 0.3
      const coda = Math.pow(1 - i / n, 3)
      dati[i] = filtrato * coda * (i < entrata ? i / entrata : 1)
    }
  }
  return risposta
}

function rumoreBianco(ctx: BaseAudioContext): AudioBuffer {
  const n = ctx.sampleRate * 2
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate)
  const dati = buffer.getChannelData(0)
  for (let i = 0; i < n; i += 1) dati[i] = Math.random() * 2 - 1
  return buffer
}

/** Il volume di una voce, collegato all'uscita: tutto secco, piu' una parte nel riverbero. */
function voce(u: Uscita, volume: number, eco: number): GainNode {
  const g = u.ctx.createGain()
  g.gain.value = volume
  g.connect(u.secco)
  if (eco > 0) {
    const mandata = u.ctx.createGain()
    mandata.gain.value = eco
    g.connect(mandata).connect(u.eco)
  }
  return g
}

/** Un parziale che si accende di colpo e si spegne piano: la curva di una barra percossa. */
function parziale(u: Uscita, t: number, frequenza: number, ampiezza: number, decadimento: number, verso: AudioNode) {
  if (frequenza > 16_000) return
  const o = u.ctx.createOscillator()
  o.type = 'sine'
  o.frequency.value = frequenza
  const g = u.ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(ampiezza, t + 0.003)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.003 + decadimento)
  o.connect(g).connect(verso)
  o.start(t)
  o.stop(t + 0.02 + decadimento)
}

/** Un soffio di rumore brevissimo e filtrato: il colpo della bacchetta, il clic di un tasto. */
function colpo(u: Uscita, t: number, verso: AudioNode, centro: number, durata: number, ampiezza: number) {
  const s = u.ctx.createBufferSource()
  s.buffer = u.rumore
  const f = u.ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = centro
  f.Q.value = 1.2
  const g = u.ctx.createGain()
  g.gain.setValueAtTime(ampiezza, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + durata)
  s.connect(f).connect(g).connect(verso)
  s.start(t, Math.random() * 1.5, durata + 0.01)
}

/**
 * Una nota di marimba: la fondamentale e i due parziali della barra di legno,
 * a quattro e dieci volte, che si spengono prima; le note basse suonano piu'
 * a lungo, come sullo strumento.
 */
function marimba(u: Uscita, t: number, f: number, volume: number, { eco = 0.18, durata = 1 } = {}) {
  const v = voce(u, volume, eco)
  const lunga = Math.min(1.4, Math.max(0.3, 0.3 + 380 / f)) * durata
  parziale(u, t, f, 1, lunga, v)
  parziale(u, t, f * 3.93, 0.26, 0.16 * durata, v)
  parziale(u, t, f * 9.2, 0.06, 0.05 * durata, v)
  colpo(u, t, v, Math.min(6000, f * 4), 0.012, 0.16)
}

/** Una nota di campanello: i parziali di una barra di metallo, non armonici, che risuonano a lungo. */
function campanello(u: Uscita, t: number, f: number, volume: number, { eco = 0.3, durata = 1 } = {}) {
  const v = voce(u, volume, eco)
  parziale(u, t, f, 1, 1.4 * durata, v)
  parziale(u, t, f * 2.76, 0.3, 0.6 * durata, v)
  parziale(u, t, f * 5.4, 0.1, 0.3 * durata, v)
  parziale(u, t, f * 8.93, 0.04, 0.15 * durata, v)
}

/** Un colpo di legno: una nota secca che cala appena, piu' il rumore del colpo. */
function legno(u: Uscita, t: number, f: number, volume: number, eco = 0.04) {
  const v = voce(u, volume, eco)
  const o = u.ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(f * 1.5, t)
  o.frequency.exponentialRampToValueAtTime(f, t + 0.012)
  const g = u.ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(1, t + 0.001)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
  o.connect(g).connect(v)
  o.start(t)
  o.stop(t + 0.09)
  colpo(u, t, v, f * 2.2, 0.025, 0.5)
}

/** Rumore filtrato con il filtro che scorre: onde, spruzzi, esplosioni, soffi. */
function soffio(
  u: Uscita,
  t: number,
  durata: number,
  volume: number,
  filtro: { tipo: BiquadFilterType; da: number; a: number; q?: number },
  { attacco = 0.005, eco = 0.12 } = {},
) {
  const v = voce(u, volume, eco)
  const s = u.ctx.createBufferSource()
  s.buffer = u.rumore
  const f = u.ctx.createBiquadFilter()
  f.type = filtro.tipo
  f.Q.value = filtro.q ?? 0.8
  f.frequency.setValueAtTime(filtro.da, t)
  f.frequency.exponentialRampToValueAtTime(filtro.a, t + durata)
  const g = u.ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(1, t + attacco)
  g.gain.exponentialRampToValueAtTime(0.0001, t + durata)
  s.connect(f).connect(g).connect(v)
  s.start(t, Math.random() * 0.4, durata + 0.05)
}

/** Un tonfo basso: una nota che precipita, come un colpo sul fondo. */
function tonfo(u: Uscita, t: number, volume: number, { da = 120, a = 42, durata = 0.35 } = {}) {
  const v = voce(u, volume, 0.05)
  const o = u.ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(da, t)
  o.frequency.exponentialRampToValueAtTime(a, t + durata * 0.8)
  const g = u.ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(1, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + durata)
  o.connect(g).connect(v)
  o.start(t)
  o.stop(t + durata + 0.02)
}

/** Una nota che scivola, piu' piano verso il fondo: il nastro che rallenta. */
function scivolo(u: Uscita, t: number, da: number, a: number, durata: number, volume: number) {
  const v = voce(u, volume, 0.25)
  const o = u.ctx.createOscillator()
  o.type = 'triangle'
  o.frequency.setValueAtTime(da, t)
  o.frequency.exponentialRampToValueAtTime(a, t + durata)
  const f = u.ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 2200
  const g = u.ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(1, t + 0.02)
  g.gain.setValueAtTime(1, t + durata * 0.6)
  g.gain.exponentialRampToValueAtTime(0.0001, t + durata)
  o.connect(f).connect(g).connect(v)
  o.start(t)
  o.stop(t + durata + 0.02)
}

/** Una goccia o una bolla: una nota brevissima che sale. */
function goccia(u: Uscita, t: number, f: number, volume: number) {
  const v = voce(u, volume, 0.2)
  const o = u.ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(f, t)
  o.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.05)
  const g = u.ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(1, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
  o.connect(g).connect(v)
  o.start(t)
  o.stop(t + 0.08)
}

/* ─────────────────────────────────  Le note  ─────────────────────────────── */

const N = {
  F3: 174.61,
  G3: 196,
  A3: 220,
  C4: 261.63,
  E4: 329.63,
  Eb4: 311.13,
  G4: 392,
  A4: 440,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  A5: 880,
  B5: 987.77,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  G6: 1567.98,
  A6: 1760,
  C7: 2093,
  D7: 2349.32,
  E7: 2637.02,
  G7: 3135.96,
  A7: 3520,
}

/** Un po' di differenza fra un colpo e l'altro, come nella realta': cento tocchi uguali stancano. */
const vario = (x: number, quanto = 0.03) => x * (1 - quanto + Math.random() * quanto * 2)

/* ──────────────────────────────  Le partiture  ───────────────────────────── */

type Partitura = (u: Uscita, t: number, v: number) => void

export const PARTITURE: Record<NomeSuono, Partitura> = {
  tocco: (u, t, v) => legno(u, t, vario(1700), 0.09 * v),

  posa: (u, t, v) => {
    legno(u, t, vario(500), 0.26 * v)
    marimba(u, t, vario(1000, 0.01), 0.04 * v, { durata: 0.3, eco: 0.04 })
  },

  mossa: (u, t, v) => {
    legno(u, t, 520, 0.2 * v)
    legno(u, t + 0.07, 700, 0.2 * v)
    marimba(u, t + 0.07, N.E5, 0.18 * v, { durata: 0.8 })
    marimba(u, t + 0.14, N.B5, 0.2 * v, { durata: 0.8 })
  },

  giusto: (u, t, v) => {
    marimba(u, t, N.E5, 0.3 * v)
    marimba(u, t + 0.075, N.B5, 0.34 * v)
    campanello(u, t + 0.075, N.B5 * 2, 0.05 * v, { durata: 0.6 })
  },

  sbagliato: (u, t, v) => {
    marimba(u, t, N.A3, 0.36 * v, { durata: 0.4, eco: 0.06 })
    marimba(u, t + 0.1, N.F3, 0.36 * v, { durata: 0.5, eco: 0.06 })
    tonfo(u, t, 0.12 * v, { da: 95, a: 50, durata: 0.25 })
  },

  tic: (u, t, v) => legno(u, t, 1150, 0.16 * v),

  scaduto: (u, t, v) => {
    marimba(u, t, N.C5, 0.26 * v, { durata: 0.5 })
    marimba(u, t + 0.08, N.G4, 0.26 * v, { durata: 0.5 })
    marimba(u, t + 0.16, N.C4, 0.3 * v, { durata: 0.8 })
    tonfo(u, t + 0.16, 0.12 * v, { da: 90, a: 45, durata: 0.3 })
  },

  via: (u, t, v) => {
    marimba(u, t, N.G5, 0.2 * v)
    marimba(u, t, N.C6, 0.3 * v)
    campanello(u, t, N.C7, 0.08 * v, { durata: 0.7 })
  },

  vittoria: (u, t, v) => {
    const salita = [N.C5, N.E5, N.G5, N.C6]
    salita.forEach((f, i) => marimba(u, t + i * 0.085, f, 0.28 * v, { eco: 0.25 }))
    const accordo = t + 0.36
    campanello(u, accordo, N.C6, 0.16 * v, { eco: 0.4, durata: 1.2 })
    campanello(u, accordo, N.E6, 0.12 * v, { eco: 0.4, durata: 1.2 })
    campanello(u, accordo, N.G6, 0.1 * v, { eco: 0.4, durata: 1.2 })
    marimba(u, accordo, N.C5, 0.18 * v, { eco: 0.3, durata: 1.2 })
    // Le scintille: note alte a caso della scala pentatonica, che non stonano mai.
    const scintille = [N.C7, N.D7, N.E7, N.G7, N.A7]
    for (let i = 0; i < 6; i += 1) {
      const f = scintille[Math.floor(Math.random() * scintille.length)]
      campanello(u, accordo + 0.1 + i * 0.075, f, 0.035 * v, { eco: 0.6, durata: 0.4 })
    }
  },

  sconfitta: (u, t, v) => {
    marimba(u, t, N.G4, 0.26 * v, { durata: 0.8 })
    marimba(u, t + 0.2, N.Eb4, 0.26 * v, { durata: 0.9 })
    marimba(u, t + 0.4, N.C4, 0.3 * v, { durata: 1.2 })
    tonfo(u, t + 0.4, 0.08 * v, { da: 80, a: 45, durata: 0.4 })
  },

  pareggio: (u, t, v) => {
    marimba(u, t, N.C5, 0.26 * v)
    marimba(u, t + 0.12, N.G5, 0.24 * v)
    marimba(u, t + 0.24, N.C5, 0.2 * v, { durata: 0.9 })
  },

  entra: (u, t, v) => {
    campanello(u, t, N.G5, 0.2 * v)
    campanello(u, t + 0.11, N.C6, 0.22 * v)
  },

  esce: (u, t, v) => {
    campanello(u, t, N.C6, 0.17 * v)
    campanello(u, t + 0.12, N.G5, 0.17 * v)
  },

  invito: (u, t, v) => {
    marimba(u, t, N.C5, 0.12 * v)
    campanello(u, t, N.E6, 0.15 * v)
    campanello(u, t + 0.07, N.G6, 0.15 * v)
    campanello(u, t + 0.14, N.C7, 0.17 * v, { durata: 1.2 })
  },

  punto: (u, t, v) => {
    marimba(u, t, N.C6, 0.28 * v)
    marimba(u, t + 0.06, N.E6, 0.3 * v)
    campanello(u, t + 0.12, N.G6, 0.1 * v, { durata: 0.7 })
  },

  puntoAltro: (u, t, v) => {
    marimba(u, t, N.E4, 0.24 * v, { durata: 0.5, eco: 0.1 })
    marimba(u, t + 0.09, N.C4, 0.22 * v, { durata: 0.6, eco: 0.1 })
  },

  rallenty: (u, t, v) => {
    scivolo(u, t, 900, 170, 0.85, 0.13 * v)
    soffio(u, t, 0.85, 0.1 * v, { tipo: 'bandpass', da: 3200, a: 280, q: 1.4 }, { attacco: 0.05, eco: 0.3 })
    tonfo(u, t + 0.7, 0.1 * v, { da: 80, a: 40, durata: 0.35 })
  },

  acqua: (u, t, v) => {
    soffio(u, t, 0.45, 0.6 * v, { tipo: 'bandpass', da: 1500, a: 450, q: 0.9 }, { attacco: 0.004, eco: 0.2 })
    for (let i = 0; i < 3; i += 1) goccia(u, t + 0.09 + i * 0.07, vario(800, 0.3), 0.15 * v)
  },

  colpito: (u, t, v) => {
    soffio(u, t, 0.55, 0.55 * v, { tipo: 'lowpass', da: 3000, a: 220, q: 0.7 }, { attacco: 0.002, eco: 0.18 })
    tonfo(u, t, 0.5 * v, { da: 110, a: 40, durata: 0.45 })
    soffio(u, t + 0.05, 0.08, 0.14 * v, { tipo: 'highpass', da: 3000, a: 2000 }, { attacco: 0.002, eco: 0 })
    soffio(u, t + 0.13, 0.06, 0.1 * v, { tipo: 'highpass', da: 3500, a: 2500 }, { attacco: 0.002, eco: 0 })
  },

  affondato: (u, t, v) => {
    soffio(u, t, 1, 0.6 * v, { tipo: 'lowpass', da: 2400, a: 140, q: 0.7 }, { attacco: 0.002, eco: 0.25 })
    tonfo(u, t, 0.55 * v, { da: 100, a: 32, durata: 0.8 })
    soffio(u, t + 0.1, 1.4, 0.24 * v, { tipo: 'lowpass', da: 200, a: 90, q: 0.5 }, { attacco: 0.12, eco: 0.2 })
    // La nave che va giu': bolle che salgono, e due note che scendono.
    for (let i = 0; i < 6; i += 1) goccia(u, t + 0.45 + i * 0.13 + Math.random() * 0.05, vario(420, 0.35), 0.06 * v)
    marimba(u, t + 0.5, N.C4, 0.12 * v, { durata: 1 })
    marimba(u, t + 0.78, N.G3, 0.12 * v, { durata: 1.2 })
  },

  scarabeo: (u, t, v) => {
    marimba(u, t, N.C5, 0.16 * v, { eco: 0.3 })
    marimba(u, t, N.E5, 0.16 * v, { eco: 0.3 })
    marimba(u, t, N.G5, 0.16 * v, { eco: 0.3 })
    ;[N.C6, N.E6, N.G6, N.C7, N.E7].forEach((f, i) =>
      campanello(u, t + 0.06 + i * 0.05, f, 0.12 * v, { eco: 0.45, durata: 0.9 }),
    )
  },

  svela: (u, t, v) => {
    ;[N.C6, N.D6, N.E6, N.G6, N.A6].forEach((f, i) =>
      campanello(u, t + i * 0.035, f, 0.08 * v, { eco: 0.45, durata: 0.6 }),
    )
  },

  assente: (u, t, v) => legno(u, t, vario(620, 0.02), 0.14 * v),

  presente: (u, t, v) => {
    legno(u, t, 700, 0.1 * v)
    marimba(u, t, N.A5, 0.12 * v, { durata: 0.4 })
  },

  esatta: (u, t, v) => {
    legno(u, t, 760, 0.1 * v)
    marimba(u, t, N.E6, 0.14 * v, { durata: 0.5 })
  },

  // La lancetta di plastica contro il piolo: piu' secca e piu' alta di un tocco.
  scatto: (u, t, v) => {
    legno(u, t, vario(2300, 0.05), 0.08 * v, 0.02)
    colpo(u, t, voce(u, 0.06 * v, 0), vario(5200, 0.08), 0.008, 0.6)
  },

  // Il fruscio della ruota che parte: rumore che sale, e il legno del mozzo.
  lancio: (u, t, v) => {
    soffio(u, t, 0.42, 0.26 * v, { tipo: 'bandpass', da: 350, a: 2600, q: 1.1 }, { attacco: 0.04, eco: 0.15 })
    legno(u, t, 420, 0.12 * v)
  },

  // Il campanello del banco della fiera, tre volte, sopra un accordo: c'e' un minigioco.
  bonus: (u, t, v) => {
    ;[N.G6, N.E6, N.G6, N.E6, N.C7].forEach((f, i) =>
      campanello(u, t + i * 0.075, f, 0.11 * v, { eco: 0.35, durata: 0.5 }),
    )
    marimba(u, t, N.C5, 0.2 * v, { eco: 0.3 })
    marimba(u, t + 0.3, N.G5, 0.22 * v, { eco: 0.3 })
    marimba(u, t + 0.3, N.C6, 0.2 * v, { eco: 0.3, durata: 1.2 })
  },

  // Vince il banco: la tromba che scende, e il colpo sul fondo.
  banco: (u, t, v) => {
    scivolo(u, t, 520, 360, 0.26, 0.12 * v)
    scivolo(u, t + 0.28, 470, 300, 0.26, 0.12 * v)
    scivolo(u, t + 0.56, 420, 160, 0.7, 0.13 * v)
    tonfo(u, t + 0.56, 0.14 * v, { da: 90, a: 40, durata: 0.45 })
  },

  // Il moltiplicatore: un arpeggio che sale veloce e si apre in un accordo che luccica.
  moltiplicatore: (u, t, v) => {
    ;[N.C5, N.E5, N.G5, N.C6, N.E6, N.G6].forEach((f, i) => marimba(u, t + i * 0.05, f, 0.2 * v, { eco: 0.28 }))
    const accordo = t + 0.32
    campanello(u, accordo, N.C7, 0.12 * v, { eco: 0.5, durata: 1.2 })
    campanello(u, accordo, N.E7, 0.09 * v, { eco: 0.5, durata: 1.2 })
    campanello(u, accordo + 0.05, N.G7, 0.07 * v, { eco: 0.5, durata: 1 })
  },

  // La moneta che parte dal pollice: il soffio, e il metallo che vibra.
  monetaLancio: (u, t, v) => {
    soffio(u, t, 0.3, 0.2 * v, { tipo: 'highpass', da: 1800, a: 5200, q: 0.7 }, { attacco: 0.01, eco: 0.1 })
    campanello(u, t, vario(N.A7), 0.06 * v, { eco: 0.25, durata: 0.5 })
  },

  // La moneta che tocca terra e rimbalza: due tintinnii, il secondo piu' piccolo.
  monetaCade: (u, t, v) => {
    campanello(u, t, vario(N.E7), 0.12 * v, { eco: 0.2, durata: 0.35 })
    legno(u, t, 900, 0.14 * v)
    campanello(u, t + 0.13, vario(N.G7), 0.06 * v, { eco: 0.2, durata: 0.25 })
    legno(u, t + 0.13, 1100, 0.06 * v)
  },

  // La vincita: la fanfara della vittoria, e una pioggia di monete che tintinnano.
  vincita: (u, t, v) => {
    ;[N.C5, N.E5, N.G5, N.C6].forEach((f, i) => marimba(u, t + i * 0.07, f, 0.26 * v, { eco: 0.25 }))
    const accordo = t + 0.3
    campanello(u, accordo, N.C6, 0.15 * v, { eco: 0.4, durata: 1.3 })
    campanello(u, accordo, N.E6, 0.12 * v, { eco: 0.4, durata: 1.3 })
    campanello(u, accordo, N.G6, 0.1 * v, { eco: 0.4, durata: 1.3 })
    const monete = [N.E7, N.G7, N.A7, N.D7, N.C7]
    for (let i = 0; i < 14; i += 1) {
      const f = monete[Math.floor(Math.random() * monete.length)]
      campanello(u, accordo + 0.08 + i * 0.055 + Math.random() * 0.03, vario(f), 0.04 * v, { eco: 0.4, durata: 0.3 })
    }
  },

  // Le fiches che si posano una sull'altra: tre colpi secchi di plastica, sempre piu' vicini.
  fiche: (u, t, v) => {
    ;[0, 0.055, 0.095].forEach((d, i) => {
      legno(u, t + d, vario(1650 + i * 140, 0.04), (0.13 - i * 0.025) * v, 0.012)
      colpo(u, t + d, voce(u, 0.035 * v, 0), vario(4200, 0.1), 0.006, 0.5)
    })
  },

  // Una moneta che cade sulle altre: un tintinnio corto, ogni volta un po' diverso.
  incasso: (u, t, v) => {
    campanello(u, t, vario(N.C7, 0.04), 0.06 * v, { eco: 0.2, durata: 0.22 })
    legno(u, t, vario(1300, 0.06), 0.05 * v, 0.01)
  },

  // Fra una scena e l'altra: un soffio che passa, e un accordo d'apertura.
  intermezzo: (u, t, v) => {
    soffio(u, t, 0.5, 0.22 * v, { tipo: 'bandpass', da: 600, a: 4200, q: 0.9 }, { attacco: 0.12, eco: 0.25 })
    marimba(u, t + 0.32, N.G5, 0.16 * v, { eco: 0.3 })
    marimba(u, t + 0.32, N.C6, 0.18 * v, { eco: 0.3, durata: 1.1 })
    campanello(u, t + 0.32, N.E7, 0.06 * v, { eco: 0.5, durata: 0.9 })
  },
}
