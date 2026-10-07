import { useEffect } from 'react'
import { ROTTE } from '@/app/rotte'
import { api } from '@/lib/api'
import { useDati } from '@/lib/dati'
import { AMICI_POLL_MS } from '@shared/config'
import type { AmiciRisposta, AmicoOnline, Attivita, GiocatoreBreve } from '@shared/types'

/**
 * Gli amici online e gli inviti ai giochi liberi, per il profilo, le Libere e
 * il profilo di un amico. Gli inviti sono quelli delle sale: questo li manda e
 * porta nella sala, che li trova in attesa e aspetta la risposta.
 */

/** Chi e' online adesso, riletto ogni `AMICI_POLL_MS` mentre la pagina si vede. Null finché non arriva. */
export function useAmiciOnline(): AmicoOnline[] | null {
  const { dati, ricarica } = useDati<AmiciRisposta>('/amici')
  useEffect(() => {
    const giro = () => {
      if (document.visibilityState === 'visible') void ricarica()
    }
    const t = window.setInterval(giro, AMICI_POLL_MS)
    document.addEventListener('visibilitychange', giro)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', giro)
    }
  }, [ricarica])
  return dati?.online ?? null
}

/** Dove si trova un amico, in una parola: sotto il suo avatar nelle Libere. */
export const DOVE_BREVE: Record<Attivita, string> = {
  hub: 'In giro',
  wordle: 'Wordle',
  scarabeo: 'Scarabeo',
  cruciverba: 'Cruciverba',
  sudoku: 'Sudoku',
  battaglia: 'Battaglia',
  quiz: 'Quiz',
  tris: 'Tris',
  nomi: 'Nomi, cose',
  indovina: 'Indovina chi',
  scacchi: 'Scacchi',
  dama: 'Dama',
  forza4: 'Forza 4',
  go: 'Go',
  ruota: 'Crazy Time',
  fortuna: 'Fortuna',
  slot: 'Slot',
  blackjack: 'Blackjack',
  classifica: 'Classifica',
  profilo: 'Profilo',
  altro: 'Online',
}

/** I giochi a cui si invita un amico: quelli che si giocano in due, nella libera. */
export type GiocoInsieme =
  | 'battaglia'
  | 'quiz'
  | 'nomi'
  | 'scarabeo'
  | 'tris'
  | 'indovina'
  | 'scacchi'
  | 'dama'
  | 'forza4'
  | 'go'

export const GIOCHI_INSIEME: readonly GiocoInsieme[] = [
  'battaglia',
  'quiz',
  'nomi',
  'scarabeo',
  'tris',
  'indovina',
  'scacchi',
  'dama',
  'forza4',
  'go',
]

/**
 * La variante e il set scelti l'ultima volta nella sala, come li salva la
 * sala: le stesse chiavi di `tavolo/locale.ts` e di `IndovinaChi.tsx`, lette
 * qui senza importarli, perché portano con se' le regole dei giochi.
 */
function scelta(chiave: string, json: boolean): string | null {
  try {
    const testo = localStorage.getItem(chiave)
    if (!testo) return null
    const valore: unknown = json ? JSON.parse(testo) : testo
    return typeof valore === 'string' ? valore : null
  } catch {
    return null
  }
}

/**
 * Invita un amico online a un gioco, e dice dove andare: nella sala del gioco,
 * che trova l'invito in attesa. Il quiz no: la sfida la prepara il telefono di
 * chi sfida, con le scelte della pagina, che si apre con l'amico in vista.
 */
export async function invitaA(gioco: GiocoInsieme, amico: GiocatoreBreve): Promise<string> {
  const playerId = amico.playerId
  if (gioco === 'quiz') return `${ROTTE.libera('quiz')}?sfida=1`
  if (gioco === 'battaglia') {
    await api('/battaglia/sfida', { method: 'POST', body: { playerId } })
    return ROTTE.battaglia
  }
  if (gioco === 'nomi') {
    await api('/nomi/sfide', { method: 'POST', body: { playerId } })
    return salaDi('nomi')
  }
  if (gioco === 'indovina') {
    const set = scelta('giochi.indovina.set', false)
    await api('/indovina/inviti', {
      method: 'POST',
      body: { playerId, personaggi: { set: set === 'animali' ? 'animali' : 'persone' } },
    })
    return ROTTE.indovina
  }
  await api('/tavolo/inviti', {
    method: 'POST',
    body: { gioco, playerId, variante: scelta(`giochi.${gioco}.variante`, true) },
  })
  return ROTTE.tavolo(gioco)
}

/** Dove porta un gioco quando l'amico non e' online: la sala, da cui lo si invita con un link. */
export function salaDi(gioco: GiocoInsieme): string {
  if (gioco === 'quiz') return `${ROTTE.libera('quiz')}?sfida=1`
  if (gioco === 'battaglia') return ROTTE.battaglia
  if (gioco === 'nomi') {
    // La libera si apre dalla parte dell'amico, dove si vede l'invito in attesa (la chiave di NomiCoseLibera).
    ricordaAmico('giochi.nomi.contro')
    return ROTTE.libera('nomi')
  }
  if (gioco === 'indovina') return ROTTE.indovina
  // La libera dello Scarabeo si apre dalla parte dell'amico, dove si invita con il link (la chiave di ScarabeoLibero).
  if (gioco === 'scarabeo') ricordaAmico('giochi.scarabeo.contro')
  return ROTTE.tavolo(gioco)
}

function ricordaAmico(chiave: string) {
  try {
    localStorage.setItem(chiave, 'amico')
  } catch {
    /* senza localStorage si apre com'era: l'invito resta nella parte dell'amico */
  }
}
