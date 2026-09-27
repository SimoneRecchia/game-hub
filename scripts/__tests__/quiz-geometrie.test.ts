import { describe, expect, it } from 'vitest'
import { chiaveNome, collegate, semplifica, unisci } from '../quiz/geometrie'

type Linea = Array<[number, number]>

/** Una linea dritta da un punto a un altro, in `n` passi. */
function linea(da: [number, number], a: [number, number], n = 10): Linea {
  return Array.from({ length: n + 1 }, (_, i): [number, number] => [
    da[0] + ((a[0] - da[0]) * i) / n,
    da[1] + ((a[1] - da[1]) * i) / n,
  ])
}

describe('le linee dei fiumi', () => {
  it('il nome si riduce all’osso', () => {
    expect(chiaveNome('River Thames')).toBe('thames')
    expect(chiaveNome('Río Paraná')).toBe('parana')
    expect(chiaveNome('Black River')).toBe('black')
  })

  it('i tratti che si toccano diventano una linea sola', () => {
    const uniti = unisci([linea([0, 0], [1, 0]), linea([1, 0], [2, 1]), linea([3, 3], [4, 4])])
    expect(uniti).toHaveLength(2)
  })

  it('la semplificazione tiene la forma e toglie i punti in fila', () => {
    expect(semplifica(linea([0, 0], [5, 0], 50), 0.03)).toHaveLength(2)
    const gomito = [...linea([0, 0], [1, 0]), ...linea([1, 0], [1, 1]).slice(1)]
    expect(semplifica(gomito, 0.03)).toHaveLength(3)
  })

  it('un tratto con lo stesso nome ma lontano dal fiume non e’ il fiume', () => {
    // L'Amur, dalla foce verso ovest, e un suo affluente; il "Black River" del Vietnam, dentro la Cina larga.
    const amur = linea([140.7, 53.1], [121.4, 53.3])
    const affluente = linea([127.5, 53.2], [124, 46])
    const vietnam = linea([100.6, 24.8], [105.3, 21.3])
    expect(collegate([vietnam, amur, affluente], [140.7, 53.1])).toEqual([amur, affluente])
  })

  it('senza un punto vicino si parte dal tratto piu’ lungo', () => {
    const lungo = linea([10, 45], [20, 45])
    const attaccato = linea([20.5, 45.3], [22, 44])
    const lontano = linea([60, 10], [61, 10])
    expect(collegate([lontano, lungo, attaccato], null)).toEqual([lungo, attaccato])
  })

  it('il punto alla sorgente non fa perdere il corso, che ha un altro nome e un buco in mezzo', () => {
    // L'Irtyš: la sorgente in Cina come Ertix, poi un buco di dieci gradi, poi il corso lungo fino all'Ob.
    const ertix = linea([90.3, 47.6], [85.3, 48])
    const corso = [
      ...linea([75, 54], [73.7, 54.7]),
      ...linea([73.7, 54.7], [68.2, 58.2]).slice(1),
      ...linea([68.2, 58.2], [68.9, 61.1]).slice(1),
    ]
    expect(collegate([ertix, corso], [90.2, 47.4])).toEqual([ertix, corso])
  })

  it('un corso interrotto da un lago resta intero, ma non continua oltre la foce', () => {
    // Il Lualaba ha un buco di tre gradi; il Salado del Norte finisce a due gradi da un altro Salado.
    const alto = linea([26.25, -11.74], [26.44, -8.27])
    const basso = linea([26.93, -5.61], [24.29, 0.78])
    expect(collegate([alto, basso], [22.48, 2.15])).toEqual([alto, basso])
    const salado = linea([-65.87, -24.21], [-60.72, -31.96])
    const diBuenosAires = linea([-61.54, -34.07], [-57.36, -35.75], 4)
    expect(collegate([salado, diBuenosAires], [-60.74, -31.68])).toEqual([salado])
  })
})
