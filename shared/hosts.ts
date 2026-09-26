/**
 * Regole sugli host, condivise fra browser e Worker.
 *
 * L'app ha un indirizzo solo, `giochi.esempio.it`, e ogni gioco ci sta dentro
 * con il suo nome: `giochi.esempio.it/wordle`, `/battaglia-navale`. I
 * sottodomini dei giochi (`wordle.esempio.it`) sono rimasti come scorciatoie:
 * portano all'indirizzo vero, cosi' un link vecchio o un'icona sulla Home non
 * si rompono, ma l'app non vive su cinque indirizzi diversi.
 *
 * Due cose da gestire, e stanno entrambe qui:
 *  - dove porta un sottodominio di gioco (`indirizzoCanonico`, che lo script
 *    in testa a index.html ripete: un test li tiene d'accordo);
 *  - far valere il cookie di sessione su tutti i sottodomini, altrimenti chi
 *    arriva da una scorciatoia risulterebbe sconosciuto.
 */

/** Il sottodominio dell'app. */
export const APP_SUBDOMAIN = 'giochi'

/** Sottodomini che portano a un gioco, con il suo indirizzo nell'app. */
export const GAME_SUBDOMAINS: Readonly<Record<string, string>> = {
  wordle: '/wordle',
  scarabeo: '/scarabeo',
  cruciverba: '/cruciverba',
  battaglia: '/battaglia-navale',
}

function labels(hostname: string): string[] {
  return hostname.toLowerCase().replace(/\.$/, '').split('.')
}

/**
 * La rotta del gioco di un host, oppure null se l'host non è di un gioco.
 *
 * Serve almeno un dominio di terzo livello: `wordle.localhost` in sviluppo non
 * viene riconosciuto di proposito, così il comportamento in locale resta
 * identico a quello dell'hub.
 */
export function routeForHost(hostname: string): string | null {
  const parts = labels(hostname)
  if (parts.length < 3) return null
  return GAME_SUBDOMAINS[parts[0]] ?? null
}

/**
 * Dove porta un indirizzo aperto sul sottodominio di un gioco, oppure null se
 * e' gia' quello giusto.
 *
 * La radice porta alla pagina del gioco (`wordle.esempio.it` →
 * `giochi.esempio.it/wordle`); un percorso resta quello (`battaglia.esempio.it/
 * battaglia/abc` → `giochi.esempio.it/battaglia/abc`), e ci pensano le rotte
 * dei vecchi indirizzi a portarlo dove sta adesso.
 */
export function indirizzoCanonico(url: {
  protocol: string
  hostname: string
  /** Vuota sulle porte di default: in produzione non c'e', in locale si'. */
  port: string
  pathname: string
  search: string
  hash: string
}): string | null {
  const rotta = routeForHost(url.hostname)
  if (!rotta) return null
  const parts = labels(url.hostname)
  parts[0] = APP_SUBDOMAIN
  const porta = url.port ? `:${url.port}` : ''
  const percorso = url.pathname === '/' || url.pathname === '' ? rotta : url.pathname
  return `${url.protocol}//${parts.join('.')}${porta}${percorso}${url.search}${url.hash}`
}

/**
 * Il valore da usare come `Domain` del cookie di sessione.
 *
 * Restituisce null quando il cookie deve restare legato al solo host: è il caso
 * dello sviluppo locale, di `*.pages.dev` e di qualunque configurazione in cui
 * il dominio impostato non corrisponde all'host della richiesta.
 *
 * Il controllo di corrispondenza non è formale: un `Domain` che non copre
 * l'host viene scartato dal browser senza dire niente, e l'accesso smetterebbe
 * di funzionare in un modo difficile da diagnosticare. Meglio degradare a
 * cookie del singolo host, che funziona sempre.
 */
export function cookieDomainFor(hostname: string, configured: string | undefined): string | null {
  if (!configured) return null

  const domain = configured.toLowerCase().replace(/^\./, '').replace(/\.$/, '')
  if (domain === '' || domain === 'localhost') return null
  // Un dominio di primo livello come `it` o `com` verrebbe rifiutato comunque.
  if (!domain.includes('.')) return null

  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (host !== domain && !host.endsWith(`.${domain}`)) return null

  return domain
}
