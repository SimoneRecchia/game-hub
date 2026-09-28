-- Sudoku: gli schemi del giorno e le partite.

-- ---- Gli schemi ----
--
-- Uno per giornata, generato fuori dal Worker (scripts/genera-sudoku.ts, nel
-- workflow della notte): togliere caselle controllando che la soluzione resti
-- una sola, e misurare la difficoltà risolvendolo ragionando, sta in qualche
-- decimo di secondo, troppo per i 10 ms di CPU di una richiesta.
--
-- Una volta scritto, uno schema non cambia piu': `INSERT OR IGNORE`, come i
-- cruciverba. E' anche deterministico dal numero del giorno, quindi la riga e'
-- una garanzia in piu'.
CREATE TABLE sudoku_schemi (
  puzzle_number INTEGER PRIMARY KEY,
  livello       TEXT    NOT NULL CHECK (livello IN ('facile', 'media', 'difficile', 'esperto')),
  -- 81 caratteri, riga per riga: le cifre date e un punto per le vuote.
  dati          TEXT    NOT NULL,
  -- 81 cifre. Non esce dal server finché la partita non e' chiusa.
  soluzione     TEXT    NOT NULL,
  created_at    TEXT    NOT NULL
);

-- ---- Le partite ----
--
-- Una riga per giocatore per giornata, come il cruciverba: la griglia scritta,
-- le note a matita, e gli aiuti chiesti, che sono quel che decide i punti.
CREATE TABLE sudoku_games (
  id            TEXT    PRIMARY KEY,
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  date          TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('playing', 'done')),
  -- La griglia del giocatore, 81 caratteri: le date, le sue cifre, i punti.
  cifre         TEXT    NOT NULL,
  -- Le note a matita, tre cifre in base otto per casella (shared/sudoku.ts).
  note          TEXT    NOT NULL DEFAULT '',
  -- Le caselle svelate, in JSON: ognuna costa tre punti.
  svelate       TEXT    NOT NULL DEFAULT '[]',
  -- Le caselle segnalate come sbagliate, con le cifre che avevano: un
  -- controllo ripetuto sulla stessa cifra sbagliata non si paga due volte.
  segnalate     TEXT    NOT NULL DEFAULT '{}',
  errori        INTEGER NOT NULL DEFAULT 0,
  -- Il tempo a pagina visibile, dichiarato dal browser e limitato dal server.
  tempo_ms      INTEGER NOT NULL DEFAULT 0,
  score         INTEGER NOT NULL DEFAULT 0,
  -- Il lucchetto della concorrenza ottimistica, come nel cruciverba.
  versione      INTEGER NOT NULL DEFAULT 0,
  started_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  finished_at   TEXT,
  UNIQUE (player_id, puzzle_number)
);

CREATE INDEX idx_sudoku_puzzle ON sudoku_games (puzzle_number);
