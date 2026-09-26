-- Battaglia navale: chi e' online, gli inviti, le partite.

-- ---- La presenza ----
--
-- Chi ha l'app aperta, e dove. La scrive il giro di controllo che ogni
-- schermata fa per gli inviti (POST /api/presenza), ma non a ogni giro: solo se
-- l'ultima scrittura e' piu' vecchia di venti secondi o se l'attivita' e'
-- cambiata. Dieci colleghi con l'app aperta tutto il giorno restano qualche
-- migliaio di scritture, sulle centomila che D1 concede.
CREATE TABLE presenza (
  player_id TEXT PRIMARY KEY REFERENCES players (id) ON DELETE CASCADE,
  visto_at  TEXT NOT NULL,
  -- 'hub', 'wordle', 'scarabeo', 'cruciverba', 'battaglia', 'classifica', 'profilo', 'altro'
  attivita  TEXT NOT NULL
) WITHOUT ROWID;

CREATE INDEX idx_presenza_visto ON presenza (visto_at);

-- ---- Gli inviti ----
--
-- Un invito aspetta due minuti: chi sfida sta guardando lo schermo, e un invito
-- che arriva mezz'ora dopo non trova piu' nessuno dall'altra parte. La scadenza
-- non si scrive: un invito in 'attesa' piu' vecchio di cosi' e' scaduto.
CREATE TABLE battaglia_inviti (
  id          TEXT PRIMARY KEY,
  da_id       TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  a_id        TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  stato       TEXT NOT NULL CHECK (stato IN ('attesa', 'accettato', 'rifiutato', 'annullato')),
  partita_id  TEXT,
  created_at  TEXT NOT NULL,
  risposto_at TEXT
);

CREATE INDEX idx_battaglia_inviti_a ON battaglia_inviti (a_id, stato);
CREATE INDEX idx_battaglia_inviti_da ON battaglia_inviti (da_id, stato);

-- ---- Le partite ----
--
-- La verita' sono le flotte e i colpi: chi ha sparato si ricava dal turno
-- (i colpi pari sono di chi ha cominciato), l'esito di ogni colpo dalla flotta
-- che ha preso. Salvare anche gli esiti vorrebbe dire solo poterli avere
-- incoerenti con le navi — la stessa regola dello Scarabeo e del Wordle.
CREATE TABLE battaglia_partite (
  id          TEXT PRIMARY KEY,
  -- 'a' e' chi ha sfidato, 'b' chi ha accettato.
  giocatore_a TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  giocatore_b TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  stato       TEXT NOT NULL CHECK (stato IN ('disposizione', 'battaglia', 'finita')),
  -- Le navi in JSON, NULL finché il giocatore non ha confermato la flotta.
  flotta_a    TEXT,
  flotta_b    TEXT,
  -- Chi spara per primo: sorteggiato quando entrambe le flotte sono in mare.
  primo       TEXT CHECK (primo IN ('a', 'b')),
  -- Le caselle colpite, nell'ordine in cui sono state sparate.
  colpi       TEXT NOT NULL DEFAULT '[]',
  vincitore   TEXT CHECK (vincitore IN ('a', 'b')),
  -- 'flotta': affondata tutta; 'resa': l'altro ha abbandonato; 'assenza':
  -- l'altro non ha piu' mosso e la vittoria e' stata chiesta a tavolino.
  motivo      TEXT CHECK (motivo IN ('flotta', 'resa', 'assenza')),
  -- Il lucchetto della concorrenza ottimistica, come nelle altre partite.
  versione    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  -- L'ultima mossa di chiunque: da qui si conta l'attesa per la vittoria a tavolino.
  updated_at  TEXT NOT NULL,
  finita_at   TEXT
);

CREATE INDEX idx_battaglia_partite_a ON battaglia_partite (giocatore_a, stato);
CREATE INDEX idx_battaglia_partite_b ON battaglia_partite (giocatore_b, stato);
CREATE INDEX idx_battaglia_partite_fine ON battaglia_partite (finita_at);
