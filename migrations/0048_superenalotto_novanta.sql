-- Il SuperEnalotto con i numeri da 1 a 90 e due giocate: quattro numeri a dieci
-- punti, cinque (il "4+1") a venti (shared/superenalotto.ts).
--
-- Ogni scheda porta quel che e' costata. Il valore di partenza e' quello delle
-- schede di prima, un punto: nei minuti del deploy il codice di prima ne
-- scrive ancora, e le paga un punto.
ALTER TABLE enalotto_schede ADD COLUMN costo INTEGER NOT NULL DEFAULT 1;

-- Le schede gia' giocate erano di quattro numeri su venti, per un concorso non
-- ancora estratto: con l'urna di novanta non vorrebbero dire niente. Si
-- annullano, e i punti tornano: la giornata si riconta dalle schede che
-- restano, come fa `ricontaSql` (server/lib/enalottoStore.ts).
DELETE FROM enalotto_schede
 WHERE concorso NOT IN (SELECT data FROM enalotto_concorsi WHERE pagato_at IS NOT NULL);

UPDATE fortuna_giornate
   SET netto = COALESCE((SELECT SUM(s.vincita) FROM enalotto_schede s JOIN enalotto_concorsi c ON c.data = s.concorso
                          WHERE s.player_id = fortuna_giornate.player_id AND c.numero = fortuna_giornate.puzzle_number
                            AND s.vincita IS NOT NULL), 0)
               - COALESCE((SELECT SUM(s.costo) FROM enalotto_schede s
                            WHERE s.player_id = fortuna_giornate.player_id AND s.giorno = fortuna_giornate.puzzle_number), 0),
       giocate = (SELECT COUNT(*) FROM enalotto_schede s
                   WHERE s.player_id = fortuna_giornate.player_id AND s.giorno = fortuna_giornate.puzzle_number)
 WHERE gioco = 'superenalotto';

DELETE FROM fortuna_giornate WHERE gioco = 'superenalotto' AND giocate = 0 AND netto = 0;
