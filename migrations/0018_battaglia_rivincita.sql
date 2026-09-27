-- La rivincita nella battaglia navale fra amici: "Gioca ancora" alla fine di
-- una partita, da chiunque dei due, e l'altro accetta o no. Le partite di una
-- serie si contano: chi ne ha vinte quante, prima di questa.

-- La sfida che e' una rivincita: di quale partita.
ALTER TABLE battaglia_inviti ADD COLUMN rivincita_di TEXT;

-- Le vittorie di ciascuno nelle partite di prima della serie, e quante erano.
ALTER TABLE battaglia_partite ADD COLUMN serie_a INTEGER NOT NULL DEFAULT 0;
ALTER TABLE battaglia_partite ADD COLUMN serie_b INTEGER NOT NULL DEFAULT 0;
ALTER TABLE battaglia_partite ADD COLUMN partite_serie INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_battaglia_inviti_rivincita ON battaglia_inviti (rivincita_di);
