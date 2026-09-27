-- Il quiz a modi: ogni categoria si gioca a scelta o sulla cartina muta, e ogni
-- domanda porta il suo `luogo`, cioe' dove guardare a risposta data.
--
-- Le giornate gia' scritte restano come sono: formato 1. Lo script della notte
-- (scripts/genera-quiz.ts) rifà quelle del futuro che nessuno ha ancora aperto,
-- e scrive le nuove con il formato 2. Una giornata di oggi, o aperta da
-- qualcuno, non si tocca: e' la stessa partita per tutti.
ALTER TABLE quiz_giornate ADD COLUMN formato INTEGER NOT NULL DEFAULT 1;
