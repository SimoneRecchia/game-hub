/**
 * Il computer dello Scarabeo, in un Web Worker.
 *
 * Cercare una mossa costa da pochi millisecondi a un paio di decimi di secondo
 * — di piu' con due jolly in mano — e sul filo principale bloccherebbe le
 * animazioni proprio mentre la schermata dice "il computer pensa". Qui gira a
 * parte, e il dizionario si scarica una volta sola, alla prima richiesta.
 *
 * Due domande: quali di queste parole non sono nel dizionario (per dire subito
 * a chi gioca che una parola non esiste, senza aspettare il server), e qual e'
 * la mossa del computer in questa partita libera.
 */

import { Dawg } from '@shared/dawg'
import { sacchettoDaSeme } from '@shared/scarabeo'
import { turnoDelComputer, type PartitaLibera } from '@shared/scarabeo-computer'
import { BYTE_DIZIONARIO, URL_DIZIONARIO, URL_DIZIONARIO_COMPRESSO } from '@shared/scarabeo-dizionario'

type Richiesta =
  | { id: number; tipo: 'prepara' }
  | { id: number; tipo: 'parole'; parole: string[] }
  | { id: number; tipo: 'mossa'; partita: PartitaLibera }

let dizionario: Promise<Dawg> | null = null

function carica(): Promise<Dawg> {
  dizionario ??= scarica().then((buffer) => {
    // Le Pages rispondono con la pagina dell'app a un indirizzo che non c'e': quella non e' un dizionario.
    if (buffer.byteLength !== BYTE_DIZIONARIO) throw new Error('Dizionario non scaricato')
    return Dawg.da(buffer)
  })
  // Un fallimento non resta in memoria: la richiesta dopo riprova.
  dizionario.catch(() => {
    dizionario = null
  })
  return dizionario
}

/**
 * Il file compresso, se il browser lo sa aprire: Cloudflare non comprime i file
 * binari, e intero sarebbe quasi il doppio. Altrimenti, o se la copia compressa
 * non c'e' (in sviluppo la scrive solo il build), il file intero.
 */
async function scarica(): Promise<ArrayBuffer> {
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const risposta = await fetch(URL_DIZIONARIO_COMPRESSO)
      const compresso = new Uint8Array(await risposta.arrayBuffer())
      // I due byte con cui comincia ogni file gzip.
      if (risposta.ok && compresso[0] === 0x1f && compresso[1] === 0x8b) {
        const aperto = new Blob([compresso]).stream().pipeThrough(new DecompressionStream('gzip'))
        return await new Response(aperto).arrayBuffer()
      }
    } catch {
      /* si prova con il file intero */
    }
  }
  const risposta = await fetch(URL_DIZIONARIO)
  if (!risposta.ok) throw new Error(`Dizionario non scaricato (${risposta.status})`)
  return risposta.arrayBuffer()
}

self.onmessage = async (evento: MessageEvent<Richiesta>) => {
  const richiesta = evento.data
  try {
    const dawg = await carica()
    if (richiesta.tipo === 'prepara') {
      self.postMessage({ id: richiesta.id, ok: true })
    } else if (richiesta.tipo === 'parole') {
      self.postMessage({ id: richiesta.id, ok: true, sconosciute: richiesta.parole.filter((p) => !dawg.contiene(p)) })
    } else {
      const mossa = turnoDelComputer(dawg, richiesta.partita, sacchettoDaSeme(richiesta.partita.seme))
      self.postMessage({ id: richiesta.id, ok: true, mossa })
    }
  } catch (errore) {
    self.postMessage({ id: richiesta.id, ok: false, errore: errore instanceof Error ? errore.message : String(errore) })
  }
}
