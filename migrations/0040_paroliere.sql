-- Il Paroliere: la griglia di ogni giornata e le partite.
--
-- ---- Le giornate ----
--
-- Le scrive la notte (scripts/genera-paroliere.ts) con INSERT OR IGNORE: una
-- giornata scritta non cambia piu', anche se i dadi o il dizionario cambiano.
-- `griglia` e' il JSON delle sedici facce, riga per riga; `comuni` le parole
-- comuni che ci stanno, che si vedono a partita finita; `traguardo` il
-- punteggio che vale il tetto (shared/paroliere.ts, traguardoDi).
CREATE TABLE paroliere_giornate (
  puzzle_number INTEGER PRIMARY KEY,
  griglia       TEXT    NOT NULL,
  comuni        TEXT    NOT NULL,
  traguardo     INTEGER NOT NULL,
  formato       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL
);

-- ---- Le partite ----
--
-- Una riga per giocatore al giorno, creata quando si gira la clessidra:
-- guardare la pagina non apre niente, e la griglia esce solo da li'.
-- `parole` e' il JSON delle parole trovate, nell'ordine; punteggio, parole e
-- punti stanno anche in colonna, per la classifica.
CREATE TABLE paroliere_partite (
  id            TEXT    PRIMARY KEY,
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  date          TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('playing', 'done')),
  iniziata_at   TEXT    NOT NULL,
  parole        TEXT    NOT NULL DEFAULT '[]',
  punteggio     INTEGER NOT NULL DEFAULT 0,
  trovate       INTEGER NOT NULL DEFAULT 0,
  score         INTEGER NOT NULL DEFAULT 0,
  versione      INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT    NOT NULL,
  finished_at   TEXT,
  UNIQUE (player_id, puzzle_number)
);

CREATE INDEX idx_paroliere_puzzle ON paroliere_partite (puzzle_number);
