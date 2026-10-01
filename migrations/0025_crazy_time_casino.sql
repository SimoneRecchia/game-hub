-- Crazy Time come al casinò: dodici spicchi — il banco, le domande, la moneta —
-- e la ruota dei moltiplicatori.
--
-- Un giro salva l'indice dello spicchio, e con la disposizione nuova lo stesso
-- indice e' un altro spicchio: `disposizione` dice di quale ruota e' il giro
-- (shared/ruota.ts, DISPOSIZIONE_RUOTA), e la pagina mostra solo quelli della
-- ruota di adesso. I giri di prima restano con i loro punti.
ALTER TABLE ruota_giocate ADD COLUMN disposizione INTEGER NOT NULL DEFAULT 1;

-- Le sfide rimaste a meta' con la ruota di prima non si possono piu' giocare:
-- si chiudono come sono, e valevano gia' perse.
UPDATE ruota_giocate SET stato = 'fatto' WHERE stato != 'fatto';
