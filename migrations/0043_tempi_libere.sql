-- I tempi che si scelgono nelle libere fra amici, e viaggiano con l'invito.
--
-- Il tempo per mossa delle partite ai tavolieri e allo Scarabeo
-- (shared/tavolo-tempi.ts), in millisecondi, 0 per senza tempo. Le partite di
-- prima restano NULL, e valgono con il tempo che avevano allora: dieci secondi
-- il tris, nessuno gli altri.
ALTER TABLE tavolo_partite ADD COLUMN tempo_mossa_ms INTEGER;

-- I secondi delle sfide a Nomi, cose e città (`secondiNomiValidi`). NULL nelle
-- sfide di prima, che avevano i tre minuti della classificata.
ALTER TABLE nomi_sfide ADD COLUMN secondi INTEGER;

-- La difficolta' delle sfide a Sequenze (`LIVELLI_SEQUENZE`): 'facile',
-- 'normale' o 'difficile', al contrario. NULL nelle sfide di prima, che erano
-- tutte al normale.
ALTER TABLE sequenze_sfide ADD COLUMN livello TEXT;
