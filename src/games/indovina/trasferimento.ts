/**
 * Le foto di un set proprio passano da un telefono all'altro, non dal server.
 *
 * Un canale WebRTC fra i due browser: chi non ha le foto crea un'offerta, chi
 * le ha risponde, e i due messaggi — qualche kB di testo, con gli indirizzi
 * dove ciascuno si puo' raggiungere — passano dalla partita sul server, che li
 * tiene e basta (`/indovina/partite/:id/segnale`). Poi le foto vanno dirette:
 * il server non le vede, e non le conserva nessuno tranne i due telefoni.
 *
 * I candidati si raccolgono tutti prima di mandare l'offerta, invece di
 * mandarli uno alla volta: con il polling ogni candidato sarebbe una
 * scrittura e un giro di attesa, e raccoglierli dura un secondo o due.
 *
 * Solo STUN, niente TURN: fra due reti che non si lasciano attraversare il
 * canale non si apre, e la pagina lo dice. Succede di rado, e un server che
 * inoltri le foto sarebbe proprio quel che non si vuole.
 */

import { impronta } from './foto'

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }]
/** Quanto si aspetta la raccolta dei candidati: oltre, si manda quel che c'e'. */
const RACCOLTA_MS = 2_500
/** I pezzi in cui si manda una foto: sotto il limite di tutti i browser. */
const PEZZO = 16 * 1024
/** Oltre questo in coda si aspetta che il canale si svuoti. */
const CODA_MASSIMA = 1024 * 1024
/** Nessuna foto preparata qui pesa tanto: e' un tetto contro i messaggi strani. */
const FOTO_MASSIMA = 2 * 1024 * 1024

type Messaggio =
  | { tipo: 'chiedi'; hash: string[] }
  | { tipo: 'foto'; hash: string; byte: number; pezzi: number }
  | { tipo: 'manca'; hash: string }
  | { tipo: 'grazie' }

function candidatiRaccolti(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((risolvi) => {
    const fine = () => {
      pc.removeEventListener('icegatheringstatechange', controlla)
      clearTimeout(tetto)
      risolvi()
    }
    const controlla = () => {
      if (pc.iceGatheringState === 'complete') fine()
    }
    const tetto = setTimeout(fine, RACCOLTA_MS)
    pc.addEventListener('icegatheringstatechange', controlla)
  })
}

export interface Ricezione {
  /** L'offerta da mettere nella partita. */
  offerta: string
  /** La risposta arrivata dall'altro: il canale si apre. */
  risposta: (sdp: string) => Promise<void>
  chiudi: () => void
}

/**
 * Chi non ha le foto: apre il canale, le chiede, e le riceve una per una.
 * Ogni foto arrivata si controlla con la sua impronta prima di tenerla.
 */
export async function riceviFoto({
  mancanti,
  onFoto,
  onFine,
}: {
  mancanti: string[]
  onFoto: (hash: string, blob: Blob) => void
  onFine: (esito: 'fatto' | 'chiuso') => void
}): Promise<Ricezione> {
  const pc = new RTCPeerConnection({ iceServers: ICE })
  const canale = pc.createDataChannel('foto', { ordered: true })
  canale.binaryType = 'arraybuffer'
  const attese = new Set(mancanti)
  let corrente: { hash: string; byte: number; pezzi: number; parti: ArrayBuffer[] } | null = null
  let finito = false

  const termina = (esito: 'fatto' | 'chiuso') => {
    if (finito) return
    finito = true
    onFine(esito)
    setTimeout(() => pc.close(), 200)
  }

  canale.onopen = () => canale.send(JSON.stringify({ tipo: 'chiedi', hash: [...attese] } satisfies Messaggio))
  canale.onclose = () => termina(attese.size === 0 ? 'fatto' : 'chiuso')
  canale.onmessage = async (e: MessageEvent<string | ArrayBuffer>) => {
    if (typeof e.data === 'string') {
      const m = JSON.parse(e.data) as Messaggio
      if (m.tipo === 'foto' && attese.has(m.hash) && m.byte <= FOTO_MASSIMA && m.pezzi > 0) {
        corrente = { hash: m.hash, byte: m.byte, pezzi: m.pezzi, parti: [] }
      } else if (m.tipo === 'manca') {
        attese.delete(m.hash)
      }
      return
    }
    if (!corrente) return
    corrente.parti.push(e.data)
    if (corrente.parti.length < corrente.pezzi) return
    const { hash, parti } = corrente
    corrente = null
    const blob = new Blob(parti, { type: 'image/jpeg' })
    if ((await impronta(blob)) !== hash) return
    attese.delete(hash)
    onFoto(hash, blob)
    if (attese.size === 0) {
      canale.send(JSON.stringify({ tipo: 'grazie' } satisfies Messaggio))
      termina('fatto')
    }
  }
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') termina(attese.size === 0 ? 'fatto' : 'chiuso')
  }

  await pc.setLocalDescription(await pc.createOffer())
  await candidatiRaccolti(pc)
  return {
    offerta: pc.localDescription?.sdp ?? '',
    risposta: async (sdp) => {
      if (pc.signalingState === 'have-local-offer') await pc.setRemoteDescription({ type: 'answer', sdp })
    },
    chiudi: () => {
      finito = true
      pc.close()
    },
  }
}

export interface Invio {
  risposta: string
  chiudi: () => void
}

/** Chi ha le foto: risponde all'offerta e manda quelle che l'altro chiede, se le ha. */
export async function mandaFoto({
  offerta,
  leggi,
  onFine,
}: {
  offerta: string
  leggi: (hash: string) => Promise<Blob | null>
  onFine: () => void
}): Promise<Invio> {
  const pc = new RTCPeerConnection({ iceServers: ICE })
  let chiuso = false
  const chiudi = () => {
    if (chiuso) return
    chiuso = true
    onFine()
    pc.close()
  }

  pc.ondatachannel = ({ channel }) => {
    channel.binaryType = 'arraybuffer'
    channel.bufferedAmountLowThreshold = CODA_MASSIMA / 4
    const svuotato = () =>
      channel.bufferedAmount < CODA_MASSIMA
        ? Promise.resolve()
        : new Promise<void>((risolvi) => channel.addEventListener('bufferedamountlow', () => risolvi(), { once: true }))

    channel.onmessage = async (e: MessageEvent<string | ArrayBuffer>) => {
      if (typeof e.data !== 'string') return
      const m = JSON.parse(e.data) as Messaggio
      if (m.tipo === 'grazie') {
        setTimeout(chiudi, 200)
        return
      }
      if (m.tipo !== 'chiedi') return
      for (const hash of m.hash.slice(0, 64)) {
        const blob = await leggi(hash)
        if (!blob || channel.readyState !== 'open') {
          if (channel.readyState === 'open') channel.send(JSON.stringify({ tipo: 'manca', hash } satisfies Messaggio))
          continue
        }
        const byte = new Uint8Array(await blob.arrayBuffer())
        const pezzi = Math.max(1, Math.ceil(byte.length / PEZZO))
        channel.send(JSON.stringify({ tipo: 'foto', hash, byte: byte.length, pezzi } satisfies Messaggio))
        for (let i = 0; i < pezzi; i += 1) {
          await svuotato()
          if (channel.readyState !== 'open') return
          channel.send(byte.slice(i * PEZZO, (i + 1) * PEZZO).buffer)
        }
      }
    }
    channel.onclose = chiudi
  }
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') chiudi()
  }

  await pc.setRemoteDescription({ type: 'offer', sdp: offerta })
  await pc.setLocalDescription(await pc.createAnswer())
  await candidatiRaccolti(pc)
  return { risposta: pc.localDescription?.sdp ?? '', chiudi }
}
