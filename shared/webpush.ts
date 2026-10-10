/**
 * Le notifiche push del Web, senza librerie: la cifratura del messaggio
 * (`aes128gcm`, RFC 8291) e la firma di chi lo manda (VAPID, RFC 8292), con
 * WebCrypto, che c'e' nel Worker, nel browser e in Node. Il Worker manda le
 * notifiche che nascono da una richiesta — un invito, una mossa —, gli script
 * della notte quelle a orario, con lo stesso codice.
 *
 * Il telefono si iscrive con la chiave pubblica di chi manda (`ChiaviVapid`) e
 * da' un indirizzo del suo servizio di notifiche (`endpoint`, di Google, Apple
 * o Mozilla) con le sue due chiavi: il messaggio si cifra per lui, cosi' il
 * servizio lo porta senza poterlo leggere, e si firma, cosi' il servizio sa che
 * viene da chi l'iscrizione l'ha chiesta.
 */

export interface IscrizionePush {
  endpoint: string
  /** La chiave pubblica del telefono, P-256 non compressa, in base64url. */
  p256dh: string
  /** Il segreto di autenticazione del telefono, sedici byte in base64url. */
  auth: string
}

/** Una chiave in JWK: i campi di una P-256. */
export interface ChiaveJwk {
  kty: string
  crv?: string
  x?: string
  y?: string
  d?: string
  ext?: boolean
  key_ops?: string[]
}

export interface ChiaviVapid {
  /** La chiave pubblica, P-256 non compressa, in base64url: quella che il telefono usa per iscriversi. */
  pubblica: string
  /** La privata, in JWK: resta sul server. */
  privata: ChiaveJwk
}

/**
 * WebCrypto con i tipi che servono qui. Il browser, Node e il Worker la
 * dichiarano ognuno a modo suo — il Worker chiama `$public` il campo che il
 * runtime, come lo standard, chiama `public` — ed e' la stessa: questo file sta
 * in tutti e tre.
 */
type Chiave = { readonly __chiave: unique symbol }
interface SubtleCrypto {
  generateKey(algoritmo: object, estraibile: boolean, usi: string[]): Promise<{ publicKey: Chiave; privateKey: Chiave }>
  exportKey(formato: 'raw', chiave: Chiave): Promise<ArrayBuffer>
  exportKey(formato: 'jwk', chiave: Chiave): Promise<ChiaveJwk>
  importKey(formato: 'raw' | 'jwk', dati: Uint8Array | ChiaveJwk, algoritmo: object | string, estraibile: boolean, usi: string[]): Promise<Chiave>
  sign(algoritmo: object, chiave: Chiave, dati: Uint8Array): Promise<ArrayBuffer>
  deriveBits(algoritmo: object, chiave: Chiave, bit: number): Promise<ArrayBuffer>
  encrypt(algoritmo: object, chiave: Chiave, dati: Uint8Array): Promise<ArrayBuffer>
}
const subtle = (): SubtleCrypto => (globalThis as unknown as { crypto: { subtle: SubtleCrypto } }).crypto.subtle

/** Quel che arriva al telefono, e che il service worker mostra. */
export interface MessaggioPush {
  titolo: string
  testo: string
  /** Dove porta toccandola, un indirizzo dell'app. */
  url: string
  /** Una notifica con lo stesso `tag` sostituisce quella di prima invece di aggiungersi. */
  tag?: string
}

const testo = new TextEncoder()

export function base64url(dati: Uint8Array): string {
  let s = ''
  for (const b of dati) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function daBase64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

function unisci(...parti: Uint8Array[]): Uint8Array {
  const tutto = new Uint8Array(parti.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parti) {
    tutto.set(p, i)
    i += p.length
  }
  return tutto
}

/** Una chiave P-256 da quella pubblica non compressa (65 byte) e, se c'e', dalla privata (32). */
function jwkDi(pubblica: Uint8Array, privata?: Uint8Array): ChiaveJwk {
  return {
    kty: 'EC',
    crv: 'P-256',
    x: base64url(pubblica.slice(1, 33)),
    y: base64url(pubblica.slice(33, 65)),
    ...(privata ? { d: base64url(privata) } : {}),
    ext: true,
  }
}

/** Un paio di chiavi nuove per firmare: si fanno una volta, e si tengono. */
export async function nuoveChiaviVapid(): Promise<ChiaviVapid> {
  const k = await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const pubblica = new Uint8Array(await subtle().exportKey('raw', k.publicKey))
  const privata = await subtle().exportKey('jwk', k.privateKey)
  return { pubblica: base64url(pubblica), privata }
}

/** Una chiave pubblica valida: P-256 non compressa, 65 byte che cominciano con 4. */
export function chiavePubblicaValida(s: unknown): s is string {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]{86,88}$/.test(s)) return false
  const b = daBase64url(s)
  return b.length === 65 && b[0] === 4
}

/** Un segreto di autenticazione valido: sedici byte. */
export function segretoValido(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9_-]{22,24}$/.test(s) && daBase64url(s).length === 16
}

/**
 * La firma VAPID: un JWT ES256 per l'origine del servizio di notifiche, che
 * scade fra dodici ore (il massimo e' un giorno). `sub` e' come contattare chi
 * manda: un indirizzo https dell'app.
 */
export async function firmaVapid(audience: string, chiavi: ChiaviVapid, sub: string, adesso = Date.now()) {
  const json = (o: unknown) => base64url(testo.encode(JSON.stringify(o)))
  const corpo = `${json({ typ: 'JWT', alg: 'ES256' })}.${json({ aud: audience, exp: Math.floor(adesso / 1000) + 12 * 3600, sub })}`
  const chiave = await subtle().importKey('jwk', chiavi.privata, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  // WebCrypto restituisce la firma come r||s, che e' quel che vuole un JWT.
  const firma = new Uint8Array(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, chiave, testo.encode(corpo)))
  return `${corpo}.${base64url(firma)}`
}

async function hkdf(sale: Uint8Array, materiale: Uint8Array, info: Uint8Array, byte: number): Promise<Uint8Array> {
  const chiave = await subtle().importKey('raw', materiale, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sale, info }, chiave, byte * 8))
}

/**
 * Il corpo cifrato di una notifica, come lo vuole RFC 8291: la sale, la
 * dimensione del record, la chiave pubblica effimera di chi manda, poi il
 * messaggio cifrato con AES-128-GCM, in un record solo. `prova` fissa la sale e
 * la chiave effimera, per il vettore d'esempio dell'RFC: altrimenti sono nuove a
 * ogni messaggio, come devono.
 */
export async function cifra(
  iscrizione: Pick<IscrizionePush, 'p256dh' | 'auth'>,
  messaggio: Uint8Array,
  prova?: { sale: Uint8Array; privata: Uint8Array; pubblica: Uint8Array },
): Promise<Uint8Array> {
  const delTelefono = daBase64url(iscrizione.p256dh)
  const segreto = daBase64url(iscrizione.auth)
  const sale = prova?.sale ?? crypto.getRandomValues(new Uint8Array(16))
  let mia: Chiave
  let miaPubblica: Uint8Array
  if (prova) {
    mia = await subtle().importKey('jwk', jwkDi(prova.pubblica, prova.privata), { name: 'ECDH', namedCurve: 'P-256' }, false, [
      'deriveBits',
    ])
    miaPubblica = prova.pubblica
  } else {
    const k = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    mia = k.privateKey
    miaPubblica = new Uint8Array(await subtle().exportKey('raw', k.publicKey))
  }
  const sua = await subtle().importKey('raw', delTelefono, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const condiviso = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: sua }, mia, 256))

  const ikm = await hkdf(segreto, condiviso, unisci(testo.encode('WebPush: info\0'), delTelefono, miaPubblica), 32)
  const cek = await hkdf(sale, ikm, testo.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(sale, ikm, testo.encode('Content-Encoding: nonce\0'), 12)
  const chiave = await subtle().importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // Il delimitatore 2 chiude l'ultimo (e unico) record, senza riempimento.
  const cifrato = new Uint8Array(
    await subtle().encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, chiave, unisci(messaggio, Uint8Array.of(2))),
  )
  const record = 4096
  const intestazione = unisci(
    sale,
    Uint8Array.of(record >>> 24, (record >>> 16) & 255, (record >>> 8) & 255, record & 255),
    Uint8Array.of(miaPubblica.length),
    miaPubblica,
  )
  return unisci(intestazione, cifrato)
}

/** La richiesta da mandare al servizio di notifiche del telefono. */
export async function richiestaPush(
  iscrizione: IscrizionePush,
  messaggio: MessaggioPush,
  chiavi: ChiaviVapid,
  { sub, ttl = 3600, urgente = false }: { sub: string; ttl?: number; urgente?: boolean },
): Promise<{ url: string; init: RequestInit }> {
  const jwt = await firmaVapid(new URL(iscrizione.endpoint).origin, chiavi, sub)
  const corpo = await cifra(iscrizione, testo.encode(JSON.stringify(messaggio)))
  return {
    url: iscrizione.endpoint,
    init: {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${jwt}, k=${chiavi.pubblica}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttl),
        Urgency: urgente ? 'high' : 'normal',
      },
      body: corpo,
    },
  }
}

/**
 * Manda una notifica. `morta` vuol dire che l'iscrizione non vale piu' — il
 * telefono ha tolto il permesso, o l'app — e va cancellata.
 */
export async function mandaPush(
  iscrizione: IscrizionePush,
  messaggio: MessaggioPush,
  chiavi: ChiaviVapid,
  opzioni: { sub: string; ttl?: number; urgente?: boolean },
): Promise<{ stato: number; morta: boolean }> {
  try {
    const { url, init } = await richiestaPush(iscrizione, messaggio, chiavi, opzioni)
    const risposta = await fetch(url, init)
    return { stato: risposta.status, morta: risposta.status === 404 || risposta.status === 410 }
  } catch {
    return { stato: 0, morta: false }
  }
}

/** Un indirizzo di un servizio di notifiche: https, e non troppo lungo da tenere. */
export function endpointValido(s: unknown): s is string {
  if (typeof s !== 'string' || s.length > 600) return false
  try {
    return new URL(s).protocol === 'https:'
  } catch {
    return false
  }
}
