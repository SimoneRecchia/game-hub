-- Schema iniziale: giocatori e sessioni.
--
-- Applicare con:
--   npm run db:migrate:local    (sviluppo)
--   npm run db:migrate:remote   (produzione)

-- I giocatori dell'hub.
--
-- L'autenticazione e' volutamente leggera: nickname + password, nessuna email,
-- nessun secondo fattore. Serve solo a legare un punteggio a una persona.
CREATE TABLE players (
  id                  TEXT    PRIMARY KEY,
  -- Come il giocatore l'ha scritto: e' quello che si vede in classifica.
  nickname            TEXT    NOT NULL,
  -- Versione minuscola: garantisce l'unicita' senza distinzione di maiuscole,
  -- così "Simone" e "simone" non sono due giocatori diversi.
  nickname_lower      TEXT    NOT NULL UNIQUE,
  display_name        TEXT    NOT NULL,
  -- PBKDF2-SHA256 del verifier ricevuto dal client (vedi shared/password.ts).
  password_hash       TEXT    NOT NULL,
  password_salt       TEXT    NOT NULL,
  -- Salvato per giocatore: le iterazioni possono essere alzate in futuro
  -- senza invalidare le password già registrate.
  password_iterations INTEGER NOT NULL,
  avatar_color        TEXT    NOT NULL,
  created_at          TEXT    NOT NULL,
  last_seen_at        TEXT    NOT NULL
);

-- Le sessioni attive. Durano un anno: il browser "ricorda" il giocatore
-- senza che debba rifare il login a ogni visita.
CREATE TABLE sessions (
  -- Impronta SHA-256 del token, non il token stesso.
  token_hash   TEXT PRIMARY KEY,
  player_id    TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  -- Utile solo per far riconoscere al giocatore i propri dispositivi.
  user_agent   TEXT
);

CREATE INDEX idx_sessions_player ON sessions (player_id);
-- Per la pulizia periodica delle sessioni scadute.
CREATE INDEX idx_sessions_expires ON sessions (expires_at);
