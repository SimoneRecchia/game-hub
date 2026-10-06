import { describe, expect, it } from 'vitest'
import { generateSessionToken, hashSessionToken } from '../session'

describe('i token di sessione', () => {
  it('l’impronta di un token non cambia: le sessioni salvate si ritrovano, e chi è dentro resta dentro', async () => {
    // Calcolata fuori, con SHA-256 e il base64 standard: e' quella che c'e' nel database per ogni sessione.
    expect(await hashSessionToken('gh-sessione-di-prova')).toBe('7ivPDp3OFBP1tP2ztSDlT9S53lgltCj3RM0q/ILvFO8=')
  })

  it('un token è lungo e buono per un cookie', () => {
    const token = generateSessionToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(generateSessionToken()).not.toBe(token)
  })
})
