/**
 * I tetti delle email. Ogni email che parte prima prende il suo posto in
 * `invii_posta`, con un `INSERT` condizionato ai conti di quella tabella: le
 * email chieste dalla stessa rete nell'ultima ora e nell'ultimo giorno, quelle
 * arrivate allo stesso indirizzo, e quelle di tutti nel giorno
 * (`POSTA_PER_RETE_ORA` e gli altri, in shared/config.ts). Se un conto e' pieno
 * la riga non entra e l'email non parte: come un `UPDATE` condizionato, due
 * richieste nello stesso istante non passano tutte e due sull'ultimo posto.
 *
 * Le finestre scorrono, l'ultima ora e le ultime ventiquattro, e non sono di
 * calendario: a mezzanotte non si riapre niente a chi stava riempiendo una
 * casella. Gli indirizzi non si salvano: la rete e l'email sono impronte, e
 * dopo due giorni la riga se ne va.
 */

import {
  POSTA_AL_GIORNO,
  POSTA_PER_INDIRIZZO_GIORNO,
  POSTA_PER_INDIRIZZO_ORA,
  POSTA_PER_RETE_GIORNO,
  POSTA_PER_RETE_ORA,
} from '../../shared/config'
import { toBase64 } from '../../shared/base64'
import { fail } from './http'

const ORA = 3_600_000
const GIORNO = 24 * ORA
/** Quanto restano le righe: oltre il giorno piu' lungo che si conta. */
const CONSERVA = 2 * GIORNO

async function impronta(testo: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`game-hub/posta/v1/${testo}`))
  return toBase64(new Uint8Array(digest)).slice(0, 22)
}

/** La rete di chi chiede: l'IP che vede Cloudflare. In locale e nei test non c'e', e sono tutti la stessa rete. */
export function reteDi(intestazione: string | undefined): string {
  return intestazione?.trim() || 'sconosciuta'
}

/**
 * Prende il posto di un'email per `email`, chiesta da `rete`. Restituisce
 * false se uno dei tetti e' pieno: allora l'email non deve partire.
 */
export async function prenotaInvio(db: D1Database, rete: string, email: string, adesso = Date.now()): Promise<boolean> {
  const [r, d] = await Promise.all([impronta(`rete:${rete}`), impronta(`email:${email.trim().toLowerCase()}`)])
  const iso = (ms: number) => new Date(ms).toISOString()
  const [ora, giorno] = [iso(adesso - ORA), iso(adesso - GIORNO)]
  const [, presa] = await db.batch([
    db.prepare('DELETE FROM invii_posta WHERE at < ?').bind(iso(adesso - CONSERVA)),
    db
      .prepare(
        `INSERT INTO invii_posta (at, rete, destinatario)
         SELECT ?, ?, ?
          WHERE (SELECT COUNT(*) FROM invii_posta WHERE rete = ? AND at > ?) < ?
            AND (SELECT COUNT(*) FROM invii_posta WHERE rete = ? AND at > ?) < ?
            AND (SELECT COUNT(*) FROM invii_posta WHERE destinatario = ? AND at > ?) < ?
            AND (SELECT COUNT(*) FROM invii_posta WHERE destinatario = ? AND at > ?) < ?
            AND (SELECT COUNT(*) FROM invii_posta WHERE at > ?) < ?`,
      )
      .bind(
        iso(adesso),
        r,
        d,
        r,
        ora,
        POSTA_PER_RETE_ORA,
        r,
        giorno,
        POSTA_PER_RETE_GIORNO,
        d,
        ora,
        POSTA_PER_INDIRIZZO_ORA,
        d,
        giorno,
        POSTA_PER_INDIRIZZO_GIORNO,
        giorno,
        POSTA_AL_GIORNO,
      ),
  ])
  return (presa.meta.changes ?? 0) === 1
}


/** La risposta a chi trova un tetto pieno, dove si puo' dire. */
export function troppeEmail(): never {
  return fail(429, 'TROPPE_EMAIL', 'Abbiamo mandato troppi codici: riprova fra un po’.')
}
