-- Il go, fra le partite su un tavoliere (la tabella l'aveva gia' nel CHECK).
--
-- Due passi di seguito fermano la partita, che pero' non e' finita: si contano
-- i punti, e le pietre morte le segnano i giocatori. La stima la fa il
-- telefono, che la manda come proposta; ognuno puo' cambiarla toccando i
-- gruppi, e il conteggio vale quando tutti e due hanno accettato la stessa:
-- una proposta nuova non e' accettata da nessuno.
-- `morte` sono i punti delle pietre morte (JSON), `morte_ok` chi ha accettato
-- quella proposta, `punti` il risultato a partita finita.
ALTER TABLE tavolo_partite ADD COLUMN morte TEXT;
ALTER TABLE tavolo_partite ADD COLUMN morte_ok TEXT CHECK (morte_ok IN ('a', 'b'));
ALTER TABLE tavolo_partite ADD COLUMN punti TEXT;
