-- ---- Le libere in sospeso ----
--
-- Una partita libera lasciata a meta' resta da riprendere, anche il giorno
-- dopo, finché non la si tocca per tre giorni (vedi src/games/sospese.ts). La
-- partita sta dove stava gia': nel telefono, o sul server per il Wordle, il
-- cruciverba e la battaglia. Qui c'e' solo il suo conto, per il pannello di
-- amministrazione: quante ce ne sono in sospeso, quante se ne sono riprese e
-- quante sono scadute. Gli eventi stanno a parte, uno per riga, per il grafico
-- dei giorni.

CREATE TABLE libere_sospese (
  id         TEXT    PRIMARY KEY,
  player_id  TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  gioco      TEXT    NOT NULL,
  stato      TEXT    NOT NULL DEFAULT 'aperta',
  riprese    INTEGER NOT NULL DEFAULT 0,
  creata_at  TEXT    NOT NULL,
  toccata_at TEXT    NOT NULL,
  chiusa_at  TEXT
);

CREATE INDEX idx_libere_sospese_stato ON libere_sospese (stato, toccata_at);

CREATE TABLE libere_sospese_eventi (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sospesa_id TEXT    NOT NULL,
  evento     TEXT    NOT NULL,
  at         TEXT    NOT NULL
);

CREATE INDEX idx_libere_sospese_eventi_at ON libere_sospese_eventi (at);
