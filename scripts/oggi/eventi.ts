/**
 * I fatti di ogni giorno dall'"Accadde oggi" di Wikipedia in italiano: il feed
 * che la Wikipedia dei telefoni mostra in prima pagina, ricavato dalle voci dei
 * giorni ("15 marzo"). Ogni fatto ha l'anno, la frase e le voci che la frase
 * nomina, con l'identificativo Wikidata e le prime righe di ciascuna.
 *
 * Due elenchi per giorno: `events`, tutti quelli della voce del giorno (da 8
 * il 29 febbraio a 200 il primo gennaio), e `selected`, i quattro o sei che la
 * prima pagina di Wikipedia sceglie per quel giorno — "Cristoforo Colombo
 * scopre l'America". Quelli scelti sono noti per definizione.
 */

import { leggiCache, scaricaConPazienza, scriviCache } from './rete'

export interface PaginaFeed {
  /** Il titolo con i trattini bassi: "Gaio_Giulio_Cesare". */
  title: string
  normalizedtitle?: string
  titles?: { canonical?: string; normalized?: string; display?: string }
  namespace?: { id?: number }
  wikibase_item?: string
  description?: string
  extract?: string
  /** "standard", o "disambiguation" per le pagine di disambiguazione. */
  type?: string
}

export interface EventoFeed {
  text: string
  year: number
  pages?: PaginaFeed[]
}

export type Elenco = 'events' | 'selected'

const GIORNI_DEL_MESE = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** I 366 giorni dell'anno, "01-01" … "12-31", con il 29 febbraio. */
export const GIORNI: readonly string[] = GIORNI_DEL_MESE.flatMap((quanti, mese) =>
  Array.from({ length: quanti }, (_, i) => `${String(mese + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`),
)

const CARTELLA: Record<Elenco, string> = { events: 'eventi', selected: 'scelti' }

function indirizzi(elenco: Elenco, giorno: string): string[] {
  const [mese, numero] = giorno.split('-')
  return [
    `https://it.wikipedia.org/api/rest_v1/feed/onthisday/${elenco}/${mese}/${numero}`,
    `https://api.wikimedia.org/feed/v1/wikipedia/it/onthisday/${elenco}/${mese}/${numero}`,
  ]
}

function valido(elenco: Elenco): (testo: string) => boolean {
  return (testo) => {
    try {
      return Array.isArray((JSON.parse(testo) as Record<string, unknown>)[elenco])
    } catch {
      return false
    }
  }
}

/** I fatti di un giorno, dalla cache o dalla rete. Un giorno che non c'e' (404) e' un elenco vuoto. */
export async function fattiDelFeed(elenco: Elenco, giorno: string): Promise<EventoFeed[]> {
  const file = `${CARTELLA[elenco]}/${giorno}.json`
  let testo = leggiCache(file)
  if (testo === null || !valido(elenco)(testo)) {
    testo = (await scaricaConPazienza(indirizzi(elenco, giorno), valido(elenco))) ?? JSON.stringify({ [elenco]: [] })
    scriviCache(file, testo)
  }
  return (JSON.parse(testo) as Record<Elenco, EventoFeed[]>)[elenco]
}

export const eventiDelGiorno = (giorno: string) => fattiDelFeed('events', giorno)
export const sceltiDelGiorno = (giorno: string) => fattiDelFeed('selected', giorno)

/** Un elenco per tutti i giorni, una richiesta alla volta: in parallelo Wikimedia risponderebbe solo 429. */
export async function scaricaFeed(elenco: Elenco, giorni: readonly string[]): Promise<Map<string, EventoFeed[]>> {
  const esito = new Map<string, EventoFeed[]>()
  let scaricati = 0
  for (const giorno of giorni) {
    const giaInCache = leggiCache(`${CARTELLA[elenco]}/${giorno}.json`) !== null
    esito.set(giorno, await fattiDelFeed(elenco, giorno))
    if (!giaInCache) {
      scaricati += 1
      if (scaricati % 20 === 1) console.log(`  ${elenco} del ${giorno} (${scaricati} scaricati finora)`)
    }
  }
  return esito
}
