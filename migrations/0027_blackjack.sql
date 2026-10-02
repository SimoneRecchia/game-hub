-- Il blackjack: i tavoli, chi ci e' seduto, e le mani giocate.
--
-- Solo aggiunte. Il conto della giornata va in `fortuna_giornate`, che ha gia'
-- il blackjack nel CHECK (0026), come quello della slot.

-- ---- I tavoli ----
--
-- Lo stato del tavolo intero sta in `stato`, in JSON (shared/blackjack-tavolo.ts,
-- `TavoloBJ`): i posti, le mani, le carte del banco, la fase e la sua scadenza.
-- E' piccolo — cinque posti — e si riscrive tutto a ogni cambio, condizionato a
-- `versione`. `scrittura` e' l'impronta dell'ultima scrittura: le righe delle
-- mani e dei posti, nello stesso batch, si scrivono solo se il tavolo l'ha
-- presa, perché D1 non ha transazioni da aprire e chiudere.
CREATE TABLE bj_tavoli (
  id          TEXT    PRIMARY KEY,
  stato       TEXT    NOT NULL,
  versione    INTEGER NOT NULL,
  scrittura   TEXT    NOT NULL,
  -- Chi l'ha aperto: il tavolo e' di tutti quelli che ci si siedono, e resta
  -- anche se chi l'ha aperto se ne va.
  created_by  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE INDEX idx_bj_tavoli_updated ON bj_tavoli (updated_at);

-- ---- Chi e' seduto dove ----
--
-- Un tavolo alla volta per giocatore: la chiave e' il giocatore, quindi due
-- posti allo stesso tempo non entrano. Chi si alza a giro in corso lascia
-- subito questa riga, e il suo posto nel tavolo resta fino alla fine del giro.
CREATE TABLE bj_seduti (
  player_id   TEXT    PRIMARY KEY REFERENCES players (id) ON DELETE CASCADE,
  tavolo      TEXT    NOT NULL,
  created_at  TEXT    NOT NULL
);

CREATE INDEX idx_bj_seduti_tavolo ON bj_seduti (tavolo);

-- ---- Le mani ----
--
-- Una riga per giocatore e per giro, nella giornata della puntata. `puntata` e'
-- tutto quel che il giocatore ha messo sul tavolo in quel giro, raddoppi e
-- divisioni compresi; `delta` quel che il giro gli da' o toglie. Come a Crazy
-- Time la puntata si paga quando la si mette: finché il giro e' in corso
-- `delta` vale meno la puntata, e alla fine diventa l'esito. Una mano lasciata
-- a meta' su un tavolo che nessuno guarda piu' conta persa.
CREATE TABLE bj_mani (
  tavolo        TEXT    NOT NULL,
  giro          INTEGER NOT NULL,
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  puntata       INTEGER NOT NULL,
  delta         INTEGER NOT NULL,
  stato         TEXT    NOT NULL CHECK (stato IN ('gioco', 'fatto')),
  -- A giro finito: le mani e le carte del banco, in JSON.
  esito         TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  PRIMARY KEY (tavolo, giro, player_id)
);

CREATE INDEX idx_bj_mani_giocatore ON bj_mani (player_id, puzzle_number);
