-- Cinque parole al giorno invece di una.
--
-- La prima e' *la* parola del giorno e vale piena; le altre quattro valgono a
-- scalare (mezzo, un quarto, un ottavo, un ottavo) e insieme non arrivano a
-- superarla. Servono a chi vuole recuperare qualche punto, non a ribaltare la
-- classifica: vedi `WORD_WEIGHTS` in shared/scoring.ts.
--
-- Tutto quello che era "per giornata" diventa "per parola". Le due tabelle
-- vanno ricreate e non solo allargate, perché cambiano una chiave primaria e un
-- vincolo di unicità, e in SQLite quelli non si alterano. Nessuna delle due e'
-- il bersaglio di una chiave esterna, quindi ricrearle e' sicuro.
--
-- Il gioco in compagnia resta sulla parola del giorno: `coop_rooms` non si
-- tocca, e la sua "una stanza per host al giorno" continua a essere la regola
-- giusta.

-- ---- daily_puzzles: una riga per (giornata, posizione) ----

CREATE TABLE daily_puzzles_nuova (
  puzzle_number INTEGER NOT NULL,
  -- 1 = la parola del giorno, 2..5 = quelle in piu'.
  slot          INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 5),
  -- Non piu' UNIQUE: cinque righe condividono la stessa data.
  date          TEXT    NOT NULL,
  answer        TEXT    NOT NULL,
  created_at    TEXT    NOT NULL,
  PRIMARY KEY (puzzle_number, slot)
);

INSERT INTO daily_puzzles_nuova (puzzle_number, slot, date, answer, created_at)
  SELECT puzzle_number, 1, date, answer, created_at FROM daily_puzzles;

DROP TABLE daily_puzzles;
ALTER TABLE daily_puzzles_nuova RENAME TO daily_puzzles;

CREATE INDEX idx_daily_puzzles_data ON daily_puzzles (date);

-- ---- wordle_games: una partita per (giocatore, giornata, posizione) ----

CREATE TABLE wordle_games_nuova (
  id             TEXT    PRIMARY KEY,
  player_id      TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number  INTEGER NOT NULL,
  slot           INTEGER NOT NULL DEFAULT 1 CHECK (slot BETWEEN 1 AND 5),
  date           TEXT    NOT NULL,
  answer         TEXT    NOT NULL,
  status         TEXT    NOT NULL CHECK (status IN ('playing', 'won', 'lost')),
  attempts       INTEGER NOT NULL DEFAULT 0,
  guesses        TEXT    NOT NULL DEFAULT '[]',
  started_at     TEXT    NOT NULL,
  first_guess_at TEXT,
  finished_at    TEXT,
  duration_ms    INTEGER,
  -- Già pesato per la posizione: il punteggio di una giornata passata non deve
  -- cambiare se un domani si ritocca un peso.
  score          INTEGER,
  streak_at_end  INTEGER,
  spectated      INTEGER NOT NULL DEFAULT 0,
  assist_score   INTEGER,
  assist_room_id TEXT,
  assist_status  TEXT    CHECK (assist_status IS NULL OR assist_status IN ('won', 'lost')),
  UNIQUE (player_id, puzzle_number, slot)
);

INSERT INTO wordle_games_nuova
  (id, player_id, puzzle_number, slot, date, answer, status, attempts, guesses,
   started_at, first_guess_at, finished_at, duration_ms, score, streak_at_end,
   spectated, assist_score, assist_room_id, assist_status)
  SELECT
   id, player_id, puzzle_number, 1, date, answer, status, attempts, guesses,
   started_at, first_guess_at, finished_at, duration_ms, score, streak_at_end,
   spectated, assist_score, assist_room_id, assist_status
  FROM wordle_games;

DROP TABLE wordle_games;
ALTER TABLE wordle_games_nuova RENAME TO wordle_games;

-- Gli stessi indici di prima, piu' la posizione dove serve.
CREATE INDEX idx_games_puzzle ON wordle_games (puzzle_number);
CREATE INDEX idx_games_player_puzzle ON wordle_games (player_id, puzzle_number, slot);
CREATE INDEX idx_games_status ON wordle_games (status);
CREATE INDEX idx_wordle_games_assist ON wordle_games (assist_room_id);
