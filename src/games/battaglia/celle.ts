import { CASELLE, caselleDellaNave, type Nave } from '@shared/battaglia'
import type { ColpoVisto } from '@shared/types'
import type { CellaMare } from './Mare'

function disegnaNavi(celle: CellaMare[], navi: readonly Nave[], affondate: ReadonlySet<string> = new Set()) {
  for (const nave of navi) {
    const caselle = caselleDellaNave(nave)
    caselle.forEach((k, i) => {
      celle[k] = {
        ...celle[k],
        nave: {
          tipo: nave.tipo,
          inizio: i === 0,
          fine: i === caselle.length - 1,
          verticale: nave.verticale,
        },
        affondata: affondate.has(nave.tipo),
      }
    })
  }
}

function segnaColpi(celle: CellaMare[], colpi: readonly ColpoVisto[]) {
  for (const colpo of colpi) celle[colpo.casella] = { ...celle[colpo.casella], colpo: colpo.esito }
}

/** Il proprio mare: le navi, i colpi presi, e le navi che l'avversario ha affondato. */
export function celleProprie(
  navi: readonly Nave[],
  colpiSubiti: readonly ColpoVisto[] = [],
  scelta: string | null = null,
): CellaMare[] {
  const celle: CellaMare[] = Array.from({ length: CASELLE }, () => ({}))
  const presi = new Set(colpiSubiti.filter((c) => c.esito !== 'acqua').map((c) => c.casella))
  const affondate = new Set(
    navi.filter((n) => caselleDellaNave(n).every((k) => presi.has(k))).map((n) => n.tipo as string),
  )
  disegnaNavi(celle, navi, affondate)
  segnaColpi(celle, colpiSubiti)
  if (scelta) {
    const nave = navi.find((n) => n.tipo === scelta)
    if (nave) for (const k of caselleDellaNave(nave)) celle[k] = { ...celle[k], scelta: true }
  }
  return celle
}

/**
 * Il mare dell'avversario: solo quel che si e' scoperto. Le navi affondate si
 * vedono intere; a partita finita si vede anche il resto della flotta.
 */
export function celleNemiche(
  colpiMiei: readonly ColpoVisto[],
  affondate: readonly Nave[],
  flottaIntera: readonly Nave[] | null,
): CellaMare[] {
  const celle: CellaMare[] = Array.from({ length: CASELLE }, () => ({}))
  const aFondo = new Set(affondate.map((n) => n.tipo as string))
  disegnaNavi(celle, flottaIntera ?? affondate, aFondo)
  segnaColpi(celle, colpiMiei)
  return celle
}
