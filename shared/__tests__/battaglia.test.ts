import { describe, expect, it } from 'vitest'
import {
  CASELLE_FLOTTA,
  FLOTTA,
  casella,
  caselleDellaNave,
  coordinata,
  disponiACaso,
  esitoDelColpo,
  flottaAffondata,
  flottaValida,
  naviAffondate,
  type Nave,
} from '../battaglia'
import { mulberry32 } from '../daily'

/*
 *     A B C D E F G H I J
 *  1  P P P P P . . . . .
 *  2  . . . . . . . . . .
 *  3  C . I I I . S . . .
 *  4  C . . . . . S . . .
 *  5  C . . . . . S . . .
 *  6  C . . . . . . . D D
 */
const FLOTTA_DI_PROVA: Nave[] = [
  { tipo: 'portaerei', r: 0, c: 0, verticale: false },
  { tipo: 'corazzata', r: 2, c: 0, verticale: true },
  { tipo: 'incrociatore', r: 2, c: 2, verticale: false },
  { tipo: 'sottomarino', r: 2, c: 6, verticale: true },
  { tipo: 'cacciatorpediniere', r: 5, c: 8, verticale: false },
]

describe('la flotta', () => {
  it('e\' quella classica: cinque navi, diciassette caselle', () => {
    expect(FLOTTA.map((t) => t.lunghezza)).toEqual([5, 4, 3, 3, 2])
    expect(CASELLE_FLOTTA).toBe(17)
  })

  it('le coordinate si leggono come sulla carta: lettera della colonna, numero della riga', () => {
    expect(coordinata(0)).toBe('A-1')
    expect(coordinata(99)).toBe('J-10')
    expect(coordinata(casella(5, 1))).toBe('B-6')
  })

  it('una nave occupa caselle consecutive, dalla prua', () => {
    expect(caselleDellaNave({ tipo: 'incrociatore', r: 2, c: 2, verticale: false })).toEqual([22, 23, 24])
    expect(caselleDellaNave({ tipo: 'cacciatorpediniere', r: 8, c: 9, verticale: true })).toEqual([89, 99])
  })
})

describe('una disposizione valida', () => {
  it('accetta una flotta in regola', () => {
    expect(flottaValida(FLOTTA_DI_PROVA)).toEqual({ ok: true })
  })

  it('rifiuta navi che mancano, doppie, fuori dal mare o senza verso', () => {
    expect(flottaValida(FLOTTA_DI_PROVA.slice(1)).ok).toBe(false)
    const doppia = FLOTTA_DI_PROVA.map((n) =>
      n.tipo === 'portaerei' ? { ...n, tipo: 'corazzata' as const } : n,
    )
    expect(flottaValida(doppia).ok).toBe(false)
    const fuori = FLOTTA_DI_PROVA.map((n) => (n.tipo === 'portaerei' ? { ...n, c: 6 } : n))
    expect(flottaValida(fuori).ok).toBe(false)
    const storta = FLOTTA_DI_PROVA.map((n) =>
      n.tipo === 'portaerei' ? ({ ...n, verticale: 'si' } as unknown as Nave) : n,
    )
    expect(flottaValida(storta).ok).toBe(false)
    const mezza = FLOTTA_DI_PROVA.map((n) => (n.tipo === 'portaerei' ? { ...n, r: 0.5 } : n))
    expect(flottaValida(mezza).ok).toBe(false)
  })

  it('le navi non si toccano: ne\' di fianco, ne\' d\'angolo', () => {
    // La corazzata spostata sotto la portaerei la tocca di fianco.
    const fianco = FLOTTA_DI_PROVA.map((n) => (n.tipo === 'corazzata' ? { ...n, r: 1 } : n))
    const verifica = flottaValida(fianco)
    expect(verifica.ok).toBe(false)
    if (!verifica.ok) expect(verifica.errore).toContain('non possono toccarsi')
    // Il cacciatorpediniere in F-2 tocca la portaerei solo d'angolo: vale lo stesso.
    const angolo = FLOTTA_DI_PROVA.map((n) =>
      n.tipo === 'cacciatorpediniere' ? { ...n, r: 1, c: 5, verticale: true } : n,
    )
    expect(flottaValida(angolo).ok).toBe(false)
  })

  it('la disposizione a caso e\' sempre in regola, e con lo stesso seme e\' la stessa', () => {
    for (let seme = 1; seme <= 300; seme += 1) {
      expect(flottaValida(disponiACaso(mulberry32(seme))).ok).toBe(true)
    }
    expect(disponiACaso(mulberry32(7))).toEqual(disponiACaso(mulberry32(7)))
  })
})

describe('i colpi', () => {
  it('acqua, colpito, e affondato sull\'ultima casella', () => {
    const prima = new Set<number>()
    expect(esitoDelColpo(FLOTTA_DI_PROVA, prima, 11)).toEqual({ esito: 'acqua', nave: null })
    expect(esitoDelColpo(FLOTTA_DI_PROVA, prima, 58)).toEqual({ esito: 'colpito', nave: 'cacciatorpediniere' })
    expect(esitoDelColpo(FLOTTA_DI_PROVA, new Set([58]), 59)).toEqual({
      esito: 'affondato',
      nave: 'cacciatorpediniere',
    })
  })

  it('la partita finisce quando l\'ultima nave va a fondo', () => {
    const colpi = new Set<number>()
    for (const nave of FLOTTA_DI_PROVA) for (const k of caselleDellaNave(nave)) colpi.add(k)
    expect(flottaAffondata(FLOTTA_DI_PROVA, colpi)).toBe(true)
    colpi.delete(0)
    expect(flottaAffondata(FLOTTA_DI_PROVA, colpi)).toBe(false)
    expect(naviAffondate(FLOTTA_DI_PROVA, colpi).map((n) => n.tipo)).not.toContain('portaerei')
  })
})
