-- Una parola sola al giorno.
--
-- Il Wordle classificato aveva cinque parole: quella del giorno e quattro in
-- piu', che si aprivano una per volta. Adesso la classificata e' una parola
-- sola, la stessa per tutti, come la partita del giorno di ogni altro gioco; chi
-- vuole giocarne altre ha la libera.
--
-- Due conseguenze sui dati salvati.
--
-- Le parole in piu' giocate finora non spariscono: vanno in un archivio, con
-- le loro righe intere, e smettono di contare. Tenerle in `wordle_games`
-- vorrebbe dire filtrare `slot = 1` in ogni somma per sempre, e una giornata
-- del passato peserebbe diversamente da una di oggi.
--
-- La parola del giorno si ricalcola sulla scala nuova — cento al primo
-- tentativo, cinquanta al sesto, venti se non indovinata, piu' gli stessi
-- spareggi di velocità (fino a uno) e costanza (fino a tre) — dagli stessi dati
-- con cui fu calcolata: tentativi, durata e serie sono sulla riga. Cosi' una
-- giornata di settembre e una di oggi valgono sulla stessa scala, e ogni
-- giornata vale una parola, come adesso. Un test rifa' il conto con
-- shared/scoring.ts su tutte le combinazioni.

CREATE TABLE wordle_parole_extra AS SELECT * FROM wordle_games WHERE slot > 1;

DELETE FROM wordle_games WHERE slot > 1;

UPDATE wordle_games
   SET score = CASE
     WHEN status = 'won' THEN
       50 + 10 * (6 - MIN(MAX(attempts, 1), 6))
       -- velocità: pieno fino a 45 secondi, zero da dodici minuti, arrotondato
       + CASE
           WHEN duration_ms IS NULL OR duration_ms < 0 THEN 0
           WHEN duration_ms <= 45000 THEN 1
           WHEN duration_ms >= 720000 THEN 0
           ELSE CAST(ROUND((720000.0 - duration_ms) / 675000.0) AS INTEGER)
         END
       -- costanza: un punto per giorno di fila, fino a tre
       + MIN(MAX(COALESCE(streak_at_end, 0), 0), 3)
     WHEN status = 'lost' THEN 20
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
