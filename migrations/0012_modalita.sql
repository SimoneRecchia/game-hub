-- Due modi di giocare a ogni gioco: la classificata e la libera.
--
-- La **classificata** e' la partita del giorno: una sola, uguale per tutti, ed
-- e' l'unica che fa punti in classifica. Quella c'era gia' per tutti i giochi
-- tranne la battaglia navale, dove diventa una partita contro il computer con
-- la stessa flotta nemica per tutti.
--
-- La **libera** e' quante partite si vuole, a caso, senza punti: una parola del
-- Wordle, uno schema del cruciverba, una partita di Scarabeo contro il
-- computer, una battaglia contro il computer o contro un amico.

-- ---- Wordle: le parole libere ----
--
-- Una riga per partita, come `wordle_games` ma senza giornata: la parola la
-- sceglie il server a caso, e resta sul server finché la partita non finisce,
-- come nella classificata.
CREATE TABLE wordle_libere (
  id          TEXT    PRIMARY KEY,
  player_id   TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  answer      TEXT    NOT NULL,
  status      TEXT    NOT NULL CHECK (status IN ('playing', 'won', 'lost')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  guesses     TEXT    NOT NULL DEFAULT '[]',
  created_at  TEXT    NOT NULL,
  finished_at TEXT
);

CREATE INDEX idx_wordle_libere_player ON wordle_libere (player_id, created_at);

-- ---- Cruciverba: gli schemi liberi e le loro partite ----
--
-- Gli schemi liberi li genera lo stesso script di quelli del giorno, con semi
-- loro, e restano nella tabella per sempre: la scorta cresce ogni notte (vedi
-- .github/workflows/cruciverba.yml). Uno schema libero non e' di nessun giorno,
-- quindi ha un numero suo invece del numero del puzzle.
CREATE TABLE cruciverba_schemi_liberi (
  id          INTEGER PRIMARY KEY,
  righe       INTEGER NOT NULL,
  colonne     INTEGER NOT NULL,
  soluzione   TEXT    NOT NULL,
  definizioni TEXT    NOT NULL,
  created_at  TEXT    NOT NULL
);

-- Le stesse colonne della partita del giorno: gli aiuti e la versione servono
-- allo stesso modo, anche se i punti non vanno in classifica.
CREATE TABLE cruciverba_partite_libere (
  id          TEXT    PRIMARY KEY,
  player_id   TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  schema_id   INTEGER NOT NULL REFERENCES cruciverba_schemi_liberi (id),
  status      TEXT    NOT NULL CHECK (status IN ('playing', 'done')),
  lettere     TEXT    NOT NULL,
  svelate     TEXT    NOT NULL DEFAULT '[]',
  segnalate   TEXT    NOT NULL DEFAULT '{}',
  errori      INTEGER NOT NULL DEFAULT 0,
  tempo_ms    INTEGER NOT NULL DEFAULT 0,
  score       INTEGER NOT NULL DEFAULT 0,
  versione    INTEGER NOT NULL DEFAULT 0,
  started_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  finished_at TEXT,
  -- Uno schema si gioca una volta: la partita libera successiva ne pesca un altro.
  UNIQUE (player_id, schema_id)
);

CREATE INDEX idx_cruciverba_libere_player ON cruciverba_partite_libere (player_id, started_at);

-- ---- Scarabeo: il computer della giornata ----
--
-- Il computer gioca da solo le dieci mosse del giorno, sulle stesse tessere di
-- tutti: il suo punteggio e' il riferimento dei punti in classifica (100 a chi
-- lo raggiunge). Lo calcola uno script la notte, perché il Worker non ha la CPU
-- per farlo; `mosse` e' la sua partita, da mostrare a chi ha finito la propria.
--
-- Una riga scritta non cambia piu' (`INSERT OR IGNORE`), come gli schemi del
-- cruciverba: se lo script non avesse girato, la prima partita del giorno
-- scrive un riferimento di ripiego senza mosse, e da lì vale quello per tutti.
CREATE TABLE scarabeo_computer (
  puzzle_number INTEGER PRIMARY KEY,
  punti         INTEGER NOT NULL,
  mosse         TEXT,
  created_at    TEXT    NOT NULL
);

-- I punti in classifica della giornata, accanto al punteggio del tabellone.
--
-- Si scrivono insieme a ogni mossa, perché la classifica li somma in SQL senza
-- rigiocare le partite, e restano quelli: il riferimento del giorno non cambia.
ALTER TABLE scarabeo_games ADD COLUMN punti INTEGER NOT NULL DEFAULT 0;

-- Le partite libere contro il computer si giocano nel browser, dove gira il
-- computer: qui arriva la partita finita, per le statistiche. Il server la
-- rigioca dalle mosse per contarne i punti, invece di fidarsi dei numeri.
CREATE TABLE scarabeo_partite_libere (
  id             TEXT    PRIMARY KEY,
  player_id      TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  livello        TEXT    NOT NULL CHECK (livello IN ('facile', 'normale', 'difficile')),
  seme           INTEGER NOT NULL,
  mosse          TEXT    NOT NULL,
  punti          INTEGER NOT NULL,
  punti_computer INTEGER NOT NULL,
  esito          TEXT    NOT NULL CHECK (esito IN ('vinta', 'persa', 'pari')),
  created_at     TEXT    NOT NULL,
  -- Mandarla due volte non la conta due volte.
  UNIQUE (player_id, seme)
);

CREATE INDEX idx_scarabeo_libere_player ON scarabeo_partite_libere (player_id, created_at);

-- ---- Battaglia navale: il computer e la classificata ----
--
-- La tabella si rifà invece di allargarsi: il secondo giocatore diventa
-- facoltativo — NULL e' il computer — e in SQLite un NOT NULL non si toglie
-- con un ALTER. Nessuna chiave esterna punta qui, quindi rifarla e' sicuro.
--
--   modalita = 'amici'         due giocatori, come prima
--   modalita = 'computer'      partita libera contro il computer, al livello scelto
--   modalita = 'classificata'  la partita del giorno: la flotta del computer e'
--                              la stessa per tutti, e la partita fa punti
CREATE TABLE battaglia_partite_nuova (
  id            TEXT    PRIMARY KEY,
  modalita      TEXT    NOT NULL DEFAULT 'amici'
                CHECK (modalita IN ('amici', 'computer', 'classificata')),
  giocatore_a   TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  giocatore_b   TEXT    REFERENCES players (id) ON DELETE CASCADE,
  -- Il livello del computer, e il seme delle sue scelte: la partita si rigioca.
  livello       TEXT    CHECK (livello IS NULL OR livello IN ('facile', 'normale', 'difficile')),
  seme          INTEGER,
  -- La giornata, per la classificata.
  puzzle_number INTEGER,
  stato         TEXT    NOT NULL CHECK (stato IN ('disposizione', 'battaglia', 'finita')),
  flotta_a      TEXT,
  flotta_b      TEXT,
  primo         TEXT    CHECK (primo IN ('a', 'b')),
  colpi         TEXT    NOT NULL DEFAULT '[]',
  vincitore     TEXT    CHECK (vincitore IN ('a', 'b')),
  motivo        TEXT    CHECK (motivo IN ('flotta', 'resa', 'assenza')),
  -- I punti della classificata, scritti a partita finita.
  punti         INTEGER,
  versione      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  finita_at     TEXT,
  -- Contro il computer non c'e' un secondo giocatore; fra amici c'e' sempre.
  CHECK ((modalita = 'amici') = (giocatore_b IS NOT NULL))
);

INSERT INTO battaglia_partite_nuova
  (id, modalita, giocatore_a, giocatore_b, stato, flotta_a, flotta_b, primo, colpi,
   vincitore, motivo, versione, created_at, updated_at, finita_at)
  SELECT id, 'amici', giocatore_a, giocatore_b, stato, flotta_a, flotta_b, primo, colpi,
         vincitore, motivo, versione, created_at, updated_at, finita_at
    FROM battaglia_partite;

DROP TABLE battaglia_partite;
ALTER TABLE battaglia_partite_nuova RENAME TO battaglia_partite;

CREATE INDEX idx_battaglia_partite_a ON battaglia_partite (giocatore_a, stato);
CREATE INDEX idx_battaglia_partite_b ON battaglia_partite (giocatore_b, stato);
CREATE INDEX idx_battaglia_partite_fine ON battaglia_partite (finita_at);
-- Una classificata per giocatore al giorno.
CREATE UNIQUE INDEX idx_battaglia_classificata
    ON battaglia_partite (giocatore_a, puzzle_number)
 WHERE modalita = 'classificata';
CREATE INDEX idx_battaglia_giornata ON battaglia_partite (modalita, puzzle_number);

-- ---- Battaglia navale: gli inviti con un link ----
--
-- Chi invita crea un codice e lo manda come vuole; chi apre il link, anche
-- senza account, passa dalla registrazione ed entra in partita. Il link vale
-- una volta sola e per un giorno: un invito dimenticato in una chat non deve
-- aprire una partita una settimana dopo.
CREATE TABLE battaglia_link (
  codice     TEXT PRIMARY KEY,
  da_id      TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  stato      TEXT NOT NULL CHECK (stato IN ('attesa', 'usato', 'annullato')),
  partita_id TEXT,
  usato_da   TEXT REFERENCES players (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  usato_at   TEXT
);

CREATE INDEX idx_battaglia_link_da ON battaglia_link (da_id, stato);
