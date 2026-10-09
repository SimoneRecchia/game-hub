-- Il nickname si cambia dal profilo, una volta a settimana, con un codice
-- mandato all'email dell'account.
--
-- La colonna tiene l'ultimo cambio: la rotta la controlla nello stesso UPDATE
-- che scrive il nickname nuovo, cosi' due richieste insieme non lo cambiano due
-- volte nella stessa settimana. NULL e' chi non l'ha mai cambiato.
ALTER TABLE players ADD COLUMN nickname_changed_at TEXT;

-- ---- I codici ----
--
-- Il codice del cambio ha uno scopo suo, `nickname`: con quello per entrare
-- (`reset_password`, vedi codes.ts) un codice chiesto per cambiare il nickname
-- aprirebbe anche l'account, e i due si consumerebbero a vicenda. Il CHECK
-- della 0004 conosce due scopi, e in SQLite un CHECK non si allarga: la tabella
-- si rifà con tre, con le righe di prima. Nessuna chiave esterna punta qui.
CREATE TABLE verification_codes_nuova (
  id          TEXT    PRIMARY KEY,
  player_id   TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  purpose     TEXT    NOT NULL CHECK (purpose IN ('verify_email', 'reset_password', 'nickname')),
  code_hash   TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  expires_at  TEXT    NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT
);

INSERT INTO verification_codes_nuova (id, player_id, purpose, code_hash, created_at, expires_at, attempts, consumed_at)
  SELECT id, player_id, purpose, code_hash, created_at, expires_at, attempts, consumed_at FROM verification_codes;

DROP TABLE verification_codes;
ALTER TABLE verification_codes_nuova RENAME TO verification_codes;

CREATE INDEX idx_codes_player ON verification_codes (player_id, purpose, created_at);
CREATE INDEX idx_codes_expires ON verification_codes (expires_at);
