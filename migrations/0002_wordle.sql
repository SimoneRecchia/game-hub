-- Partite di Wordle e parola del giorno.

-- La parola di ogni giornata, fissata alla prima richiesta.
--
-- La parola sarebbe già calcolabile da shared/daily.ts, che e' deterministico.
-- Fissarla qui serve a un caso preciso: se il dizionario cambia (nuove parole
-- generate, un deploy a metà giornata), il calcolo darebbe un risultato diverso
-- e due giocatori si troverebbero con parole diverse nello stesso giorno.
-- Con questa tabella la prima richiesta della giornata decide per tutti.
CREATE TABLE daily_puzzles (
  puzzle_number INTEGER PRIMARY KEY,
  date          TEXT NOT NULL UNIQUE,
  answer        TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- Una riga per giocatore per giornata.
CREATE TABLE wordle_games (
  id             TEXT    PRIMARY KEY,
  player_id      TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number  INTEGER NOT NULL,
  date           TEXT    NOT NULL,
  -- Copiata dalla riga di daily_puzzles: la partita resta coerente anche se
  -- la parola del giorno venisse in qualche modo ricalcolata.
  answer         TEXT    NOT NULL,
  status         TEXT    NOT NULL CHECK (status IN ('playing', 'won', 'lost')),
  attempts       INTEGER NOT NULL DEFAULT 0,
  -- Solo le parole giocate, in JSON. I colori non si salvano: sono una
  -- funzione deterministica di (parola, soluzione), quindi salvarli
  -- significherebbe solo poterli avere incoerenti.
  guesses        TEXT    NOT NULL DEFAULT '[]',
  -- Quando il giocatore ha aperto il gioco.
  started_at     TEXT    NOT NULL,
  -- Quando ha giocato il primo tentativo: il tempo si misura da qui, così
  -- aprire il gioco e tornarci dopo non brucia il bonus velocità.
  first_guess_at TEXT,
  finished_at    TEXT,
  duration_ms    INTEGER,
  score          INTEGER,
  -- Giorni consecutivi vinti al momento della chiusura, congelati: la
  -- classifica storica non deve cambiare col passare dei giorni.
  streak_at_end  INTEGER,
  UNIQUE (player_id, puzzle_number)
);

-- Per la classifica del giorno e delle ultime settimane.
CREATE INDEX idx_games_puzzle ON wordle_games (puzzle_number);
-- Per le statistiche personali e il calcolo della streak.
CREATE INDEX idx_games_player_puzzle ON wordle_games (player_id, puzzle_number);
-- Per le classifiche, che leggono solo le partite chiuse.
CREATE INDEX idx_games_status ON wordle_games (status);
