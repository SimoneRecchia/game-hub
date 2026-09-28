/**
 * Il dizionario dello Scarabeo: il DAWG in public/scarabeo/dizionario.dawg, e
 * l'impronta del file, che ne cambia l'indirizzo a ogni versione nuova.
 *
 * Scritto da scripts/build-dawg.mjs: non va toccato a mano.
 */
export const IMPRONTA_DIZIONARIO = 'addd89ea9daaa268'

/**
 * Quanto e' lungo, aperto. Le Pages rispondono con la pagina dell'app a un
 * indirizzo che non esiste, e chi legge il file controlla di non avere quella.
 */
export const BYTE_DIZIONARIO = 1304904

/** Il file intero: lo legge il server. */
export const URL_DIZIONARIO = `/scarabeo/dizionario.dawg?v=${IMPRONTA_DIZIONARIO}`

/** Lo stesso compresso, che scrive il build (vite.config.ts): lo scarica il browser. */
export const URL_DIZIONARIO_COMPRESSO = `/scarabeo/dizionario.dawg.gz?v=${IMPRONTA_DIZIONARIO}`
