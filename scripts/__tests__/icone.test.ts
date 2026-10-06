import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CON_GLI_INDIRIZZI,
  COPERTINE,
  FONDO,
  INDIRIZZO_ICONA,
  PNG,
  SVG,
  disegno,
  improntaDelleIcone,
  // @ts-expect-error — script in JavaScript, senza dichiarazioni di tipo
} from '../genera-icone.mjs'

const RADICE = join(__dirname, '..', '..')
const PUBBLICO = join(RADICE, 'public')

interface FilePng {
  file: string
  lato: number
  forma?: 'tonda' | 'quadrata'
  scala?: number
  mono?: boolean
}

/** Larghezza, altezza e trasparenza di un PNG, dalla sua intestazione. */
function intestazione(byte: Buffer) {
  const tipo = byte[25]
  // 4 e 6 hanno l'alfa; gli altri sono trasparenti solo con un blocco tRNS, prima dei dati.
  const dati = byte.indexOf('IDAT')
  const trns = byte.indexOf('tRNS')
  return {
    larghezza: byte.readUInt32BE(16),
    altezza: byte.readUInt32BE(20),
    trasparente: tipo === 4 || tipo === 6 || (trns !== -1 && trns < dati),
  }
}

/** La luminanza relativa di un colore, come la conta il WCAG. */
function luminanza(esadecimale: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(esadecimale.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Quante volte il primo colore e' piu' luminoso del secondo, col margine del WCAG. */
function staccoDa(chiaro: string, scuro: string): number {
  return (luminanza(chiaro) + 0.05) / (luminanza(scuro) + 0.05)
}

const piuScuro = (toni: string[]) => toni.reduce((a, b) => (luminanza(a) <= luminanza(b) ? a : b))
const piuChiaro = (toni: string[]) => toni.reduce((a, b) => (luminanza(a) >= luminanza(b) ? a : b))

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

  it('sono il disegno di scripts/genera-icone.mjs, che fa anche i PNG', () => {
    for (const nome of SVG as string[]) expect(readFileSync(join(PUBBLICO, nome), 'utf8')).toBe(disegno())
  })

  it('anche le varianti dei PNG sono XML valido', () => {
    for (const { file: nome, forma, scala, mono } of PNG as FilePng[]) {
      for (const [, dentro] of disegno({ forma, scala, mono }).matchAll(/<!--([\s\S]*?)-->/g)) {
        expect(dentro.includes('--'), nome).toBe(false)
      }
    }
  })
})

describe("l'icona di iOS", () => {
  const byte = readFileSync(join(PUBBLICO, 'apple-touch-icon.png'))

  it("e' piena: iOS dipinge di nero i pixel trasparenti", () => {
    expect(intestazione(byte).trasparente).toBe(false)
  })

  it("e' grande 1024: a 180 le icone grandi della Home la ingrandirebbero", () => {
    expect(intestazione(byte)).toMatchObject({ larghezza: 1024, altezza: 1024 })
  })

  it("e' a filo, senza gli angoli tondi: li taglia iOS", () => {
    expect(disegno({ forma: 'quadrata' })).not.toMatch(/<rect width="512" height="512" rx=/)
    expect(disegno({ forma: 'tonda' })).toMatch(/<rect width="512" height="512" rx=/)
  })
})

/**
 * Senza i colori — la versione trasparente e quella colorata di iOS 26, le
 * icone a tema di Android — di un disegno resta la luminosita', ed e' quella
 * che lo separa dal fondo. Nell'icona di prima la parte bassa delle copertine
 * del cruciverba e della battaglia era scura quanto il fondo, e il riflesso in
 * alto a sinistra veniva preso per un pezzo del disegno.
 */
describe("i colori dell'icona", () => {
  it("le copertine sono molto piu' chiare del fondo, ognuna in ogni suo punto", () => {
    for (const [gioco, toni] of Object.entries(COPERTINE as Record<string, string[]>)) {
      expect(staccoDa(piuScuro(toni), piuChiaro(FONDO)), gioco).toBeGreaterThanOrEqual(1.8)
    }
  })

  it("il fondo e' quasi a tinta unita", () => {
    expect(staccoDa(piuChiaro(FONDO), piuScuro(FONDO))).toBeLessThanOrEqual(1.3)
  })

  it("non ci sono ombre ne' riflessi disegnati: li mette il vetro", () => {
    const svg = disegno()
    expect(svg).not.toMatch(/<filter|radialGradient|feDropShadow/)
  })
})

describe('il manifest', () => {
  const manifest = JSON.parse(readFileSync(join(PUBBLICO, 'manifest.webmanifest'), 'utf8')) as {
    icons: { src: string; sizes: string; type: string; purpose: string }[]
  }

  it('ha le icone per ogni uso: normale, con la maschera e a un colore solo', () => {
    expect(new Set(manifest.icons.map((i) => i.purpose))).toEqual(new Set(['any', 'maskable', 'monochrome']))
  })

  it('le icone che dice ci sono, grandi quanto dice', () => {
    for (const icona of manifest.icons) {
      const file = join(PUBBLICO, icona.src.replace(/^\//, '').replace(/\?.*$/, ''))
      expect(existsSync(file), icona.src).toBe(true)
      if (icona.type !== 'image/png') continue
      const { larghezza, altezza, trasparente } = intestazione(readFileSync(file))
      expect(`${larghezza}x${altezza}`, icona.src).toBe(icona.sizes)
      // Quella con la maschera la ritaglia il sistema, e un angolo trasparente resterebbe un buco.
      if (icona.purpose === 'maskable') expect(trasparente, icona.src).toBe(false)
      // Di quella a un colore solo conta solo l'alfa: senza, sarebbe un quadrato pieno.
      if (icona.purpose === 'monochrome') expect(trasparente, icona.src).toBe(true)
    }
  })

  it("ogni PNG che scrive il generatore e' grande quanto deve", () => {
    for (const { file, lato } of PNG as FilePng[]) {
      expect(intestazione(readFileSync(join(PUBBLICO, file))), file).toMatchObject({ larghezza: lato, altezza: lato })
    }
  })
})

/**
 * Safari tiene le icone per indirizzo, e le Pages le servono con una settimana
 * di cache: senza l'impronta, chi rimette l'app sulla Home dopo un'icona nuova
 * si vedrebbe ancora quella di prima. La scrive npm run icone.
 */
describe("l'impronta negli indirizzi delle icone", () => {
  const impronta = improntaDelleIcone() as string

  for (const file of CON_GLI_INDIRIZZI as string[]) {
    it(`${file} chiede le icone di adesso`, () => {
      const testo = readFileSync(join(RADICE, file), 'utf8')
      const indirizzi = [...testo.matchAll(INDIRIZZO_ICONA)]
      expect(indirizzi.length).toBeGreaterThan(0)
      for (const [intero, , versione] of indirizzi) expect(versione, intero).toBe(impronta)
    })
  }
})
