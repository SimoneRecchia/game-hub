import { useEffect } from 'react'
import { ROTTE } from '@/app/rotte'
import { api } from '@/lib/api'
import { useDati } from '@/lib/dati'
import { AMICI_POLL_MS } from '@shared/config'
import { eGiocoSfidaLibera, type GiocoSfidaLibera } from '@shared/sfide-libere'
import type { StanzaLupusBreve, VistaStanzaLupus } from '@shared/lupus-stanza'
import type { StanzaScarabocchiBreve, VistaStanzaScarabocchi } from '@shared/scarabocchi'
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
  anagrammi: 'Anagrammi',
  sequenze: 'Sequenze',
  ghigliottina: 'Ghigliottina',
  paroliere: 'Paroliere',
  catena: 'Catena',
  indovina: 'Indovina chi',
  scacchi: 'Scacchi',
  dama: 'Dama',
  forza4: 'Forza 4',
  go: 'Go',
  ruota: 'Crazy Time',
  fortuna: 'Fortuna',
  slot: 'Slot',
  blackjack: 'Blackjack',
  roulette: 'Roulette',
  superenalotto: 'SuperEnalotto',
  lupus: 'Lupus',
  scarabocchi: 'Scarabocchi',
  classifica: 'Classifica',
  profilo: 'Profilo',
  altro: 'Online',
}

/** I giochi a cui si invita un amico: quelli che si giocano in due nella libera, e Lupus, che si gioca in tanti. */
export type GiocoInsieme =
  | 'battaglia'
  | 'quiz'
  | 'nomi'
  | 'sequenze'
  | 'scarabeo'
  | 'tris'
  | 'indovina'
  | 'scacchi'
  | 'dama'
  | 'forza4'
  | 'go'
  | 'lupus'
  | 'scarabocchi'
  | GiocoSfidaLibera

export const GIOCHI_INSIEME: readonly GiocoInsieme[] = [
  'battaglia',
  'quiz',
  'nomi',
  'sequenze',
  'scarabeo',
  'tris',
  'indovina',
  'scacchi',
  'dama',
  'forza4',
  'go',
  'sudoku',
  'anagrammi',
  'paroliere',
  'ghigliottina',
  'catena',
  'lupus',
  'scarabocchi',
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
 * chi sfida, con le scelte della pagina, che si apre con l'amico in vista. A
 * Lupus e a Scarabocchi si invita nella stanza in cui si e', se aspetta ancora;
 * se no in una nuova, e si va li'.
 */
export async function invitaA(
  gioco: GiocoInsieme,
  amico: GiocatoreBreve,
  stanzaLupus: StanzaLupusBreve | null = null,
  stanzaScarabocchi: StanzaScarabocchiBreve | null = null,
): Promise<string> {
  const playerId = amico.playerId
  if (gioco === 'quiz') return `${ROTTE.libera('quiz')}?sfida=1`
  if (gioco === 'lupus') {
    const codice =
      stanzaLupus?.stato === 'attesa'
        ? stanzaLupus.codice
        : (await api<VistaStanzaLupus>('/lupus/stanze', { method: 'POST' })).codice
    await api(`/lupus/stanze/${codice}/invita`, { method: 'POST', body: { playerId } })
    return ROTTE.stanzaLupus(codice)
  }
  if (gioco === 'scarabocchi') {
    const codice =
      stanzaScarabocchi?.stato === 'attesa'
        ? stanzaScarabocchi.codice
        : (await api<VistaStanzaScarabocchi>('/scarabocchi/stanze', { method: 'POST' })).codice
    await api(`/scarabocchi/stanze/${codice}/invita`, { method: 'POST', body: { playerId } })
    return ROTTE.stanzaScarabocchi(codice)
  }
  if (gioco === 'battaglia') {
    await api('/battaglia/sfida', { method: 'POST', body: { playerId } })
    return ROTTE.battaglia
  }
  if (gioco === 'nomi' || gioco === 'sequenze') {
    // Con il tempo di Nomi, cose e città o il livello delle Sequenze scelti l'ultima volta nella libera
    // (le chiavi di NomiCoseLibera e di useLivelloScelto); il server rimette fra le scelte quel che non c'e'.
    let impostazioni: unknown = null
    try {
      impostazioni =
        gioco === 'nomi'
          ? { secondi: JSON.parse(localStorage.getItem('giochi.nomi.tempo') ?? 'null') }
          : { livello: localStorage.getItem('difficolta:sequenze') }
    } catch {
      /* le opzioni di sempre */
    }
    await api(`/${gioco}/sfide`, { method: 'POST', body: { playerId, impostazioni } })
    return salaDi(gioco)
  }
  if (eGiocoSfidaLibera(gioco)) {
    // Con le opzioni scelte l'ultima volta nella libera (la chiave di useOpzioniLibera).
    let impostazioni: unknown = null
    try {
      impostazioni = JSON.parse(localStorage.getItem(`giochi.${gioco}.opzioni`) ?? 'null')
    } catch {
      /* le opzioni di sempre */
    }
    await api(`/sfide/${gioco}`, { method: 'POST', body: { playerId, impostazioni } })
    return salaDi(gioco)
  }
  if (gioco === 'indovina') {
    const set = scelta('giochi.indovina.set', false)
    await api('/indovina/inviti', {
      method: 'POST',
      body: { playerId, personaggi: { set: set === 'animali' ? 'animali' : 'persone' } },
    })
    return ROTTE.indovina
  }
  // Il tempo per mossa scelto nella sala (la chiave di tavolo/Tempo.tsx); il server lo rimette fra le scelte.
  let tempoMossa: unknown
  try {
    const testo = localStorage.getItem(`giochi.${gioco}.tempo`)
    tempoMossa = testo === null ? undefined : JSON.parse(testo)
  } catch {
    tempoMossa = undefined
  }
  await api('/tavolo/inviti', {
    method: 'POST',
    body: { gioco, playerId, variante: scelta(`giochi.${gioco}.variante`, true), tempoMossa },
  })
  return ROTTE.tavolo(gioco)
}

/** Dove porta un gioco quando l'amico non e' online: la sala, da cui lo si invita con un link. */
export function salaDi(gioco: GiocoInsieme): string {
  if (gioco === 'quiz') return `${ROTTE.libera('quiz')}?sfida=1`
  if (gioco === 'battaglia') return ROTTE.battaglia
  if (gioco === 'nomi') {
    // La libera si apre dalla parte dell'amico, dove si vede l'invito in attesa (la chiave di NomiCoseLibera).
    ricorda('giochi.nomi.contro', 'amico')
    return ROTTE.libera('nomi')
  }
  if (gioco === 'sequenze') {
    // Lo stesso per le Sequenze (la chiave di SequenzeLibera), con il foglio della sfida aperto.
    ricorda('giochi.sequenze.contro', 'amico')
    return `${ROTTE.libera('sequenze')}?sfida=1`
  }
  if (eGiocoSfidaLibera(gioco)) {
    // La libera si apre dalla parte dell'amico, con il foglio della sfida, che aspetta la risposta.
    ricorda(`giochi.${gioco}.contro`, 'amico')
    return `${ROTTE.libera(gioco)}?sfida=1`
  }
  if (gioco === 'indovina') return ROTTE.indovina
  // La libera dello Scarabeo si apre dalla parte dell'amico, dove si invita con il link (la chiave di ScarabeoLibero).
  if (gioco === 'scarabeo') ricorda('giochi.scarabeo.contro', 'amico')
  if (gioco === 'lupus') {
    // La sala si apre dalla parte delle stanze, da cui lo si invita con il link (la chiave di pages/Lupus.tsx).
    ricorda('giochi.lupus.modo', 'online')
    return ROTTE.lupus
  }
  if (gioco === 'scarabocchi') return ROTTE.scarabocchi
  return ROTTE.tavolo(gioco)
}

/** Da che parte si apre la sala, scritto con la chiave della sala: quella degli amici, o delle stanze. */
function ricorda(chiave: string, valore: string) {
  try {
    localStorage.setItem(chiave, valore)
  } catch {
    /* senza localStorage si apre com'era: l'invito resta dalla parte dell'amico */
  }
}
