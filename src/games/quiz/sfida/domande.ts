/**
 * Le domande di una sfida a quiz, fatte nel browser di chi sfida.
 *
 * Il Worker non ha i dieci millisecondi per farle: servono i dati interi del
 * quiz, che il telefono ha gia' per le partite libere. Le stesse regole e lo
 * stesso `generaDomande` della libera, con un seme a caso; poi vanno al
 * server, che le tiene con le risposte e le manda ai due una alla volta.
 */

import { mulberry32 } from '@shared/daily'
import { generaDomande, type DomandaCompleta } from '@shared/quiz-domande'
import {
  QUANTE_SFIDA,
  SECONDI_SFIDA,
  SECONDI_SFIDA_PREDEFINITI,
  impostazioniSfida,
  type ImpostazioniSfida,
} from '@shared/quiz-sfida'
import { caricaCitta } from '../citta'
import { caricaDatiQuiz } from '../dati'
import type { ImpostazioniLibera } from '../usePartita'

/**
 * La sfida che nasce dalle scelte della libera: sempre a tempo — senza tempo
 * non c'e' chi arriva prima — e al massimo venti domande. Gli aiuti, il
 * ripasso e la morte improvvisa non ci sono: le due partite devono essere la
 * stessa.
 */
export function sfidaDalleScelte(s: ImpostazioniLibera): ImpostazioniSfida {
  const quante = QUANTE_SFIDA.reduce((a, b) => (Math.abs(b - s.quante) < Math.abs(a - s.quante) ? b : a))
  const secondi =
    s.secondi === null
      ? SECONDI_SFIDA_PREDEFINITI
      : SECONDI_SFIDA.reduce((a, b) => (Math.abs(b - s.secondi!) < Math.abs(a - s.secondi!) ? b : a))
  return impostazioniSfida({
    categoria: s.categoria,
    modo: s.modo ?? 'scelta',
    area: s.area,
    quante,
    secondi,
    evidenzia: s.evidenzia,
    soloZona: s.soloZona,
    nomiPaesi: s.nomiPaesi,
    imparo: s.imparo,
    risposte: s.risposte,
    tipi: s.tipi,
    notorieta: s.notorieta,
    bandieraCapitali: s.bandieraCapitali,
  })!
}

export async function domandePerSfida(imp: ImpostazioniSfida): Promise<DomandaCompleta[]> {
  const ix = await caricaDatiQuiz()
  const citta = imp.categoria === 'citta' ? await caricaCitta(ix, imp.area) : undefined
  const domande = generaDomande(
    ix,
    {
      categoria: imp.categoria,
      modo: imp.modo,
      area: imp.area,
      quante: imp.quante,
      risposte: imp.risposte,
      tipi: imp.tipi,
      notorieta: imp.notorieta,
      bandieraCapitali: imp.bandieraCapitali,
      ordine: 'sale',
      citta,
    },
    mulberry32((Math.random() * 2 ** 32) >>> 0),
  )
  if (domande.length < 3) throw new Error('Troppe poche domande con queste scelte: prova una zona più grande.')
  return domande
}
