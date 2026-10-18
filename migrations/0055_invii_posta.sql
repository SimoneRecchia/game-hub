-- Le email che il server ha mandato negli ultimi due giorni, per i tetti contro
-- chi le farebbe partire a raffica (server/lib/postino.ts).
--
-- Una registrazione con un'email nuova mandava un codice senza nessun limite:
-- i limiti di prima erano per account, e ogni registrazione e' un account
-- nuovo, anche rifatta con la stessa email. Cosi' si poteva riempire di codici
-- la casella di chiunque, e finire le email del giorno di Resend per tutti. Una
-- riga per email, con l'impronta della rete da cui e' stata chiesta e quella
-- dell'indirizzo a cui e' andata, mai gli indirizzi in chiaro; le righe di piu'
-- di due giorni se ne vanno a ogni invio.
CREATE TABLE invii_posta (
  at TEXT NOT NULL,
  rete TEXT NOT NULL,
  destinatario TEXT NOT NULL
);

CREATE INDEX invii_posta_at ON invii_posta (at);
CREATE INDEX invii_posta_rete ON invii_posta (rete, at);
CREATE INDEX invii_posta_destinatario ON invii_posta (destinatario, at);
