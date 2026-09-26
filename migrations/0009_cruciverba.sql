-- Cruciverba: gli schemi del giorno e le partite.

-- ---- Gli schemi ----
--
-- Uno per giornata, generato fuori dal Worker (scripts/genera-cruciverba.mjs,
-- lanciato dal workflow programmato): riempire una griglia e' una ricerca con
-- ritorni all'indietro che non sta nei 10 ms di CPU di una richiesta.
--
-- Il workflow ne tiene pronti per le settimane a venire. Una volta scritto, uno
-- schema non cambia piu': `INSERT OR IGNORE`, come le parole del Wordle. Se un
-- giorno si rigenerasse il dizionario, le giornate già giocate resterebbero
-- quelle che tutti hanno visto.
CREATE TABLE cruciverba_schemi (
  puzzle_number INTEGER PRIMARY KEY,
  righe         INTEGER NOT NULL,
  colonne       INTEGER NOT NULL,
  -- righe * colonne caratteri: lettere minuscole, `#` per le nere.
  soluzione     TEXT    NOT NULL,
  -- JSON: { "o12": { "t": testo, "v": voce del Wikizionario, "n": nota } }.
  -- La chiave e' direzione piu' indice della prima casella, la stessa che
  -- calcola shared/cruciverba.ts dalla griglia.
  definizioni   TEXT    NOT NULL,
  created_at    TEXT    NOT NULL
);

-- ---- Le partite ----
--
-- Una riga per giocatore per giornata. Qui la verita' e' la griglia scritta —
-- non ci sono mosse da rigiocare — piu' gli aiuti chiesti, che sono quello che
-- decide i punti.
CREATE TABLE cruciverba_games (
  id            TEXT    PRIMARY KEY,
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  date          TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('playing', 'done')),
  -- La griglia del giocatore, con la forma della soluzione: spazi per le vuote.
  lettere       TEXT    NOT NULL,
  -- Le caselle svelate, in JSON: ognuna costa tre punti.
  svelate       TEXT    NOT NULL DEFAULT '[]',
  -- Le caselle segnalate come sbagliate, con la lettera che avevano: un
  -- controllo ripetuto sulla stessa lettera sbagliata non si paga due volte.
  segnalate     TEXT    NOT NULL DEFAULT '{}',
  errori        INTEGER NOT NULL DEFAULT 0,
  -- Il tempo a pagina visibile, dichiarato dal browser e limitato dal server
  -- al tempo trascorso davvero.
  tempo_ms      INTEGER NOT NULL DEFAULT 0,
  score         INTEGER NOT NULL DEFAULT 0,
  -- Il lucchetto della concorrenza ottimistica: D1 non ha transazioni
  -- interattive, quindi ogni scrittura e' condizionata alla versione letta.
  versione      INTEGER NOT NULL DEFAULT 0,
  started_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  finished_at   TEXT,
  UNIQUE (player_id, puzzle_number)
);

CREATE INDEX idx_cruciverba_puzzle ON cruciverba_games (puzzle_number);
CREATE INDEX idx_cruciverba_player ON cruciverba_games (player_id, puzzle_number);
