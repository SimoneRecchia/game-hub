/**
 * Un set proprio in un file, per mandarlo a un amico o a un altro telefono:
 * i nomi e le foto dentro un JSON, le foto in base64. Si manda come un
 * documento qualunque — WhatsApp, la posta — e si apre dal set nuovo. E' anche
 * il ripiego quando le foto non passano da un telefono all'altro. Un
 * personaggio senza foto c'e' con il nome solo; i file di prima le avevano
 * tutte, e si aprono uguali.
 */

import { VOCI_MINIME, VOCI_SET_MASSIME, pulisciNome, NOME_SET_MASSIMO, type Voce } from '@shared/indovina'
import type { SetProprio } from './archivio'
import { leggiImmagine } from './archivio'
import { impronta } from './foto'

const TIPO = 'indovina-chi-set'

interface FileSet {
  tipo: typeof TIPO
  versione: 1
  nome: string
  voci: { nome: string; jpeg?: string }[]
}

async function inBase64(blob: Blob): Promise<string> {
  const byte = new Uint8Array(await blob.arrayBuffer())
  let binario = ''
  for (let i = 0; i < byte.length; i += 0x8000) binario += String.fromCharCode(...byte.subarray(i, i + 0x8000))
  return btoa(binario)
}

function daBase64(testo: string): Blob {
  const binario = atob(testo)
  const byte = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i += 1) byte[i] = binario.charCodeAt(i)
  return new Blob([byte], { type: 'image/jpeg' })
}

/** Il file di un set, pronto da condividere. */
export async function fileDelSet(set: SetProprio): Promise<File> {
  const voci: FileSet['voci'] = []
  for (const v of set.voci) {
    const blob = v.img ? await leggiImmagine(v.img) : null
    voci.push(blob ? { nome: v.nome, jpeg: await inBase64(blob) } : { nome: v.nome })
  }
  const contenuto: FileSet = { tipo: TIPO, versione: 1, nome: set.nome, voci }
  const nome = `${set.nome.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'set'}.indovinachi.json`
  return new File([JSON.stringify(contenuto)], nome, { type: 'application/json' })
}

/** Un set letto da un file: i nomi e le foto, con le impronte ricalcolate qui. */
export async function setDalFile(file: File): Promise<{ nome: string; voci: (Voce & { blob?: Blob })[] }> {
  const dati = JSON.parse(await file.text()) as Partial<FileSet>
  if (dati.tipo !== TIPO || !Array.isArray(dati.voci)) throw new Error('Non è un set di Indovina chi.')
  const voci: (Voce & { blob?: Blob })[] = []
  for (const v of dati.voci.slice(0, VOCI_SET_MASSIME)) {
    const nome = pulisciNome(v?.nome)
    if (typeof v?.jpeg === 'string') {
      const blob = daBase64(v.jpeg)
      voci.push({ nome, img: await impronta(blob), blob })
    } else if (nome) {
      voci.push({ nome })
    }
  }
  if (voci.length < VOCI_MINIME) throw new Error('Nel file ci sono troppo pochi personaggi.')
  return { nome: pulisciNome(dati.nome, NOME_SET_MASSIMO) || 'Set importato', voci }
}

/** Cosa manca a un set per giocarci: null se e' pronto. */
export function problemaDelSet(set: Pick<SetProprio, 'voci'>): string | null {
  if (set.voci.length < VOCI_MINIME) return `Servono almeno ${VOCI_MINIME} personaggi.`
  if (set.voci.length > VOCI_SET_MASSIME) return `Al massimo ${VOCI_SET_MASSIME} personaggi.`
  if (set.voci.some((v) => !pulisciNome(v.nome))) return 'Dai un nome a tutti i personaggi.'
  const nomi = set.voci.map((v) => pulisciNome(v.nome).toLowerCase())
  if (new Set(nomi).size !== nomi.length) return 'Due personaggi hanno lo stesso nome.'
  return null
}

/**
 * I nomi di un elenco scritto o incollato, per un set di soli nomi: uno per
 * riga, o separati da virgole se e' una riga sola ("Anna, Bruno, Carla").
 * Ripuliti, senza i doppioni e senza i nomi che il set ha gia', fino al posto
 * che resta; quanti ne restano fuori lo si dice.
 */
export function nomiDaElenco(
  testo: string,
  esistenti: readonly string[],
  posto: number,
): { nomi: string[]; doppi: number; oltre: number } {
  const righe = testo.split(/\r?\n/).filter((r) => r.trim() !== '')
  const pezzi = righe.length === 1 ? righe[0].split(/[,;]/) : righe
  const visti = new Set(esistenti.map((n) => pulisciNome(n).toLowerCase()).filter(Boolean))
  const nomi: string[] = []
  let doppi = 0
  let oltre = 0
  for (const pezzo of pezzi) {
    // Gli elenchi incollati portano spesso i loro segni: "1. Anna", "- Bruno", "• Carla".
    const nome = pulisciNome(pezzo.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, ''))
    if (!nome) continue
    if (visti.has(nome.toLowerCase())) {
      doppi += 1
      continue
    }
    if (nomi.length >= posto) {
      oltre += 1
      continue
    }
    visti.add(nome.toLowerCase())
    nomi.push(nome)
  }
  return { nomi, doppi, oltre }
}
