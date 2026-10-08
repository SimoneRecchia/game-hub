import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * I conti dei premi che salgono — il triplo della ruota fortunata, la medaglia,
 * la ruota del quiz, le buche del Pachinko, le caselle del Cash Hunt — sono
 * numeri uno sopra l'altro, e il CSS ne accende uno alla volta. Due modi di
 * sbagliarlo hanno lasciato accesi piu' numeri insieme.
 */
const FOGLI = ['disegni.css', 'Fortuna.css', 'Pachinko.css', 'CashHunt.css'].map((nome) => ({
  nome,
  css: readFileSync(join(__dirname, '..', nome), 'utf8'),
}))

/** Le animazioni di un foglio, una per una: le dichiarazioni `animation`, divise alle virgole fuori dalle parentesi. */
function animazioni(css: string): string[] {
  const senzaCommenti = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...senzaCommenti.matchAll(/animation:\s*([^;]+);/g)].flatMap((m) =>
    m[1]
      .replace(/\s+/g, ' ')
      .split(/,(?![^(]*\))/)
      .map((a) => a.trim()),
  )
}

describe('i numeri dei conti', () => {
  it('si spengono senza un salto: a fine animazione Chrome arriva a 0,9999999999999984, e un salto resta acceso', () => {
    for (const { nome, css } of FOGLI) {
      for (const a of animazioni(css).filter((x) => x.includes('ct-conto-passo'))) {
        expect(a, nome).not.toMatch(/steps\(/)
      }
    }
    const disegni = FOGLI[0].css
    const passo = disegni.match(/@keyframes ct-conto-passo \{([\s\S]*?)\n\}/)?.[1] ?? ''
    // Acceso quasi fino in fondo, e spento all'ultimo fotogramma.
    expect(passo).toMatch(/98%\s*\{\s*opacity: 1;/)
    expect(passo).toMatch(/100%\s*\{\s*opacity: 0;/)
  })

  it('l’ultimo numero arriva al suo passo, e non si vede durante l’attesa', () => {
    // Con `both` il primo fotogramma dell'arrivo — grande e acceso — vale anche prima del ritardo.
    for (const { nome, css } of FOGLI) {
      for (const a of animazioni(css).filter((x) => /ct-conto-(colpo|ultimo)/.test(x))) {
        expect(a, nome).not.toMatch(/\bboth\b/)
      }
    }
  })
})
