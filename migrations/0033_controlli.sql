-- I controlli costano anche quando non trovano errori.
--
-- Un controllo dice se una parola, una casella o tutto lo schema sono giusti, e
-- anche "e' tutto giusto" e' una risposta: ogni controllo ha il suo prezzo,
-- piu' caro per tutto lo schema, oltre a quel che costano gli errori che trova.
-- Le partite contano i controlli come contano le caselle svelate e gli errori;
-- quanto costano lo decide il codice (shared/aiuti.ts). Le colonne nascono a
-- zero, quindi le partite di prima restano quel che erano.
ALTER TABLE cruciverba_games ADD COLUMN controlli INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cruciverba_games ADD COLUMN controlli_schema INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cruciverba_partite_libere ADD COLUMN controlli INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cruciverba_partite_libere ADD COLUMN controlli_schema INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sudoku_games ADD COLUMN controlli INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sudoku_games ADD COLUMN controlli_schema INTEGER NOT NULL DEFAULT 0;
