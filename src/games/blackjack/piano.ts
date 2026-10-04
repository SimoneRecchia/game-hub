/**
 * Il piano del tavolo: quando arriva ogni carta nuova, e quando si vedono gli
 * esiti. Il server risponde con il tavolo com'e' dopo — tutte le carte del
 * giro, magari anche quelle del banco — e qui si decide in che ordine farle
 * arrivare: la distribuzione come al tavolo vero (una a testa dalla sinistra
 * del banco, la sua, la seconda a testa), le carte chieste una alla volta, e
 * quelle del banco alla fine, piu' lente, per la suspense.
 *
 * Una carta e' nuova se al suo posto — il giro, il posto, la mano e il posto
 * nella mano — prima non c'era, o c'era un'altra carta. Le mani hanno un nome
 * (`id`) che non cambia quando uno split sposta le altre, quindi una carta
 * gia' vista resta la stessa carta; ma la seconda carta della mano che fa
 * split passa nella mano nuova, e al suo posto ne arriva una dal sabot, che
 * deve volare come le altre.
 */

import type { Carta } from '@shared/blackjack'
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

/** Le carte che si sono viste, al loro posto: la chiave e la carta che c'era. */
export type CarteViste = Map<string, Carta>

/** Tutte le carte del tavolo, con le loro chiavi: per segnarle viste senza farle volare, alla prima lettura. */
export function carteDi(v: VistaTavoloBJ): Array<[string, Carta]> {
  const carte = v.banco.map((c, i): [string, Carta] => [chiaveBanco(v.giro, i), c])
  v.posti.forEach((p, k) =>
    p?.mani.forEach((m, o) => m.carte.forEach((c, i) => carte.push([chiaveCarta(v.giro, k, m.id ?? o, i), c]))),
  )
  return carte
}

/**
 * Il piano per le carte nuove di `v`, a partire da `ritardo`. Le carte del
 * piano finiscono fra le `viste`: una carta vola una volta sola.
 */
export function pianoDi(v: VistaTavoloBJ, viste: CarteViste, ritardo = 0): PianoBJ {
  const giocatori: CartaNelTavolo[] = []
  const nuove: Array<[string, Carta]> = []
  v.posti.forEach((p, k) =>
    p?.mani.forEach((m, o) =>
      m.carte.forEach((c, i) => {
        const chiave = chiaveCarta(v.giro, k, m.id ?? o, i)
        if (viste.get(chiave) === c) return
        giocatori.push({ chiave, posto: k, ordine: o, indice: i, divisa: !!m.divisa })
        nuove.push([chiave, c])
      }),
    ),
  )
  const banco = v.banco
    .map((c, i) => ({ chiave: chiaveBanco(v.giro, i), indice: i, carta: c }))
    .filter((c) => viste.get(c.chiave) !== c.carta)
  for (const c of banco) nuove.push([c.chiave, c.carta])
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
    // Prima la carta che scivola nella mano nata dallo split, poi quelle nuove: anche quella che prende il suo posto.
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
  for (const [chiave, carta] of nuove) viste.set(chiave, carta)
  const ultima = Math.max(-1, ...[...arrivi.values()].map((a) => a.ritardo))
  return { arrivi, fine: arrivi.size === 0 ? 0 : ultima + VOLO_CARTA_MS }
}
