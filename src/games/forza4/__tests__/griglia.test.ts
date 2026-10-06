import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RIGHE } from '@shared/forza4'
import { FASCIA, IMPATTO, PASSO_FILA_MS, PIEDE, SCIVOLA_MS, attesaFine, durataCaduta } from '../Griglia'

const CSS = readFileSync(join(__dirname, '..', 'Griglia.css'), 'utf8')

/** Un numero come lo si scrive nel CSS: 9, 4.5, 73.5. */
const scritto = (x: number) => String(Number(x.toFixed(2)))

describe('la griglia del Forza 4', () => {
  it('il CSS ha le misure della fascia e del piede, e il disco parte dalla mano', () => {
    expect(CSS).toContain(`.f4__fascia {\n  position: relative;\n  aspect-ratio: 70 / ${scritto(FASCIA * 10)};`)
    expect(CSS).toContain(`aspect-ratio: 70 / ${scritto(PIEDE * 10)};`)
    // In altezza la griglia, la fascia e il piede: la larghezza che ci sta.
    expect(CSS).toContain(`var(--campo-alto, 100cqh) * 70 / ${scritto((RIGHE + FASCIA + PIEDE) * 10)}`)
    // La caduta parte a cinque righe e mezza sopra il fondo, piu' meta' fascia: il centro della mano.
    const da = CSS.match(/--da: calc\(\(var\(--r\) - ([\d.]+)\) \* 100%\);/)
    expect(Number(da?.[1])).toBeCloseTo(RIGHE - 0.5 + FASCIA / 2)
  })

  it('il primo colpo della caduta è quello che conta il codice', () => {
    const cade = CSS.match(/@keyframes f4-cade \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(cade).toContain(`  ${IMPATTO * 100}% {\n    transform: translateY(0);`)
  })

  it('più in alto si ferma il disco, meno dura la caduta', () => {
    for (let r = 1; r < RIGHE; r += 1) expect(durataCaduta(r)).toBeLessThan(durataCaduta(r - 1))
    expect(durataCaduta(0)).toBeLessThan(700)
  })

  it('la fine aspetta la mano, la caduta e la fila fino al suo ultimo disco', () => {
    const colpo = SCIVOLA_MS + durataCaduta(0) * IMPATTO
    // Dall'ultimo disco la fila ne ha al piu' tre per parte: con quattro prima, la partita sarebbe gia' finita.
    expect(attesaFine('forza4')).toBeGreaterThanOrEqual(colpo + 3 * PASSO_FILA_MS)
    expect(attesaFine('pieno')).toBeGreaterThanOrEqual(colpo)
    expect(attesaFine('resa')).toBe(450)
  })
})
