/**
 * Quanto costano gli aiuti dei giochi a griglia, il cruciverba e il sudoku.
 *
 * Ogni casella da trovare vale la sua parte dei punti del giorno, e svelarla
 * costa quella parte: il tetto diviso le caselle da trovare, arrotondato al
 * punto. Così svelare un quarto dello schema toglie un quarto dei punti, e
 * svelarlo tutto lo porta a zero, che e' quanto vale uno schema non risolto.
 * Il cruciverba ha una ottantina di lettere, e una costa due punti dei
 * centosessanta; il sudoku ne ha da trovare fra quarantacinque e una
 * cinquantina, e una costa tre punti dei centocinquanta.
 *
 * Un errore trovato da un controllo costa la metà, per difetto: il controllo
 * dice dove si e' sbagliato, lo svelamento anche cosa va scritto, e chiedere la
 * risposta deve costare piu' che chiedere conferma.
 *
 * Prima ogni aiuto costava lo stesso in tutti e due i giochi, cinque punti una
 * casella e due un errore, qualunque fosse lo schema: nel cruciverba bastavano
 * trentadue lettere svelate, due quinti dello schema, per arrivare a zero, e una
 * parola di otto lettere toglieva un quarto della giornata. E il foglio degli
 * aiuti del sudoku diceva ancora i costi di prima, tre punti e uno.
 */

export interface CostiAiuti {
  /** Una casella svelata, se non era gia' giusta. */
  svelata: number
  /** Una casella sbagliata trovata da un controllo: ricontrollare la stessa non costa. */
  errore: number
  /** Le caselle da trovare: svelate tutte, lo schema vale zero. */
  daTrovare: number
}

/** I costi in uno schema con queste caselle da trovare, per un gioco che vale `tetto` senza aiuti. */
export function costiAiuti(tetto: number, daTrovare: number): CostiAiuti {
  const svelata = Math.max(1, Math.round(tetto / Math.max(1, daTrovare)))
  return { svelata, errore: Math.max(1, Math.floor(svelata / 2)), daTrovare }
}

/**
 * Quanto vale la giornata, con questi aiuti. Mai sotto zero, e zero se si e'
 * svelato tutto: con l'arrotondamento una casella puo' costare un poco meno
 * della sua parte, e uno schema svelato per intero lascerebbe qualche punto.
 */
export function puntiConAiuti(tetto: number, costi: CostiAiuti, svelate: number, errori: number): number {
  if (svelate >= costi.daTrovare) return 0
  return Math.max(0, tetto - svelate * costi.svelata - errori * costi.errore)
}
