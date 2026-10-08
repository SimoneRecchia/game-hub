-- La Catena: la catena di ogni giornata e le partite.
--
-- ---- Le giornate ----
--
-- Le scrive la notte (scripts/genera-catena.ts) con INSERT OR IGNORE: una
-- giornata scritta non cambia piu', anche se l'elenco si rifa'. `catena` e' il
-- JSON delle undici parole e delle dieci espressioni che le legano
-- (shared/catena.ts, CatenaDelGiorno): non esce dal server, se non le parole
-- viste e le lettere di quella da indovinare.
CREATE TABLE catena_giornate (
  puzzle_number INTEGER PRIMARY KEY,
  catena        TEXT    NOT NULL,
  formato       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL
);

-- ---- Le partite ----
--
-- Una riga per giocatore al giorno, creata con la prima mossa: guardare la
-- pagina non apre niente. `mosse` e' il JSON delle mosse — le parole provate,
-- i jolly, il terzo elemento comprato — da cui si ricava tutto il resto
-- (svolgiCatena); `finale_at` e' quando parte il minuto della parola finale,
-- scritto con la mossa che ci arriva. Esito, tempo e punti stanno anche in
-- colonna, per la classifica, che li somma senza rigiocare le partite di tutti.
CREATE TABLE catena_partite (
  id            TEXT    PRIMARY KEY,
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  date          TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('playing', 'done')),
  mosse         TEXT    NOT NULL DEFAULT '[]',
  finale_at     TEXT,
  risposta      TEXT,
  indovinata    INTEGER,
  tempo_ms      INTEGER NOT NULL DEFAULT 0,
  score         INTEGER NOT NULL DEFAULT 0,
  versione      INTEGER NOT NULL DEFAULT 0,
  started_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  finished_at   TEXT,
  UNIQUE (player_id, puzzle_number)
);

CREATE INDEX idx_catena_puzzle ON catena_partite (puzzle_number);
