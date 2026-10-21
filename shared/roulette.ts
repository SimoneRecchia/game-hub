/**
 * La roulette, quella europea dei casinò: trentasette numeri, dallo 0 al 36,
 * con uno zero solo. Si punta su un numero o su un gruppo di numeri, e una
 * puntata che esce paga quanto manca a fare 36 volte la puntata divisa per i
 * numeri coperti (`36 / n`, puntata compresa): il pieno 35 a 1, il cavallo 17,
 * la terzina 11, il carré 8, la sestina 5, la colonna e la dozzina 2, le
 * chances semplici (rosso e nero, pari e dispari, 1–18 e 19–36) 1 a 1.
 *
 * Lo zero non e' rosso ne' nero, ne' pari ne' dispari: quando esce perdono
 * tutte le puntate che non lo comprendono, anche le chances semplici. E' la
 * regola della roulette europea senza la "partage" dei tavoli francesi, che
 * restituisce meta' delle chances semplici: cosi' ogni puntata rende lo
 * stesso, 36 su 37, il 97,3% (`resaRoulette`), come gli altri giochi della
 * Fortuna, e nessuna conviene piu' delle altre.
 *
 * Il panno ha i numeri in tre colonne e dodici righe, con lo zero in cima: le
 * puntate interne si leggono da li' (`PUNTATE`), e sono tutte e sole quelle che
 * un croupier accetta — due numeri vicini sul panno, una riga, quattro numeri
 * attorno a un incrocio, due righe — piu' quelle con lo zero: i cavalli 0-1,
 * 0-2 e 0-3, le terzine 0-1-2 e 0-2-3 e il carré dei primi quattro.
 */

export const NOME_ROULETTE = 'Roulette'
export const PUNTATA_MINIMA_RL = 1

/** L'ordine dei numeri sulla ruota europea, in senso orario dallo zero. */
export const RUOTA_ROULETTE: readonly number[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
  28, 12, 35, 3, 26,
]

export const ROSSI: ReadonlySet<number> = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

export type ColoreRL = 'verde' | 'rosso' | 'nero'

export function coloreDi(n: number): ColoreRL {
  if (n === 0) return 'verde'
  return ROSSI.has(n) ? 'rosso' : 'nero'
}

/** La riga del panno, da 1 (1, 2, 3) a 12 (34, 35, 36), e la colonna, da 1 a 3. */
export const rigaDi = (n: number) => Math.ceil(n / 3)
export const colonnaDi = (n: number) => ((n - 1) % 3) + 1

export type TipoPuntataRL =
  | 'pieno'
  | 'cavallo'
  | 'terzina'
  | 'carre'
  | 'sestina'
  | 'colonna'
  | 'dozzina'
  | 'semplice'

/** I nomi delle puntate esterne, come li scrive il panno. */
export const ESTERNE = [
  'colonna1',
  'colonna2',
  'colonna3',
  'dozzina1',
  'dozzina2',
  'dozzina3',
  'manque',
  'passe',
  'pari',
  'dispari',
  'rosso',
  'nero',
] as const
export type PuntataEsterna = (typeof ESTERNE)[number]

const intervallo = (da: number, a: number) => Array.from({ length: a - da + 1 }, (_, k) => da + k)

/** La chiave di una puntata interna: i numeri coperti, in ordine, con il trattino. */
export const chiaveDi = (numeri: readonly number[]) => [...numeri].sort((a, b) => a - b).join('-')

function tutteLePuntate(): Map<string, readonly number[]> {
  const p = new Map<string, readonly number[]>()
  const aggiungi = (numeri: number[]) => p.set(chiaveDi(numeri), [...numeri].sort((a, b) => a - b))
  for (let n = 0; n <= 36; n += 1) aggiungi([n])
  for (let n = 1; n <= 36; n += 1) {
    if (colonnaDi(n) < 3) aggiungi([n, n + 1])
    if (rigaDi(n) < 12) aggiungi([n, n + 3])
    if (colonnaDi(n) < 3 && rigaDi(n) < 12) aggiungi([n, n + 1, n + 3, n + 4])
  }
  aggiungi([0, 1])
  aggiungi([0, 2])
  aggiungi([0, 3])
  for (let r = 1; r <= 12; r += 1) aggiungi(intervallo(3 * r - 2, 3 * r))
  aggiungi([0, 1, 2])
  aggiungi([0, 2, 3])
  aggiungi([0, 1, 2, 3])
  for (let r = 1; r < 12; r += 1) aggiungi(intervallo(3 * r - 2, 3 * r + 3))
  const numeri = intervallo(1, 36)
  for (let c = 1; c <= 3; c += 1) p.set(`colonna${c}`, numeri.filter((n) => colonnaDi(n) === c))
  for (let d = 1; d <= 3; d += 1) p.set(`dozzina${d}`, intervallo(12 * d - 11, 12 * d))
  p.set('manque', intervallo(1, 18))
  p.set('passe', intervallo(19, 36))
  p.set('pari', numeri.filter((n) => n % 2 === 0))
  p.set('dispari', numeri.filter((n) => n % 2 === 1))
  p.set('rosso', numeri.filter((n) => ROSSI.has(n)))
  p.set('nero', numeri.filter((n) => !ROSSI.has(n)))
  return p
}

/** Tutte le puntate che il panno accetta, con i numeri che coprono: 157. */
export const PUNTATE: ReadonlyMap<string, readonly number[]> = tutteLePuntate()

export function tipoDi(chiave: string): TipoPuntataRL {
  if (chiave.startsWith('colonna')) return 'colonna'
  if (chiave.startsWith('dozzina')) return 'dozzina'
  const numeri = PUNTATE.get(chiave)
  if (!numeri) throw new Error(`puntata sconosciuta: ${chiave}`)
  const tipi: Record<number, TipoPuntataRL> = { 1: 'pieno', 2: 'cavallo', 3: 'terzina', 4: 'carre', 6: 'sestina' }
  return tipi[numeri.length] ?? 'semplice'
}

/** Quante volte una puntata vincente torna, puntata compresa: 36 diviso i numeri coperti. */
export const ritornoDi = (chiave: string) => 36 / PUNTATE.get(chiave)!.length

/** Il pagamento di una puntata, come lo dice il panno: "35 a 1". */
export const pagaDi = (chiave: string) => ritornoDi(chiave) - 1

/** Le puntate di un giocatore in un giro: la chiave della puntata e i punti che ci ha messo. */
export type PuntateRL = Record<string, number>

export const totaleDi = (p: PuntateRL) => Object.values(p).reduce((s, v) => s + v, 0)

/** Quel che torna a chi ha puntato `p` quando esce `numero`: le puntate vincenti con la loro vincita. */
export function vincitaDi(p: PuntateRL, numero: number): number {
  let v = 0
  for (const [chiave, quanto] of Object.entries(p)) {
    if (PUNTATE.get(chiave)?.includes(numero)) v += quanto * ritornoDi(chiave)
  }
  return v
}

/** Quel che un giro da' o toglie: la vincita meno quel che si e' messo sul panno. */
export const deltaDi = (p: PuntateRL, numero: number) => vincitaDi(p, numero) - totaleDi(p)

/** Le puntate che vincono con `numero`: quelle che il croupier lascia sul panno e paga. */
export const vincenti = (p: PuntateRL, numero: number) =>
  Object.keys(p).filter((chiave) => PUNTATE.get(chiave)?.includes(numero))

/**
 * Le puntate che arrivano dal telefono, controllate: chiavi del panno, punti
 * interi da `PUNTATA_MINIMA_RL` in su. Null se qualcosa non va.
 */
export function leggiPuntate(x: unknown): PuntateRL | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null
  const p: PuntateRL = {}
  for (const [chiave, quanto] of Object.entries(x)) {
    if (!PUNTATE.has(chiave)) return null
    if (!Number.isSafeInteger(quanto) || (quanto as number) < PUNTATA_MINIMA_RL) return null
    p[chiave] = quanto as number
  }
  return p
}

/** Un numero a caso fra i trentasette: `caso(n)` da' un intero da 0 a n-1, uniforme. */
export const numeroACaso = (caso: (n: number) => number) => caso(37)

/**
 * La resa della roulette: quel che torna in media di una puntata, esatta, su
 * ognuna delle 157 che il panno accetta. E' la stessa per tutte: 36/37.
 */
export function resaRoulette(chiave = 'rosso'): number {
  let ritorno = 0
  for (let n = 0; n <= 36; n += 1) ritorno += vincitaDi({ [chiave]: 1 }, n)
  return ritorno / 37
}

/** Il nome di una puntata per chi legge: "Pieno 17", "Cavallo 17-20", "Rosso". */
export function nomeDi(chiave: string): string {
  const tipo = tipoDi(chiave)
  if (tipo === 'colonna') return `Colonna ${chiave.slice(-1)}`
  if (tipo === 'dozzina') return ['Prima', 'Seconda', 'Terza'][Number(chiave.slice(-1)) - 1] + ' dozzina'
  if (tipo === 'semplice') {
    return { manque: '1–18', passe: '19–36', pari: 'Pari', dispari: 'Dispari', rosso: 'Rosso', nero: 'Nero' }[
      chiave as 'manque'
    ]
  }
  const nome = { pieno: 'Pieno', cavallo: 'Cavallo', terzina: 'Terzina', carre: 'Carré', sestina: 'Sestina' }[tipo]
  return `${nome} ${chiave}`
}
