import { afterEach, describe, expect, it, vi } from 'vitest'

/** Un documento finto, quanto basta all'orologio: se e' nascosto, e chi ascolta quando cambia. */
function documentoFinto() {
  const ascolta: Array<() => void> = []
  const doc = {
    hidden: false,
    addEventListener: (_: string, f: () => void) => ascolta.push(f),
  }
  return {
    doc,
    cambia(hidden: boolean) {
      doc.hidden = hidden
      ascolta.forEach((f) => f())
    },
  }
}

describe("l'orologio delle libere", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('si ferma a pagina nascosta e riparte da dov era', async () => {
    vi.useFakeTimers({ now: 1_000_000 })
    const finto = documentoFinto()
    vi.stubGlobal('document', finto.doc)
    const { adessoVisibile } = await import('../tempoVisibile')

    const prima = adessoVisibile()
    vi.advanceTimersByTime(5_000)
    expect(adessoVisibile() - prima).toBe(5_000)

    finto.cambia(true)
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(adessoVisibile() - prima).toBe(5_000)

    finto.cambia(false)
    vi.advanceTimersByTime(2_000)
    expect(adessoVisibile() - prima).toBe(7_000)
  })
})
