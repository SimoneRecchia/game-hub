/**
 * Il computer dello Scarabeo, in un Web Worker.
 *
 * Cercare una mossa costa da pochi millisecondi a un paio di decimi di secondo
 * — di piu' con due jolly in mano — e sul filo principale bloccherebbe le
 * animazioni proprio mentre la schermata dice "il computer pensa". Qui gira a
 * parte, e il dizionario si scarica una volta sola, alla prima richiesta.
 *
 * Tre domande: quali di queste parole non sono nel dizionario (per dire subito
 * a chi gioca che una parola non esiste, senza aspettare il server), qual e' la
 * mossa del computer in questa partita libera, e quale la risposta del computer
 * del giorno nella classificata, che va al server con la mossa di chi gioca.
 * E una del Paroliere libero, che usa lo stesso dizionario: una griglia, con
 * tutte le sue parole.
 */

import { Dawg } from '@shared/dawg'
import { sacchettoDaSeme, type Mossa } from '@shared/scarabeo'
import { rispostaDelGiorno, turnoDelComputer, type PartitaLibera } from '@shared/scarabeo-computer'
import { BYTE_DIZIONARIO, URL_DIZIONARIO, URL_DIZIONARIO_COMPRESSO } from '@shared/scarabeo-dizionario'
import { mulberry32 } from '@shared/daily'
import { grigliaLibera } from '@shared/paroliere'

type Richiesta =
  | { id: number; tipo: 'prepara' }
  | { id: number; tipo: 'parole'; parole: string[] }
  | { id: number; tipo: 'mossa'; partita: PartitaLibera }
  | { id: number; tipo: 'risposta'; numero: number; mosse: Mossa[] }
  | { id: number; tipo: 'paroliere'; lato: number; seme?: number }

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
    } else if (richiesta.tipo === 'paroliere') {
      // Con il seme di una sfida i dadi cadono uguali sui due telefoni; senza, a caso.
      const caso = richiesta.seme !== undefined ? mulberry32(richiesta.seme) : Math.random
      self.postMessage({ id: richiesta.id, ok: true, ...grigliaLibera(dawg, richiesta.lato, caso) })
    } else if (richiesta.tipo === 'risposta') {
      const mossa = rispostaDelGiorno(dawg, richiesta.numero, richiesta.mosse)
      self.postMessage({ id: richiesta.id, ok: true, mossa })
    } else {
      const mossa = turnoDelComputer(dawg, richiesta.partita, sacchettoDaSeme(richiesta.partita.seme))
      self.postMessage({ id: richiesta.id, ok: true, mossa })
    }
  } catch (errore) {
    self.postMessage({ id: richiesta.id, ok: false, errore: errore instanceof Error ? errore.message : String(errore) })
  }
}
