-- Le sfide fra amici delle libere che si giocano da soli: il sudoku, gli
-- Anagrammi, il Paroliere, la Ghigliottina e la Catena (shared/sfide-libere.ts).
--
-- Come in Nomi, cose e città l'invito e' gia' la partita: la riga nasce invito
-- — a un amico online (`invitato`) o con un link (`codice`) — con il gioco e
-- le opzioni scelte da chi sfida, e diventa la partita quando l'altro accetta.
-- Nello stesso `UPDATE` si pescano il seme, il via fra un attimo (`inizio_at`)
-- e quando il server la chiude comunque (`scade_at`, il via piu' la durata
-- massima del gioco). Dal via ognuno gioca sul suo telefono la partita che il
-- seme da' a tutti e due, e scrive nelle sue colonne quel che ha fatto: i punti
-- se finisse adesso, quanta strada, il tempo, e quando ha finito. Due
-- scritture insieme non si pestano. `gioco` non ha un CHECK: lo controlla il
-- server, e un gioco nuovo non deve rifare la tabella.
CREATE TABLE sfide_libere (
  id            TEXT    PRIMARY KEY,
  gioco         TEXT    NOT NULL,
  impostazioni  TEXT    NOT NULL,
  giocatore_a   TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  giocatore_b   TEXT    REFERENCES players (id) ON DELETE CASCADE,
  invitato      TEXT    REFERENCES players (id) ON DELETE CASCADE,
  codice        TEXT    UNIQUE,
  stato         TEXT    NOT NULL CHECK (stato IN ('invito', 'in_corso', 'finita', 'rifiutata', 'annullata')),
  seme          INTEGER,
  inizio_at     TEXT,
  scade_at      TEXT,
  punti_a       INTEGER NOT NULL DEFAULT 0,
  punti_b       INTEGER NOT NULL DEFAULT 0,
  passo_a       INTEGER NOT NULL DEFAULT 0,
  passo_b       INTEGER NOT NULL DEFAULT 0,
  tempo_a       INTEGER NOT NULL DEFAULT 0,
  tempo_b       INTEGER NOT NULL DEFAULT 0,
  partito_a     TEXT,
  partito_b     TEXT,
  fine_a        TEXT,
  fine_b        TEXT,
  vincitore     TEXT    CHECK (vincitore IN ('a', 'b', 'pari')),
  rivincita_di  TEXT,
  serie_a       INTEGER NOT NULL DEFAULT 0,
  serie_b       INTEGER NOT NULL DEFAULT 0,
  partite_serie INTEGER NOT NULL DEFAULT 0,
  versione      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  finita_at     TEXT
);

CREATE INDEX idx_sfide_libere_a ON sfide_libere (giocatore_a, stato);
CREATE INDEX idx_sfide_libere_b ON sfide_libere (giocatore_b, stato);
CREATE INDEX idx_sfide_libere_invitato ON sfide_libere (invitato, stato);
CREATE INDEX idx_sfide_libere_rivincita ON sfide_libere (rivincita_di);
