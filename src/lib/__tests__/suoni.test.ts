import { describe, expect, it } from 'vitest'
import { PARTITURE, impostaSuoni, preparaUscita, suona, suoniAttivi, type NomeSuono } from '../suoni'

/**
 * Un contesto audio finto: registra le sorgenti che partono e controlla i
 * valori che riceve. Web Audio lancia un'eccezione per una rampa esponenziale
 * verso zero, e un NaN in un parametro ammutolisce la voce senza dire niente:
 * qui tutti e due diventano un errore del test.
 */
function contestoFinto() {
  const partite: number[] = []
  const controlla = (v: number, t: number, esponenziale = false) => {
    if (!Number.isFinite(v) || !Number.isFinite(t) || t < 0) throw new Error(`valore non valido: ${v} a ${t}`)
    if (esponenziale && v <= 0) throw new Error(`rampa esponenziale verso ${v}`)
  }
  const parametro = () => ({
    value: 0,
    setValueAtTime: (v: number, t: number) => controlla(v, t),
    linearRampToValueAtTime: (v: number, t: number) => controlla(v, t),
    exponentialRampToValueAtTime: (v: number, t: number) => controlla(v, t, true),
    setTargetAtTime: (v: number, t: number) => controlla(v, t),
  })
  const nodo = () => ({ connect: (altro: unknown) => altro, disconnect: () => {} })
  const sorgente = () => ({
    ...nodo(),
    type: 'sine',
    buffer: null as unknown,
    frequency: parametro(),
    start: (t = 0) => {
      controlla(0, t)
      partite.push(t)
    },
    stop: (t = 0) => controlla(0, t),
  })
  const ctx = {
    sampleRate: 8000,
    currentTime: 0,
    destination: nodo(),
    createGain: () => ({ ...nodo(), gain: parametro() }),
    createOscillator: sorgente,
    createBufferSource: sorgente,
    createBiquadFilter: () => ({ ...nodo(), type: 'lowpass', frequency: parametro(), Q: parametro() }),
    createConvolver: () => ({ ...nodo(), buffer: null as unknown }),
    createDynamicsCompressor: () => ({
      ...nodo(),
      threshold: parametro(),
      knee: parametro(),
      ratio: parametro(),
      attack: parametro(),
      release: parametro(),
    }),
    createBuffer: (canali: number, n: number) => {
      const dati = Array.from({ length: canali }, () => new Float32Array(n))
      return { getChannelData: (c: number) => dati[c] }
    },
  }
  return { ctx: ctx as unknown as BaseAudioContext, partite }
}

describe('i suoni', () => {
  it('ogni suono del catalogo si suona, con valori validi per Web Audio', () => {
    for (const nome of Object.keys(PARTITURE) as NomeSuono[]) {
      const { ctx, partite } = contestoFinto()
      expect(() => PARTITURE[nome](preparaUscita(ctx), 0.1, 1), nome).not.toThrow()
      expect(partite.length, nome).toBeGreaterThan(0)
      // Niente prima dell'istante chiesto: un suono non parte in anticipo.
      expect(Math.min(...partite), nome).toBeGreaterThanOrEqual(0.1)
    }
  })

  it('si spengono e si riaccendono, e senza audio suonare non fa niente', () => {
    impostaSuoni(false)
    expect(suoniAttivi()).toBe(false)
    expect(() => suona('vittoria')).not.toThrow()
    impostaSuoni(true)
    expect(suoniAttivi()).toBe(true)
    // Qui non c'e' un contesto audio: `suona` deve lasciar correre.
    expect(() => suona('giusto', { ritardo: 0.2 })).not.toThrow()
  })
})
