/**
 * Regole sugli host, condivise fra browser e Worker.
 *
 * L'hub vive su un sottodominio (per esempio `giochi.esempio.it`) e ogni gioco
 * ha il suo (`wordle.esempio.it`). Sono lo stesso sito servito dallo stesso
 * progetto Pages: il sottodominio decide solo da quale schermata si entra.
 *
 * Due conseguenze da gestire, e stanno entrambe qui:
 *  - riconoscere che `wordle.esempio.it` deve aprire il gioco (non l'hub);
 *  - far valere il cookie di sessione su tutti i sottodomini, altrimenti chi
 *    accede sull'hub risulterebbe sconosciuto sul gioco.
 */

/** Sottodomini che aprono direttamente un gioco, con la rotta di destinazione. */
export const GAME_SUBDOMAINS: Readonly<Record<string, string>> = {
  wordle: '/wordle',
  scarabeo: '/scarabeo',
  cruciverba: '/cruciverba',
}

function labels(hostname: string): string[] {
  return hostname.toLowerCase().replace(/\.$/, '').split('.')
}

/**
 * La rotta da aprire per un host, oppure null se l'host non è di un gioco.
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
