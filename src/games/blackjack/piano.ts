/**
 * Il piano del tavolo: quando arriva ogni carta nuova, e quando si vedono gli
 * esiti. Il server risponde con il tavolo com'e' dopo — tutte le carte del
 * giro, magari anche quelle del banco — e qui si decide in che ordine farle
 * arrivare: la distribuzione come al tavolo vero (una a testa dalla sinistra
 * del banco, la sua, la seconda a testa), le carte chieste una alla volta, e
 * quelle del banco alla fine, piu' lente, per la suspense.
 *
 * Una carta e' nuova se la sua chiave non e' fra quelle gia' viste: il giro, il
 * posto, la mano e il posto nella mano. Le mani hanno un nome (`id`) che non
 * cambia quando una divisione sposta le altre, quindi una carta gia' vista
 * resta la stessa carta.
 */

import { CARTA_MS, FINE_CARTA_MS } from '@shared/blackjack-tavolo'
import type { VistaTavoloBJ } from '@shared/types'

export const VOLO_CARTA_MS = 460
/** Prima della prima carta del banco, un respiro: e' il momento della suspense. */
const RESPIRO_BANCO_MS = 350

export interface ArrivoCarta {
  ritardo: number
  da: 'sabot' | 'divisa'
}

export interface PianoBJ {
  arrivi: Map<string, ArrivoCarta>
  /** Fra quanto tutte le carte nuove sono arrivate. */
  fine: number
}

export const chiaveCarta = (giro: number, posto: number, mano: number, i: number) => `${giro}:${posto}:${mano}:${i}`
export const chiaveBanco = (giro: number, i: number) => `${giro}:b:${i}`

interface CartaNelTavolo {
  chiave: string
  posto: number
  /** L'ordine della mano nel posto. */
  ordine: number
  indice: number
  divisa: boolean
}

/** Tutte le chiavi delle carte del tavolo: per segnarle viste senza farle volare, alla prima lettura. */
export function chiaviDi(v: VistaTavoloBJ): string[] {
  const chiavi = v.banco.map((_, i) => chiaveBanco(v.giro, i))
  v.posti.forEach((p, k) =>
    p?.mani.forEach((m, o) => m.carte.forEach((_, i) => chiavi.push(chiaveCarta(v.giro, k, m.id ?? o, i)))),
  )
  return chiavi
}

/**
 * Il piano per le carte nuove di `v`, a partire da `ritardo`. Le chiavi del
 * piano finiscono fra le `viste`: una carta vola una volta sola.
 */
export function pianoDi(v: VistaTavoloBJ, viste: Set<string>, ritardo = 0): PianoBJ {
  const giocatori: CartaNelTavolo[] = []
  v.posti.forEach((p, k) =>
    p?.mani.forEach((m, o) =>
      m.carte.forEach((_, i) => {
        const chiave = chiaveCarta(v.giro, k, m.id ?? o, i)
        if (!viste.has(chiave)) giocatori.push({ chiave, posto: k, ordine: o, indice: i, divisa: !!m.divisa })
      }),
    ),
  )
  const banco = v.banco
    .map((_, i) => ({ chiave: chiaveBanco(v.giro, i), indice: i }))
    .filter((c) => !viste.has(c.chiave))
  const arrivi = new Map<string, ArrivoCarta>()
  let t = ritardo
  const vola = (chiave: string, da: ArrivoCarta['da'] = 'sabot', passo = CARTA_MS) => {
    arrivi.set(chiave, { ritardo: t, da })
    t += passo
  }
  const perPosto = (a: CartaNelTavolo, b: CartaNelTavolo) =>
    a.posto - b.posto || a.ordine - b.ordine || a.indice - b.indice

  const distribuzione = banco.some((c) => c.indice === 0)
  if (distribuzione) {
    // Una a testa, dalla sinistra del banco; la sua; la seconda a testa; poi quel che e' venuto dopo.
    const prime = giocatori.filter((c) => c.indice === 0).sort(perPosto)
    const seconde = giocatori.filter((c) => c.indice === 1).sort(perPosto)
    const altre = giocatori.filter((c) => c.indice > 1).sort(perPosto)
    for (const c of prime) vola(c.chiave)
    vola(banco[0].chiave)
    for (const c of [...seconde, ...altre]) vola(c.chiave)
  } else {
    // Prima la carta che scivola nella mano nata dalla divisione, poi quelle nuove.
    const scivolano = giocatori.filter((c) => c.divisa && c.indice === 0 && c.ordine > 0)
    const arrivano = giocatori.filter((c) => !scivolano.includes(c)).sort(perPosto)
    for (const c of scivolano) vola(c.chiave, 'divisa', 0)
    for (const c of arrivano) vola(c.chiave)
  }
  const delBanco = banco.filter((c) => !distribuzione || c.indice > 0)
  if (delBanco.length > 0) {
    t += RESPIRO_BANCO_MS
    for (const c of delBanco) vola(c.chiave, 'sabot', FINE_CARTA_MS)
  }
  for (const chiave of arrivi.keys()) viste.add(chiave)
  const ultima = Math.max(-1, ...[...arrivi.values()].map((a) => a.ritardo))
  return { arrivi, fine: arrivi.size === 0 ? 0 : ultima + VOLO_CARTA_MS }
}
