/**
 * Indovina chi: i personaggi, le regole di una partita, e cosa si puo' dire.
 *
 * Le regole sono quelle del gioco da tavolo. Ognuno ha davanti gli stessi
 * personaggi e ne ha uno segreto, pescato a caso. A turno si fa una domanda a
 * cui l'altro risponde sì o no, e si abbassano le facce che la risposta
 * esclude; quando si pensa di sapere chi e', invece di chiedere si prova a
 * indovinare. Chi indovina vince; **chi sbaglia perde**, come sulla scatola:
 * senza, tirare a indovinare a ogni turno costerebbe niente.
 *
 * I personaggi sono di due tipi. I set predefiniti — persone e animali — sono
 * immagini prese da servizi pubblici (DiceBear e le Fluent Emoji su jsDelivr)
 * che il browser scarica da solo: il server non le vede mai. I set propri li fa
 * chi gioca, con le sue foto o anche solo con i nomi — i colleghi, i calciatori,
 * i personaggi di una serie — e restano nel suo telefono: al server arrivano
 * solo i nomi e l'impronta di ogni foto che c'e', e le foto passano da un
 * telefono all'altro (vedi src/games/indovina/trasferimento.ts). Un personaggio
 * senza foto e' una carta colorata con il suo nome in grande.
 */

export type Lato = 'a' | 'b'

/** Sì, no, o non si capisce: con le foto vere capita, e "no" sarebbe una bugia. */
export type Risposta = 'si' | 'no' | 'forse'

export const RISPOSTE: readonly Risposta[] = ['si', 'no', 'forse']

export const NOMI_RISPOSTE: Record<Risposta, string> = { si: 'Sì', no: 'No', forse: 'Non so' }

/** Quanti personaggi in un set proprio: meno di sei non e' una partita, piu' di trenta non stanno in uno schermo. */
export const VOCI_MINIME = 6
export const VOCI_MASSIME = 30
export const NOME_MASSIMO = 20
export const NOME_SET_MASSIMO = 24
export const DOMANDA_MASSIMA = 120

/** L'impronta di un'immagine propria: i primi 32 caratteri esadecimali del suo SHA-256. */
export const IMPRONTA = /^[0-9a-f]{32}$/

export type SetPredefinito = 'persone' | 'animali'
export const SET_PREDEFINITI: readonly SetPredefinito[] = ['persone', 'animali']

export interface Voce {
  nome: string
  /** Solo nei set propri, e solo se ha una foto: la sua impronta, che ognuno cerca nel suo telefono. */
  img?: string
}

export interface Personaggi {
  set: SetPredefinito | 'mio'
  nome: string
  voci: Voce[]
}

/* ─────────────────────────────  Le persone  ───────────────────────────── */

/**
 * Le persone sono gli Avataaars di Pablo Stanley, disegnati da DiceBear a
 * partire da questi parametri. Ogni tratto e' scritto e non lasciato al caso
 * del seme, perché le domande funzionino: occhiali, cappelli, barbe, colore dei
 * capelli e della pelle sono distribuiti in modo che ogni domanda ne escluda
 * una parte e non tutti.
 */
const DICEBEAR = 'https://api.dicebear.com/9.x/avataaars/svg'

const SFONDI = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'c1f4c5']

type Parametri = Record<string, string>

const BASE: Parametri = {
  eyes: 'default',
  eyebrows: 'defaultNatural',
  mouth: 'smile',
  accessoriesProbability: '0',
  facialHairProbability: '0',
}

const occhiali = (tipo: string): Parametri => ({ accessories: tipo, accessoriesColor: '262e33', accessoriesProbability: '100' })
const barba = (tipo: string, colore: string): Parametri => ({
  facialHair: tipo,
  facialHairColor: colore,
  facialHairProbability: '100',
})

const NERI = '2c1b18'
const CASTANI = '724133'
const BIONDI = 'd6b370'
const ROSSI = 'c93305'
const BIANCHI = 'e8e1e1'

export const PERSONE: readonly { nome: string; parametri: Parametri }[] = (
  [
    ['Anna', { top: 'straight01', hairColor: BIONDI, skinColor: 'ffdbb4', clothing: 'blazerAndShirt', clothesColor: '5199e4' }],
    ['Bianca', { top: 'bob', hairColor: NERI, skinColor: 'edb98a', clothing: 'shirtScoopNeck', clothesColor: 'ff488e', ...occhiali('prescription02'), mouth: 'default' }],
    ['Chiara', { top: 'curly', hairColor: ROSSI, skinColor: 'ffdbb4', clothing: 'hoodie', clothesColor: 'a7ffc4' }],
    ['Dalia', { top: 'fro', hairColor: NERI, skinColor: '614335', clothing: 'shirtVNeck', clothesColor: 'ffffb1', mouth: 'twinkle' }],
    ['Elena', { top: 'bun', hairColor: CASTANI, skinColor: 'd08b5b', clothing: 'collarAndSweater', clothesColor: '65c9ff', ...occhiali('wayfarers') }],
    ['Fiore', { top: 'longButNotTooLong', hairColor: 'f59797', skinColor: 'ffdbb4', clothing: 'overall', clothesColor: '25557c', eyes: 'happy' }],
    ['Greta', { top: 'hijab', hatColor: '5199e4', skinColor: 'ae5d29', clothing: 'shirtCrewNeck', clothesColor: 'e6e6e6' }],
    ['Irene', { top: 'straightAndStrand', hairColor: 'ecdcbf', skinColor: 'ffdbb4', clothing: 'blazerAndSweater', clothesColor: '262e33', ...occhiali('sunglasses') }],
    ['Lara', { top: 'miaWallace', hairColor: NERI, skinColor: 'edb98a', clothing: 'shirtScoopNeck', clothesColor: 'ff5c5c', mouth: 'serious' }],
    ['Marta', { top: 'winterHat02', hatColor: 'ff5c5c', skinColor: 'd08b5b', clothing: 'hoodie', clothesColor: '929598' }],
    ['Nina', { top: 'frida', hairColor: '4a312c', skinColor: 'ae5d29', clothing: 'shirtVNeck', clothesColor: 'b1e2ff', ...occhiali('round') }],
    ['Olga', { top: 'bigHair', hairColor: BIANCHI, skinColor: 'ffdbb4', clothing: 'collarAndSweater', clothesColor: 'ffafb9', ...occhiali('prescription01') }],
    ['Paolo', { top: 'shortFlat', hairColor: NERI, skinColor: 'edb98a', clothing: 'shirtCrewNeck', clothesColor: '3c4f5c', ...barba('beardMedium', NERI), mouth: 'default' }],
    ['Remo', { top: 'theCaesar', hairColor: CASTANI, skinColor: '614335', clothing: 'blazerAndShirt', clothesColor: 'e6e6e6' }],
    ['Sergio', { topProbability: '0', skinColor: 'd08b5b', clothing: 'blazerAndSweater', clothesColor: '25557c', ...barba('moustacheMagnum', '4a312c'), mouth: 'default' }],
    ['Tino', { top: 'shortCurly', hairColor: ROSSI, skinColor: 'ffdbb4', clothing: 'graphicShirt', clothingGraphic: 'pizza', clothesColor: 'ffffb1', ...barba('beardLight', ROSSI) }],
    ['Ugo', { top: 'sides', hairColor: BIANCHI, skinColor: 'ffdbb4', clothing: 'collarAndSweater', clothesColor: 'a7ffc4', ...occhiali('prescription02'), ...barba('moustacheFancy', BIANCHI), mouth: 'default' }],
    ['Vito', { top: 'hat', hatColor: '262e33', skinColor: 'ae5d29', clothing: 'shirtVNeck', clothesColor: 'ff5c5c', ...barba('beardMajestic', NERI), mouth: 'default' }],
    ['Zeno', { top: 'shortWaved', hairColor: 'b58143', skinColor: 'ffdbb4', clothing: 'hoodie', clothesColor: '5199e4', ...occhiali('wayfarers') }],
    ['Bruno', { top: 'turban', hatColor: 'ffffb1', skinColor: 'ae5d29', clothing: 'shirtCrewNeck', clothesColor: '65c9ff', ...barba('beardMedium', NERI), mouth: 'default' }],
    ['Carlo', { top: 'shaggyMullet', hairColor: 'a55728', skinColor: 'edb98a', clothing: 'overall', clothesColor: 'ff488e' }],
    ['Dario', { top: 'dreads01', hairColor: NERI, skinColor: '614335', clothing: 'graphicShirt', clothingGraphic: 'diamond', clothesColor: '929598', ...occhiali('round'), eyes: 'happy' }],
    ['Enzo', { top: 'shortRound', hairColor: BIANCHI, skinColor: 'edb98a', clothing: 'blazerAndShirt', clothesColor: '3c4f5c', ...barba('beardLight', BIANCHI), mouth: 'default' }],
    ['Franco', { top: 'winterHat1', hatColor: '5199e4', skinColor: 'ffdbb4', clothing: 'shirtScoopNeck', clothesColor: 'ffdeb5', ...occhiali('prescription01') }],
  ] as const
).map(([nome, tratti], i) => ({
  nome,
  parametri: { seed: nome, ...BASE, backgroundColor: SFONDI[i % SFONDI.length], ...tratti },
}))

/* ─────────────────────────────  Gli animali  ───────────────────────────── */

/**
 * Gli animali sono le Fluent Emoji di Microsoft (licenza MIT), dalla versione
 * piatta, servite da jsDelivr a un commit fisso: un'immagine non cambia sotto
 * i piedi di una partita.
 */
const FLUENT = 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@1ffb34c752ecf5d402f04cfb4b392c77f57c54bc/assets'

export const ANIMALI: readonly { nome: string; emoji: string }[] = (
  [
    ['Cane', 'Dog face'],
    ['Gatto', 'Cat face'],
    ['Topo', 'Mouse face'],
    ['Criceto', 'Hamster'],
    ['Coniglio', 'Rabbit face'],
    ['Volpe', 'Fox'],
    ['Orso', 'Bear'],
    ['Orso polare', 'Polar bear'],
    ['Panda', 'Panda'],
    ['Koala', 'Koala'],
    ['Tigre', 'Tiger face'],
    ['Leone', 'Lion'],
    ['Mucca', 'Cow face'],
    ['Maiale', 'Pig face'],
    ['Rana', 'Frog'],
    ['Scimmia', 'Monkey face'],
    ['Gallina', 'Chicken'],
    ['Pinguino', 'Penguin'],
    ['Gufo', 'Owl'],
    ['Lupo', 'Wolf'],
    ['Cavallo', 'Horse face'],
    ['Unicorno', 'Unicorn'],
    ['Zebra', 'Zebra'],
    ['Procione', 'Raccoon'],
  ] as const
).map(([nome, emoji]) => ({ nome, emoji }))

export const NOMI_SET: Record<SetPredefinito, string> = { persone: 'Persone', animali: 'Animali' }

/**
 * Il fondo della carta di un personaggio senza foto: dodici colori chiari, a
 * giro nell'ordine del set, cosi' due carte vicine non hanno mai lo stesso — col
 * colore dal nome, Marco e Martina venivano dello stesso lilla — e i due
 * telefoni, che hanno il set nello stesso ordine, li vedono uguali. Sono chiari
 * in tutti e due i temi, e quel che ci sta sopra e' scuro (`ic-faccia--nome`).
 */
export function coloreDelPersonaggio(k: number): string {
  return `#${COLORI_NOMI[((k % COLORI_NOMI.length) + COLORI_NOMI.length) % COLORI_NOMI.length]}`
}

/** I colori delle carte senza foto: quelli dei set, mescolati a sei in piu', perché un set di trenta non si ripeta troppo. */
const COLORI_NOMI = ['b6e3f4', 'ffd5dc', 'c1f4c5', 'ffe8a3', 'c0aede', 'ffdfbf', 'bfe9f2', 'f9c6c9', 'd7f2b8', 'e2d4f7', 'd1d4f9', 'ffd0e8']

/** I personaggi di un set predefinito, come si salvano nella partita. */
export function personaggiPredefiniti(set: SetPredefinito): Personaggi {
  const voci = set === 'persone' ? PERSONE : ANIMALI
  return { set, nome: NOMI_SET[set], voci: voci.map((v) => ({ nome: v.nome })) }
}

/**
 * Il fondo della carta di un personaggio predefinito: le persone ce l'hanno
 * nell'immagine, gli animali sono emoji trasparenti e prendono gli stessi
 * colori, a giro.
 */
export function sfondoPredefinito(set: SetPredefinito, nome: string): string | null {
  if (set === 'persone') return null
  const i = ANIMALI.findIndex((v) => v.nome === nome)
  return i < 0 ? null : `#${SFONDI[i % SFONDI.length]}`
}

/** L'indirizzo dell'immagine di un personaggio predefinito, dal nome: null se il set non lo conosce. */
export function immaginePredefinita(set: SetPredefinito, nome: string): string | null {
  if (set === 'persone') {
    const p = PERSONE.find((v) => v.nome === nome)
    return p ? `${DICEBEAR}?${new URLSearchParams(p.parametri)}` : null
  }
  const a = ANIMALI.find((v) => v.nome === nome)
  if (!a) return null
  return `${FLUENT}/${encodeURIComponent(a.emoji)}/Flat/${a.emoji.toLowerCase().replace(/ /g, '_')}_flat.svg`
}

/* ─────────────────────────────  Da fuori  ───────────────────────────── */

/** Un nome come lo si mostra: senza spazi in piu', e non piu' lungo del massimo. */
export function pulisciNome(testo: unknown, massimo = NOME_MASSIMO): string {
  if (typeof testo !== 'string') return ''
  return testo.replace(/\s+/g, ' ').trim().slice(0, massimo)
}

/**
 * I personaggi scelti da chi invita, controllati: un set predefinito si
 * riconosce dal nome e si ricostruisce da qui; un set proprio deve avere da sei
 * a trenta personaggi, ognuno con un nome diverso, e chi ha una foto la sua
 * impronta. La foto non e' obbligatoria: un set puo' essere di soli nomi, o
 * avere le foto solo di alcuni.
 */
export function leggiPersonaggi(valore: unknown): Personaggi | null {
  if (!valore || typeof valore !== 'object') return null
  const v = valore as { set?: unknown; nome?: unknown; voci?: unknown }
  if (typeof v.set === 'string' && (SET_PREDEFINITI as readonly string[]).includes(v.set)) {
    return personaggiPredefiniti(v.set as SetPredefinito)
  }
  if (v.set !== 'mio' || !Array.isArray(v.voci)) return null
  if (v.voci.length < VOCI_MINIME || v.voci.length > VOCI_MASSIME) return null
  const nome = pulisciNome(v.nome, NOME_SET_MASSIMO)
  if (!nome) return null
  const visti = new Set<string>()
  const voci: Voce[] = []
  for (const grezza of v.voci as unknown[]) {
    const g = (grezza ?? {}) as { nome?: unknown; img?: unknown }
    const n = pulisciNome(g.nome)
    if (!n || visti.has(n.toLowerCase())) return null
    if (g.img !== undefined && g.img !== null && (typeof g.img !== 'string' || !IMPRONTA.test(g.img))) return null
    visti.add(n.toLowerCase())
    voci.push(typeof g.img === 'string' ? { nome: n, img: g.img } : { nome: n })
  }
  return { set: 'mio', nome, voci }
}

/** Una domanda come la si manda: una riga, non vuota, non troppo lunga. */
export function pulisciDomanda(testo: unknown): string {
  return pulisciNome(testo, DOMANDA_MASSIMA)
}

/** Le facce abbassate di un tabellone: indici diversi, dentro il set, in ordine. */
export function leggiAbbassate(valore: unknown, quante: number): number[] | null {
  if (!Array.isArray(valore) || valore.length > quante) return null
  const insieme = new Set<number>()
  for (const k of valore) {
    if (!Number.isInteger(k) || k < 0 || k >= quante) return null
    insieme.add(k)
  }
  return [...insieme].sort((x, y) => x - y)
}

/* ─────────────────────────────  La partita  ───────────────────────────── */

/**
 * Le mosse, in ordine: una domanda, la sua risposta, un tentativo. La verita'
 * di una partita sono queste, come le mosse dello Scarabeo e i colpi della
 * battaglia: di chi e' il turno e se c'e' una domanda in sospeso si ricavano da
 * qui (il turno e' anche in colonna, perché il server lo condiziona).
 */
export type Mossa =
  | { t: 'd'; da: Lato; testo: string; at: string }
  | { t: 'r'; da: Lato; r: Risposta; at: string }
  | { t: 'i'; da: Lato; k: number; ok: boolean; at: string }

export function altroLato(lato: Lato): Lato {
  return lato === 'a' ? 'b' : 'a'
}

/** La domanda che aspetta risposta, se l'ultima mossa e' una domanda. */
export function domandaInSospeso(mosse: readonly Mossa[]): Extract<Mossa, { t: 'd' }> | null {
  const ultima = mosse.at(-1)
  return ultima?.t === 'd' ? ultima : null
}

/** Quante domande ha fatto un lato: e' il conto che si mostra a fine partita. */
export function domandeDi(mosse: readonly Mossa[], lato: Lato): number {
  return mosse.filter((m) => m.t === 'd' && m.da === lato).length
}
