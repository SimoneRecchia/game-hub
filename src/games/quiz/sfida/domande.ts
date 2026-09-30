/**
 * Le domande di una sfida a quiz, fatte nel browser di chi sfida.
 *
 * Il Worker non ha i dieci millisecondi per farle: servono i dati interi del
 * quiz, che il telefono ha gia' per le partite libere. Le stesse regole e lo
 * stesso `generaPartita` della libera, con un seme a caso; poi vanno al
 * server, che le tiene con le risposte e le manda ai due una alla volta.
 */

import { gameDate, mulberry32 } from '@shared/daily'
import { giornoDellAnno } from '@shared/quiz-cultura'
import type { DomandaCompleta } from '@shared/quiz-domande'
import { generaPartita } from '@shared/quiz-domande-cultura'
import {
  QUANTE_SFIDA,
  SECONDI_SFIDA,
  SECONDI_SFIDA_PREDEFINITI,
  impostazioniSfida,
  type ImpostazioniSfida,
} from '@shared/quiz-sfida'
import { fontiDelQuiz, giornoDellaPartita } from '../fonti'
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
    ambito: s.ambito,
  })!
}

/**
 * Il giorno di una sfida a "Accadde oggi", nelle impostazioni: chi e' sfidato
 * legge di quale giorno sono le domande, e la rivincita resta sullo stesso.
 */
export async function conIlGiorno(
  imp: ImpostazioniSfida,
  scelta: ImpostazioniLibera['giorno'],
): Promise<ImpostazioniSfida> {
  if (imp.categoria !== 'oggi' || imp.giorno) return imp
  return { ...imp, giorno: giornoDellAnno(await giornoDellaPartita(scelta, true)) }
}

export async function domandePerSfida(imp: ImpostazioniSfida): Promise<DomandaCompleta[]> {
  const data = imp.giorno ? `${gameDate().slice(0, 4)}-${imp.giorno}` : gameDate()
  const { fonti, citta } = await fontiDelQuiz(imp.categoria, imp.area, data)
  const domande = generaPartita(
    fonti,
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
      citta: citta ?? undefined,
      ambito: imp.ambito,
      data,
    },
    mulberry32((Math.random() * 2 ** 32) >>> 0),
  )
  if (domande.length < 3) throw new Error('Troppe poche domande con queste scelte: prova una zona più grande.')
  return domande
}
