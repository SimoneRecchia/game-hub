import { Dawg } from '../../shared/dawg'
import { BYTE_DIZIONARIO, URL_DIZIONARIO } from '../../shared/scarabeo-dizionario'
import type { Bindings } from '../types'

/**
 * Il dizionario dello Scarabeo sul server: lo stesso DAWG che scarica il
 * browser, letto dagli asset statici con env.ASSETS.
 *
 * Prima stava in D1, a secchi per lunghezza e prime due lettere. Con i due
 * milioni di parole di adesso il secchio piu' grosso — quattordici lettere che
 * cominciano per "ri" — sarebbe di 800 kB, otto volte quel che D1 accetta in
 * un'istruzione; e due copie dello stesso elenco potevano anche dire cose
 * diverse. Il file si legge una volta per isolato ed e' gia' nel formato in cui
 * si usa, senza niente da aprire o da costruire: le richieste dopo la prima lo
 * trovano in memoria, e una parola si cerca in pochi microsecondi.
 */
let caricato: Promise<Dawg> | null = null

function dizionario(env: Bindings, indirizzo: string): Promise<Dawg> {
  if (!caricato) {
    const lettura = leggi(env, indirizzo)
    caricato = lettura
    // Un fallimento non resta in memoria: la richiesta dopo riprova.
    lettura.catch(() => {
      if (caricato === lettura) caricato = null
    })
  }
  return caricato
}

async function leggi(env: Bindings, indirizzo: string): Promise<Dawg> {
  const risposta = await env.ASSETS.fetch(new URL(URL_DIZIONARIO, indirizzo))
  if (!risposta.ok) throw new Error(`Dizionario non letto (${risposta.status})`)
  const buffer = await risposta.arrayBuffer()
  // Le Pages rispondono con la pagina dell'app a un indirizzo che non c'e': quella non e' un dizionario.
  if (buffer.byteLength !== BYTE_DIZIONARIO) throw new Error('Dizionario non letto: il file non e’ quello atteso')
  return Dawg.da(buffer)
}

/** Quali fra queste parole non stanno nel dizionario. `indirizzo` e' quello della richiesta. */
export async function paroleSconosciute(env: Bindings, indirizzo: string, parole: string[]): Promise<string[]> {
  if (parole.length === 0) return []
  const dawg = await dizionario(env, indirizzo)
  return parole.filter((parola) => !dawg.contiene(parola))
}
