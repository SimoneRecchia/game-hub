-- Indovina chi: le partite fra amici, che sono anche il loro invito.
--
-- Una riga nasce come invito — a un amico online (`invitato`) o con un link
-- (`codice`) — e diventa la partita quando l'altro accetta: un `UPDATE`
-- condizionato allo stato 'invito', cosi' due accettazioni ravvicinate non
-- aprono due partite. Non c'e' una tabella delle sfide a parte come nella
-- battaglia: qui l'invito porta gia' tutto quel che serve alla partita, cioe' i
-- personaggi scelti da chi invita.
--
-- Niente resta a lungo: a ogni invito nuovo si cancellano le partite ferme da
-- due giorni. Indovina chi non ha classifica.
CREATE TABLE indovina_partite (
  id            TEXT    PRIMARY KEY,
  -- Chi invita, e chi accetta: NULL finché nessuno ha accettato.
  giocatore_a   TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  giocatore_b   TEXT    REFERENCES players (id) ON DELETE CASCADE,
  -- L'invito a un amico online, o il codice del link: uno dei due.
  invitato      TEXT    REFERENCES players (id) ON DELETE CASCADE,
  codice        TEXT    UNIQUE,
  stato         TEXT    NOT NULL CHECK (stato IN ('invito', 'in_corso', 'finita', 'rifiutata', 'annullata')),
  -- I personaggi, in JSON: il set, il nome, e per ognuno il nome e — nei set
  -- propri — l'impronta della foto. Le foto non passano da qui.
  personaggi    TEXT    NOT NULL,
  -- Il personaggio segreto di ciascuno, pescato a caso quando si accetta.
  segreto_a     INTEGER,
  segreto_b     INTEGER,
  -- Le facce abbassate da ciascuno, in JSON: le scrive solo il suo padrone.
  abbassate_a   TEXT    NOT NULL DEFAULT '[]',
  abbassate_b   TEXT    NOT NULL DEFAULT '[]',
  -- Chi fa la prossima domanda, o prova a indovinare.
  turno         TEXT    CHECK (turno IN ('a', 'b')),
  -- Domande, risposte e tentativi, in ordine (shared/indovina.ts).
  mosse         TEXT    NOT NULL DEFAULT '[]',
  vincitore     TEXT    CHECK (vincitore IN ('a', 'b')),
  motivo        TEXT    CHECK (motivo IN ('indovinato', 'sbagliato', 'resa', 'assenza')),
  -- I messaggi per aprire il canale fra i due telefoni, se servono le foto.
  segnale       TEXT    NOT NULL DEFAULT '{}',
  -- La rivincita: la partita di prima, e le vittorie di ciascuno fin qui.
  rivincita_di  TEXT,
  serie_a       INTEGER NOT NULL DEFAULT 0,
  serie_b       INTEGER NOT NULL DEFAULT 0,
  partite_serie INTEGER NOT NULL DEFAULT 0,
  -- Il lucchetto della concorrenza ottimistica, come nella battaglia.
  versione      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  -- Quando l'altro ha accettato: da li' si conta l'attesa della prima domanda.
  iniziata_at   TEXT,
  updated_at    TEXT    NOT NULL,
  finita_at     TEXT
);

CREATE INDEX idx_indovina_a ON indovina_partite (giocatore_a, stato);
CREATE INDEX idx_indovina_b ON indovina_partite (giocatore_b, stato);
CREATE INDEX idx_indovina_invitato ON indovina_partite (invitato, stato);
CREATE INDEX idx_indovina_rivincita ON indovina_partite (rivincita_di);
CREATE INDEX idx_indovina_aggiornata ON indovina_partite (updated_at);
