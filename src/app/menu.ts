/**
 * Il menu laterale del computer: le voci di ogni scheda, divise nelle famiglie
 * delle Libere, e a quali schermate appartiene ogni scheda.
 */

import { ROTTE } from '@/app/rotte'
import { CATEGORIE_LIBERE, GIOCHI, giocoTavoloDi } from '@/games/catalog'
import { NOME_BLACKJACK } from '@shared/blackjack'
import { NOME_CRAZY_TIME } from '@shared/ruota'
import { NOME_SLOT } from '@shared/slot'
import type { GiocoClassificato, GiocoDaTavolo } from '@shared/types'

/** Il percorso e' questo, o una schermata sotto questo. */
export const sotto = (percorso: string, radice: string) => percorso === radice || percorso.startsWith(`${radice}/`)

/** I giochi della Fortuna: si puntano i punti fatti oggi nelle classificate. */
export const GIOCHI_FORTUNA = [
  { id: 'ruota', nome: NOME_CRAZY_TIME, a: ROTTE.ruota },
  { id: 'slot', nome: NOME_SLOT, a: ROTTE.slot },
  { id: 'blackjack', nome: NOME_BLACKJACK, a: ROTTE.blackjack },
] as const
export const PERCORSI_FORTUNA = [ROTTE.fortuna, ...GIOCHI_FORTUNA.map((g) => g.a)]

/**
 * Le classificate di oggi e quel che ci gira intorno: le partite, quelle in
 * compagnia, la classifica (tranne quella della Fortuna). Viene prima delle
 * Libere, perché `/quiz/classificata` sta anche sotto `/quiz`.
 */
export const delGiorno = (p: string) =>
  p === '/' ||
  GIOCHI.some((g) => sotto(p, ROTTE.classificata(g.id))) ||
  p.startsWith('/wordle/insieme/') ||
  (sotto(p, ROTTE.classifica()) && !sotto(p, ROTTE.classifica('fortuna')))

/** Una voce del menu laterale: un gioco, dove porta e in quali schermate e' acceso. */
export interface Voce {
  id: string
  gioco: GiocoClassificato | GiocoDaTavolo | (typeof GIOCHI_FORTUNA)[number]['id']
  nome: string
  a: string
  acceso: (percorso: string) => boolean
}

/** Una famiglia di giochi nel menu laterale, che si chiude con la chevron. */
export interface Famiglia {
  nome: string
  voci: Voce[]
}

const CLASSIFICATI = new Set<string>(GIOCHI.map((g) => g.id))

/** Le libere: un gioco con la classificata porta alla sua libera, uno da tavolo alla sua sala. */
const FAMIGLIE_LIBERE: Famiglia[] = CATEGORIE_LIBERE.map((c) => ({
  nome: c.nome,
  voci: c.giochi.map((id): Voce => {
    if (CLASSIFICATI.has(id)) {
      const g = GIOCHI.find((x) => x.id === id)!
      return {
        id,
        gioco: g.id,
        nome: g.nome,
        a: ROTTE.libera(g.id),
        // La libera e le partite che ne nascono (una sfida, una compagnia), non la classificata.
        acceso: (p) => sotto(p, ROTTE.gioco(g.id)) && !delGiorno(p),
      }
    }
    const t = giocoTavoloDi(id as Parameters<typeof giocoTavoloDi>[0])
    return { id, gioco: t.id, nome: t.nome, a: `/${t.slug}`, acceso: (p) => sotto(p, `/${t.slug}`) }
  }),
}))

/** Le classificate di oggi, nelle stesse famiglie: ognuna porta alla partita del giorno. */
const FAMIGLIE_GIORNALIERE: Famiglia[] = CATEGORIE_LIBERE.map((c) => ({
  nome: c.nome,
  voci: GIOCHI.filter((g) => c.giochi.includes(g.id)).map((g) => ({
    id: g.id,
    gioco: g.id,
    nome: g.nome,
    a: ROTTE.classificata(g.id),
    acceso: (p: string) =>
      sotto(p, ROTTE.classificata(g.id)) || (g.id === 'wordle' && p.startsWith('/wordle/insieme/')),
  })),
})).filter((f) => f.voci.length > 0)

const FAMIGLIE_FORTUNA: Famiglia[] = [
  {
    nome: 'Casinò',
    voci: GIOCHI_FORTUNA.map((g) => ({ id: g.id, gioco: g.id, nome: g.nome, a: g.a, acceso: (p) => sotto(p, g.a) })),
  },
]

/** Il menu laterale di ogni scheda: le sue famiglie, e la classifica dove ce n'e' una. */
export const MENU_LATERALE: Record<string, { famiglie: Famiglia[]; classifica?: string }> = {
  [ROTTE.libere]: { famiglie: FAMIGLIE_LIBERE },
  [ROTTE.home]: { famiglie: FAMIGLIE_GIORNALIERE, classifica: ROTTE.classifica() },
  [ROTTE.fortuna]: { famiglie: FAMIGLIE_FORTUNA, classifica: ROTTE.classifica('fortuna') },
}
