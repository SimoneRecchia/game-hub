-- Scarabeo: il dizionario e le partite.

-- ---- Il dizionario ----
--
-- 271.055 parole italiane da 2 a 15 lettere. Non stanno nel codice del Worker
-- per due ragioni indipendenti: 2,8 MB non entrano nel limite di 1 MiB
-- compresso del piano gratuito, e costruire un insieme da centomila voci a ogni
-- avvio a freddo costerebbe da solo piu' dei 10 ms di CPU concessi a una
-- richiesta.
--
-- Non una riga per parola, però: il piano gratuito di D1 concede 100.000
-- scritture al giorno, e 271.055 INSERT non ci stanno. Le parole sono quindi
-- raggruppate in "secchi" per lunghezza e prime due lettere — `9:ri` — con le
-- parole di ogni secchio in un blocco solo, separate da un a capo. Vengono
-- 2.309 righe da scrivere una volta, e una verifica legge al massimo un
-- secchio per parola formata (otto, nella mossa piu' lunga possibile): poco
-- piu' di qualche kB, e il confronto e' una ricerca di sottostringa.
--
-- Il blocco ha un a capo anche in testa e in coda, così cercare "\nparola\n"
-- e' una corrispondenza esatta e "casa" non risulta trovata dentro "casale".
CREATE TABLE dizionario (
  chiave TEXT PRIMARY KEY,
  parole TEXT NOT NULL,
  quante INTEGER NOT NULL
) WITHOUT ROWID;

-- ---- Le partite ----
--
-- Una riga per giocatore per giornata, come nel Wordle.
--
-- La verita' sono le **mosse**: tabellone, leggio e punteggio si ricalcolano
-- rigiocandole sul sacchetto della giornata, che e' deterministico dal numero
-- del puzzle. Salvare anche il tabellone vorrebbe dire solo poterlo avere
-- incoerente con le mosse — la stessa ragione per cui le partite di Wordle
-- salvano le parole giocate e non i colori.
--
-- `score` e' l'eccezione, e sta qui perché la classifica lo somma in SQL senza
-- dover rigiocare le partite di tutti.
CREATE TABLE scarabeo_games (
  id            TEXT    PRIMARY KEY,
  player_id     TEXT    NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  puzzle_number INTEGER NOT NULL,
  date          TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('playing', 'done')),
  -- Le mosse in JSON: pose, passi e cambi, nell'ordine in cui sono state fatte.
  mosse         TEXT    NOT NULL DEFAULT '[]',
  -- Quante mosse sono state usate. E' anche il lucchetto della concorrenza
  -- ottimistica: D1 non ha transazioni interattive, quindi la scrittura di una
  -- mossa e' condizionata al numero che si era letto.
  turns         INTEGER NOT NULL DEFAULT 0,
  score         INTEGER NOT NULL DEFAULT 0,
  started_at    TEXT    NOT NULL,
  finished_at   TEXT,
  UNIQUE (player_id, puzzle_number)
);

-- Per la classifica del giorno e delle ultime settimane.
CREATE INDEX idx_scarabeo_puzzle ON scarabeo_games (puzzle_number);
-- Per la partita di un giocatore e per le sue statistiche.
CREATE INDEX idx_scarabeo_player ON scarabeo_games (player_id, puzzle_number);
