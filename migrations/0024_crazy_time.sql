-- Crazy Time: si gira quante volte si vuole, non piu' una volta al giorno.
--
-- Solo aggiunte: `ruota_giri` resta com'e' e non la legge piu' nessuno, come la
-- tabella `dizionario`; i suoi giri di oggi passano qui, e i loro punti restano.

-- ---- I giri ----
--
-- Uno per riga, numerati nella giornata di ogni giocatore (`n`, da 1): la
-- chiave e' quella, e due giri partiti nello stesso istante non prendono lo
-- stesso numero. Lo spicchio lo sceglie il server, a caso.
--
-- `delta` e' quel che il giro da' o toglie. Durante una sfida vale gia' quel che
-- toglie se va male: lasciata a meta' conta persa, e il giro dopo la chiude.
CREATE TABLE ruota_giocate (
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  n             INTEGER NOT NULL,
  puntata       INTEGER NOT NULL,
  -- L'indice nella ruota (shared/ruota.ts), dallo spicchio in cima. NULL per i
  -- giri della ruota di prima, che aveva un'altra disposizione.
  spicchio      INTEGER,
  -- 'sfida': la moneta o la domanda non ancora giocate; 'domanda': la domanda
  -- e' aperta e il tempo corre; 'fatto': l'esito e' quello di `delta`.
  stato         TEXT    NOT NULL CHECK (stato IN ('sfida', 'domanda', 'fatto')),
  delta         INTEGER NOT NULL,
  -- La sfida, in JSON: il lato scelto e quello uscito, o la domanda intera con
  -- la risposta — che non esce dal server finché non si risponde.
  sfida         TEXT,
  -- L'impronta della domanda (improntaDomanda), con la materia: chi l'ha avuta
  -- non la rivede lo stesso giorno.
  domanda       TEXT,
  aperta_at     TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  PRIMARY KEY (player_id, puzzle_number, n)
);

-- ---- Le giornate ----
--
-- Il conto di ogni giocatore in ogni giornata: quel che Crazy Time ha dato o
-- tolto, e quanti giri. Si riscrive insieme a ogni giro, nello stesso batch, dalla
-- somma dei giri di quel giorno, ed e' quel che legge la classifica generale:
-- una riga per giocatore e per giorno invece di tutti i giri di tutti.
CREATE TABLE ruota_giornate (
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  netto         INTEGER NOT NULL,
  giri          INTEGER NOT NULL,
  PRIMARY KEY (player_id, puzzle_number)
);

CREATE INDEX idx_ruota_giornate_puzzle ON ruota_giornate (puzzle_number);

-- I giri della ruota di prima, uno per giocatore per giorno: con i loro punti, e
-- chiusi, perché le sfide di quella ruota non si giocano piu'.
INSERT INTO ruota_giocate
  (player_id, puzzle_number, n, puntata, spicchio, stato, delta, sfida, domanda, aperta_at, created_at, updated_at)
SELECT player_id, puzzle_number, 1, puntata, NULL, 'fatto', delta, NULL, NULL, NULL, created_at, updated_at
  FROM ruota_giri;

INSERT INTO ruota_giornate (player_id, puzzle_number, netto, giri)
SELECT player_id, puzzle_number, delta, 1 FROM ruota_giri;

-- Le domande: da cinque a trenta per materia e per giorno. Quelle di un formato
-- vecchio si rifanno (shared/ruota.ts, FORMATO_DOMANDE_RUOTA).
ALTER TABLE ruota_domande ADD COLUMN formato INTEGER NOT NULL DEFAULT 1;
