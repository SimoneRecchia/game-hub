import { Damiera } from '@/games/dama/Damiera'
import { Griglia, attesaFine as attesaFineForza4 } from '@/games/forza4/Griglia'
import { Goban } from '@/games/go/Goban'
import { Scacchiera } from '@/games/scacchi/Scacchiera'
import { TRIS } from '@/games/tris/descrizione'
import * as dama from '@shared/dama'
import * as go from '@shared/go'
import * as scacchi from '@shared/scacchi'
import type { GiocoTavoliere } from '@shared/tavolo'
import type { GiocoDelTavoliere } from './tipi'

/**
 * I giochi da tavoliere, come li vedono le schermate comuni: la sala, la
 * partita con un amico, quella contro il computer. Ognuno porta il suo
 * tavoliere e i nomi delle sue parti; il resto e' uguale per tutti.
 */
const FORZA4: GiocoDelTavoliere = {
  gioco: 'forza4',
  nome: 'Forza 4',
  parti: [
    { nome: 'Rosso', il: 'il rosso' },
    { nome: 'Giallo', il: 'il giallo' },
  ],
  Tavoliere: Griglia,
  // Le colonne una dopo l'altra non dicono niente: la griglia e' gia' la storia.
  storia: null,
  avviso: () => null,
  attesaFine: attesaFineForza4,
}

const SCACCHI: GiocoDelTavoliere = {
  gioco: 'scacchi',
  nome: 'Scacchi',
  parti: [
    { nome: 'Bianco', il: 'il Bianco' },
    { nome: 'Nero', il: 'il Nero' },
  ],
  Tavoliere: Scacchiera,
  // La notazione si scrive dalla posizione prima di ogni mossa: la partita si rigioca dall'inizio.
  storia(mosse) {
    const scritte: string[] = []
    let p = scacchi.posizioneIniziale()
    for (const testo of mosse) {
      const m = scacchi.mossaDaUci(p, testo)
      if (!m) break
      scritte.push(scacchi.notazione(p, m))
      p = scacchi.gioca(p, m)
    }
    return scritte
  },
  avviso(posizione) {
    const p = scacchi.daFen(posizione)
    return p && scacchi.sottoScacco(p) ? 'Scacco!' : null
  },
}

const DAMA: GiocoDelTavoliere = {
  gioco: 'dama',
  nome: 'Dama',
  parti: [
    { nome: 'Bianco', il: 'il Bianco' },
    { nome: 'Nero', il: 'il Nero' },
  ],
  Tavoliere: Damiera,
  // Nella dama la notazione del server e' gia' quella che si legge: "22-18", "22x13x6".
  storia: (mosse) => [...mosse],
  avviso(posizione, mio) {
    if (!mio) return null
    const p = dama.leggi(posizione)
    const legali = p ? dama.mosseLegali(p) : []
    return legali.length > 0 && legali[0].prese.length > 0 ? 'Devi prendere' : null
  },
}

const GO: GiocoDelTavoliere = {
  gioco: 'go',
  nome: 'Go',
  parti: [
    { nome: 'Nero', il: 'il Nero' },
    { nome: 'Bianco', il: 'il Bianco' },
  ],
  Tavoliere: Goban,
  storia: (mosse) => mosse.map((m) => (m === 'passo' ? 'passa' : m)),
  // Dopo un passo dell'altro: passare anche io ferma la partita, e si conta.
  avviso(posizione, mio) {
    const p = go.leggi(posizione)
    if (!p || p.passi !== 1) return null
    return mio ? 'Ha passato: se passi anche tu, si conta' : 'Hai passato'
  },
  passo: 'passo',
}

const GIOCHI: Record<GiocoTavoliere, GiocoDelTavoliere> = {
  scacchi: SCACCHI,
  dama: DAMA,
  forza4: FORZA4,
  go: GO,
  tris: TRIS,
}

export function giocoDelTavoliere(gioco: GiocoTavoliere): GiocoDelTavoliere {
  return GIOCHI[gioco]
}
