import { describe, expect, it } from 'vitest'
import { giocaMossa, inizialeDi, regoleDi } from '../tavolo-regole'
import type { EsitoTavoliere, GiocoTavoliere, Parte } from '../tavolo'

/** Una partita giocata mossa per mossa come la gioca il server: la posizione, le chiavi, e l'esito alla fine. */
function partita(gioco: GiocoTavoliere, mosse: readonly string[]) {
  const regole = regoleDi(gioco)
  let posizione = regole.iniziale
  let chiavi: string[] = []
  let esito: EsitoTavoliere | null = null
  for (const [i, mossa] of mosse.entries()) {
    const chi = regole.tratto(posizione) as Parte
    const giocata = giocaMossa(regole, posizione, chiavi, mossa, chi)
    if (!giocata) throw new Error(`mossa ${i + 1} (${mossa}) rifiutata`)
    ;({ posizione, chiavi, esito } = giocata)
  }
  return { posizione, chiavi, esito }
}

describe('le regole dei giochi da tavoliere dietro una faccia sola', () => {
  it('il Forza 4: a turno, e il quattro in fila chiude', () => {
    const regole = regoleDi('forza4')
    expect(regole.tratto(regole.iniziale)).toBe(0)
    expect(giocaMossa(regole, regole.iniziale, [], '3', 1)).toBeNull()
    expect(giocaMossa(regole, regole.iniziale, [], '7', 0)).toBeNull()
    const fine = partita('forza4', ['0', '0', '1', '1', '2', '2', '3'])
    expect(fine.esito).toEqual({ vincitore: 0, motivo: 'forza4' })
    // A partita finita non si muove piu'.
    expect(giocaMossa(regole, fine.posizione, fine.chiavi, '6', 1)).toBeNull()
  })

  it('gli scacchi: il matto del barbiere, e una mossa che non si puo’ fare', () => {
    const regole = regoleDi('scacchi')
    expect(regole.tratto(regole.iniziale)).toBe(0)
    expect(giocaMossa(regole, regole.iniziale, [], 'e2e5', 0)).toBeNull()
    expect(giocaMossa(regole, regole.iniziale, [], 'Cf3', 0)).toBeNull()
    expect(giocaMossa(regole, regole.iniziale, [], 'e2e4', 0)?.mossa).toBe('e2e4')
    const barbiere = partita('scacchi', ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'])
    expect(barbiere.esito).toEqual({ vincitore: 0, motivo: 'matto' })
    const sciocco = partita('scacchi', ['f2f3', 'e7e5', 'g2g4', 'd8h4'])
    expect(sciocco.esito).toEqual({ vincitore: 1, motivo: 'matto' })
  })

  it('gli scacchi: i cavalli che vanno e tornano fanno patta alla terza volta', () => {
    const giro = ['g1f3', 'g8f6', 'f3g1', 'f6g8']
    const due = partita('scacchi', giro)
    expect(due.esito).toBeNull()
    // Dopo una mossa di pedone le posizioni di prima non tornano: le chiavi ricominciano.
    expect(partita('scacchi', [...giro, 'e2e4']).chiavi).toEqual([])
    const tre = partita('scacchi', [...giro, ...giro])
    expect(tre.esito).toEqual({ vincitore: null, motivo: 'ripetizione' })
  })

  it('la dama: comincia il Bianco, prendere e’ obbligatorio', () => {
    const regole = regoleDi('dama')
    expect(regole.tratto(regole.iniziale)).toBe(0)
    expect(giocaMossa(regole, regole.iniziale, [], '22-18', 1)).toBeNull()
    expect(giocaMossa(regole, regole.iniziale, [], '22-19', 0)).not.toBeNull()
    expect(giocaMossa(regole, regole.iniziale, [], '22-17', 0)).toBeNull()
    // Il Bianco avanza in 18, il Nero in 14: ora il Bianco deve prendere, e un'altra mossa non vale.
    const dopo = partita('dama', ['22-18', '11-14'])
    expect(giocaMossa(regole, dopo.posizione, dopo.chiavi, '21-17', 0)).toBeNull()
    expect(giocaMossa(regole, dopo.posizione, dopo.chiavi, '18x11', 0)?.mossa).toBe('18x11')
    // Le mosse di pedina non si ripetono: le chiavi restano vuote.
    expect(dopo.chiavi).toEqual([])
  })

  it('il go: comincia il Nero, si sceglie il goban, e due passi fermano il gioco per contare', () => {
    const regole = regoleDi('go')
    expect(regole.tratto(regole.iniziale)).toBe(0)
    expect(regole.varianteDi!(regole.iniziale)).toBe('9')
    expect(regole.varianteDi!(inizialeDi(regole, '13'))).toBe('13')
    expect(regole.varianteDi!(inizialeDi(regole, '7'))).toBe('9')
    // Le colonne vanno dalla A alla J senza la I, e la mossa si scrive come la scrive il gioco.
    expect(giocaMossa(regole, regole.iniziale, [], 'I5', 0)).toBeNull()
    expect(giocaMossa(regole, regole.iniziale, [], 'd4', 0)).toBeNull()
    expect(giocaMossa(regole, regole.iniziale, [], 'D4', 0)?.mossa).toBe('D4')

    const fermo = partita('go', ['E5', 'C3', 'passo', 'passo'])
    // Due passi non chiudono la partita: la fermano, e il risultato lo dice il conteggio.
    expect(fermo.esito).toBeNull()
    expect(regole.conteggio!(fermo.posizione)).toBe(true)
    expect(giocaMossa(regole, fermo.posizione, fermo.chiavi, 'D4', 0)).toBeNull()
    // Nel go ogni posizione puo' tornare: le chiavi si tengono tutte.
    expect(fermo.chiavi).toHaveLength(4)
  })

  it('solo scacchi e dama prevedono la patta d’accordo', () => {
    expect(regoleDi('scacchi').patta).toBe(true)
    expect(regoleDi('dama').patta).toBe(true)
    expect(regoleDi('forza4').patta).toBe(false)
    expect(regoleDi('go').patta).toBe(false)
  })

  it('una mossa si convalida ben dentro il tempo del server', () => {
    // Il server ha dieci millisecondi di CPU per tutta la richiesta: la mossa ne deve prendere una frazione.
    const mosse = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6', 'e1g1', 'f8e7']
    const regole = regoleDi('scacchi')
    const { posizione, chiavi } = partita('scacchi', mosse)
    const volte = 200
    const inizio = performance.now()
    for (let i = 0; i < volte; i += 1) giocaMossa(regole, posizione, chiavi, 'f1e1', 0)
    expect((performance.now() - inizio) / volte).toBeLessThan(1)
  })
})
