import { describe, expect, it } from 'vitest'
import { loginMessage } from '../lib/email'

describe('le email per entrare', () => {
  it('il codice per entrare dice anche il nickname: chi entra con l’email può non ricordarlo', () => {
    const m = loginMessage('Giada', '123456', 15)
    expect(m.subject).toContain('123456')
    expect(m.text).toContain('123456')
    expect(m.text).toContain('Il tuo nickname è: Giada')
    expect(m.text).toContain('15 minuti')
    expect(m.html).toContain('Giada')
    expect(m.html).toContain('123456')
  })
})
