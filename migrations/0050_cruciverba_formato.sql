-- Il formato degli schemi del cruciverba (scripts/genera-cruciverba.mjs).
--
-- Il 2 e' quello con la memoria delle definizioni: una parola che torna prende
-- una definizione che non ha avuto nell'ultimo mese, fra i sensi del
-- Wikizionario, i sinonimi e, per le parole corte, le definizioni da enigmista.
-- Gli schemi gia' scritti sono dell'1. Lo script della notte rifa' quelli del
-- futuro che nessuno ha aperto; oggi e il passato restano come sono.
ALTER TABLE cruciverba_schemi ADD COLUMN formato INTEGER NOT NULL DEFAULT 1;
