# Note per chi lavora su questo repository

Contesto e vincoli che non si vedono guardando i file.

## Vincoli di piattaforma

**10 ms di CPU per richiesta** sulle Pages Functions (piano gratuito Workers).
È il vincolo che ha deciso la forma dell'autenticazione: lo stretching pesante
della password sta nel browser, il Worker ne applica solo un secondo strato
leggero. Non spostare le iterazioni lato server senza sapere cosa si sta
facendo — vedi `shared/password.ts`.

**Il bundler delle Pages Functions non legge i path di `tsconfig`.** Il codice
sotto `server/` e `functions/` deve usare import relativi (`../../shared/x`),
non `@shared/x`. L'alias è stato tolto da `tsconfig.worker.json` proprio perché
il typecheck se ne accorga subito invece di lasciar fallire il build del deploy.

**D1 non ha transazioni interattive.** Dove serve atomicità si usa
`db.batch()`, oppure un `UPDATE` condizionato allo stato letto — come fa
`server/routes/wordle.ts`, che scrive `WHERE attempts = ?` col valore appena
letto e considera un conflitto il caso `changes !== 1`.

**WebCrypto esiste solo nei contesti sicuri.** La derivazione della password
gira nel browser, quindi il sito funziona in https o su localhost, non su
un'origine http qualsiasi. `deriveVerifier` solleva `InsecureContextError` in
quel caso, e la schermata di accesso lo mostra: non toglierlo, altrimenti torna
un generico "qualcosa e' andato storto" impossibile da diagnosticare.

**Il cookie di sessione e' condiviso fra i sottodomini** tramite `COOKIE_DOMAIN`.
`cookieDomainFor` lo applica solo se copre davvero l'host: un `Domain` non
corrispondente viene scartato dal browser senza dire niente, e l'accesso
smetterebbe di funzionare in un modo difficile da diagnosticare. Se si tocca
quella funzione, i test in `shared/__tests__/hosts.test.ts` coprono i casi
limite (pages.dev, dominio di primo livello, host che finisce per caso col
dominio configurato).

**In locale `.dev.vars` vince sulle `[vars]` di `wrangler.toml`.** Verificato su
wrangler 4.127.1: con `EMAIL_VERIFICATION = "on"` in `wrangler.toml` e
`EMAIL_VERIFICATION=off` in `.dev.vars`, `pages dev` serve `off`. Il file vuole
formato dotenv — nessuno spazio attorno a `=`, nessuna virgoletta, altrimenti
finiscono nel valore — e non e' versionato, quindi un comportamento locale che
non si spiega guardando `wrangler.toml` e' quasi sempre `.dev.vars`. Il cambio
non ha effetto sul processo già avviato: va riavviato.

## Invarianti da non rompere

**Ogni soluzione deve essere anche un tentativo ammesso**, altrimenti il gioco
rifiuterebbe la parola giusta. Verificato da un test in
`shared/__tests__/words.test.ts`.

**Il tetto dei bonus deve restare sotto il gradino fra due tentativi**
(`MAX_TIEBREAK < ATTEMPT_STEP` in `shared/scoring.ts`). È ciò che garantisce che
chi indovina in meno tentativi stia sempre davanti. Se si ritocca un punteggio,
il test che verifica la condizione numerica cade prima di quello sull'ordine:
guarda quello.

**La scala dei punti e' derivata, non scritta a mano**: base di partecipazione
piu' gradino per tentativo risparmiato, cioe' `[100, 90, 80, 70, 60, 50]`. Il
rapporto fra la giornata migliore e la peggiore e' **2:1** di proposito: con il
6:1 di prima due giornate sfortunate decidevano la classifica, e una vittoria al
sesto tentativo valeva un sesto di una perfetta. C'e' un test su entrambi i lati
del compromesso — che sia recuperabile, e che il gradino non sia simbolico.

**Cinque parole al giorno, ognuna con base e gradino propri** (`WORD_BASE`,
`WORD_STEP` in `shared/scoring.ts`), non la principale moltiplicata per un peso.
Il peso sembrava piu' elegante e costringeva ad arrotondare: `floor` era l'unico
modo di garantire che la somma delle quattro non superasse la principale, e piu'
in basso nella scala la coda si schiacciava — con una base bassa la quinta parola
finiva a due o tre punti, e nessuno l'avrebbe giocata.

Con base e gradino la somma torna **per costruzione, a ogni numero di
tentativi**, perché le basi delle quattro sommano alla base della prima
(20+14+8+8 = 50) e i gradini al gradino (4+2+2+2 = 10). Da cui:

    tentativi        1    2    3    4    5    6
    del giorno     100   90   80   70   60   50
    2ª              40   36   32   28   24   20
    3ª              24   22   20   18   16   14
    4ª              18   16   14   12   10    8
    5ª              18   16   14   12   10    8
    somma 2ª-5ª    100   90   80   70   60   50

Le ultime due valgono uguale invece di continuare a scendere: la quinta deve
valere la pena di essere giocata. Nessuna parola scende sotto gli otto punti, e
c'e' un test per ognuna di queste proprietà.

**I bonus stanno solo sulla parola del giorno** (`scoreForWord`). Velocità e
costanza sono proprietà della giornata, non di ogni parola: dandoli a tutte e
cinque, chi le giocava tutte incassava fino a cinque volte il bonus velocità, e
tanto bastava a superare chi aveva indovinato la principale al primo colpo — cioe'
esattamente il ribaltamento che la scala serve a impedire. Trovato provando
l'API, non ragionando sui numeri: la scala da sola era giusta.

**Il caso estremo e' un pareggio, e si scioglie sulla media tentativi.**
Principale perfetta 109 contro cinque parole all'ultimo tentativo 109: non e' un
difetto, e' la conseguenza diretta del fatto che le quattro extra valgono quanto
la principale. Il pareggio si rompe in classifica perché `played`, `wins` e
`avg_attempts` contano **solo `slot = 1`**: contando tutte e cinque, chi le gioca
tutte accumulava cinque vittorie al giorno e vinceva lo spareggio col numero
invece che col merito. `playerStats` deve restare d'accordo — quei numeri
significano "giornate", che e' quel che uno intende leggendo "giocate".

**Le parole si aprono una per volta.** La N si gioca solo quando la N-1 e'
chiusa: `requireUnlocked` in `server/routes/wordle.ts` lo applica sia su `/state`
sia su `/guess`, e `/state` legge il quadro **prima** di `openGame` — creando la
riga, la parola successiva risulterebbe sbloccata al giro dopo. Il controllo non
puo' stare solo nel selettore: `?slot=5` lo aggirerebbe.

**La streak e' quella della parola del giorno**, `slot = 1`, sia in
`streakBefore` sia negli aggregati. Le parole in piu' non devono poter tenere in
vita una serie interrotta sulla principale.

**In compagnia si gioca la parola del giorno.** Tutte le query di
`server/lib/coopStore.ts` filtrano su `slot = 1`, ed e' per questo che
`coop_rooms` puo' restare con la sua "una stanza per host al giorno".

**Una partecipazione al giorno, e vale lo stesso per tutti.** La giornata di un
giocatore e' una sola: o la propria partita, o quella di chi lo ha invitato. Nel
secondo caso `wordle_games.spectated = 1`, la propria board rifiuta i tentativi
(`GIOCATA_INSIEME`) e `assist_score` porta **lo stesso punteggio dell'host**.
Sei persone su una parola indovinata al terzo tentativo fanno ottanta punti a
testa, come chi la indovina da solo: e' quello che rende accettare un invito una
scelta neutra invece di una rinuncia. `payAssists` filtra su
`assist_score IS NULL`, così due richieste ravvicinate non pagano due volte.

**Una giornata giocata in compagnia conta per la streak** (`assist_status`).
Senza, accettare un invito spezzerebbe la serie, e sarebbe di nuovo una
differenza fra il solo e il gruppo. Non conta invece nelle statistiche di gioco:
i tentativi sono dell'host, e contarli come propri falserebbe media e
distribuzione. `server/lib/leaderboard.ts` e `playerStats` devono restare
d'accordo su entrambe le regole — il totale del profilo e' quello che si vede in
classifica.

**Nessuna parola con j, k, w, x, y** negli elenchi: la tastiera del gioco ha 21
tasti e quelle lettere non sarebbero digitabili.

**La soluzione non deve arrivare al client prima della fine.** `toState()` in
`server/routes/wordle.ts` mette `answer: null` finché lo stato è `playing`; è
l'unica cosa che rende la classifica significativa. Vale anche per la vista
condivisa: `guestView()` applica la stessa regola.

**Le parole del giorno sono le stesse per tutti.** `dailyAnswers` fa
`INSERT OR IGNORE` di cinque righe per `puzzle_number` in un `batch` e poi le
rilegge: il primo che apre il gioco le fissa, tutti gli altri leggono quelle. È
anche deterministico dal numero del puzzle, quindi le righe salvate sono una
garanzia in piu' — se un domani si rigenerasse l'elenco, le parole già giocate
non cambierebbero. Un test in `shared/__tests__/daily.test.ts` lo blocca.

**La sequenza della parola del giorno non si tocca.** `dailySolutionIndexes`
tiene `slot = 1` esattamente su `solutionIndexFor`, e pesca le quattro extra da
una permutazione con un altro seme. Non e' un vezzo: consumando cinque parole al
giorno da un elenco solo, le 1.132 soluzioni finirebbero in 226 giorni invece di
1.132. C'e' un test che verifica che la principale sia rimasta quella — se cade,
chi gioca da settembre si trova la parola di un altro giorno.

Ed e' anche il motivo per cui **chi gioca la giornata in compagnia non puo'
rigiocarla per conto suo**: e' la stessa parola, l'ha già fatta. Quel divieto e'
ciò che rende innocuo il fatto che guardare la sveli — prima serviva azzerare il
punteggio, che era un rimedio peggiore del male.

**Le partite condivise vanno a polling, non in realtime.** Cadenze in
`shared/config.ts`. Non introdurre WebSocket o SSE senza aver verificato che le
Durable Objects siano disponibili sul piano in uso: i 10 ms di CPU per richiesta
rendono le connessioni lunghe una cattiva idea.

**`container-type: size` richiede un'altezza definita.** La griglia si
dimensiona con `83.34cqh` per stare in altezza, ma dove la pagina scorre
(telefono in orizzontale) l'altezza non e' definita e `cqh` si risolve a zero,
collassando le caselle. Per questo la media query orizzontale rimette
`container-type: normal` e torna a dimensionare sulla larghezza.

## Il design

**La palette scura non esiste come blocco separato.** Ogni token e' un
`light-dark(chiaro, scuro)`, che segue `color-scheme` — quindi copre sia la
preferenza di sistema sia l'interruttore manuale, perché quello imposta
`color-scheme` sulla radice e nient'altro. Prima la palette scura era scritta due
volte identiche (in `@media (prefers-color-scheme: dark)` e in
`[data-theme='dark']`): novanta righe che sarebbero divergute alla prima
modifica.

Ogni dichiarazione ha sopra **il valore chiaro nudo**: i browser che non
conoscono `light-dark()` scartano la seconda riga e restano sul tema chiaro
invece di perdere il colore.

**`light-dark()` va solo attorno a un colore.** Usato su un `box-shadow` intero
il valore diventa invalido e l'ombra sparisce del tutto — verificato, dava `none`
in entrambi i temi. Per le ombre il colore sta in `--shadow-tint` e la geometria
resta fuori.

**Il colore vuole dire una cosa sola.** Il verde e' "lettera giusta", quindi
l'accento dell'interfaccia e' un indaco (`--brand`) e non un verde né l'azzurro
di sistema. Se serve un accento nuovo, va aggiunto un token, non riusato uno del
gioco.

**Profondita' con tre livelli, non con le ombre grandi.** Caselle e tasti usano
`--edge-light` (filo di luce in alto), una velatura verticale in
`background-image`, e `--shadow-key` — un'ombra secca senza sfocatura. E' quel
che fa sembrare un tasto un oggetto; premendo **scende** invece di
rimpicciolirsi, perché lo `scale` fa sembrare il tasto un'immagine che si
allontana.

I keyframes delle caselle usano `background-color` e non `background`: la
velatura sta in `background-image` e sostituirla in blocco la cancellerebbe.

**Le durate delle animazioni delle caselle sono replicate in
`src/games/wordle/useWordle.ts`** (`REVEAL_*`, `BOUNCE_MS`, `SHAKE_MS`): il
codice deve sapere quando la rotazione e' finita per colorare la tastiera e
aprire il riepilogo al momento giusto. Se si cambia una durata in `Tile.css` va
cambiata anche lì.

## Cose che sembrano sbagliate e non lo sono

`solutions.ts` e `guesses.ts` sono **generati** (`npm run words:build`) e
versionati di proposito: così il build non dipende dalla rete e la parola del
giorno non cambia per una fonte che si sposta.

Le partite in corso appaiono in classifica con **zero punti**: serve a vedere
chi sta ancora giocando, non è un bug del calcolo.

In classifica può comparire chi ha **zero partite** e un punteggio pieno: sono
le giornate giocate nella stanza di qualcun altro, che valgono come le proprie
ma i cui tentativi non sono suoi. Per lo stesso motivo il profilo mostra il
pannello statistiche anche con `played === 0`, se ci sono giornate in compagnia,
e la card della posizione nell'hub non si nasconde.

La **streak resta viva** se l'ultima vittoria è di ieri e oggi non si è ancora
giocato. Si azzera solo se si è saltato un giorno o se si è giocato oggi e
perso. Il confronto è con ieri e non con oggi, altrimenti a mezzanotte si
azzererebbe la streak di tutti.

Il segnaposto di `database_id` in `wrangler.toml` va bene
in locale: wrangler crea un SQLite dentro `.wrangler/state` e l'ID non lo guarda
nessuno. In produzione lo intercetta `scripts/check-config.mjs`, che ha i suoi test in
`scripts/__tests__`. La CI **non** imposta `CF_PAGES`: attivare il controllo lì
lo renderebbe un cancello che deve fallire finché il progetto non e' collegato a
un D1 reale, e non e' compito della CI stabilire se la produzione e'
configurata.

**Il progetto Pages e' "direct upload", non collegato a Git.** Cloudflare non
permette di convertirlo, quindi il deploy passa da
`.github/workflows/deploy.yml` e non dal build integrato di Pages. Se un giorno
si volesse il collegamento a Git, va creato un progetto nuovo e rifatti i
custom domain.

**Il sottodominio Pages e' `game-hub-43l.pages.dev`, non `game-hub.pages.dev`**
(quello e' già di qualcun altro). Conta quando si scrivono i CNAME: puntare al
nome del progetto invece che al sottodominio vero lascia i domini in `pending`.

**Il salt della password si deriva dal nickname.** Quindi il recupero password
richiede il nickname e non l'email: un verifier derivato dall'email non
corrisponderebbe a quello che il login produrra' dopo, e la password nuova
risulterebbe subito sbagliata. Vale anche per qualunque futura funzione che
reimposti una password.

**La verifica dell'email resta spenta senza chiave Resend.**
`emailVerificationEnabled` controlla entrambe le condizioni. Non accendere
`EMAIL_VERIFICATION` senza la chiave: bloccherebbe ogni registrazione, perché
il codice non partirebbe.

## Prima di aprire una PR

```bash
npm run typecheck && npm run test && npm run build
```

Per provare davvero il gioco serve l'API, quindi `npm run dev:api` (non
`npm run dev`, che avvia solo Vite).
