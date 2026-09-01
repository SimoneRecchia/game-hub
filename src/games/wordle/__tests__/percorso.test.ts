import { describe, expect, it } from 'vitest'
import { WORDS_PER_DAY } from '@shared/config'
import type { DaySlot } from '@shared/types'
import {
  ALTEZZA,
  LARGHEZZA,
  TAPPE,
  aSinistra,
  avanzamento,
  dettaglioTappa,
  prossimaTappa,
  statoTappa,
  tracciato,
  tratteFatte,
} from '../percorso'

function tappa(over: Partial<DaySlot> & { slot: number }): DaySlot {
  return {
    status: 'new',
    attempts: 0,
    score: null,
    locked: false,
    shared: false,
    ...over,
  }
}

/** Una giornata con le prime `chiuse` parole vinte e le altre a catena. */
function giornata(chiuse: number): DaySlot[] {
  return Array.from({ length: WORDS_PER_DAY }, (_, i) => {
    const slot = i + 1
    if (i < chiuse) return tappa({ slot, status: 'won', attempts: 3, score: 80 })
    return tappa({ slot, locked: i > chiuse })
  })
}

describe('geometria del percorso', () => {
  it('ha una tappa per ogni parola della giornata', () => {
    expect(TAPPE).toHaveLength(WORDS_PER_DAY)
  })

  it('tiene le tappe dentro il riquadro, con margine per il nodo', () => {
    for (const p of TAPPE) {
      expect(p.x).toBeGreaterThan(10)
      expect(p.x).toBeLessThan(LARGHEZZA - 10)
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThanOrEqual(ALTEZZA)
    }
  })

  it('scende sempre: due tappe non stanno mai alla stessa altezza', () => {
    for (let i = 1; i < TAPPE.length; i++) {
      expect(TAPPE[i].y).toBeGreaterThan(TAPPE[i - 1].y)
    }
  })

  it('alterna i lati, così l’etichetta trova sempre spazio', () => {
    const lati = TAPPE.map(aSinistra)
    for (let i = 1; i < lati.length; i++) {
      expect(lati[i]).not.toBe(lati[i - 1])
    }
  })
})

describe('tracciato', () => {
  it('parte dalla prima tappa e finisce sull’ultima', () => {
    const d = tracciato(TAPPE)
    expect(d.startsWith(`M ${TAPPE[0].x} ${TAPPE[0].y}`)).toBe(true)
    const ultima = TAPPE[TAPPE.length - 1]
    expect(d.endsWith(`${ultima.x} ${ultima.y}`)).toBe(true)
  })

  it('usa una cubica per ogni tratto', () => {
    const curve = tracciato(TAPPE).match(/C/g) ?? []
    expect(curve).toHaveLength(TAPPE.length - 1)
  })

  it('passa per le tappe intermedie, non le sfiora', () => {
    // Ogni cubica finisce sul punto successivo: e' la proprieta' che distingue
    // Catmull-Rom da una Bezier che userebbe le tappe come attrattori.
    const d = tracciato(TAPPE)
    for (const p of TAPPE.slice(1)) {
      expect(d).toContain(`${p.x} ${p.y}`)
    }
  })

  it('non produce niente con meno di due punti', () => {
    expect(tracciato([])).toBe('')
    expect(tracciato([{ x: 1, y: 2 }])).toBe('')
  })
})

describe('avanzamento', () => {
  it('e’ zero a giornata intatta e uno a giornata finita', () => {
    expect(avanzamento(giornata(0))).toBe(0)
    expect(avanzamento(giornata(WORDS_PER_DAY))).toBe(1)
  })

  it('cresce di un tratto per parola chiusa', () => {
    expect(avanzamento(giornata(1))).toBeCloseTo(0.25)
    expect(avanzamento(giornata(2))).toBeCloseTo(0.5)
  })

  it('conta solo il prefisso: un tratto pieno non salta buchi', () => {
    // Con le parole progressive non capita, ma il disegno non deve dipendere da
    // quella garanzia: una linea piena che parte dall'inizio non puo' colorare
    // un tratto oltre una parola non giocata.
    const strana = giornata(0)
    strana[3] = tappa({ slot: 4, status: 'won', attempts: 2, score: 16 })
    expect(tratteFatte(strana)).toBe(0)
    expect(avanzamento(strana)).toBe(0)
  })
})

describe('stato della tappa', () => {
  it('distingue le cinque situazioni', () => {
    expect(statoTappa(tappa({ slot: 1, status: 'won', attempts: 2 }))).toBe('vinta')
    expect(statoTappa(tappa({ slot: 1, status: 'lost', attempts: 6 }))).toBe('persa')
    expect(statoTappa(tappa({ slot: 2, locked: true }))).toBe('bloccata')
    expect(statoTappa(tappa({ slot: 1, status: 'playing', attempts: 2 }))).toBe('incorso')
    expect(statoTappa(tappa({ slot: 1 }))).toBe('daGiocare')
  })

  it('una parola chiusa resta chiusa anche se risultasse bloccata', () => {
    // L'ordine dei controlli conta: `locked` viaggia insieme allo stato, e una
    // parola vinta disegnata come lucchetto sarebbe un errore visibile.
    expect(statoTappa(tappa({ slot: 3, status: 'won', attempts: 4, locked: true }))).toBe('vinta')
  })
})

describe('prossima tappa', () => {
  it('e’ la parola del giorno a giornata intatta', () => {
    expect(prossimaTappa(giornata(0))?.slot).toBe(1)
  })

  it('avanza man mano che le parole si chiudono', () => {
    expect(prossimaTappa(giornata(2))?.slot).toBe(3)
  })

  it('non esiste piu’ a giornata finita', () => {
    expect(prossimaTappa(giornata(WORDS_PER_DAY))).toBeUndefined()
  })
})

describe('dettaglio', () => {
  it('dice i tentativi, non i punti', () => {
    expect(dettaglioTappa(tappa({ slot: 1, status: 'won', attempts: 1, score: 100 }))).toBe(
      'Al primo tentativo',
    )
    expect(dettaglioTappa(tappa({ slot: 1, status: 'won', attempts: 4, score: 70 }))).toBe(
      'In 4 tentativi',
    )
    for (const d of [
      tappa({ slot: 1, status: 'won', attempts: 3, score: 80 }),
      tappa({ slot: 2, status: 'lost', attempts: 6, score: 8 }),
      tappa({ slot: 3, status: 'playing', attempts: 2 }),
    ]) {
      expect(dettaglioTappa(d)).not.toMatch(/\d+ punt/)
    }
  })

  it('per una parola chiusa dice quale la apre', () => {
    expect(dettaglioTappa(tappa({ slot: 2, locked: true }))).toBe('Dopo la parola del giorno')
    expect(dettaglioTappa(tappa({ slot: 4, locked: true }))).toBe('Dopo la 3ª')
  })

  it('una giornata giocata in compagnia lo dice, invece di contare tentativi non suoi', () => {
    expect(
      dettaglioTappa(tappa({ slot: 1, status: 'won', attempts: 0, score: 89, shared: true })),
    ).toBe('Giocata in compagnia')
  })
})
