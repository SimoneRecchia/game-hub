/**
 * Le istruzioni con cui lo script della notte scrive i traguardi dello
 * Scarabeo (scripts/genera-computer-scarabeo.ts): a parte, perché i test le
 * provino su un D1 da banco.
 *
 * Un traguardo scritto non cambia, altrimenti due giocatori dello stesso giorno
 * avrebbero punti su scale diverse. Si rifà solo quello di un formato vecchio
 * di un giorno che deve ancora venire e che nessuno ha aperto: nessuno l'ha
 * visto, e la giornata si giocherà come il traguardo nuovo.
 */

const cita = (s: string) => `'${s.replace(/'/g, "''")}'`

/** Le giornate da non toccare, fra `da` e `da + giorni`: un formato di adesso, oggi o prima, o gia' aperte. */
export function giornateFerme(da: number, giorni: number, oggi: number, formato: number): string {
  return `SELECT puzzle_number FROM scarabeo_computer c
     WHERE puzzle_number >= ${da} AND puzzle_number < ${da + giorni}
       AND (formato >= ${formato} OR puzzle_number <= ${oggi}
            OR EXISTS (SELECT 1 FROM scarabeo_games g WHERE g.puzzle_number = c.puzzle_number))`
}

export interface Traguardo {
  numero: number
  punti: number
  mosse: unknown[]
  formato: number
  adesso: string
}

/**
 * Scrive un traguardo: una riga nuova, o una di un formato vecchio da rifare.
 * La condizione dell'aggiornamento ripete quella di `giornateFerme`, cosi' una
 * giornata aperta nel frattempo resta com'era anche se la lettura di prima non
 * lo sapeva.
 */
export function scriviTraguardo(t: Traguardo, oggi: number): string {
  return (
    'INSERT INTO scarabeo_computer (puzzle_number, punti, mosse, formato, created_at) VALUES (' +
    [t.numero, t.punti, cita(JSON.stringify(t.mosse)), t.formato, cita(t.adesso)].join(', ') +
    ') ON CONFLICT (puzzle_number) DO UPDATE SET punti = excluded.punti, mosse = excluded.mosse,' +
    ' formato = excluded.formato, created_at = excluded.created_at' +
    ` WHERE scarabeo_computer.formato < excluded.formato AND scarabeo_computer.puzzle_number > ${oggi}` +
    ' AND NOT EXISTS (SELECT 1 FROM scarabeo_games g WHERE g.puzzle_number = scarabeo_computer.puzzle_number);'
  )
}
