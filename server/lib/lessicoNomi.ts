import {
  lessicoDa,
  type CategoriaNomi,
  type FileLessicoNomi,
  type LessicoNomi,
  type LetteraNomi,
} from '../../shared/nomi-cose'
import { VERSIONI_LESSICO_NOMI, urlLessicoNomi } from '../../shared/nomi-cose-lessico'
import type { Bindings } from '../types'

/**
 * Il lessico di Nomi, cose e città sul server: lo stesso file statico di una
 * lettera che scarica la libera, letto dagli asset con env.ASSETS, una volta per
 * isolato e per lettera, come il dizionario dello Scarabeo.
 *
 * Serve alla consegna, per dire subito quali risposte valgono: i punti, che
 * vogliono le risposte di tutti, li conta la notte. Il file di una lettera
 * arriva a duecento kB, e aprirlo costa un paio di millisecondi: si tengono gli
 * insiemi delle sole categorie che servono.
 */
const file = new Map<LetteraNomi, Promise<FileLessicoNomi>>()
const insiemi = new Map<string, ReadonlySet<string>>()

function caricato(env: Bindings, indirizzo: string, lettera: LetteraNomi): Promise<FileLessicoNomi> {
  let lettura = file.get(lettera)
  if (!lettura) {
    const nuova = leggi(env, indirizzo, lettera)
    lettura = nuova
    file.set(lettera, nuova)
    // Un fallimento non resta in memoria: la richiesta dopo riprova.
    nuova.catch(() => {
      if (file.get(lettera) === nuova) file.delete(lettera)
    })
  }
  return lettura
}

async function leggi(env: Bindings, indirizzo: string, lettera: LetteraNomi): Promise<FileLessicoNomi> {
  const risposta = await env.ASSETS.fetch(new URL(urlLessicoNomi(lettera), indirizzo))
  if (!risposta.ok) throw new Error(`Lessico non letto (${risposta.status})`)
  // Le Pages rispondono con la pagina dell'app a un indirizzo che non c'e': quella non e' un lessico.
  const letto = (await risposta.json()) as FileLessicoNomi
  if (letto?.lettera !== lettera || letto.versione !== VERSIONI_LESSICO_NOMI[lettera]) {
    throw new Error('Lessico non letto: il file non e’ quello atteso')
  }
  return letto
}

/** Il lessico di una lettera per le categorie che servono. `indirizzo` e' quello della richiesta. */
export async function lessicoPer(
  env: Bindings,
  indirizzo: string,
  lettera: LetteraNomi,
  categorie: readonly CategoriaNomi[],
): Promise<LessicoNomi> {
  const mancano = categorie.filter((c) => !insiemi.has(`${lettera}:${c}`))
  if (mancano.length > 0) {
    const letto = lessicoDa(await caricato(env, indirizzo, lettera), mancano)
    for (const c of mancano) insiemi.set(`${lettera}:${c}`, letto.get(c) ?? new Set())
  }
  return new Map(categorie.map((c) => [c, insiemi.get(`${lettera}:${c}`)!]))
}
