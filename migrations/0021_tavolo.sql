-- I giochi a turni su un tavoliere: scacchi, dama, Forza 4 e go, fra amici.
--
-- Come in Indovina chi, l'invito e' gia' la partita: una riga nasce invito — a
-- un amico online (`invitato`) o con un link (`codice`) — e diventa la partita
-- quando l'altro accetta, con un `UPDATE` condizionato allo stato 'invito'.
-- Contro il computer non passa niente di qui: quelle partite stanno nel
-- telefono.
--
-- La verita' sono le mosse, ma la posizione si tiene accanto: il server
-- controlla una mossa sulla posizione in cui arriva, senza rigiocare la partita
-- a ogni richiesta, che negli scacchi costerebbe piu' dei dieci millisecondi.
-- `chiavi` sono le posizioni passate da quando non si puo' piu' tornare
-- indietro (l'ultima presa, l'ultima mossa di un pedone o di una pedina): e'
-- quel che serve per la patta per ripetizione.
--
-- Niente resta a lungo: a ogni invito nuovo si cancellano le partite ferme da
-- una settimana. Questi giochi non hanno classifica.
CREATE TABLE tavolo_partite (
  id            TEXT    PRIMARY KEY,
  -- Il go c'e' gia', anche se arriva dopo: un CHECK in SQLite non si cambia senza rifare la tabella.
  gioco         TEXT    NOT NULL CHECK (gioco IN ('scacchi', 'dama', 'forza4', 'go')),
  -- Chi invita, e chi accetta: NULL finché nessuno ha accettato.
  giocatore_a   TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  giocatore_b   TEXT    REFERENCES players (id) ON DELETE CASCADE,
  -- L'invito a un amico online, o il codice del link: uno dei due.
  invitato      TEXT    REFERENCES players (id) ON DELETE CASCADE,
  codice        TEXT    UNIQUE,
  stato         TEXT    NOT NULL CHECK (stato IN ('invito', 'in_corso', 'finita', 'rifiutata', 'annullata')),
  -- Chi muove per primo (il Bianco, il rosso): pescato quando si accetta, e
  -- nella rivincita tocca all'altro. Gia' scritto nell'invito di una rivincita.
  primo         TEXT    CHECK (primo IN ('a', 'b')),
  posizione     TEXT    NOT NULL,
  mosse         TEXT    NOT NULL DEFAULT '[]',
  chiavi        TEXT    NOT NULL DEFAULT '[]',
  vincitore     TEXT    CHECK (vincitore IN ('a', 'b')),
  -- Perché e' finita: il matto, lo stallo, il quattro in fila, la resa, la
  -- patta d'accordo... Senza CHECK: ogni gioco ha i suoi, e un motivo nuovo non
  -- deve voler rifare la tabella.
  motivo        TEXT,
  -- La patta proposta da uno dei due, e a che mossa: se ne propone una sola per
  -- mossa, e una mossa dell'altro la lascia cadere.
  patta         TEXT    CHECK (patta IN ('a', 'b')),
  patta_n       INTEGER NOT NULL DEFAULT -1,
  -- La rivincita: la partita di prima, e le vittorie di ciascuno fin qui.
  rivincita_di  TEXT,
  serie_a       INTEGER NOT NULL DEFAULT 0,
  serie_b       INTEGER NOT NULL DEFAULT 0,
  partite_serie INTEGER NOT NULL DEFAULT 0,
  -- Il lucchetto della concorrenza ottimistica, come nella battaglia.
  versione      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  iniziata_at   TEXT,
  -- L'ultima mossa: da li' si conta l'attesa per la vittoria a tavolino.
  mossa_at      TEXT,
  updated_at    TEXT    NOT NULL,
  finita_at     TEXT
);

CREATE INDEX idx_tavolo_a ON tavolo_partite (giocatore_a, stato);
CREATE INDEX idx_tavolo_b ON tavolo_partite (giocatore_b, stato);
CREATE INDEX idx_tavolo_invitato ON tavolo_partite (invitato, stato);
CREATE INDEX idx_tavolo_rivincita ON tavolo_partite (rivincita_di);
CREATE INDEX idx_tavolo_aggiornata ON tavolo_partite (updated_at);
