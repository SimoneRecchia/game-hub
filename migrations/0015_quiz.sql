-- Il quiz di geografia: le domande del giorno, le partite, il riassunto dei dati.

-- ---- Le giornate ----
--
-- Dieci domande al giorno, della categoria del giorno, uguali per tutti. Le fa
-- lo script della notte (scripts/genera-quiz.ts) dal riassunto dei dati: le
-- domande hanno bisogno di tutti i paesi, i mari e i fiumi, e leggerli non
-- starebbe nei 10 ms di CPU di una richiesta. Una volta scritte non cambiano
-- piu': `INSERT OR IGNORE`, come gli schemi del cruciverba.
CREATE TABLE quiz_giornate (
  puzzle_number INTEGER PRIMARY KEY,
  categoria     TEXT    NOT NULL,
  -- JSON: le domande con le risposte (shared/quiz-domande.ts, DomandaCompleta).
  -- Le risposte non escono dal server prima che si sia risposto.
  domande       TEXT    NOT NULL,
  created_at    TEXT    NOT NULL
);

-- ---- Le partite ----
--
-- Una riga per giocatore per giornata, creata alla prima domanda: guardare la
-- pagina del quiz non apre una partita. La verita' sono le risposte, in ordine;
-- il resto si ricava.
CREATE TABLE quiz_partite (
  id            TEXT    PRIMARY KEY,
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  date          TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('playing', 'done')),
  -- JSON: [{ "s": scelta o null se il tempo e' finito, "g": 1 se giusta, "ms": tempo }].
  -- La lunghezza e' il numero della prossima domanda, e ogni scrittura e'
  -- condizionata a quella letta: due risposte ravvicinate non contano due volte.
  risposte      TEXT    NOT NULL DEFAULT '[]',
  -- Da quando corre il tempo della domanda aperta; null se nessuna e' aperta.
  aperta_at     TEXT,
  giuste        INTEGER NOT NULL DEFAULT 0,
  -- Il tempo usato per rispondere, sommato: e' lo spareggio in classifica.
  tempo_ms      INTEGER NOT NULL DEFAULT 0,
  score         INTEGER NOT NULL DEFAULT 0,
  started_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  finished_at   TEXT,
  UNIQUE (player_id, puzzle_number)
);

CREATE INDEX idx_quiz_puzzle ON quiz_partite (puzzle_number);

-- ---- Il riassunto dei dati ----
--
-- Paesi, acque, fiumi e laghi, ridotti da Wikidata e Natural Earth a quel che
-- serve per fare domande: le partite libere lo scaricano e giocano nel browser.
-- Una riga per sezione, perché una sola istruzione di D1 non puo' superare i
-- cento kB. Le bandiere e le cartine non ci sono: il browser le prende da
-- flagcdn e da jsDelivr.
CREATE TABLE quiz_dati (
  parte      TEXT PRIMARY KEY,
  versione   TEXT NOT NULL,
  -- JSON: la sezione del riassunto (shared/quiz-dati.ts).
  dati       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
