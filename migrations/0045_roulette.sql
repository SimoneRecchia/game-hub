-- La roulette: i tavoli, chi ci e' seduto, e i giri giocati.
--
-- ---- Le giornate della Fortuna ----
--
-- `fortuna_giornate` aveva nel CHECK solo la slot e il blackjack, e in SQLite
-- un CHECK non si allarga: la tabella si rifà senza, e il gioco lo scrivono le
-- rotte di ogni gioco (`GiocoFortuna`), come per `tavolo_partite` nella 0028.
-- Un gioco nuovo della Fortuna non dovra' rifarla un'altra volta. Nessuna
-- chiave esterna punta qui, e le righe restano tutte com'erano.
CREATE TABLE fortuna_giornate_nuova (
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  gioco         TEXT    NOT NULL,
  netto         INTEGER NOT NULL,
  giocate       INTEGER NOT NULL,
  PRIMARY KEY (player_id, puzzle_number, gioco)
);

INSERT INTO fortuna_giornate_nuova (player_id, puzzle_number, gioco, netto, giocate)
  SELECT player_id, puzzle_number, gioco, netto, giocate FROM fortuna_giornate;

DROP TABLE fortuna_giornate;
ALTER TABLE fortuna_giornate_nuova RENAME TO fortuna_giornate;

CREATE INDEX idx_fortuna_giornate_puzzle ON fortuna_giornate (puzzle_number);

-- ---- I tavoli ----
--
-- Come quelli del blackjack (0027): lo stato intero in `stato`, in JSON
-- (shared/roulette-tavolo.ts, `TavoloRL`), riscritto a ogni cambio e
-- condizionato a `versione`; `scrittura` e' l'impronta dell'ultima scrittura, e
-- le righe dello stesso batch si scrivono solo se il tavolo l'ha presa.
CREATE TABLE rl_tavoli (
  id          TEXT    PRIMARY KEY,
  stato       TEXT    NOT NULL,
  versione    INTEGER NOT NULL,
  scrittura   TEXT    NOT NULL,
  created_by  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE INDEX idx_rl_tavoli_updated ON rl_tavoli (updated_at);

-- ---- Chi e' seduto dove ----
--
-- Un tavolo della roulette alla volta per giocatore: la chiave e' lui.
CREATE TABLE rl_seduti (
  player_id   TEXT    PRIMARY KEY REFERENCES players (id) ON DELETE CASCADE,
  tavolo      TEXT    NOT NULL,
  created_at  TEXT    NOT NULL
);

CREATE INDEX idx_rl_seduti_tavolo ON rl_seduti (tavolo);

-- ---- I giri ----
--
-- Una riga per giocatore e per giro, nella giornata della prima puntata.
-- `puntata` e' tutto quel che c'e' sul panno, `puntate` come sta (la chiave
-- di ogni puntata e i suoi punti, shared/roulette.ts), e `delta` quel che il
-- giro da' o toglie. La puntata si paga quando la si mette: finché la biglia
-- non parte `delta` vale meno la puntata, e al lancio diventa l'esito, con il
-- numero uscito.
CREATE TABLE rl_giocate (
  tavolo        TEXT    NOT NULL,
  giro          INTEGER NOT NULL,
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  puntata       INTEGER NOT NULL,
  delta         INTEGER NOT NULL,
  puntate       TEXT    NOT NULL,
  numero        INTEGER,
  stato         TEXT    NOT NULL CHECK (stato IN ('gioco', 'fatto')),
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  PRIMARY KEY (tavolo, giro, player_id)
);

CREATE INDEX idx_rl_giocate_giocatore ON rl_giocate (player_id, puzzle_number);
