-- Una partecipazione al giorno, e vale lo stesso per tutti quelli che ci sono.
--
-- Prima gli assist erano una moneta a parte: quattro punti per suggerimento
-- giocato, dodici se era la soluzione, con un tetto giornaliero. Il risultato
-- era che giocare in compagnia valeva molto meno che giocare da soli, e
-- accettare un invito restava una scelta perdente.
--
-- Ora la giornata di un giocatore e' una sola, e puo' essere di due tipi:
--
--   * la propria partita → punti partita;
--   * la partita di chi lo ha invitato → gli stessi punti che fa l'host, come
--     assist.
--
-- Quindi una parola indovinata al terzo tentativo da un gruppo di sei vale
-- ottanta punti a testa, esattamente come varrebbe a chi la indovina da solo.
-- E chi ha giocato la parola nella stanza di un altro non puo' giocarla anche
-- per conto proprio: e' la stessa parola, l'ha già fatta. Quel divieto e' anche
-- ciò che rende innocuo il fatto che guardare la sveli.

-- Il punteggio dell'host, copiato qui quando la sua partita si chiude.
--
-- Copiato e non calcolato al volo per lo stesso motivo di `streak_at_end`: la
-- classifica di una giornata passata non deve cambiare se un domani si ritocca
-- un numero. NULL = questa giornata non e' stata giocata in compagnia.
ALTER TABLE wordle_games ADD COLUMN assist_score INTEGER;

-- In quale stanza. Serve alla UI per dire "con Anna" e per riportare il
-- giocatore alla partita che ha in corso invece della propria, che e' chiusa.
ALTER TABLE wordle_games ADD COLUMN assist_room_id TEXT;

-- Com'e' finita quella partita: 'won' o 'lost'.
--
-- Serve alla streak. Se una giornata giocata in compagnia non contasse come
-- giocata, accettare un invito spezzerebbe la serie — e sarebbe di nuovo una
-- differenza fra il solo e il gruppo. Congelato accanto al punteggio invece di
-- essere letto dalla partita dell'host con una JOIN, per la stessa ragione:
-- la giornata di ieri e' un fatto chiuso.
ALTER TABLE wordle_games ADD COLUMN assist_status TEXT
  CHECK (assist_status IS NULL OR assist_status IN ('won', 'lost'));

-- Per la classifica: si leggono le giornate con un assist da pagare.
CREATE INDEX idx_wordle_games_assist ON wordle_games (assist_room_id);

-- I punti per suggerimento non esistono piu': l'assist e' il punteggio
-- dell'host, non una somma di suggerimenti.
--
-- L'indice unico su (stanza, invitato, parola) invece resta: un invitato non
-- deve avere due righe per la stessa parola, e non per una questione di punti
-- ma perché la lista dell'host si riempirebbe di doppioni.
ALTER TABLE coop_suggestions DROP COLUMN assist_points;
DROP INDEX IF EXISTS idx_coop_suggestions_assist;
