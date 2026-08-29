-- Email, verifica con codice e recupero password.
--
-- L'email serve a due cose: verificare che il giocatore esista davvero e dare
-- una via di recupero quando dimentica la password. Prima non c'era nessuna
-- via di recupero: si perdeva l'account.

ALTER TABLE players ADD COLUMN email TEXT;
-- Versione minuscola per l'unicita' senza distinzione di maiuscole, come per
-- il nickname.
ALTER TABLE players ADD COLUMN email_lower TEXT;
-- Valorizzato quando il codice e' stato inserito correttamente.
ALTER TABLE players ADD COLUMN email_verified_at TEXT;

-- Indice parziale: i giocatori registrati prima di questa migrazione non hanno
-- email, e piu' NULL non violano un vincolo di unicita' — ma essere espliciti
-- rende evidente l'intenzione.
CREATE UNIQUE INDEX idx_players_email ON players (email_lower)
  WHERE email_lower IS NOT NULL;

-- I codici a sei cifre inviati per posta.
--
-- Nel database va l'impronta, non il codice: chi leggesse la tabella non deve
-- poter prendere possesso di un account in attesa di verifica.
CREATE TABLE verification_codes (
  id          TEXT    PRIMARY KEY,
  player_id   TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  purpose     TEXT    NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  code_hash   TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  expires_at  TEXT    NOT NULL,
  -- Tentativi sbagliati: oltre un tetto il codice si brucia, altrimenti sei
  -- cifre si indovinano per tentativi.
  attempts    INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT
);

-- Per trovare il codice valido piu' recente di un giocatore.
CREATE INDEX idx_codes_player ON verification_codes (player_id, purpose, created_at);
-- Per la pulizia dei codici scaduti.
CREATE INDEX idx_codes_expires ON verification_codes (expires_at);
