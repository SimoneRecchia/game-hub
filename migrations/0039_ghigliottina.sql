-- La Ghigliottina: la partita di ogni giornata e le partite.
--
-- ---- Le giornate ----
--
-- Le scrive la notte (scripts/genera-ghigliottina.ts) con INSERT OR IGNORE:
-- una giornata scritta non cambia piu', anche se l'elenco si rifa'.
-- `ghigliottina` e' il JSON della parola vincente e delle cinque coppie, con
-- quale parola e' giusta e l'espressione che la lega (shared/ghigliottina.ts,
-- GhigliottinaDelGiorno): non esce dal server, se non una coppia alla volta,
-- senza dire qual e' quella giusta finché non si e' scelto.
CREATE TABLE ghigliottina_giornate (
  puzzle_number INTEGER PRIMARY KEY,
  ghigliottina  TEXT    NOT NULL,
  formato       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL
);

-- ---- Le partite ----
--
-- Una riga per giocatore al giorno, creata con la prima scelta: guardare la
-- pagina non apre niente. `scelte` e' il JSON delle parole scelte, una per
-- coppia (0 o 1); `finale_at` e' quando e' partito il minuto della parola
-- vincente. Sbagliate, esito, tempo e punti stanno anche in colonna, per la
-- classifica, che li somma senza leggere le scelte di tutti.
CREATE TABLE ghigliottina_partite (
  id            TEXT    PRIMARY KEY,
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  date          TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('playing', 'done')),
  scelte        TEXT    NOT NULL DEFAULT '[]',
  sbagliate     INTEGER NOT NULL DEFAULT 0,
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

CREATE INDEX idx_ghigliottina_puzzle ON ghigliottina_partite (puzzle_number);
