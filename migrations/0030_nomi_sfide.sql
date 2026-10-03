-- Nomi, cose e città fra amici: l'invito e' gia' la partita, come in Indovina
-- chi. La riga nasce invito — a un amico online (`invitato`) o con un link
-- (`codice`) — e diventa la partita quando l'altro accetta: nello stesso
-- `UPDATE` si pescano la lettera e le categorie, e parte il tre-due-uno
-- (`inizio_at`). Si scrive insieme, e chi finisce per primo dice stop
-- (`stop_at`, `stop_di`): da li' si smette di scrivere tutti, come al tavolo.
-- I punti si contano a partita chiusa, con il lessico (`esito`).
CREATE TABLE nomi_sfide (
  id            TEXT    PRIMARY KEY,
  giocatore_a   TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  giocatore_b   TEXT    REFERENCES players (id) ON DELETE CASCADE,
  invitato      TEXT    REFERENCES players (id) ON DELETE CASCADE,
  codice        TEXT    UNIQUE,
  stato         TEXT    NOT NULL CHECK (stato IN ('invito', 'in_corso', 'finita', 'rifiutata', 'annullata')),
  lettera       TEXT,
  categorie     TEXT,
  inizio_at     TEXT,
  stop_at       TEXT,
  stop_di       TEXT    CHECK (stop_di IN ('a', 'b', 'tempo')),
  risposte_a    TEXT    NOT NULL DEFAULT '{}',
  risposte_b    TEXT    NOT NULL DEFAULT '{}',
  esito         TEXT,
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

CREATE INDEX idx_nomi_sfide_a ON nomi_sfide (giocatore_a, stato);
CREATE INDEX idx_nomi_sfide_b ON nomi_sfide (giocatore_b, stato);
CREATE INDEX idx_nomi_sfide_invitato ON nomi_sfide (invitato, stato);
CREATE INDEX idx_nomi_sfide_rivincita ON nomi_sfide (rivincita_di);
