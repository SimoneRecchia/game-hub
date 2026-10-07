-- Lupus in fabula online: una stanza con il suo codice, chi c'e' dentro e gli
-- inviti.
--
-- La partita sta tutta in `partita`, in JSON, con i segreti: il server la fa
-- avanzare con il motore (shared/lupus.ts) e a ognuno manda solo la sua vista.
-- Ogni scrittura e' condizionata alla `versione` letta, come i tavoli del
-- blackjack. Chi e' dentro sta in `lupus_iscritti`, una riga per giocatore:
-- la chiave e' lui, quindi si sta in una stanza alla volta, e l'ordine di
-- entrata e' l'ordine dei posti attorno al tavolo.

CREATE TABLE lupus_stanze (
  id          TEXT PRIMARY KEY,
  codice      TEXT NOT NULL UNIQUE,
  conduttore  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stato       TEXT NOT NULL CHECK (stato IN ('attesa', 'partita', 'finita')),
  impostazioni TEXT NOT NULL,
  partita     TEXT,
  versione    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_lupus_stanze_updated ON lupus_stanze (updated_at);

CREATE TABLE lupus_iscritti (
  player_id  TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  stanza_id  TEXT NOT NULL REFERENCES lupus_stanze(id) ON DELETE CASCADE,
  entrato_at TEXT NOT NULL
);
CREATE INDEX idx_lupus_iscritti_stanza ON lupus_iscritti (stanza_id, entrato_at);

-- Un invito per stanza e per invitato: invitare di nuovo chi aveva detto di no
-- lo rimette in attesa.
CREATE TABLE lupus_inviti (
  id         TEXT PRIMARY KEY,
  stanza_id  TEXT NOT NULL REFERENCES lupus_stanze(id) ON DELETE CASCADE,
  da_id      TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  a_id       TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stato      TEXT NOT NULL CHECK (stato IN ('attesa', 'accettato', 'rifiutato')),
  created_at TEXT NOT NULL,
  UNIQUE (stanza_id, a_id)
);
CREATE INDEX idx_lupus_inviti_a ON lupus_inviti (a_id, stato);
