-- La compagnia del cruciverba e dello Scarabeo, come la stanza del Wordle
-- (coop_rooms): l'host gioca la classificata del giorno, gli invitati la
-- guardano, suggeriscono, e prendono il suo stesso punteggio.
--
-- Una tabella per tutti i giochi che vengono dopo il Wordle, che resta nelle
-- sue. `gioco` non ha un CHECK: un gioco nuovo non deve rifare la tabella (in
-- SQLite cambiare un CHECK vuol dire rifarla), e a tenerlo chiuso basta il
-- tipo. Nelle libere la compagnia e' dell'host per quel gioco, e segue la
-- partita che sta giocando (`partita_id`); lo Scarabeo libero, che sta tutto
-- nel suo telefono, ci scrive le mosse (`stato`), e ogni scrittura ha la sua
-- `versione`.

CREATE TABLE compagnie (
  id            TEXT PRIMARY KEY,
  gioco         TEXT NOT NULL,
  modalita      TEXT NOT NULL DEFAULT 'classificata' CHECK (modalita IN ('classificata', 'libera')),
  host_id       TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  puzzle_number INTEGER,
  partita_id    TEXT,
  stato         TEXT,
  versione      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT,
  chiusa_at     TEXT
);

-- Una compagnia per host, gioco e giornata: la crea il primo invito.
CREATE UNIQUE INDEX idx_compagnie_giornata ON compagnie (gioco, host_id, puzzle_number)
  WHERE modalita = 'classificata';
-- Nelle libere una per host e gioco: la riapre il primo invito dopo che l'ha chiusa.
CREATE UNIQUE INDEX idx_compagnie_libere ON compagnie (gioco, host_id)
  WHERE modalita = 'libera';

CREATE TABLE compagnie_ospiti (
  compagnia_id TEXT NOT NULL REFERENCES compagnie(id) ON DELETE CASCADE,
  guest_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stato        TEXT NOT NULL CHECK (stato IN ('invito', 'dentro', 'rifiutato')),
  created_at   TEXT NOT NULL,
  risposto_at  TEXT,
  PRIMARY KEY (compagnia_id, guest_id)
);
CREATE INDEX idx_compagnie_ospiti_guest ON compagnie_ospiti (guest_id, stato);

-- Un suggerimento per chiave e per invitato: nel cruciverba la chiave e' la
-- definizione, nello Scarabeo il turno dell'host. Suggerire di nuovo sulla
-- stessa chiave sostituisce quel che c'era.
CREATE TABLE compagnie_suggerimenti (
  id           TEXT PRIMARY KEY,
  compagnia_id TEXT NOT NULL REFERENCES compagnie(id) ON DELETE CASCADE,
  guest_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  chiave       TEXT NOT NULL,
  dati         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  UNIQUE (compagnia_id, guest_id, chiave)
);

-- La giornata di chi accetta diventa quella dell'host: `in_compagnia` dice in
-- quale compagnia e chiude la sua partita, `assist_score` porta il punteggio
-- dell'host, come `wordle_games.assist_score`.
ALTER TABLE cruciverba_games ADD COLUMN in_compagnia TEXT;
ALTER TABLE cruciverba_games ADD COLUMN assist_score INTEGER;
ALTER TABLE scarabeo_games ADD COLUMN in_compagnia TEXT;
ALTER TABLE scarabeo_games ADD COLUMN assist_score INTEGER;
CREATE INDEX idx_cruciverba_compagnia ON cruciverba_games (in_compagnia) WHERE in_compagnia IS NOT NULL;
CREATE INDEX idx_scarabeo_compagnia ON scarabeo_games (in_compagnia) WHERE in_compagnia IS NOT NULL;
