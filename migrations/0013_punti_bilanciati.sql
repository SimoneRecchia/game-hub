-- Ogni partita classificata vale al massimo cento punti, in tutti i giochi.
--
-- Il Wordle ne valeva duecento: cento la parola del giorno, cento le altre
-- quattro. Con la classifica generale, che somma i giochi, un Wordle sarebbe
-- contato il doppio di un cruciverba. La scala si divide a meta' — ogni numero
-- era pari, quindi la divisione e' esatta — e con lei i bonus, che devono
-- restare sotto il gradino di un tentativo (ora cinque punti): velocità fino a
-- uno, costanza fino a tre. Vedi shared/scoring.ts.
--
-- I punteggi salvati si ricalcolano con la scala nuova, dagli stessi dati con
-- cui furono calcolati: tentativi, durata e serie sono sulla riga. E' l'unica
-- eccezione alla regola "il punteggio di una giornata passata non cambia": una
-- classifica mezza in una scala e mezza nell'altra non vorrebbe dire niente.
-- Un test rifa' il conto con shared/scoring.ts su tutte le combinazioni.

UPDATE wordle_games
   SET score = CASE
     WHEN status = 'won' AND slot = 1 THEN
       25 + 5 * (6 - MIN(MAX(attempts, 1), 6))
       -- velocità: pieno fino a 45 secondi, zero da dodici minuti, arrotondato
       + CASE
           WHEN duration_ms IS NULL OR duration_ms < 0 THEN 0
           WHEN duration_ms <= 45000 THEN 1
           WHEN duration_ms >= 720000 THEN 0
           ELSE CAST(ROUND((720000.0 - duration_ms) / 675000.0) AS INTEGER)
         END
       -- costanza: un punto per giorno di fila, fino a tre
       + MIN(MAX(COALESCE(streak_at_end, 0), 0), 3)
     WHEN status = 'lost' AND slot = 1 THEN 10
     WHEN status = 'won' THEN
       CASE slot WHEN 2 THEN 10 WHEN 3 THEN 7 ELSE 4 END
       + CASE slot WHEN 2 THEN 2 ELSE 1 END * (6 - MIN(MAX(attempts, 1), 6))
     WHEN status = 'lost' THEN CASE slot WHEN 2 THEN 4 ELSE 2 END
     ELSE score
   END
 WHERE spectated != 1 AND status != 'playing';

-- Chi ha giocato la giornata nella stanza di un altro prende il punteggio
-- dell'host: ricalcolato quello, si ricopia.
UPDATE wordle_games
   SET assist_score = (
     SELECT h.score
       FROM coop_rooms r
       JOIN wordle_games h
         ON h.player_id = r.host_id AND h.puzzle_number = r.puzzle_number AND h.slot = 1
      WHERE r.id = wordle_games.assist_room_id
   )
 WHERE spectated = 1 AND assist_score IS NOT NULL;
