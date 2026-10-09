-- Gli indici che le letture piu' frequenti non trovavano.
--
-- La battaglia: le partite aperte fra amici le cerca il giro della presenza,
-- ogni otto secondi per chi ha l'app aperta, e con l'indice per modalita' e
-- giornata le leggeva tutte, da sempre. Le giornate della classificata, che non
-- c'e' piu', le legge solo la generale, con la modalita' scritta.
DROP INDEX IF EXISTS idx_battaglia_giornata;
CREATE INDEX idx_battaglia_giornata ON battaglia_partite (puzzle_number) WHERE modalita = 'classificata';
CREATE INDEX idx_battaglia_amici_aperte ON battaglia_partite (updated_at)
  WHERE modalita = 'amici' AND stato != 'finita';

-- Le sfide: chi e' occupato (le sfide in corso, per tempo) e la pulizia di quelle vecchie.
CREATE INDEX idx_nomi_sfide_in_corso ON nomi_sfide (inizio_at) WHERE stato = 'in_corso';
CREATE INDEX idx_nomi_sfide_updated ON nomi_sfide (updated_at);
CREATE INDEX idx_sequenze_sfide_in_corso ON sequenze_sfide (updated_at) WHERE stato = 'in_corso';
CREATE INDEX idx_sequenze_sfide_updated ON sequenze_sfide (updated_at);
CREATE INDEX idx_sfide_libere_in_corso ON sfide_libere (scade_at) WHERE stato = 'in_corso';
CREATE INDEX idx_sfide_libere_updated ON sfide_libere (updated_at);
CREATE INDEX idx_quiz_sfide_ricevute ON quiz_sfide (a_id, created_at) WHERE stato = 'attesa' AND codice IS NULL;
CREATE INDEX idx_quiz_sfide_created ON quiz_sfide (created_at);

-- Nessuna query cerca le partite del Wordle per stato soltanto.
DROP INDEX IF EXISTS idx_games_status;
