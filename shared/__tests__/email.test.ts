import { describe, expect, it } from 'vitest'
import {
  CODE_LENGTH,
  CODE_MAX_ATTEMPTS,
  CODE_RESEND_COOLDOWN_SECONDS,
  CODE_TTL_MINUTES,
  EMAIL_MAX,
  EMAIL_PATTERN,
} from '../config'

describe('forma dell email', () => {
  it('accetta indirizzi normali', () => {
    for (const buona of [
      'simone@simonerecchia.com',
      'nome.cognome@example.co.uk',
      'nome+etichetta@example.org',
      'a@b.io',
      'UPPER@Example.COM',
    ]) {
      expect(EMAIL_PATTERN.test(buona), buona).toBe(true)
    }
  })

  it('rifiuta i refusi evidenti', () => {
    for (const cattiva of [
      '',
      'senzachiocciola.com',
      '@example.com',
      'nome@',
      'nome@example',
      'nome@@example.com',
      'nome @example.com',
      'nome@example .com',
      'nome@.com',
    ]) {
      expect(EMAIL_PATTERN.test(cattiva), cattiva).toBe(false)
    }
  })

  it('non e ancorata male: non accetta testo attorno a un indirizzo valido', () => {
    // Un pattern senza ancore accetterebbe questi due.
    expect(EMAIL_PATTERN.test('scrivimi a nome@example.com grazie')).toBe(false)
    expect(EMAIL_PATTERN.test('nome@example.com\nnome2@example.com')).toBe(false)
  })
})

describe('parametri dei codici', () => {
  it('il codice e abbastanza lungo da non indovinarsi a caso', () => {
    // Sei cifre = un milione di combinazioni; con cinque tentativi la
    // probabilita' di indovinare e' una su duecentomila.
    const combinazioni = 10 ** CODE_LENGTH
    expect(combinazioni / CODE_MAX_ATTEMPTS).toBeGreaterThan(100_000)
  })

  it('la finestra di validita e breve ma usabile', () => {
    expect(CODE_TTL_MINUTES).toBeGreaterThanOrEqual(5)
    expect(CODE_TTL_MINUTES).toBeLessThanOrEqual(30)
  })

  it('l attesa fra due invii sta dentro la validita del codice', () => {
    // Se l'attesa fosse più lunga della validita', chi non riceve la prima
    // email resterebbe bloccato senza poterne chiedere un'altra in tempo.
    expect(CODE_RESEND_COOLDOWN_SECONDS).toBeLessThan(CODE_TTL_MINUTES * 60)
  })

  it('la lunghezza massima dell email e quella dello standard', () => {
    expect(EMAIL_MAX).toBe(254)
  })
})
