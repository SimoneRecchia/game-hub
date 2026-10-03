-- Nomi, cose e città: la giornata e le partite.
--
-- La giornata e' la lettera e le cinque categorie, fissate da chi comincia per
-- primo (`INSERT OR IGNORE`, come la parola del Wordle): si ricavano dal
-- numero del giorno, ma le categorie dipendono dai conti del lessico, e un
-- lessico rifatto non deve cambiare la giornata di chi ha gia' giocato. La
-- notte, quando la giornata e' finita, ci si scrive anche quanti hanno giocato
-- e le risposte piu' date.
CREATE TABLE nomi_giornate (
  puzzle_number INTEGER PRIMARY KEY,
  lettera       TEXT    NOT NULL,
  categorie     TEXT    NOT NULL,
  giocatori     INTEGER,
  piu_date      TEXT,
  created_at    TEXT    NOT NULL
);

-- Una riga per giocatore al giorno: nasce quando si comincia, e da li' parte il
-- tempo. Le risposte sono un oggetto categoria → testo, salvato mentre si
-- scrive. Alla consegna il server ci scrive le forme che il lessico riconosce
-- (`forme`), per dire subito quali risposte valgono; i punti (`score`) li
-- scrive la notte, quando si conoscono le risposte di tutti: NULL fino ad
-- allora, e valgono nella classifica del giorno dopo. `dettagli` ha ogni
-- risposta contata: la forma, quanti l'hanno data, i punti; `valide` quante
-- erano valide, per la classifica, che le somma senza leggere i dettagli di
-- tutti.
CREATE TABLE nomi_partite (
  id            TEXT    PRIMARY KEY,
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  date          TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('playing', 'done')),
  risposte      TEXT    NOT NULL DEFAULT '{}',
  iniziata_at   TEXT    NOT NULL,
  tempo_ms      INTEGER,
  forme         TEXT,
  score         INTEGER,
  valide        INTEGER,
  dettagli      TEXT,
  versione      INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT    NOT NULL,
  finished_at   TEXT,
  UNIQUE (player_id, puzzle_number)
);

CREATE INDEX idx_nomi_puzzle ON nomi_partite (puzzle_number);
