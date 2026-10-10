/*
 * Service worker minimale.
 *
 * Strategia:
 *  - asset con hash in /assets/  → cache-first (immutabili)
 *  - dizionario dello Scarabeo   → cache-first (l'impronta sta nell'indirizzo)
 *  - dati del quiz in /dati/     → cache-first (idem)
 *  - navigazioni                 → network-first con fallback all'ultima index, sempre riconvalidate
 *  - /api/*                      → sempre rete, mai cache (punteggi e sessioni)
 */

const VERSION = 'giochi-v2'
const SHELL_CACHE = `${VERSION}-shell`
const ASSET_CACHE = `${VERSION}-assets`
const SHELL_URL = '/index.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([SHELL_URL, '/manifest.webmanifest']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      // Riconvalidata sempre: le pagine sotto /scarabeo/ sono state servite per un po' con un anno di cache,
      // e senza chiedere al server il browser continuerebbe a dare la versione di allora.
      fetch(request, { cache: 'no-cache' })
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy))
          return response
        })
        .catch(() => caches.match(SHELL_URL).then((hit) => hit ?? Response.error())),
    )
    return
  }

  if (/^\/(assets|scarabeo|dati)\//.test(url.pathname) || /\.(png|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            // A un file che non c'e' le Pages rispondono con la pagina dell'app, e un 200: quella non si tiene.
            const pagina = (response.headers.get('content-type') ?? '').includes('text/html')
            if (response.ok && !pagina) {
              const copy = response.clone()
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
  }
})

/*
 * Le notifiche: il messaggio arriva cifrato, il browser lo apre, e qui si
 * mostra (shared/webpush.ts lo scrive: titolo, testo, indirizzo, tag). Una
 * notifica con lo stesso tag prende il posto di quella di prima.
 */
self.addEventListener('push', (event) => {
  let m = {}
  try {
    m = event.data ? event.data.json() : {}
  } catch {
    m = { titolo: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(m.titolo || 'Giochi', {
      body: m.testo || '',
      icon: '/icon-192.png',
      badge: '/icon-monochrome-512.png',
      tag: m.tag || undefined,
      renotify: Boolean(m.tag),
      data: { url: m.url || '/' },
    }),
  )
})

/*
 * Toccandola si va dove dice: nell'app gia' aperta, che sposta la pagina da
 * sola (`vai`, senza ricaricare), o in una finestra nuova.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((finestre) => {
      const aperta = finestre.find((f) => new URL(f.url).origin === self.location.origin)
      if (!aperta) return self.clients.openWindow(url)
      aperta.postMessage({ tipo: 'vai', url })
      return aperta.focus()
    }),
  )
})
