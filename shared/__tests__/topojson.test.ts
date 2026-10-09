import { describe, expect, it } from 'vitest'
import { coloriVicini, type Forma } from '../topojson'

/** Una forma che ha questi archi: due forme con un arco in comune confinano. */
const forma = (id: string, ...archi: number[]): Forma => ({ id, nome: id, poligoni: [], archi: [archi] })

/** Le coppie che confinano e hanno lo stesso colore: devono essere nessuna. */
function stessiColori(forme: Forma[], colori: Map<string, number>): string[] {
  const doppie: string[] = []
  for (const a of forme) {
    for (const b of forme) {
      if (a.id < b.id && a.archi.flat().some((x) => b.archi.flat().includes(x)) && colori.get(a.id) === colori.get(b.id)) {
        doppie.push(`${a.id}-${b.id}`)
      }
    }
  }
  return doppie
}

describe('i colori della carta politica', () => {
  it('una ruota — un paese circondato da cinque — non ha due vicini dello stesso colore', () => {
    // Il centro ha un arco con ognuno dei cinque, e ognuno uno con il successivo: servono quattro colori.
    const anello = [0, 1, 2, 3, 4].map((i) => forma(`r${i}`, i, 10 + i, 10 + ((i + 4) % 5)))
    const forme = [forma('centro', 0, 1, 2, 3, 4), ...anello]
    const colori = coloriVicini(forme, 5)
    expect(stessiColori(forme, colori)).toEqual([])
    expect(new Set(colori.values()).size).toBeGreaterThanOrEqual(4)
  })

  it('le isole, che non confinano con nessuno, si dividono le tinte invece di prendere tutte la prima', () => {
    const forme = Array.from({ length: 10 }, (_, i) => forma(`isola${i}`, 100 + i))
    const usi = [0, 0, 0, 0, 0]
    for (const c of coloriVicini(forme, 5).values()) usi[c] += 1
    expect(usi).toEqual([2, 2, 2, 2, 2])
  })

  it("e' la stessa a ogni caricamento, qualunque sia l’ordine delle forme", () => {
    const forme = [forma('a', 1, 2), forma('b', 2, 3), forma('c', 3, 1), forma('d', 4)]
    const uno = coloriVicini(forme, 5)
    const due = coloriVicini([...forme].reverse(), 5)
    expect([...due.entries()].sort()).toEqual([...uno.entries()].sort())
  })
})
