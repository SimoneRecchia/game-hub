-- Il tris: la serie del giorno contro il computer, e le partite fra amici.
--
-- ---- La classificata ----
--
-- Una riga per giocatore al giorno. La serie e' di cinque partite contro il
-- computer del giorno, lo stesso per tutti; `partite` tiene le mosse di ognuna
-- e com'e' finita, e la verita' sono le mosse, come nello Scarabeo. Ogni mossa
-- ha il suo tempo: `mossa_at` e' quando e' cominciato quello della mossa da
-- fare, NULL fra una partita e l'altra, e una mossa arrivata dopo il tempo (o
-- una partita lasciata a meta') e' una partita persa. I punti si scrivono a
-- serie finita; vinte e patte stanno anche in colonna, per la classifica, che
-- le somma senza leggere le mosse di tutti.
CREATE TABLE tris_partite (
  id            TEXT    PRIMARY KEY,
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  date          TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('playing', 'done')),
  partite       TEXT    NOT NULL DEFAULT '[]',
  mossa_at      TEXT,
  vinte         INTEGER NOT NULL DEFAULT 0,
  patte         INTEGER NOT NULL DEFAULT 0,
  score         INTEGER NOT NULL DEFAULT 0,
  versione      INTEGER NOT NULL DEFAULT 0,
  started_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  finished_at   TEXT,
  UNIQUE (player_id, puzzle_number)
);

CREATE INDEX idx_tris_puzzle ON tris_partite (puzzle_number);

-- ---- Le partite fra amici ----
--
-- Il tris entra fra i giochi da tavoliere, e la tabella si rifà: il CHECK sul
-- gioco non si allarga in SQLite. Il nuovo non ce l'ha piu': il gioco lo
-- controlla il server (`GIOCHI_TAVOLIERE`), e un gioco nuovo non deve voler
-- rifare la tabella un'altra volta. Nessuna chiave esterna punta qui, quindi
-- rifarla e' sicuro, e le righe restano tutte com'erano.
CREATE TABLE tavolo_partite_nuova (
  id            TEXT    PRIMARY KEY,
  gioco         TEXT    NOT NULL,
  giocatore_a   TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  giocatore_b   TEXT    REFERENCES players (id) ON DELETE CASCADE,
  invitato      TEXT    REFERENCES players (id) ON DELETE CASCADE,
  codice        TEXT    UNIQUE,
  stato         TEXT    NOT NULL CHECK (stato IN ('invito', 'in_corso', 'finita', 'rifiutata', 'annullata')),
  primo         TEXT    CHECK (primo IN ('a', 'b')),
  posizione     TEXT    NOT NULL,
  mosse         TEXT    NOT NULL DEFAULT '[]',
  chiavi        TEXT    NOT NULL DEFAULT '[]',
  vincitore     TEXT    CHECK (vincitore IN ('a', 'b')),
  motivo        TEXT,
  patta         TEXT    CHECK (patta IN ('a', 'b')),
  patta_n       INTEGER NOT NULL DEFAULT -1,
  rivincita_di  TEXT,
  serie_a       INTEGER NOT NULL DEFAULT 0,
  serie_b       INTEGER NOT NULL DEFAULT 0,
  partite_serie INTEGER NOT NULL DEFAULT 0,
  versione      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  iniziata_at   TEXT,
  -- L'ultima mossa: da li' si conta l'attesa, e nel tris il tempo della mossa.
  mossa_at      TEXT,
  updated_at    TEXT    NOT NULL,
  finita_at     TEXT,
  morte         TEXT,
  morte_ok      TEXT    CHECK (morte_ok IN ('a', 'b')),
  punti         TEXT
);

INSERT INTO tavolo_partite_nuova
  (id, gioco, giocatore_a, giocatore_b, invitato, codice, stato, primo, posizione, mosse, chiavi,
   vincitore, motivo, patta, patta_n, rivincita_di, serie_a, serie_b, partite_serie, versione,
   created_at, iniziata_at, mossa_at, updated_at, finita_at, morte, morte_ok, punti)
  SELECT id, gioco, giocatore_a, giocatore_b, invitato, codice, stato, primo, posizione, mosse, chiavi,
         vincitore, motivo, patta, patta_n, rivincita_di, serie_a, serie_b, partite_serie, versione,
         created_at, iniziata_at, mossa_at, updated_at, finita_at, morte, morte_ok, punti
    FROM tavolo_partite;

DROP TABLE tavolo_partite;
ALTER TABLE tavolo_partite_nuova RENAME TO tavolo_partite;

CREATE INDEX idx_tavolo_a ON tavolo_partite (giocatore_a, stato);
CREATE INDEX idx_tavolo_b ON tavolo_partite (giocatore_b, stato);
CREATE INDEX idx_tavolo_invitato ON tavolo_partite (invitato, stato);
CREATE INDEX idx_tavolo_rivincita ON tavolo_partite (rivincita_di);
CREATE INDEX idx_tavolo_aggiornata ON tavolo_partite (updated_at);
