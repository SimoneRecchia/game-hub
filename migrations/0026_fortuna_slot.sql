-- La Fortuna: la slot, e il conto della giornata dei giochi che si sono
-- aggiunti a Crazy Time.
--
-- Solo aggiunte. Crazy Time resta con le sue tabelle (`ruota_giocate`,
-- `ruota_giornate`): la slot e il blackjack scrivono il loro conto qui, una
-- riga per giocatore, giorno e gioco. Il saldo di un giorno sono i punti delle
-- classificate, piu' la riga di Crazy Time, piu' queste (server/lib/fortuna.ts).

-- ---- Le giornate ----
--
-- Si riscrive insieme a ogni giocata, nello stesso batch, dalla somma delle
-- giocate di quel giorno, come `ruota_giornate`: e' quel che legge la
-- classifica generale, e quel che il saldo somma prima di accettare una
-- puntata. Il blackjack e' gia' nel CHECK: cambiarlo dopo vorrebbe dire rifare
-- la tabella.
CREATE TABLE fortuna_giornate (
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  gioco         TEXT    NOT NULL CHECK (gioco IN ('slot', 'blackjack')),
  netto         INTEGER NOT NULL,
  giocate       INTEGER NOT NULL,
  PRIMARY KEY (player_id, puzzle_number, gioco)
);

CREATE INDEX idx_fortuna_giornate_puzzle ON fortuna_giornate (puzzle_number);

-- ---- I giri della slot ----
--
-- Uno per riga, numerati nella giornata di ogni giocatore (`n`, da 1), come i
-- giri di Crazy Time: due giri partiti nello stesso istante non prendono lo
-- stesso numero. Le fermate le sceglie il server, a caso.
--
-- `delta` e' quel che il giro da' o toglie: la vincita della linea meno la
-- puntata. Con una domanda aperta vale gia' quel che resta se va male: lasciata
-- a meta' conta persa, e il giro dopo la chiude.
CREATE TABLE slot_giri (
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  n             INTEGER NOT NULL,
  puntata       INTEGER NOT NULL,
  -- Le fermate dei tre rulli, in JSON: l'indice del simbolo sulla linea
  -- (shared/slot.ts, RULLI).
  fermate       TEXT    NOT NULL,
  -- I rulli del giro (DISPOSIZIONE_SLOT): con altri rulli le stesse fermate
  -- sono altri simboli.
  disposizione  INTEGER NOT NULL,
  -- Quante volte la puntata paga la linea: zero se niente.
  premio        INTEGER NOT NULL,
  -- La categoria della tripla, se c'e': apre la domanda.
  categoria     TEXT,
  -- 'sfida': la domanda c'e' e non e' ancora aperta; 'domanda': e' aperta e il
  -- tempo corre; 'fatto': l'esito e' quello di `delta`.
  stato         TEXT    NOT NULL CHECK (stato IN ('sfida', 'domanda', 'fatto')),
  delta         INTEGER NOT NULL,
  -- La domanda intera, con la risposta, la scelta e l'esito: non esce dal
  -- server finché non si risponde.
  sfida         TEXT,
  -- L'impronta della domanda con la categoria, come in `ruota_giocate`: chi
  -- l'ha avuta, alla slot o alla ruota, non la rivede lo stesso giorno.
  domanda       TEXT,
  aperta_at     TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  PRIMARY KEY (player_id, puzzle_number, n)
);
