-- Si entra senza password, con un codice mandato all'email.
--
-- Le password non servono piu', e una password che non serve non deve restare
-- nel database: qui si svuotano. Le colonne restano, perché dalla 0001 sono
-- NOT NULL e toglierle vorrebbe dire rifare la tabella dei giocatori, a cui
-- puntano quasi tutte le altre; nessuno le legge piu', e chi si registra le
-- lascia vuote. Le sessioni non si toccano: chi e' dentro resta dentro.
UPDATE players SET password_hash = '', password_salt = '', password_iterations = 0;
