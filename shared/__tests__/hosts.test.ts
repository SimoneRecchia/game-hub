import { describe, expect, it } from 'vitest'
import { cookieDomainFor, routeForHost } from '../hosts'

describe('rotta a partire dall host', () => {
  it('apre il gioco dal suo sottodominio', () => {
    expect(routeForHost('wordle.esempio.it')).toBe('/wordle')
    expect(routeForHost('WORDLE.Esempio.IT')).toBe('/wordle')
    // Punto finale assoluto: capita nelle richieste generate a mano.
    expect(routeForHost('wordle.esempio.it.')).toBe('/wordle')
  })

  it('non tocca il sottodominio dell hub', () => {
    expect(routeForHost('giochi.esempio.it')).toBeNull()
    expect(routeForHost('game-hub.pages.dev')).toBeNull()
  })

  it('ignora gli host senza terzo livello', () => {
    // In locale il comportamento deve restare quello dell'hub.
    expect(routeForHost('localhost')).toBeNull()
    expect(routeForHost('wordle.localhost')).toBeNull()
    expect(routeForHost('esempio.it')).toBeNull()
  })

  it('non si fa ingannare da un gioco che non e il primo livello', () => {
    expect(routeForHost('esempio.wordle.it')).toBeNull()
    expect(routeForHost('hub.wordle.esempio.it')).toBeNull()
  })

  it('ignora i sottodomini che non sono giochi', () => {
    expect(routeForHost('www.esempio.it')).toBeNull()
    expect(routeForHost('quiz.esempio.it')).toBeNull()
  })
})

describe('dominio del cookie di sessione', () => {
  it('condivide il cookie fra i sottodomini configurati', () => {
    expect(cookieDomainFor('giochi.esempio.it', 'esempio.it')).toBe('esempio.it')
    expect(cookieDomainFor('wordle.esempio.it', 'esempio.it')).toBe('esempio.it')
    expect(cookieDomainFor('esempio.it', 'esempio.it')).toBe('esempio.it')
  })

  it('accetta il dominio scritto con il punto iniziale', () => {
    expect(cookieDomainFor('giochi.esempio.it', '.esempio.it')).toBe('esempio.it')
  })

  it('non e sensibile alle maiuscole', () => {
    expect(cookieDomainFor('Giochi.Esempio.IT', 'ESEMPIO.IT')).toBe('esempio.it')
  })

  it('resta legato all host se non e configurato nulla', () => {
    expect(cookieDomainFor('giochi.esempio.it', undefined)).toBeNull()
    expect(cookieDomainFor('giochi.esempio.it', '')).toBeNull()
  })

  it('scarta un dominio che non copre l host', () => {
    // Il browser rifiuterebbe il cookie senza dire niente, e l'accesso
    // smetterebbe di funzionare in modo difficile da diagnosticare.
    expect(cookieDomainFor('game-hub.pages.dev', 'esempio.it')).toBeNull()
    expect(cookieDomainFor('altro-esempio.it', 'esempio.it')).toBeNull()
    expect(cookieDomainFor('esempio.it.malintenzionato.com', 'esempio.it')).toBeNull()
  })

  it('scarta valori che il browser non accetterebbe', () => {
    expect(cookieDomainFor('localhost', 'localhost')).toBeNull()
    expect(cookieDomainFor('qualcosa.it', 'it')).toBeNull()
    expect(cookieDomainFor('esempio.it', '.')).toBeNull()
  })
})
