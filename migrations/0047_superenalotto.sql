-- Il SuperEnalotto a quattro numeri (shared/superenalotto.ts).
--
-- Un concorso per giorno di estrazione. La riga nasce alla chiusura, con la
-- prima richiesta dopo le 21, che pesca i numeri (`INSERT OR IGNORE`, e poi la
-- si rilegge: il primo li fissa); finita la diretta la stessa richiesta paga i
-- premi, in un batch solo, con `scrittura` per l'impronta come il tavolo del
-- blackjack. Gli importi sono in centesimi di punto, i premi in punti.
CREATE TABLE enalotto_concorsi (
  data       TEXT    PRIMARY KEY,
  -- Il numero della giornata dell'estrazione: li' vanno i premi, nel saldo della Fortuna.
  numero     INTEGER NOT NULL,
  -- I quattro numeri, nell'ordine in cui escono.
  estratti   TEXT    NOT NULL,
  -- Pagato: le schede, il jackpot arrivato, i premi per categoria e il jackpot che passa al concorso dopo.
  raccolta   INTEGER,
  riporto    INTEGER,
  premi      TEXT,
  jackpot    INTEGER,
  pagato_at  TEXT,
  scrittura  TEXT,
  created_at TEXT    NOT NULL
);

-- Una scheda: i suoi numeri e il giorno in cui e' stata comprata, che e' quello che la paga. Dopo
-- l'estrazione, quanti numeri ha preso e quanto ha vinto.
CREATE TABLE enalotto_schede (
  id         TEXT    PRIMARY KEY,
  concorso   TEXT    NOT NULL,
  player_id  TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  numeri     TEXT    NOT NULL,
  giorno     INTEGER NOT NULL,
  presi      INTEGER,
  vincita    INTEGER,
  created_at TEXT    NOT NULL
);

CREATE INDEX idx_enalotto_schede_concorso ON enalotto_schede (concorso, player_id);
CREATE INDEX idx_enalotto_schede_giorno ON enalotto_schede (player_id, giorno);
