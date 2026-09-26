/**
 * Il calendario del gioco, per gli script che girano in Node.
 *
 * E' la stessa regola di shared/daily.ts — la giornata cambia a mezzanotte
 * italiana, il puzzle numero 1 e' il giorno di lancio — riscritta perché gli
 * script non compilano TypeScript. Un test verifica che le due diano lo stesso
 * numero, così uno schema generato per il giorno 40 e' quello che il Worker
 * servirà il giorno 40.
 */

/** Deve restare uguale a EPOCH_DATE in shared/config.ts. */
export const EPOCA = '2026-08-29'
/** Deve restare uguale a GAME_TIMEZONE in shared/config.ts. */
export const FUSO = 'Europe/Rome'

const formato = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** La data di gioco (YYYY-MM-DD) in un istante. */
export function dataDiGioco(adesso = new Date()) {
  return formato.format(adesso)
}

function giorniDa(a, b) {
  const [ya, ma, da] = a.split('-').map(Number)
  const [yb, mb, db] = b.split('-').map(Number)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000)
}

/** Il numero del puzzle di una data. */
export function numeroDelGiorno(data) {
  return giorniDa(EPOCA, data) + 1
}
