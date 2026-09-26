import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PUBBLICO = join(__dirname, '..', '..', 'public')

/**
 * Le icone SVG si caricano come immagini, e un'immagine SVG deve essere XML
 * valido: un doppio trattino dentro un commento basta a non farla caricare,
 * mentre la stessa icona messa nella pagina si vede lo stesso — che e' come
 * era passato inosservato il marchio rotto nella barra laterale.
 */
describe('le icone SVG di public/', () => {
  const file = readdirSync(PUBBLICO).filter((f) => f.endsWith('.svg'))

  it('ci sono', () => {
    expect(file).toContain('icon.svg')
    expect(file).toContain('favicon.svg')
  })

  for (const nome of file) {
    it(`${nome} non ha commenti con il doppio trattino`, () => {
      const testo = readFileSync(join(PUBBLICO, nome), 'utf8')
      for (const [, dentro] of testo.matchAll(/<!--([\s\S]*?)-->/g)) {
        expect(dentro.includes('--')).toBe(false)
      }
      expect(testo.trimStart().startsWith('<svg')).toBe(true)
    })
  }
})
