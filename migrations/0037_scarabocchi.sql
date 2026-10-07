-- Scarabocchi: le stanze per disegnare e indovinare con gli amici.
--
-- Come le stanze di Lupus: un codice, chi c'e' dentro (una stanza alla volta,
-- la chiave e' il giocatore), gli inviti, e la partita in JSON con le parole
-- segrete, riscritta condizionata alla `versione` letta. `numero` conta le
-- partite della stanza: i tratti, le risposte e i fogli sono di una partita.
--
-- Le cose che arrivano spesso stanno in tabelle loro, e si aggiungono senza
-- toccare la stanza: i tratti, a pezzi, ognuno con il suo numero nel foglio;
-- le risposte di chi indovina, con l'ora del server e i punti; i fogli del
-- telefono senza fili, uno per catena e per passo. Cosi' sette persone che
-- scrivono insieme non si contendono la riga della stanza.

CREATE TABLE scarabocchi_stanze (
  id           TEXT PRIMARY KEY,
  codice       TEXT NOT NULL UNIQUE,
  conduttore   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stato        TEXT NOT NULL CHECK (stato IN ('attesa', 'partita', 'finita')),
  impostazioni TEXT NOT NULL,
  partita      TEXT,
  numero       INTEGER NOT NULL DEFAULT 0,
  versione     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_scarabocchi_stanze_updated ON scarabocchi_stanze (updated_at);

CREATE TABLE scarabocchi_iscritti (
  player_id  TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  stanza_id  TEXT NOT NULL REFERENCES scarabocchi_stanze(id) ON DELETE CASCADE,
  entrato_at TEXT NOT NULL
);
CREATE INDEX idx_scarabocchi_iscritti_stanza ON scarabocchi_iscritti (stanza_id, entrato_at);

CREATE TABLE scarabocchi_inviti (
  id         TEXT PRIMARY KEY,
  stanza_id  TEXT NOT NULL REFERENCES scarabocchi_stanze(id) ON DELETE CASCADE,
  da_id      TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  a_id       TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stato      TEXT NOT NULL CHECK (stato IN ('attesa', 'accettato', 'rifiutato')),
  created_at TEXT NOT NULL,
  UNIQUE (stanza_id, a_id)
);
CREATE INDEX idx_scarabocchi_inviti_a ON scarabocchi_inviti (a_id, stato);

-- I tratti di un foglio, a pezzi: 't3' e' il turno 3 di Indovina il disegno,
-- 'c2p1' la catena 2 al passo 1 del telefono senza fili.
CREATE TABLE scarabocchi_tratti (
  stanza_id TEXT NOT NULL REFERENCES scarabocchi_stanze(id) ON DELETE CASCADE,
  numero    INTEGER NOT NULL,
  foglio    TEXT NOT NULL,
  n         INTEGER NOT NULL,
  dati      TEXT NOT NULL,
  PRIMARY KEY (stanza_id, numero, foglio, n)
);

-- Le risposte di Indovina il disegno. Una giusta per giocatore e per turno:
-- un doppio tocco non la conta due volte.
CREATE TABLE scarabocchi_messaggi (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  stanza_id TEXT NOT NULL REFERENCES scarabocchi_stanze(id) ON DELETE CASCADE,
  numero    INTEGER NOT NULL,
  turno     INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  testo     TEXT NOT NULL,
  esito     TEXT NOT NULL CHECK (esito IN ('giusta', 'vicina', 'no')),
  punti     INTEGER NOT NULL DEFAULT 0,
  at        TEXT NOT NULL
);
CREATE INDEX idx_scarabocchi_messaggi ON scarabocchi_messaggi (stanza_id, numero, turno, id);
CREATE UNIQUE INDEX idx_scarabocchi_messaggi_giusta
  ON scarabocchi_messaggi (stanza_id, numero, turno, player_id) WHERE esito = 'giusta';

-- I fogli del telefono senza fili: la frase scritta (per i disegni i tratti
-- stanno in scarabocchi_tratti) e se e' stato consegnato.
CREATE TABLE scarabocchi_fogli (
  stanza_id  TEXT NOT NULL REFERENCES scarabocchi_stanze(id) ON DELETE CASCADE,
  numero     INTEGER NOT NULL,
  catena     INTEGER NOT NULL,
  passo      INTEGER NOT NULL,
  autore     TEXT NOT NULL,
  testo      TEXT,
  consegnato INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (stanza_id, numero, catena, passo)
);
