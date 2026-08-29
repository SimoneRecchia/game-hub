-- Punti assist: chi suggerisce guadagna, se il suggerimento viene giocato.
--
-- La parola del giorno resta la stessa per tutti, quindi chi guarda la partita
-- di un altro prima di giocare la propria la conosce e quella giornata non fa
-- punti partita. Prima non faceva proprio niente; ora il tempo speso a
-- suggerire vale punti assist, che in classifica si sommano al totale e a
-- parità di totale fanno da spareggio.

-- Punti congelati nel momento in cui l'host gioca la parola.
--
-- Congelati e non ricalcolati per lo stesso motivo di `streak_at_end`: la
-- classifica di una giornata passata non deve cambiare se un domani si ritocca
-- un numero. Il tetto giornaliero invece si applica in lettura, perché un tetto
-- ha senso che valga per tutte le giornate insieme.
ALTER TABLE coop_suggestions ADD COLUMN assist_points INTEGER NOT NULL DEFAULT 0;

-- Un suggerimento per parola per invitato, per stanza.
--
-- Senza questo, suggerire "carta" cinque volte e vedere l'host giocarla una
-- volta valeva cinque assist. Ripetere un suggerimento ora ne aggiorna la data
-- (torna in cima alla lista dell'host) invece di crearne un altro: e' anche
-- quello che uno si aspetta guardando la lista.
DELETE FROM coop_suggestions
 WHERE rowid NOT IN (
   SELECT MIN(rowid) FROM coop_suggestions GROUP BY room_id, guest_id, word
 );

CREATE UNIQUE INDEX idx_coop_suggestions_parola
    ON coop_suggestions (room_id, guest_id, word);

-- Per l'aggregato degli assist in classifica: si leggono i soli usati.
CREATE INDEX idx_coop_suggestions_assist
    ON coop_suggestions (guest_id, used_at);
