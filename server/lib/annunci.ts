/**
 * Gli annunci a tutti: un avviso in cima alle Giornaliere, scritto dal pannello
 * di amministrazione — una manutenzione, un gioco nuovo. Se ne vede uno, il piu'
 * recente fra quelli accesi e non scaduti; chi lo chiude non lo rivede, e lo
 * ricorda il telefono.
 */

import type { Annuncio, AnnuncioVisibile, TonoAnnuncio } from '../../shared/admin'

export const TONI: readonly TonoAnnuncio[] = ['info', 'avviso', 'festa']

export interface AnnuncioRow {
  id: string
  testo: string
  tono: string
  attivo: number
  fino: string | null
  created_at: string
  created_by: string | null
  nickname?: string | null
}

export function annuncioDa(r: AnnuncioRow, adesso = Date.now()): Annuncio {
  return {
    id: r.id,
    testo: r.testo,
    tono: TONI.includes(r.tono as TonoAnnuncio) ? (r.tono as TonoAnnuncio) : 'info',
    attivo: r.attivo === 1 && (r.fino === null || Date.parse(r.fino) > adesso),
    fino: r.fino,
    creatoIl: r.created_at,
    creatoDa: r.nickname ?? null,
  }
}

/** L'annuncio che vede chi gioca adesso, o null. */
export async function annuncioVisibile(db: D1Database, adesso = Date.now()): Promise<AnnuncioVisibile | null> {
  const riga = await db
    .prepare(
      `SELECT id, testo, tono FROM annunci
        WHERE attivo = 1 AND (fino IS NULL OR fino > ?) ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(new Date(adesso).toISOString())
    .first<{ id: string; testo: string; tono: string }>()
  if (!riga) return null
  return { id: riga.id, testo: riga.testo, tono: TONI.includes(riga.tono as TonoAnnuncio) ? (riga.tono as TonoAnnuncio) : 'info' }
}
