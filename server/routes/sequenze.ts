import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireVerified } from '../lib/session'
import { sfideSequenze } from './sequenzeSfide'

/**
 * Le Sequenze sul server: solo la sfida fra amici. La classificata c'e' stata
 * fino al 15 ottobre 2026, con i suoi cinque turni al giorno; le giornate di
 * allora restano in `sequenze_partite`, e la generale le conta nei periodi che
 * le comprendono. La libera sta tutta nel telefono.
 */
export const sequenzeRoutes = new Hono<AppEnv>()

  .use('*', requireVerified)

  /** La sfida fra amici, che ha le sue rotte. */
  .route('/sfide', sfideSequenze)
