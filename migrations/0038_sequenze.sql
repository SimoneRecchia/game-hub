-- Sequenze: le sequenze di ogni giornata, le partite e le sfide fra amici.
--
-- ---- Le giornate ----
--
-- Le sequenze di un giorno si pescano a caso la prima volta che qualcuno ne
-- apre una (INSERT OR IGNORE, poi si rilegge), come la parola del Wordle: da
-- li' sono le stesse per tutti. Non vengono da un seme che il telefono
-- potrebbe rifare, perché sapere prima la sequenza e' l'unico modo di barare.
-- `sequenze` e' il JSON di cinque turni, ognuno con sette sequenze in cifre,
-- da tre a nove cubetti (shared/sequenze.ts, giornataInTesto): non esce dal
-- server, se non una sequenza alla volta, quando la si apre.
CREATE TABLE sequenze_giornate (
  puzzle_number INTEGER PRIMARY KEY,
  sequenze      TEXT    NOT NULL,
  created_at    TEXT    NOT NULL
);

-- ---- Le partite ----
--
-- Una riga per giocatore al giorno, creata con il primo turno: guardare la
-- pagina non apre niente. `turni` tiene com'e' andato ogni turno cominciato
-- (le sequenze giuste, il tempo, se e' chiuso); la sequenza aperta e' quella
-- dopo le giuste del turno in corso, e `aperta_at` dice quando e' stata
-- mandata. Una sequenza si vede una volta: se la pagina si riapre con una
-- sequenza aperta, conta sbagliata. Punti, giuste, la lunghezza migliore e il
-- tempo stanno anche in colonna, per la classifica.
CREATE TABLE sequenze_partite (
  id            TEXT    PRIMARY KEY,
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  date          TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('playing', 'done')),
  turni         TEXT    NOT NULL DEFAULT '[]',
  aperta_at     TEXT,
  giuste        INTEGER NOT NULL DEFAULT 0,
  migliore      INTEGER NOT NULL DEFAULT 0,
  tempo_ms      INTEGER NOT NULL DEFAULT 0,
  score         INTEGER NOT NULL DEFAULT 0,
  versione      INTEGER NOT NULL DEFAULT 0,
  started_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  finished_at   TEXT,
  UNIQUE (player_id, puzzle_number)
);

CREATE INDEX idx_sequenze_puzzle ON sequenze_partite (puzzle_number);

-- ---- Le sfide ----
--
-- Fra amici l'invito e' gia' la partita, come in Nomi, cose e città: la riga
-- nasce invito — a un amico online (`invitato`) o con un link (`codice`) — e
-- diventa la partita quando l'altro accetta, con il seme delle sequenze e il
-- via fra un attimo. Poi ognuno gioca le stesse sequenze, e ognuno scrive
-- nella sua colonna: quante ne ha ripetute giuste (`livello_a`, `livello_b`),
-- quando gli e' stata mandata quella che sta ripetendo (`aperta_a`,
-- `aperta_b`) e quando ha sbagliato (`fine_a`, `fine_b`). Due scritture
-- insieme non si pestano. Il seme non esce dal server: ogni sequenza arriva
-- con la risposta alla precedente. Vince chi arriva piu' lontano.
CREATE TABLE sequenze_sfide (
  id            TEXT    PRIMARY KEY,
  giocatore_a   TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  giocatore_b   TEXT    REFERENCES players (id) ON DELETE CASCADE,
  invitato      TEXT    REFERENCES players (id) ON DELETE CASCADE,
  codice        TEXT    UNIQUE,
  stato         TEXT    NOT NULL CHECK (stato IN ('invito', 'in_corso', 'finita', 'rifiutata', 'annullata')),
  seme          INTEGER,
  inizio_at     TEXT,
  livello_a     INTEGER NOT NULL DEFAULT 0,
  livello_b     INTEGER NOT NULL DEFAULT 0,
  aperta_a      TEXT,
  aperta_b      TEXT,
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

CREATE INDEX idx_sequenze_sfide_a ON sequenze_sfide (giocatore_a, stato);
CREATE INDEX idx_sequenze_sfide_b ON sequenze_sfide (giocatore_b, stato);
CREATE INDEX idx_sequenze_sfide_invitato ON sequenze_sfide (invitato, stato);
CREATE INDEX idx_sequenze_sfide_rivincita ON sequenze_sfide (rivincita_di);
