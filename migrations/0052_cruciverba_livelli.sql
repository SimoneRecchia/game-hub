-- Gli schemi liberi del cruciverba hanno un livello: facile, media o difficile.
--
-- Quelli scritti fin qui sono dieci per dieci con tutto il dizionario, comprese
-- le definizioni di botanica e di zoologia: sono i difficili. Il facile e' il
-- nove per nove della classificata, il medio sta in mezzo (vedi
-- scripts/cruciverba/generatore.mjs, LIVELLI_CRUCIVERBA). Il livello lo controlla
-- il server, senza CHECK: in SQLite allargarlo vorrebbe dire rifare la tabella.
ALTER TABLE cruciverba_schemi_liberi ADD COLUMN livello TEXT NOT NULL DEFAULT 'difficile';

CREATE INDEX idx_cruciverba_liberi_livello ON cruciverba_schemi_liberi (livello, id);
