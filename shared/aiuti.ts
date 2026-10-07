/**
 * Quanto costano gli aiuti dei giochi a griglia, il cruciverba e il sudoku.
 *
 * Tutto si misura sulla parte di una casella: il tetto del gioco diviso le
 * caselle da trovare, arrotondato al punto. Il cruciverba ha una ottantina di
 * lettere su centosessanta punti, e una parte vale due punti; il sudoku ha fra
 * quarantacinque e una cinquantina di cifre da trovare su centocinquanta, e una
 * parte ne vale tre.
 *
 * Una casella svelata costa tre parti, perché ne apre altre: le parole che la
 * incrociano nel cruciverba, la riga, la colonna e il riquadro nel sudoku.
 * Svelato un terzo dello schema il resto viene da se', e la giornata vale zero.
 *
 * Un controllo costa una parte anche quando non trova niente — "e' tutto
 * giusto" e' una risposta — e cinque se e' di tutto lo schema, che dice in un
 * colpo dove sono tutti gli errori; ogni errore trovato costa un'altra parte,
 * e ricontrollare lo stesso errore no. Così controllare costa meno che
 * svelare, che dice anche cosa va scritto, e controllare tutto costa piu' che
 * controllare una parola.
 *
 * Prima una casella svelata costava la sua parte e basta, e un controllo solo
 * gli errori che trovava, mezza parte ciascuno: due punti una lettera, uno un
 * errore, e controllare tutto lo schema costava quanto controllare una parola.
 * Gli aiuti non si sentivano. Prima ancora costavano cinque punti una casella
 * e due un errore, in tutti e due i giochi e qualunque fosse lo schema.
 */

export interface CostiAiuti {
  /** Una casella svelata, se non era gia' giusta. */
  svelata: number
  /** Una casella sbagliata trovata da un controllo: ricontrollare la stessa non costa. */
  errore: number
  /** Un controllo di una parola o di una casella, che trovi errori o no. */
  controllo: number
  /** Un controllo di tutto lo schema. */
  controlloSchema: number
  /** Le caselle da trovare: svelate tutte, lo schema vale zero. */
  daTrovare: number
}

/** Gli aiuti chiesti in una partita: le partite li contano, quanto costano lo decide `puntiConAiuti`. */
export interface AiutiChiesti {
  svelate: number
  errori: number
  controlli: number
  controlliSchema: number
}

export const NESSUN_AIUTO: AiutiChiesti = { svelate: 0, errori: 0, controlli: 0, controlliSchema: 0 }

/** Quante parti costa ogni aiuto. */
export const PARTI_AIUTI = { svelata: 3, errore: 1, controllo: 1, controlloSchema: 5 } as const

/** I costi in uno schema con queste caselle da trovare, per un gioco che vale `tetto` senza aiuti. */
export function costiAiuti(tetto: number, daTrovare: number): CostiAiuti {
  const parte = Math.max(1, Math.round(tetto / Math.max(1, daTrovare)))
  return {
    svelata: PARTI_AIUTI.svelata * parte,
    errore: PARTI_AIUTI.errore * parte,
    controllo: PARTI_AIUTI.controllo * parte,
    controlloSchema: PARTI_AIUTI.controlloSchema * parte,
    daTrovare,
  }
}

/** Quanto vale la giornata, con questi aiuti. Mai sotto zero, e zero se si e' svelato tutto. */
export function puntiConAiuti(tetto: number, costi: CostiAiuti, aiuti: AiutiChiesti): number {
  if (aiuti.svelate >= costi.daTrovare) return 0
  const spesi =
    aiuti.svelate * costi.svelata +
    aiuti.errori * costi.errore +
    aiuti.controlli * costi.controllo +
    aiuti.controlliSchema * costi.controlloSchema
  return Math.max(0, tetto - spesi)
}

/** Una partita senza nessun aiuto: quella che fa il record dei "senza aiuti". */
export function senzaAiuti(aiuti: AiutiChiesti): boolean {
  return aiuti.svelate === 0 && aiuti.errori === 0 && aiuti.controlli === 0 && aiuti.controlliSchema === 0
}
