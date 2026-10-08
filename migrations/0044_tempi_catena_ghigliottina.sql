-- I tempi di ogni passo della Catena e della Ghigliottina.
--
-- Nella Catena ogni parola prima della finale ha un minuto
-- (`TEMPO_PAROLA_CATENA_MS`): `parola_at` e' quando parte quello della parola
-- di adesso, scritto con la mossa che ci porta, dopo il tempo della scena.
-- NULL nelle partite cominciate prima, che restano senza.
ALTER TABLE catena_partite ADD COLUMN parola_at TEXT;

-- Nella Ghigliottina ogni coppia ha venti secondi (`TEMPO_SCELTA_MS`):
-- `coppia_at` e' quando parte quello della coppia di adesso. NULL nelle
-- partite cominciate prima, che restano senza.
ALTER TABLE ghigliottina_partite ADD COLUMN coppia_at TEXT;
