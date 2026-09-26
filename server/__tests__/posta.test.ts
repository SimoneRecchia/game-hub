import { describe, expect, it } from 'vitest'
import { nicknameMessage, resetPasswordMessage } from '../lib/email'

describe('le email per rientrare', () => {
  it('il nickname dimenticato arriva scritto, nel testo e nella versione html', () => {
    const m = nicknameMessage('Giada')
    expect(m.subject).toContain('nickname')
    expect(m.text).toContain('Giada')
    expect(m.html).toContain('Giada')
    // Chi non ricorda nemmeno la password deve sapere dove andare.
    expect(m.text).toContain('Password dimenticata')
  })

  it('il codice per la password dice anche il nickname: il secondo passo lo chiede', () => {
    const m = resetPasswordMessage('Giada', '123456', 15)
    expect(m.text).toContain('Il tuo nickname è: Giada')
    expect(m.html).toContain('Giada')
    expect(m.html).toContain('123456')
  })
})
