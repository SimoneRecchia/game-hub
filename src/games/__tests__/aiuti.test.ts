import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const leggi = (relativo: string) => readFileSync(join(__dirname, '..', '..', relativo), 'utf8')

/**
 * Il foglio degli aiuti dice quanto costa ogni aiuto, e il conto lo fa il
 * server: i due numeri devono venire dalla stessa funzione. Nel sudoku i costi
 * erano scritti nel telefono, tre punti e uno, e quando il server li ha portati
 * a cinque e due il foglio ha continuato a dire quelli di prima.
 */
describe('i costi degli aiuti che si leggono sono quelli che si pagano', () => {
  it('il sudoku li conta dallo schema, come il server', () => {
    const codice = leggi('games/sudoku/useSudoku.ts')
    expect(codice).toContain('costiSudoku(stato.dati)')
    expect(codice).not.toMatch(/costo\w*:\s*\d|svelata:\s*\d|errore:\s*\d/)
  })

  it('il cruciverba li conta dallo schema, come il server', () => {
    const codice = leggi('pages/Cruciverba.tsx')
    expect(codice).toContain('costiCruciverba(stato.schema)')
    expect(codice).not.toMatch(/COSTO_\w+/)
  })

  it('il prezzo della parola da svelare lo conta la stessa funzione che la fa pagare', () => {
    expect(leggi('pages/Cruciverba.tsx')).toContain('caselleDaPagare(g.corrente.caselle, g.svelate)')
    expect(leggi('../server/routes/cruciverba.ts')).toContain('caselleDaPagare(azione.caselle, svelate)')
    expect(leggi('../server/routes/sudoku.ts')).toContain('caselleDaPagare(azione.caselle, svelate)')
  })
})
