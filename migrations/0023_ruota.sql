-- La ruota del giorno: un giro al giorno per giocatore, e le domande delle sfide.

-- ---- I giri ----
--
-- Uno per giocatore per giornata: la chiave e' quella, e un secondo giro lo
-- rifiuta il database prima ancora del codice. Lo spicchio lo sceglie il
-- server, a caso, e il browser lo riceve solo per far fermare la ruota li'.
--
-- `delta` e' quel che la ruota da' o toglie, ed e' quel che somma la
-- classifica generale. Durante una sfida — testa o croce, o una domanda — vale
-- gia' quel che toglie se va male: una sfida lasciata a meta' conta persa, e
-- chi vede la domanda e chiude l'app non si salva cosi'.
CREATE TABLE ruota_giri (
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  puntata       INTEGER NOT NULL,
  -- L'indice nella ruota (shared/ruota.ts), dallo spicchio in cima.
  spicchio      INTEGER NOT NULL,
  -- 'sfida': la moneta o la domanda non ancora giocate; 'domanda': la domanda
  -- e' aperta e il tempo corre; 'fatto': l'esito e' quello di `delta`.
  stato         TEXT    NOT NULL CHECK (stato IN ('sfida', 'domanda', 'fatto')),
  delta         INTEGER NOT NULL,
  -- La sfida, in JSON: il lato scelto e quello uscito, o la domanda intera con
  -- la risposta — che non esce dal server finché non si risponde.
  sfida         TEXT,
  aperta_at     TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  PRIMARY KEY (player_id, puzzle_number)
);

CREATE INDEX idx_ruota_puzzle ON ruota_giri (puzzle_number);

-- ---- Le domande ----
--
-- Qualche domanda per materia per giornata, fatte la notte con le domande del
-- quiz (scripts/genera-quiz.ts): il Worker non ha i dati ne' i dieci
-- millisecondi per farle. A chi gira ne tocca una a caso. Come le giornate del
-- quiz, una volta scritte non cambiano.
CREATE TABLE ruota_domande (
  puzzle_number INTEGER NOT NULL,
  materia       TEXT    NOT NULL,
  -- Le domande complete, in JSON, con la risposta.
  domande       TEXT    NOT NULL,
  created_at    TEXT    NOT NULL,
  PRIMARY KEY (puzzle_number, materia)
);
