/**
 * Le forme verbali con i pronomi attaccati: "dimmelo", "portarlo",
 * "andandosene", "prendetelo".
 *
 * Il regolamento della Federazione Italiana Gioco Scrabble le ammette per ogni
 * verbo all'infinito, al gerundio e all'imperativo (articolo 22), e nessun
 * dizionario le elenca una per una: si costruiscono. Le basi le scrive
 * scripts/build-dizionario.mjs dalle coniugazioni del Wiktionary — l'infinito
 * senza la e finale ("portar", "por" da "porre"), il gerundio, le tre persone
 * dell'imperativo — e qui diventano parole. Sono circa un milione e mezzo, e
 * nel DAWG pesano pochissimo: finiscono tutte negli stessi pochi nodi.
 *
 * Una riga delle basi e' la base, uno spazio e due segni facoltativi:
 *
 *   o   il verbo e' transitivo, e prende anche i pronomi del complemento
 *       oggetto (lo, la, li, le, e glielo, me la, te li...)
 *   d   la base e' un imperativo di una sillaba sola, che raddoppia la
 *       consonante del pronome: da' → dammi, di' → dillo, va' → vattene.
 *       Tranne gli: dagli, digli, fagli.
 */

/** I pronomi che vanno con ogni verbo: i riflessivi, ci, ne, gli, e le coppie con ne. */
export const SEMPRE = ['mi', 'ti', 'si', 'ci', 'vi', 'ne', 'gli', 'mene', 'tene', 'sene', 'cene', 'vene', 'gliene']

/** Quelli del complemento oggetto, da soli e in coppia: solo per i verbi transitivi. */
export const OGGETTO = [
  'lo',
  'la',
  'li',
  'le',
  ...['me', 'te', 'se', 'ce', 've', 'glie'].flatMap((a) => ['lo', 'la', 'li', 'le'].map((b) => a + b)),
]

const GIOCABILE = /^[abcdefghilmnopqrstuvz]{2,15}$/

/** Una riga delle basi: "portar o", "da od", "andando". */
export function leggiBase(riga) {
  const [base, segni = ''] = riga.split(' ')
  return { base, oggetto: segni.includes('o'), doppia: segni.includes('d') }
}

export function scriviBase({ base, oggetto, doppia }) {
  const segni = (oggetto ? 'o' : '') + (doppia ? 'd' : '')
  return segni ? `${base} ${segni}` : base
}

/** Le parole di una base: la base con ogni pronome che le spetta. */
export function formeDellaBase({ base, oggetto, doppia }) {
  const forme = []
  for (const pronome of oggetto ? [...SEMPRE, ...OGGETTO] : SEMPRE) {
    const attacco = doppia && !pronome.startsWith('gl') ? pronome[0] + pronome : pronome
    const parola = base + attacco
    if (GIOCABILE.test(parola)) forme.push(parola)
  }
  return forme
}

/** Tutte le forme di un elenco di righe delle basi, senza doppioni. */
export function formeEnclitiche(righe) {
  const forme = new Set()
  for (const riga of righe) {
    if (!riga) continue
    for (const parola of formeDellaBase(leggiBase(riga))) forme.add(parola)
  }
  return forme
}
