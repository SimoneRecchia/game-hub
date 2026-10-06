/**
 * Base64 standard di una sequenza di byte, come la scrive `btoa`.
 *
 * Con questa si scrivono le impronte dei token di sessione e dei codici: deve
 * restare la stessa, altrimenti le sessioni salvate non si ritroverebbero piu'
 * e chi e' dentro verrebbe buttato fuori.
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
