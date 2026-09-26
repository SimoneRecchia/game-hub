-- Il nickname dimenticato si recupera dall'email.
--
-- Il salt della password si deriva dal nickname (vedi shared/password.ts), quindi
-- senza nickname non si entra e non si reimposta nemmeno la password: chi
-- ricorda solo l'email restava chiuso fuori. Ora puo' farselo mandare.
--
-- La colonna tiene l'ultimo invio, per non mandarne piu' di uno al minuto alla
-- stessa persona: la rotta risponde sempre allo stesso modo, e senza un limite
-- chiunque potrebbe riempire di posta la casella di un collega.
ALTER TABLE players ADD COLUMN nickname_email_at TEXT;
