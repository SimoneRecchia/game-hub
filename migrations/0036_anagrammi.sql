-- Gli Anagrammi: le parole di ogni giornata e le partite.
--
-- ---- Le giornate ----
--
-- Le scrive la notte (scripts/genera-anagrammi.ts) con INSERT OR IGNORE: una
-- giornata scritta non cambia piu', anche se l'elenco delle parole si rifa'.
-- `parole` e' il JSON delle cinque parole, con le lettere mescolate, le
-- risposte che si accettano e la definizione (shared/anagrammi.ts,
-- ParolaDelGiorno): non esce dal server, se non una parola alla volta e senza
-- le risposte.
CREATE TABLE anagrammi_giornate (
  puzzle_number INTEGER PRIMARY KEY,
  parole        TEXT    NOT NULL,
  formato       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL
);

-- ---- Le partite ----
--
-- Una riga per giocatore al giorno, creata con la prima parola: guardare la
-- pagina non apre niente. `parole` tiene com'e' andata ogni parola aperta
-- (quando si e' aperta e chiusa, l'esito, l'aiuto); `aperta_at` e' quando e'
-- partito il tempo della parola in corso, NULL fra una e l'altra. Trovate,
-- tempo e punti stanno anche in colonna, per la classifica, che li somma
-- senza leggere le parole di tutti.
CREATE TABLE anagrammi_partite (
  id            TEXT    PRIMARY KEY,
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  date          TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('playing', 'done')),
  parole        TEXT    NOT NULL DEFAULT '[]',
  aperta_at     TEXT,
  trovate       INTEGER NOT NULL DEFAULT 0,
  tempo_ms      INTEGER NOT NULL DEFAULT 0,
  score         INTEGER NOT NULL DEFAULT 0,
  versione      INTEGER NOT NULL DEFAULT 0,
  started_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  finished_at   TEXT,
  UNIQUE (player_id, puzzle_number)
);

CREATE INDEX idx_anagrammi_puzzle ON anagrammi_partite (puzzle_number);
