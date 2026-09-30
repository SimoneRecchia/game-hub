/**
 * Le lingue delle opere, come si dicono in una domanda: "inglese", "latino",
 * "greco antico".
 */

import { nomeItaliano, type Scheda } from './wikidata'

/**
 * Le varietà di una lingua, portate alla lingua: l'inglese britannico e
 * quello della prima età moderna sono inglese, il latino classico e quello
 * medievale latino. Il greco antico resta greco antico: e' un'altra lingua dal
 * greco di oggi, ed e' la risposta per l'Iliade.
 */
const LINGUE: Record<string, string> = {
  Q7979: 'inglese', // inglese britannico
  Q7976: 'inglese', // inglese americano
  Q1472196: 'inglese', // inglese della prima età moderna
  Q36395: 'inglese', // medio inglese
  Q1163234: 'latino', // latino medievale
  Q253854: 'latino', // latino classico
  Q1248221: 'latino', // nuovo latino
  Q107358: 'greco antico', // koinè
  Q26912310: 'greco antico', // greco biblico
  Q856067: 'greco antico', // greco del Nuovo Testamento
  Q990062: 'greco antico', // lingua omerica: l'Iliade e' "greco antico" e "lingua omerica"
  Q1990745: 'italiano', // dialetti toscani
  Q35222: 'francese', // antico francese
  Q1982248: 'ebraico', // ebraico biblico
  Q37041: 'cinese', // cinese classico
  Q34909: 'norreno', // antico islandese
}

/** Le stesse varietà quando Wikidata le ha solo come nome: "spagnolo medio", "italiano medievale". */
const VARIETA = /^(?:lingua )?(italiano|spagnolo|francese|tedesco|inglese|giapponese|portoghese|olandese)\b.*$/

/** E quelle che il nome non comincia dalla lingua: "tardo latino", "alto tedesco medio", "dialetto attico". */
const NOMI_VARIETA: Record<string, string> = {
  'medio cinese': 'cinese',
  'lingua cinese antica': 'cinese',
  'lingua cinese scritta': 'cinese',
  baihua: 'cinese',
  'latino rinascimentale': 'latino',
  'tardo latino': 'latino',
  'dialetto attico': 'greco antico',
  'greco moderno': 'greco',
  'alto tedesco medio': 'tedesco',
  'alto tedesco protomoderno': 'tedesco',
}

/** Le lingue di un'opera, senza doppioni: "inglese" e "inglese britannico" sono una. */
export function lingueDi(ids: readonly string[], nomi: Map<string, Scheda>): string[] {
  const esito = ids
    .map((l) => {
      if (LINGUE[l]) return LINGUE[l]
      const nome = nomeItaliano(nomi.get(l))?.toLocaleLowerCase('it')
      return nome && (NOMI_VARIETA[nome] ?? nome.replace(VARIETA, '$1'))
    })
    .filter((l): l is string => !!l)
  return [...new Set(esito)]
}
