/**
 * Quanto costano gli aiuti dei giochi a griglia, il cruciverba e il sudoku.
 *
 * Tutto si misura sulla parte di una casella: il tetto del gioco diviso le
 * caselle da trovare. Il cruciverba ha una ottantina di lettere su cento punti,
 * e una parte vale un punto e un quarto; il sudoku ha fra quarantacinque e una
 * cinquantina di cifre da trovare, e una parte ne vale circa due. Ogni aiuto
 * costa le sue parti arrotondate al punto, e non la parte arrotondata per le
 * sue parti: con una parte di un punto e un quarto, una casella svelata costa
 * quattro punti e non tre, e svelato un terzo dello schema la giornata vale
 * davvero zero.
 *
 * Una casella svelata costa tre parti, perché ne apre altre: le parole che la
 * incrociano nel cruciverba, la riga, la colonna e il riquadro nel sudoku.
 * Svelato un terzo dello schema il resto viene da se', e la giornata vale zero.
 * Si paga anche una casella che era gia' giusta: sapere che lo era e' un aiuto,
 * e gratis svelare farebbe da controllo senza costo — su una griglia piena,
 * svelare tutto costava solo le caselle sbagliate, meno di un controllo dello
 * schema. Una parola svelata costa le sue lettere non ancora svelate, e il
 * foglio degli aiuti dice il conto intero: scritto per lettera, il prezzo della
 * parola sembrava quello di una lettera sola.
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
 *
 * Gli aiuti si tolgono da quel che vale il tempo (`puntiDelTempo`): uno schema
 * finito presto vale il tetto, uno finito con calma la meta'. Si da' per
 * scontato che uno schema lo finiscano tutti, e che a distinguere chi ha
 * giocato bene sia quanto ci ha messo, come i tentativi nel Wordle.
 */

export interface CostiAiuti {
  /** Una casella svelata, giusta o no: solo una gia' svelata non si ripaga (`caselleDaPagare`). */
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
  const parte = tetto / Math.max(1, daTrovare)
  const costo = (parti: number) => Math.max(1, Math.round(parti * parte))
  return {
    svelata: costo(PARTI_AIUTI.svelata),
    errore: costo(PARTI_AIUTI.errore),
    controllo: costo(PARTI_AIUTI.controllo),
    controlloSchema: costo(PARTI_AIUTI.controlloSchema),
    daTrovare,
  }
}

/**
 * Le caselle che uno svelamento fa pagare: quelle chieste, una volta sola, tranne
 * le gia' svelate. La usano il server, che le segna, e il foglio degli aiuti,
 * che ne dice il prezzo.
 */
export function caselleDaPagare(caselle: readonly number[], svelate: Iterable<number>): number[] {
  const gia = new Set(svelate)
  return [...new Set(caselle)].filter((k) => !gia.has(k))
}

/** Quel che gli aiuti chiesti tolgono alla giornata. */
export function spesiPerAiuti(costi: CostiAiuti, aiuti: AiutiChiesti): number {
  return (
    aiuti.svelate * costi.svelata +
    aiuti.errori * costi.errore +
    aiuti.controlli * costi.controllo +
    aiuti.controlliSchema * costi.controlloSchema
  )
}

/**
 * Quanto vale la giornata, con questi aiuti: quel che vale il tempo (`base`, il
 * tetto se non si dice), meno gli aiuti. Mai sotto zero, e zero se si e'
 * svelato tutto.
 */
export function puntiConAiuti(tetto: number, costi: CostiAiuti, aiuti: AiutiChiesti, base = tetto): number {
  if (aiuti.svelate >= costi.daTrovare) return 0
  return Math.max(0, Math.min(tetto, base) - spesiPerAiuti(costi, aiuti))
}

/** Il passo di un gioco a griglia: il tempo a casella entro cui vale il tetto, e quello in cui ne vale la meta'. */
export interface RitmoGriglia {
  pienoMs: number
  lentoMs: number
}

/**
 * Quanto vale il tempo di uno schema finito: il tetto fino a `pienoMs` a
 * casella, poi a scendere in linea retta fino alla meta' a `lentoMs` a
 * casella, e oltre la meta' e basta. Il passo si conta a casella perché gli
 * schemi non hanno tutti le stesse caselle da trovare: un sudoku facile ne ha
 * quarantacinque, un cruciverba nove per nove una sessantina. Giocarla bene
 * vale il doppio di giocarla con calma, come in tutte le classificate.
 */
export function puntiDelTempo(tetto: number, tempoMs: number, daTrovare: number, ritmo: RitmoGriglia): number {
  const caselle = Math.max(1, daTrovare)
  const pieno = ritmo.pienoMs * caselle
  const lento = ritmo.lentoMs * caselle
  const t = Math.max(0, tempoMs)
  if (t <= pieno) return tetto
  if (t >= lento) return Math.round(tetto / 2)
  return Math.round(tetto - (tetto / 2) * ((t - pieno) / (lento - pieno)))
}

/** Una partita senza nessun aiuto: quella che fa il record dei "senza aiuti". */
export function senzaAiuti(aiuti: AiutiChiesti): boolean {
  return aiuti.svelate === 0 && aiuti.errori === 0 && aiuti.controlli === 0 && aiuti.controlliSchema === 0
}
