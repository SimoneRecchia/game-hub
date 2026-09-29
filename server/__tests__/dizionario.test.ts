import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Dawg } from '../../shared/dawg'
import { CENTRO, JOLLY, leggioDa, sacchettoDelGiorno } from '../../shared/scarabeo'
import type { Bindings } from '../types'
import { paroleSconosciute } from '../lib/dizionario'
import { giornata } from '../lib/scarabeoStore'
import { ASSETS_FINTI, banco } from './banco'

/*
 * Il dizionario si legge una volta per isolato: in questo file la prima lettura
 * e' quella che fallisce, e la seconda deve riprovare invece di ricordarsi il
 * fallimento.
 */

const dawg = Dawg.da(readFileSync(join(__dirname, '..', '..', 'public', 'scarabeo', 'dizionario.dawg')))
/** Gli asset di una Pages a cui manca il file: a qualunque indirizzo, la pagina dell'app. */
const SENZA_FILE = {
  fetch: async () => new Response('<!doctype html><title>Giochi</title>', { headers: { 'content-type': 'text/html' } }),
} as unknown as Fetcher

/**
 * Due tessere del leggio del giorno che, dalla stella, non fanno una parola.
 * Due tessere diverse del leggio, non la stessa due volte: una lettera sola nel
 * leggio non si posa due volte, e il server risponderebbe che manca la tessera.
 */
function posaInventata() {
  const { leggio } = leggioDa(sacchettoDelGiorno(giornata().puzzleNumber), [])
  const lettere = leggio.filter((t) => t !== JOLLY)
  for (const [i, a] of lettere.entries()) {
    for (const [j, b] of lettere.entries()) {
      if (i !== j && !dawg.contiene(a + b)) {
        return [
          { r: CENTRO, c: CENTRO, lettera: a, jolly: false },
          { r: CENTRO, c: CENTRO + 1, lettera: b, jolly: false },
        ]
      }
    }
  }
  throw new Error('Tutte le coppie del leggio sono parole')
}

describe('il dizionario sul server', () => {
  it('senza il file risponde che il dizionario non c’e’, e non scambia la pagina per un dizionario', async () => {
    const { chiama, giocatore } = banco({ ASSETS: SENZA_FILE })
    const io = await giocatore('anna')
    const risposta = await chiama<{ code: string }>('POST', '/scarabeo/mossa', io, { posa: posaInventata() })
    expect(risposta.status).toBe(503)
    expect(risposta.dati.code).toBe('DIZIONARIO_ASSENTE')
  })

  it('poi riprova, e rifiuta una parola che non esiste', async () => {
    const { chiama, giocatore } = banco()
    const io = await giocatore('bruno')
    const risposta = await chiama<{ code: string; error: string }>('POST', '/scarabeo/mossa', io, { posa: posaInventata() })
    expect(risposta.status).toBe(422)
    expect(risposta.dati.code).toBe('PAROLA_SCONOSCIUTA')
    expect(risposta.dati.error).toMatch(/non è nel dizionario/)
  })

  it('accetta le parole comuni, le rare, le enclitiche e i nomi che sono anche parole', async () => {
    const env = { ASSETS: ASSETS_FINTI } as Bindings
    const parole = ['casa', 'stella', 're', 'sole', 'oh', 'dimmelo', 'portarglielo', 'andandosene', 'qzqz', 'giovanni']
    expect(await paroleSconosciute(env, 'http://localhost/api/scarabeo/mossa', parole)).toEqual(['qzqz', 'giovanni'])
  })
})
