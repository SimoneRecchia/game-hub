/**
 * Punto di ingresso delle Cloudflare Pages Functions.
 *
 * Il nome del file — [[route]] — cattura tutto ciò che sta sotto /api/,
 * quindi l'intera API passa da qui e viene smistata da Hono.
 * L'implementazione sta in server/, fuori da functions/, così Pages non
 * la interpreta come un insieme di rotte separate.
 *
 * Nota: il codice sotto server/ usa import relativi, non l'alias @shared.
 * Il bundler delle Pages Functions non legge i path di tsconfig, quindi un
 * import aliasato qui farebbe fallire il build del deploy.
 */
import { handle } from 'hono/cloudflare-pages'
import { createApp } from '../../server/app'

export const onRequest = handle(createApp())
