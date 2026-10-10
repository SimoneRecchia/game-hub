-- Le notifiche push (shared/webpush.ts, server/lib/notifiche.ts).

-- Le chiavi con cui il server firma le notifiche (VAPID): le crea il primo che
-- ne ha bisogno, e poi non cambiano, perché i telefoni si sono iscritti con la
-- pubblica. Stanno qui e non fra i segreti delle Pages perché le usano anche
-- gli invii a orario della notte, che leggono D1.
CREATE TABLE segreti (
  nome       TEXT PRIMARY KEY,
  valore     TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Un telefono (o un browser) iscritto: l'indirizzo del suo servizio di notifiche
-- e le sue chiavi. Un giocatore ne ha uno per dispositivo.
CREATE TABLE push_iscrizioni (
  endpoint   TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_push_player ON push_iscrizioni (player_id);

-- Le preferenze di chi le ha cambiate, in JSON: { "inviti": false, ... }.
-- Quelle che mancano sono quelle di partenza (CATEGORIE_NOTIFICHE).
ALTER TABLE players ADD COLUMN notifiche TEXT;

-- Un invito a giocare a chi non e' online: gli arriva la notifica, e aprendo
-- l'app trova chi l'ha chiamato e a che cosa. Una per coppia: una nuova prende
-- il posto di quella di prima.
CREATE TABLE chiamate (
  id         TEXT PRIMARY KEY,
  da         TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  a          TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  gioco      TEXT NOT NULL,
  stato      TEXT NOT NULL DEFAULT 'attesa' CHECK (stato IN ('attesa', 'risposta', 'rifiutata')),
  created_at TEXT NOT NULL,
  UNIQUE (da, a)
);
CREATE INDEX idx_chiamate_a ON chiamate (a, created_at);

-- Gli invii a orario gia' fatti (l'estrazione di un giorno, il promemoria di
-- un giorno): il workflow ha due orari, uno per l'ora legale e uno per la
-- solare, e la stessa notifica non deve partire due volte.
CREATE TABLE notifiche_inviate (
  chiave     TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
