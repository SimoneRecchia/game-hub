/**
 * Derivazione della password, condivisa fra browser e Worker.
 *
 * Il vincolo di piattaforma: le Pages Functions sul piano gratuito hanno
 * 10 ms di CPU per richiesta. Un PBKDF2 con 200.000 iterazioni lato server
 * li sfonderebbe da solo, quindi lo stretching pesante avviene nel browser
 * (che non ha limiti) e il server ne applica solo un secondo strato leggero.
 *
 *   browser:  verifier = PBKDF2(password, salt-dal-nickname, 210.000)
 *   server:   hash     = PBKDF2(verifier, salt-casuale,       12.000)
 *
 * Due conseguenze utili:
 *  - la password in chiaro non lascia mai il dispositivo;
 *  - chi rubasse il database dovrebbe rompere 222.000 iterazioni per password,
 *    con salt diverso per ogni giocatore.
 *
 * Il numero di iterazioni lato server e' salvato per ogni giocatore, così puo'
 * essere alzato in futuro senza invalidare le password esistenti.
 */

/** Iterazioni eseguite nel browser. ~250 ms su un telefono di fascia media. */
export const CLIENT_ITERATIONS = 210_000

/** Iterazioni eseguite nel Worker. Tenute basse per stare nei 10 ms di CPU. */
export const SERVER_ITERATIONS = 12_000

const KEY_BITS = 256
const SALT_BYTES = 16

/** Etichetta di dominio nel salt lato client: lo lega a questa applicazione. */
const CLIENT_SALT_PREFIX = 'game-hub/pwd/v1/'

const encoder = new TextEncoder()

/**
 * Errore riconoscibile per quando il browser non offre WebCrypto.
 *
 * Capita per un motivo solo: `crypto.subtle` esiste unicamente nei contesti
 * sicuri (https, oppure localhost). Aprire il sito su un'origine http che non
 * sia localhost — un IP di rete locale, per esempio — lo rende indisponibile,
 * e senza un errore dedicato l'accesso fallirebbe con un generico "qualcosa e'
 * andato storto" impossibile da diagnosticare.
 */
export class InsecureContextError extends Error {
  constructor() {
    super(
      'Questo browser non permette di cifrare la password su una connessione non sicura. ' +
        'Apri il sito in https.',
    )
    this.name = 'InsecureContextError'
  }
}

function subtle(): SubtleCrypto {
  if (typeof crypto === 'undefined' || !crypto.subtle) throw new InsecureContextError()
  return crypto.subtle
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES))
}

async function pbkdf2(
  secret: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const api = subtle()
  const key = await api.importKey('raw', secret as BufferSource, 'PBKDF2', false, ['deriveBits'])
  const bits = await api.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    KEY_BITS,
  )
  return new Uint8Array(bits)
}

/**
 * Salt lato client, derivato dal nickname.
 *
 * Non e' segreto: serve solo a rendere il verifier specifico per questo
 * giocatore e per questa applicazione. Essendo deterministico, il browser non
 * deve chiedere nulla al server prima di derivarlo — e il server non deve
 * rivelare se un nickname esiste.
 */
async function clientSalt(nicknameLower: string): Promise<Uint8Array> {
  const digest = await subtle().digest('SHA-256', encoder.encode(CLIENT_SALT_PREFIX + nicknameLower))
  return new Uint8Array(digest).slice(0, SALT_BYTES)
}

/**
 * Eseguito nel browser, prima di ogni chiamata di login o registrazione.
 * Restituisce il valore che viene effettivamente inviato al server.
 */
export async function deriveVerifier(nickname: string, password: string): Promise<string> {
  const salt = await clientSalt(nickname.toLowerCase())
  const derived = await pbkdf2(encoder.encode(password), salt, CLIENT_ITERATIONS)
  return toBase64(derived)
}

/** Eseguito nel Worker sul verifier ricevuto. */
export async function hashVerifier(
  verifier: string,
  saltBase64: string,
  iterations: number,
): Promise<string> {
  const derived = await pbkdf2(encoder.encode(verifier), fromBase64(saltBase64), iterations)
  return toBase64(derived)
}

/**
 * Confronto a tempo costante fra due stringhe base64.
 *
 * Un `===` uscirebbe al primo byte diverso, dando a chi misura i tempi un
 * indizio su quanti byte ha indovinato.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
