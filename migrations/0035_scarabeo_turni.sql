-- La classificata dello Scarabeo a turni contro il computer del giorno.
--
-- Le mosse di una giornata si alternano, le pari di chi gioca e le dispari del
-- computer, e `contro_computer` dice quali giornate si giocano cosi': quelle di
-- prima restano com'erano, da soli (0). Il computer pensa nel telefono e la
-- sua mossa arriva al server insieme a quella di chi gioca; `punti_computer` e'
-- il suo punteggio nella stessa partita, per la schermata e i riepiloghi.
ALTER TABLE scarabeo_games ADD COLUMN contro_computer INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scarabeo_games ADD COLUMN punti_computer INTEGER NOT NULL DEFAULT 0;

-- Il traguardo della notte si gioca come la giornata: `formato` 1 e' quello da
-- solo, le dieci mosse senza avversario, come tutte le righe scritte fin qui;
-- 2 quello a turni, contro lo stesso computer del giorno. La giornata prende il
-- formato del suo traguardo, cosi' chi gioca lo stesso giorno gioca la stessa
-- partita: lo script della notte rifà i traguardi da solo dei giorni che
-- devono venire e che nessuno ha aperto, e oggi resta com'e'.
ALTER TABLE scarabeo_computer ADD COLUMN formato INTEGER NOT NULL DEFAULT 1;
