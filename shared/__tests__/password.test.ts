import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CLIENT_ITERATIONS,
  InsecureContextError,
  SERVER_ITERATIONS,
  constantTimeEqual,
  deriveVerifier,
  fromBase64,
  hashVerifier,
  randomSalt,
  toBase64,
} from '../password'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('codifica base64', () => {
  it('e reversibile su byte arbitrari', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 42])
    expect([...fromBase64(toBase64(bytes))]).toEqual([...bytes])
  })

  it('regge un salt casuale', () => {
    const salt = randomSalt()
    expect(salt).toHaveLength(16)
    expect([...fromBase64(toBase64(salt))]).toEqual([...salt])
  })
})

describe('derivazione del verifier', () => {
  it('e deterministica: stesso nickname e password, stesso verifier', async () => {
    const a = await deriveVerifier('simone', 'password-lunga')
    const b = await deriveVerifier('simone', 'password-lunga')
    expect(a).toBe(b)
  })

  it('non distingue le maiuscole nel nickname', async () => {
    // Il salt viene dal nickname minuscolo, come fa il server per l'unicita'.
    expect(await deriveVerifier('Simone', 'password-lunga')).toBe(
      await deriveVerifier('simone', 'password-lunga'),
    )
  })

  it('cambia se cambia la password', async () => {
    expect(await deriveVerifier('simone', 'password-lunga')).not.toBe(
      await deriveVerifier('simone', 'password-lungh'),
    )
  })

  it('cambia se cambia il nickname: il salt lo lega al giocatore', async () => {
    expect(await deriveVerifier('simone', 'password-lunga')).not.toBe(
      await deriveVerifier('giulia', 'password-lunga'),
    )
  })

  it('produce 32 byte in base64', async () => {
    const verifier = await deriveVerifier('simone', 'password-lunga')
    expect(verifier).toHaveLength(44)
    expect(fromBase64(verifier)).toHaveLength(32)
  })
})

describe('hash lato server', () => {
  it('con lo stesso salt da lo stesso hash', async () => {
    const salt = toBase64(randomSalt())
    const verifier = await deriveVerifier('simone', 'password-lunga')
    expect(await hashVerifier(verifier, salt, SERVER_ITERATIONS)).toBe(
      await hashVerifier(verifier, salt, SERVER_ITERATIONS),
    )
  })

  it('con salt diversi da hash diversi', async () => {
    const verifier = await deriveVerifier('simone', 'password-lunga')
    const uno = await hashVerifier(verifier, toBase64(randomSalt()), SERVER_ITERATIONS)
    const due = await hashVerifier(verifier, toBase64(randomSalt()), SERVER_ITERATIONS)
    expect(uno).not.toBe(due)
  })
})

describe('confronto a tempo costante', () => {
  it('riconosce l uguaglianza', () => {
    expect(constantTimeEqual('abc123', 'abc123')).toBe(true)
  })

  it('riconosce la differenza, anche solo sull ultimo carattere', () => {
    expect(constantTimeEqual('abc123', 'abc124')).toBe(false)
    expect(constantTimeEqual('abc123', 'Abc123')).toBe(false)
  })

  it('rifiuta lunghezze diverse', () => {
    expect(constantTimeEqual('abc', 'abcd')).toBe(false)
  })
})

describe('contesto non sicuro', () => {
  it('solleva un errore riconoscibile quando WebCrypto non c e', async () => {
    // E' il caso di un sito aperto in http su un host diverso da localhost:
    // `crypto.subtle` non esiste e senza questo errore l'accesso fallirebbe
    // con un messaggio che non dice cosa fare.
    vi.stubGlobal('crypto', { getRandomValues: () => new Uint8Array(16) })
    await expect(deriveVerifier('simone', 'password-lunga')).rejects.toBeInstanceOf(
      InsecureContextError,
    )
    await expect(deriveVerifier('simone', 'password-lunga')).rejects.toThrow(/https/)
  })
})

describe('numero di iterazioni', () => {
  it('il grosso del lavoro sta nel browser', () => {
    // E' la scelta imposta dai 10 ms di CPU per richiesta delle Pages
    // Functions sul piano gratuito.
    expect(CLIENT_ITERATIONS).toBeGreaterThan(SERVER_ITERATIONS * 10)
  })
})
