-- Partite in compagnia: l'host gioca, gli invitati guardano e suggeriscono.
--
-- Non c'e' realtime: client e server si parlano a polling su queste tabelle.
-- Le Durable Objects non sono garantite sul piano gratuito e i 10 ms di CPU
-- per richiesta rendono le connessioni lunghe una cattiva idea; per
-- "qualcuno ti suggerisce una parola" due secondi di latenza non si notano.

-- Una stanza per host per giornata: la stessa partita che l'host sta giocando.
CREATE TABLE coop_rooms (
  id            TEXT    PRIMARY KEY,
  host_id       TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  created_at    TEXT    NOT NULL,
  closed_at     TEXT,
  UNIQUE (host_id, puzzle_number)
);

-- Gli invitati. Il tetto di cinque per stanza lo applica l'API contando qui.
CREATE TABLE coop_invites (
  id           TEXT PRIMARY KEY,
  room_id      TEXT NOT NULL REFERENCES coop_rooms (id) ON DELETE CASCADE,
  guest_id     TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at   TEXT NOT NULL,
  responded_at TEXT,
  -- Un giocatore non puo' essere invitato due volte nella stessa stanza.
  UNIQUE (room_id, guest_id)
);

-- I suggerimenti. Si tengono tutti, non solo l'ultimo: l'host vede la
-- cronologia di chi gli ha proposto cosa, e capisce chi lo ha aiutato.
CREATE TABLE coop_suggestions (
  id         TEXT NOT NULL PRIMARY KEY,
  room_id    TEXT NOT NULL REFERENCES coop_rooms (id) ON DELETE CASCADE,
  guest_id   TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  word       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  -- Valorizzato quando l'host gioca davvero quella parola.
  used_at    TEXT
);

CREATE INDEX idx_coop_rooms_puzzle ON coop_rooms (puzzle_number);
-- Per la casella degli inviti del guest, interrogata a polling.
CREATE INDEX idx_coop_invites_guest ON coop_invites (guest_id, status);
CREATE INDEX idx_coop_invites_room ON coop_invites (room_id);
-- Per la vista dell'host, interrogata a polling: i suggerimenti piu' recenti.
CREATE INDEX idx_coop_suggestions_room ON coop_suggestions (room_id, created_at);

-- La partita e' stata "vista" prima di essere giocata?
--
-- La parola del giorno e' la stessa per tutti: chi guarda la partita di un
-- altro prima di aver giocato la propria conosce la soluzione. Non lo
-- impediamo — sarebbe frustrante — ma quella giornata non fa punti, altrimenti
-- la classifica non misurerebbe piu' nulla. Il giocatore lo sa prima di
-- accettare l'invito.
ALTER TABLE wordle_games ADD COLUMN spectated INTEGER NOT NULL DEFAULT 0;
