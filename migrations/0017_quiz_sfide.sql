-- Le sfide a quiz fra due giocatori: amichevoli, a tempo, sulle stesse domande.
--
-- Non restano: i punti non vanno in classifica, e duelli e sfide piu' vecchi di
-- un giorno si cancellano (DUELLO_CONSERVA_MS in shared/quiz-sfida.ts).

-- ---- Le sfide ----
--
-- Una sfida a chi e' online, una rivincita alla fine di un duello, o un invito
-- con un link: in quel caso `a_id` resta vuoto finché qualcuno non lo usa. Le
-- domande le fa il browser di chi sfida, con i dati del quiz che ha gia': il
-- Worker non ha i dieci millisecondi per farle. Restano qui, con le risposte,
-- e vanno a chi gioca una alla volta e senza.
CREATE TABLE quiz_sfide (
  id           TEXT PRIMARY KEY,
  da_id        TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  a_id         TEXT REFERENCES players (id) ON DELETE CASCADE,
  codice       TEXT UNIQUE,
  stato        TEXT NOT NULL CHECK (stato IN ('attesa', 'accettata', 'rifiutata', 'annullata')),
  impostazioni TEXT NOT NULL,
  domande      TEXT NOT NULL,
  -- La rivincita di quale duello: ne porta avanti il conto della serie.
  rivincita_di TEXT,
  duello_id    TEXT,
  created_at   TEXT NOT NULL,
  risposto_at  TEXT
);

CREATE INDEX idx_quiz_sfide_a ON quiz_sfide (a_id, stato);
CREATE INDEX idx_quiz_sfide_da ON quiz_sfide (da_id, stato);
CREATE INDEX idx_quiz_sfide_rivincita ON quiz_sfide (rivincita_di);

-- ---- I duelli ----
--
-- La verita' sono le risposte, nell'ordine di arrivo e con l'ora del server:
-- quale domanda e' aperta, fino a quando per ciascuno e chi ha i punti si
-- ricavano da quelle e da `inizio_at` (vedi statoSfida). Il tempo che finisce
-- non si scrive.
CREATE TABLE quiz_duelli (
  id           TEXT PRIMARY KEY,
  -- 'a' e' chi ha sfidato la prima volta; nelle rivincite i due restano ai loro posti.
  giocatore_a  TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  giocatore_b  TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  impostazioni TEXT NOT NULL,
  domande      TEXT NOT NULL,
  risposte     TEXT NOT NULL DEFAULT '[]',
  -- Chi e' arrivato nella pagina del duello: si comincia quando ci sono tutti e due.
  pronto_a     INTEGER NOT NULL DEFAULT 0,
  pronto_b     INTEGER NOT NULL DEFAULT 0,
  -- Quando si apre la prima domanda, in millisecondi; NULL finché non sono pronti.
  inizio_at    INTEGER,
  stato        TEXT NOT NULL CHECK (stato IN ('attesa', 'in_corso', 'finito', 'abbandonato')),
  -- Chi se n'e' andato prima della fine.
  resa         TEXT CHECK (resa IN ('a', 'b')),
  -- La serie: i punti delle partite di prima fra gli stessi due, e quante erano.
  serie_a      INTEGER NOT NULL DEFAULT 0,
  serie_b      INTEGER NOT NULL DEFAULT 0,
  partite      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX idx_quiz_duelli_a ON quiz_duelli (giocatore_a, stato);
CREATE INDEX idx_quiz_duelli_b ON quiz_duelli (giocatore_b, stato);
CREATE INDEX idx_quiz_duelli_updated ON quiz_duelli (updated_at);
