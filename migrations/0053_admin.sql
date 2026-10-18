-- Il pannello di amministrazione (/admin).
--
-- Il proprietario non sta nel database: e' chi ha un'email confermata fra
-- quelle di ADMIN_EMAILS (wrangler.toml). Qui stanno gli amministratori che il
-- proprietario nomina dal pannello, gli account sospesi, lo sblocco del pannello
-- con il codice, il registro di quel che si fa dal pannello, gli errori del
-- server e gli annunci a tutti.

-- 'admin' per chi il proprietario ha nominato amministratore; NULL per tutti gli altri.
ALTER TABLE players ADD COLUMN ruolo TEXT;
-- Un account sospeso non entra, e le sue sessioni non valgono piu'.
ALTER TABLE players ADD COLUMN sospeso_at TEXT;

-- Fin quando il pannello e' sbloccato su questa sessione: la sessione dura un
-- anno, il pannello vuole un codice ogni dodici ore.
ALTER TABLE sessions ADD COLUMN admin_fino TEXT;

-- Il codice che sblocca il pannello, uno per amministratore. Nel database
-- l'impronta, come per i codici per entrare; `inviati` conta quelli partiti nel
-- `giorno`, perché sei cifre non si indovinino codice dopo codice.
CREATE TABLE admin_codici (
  player_id  TEXT    PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  code_hash  TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  expires_at TEXT    NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  giorno     TEXT    NOT NULL,
  inviati    INTEGER NOT NULL DEFAULT 1
);

-- I giorni in cui ognuno ha aperto l'app: li scrive il giro della presenza, con
-- un INSERT OR IGNORE che dalla seconda volta del giorno non scrive niente. La
-- presenza tiene solo l'ultima volta, e i giocatori attivi di ieri non si
-- ricaverebbero da nessuna parte. `data` e' la giornata del gioco.
CREATE TABLE attivita_giorni (
  data      TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (data, player_id)
) WITHOUT ROWID;

CREATE INDEX idx_attivita_giocatore ON attivita_giorni (player_id, data);

-- I giorni di prima, dalle partite delle classificate: chi ha giocato quel giorno
-- aveva l'app aperta. Chi l'ha solo aperta non c'e', e da qui in avanti si'.
INSERT OR IGNORE INTO attivita_giorni (data, player_id) SELECT date, player_id FROM wordle_games;
INSERT OR IGNORE INTO attivita_giorni (data, player_id) SELECT date, player_id FROM scarabeo_games;
INSERT OR IGNORE INTO attivita_giorni (data, player_id) SELECT date, player_id FROM cruciverba_games;
INSERT OR IGNORE INTO attivita_giorni (data, player_id) SELECT date, player_id FROM sudoku_games;
INSERT OR IGNORE INTO attivita_giorni (data, player_id) SELECT date, player_id FROM quiz_partite;
INSERT OR IGNORE INTO attivita_giorni (data, player_id) SELECT date, player_id FROM nomi_partite;
INSERT OR IGNORE INTO attivita_giorni (data, player_id) SELECT date, player_id FROM anagrammi_partite;
INSERT OR IGNORE INTO attivita_giorni (data, player_id) SELECT date, player_id FROM ghigliottina_partite;
INSERT OR IGNORE INTO attivita_giorni (data, player_id) SELECT date, player_id FROM paroliere_partite;
INSERT OR IGNORE INTO attivita_giorni (data, player_id) SELECT date, player_id FROM catena_partite;
INSERT OR IGNORE INTO attivita_giorni (data, player_id) SELECT date, player_id FROM sequenze_partite;
INSERT OR IGNORE INTO attivita_giorni (data, player_id) SELECT date, player_id FROM tris_partite;

-- Quel che si e' fatto dal pannello: chi, che cosa, su che cosa. Un account
-- eliminato lascia le sue voci, senza il nome.
CREATE TABLE admin_registro (
  id        TEXT PRIMARY KEY,
  at        TEXT NOT NULL,
  admin_id  TEXT REFERENCES players(id) ON DELETE SET NULL,
  azione    TEXT NOT NULL,
  oggetto   TEXT,
  dettagli  TEXT
);

CREATE INDEX idx_admin_registro_at ON admin_registro (at);

-- Gli errori non gestiti del server: prima restavano solo nei log di
-- Cloudflare, che il piano gratuito non tiene. Quelli di piu' di trenta giorni
-- se ne vanno con il primo errore dopo. Senza riferimento al giocatore: un
-- errore resta anche se l'account se ne va.
CREATE TABLE errori_server (
  id        TEXT PRIMARY KEY,
  at        TEXT NOT NULL,
  metodo    TEXT NOT NULL,
  percorso  TEXT NOT NULL,
  messaggio TEXT NOT NULL,
  stack     TEXT,
  player_id TEXT
);

CREATE INDEX idx_errori_server_at ON errori_server (at);

-- Gli annunci a tutti, in cima alle Giornaliere: se ne vede uno, il piu' recente
-- fra quelli accesi e non scaduti.
CREATE TABLE annunci (
  id         TEXT    PRIMARY KEY,
  testo      TEXT    NOT NULL,
  tono       TEXT    NOT NULL,
  attivo     INTEGER NOT NULL DEFAULT 1,
  fino       TEXT,
  created_at TEXT    NOT NULL,
  created_by TEXT    REFERENCES players(id) ON DELETE SET NULL
);
