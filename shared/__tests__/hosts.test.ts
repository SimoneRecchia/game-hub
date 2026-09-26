import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GAME_SUBDOMAINS, cookieDomainFor, indirizzoCanonico, routeForHost } from '../hosts'

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

  it('porta la battaglia al suo indirizzo con il nome intero', () => {
    expect(routeForHost('battaglia.esempio.it')).toBe('/battaglia-navale')
  })
})

/** Un indirizzo come lo vede `location`. */
function url(testo: string) {
  const u = new URL(testo)
  return { protocol: u.protocol, hostname: u.hostname, port: u.port, pathname: u.pathname, search: u.search, hash: u.hash }
}

describe('indirizzo canonico', () => {
  it('porta la radice di un sottodominio alla pagina del gioco', () => {
    expect(indirizzoCanonico(url('https://wordle.esempio.it/'))).toBe('https://giochi.esempio.it/wordle')
    expect(indirizzoCanonico(url('https://battaglia.esempio.it'))).toBe('https://giochi.esempio.it/battaglia-navale')
  })

  it('tiene il percorso, la query e il frammento', () => {
    expect(indirizzoCanonico(url('https://battaglia.esempio.it/battaglia/abc?x=1#y'))).toBe(
      'https://giochi.esempio.it/battaglia/abc?x=1#y',
    )
  })

  it('tiene la porta, se c e', () => {
    // Trovato provando in locale: senza, `wordle.x.localhost:8788` portava alla porta 80.
    expect(indirizzoCanonico(url('http://wordle.prova.localhost:8788/'))).toBe('http://giochi.prova.localhost:8788/wordle')
  })

  it('non tocca l indirizzo dell app, ne gli host senza terzo livello', () => {
    expect(indirizzoCanonico(url('https://giochi.esempio.it/wordle'))).toBeNull()
    expect(indirizzoCanonico(url('http://localhost:5173/'))).toBeNull()
    expect(indirizzoCanonico(url('https://game-hub-43l.pages.dev/'))).toBeNull()
  })
})

/**
 * Lo script in testa a index.html fa la stessa cosa prima che parta l'app —
 * non puo' importare questo modulo, gira prima del bundle. Qui lo si esegue con
 * una `location` finta e lo si confronta con `indirizzoCanonico`: se uno dei
 * due cambia da solo, questo test cade.
 */
describe('lo script dei sottodomini in index.html', () => {
  const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8')
  const script = /<script data-sottodomini>([\s\S]*?)<\/script>/.exec(html)?.[1]

  function esegui(testo: string): string | null {
    let portato: string | null = null
    const location = { ...url(testo), replace: (a: string) => (portato = a) }
    new Function('location', script!)(location)
    return portato
  }

  it('c e', () => {
    expect(script).toBeTruthy()
  })

  it('conosce gli stessi giochi', () => {
    for (const sotto of Object.keys(GAME_SUBDOMAINS)) {
      expect(esegui(`https://${sotto}.esempio.it/`)).toBe(indirizzoCanonico(url(`https://${sotto}.esempio.it/`)))
    }
  })

  it('porta dove porta il codice condiviso', () => {
    for (const caso of [
      'https://wordle.esempio.it/wordle/3',
      'http://scarabeo.prova.localhost:8788/',
      'https://battaglia.esempio.it/battaglia/abc?x=1#y',
      'https://giochi.esempio.it/',
      'https://WORDLE.esempio.it/',
      'http://localhost:8788/',
      'https://www.esempio.it/',
    ]) {
      expect(esegui(caso)).toBe(indirizzoCanonico(url(caso)))
    }
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
