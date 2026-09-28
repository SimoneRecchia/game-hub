/**
 * Le foto dei set propri, preparate nel telefono prima di salvarle: un
 * quadrato di 256 punti, in JPEG. Basta per una carta del tabellone anche su
 * uno schermo tre volte piu' fitto, e pesa una ventina di kB: un set intero
 * passa da un telefono all'altro in un attimo.
 *
 * Il quadrato e' preso al centro in larghezza e un po' piu' in alto del
 * centro in altezza: nelle foto in piedi la faccia sta nel terzo di sopra, e un
 * taglio al centro lascerebbe il mento e il collo.
 */

export const LATO_FOTO = 256
const QUALITA = 0.82
/** Dove cade il quadrato in una foto piu' alta che larga: 0 in cima, 0,5 al centro. */
const IN_ALTO = 0.3

/** L'impronta di un'immagine: i primi sedici byte del suo SHA-256, in esadecimale. */
export async function impronta(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function decodifica(file: Blob): Promise<{ sorgente: CanvasImageSource; larghezza: number; altezza: number }> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { sorgente: bitmap, larghezza: bitmap.width, altezza: bitmap.height }
    } catch {
      /* formati che il bitmap non legge: si prova con un'immagine */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { sorgente: img, larghezza: img.naturalWidth, altezza: img.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Una foto scelta dalla galleria, pronta per un set: il quadrato in JPEG e la sua impronta. */
export async function preparaFoto(file: Blob): Promise<{ blob: Blob; hash: string }> {
  const { sorgente, larghezza, altezza } = await decodifica(file)
  if (!larghezza || !altezza) throw new Error('Immagine vuota')
  const lato = Math.min(larghezza, altezza)
  const sx = (larghezza - lato) / 2
  const sy = (altezza - lato) * (altezza > larghezza ? IN_ALTO : 0.5)
  const tela = document.createElement('canvas')
  tela.width = LATO_FOTO
  tela.height = LATO_FOTO
  const ctx = tela.getContext('2d')
  if (!ctx) throw new Error('Canvas non disponibile')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(sorgente, sx, sy, lato, lato, 0, 0, LATO_FOTO, LATO_FOTO)
  if ('close' in sorgente && typeof sorgente.close === 'function') sorgente.close()
  const blob = await new Promise<Blob | null>((risolvi) => tela.toBlob(risolvi, 'image/jpeg', QUALITA))
  if (!blob) throw new Error('Foto non convertita')
  return { blob, hash: await impronta(blob) }
}

/**
 * Un nome di partenza dal nome del file: "giulia_mare.jpg" diventa "Giulia
 * mare", mentre "IMG_2041.HEIC" non dice niente e resta vuoto.
 */
export function nomeDaFile(nomeFile: string): string {
  const base = nomeFile.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').trim()
  if (!/[a-zà-ú]{2}/i.test(base) || /^(img|dsc|dscn|pxl|photo|foto|image|immagine|screenshot|whatsapp)(?=\d|\s|$)/i.test(base)) {
    return ''
  }
  const pulito = base.replace(/\s+/g, ' ').slice(0, 20).trim()
  return pulito.charAt(0).toUpperCase() + pulito.slice(1)
}
