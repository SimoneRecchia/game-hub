# Note per chi lavora su questo repository

Contesto e vincoli che non si vedono guardando i file.

## Vincoli di piattaforma

**10 ms di CPU per richiesta** sulle Pages Functions (piano gratuito Workers).
E' il vincolo che decide dove si fa un calcolo: quel che non ci sta — riempire
uno schema, far giocare il computer, contare i punti di una notte — si fa negli
script della notte o nel browser, mai nel Worker.

**Il bundler delle Pages Functions non legge i path di `tsconfig`.** Il codice
sotto `server/` e `functions/` deve usare import relativi (`../../shared/x`),
non `@shared/x`. L'alias è stato tolto da `tsconfig.worker.json` proprio perché
il typecheck se ne accorga subito invece di lasciar fallire il build del deploy.

**D1 non ha transazioni interattive.** Dove serve atomicità si usa
`db.batch()`, oppure un `UPDATE` condizionato allo stato letto — come fa
`server/routes/wordle.ts`, che scrive `WHERE attempts = ?` col valore appena
letto e considera un conflitto il caso `changes !== 1`.

**D1 accetta al massimo cento parametri per istruzione.** Una lista che cresce
con i giocatori non si passa con un segnaposto per elemento, ma come JSON in un
parametro solo: `IN (SELECT value FROM json_each(?))`, come fa la classifica
generale (`server/lib/generale.ts`), che con un `?` per giocatore rispondeva 500
dal centunesimo in poi. Il banco dei test (`server/__tests__/banco.ts`) ha lo
stesso limite, perché SQLite in locale ne regge molti di piu' e il test
passerebbe lo stesso.

**L'app ha un indirizzo solo, `giochi.<dominio>`, e i sottodomini dei giochi
sono scorciatoie.** `wordle.<dominio>` porta a `giochi.<dominio>/wordle` prima
ancora che parta l'app: lo fa lo script in testa a `index.html`, perché le
Pages non sanno fare redirect per host e una Function su ogni richiesta
costerebbe richieste contate. La regola e' anche in `indirizzoCanonico`
(`shared/hosts.ts`), e un test esegue lo script di `index.html` con una
`location` finta per verificare che portino nello stesso posto.

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

**Una regola di `_headers` prende anche le pagine dell'app.** Le Pages servono
ogni pagina con `index.html`, allo stesso indirizzo, e le regole di `_headers`
guardano l'indirizzo: `/scarabeo/*`, scritta per il dizionario, dava un anno di
cache anche a /scarabeo/classificata, e un browser poteva tenersi per mesi
l'app di quel giorno. Le regole "per sempre" nominano i file o stanno sotto
cartelle senza pagine (`/assets/`, `/dati/`), e un test
(`scripts/__tests__/headers.test.ts`) le prova sulle rotte di `App.tsx`. Il
service worker riconvalida ogni navigazione (`cache: 'no-cache'`), per chi ha
ancora in cache una pagina di allora.

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
piu' gradino per tentativo risparmiato, cioe' `[100, 90, 80, 70, 60, 50]`, e
venti per una parola non indovinata. Il rapporto fra la giornata migliore
e la peggiore e' **2:1** di proposito: con il 6:1 di una volta due giornate
sfortunate decidevano la classifica, e una vittoria al sesto tentativo valeva
un sesto di una perfetta. C'e' un test su entrambi i lati del compromesso — che
sia recuperabile, e che il gradino non sia simbolico. I bonus di velocità (fino
a uno) e di costanza (fino a tre) sono spareggi: sommati restano sotto il
gradino di dieci. Per un periodo, con i tetti diversi per gioco, la scala era
la stessa moltiplicata per sette decimi, da settanta a trentacinque e
quattordici: le giornate di allora valgono quel che valevano.

**La classificata del Wordle e' una parola sola al giorno**, la stessa per
tutti, come la partita del giorno di ogni altro gioco; chi ne vuole altre ha la
libera, quante ne vuole e a caso. Per un periodo le parole erano cinque, aperte
una per volta su una mappa a percorso (`/wordle/classificata/:slot`): la
migrazione `0014_parola_unica.sql` ha messo le quattro in piu' gia' giocate in
`wordle_parole_extra` — righe intere, per non perderle — e ricalcolato la
parola del giorno sulla scala di adesso, assist compresi, dagli stessi dati con
cui era stata calcolata. I vecchi indirizzi con lo slot portano alla
classificata (`App.tsx`), e `/state` e `/guess` rispondono `BAD_SLOT` a uno
slot diverso da 1. La colonna `slot` resta, sempre a 1, e le query la filtrano
ancora: non costa niente, e una riga con un altro slot non potrebbe entrare in
un conto nemmeno per sbaglio.

Il cronometro del bonus velocità parte quando si apre la parola (`openGame`
scrive `started_at` alla prima `/state`): nessuna rotta di sola lettura —
`/summary`, `/oggi` — deve aprire una partita, altrimenti guardare l'hub
costerebbe punti.

**La streak e' quella della parola del giorno**, sia in `streakBefore` sia
negli aggregati, e `played`, `wins` e `avg_attempts` contano solo le parole
giocate per conto proprio: quei numeri significano "giornate", che e' quel che
uno intende leggendo "giocate". `playerStats` e `server/lib/leaderboard.ts`
devono restare d'accordo.

**In compagnia si gioca la parola del giorno**, ed e' per questo che
`coop_rooms` puo' restare con la sua "una stanza per host al giorno".

**Una partecipazione al giorno, e vale lo stesso per tutti.** La giornata di un
giocatore e' una sola: o la propria partita, o quella di chi lo ha invitato. Nel
secondo caso `wordle_games.spectated = 1`, la propria board rifiuta i tentativi
(`GIOCATA_INSIEME`) e `assist_score` porta **lo stesso punteggio dell'host**.
Sei persone su una parola indovinata al terzo tentativo fanno cinquantasei
punti a testa, come chi la indovina da solo: e' quello che rende accettare un
invito una scelta neutra invece di una rinuncia. `payAssists` filtra su
`assist_score IS NULL`, così due richieste ravvicinate non pagano due volte.

**Una giornata giocata in compagnia conta per la streak** (`assist_status`).
Senza, accettare un invito spezzerebbe la serie, e sarebbe di nuovo una
differenza fra il solo e il gruppo. Non conta invece nelle statistiche di gioco:
i tentativi sono dell'host, e contarli come propri falserebbe media e
distribuzione. `server/lib/leaderboard.ts` e `playerStats` devono restare
d'accordo su entrambe le regole — il totale del profilo e' quello che si vede in
classifica.

**Il cruciverba e lo Scarabeo si giocano in compagnia come il Wordle.** Le
regole sono le stesse — una partecipazione al giorno, lo stesso punteggio
dell'host, a pari punti avanti chi ne ha fatti meno in compagnia — in tabelle
loro (`compagnie`, `compagnie_ospiti`, `compagnie_suggerimenti`), fatte per i
giochi che verranno: `gioco` non ha un `CHECK`, e il tipo `GiocoInCompagnia` lo
tiene chiuso. Chi accetta prima di aver finito la propria partita ci lega la
giornata (`in_compagnia`), e la sua partita rifiuta le scritture
(`GIOCATA_INSIEME`): lo schema e le tessere sono gli stessi, e li ha visti
giocare. Tre buchi della stanza del Wordle qui sono chiusi: si entra solo in una
partita ancora in corso, perché un host che ha finito non pagherebbe più nessuno
(`entraNellaGiornata` lo controlla nello stesso `UPDATE`); un host non gioca in
compagnia di altri, ne' chi ha qualcuno nella propria; e chi e' dentro non si
manda via, perché la sua giornata e' ormai quella. Il cruciverba paga a partita
completata, lo Scarabeo a ogni mossa — li' anche una partita in corso ha i suoi
punti in classifica — e `pagaOspiti` scrive un valore invece di sommarlo, cosi'
due richieste ravvicinate non pagano due volte. Nel cruciverba il tempo di una
giornata in compagnia non conta: era dell'host.

**Un suggerimento non dice se e' giusto.** Nel cruciverba il server guarda solo
la forma — una definizione che c'e', una parola lunga quanto lei — perché
rifiutare le parole sbagliate vorrebbe dire rispondere a chi chiede la soluzione
una parola alla volta. Nello Scarabeo invece la posa passa dagli stessi
controlli di una mossa, sul tabellone e sul leggio dell'host e sul dizionario,
cosi' l'host vede solo pose che puo' giocare, con i loro punti. Un invitato ha
un suggerimento per chiave, la definizione o il turno dell'host, e se e' gia'
nella partita non lo dice una colonna ma la partita stessa (`usato`). Toccarlo
lo mette nella partita dell'host senza giocarlo: la mossa resta sua.

**Nessuna parola con j, k, w, x, y** negli elenchi: la tastiera del gioco ha 21
tasti e quelle lettere non sarebbero digitabili.

**Quel che si tocca si deve poter digitare.** `ALFABETO` e `KEYBOARD_ROWS` stanno
in `shared/wordle.ts` e `isGameLetter` decide sia i tasti fisici sia quelli a
schermo. Erano due regole separate, e non erano d'accordo: il filtro della
tastiera fisica usava `[a-hl-vz]`, che salta la **i** — sulla tastiera del gioco
la i c'era, ma da un computer "germi" non si poteva scrivere. Trovato provando il
giro completo con Playwright, non leggendo il codice. Un test in
`shared/__tests__/wordle.test.ts` verifica le due direzioni: ogni tasto e'
digitabile, ogni lettera giocabile sta sulla tastiera.

**Il sacchetto dello Scarabeo e' lo stesso per tutti, e non si salva.**
`sacchettoDelGiorno(puzzleNumber)` mescola le 120 tessere con il PRNG condiviso:
stesso giorno, stesso ordine, per chiunque. E' l'unica cosa che rende
confrontabili due punteggi, ed e' anche il motivo per cui — al contrario della
parola del Wordle — non c'e' una tabella che lo fissi: quella dipende da un
elenco di parole che potrebbe essere rigenerato, questo da una tabella di
costanti nel codice. Cambiare `DISTRIBUZIONE` o il seme cambierebbe le mani di
tutte le giornate passate.

**La verita' di una partita sono le mosse.** `scarabeo_games.mosse` salva solo
le decisioni — di chi gioca e, nelle giornate a turni, del computer del giorno,
a turno —; tabellone, leggii e punti di ogni mossa si ricalcolano con `rigioca`
e `leggiiDa` (`statoADue` in `shared/scarabeo-due.ts`, per le partite a due).
Cosi' non esiste il caso in cui la riga dice una mano e le mosse ne implicano
un'altra — la stessa ragione per cui le partite di Wordle salvano le parole e
non i colori. `score` in colonna e' l'eccezione, e sta lì perché la classifica
lo somma in SQL senza rigiocare le partite di tutti; `punti_computer`, il
punteggio dell'avversario, gli sta accanto per l'hub.

**Un premio vale solo la prima volta.** In `validaPosa` i moltiplicatori si
applicano alle sole caselle **appena coperte**: una parola che passa su una
tripla già usata non la riusa. Senza quel controllo la stessa casella pagherebbe
per tutta la partita, e il tabellone diventerebbe una macchina da punti.

**Passare e cambiare costano una mossa.** Altrimenti il limite di dieci mosse
della classificata non vorrebbe dire niente e il cambio diventerebbe un modo
gratuito di scegliersi il leggio; nella partita intera contano fra i turni senza
parole che la chiudono. Le tessere cambiate tornano **in fondo alla coda** e non
rimescolate: il leggio deve restare una funzione delle sole mosse, e rimescolare
richiederebbe di salvare lo stato del generatore.

**Il dizionario dello Scarabeo e' un file statico, lo stesso per il browser e
per il server.** `public/scarabeo/dizionario.dawg` ha due milioni di parole in
1,3 MB (il formato e' in `scripts/scarabeo/dawg.mjs`): il server lo legge con
`env.ASSETS` una volta per isolato (`server/lib/dizionario.ts`), il browser lo
scarica nel Web Worker del computer. Prima stava in D1, a secchi per lunghezza e
prime due lettere: con le parole di adesso il secchio piu' grosso sarebbe di
800 kB, e un'istruzione di D1 ne accetta cento. Tre cose che non si vedono:

- l'indirizzo porta l'impronta del file (`?v=`, in
  `shared/scarabeo-dizionario.ts`, che scrive `npm run dawg:build`), ed e' per
  questo che `_headers` lo tiene in cache per sempre;
- Cloudflare non comprime i file binari: il build ne scrive una copia gzip
  (`vite.config.ts`) che il browser apre con `DecompressionStream`, e il server
  legge quello intero, che non costa CPU ad aprire;
- a un indirizzo che non c'e' le Pages rispondono con la pagina dell'app, con un
  200: chi legge il file ne controlla la lunghezza (`BYTE_DIZIONARIO`) invece di
  scambiare l'HTML per un dizionario.

La tabella `dizionario` di D1 non la legge piu' nessuno. Resta perché una
versione di prima, rimessa in linea, ne avrebbe bisogno; se ne andra' con una
migrazione.

**Il dizionario ha due livelli, e il computer gioca solo le comuni.** Le comuni
sono le 272.000 parole di napolux, quelle su cui sono misurati i livelli
(`FASCE`); le altre — le forme del Wikizionario e del Wiktionary che napolux non
ha, e un milione e mezzo di enclitiche — valgono quando le gioca una persona. Il
livello sta nel DAWG, un bit sul finale e uno sulla strada, e `Dawg.comuni()` e'
il dizionario visto dal computer: il motore cerca le mosse come se ci fossero
solo le comuni. Senza, il computer farebbe punti con "portarglielo", e le medie
dei livelli — rimaste quelle nel passaggio al dizionario nuovo: 169, 245, 350 —
sposterebbero il riferimento della classificata.

**Le enclitiche si costruiscono, non si elencano.** Il regolamento della
federazione (articolo 22) ammette i pronomi attaccati all'infinito, al gerundio
e all'imperativo di ogni verbo, e nessun elenco li ha: `scripts/build-dizionario.mjs`
scrive le basi dalle coniugazioni del Wiktionary, `scripts/scarabeo/enclitiche.mjs`
ne fa le parole. I pronomi dell'oggetto (lo, la, glielo) solo per i verbi
transitivi; la consonante doppia per gli imperativi di una sillaba e per i
composti di fare, dare e dire (dammi, rifallo), mai con gli (dagli).

**Un nome proprio torna fra le parole solo se il Wikizionario italiano lo
conosce.** L'elenco dei nomi di napolux toglieva "sole", "luna", "stella",
"rosa", "re", "euro": era la prima ragione delle parole che lo Scarabeo "non
riconosceva". Il Wiktionary inglese non basta, perché ha anche le forme antiche:
con lui "piero" (da piare) e "matteo" (variante di matto) tornerebbero comuni, e
il computer le giocherebbe. Valgono, ma fra le altre.

**Gli schemi del cruciverba non si fanno nel Worker.** Riempire una griglia e'
una ricerca con ritorni all'indietro, e i 10 ms di CPU non bastano nemmeno a
costruire gli indici. Li genera `scripts/genera-cruciverba.mjs` — ogni notte il
workflow `cruciverba.yml` tiene pronti due mesi, il deploy ne controlla due
settimane — e li scrive in `cruciverba_schemi` con `INSERT OR IGNORE`: uno
schema scritto non cambia piu', come le parole del Wordle. L'unica cosa che si
corregge e' una definizione che il dizionario non ha piu', perché il filtro l'ha
scartata dopo: la stessa esecuzione la sostituisce con quella che sceglierebbe
adesso (`correggiDefinizioni`), da oggi in avanti e nella scorta dei liberi, con
un `UPDATE` condizionato alle definizioni lette. La griglia resta quella, e i
giorni passati come li si e' giocati. E' deterministico dal numero del giorno, e
il budget si conta in nodi e non in millisecondi, così una macchina piu' lenta
non cambia lo schema. Se la tabella non ha la giornata di oggi il gioco risponde
`SCHEMA_ASSENTE` (503) e la card dell'hub non mostra lo stato: in locale,
`npm run cruciverba:locale`.

**Le definizioni del cruciverba si scelgono, non si scrivono.** Vengono dal
Wikizionario (CC BY-SA, estrazione di kaikki.org) e
`scripts/cruciverba/definizioni.mjs` fa solo due cose: accorcia — la prima
proposizione, un taglio a una virgola o prima di un complemento — e **scarta**.
Via i rimandi, i segnaposto, i nomi propri generici, le glosse inglesi, ogni
definizione che contiene la risposta o la sua radice ("che regola" per
REGOLATORE, "cani" per CANE), e quelle con un buco: un articolo o una
preposizione articolata seguiti da una virgola o da un punto (`haUnBuco`). Il
Wikizionario scrive davvero "l'universalità dei, ovverosia, senza eccezione
alcuna, tutti i diritti ed oneri" per EREDITÀ, e nello schema sembrava un pezzo
perso dal gioco; le preposizioni semplici no, perché "composto da, o frequentato
da" e' italiano giusto. Le forme flesse prendono la definizione del loro lemma
**della stessa parte del discorso** con la nota "plurale": ORE e' il plurale del
nome "ora", non dell'avverbio "in questo momento", e la definizione del
Wikizionario di una forma flessa ("plurale di ala") darebbe la risposta. La
licenza chiede di citare la fonte: la citano le regole, e a partita chiusa ogni
definizione porta alla sua voce.

**Ogni casella del cruciverba sta in due parole.** E' la convenzione del
cruciverba italiano, e `disegnaSchema` la garantisce: nessun tratto bianco di
una casella sola, nere mai a quadrato. Le nere sono isolate, tranne una coppia
per lato che entra dal bordo: senza, la seconda riga non potrebbe averne
nessuna (lascerebbe sopra una lettera isolata) e ogni schema avrebbe quattro
parole da dieci lettere incrociate fra loro, che non si riempiono con parole
comuni — il primo generatore falliva il 99% degli schemi per questo. Il tetto
e' `TRATTO_MASSIMO = 8`.

**Il generatore copia tre cose del gioco, e i test le tengono d'accordo.** Gli
script girano in Node senza compilare TypeScript, quindi il PRNG, il calendario
(`scripts/cruciverba/giorno.mjs`) e il calcolo delle parole di uno schema sono
riscritti lì. Un test in `scripts/__tests__/cruciverba-generatore.test.ts`
verifica che diano gli stessi risultati di `shared/daily.ts` e
`shared/cruciverba.ts`: le chiavi delle definizioni salvate (`o12`, `v3`) sono
direzione piu' prima casella, e se i due calcoli divergessero le definizioni
finirebbero sulle parole sbagliate.

**La soluzione del cruciverba e le voci restano sul server finché non e'
finito.** `statoDa` manda lo schema con i punti al posto delle lettere, e la
`voce` di ogni definizione solo a partita chiusa: "Milano" accanto a "Città
dell'Italia settentrionale" sarebbe la risposta.

**Nel cruciverba il tempo non da' punti.** Cento a chi lo completa
senza aiuti, e ogni aiuto costa quel che da' (vedi sotto) — e ricontrollare lo
stesso errore non costa (`registraControllo`). La partita conta gli aiuti — le
svelate, gli errori (`errori`), i controlli (`controlli`, `controlli_schema`,
migrazione `0033`) — e non quel che costano: il costo lo applica `punteggio`,
una volta sola.
Il tempo e' lo spareggio in classifica: lo conta il browser a pagina visibile,
perché un cruciverba si fa a pezzi, e il server lo limita a quanto e' passato
davvero fra due scritture (`tempoDichiarato`).

**Le scritture del cruciverba passano da una coda.** La griglia si scrive in
locale e si salva dopo un attimo di pausa — una richiesta per tasto sarebbero
cento scritture a partita sulle centomila al giorno di D1 — e ogni scrittura
porta la `versione` restituita dalla precedente. Il server rifiuta quelle con
una versione vecchia (`CONFLITTO`), e il client rilegge lo stato: due
dispositivi aperti sulla stessa partita non si sovrascrivono un aiuto pagato.

**Gli schemi del sudoku si fanno la notte, e la difficoltà e' il ragionamento
che chiedono.** `scripts/genera-sudoku.ts` (il passo "Il sudoku" di
`cruciverba.yml`, e il deploy per le prossime due settimane) scrive in
`sudoku_schemi` con `INSERT OR IGNORE`: togliere caselle controllando che la
soluzione resti una sola costa qualche decimo di secondo per uno schema esperto,
troppo per il Worker. Lo schema e' deterministico dal numero del giorno
(`schemaDelGiorno`), il livello dal giorno della settimana — facile il lunedì e
il martedì, esperto la domenica — e se la giornata manca il gioco risponde
`SCHEMA_ASSENTE` (503): in locale, `npm run sudoku:locale`. Il livello non si
misura dalle cifre date ma **risolvendo come una persona** (`valuta`): la
tecnica piu' difficile che serve decide il gradino (`TECNICHE`), e solo fra i
due livelli di sole "singole" decidono le date (`livelloDi`). Uno schema che
chiede di tirare a indovinare non esce mai: `valuta` non ci arriva, e il
generatore lo scarta.

**Nel sudoku la soluzione resta sul server, e gli aiuti costano come nel
cruciverba.** Cento a chi lo risolve senza aiuti, e gli aiuti con la
regola del cruciverba (vedi sotto) — e ricontrollare la stessa cifra sbagliata
non costa (`segnalate` tiene la cifra, con lo stesso `registraControllo`).
Due cifre uguali che si vedono si segnano subito nel browser, perché si vedono
a occhio; se una cifra e' sbagliata lo sa solo il server. Le scritture passano
dalla stessa coda con la `versione` del cruciverba, e le note a matita
viaggiano con la griglia (243 cifre in base otto, `noteInTesto`): riaprendo da
un altro telefono ci sono.

**Un aiuto costa quel che da'.** Nel cruciverba e nel sudoku tutto si misura
sulla parte di una casella, il tetto diviso le caselle da trovare (`costiAiuti`
in `shared/aiuti.ts`): un punto e un quarto nel cruciverba, che ha una ottantina
di lettere, circa due nel sudoku, che ha da trovare fra quarantacinque e
cinquantanove cifre. Ogni aiuto costa le sue parti arrotondate al punto — una
casella svelata del cruciverba quattro punti, e non tre parti da un punto —
perché arrotondare la parte prima di moltiplicarla, con i tetti a cento, faceva
svelare un terzo dello schema lasciandone un quinto. Svelare una casella costa
tre parti, perché ne apre altre —
le parole incrociate, la riga, la colonna e il riquadro — e svelato un terzo
dello schema la giornata vale zero; un sesto ne lascia la meta'. Un controllo
costa una parte anche quando trova tutto giusto, perché "e' tutto giusto" e' una
risposta, e cinque parti se e' di tutto lo schema; ogni errore trovato un'altra
parte. Un controllo che non guarda niente — nessuna casella scritta fra quelle
controllate — non costa. Svelare si paga per ogni casella svelata, anche se era
gia' giusta (`caselleDaPagare`), e una gia' svelata non si ripaga: sapere che
era giusta e' un aiuto, e quando era gratis svelare faceva da controllo senza
costo — su una griglia piena, svelare tutto costava le sole caselle sbagliate,
meno di un controllo dello schema. Il foglio degli aiuti dice il conto della
parola intera, con quanto fa a lettera: scritto solo per lettera, il prezzo
della parola sembrava quello di una lettera sola. Prima, dopo un primo riordino,
una casella costava la sua parte e basta e un controllo solo gli errori, mezza
parte l'uno: due punti una lettera, uno un errore, e controllare tutto lo schema
costava quanto controllare una parola. Gli aiuti non si sentivano, e il
controllo dello schema era l'aiuto piu' conveniente di tutti. Ancora prima ogni
aiuto costava cinque punti e un errore due, in tutti e due i giochi. I costi che
dicono il foglio degli aiuti e le regole li conta il telefono dallo schema, con
le stesse funzioni del server (`costiCruciverba`, `costiSudoku`): nel sudoku
erano scritti nel telefono, tre punti e uno, e quando il server era passato a
cinque e due il foglio diceva ancora quelli di prima. Un test lo controlla.

**Il sudoku libero sta tutto nel telefono.** Lo schema lo genera un Web Worker
(`generatore.worker.ts`) con lo stesso generatore della classificata e un seme
a caso; partita e conti stanno nel `localStorage` (`src/games/sudoku/libera.ts`)
e non vanno al server — come le libere del quiz. La soluzione quindi c'e', e
controlli e svelate non costano niente: rendono pero' la partita `aiutata`, che
non fa record.

**La presenza e' un giro solo per tutta l'app.** `PresenzaProvider`
(`src/lib/presenza.tsx`) chiama `POST /api/presenza` ogni otto secondi a pagina
visibile: dice al server dove si trova il giocatore e riporta gli inviti a
giocare in compagnia il Wordle, il cruciverba e lo Scarabeo, le sfide a
battaglia navale, a quiz, a Indovina chi, ai tavolieri, allo Scarabeo, a Nomi,
cose e città, a Sequenze e alle libere da soli (rivincite comprese), gli inviti
a una stanza di Lupus o di Scarabocchi, le partite e il duello aperti. Gli
avvisi fuori dalle rotte (`CoopGate`, `BattagliaGate`, `QuizGate`,
`IndovinaGate`, `TavoloGate`, `NomiGate`, `SequenzeGate`, `SfideGate`,
`LupusGate`, `ScarabocchiGate`, `CompagniaGate`) si
danno la precedenza in quest'ordine: due insieme non si leggerebbero, e gli inviti del
cruciverba e dello Scarabeo, che valgono tutto il giorno, aspettano le sfide,
che scadono in pochi minuti. Prima gli inviti del Wordle avevano il loro
polling: due giri separati avrebbero raddoppiato le richieste, e le Pages
Functions gratuite ne contano centomila al giorno per tutto il sito. La
scrittura in `presenza` passa solo ogni venti secondi o al cambio di attivita'
(`segnaPresenza`), e a pagina nascosta il giro si ferma: un telefono in tasca
non e' "online" per chi vuole sfidarlo. Gli amici online invece non stanno nel
giro: `GET /api/amici` lo chiedono solo il profilo, le Libere e il profilo di un
amico, ogni `AMICI_POLL_MS` e mentre li si guarda.

**Nella battaglia navale la flotta dell'avversario non esce dal server.**
`vistaPer` manda la propria flotta, i colpi con il loro esito e le navi gia'
affondate; il resto solo a partita finita. Come nello Scarabeo la verita' sono
le mosse: `colpi` e' l'elenco delle caselle, chi ha sparato si ricava dal turno
(i pari sono di chi ha cominciato) e l'esito dalla flotta colpita. Ogni
scrittura e' condizionata alla `versione`, così un doppio tocco non spara due
volte nello stesso turno.

**Le regole della battaglia sono quelle italiane del gioco su carta**: navi
dritte che **non si toccano, nemmeno d'angolo**, un colpo a testa, il nome della
nave detto solo all'affondamento. Le navi hanno il loro articolo in `FLOTTA`
(`la`, `una`): due su cinque sono maschili, e "la cacciatorpediniere" e'
comparso davvero in un annuncio prima che ci fosse.

**Una sfida accettata apre la partita in un `batch`.** L'`INSERT` della
partita e' condizionato — sfida in attesa, non scaduta, nessuno dei due in
un'altra partita — e nello stesso batch la sfida passa ad accettata e le altre
dei due si annullano: due accettazioni ravvicinate non aprono due partite. Una
partita ferma da mezz'ora (`BATTAGLIA_ABBANDONATA_MS`) smette di tenere
occupati i due giocatori, altrimenti chi chiude l'app a meta' non potrebbe piu'
essere sfidato. Chi resta ad aspettare puo' chiedere la vittoria a tavolino
dopo tre minuti senza colpi, o cinque senza flotta.

**Ogni classificata vale cento, e la generale e' la somma.** Prima una
giornata di Wordle valeva fino a 209 punti e una di Scarabeo qualche centinaio,
e sommarle avrebbe voluto un tasso di cambio inventato. Adesso ogni gioco misura
quel che gli e' proprio dentro un tetto deciso (`TETTI` in `shared/punti.ts`,
che ha la tabella di tutti), e il tetto e' cento per tutti: sono undici, e
fanno millecento, e un test lo tiene. La storia e' andata avanti e indietro.
All'inizio valevano tutte cento; poi i tetti hanno seguito il tempo che una
giornata chiede — il cruciverba 160, lo Scarabeo e il sudoku 150, il quiz 75, il
Wordle 70, la Ghigliottina e la Catena 64, Nomi, cose e città, gli Anagrammi e il
Paroliere 60, il tris e le Sequenze 50 —, e in pratica in alcuni giochi si
guadagnava troppo e in altri troppo poco: chi faceva il cruciverba prendeva
quanto chi faceva tre giochi brevi. L'8 ottobre 2026 si e' tornati a cento per
tutti, e il tris e la battaglia navale (vedi sotto) non sono piu' classificate.
Le giornate giocate con i tetti di prima restano come sono, perché i punti si
salvano a fine partita e non si ricalcolano. Il Wordle misura i tentativi, lo
Scarabeo il punteggio in rapporto al computer, il cruciverba e il sudoku gli
aiuti, il quiz le risposte giuste (venti per aver giocato, otto per ogni
giusta), Nomi, cose e città le risposte valide, di piu' quelle date da pochi,
gli Anagrammi le parole trovate, di piu' quelle trovate presto, le Sequenze le
sequenze ripetute giuste, il Paroliere i punti delle parole rispetto al
traguardo della griglia, la Ghigliottina e la Catena il montepremi che resta.
Tutti tengono il principio del Wordle — **giocarla bene
vale circa il doppio di giocarla male**, non dieci volte tanto — tranne la
Ghigliottina e la Catena, di proposito (vedi sotto), e
`shared/__tests__/punti.test.ts` verifica i tetti e i due lati del compromesso
per ogni gioco. La classifica di ogni gioco resta (`/leaderboard`,
`/leaderboard/scarabeo`, ...), la generale e' `/leaderboard/generale`, e
`/leaderboard/panoramica` le da' tutte in una richiesta, i primi tre di ognuna e
dove sei tu: e' la schermata `/classifica`, che le mette una sotto l'altra, e
ognuna si apre per intero (`/classifica/generale`, `/classifica/wordle`). Non si
normalizza per giornata ("il migliore prende tutto il tetto"): cambierebbe le
classifiche di ieri ogni volta che qualcuno gioca. Alla generale si aggiungono
solo i giochi della Fortuna, che non sono classificate (vedi sotto), con un
tratto loro nella barra di ogni giocatore; e la Fortuna ha una classifica sua
(`/classifica/fortuna`, `classificaFortuna`), che mette in fila quel che i tre
giochi hanno dato o tolto nel periodo: si va sotto zero, e a pari conto passa
avanti chi ha giocato meno.

**La Fortuna e' una scheda, e i suoi giochi puntano un saldo solo.**
Crazy Time, la slot, il blackjack e la roulette stanno nella scheda Fortuna (`/fortuna`, il
quadrifoglio), con il saldo di oggi in cima: i punti delle classificate piu'
quel che i giochi della Fortuna hanno dato o tolto oggi (`saldoDi` in
`server/lib/fortuna.ts`). Quel che si vince a un gioco si punta all'altro. Ogni
gioco controlla il saldo dentro la sua scrittura con lo stesso pezzo di SQL
(`nettoFortunaSql`), sui conti di tutti: Crazy Time ha il suo `ruota_giornate`,
gli altri `fortuna_giornate`, una riga per giocatore, giorno e gioco, riscritta
nel batch di ogni giocata. Quella tabella non ha un `CHECK` sul gioco: aveva
la slot e il blackjack, e la `0045` l'ha rifatta senza per la roulette, cosi'
il prossimo gioco della Fortuna ci scrive e basta.
Crazy Time e' rimasto nelle sue tabelle perché spostarne i conti avrebbe voluto
copiare i giorni passati, e nei minuti del deploy il codice di prima avrebbe
scritto dove il nuovo non leggeva. La generale li somma tutti e li tiene ognuno
nella sua colonna (`GeneraleRow.ruota`, `slot`, `blackjack`, `roulette`); la scheda ha la
sua richiesta (`/api/fortuna`), e le Giornaliere non mostrano Crazy Time.

**Nei giochi della Fortuna si vedono il saldo e la puntata, e basta.** Il
tabellone in cima a ogni gioco (`Tabellone` in `src/games/fortuna/`) ha due
voci, il saldo di adesso e la puntata in gioco o scelta; la scheda della
Fortuna ha il saldo grande, senza scomporlo. Quel che si e' vinto o perso oggi,
e da quanto si e' partiti — i punti delle classificate — non si dicono, per
scelta: al tavolo si guarda quel che si ha davanti. Le carte della scheda
dicono quanto si puo' puntare, non com'e' andata. Il momento di un giro invece
si vede tutto — l'adesivo con la vincita, il display, le targhe e la festa della
slot, il mozzo e le feste della ruota, le fasce sulle mani del blackjack —
perché e' il gioco. Il conto della giornata resta nella classifica della
Fortuna, che e' il posto dove si va a guardarlo.

**Crazy Time punta i punti delle classificate, quante volte si vuole.** Sta
nella scheda della Fortuna (`/crazy-time`; `/ruota`, l'indirizzo di quando si
girava una volta al giorno, ci porta): si punta da `PUNTATA_MINIMA` a tutto il
saldo della Fortuna, e si rigira. Quel che da' o toglie entra nella generale
del giorno, in una colonna sua (`GeneraleRow.ruota`, gia' dentro `punti`). Si
perde al massimo la puntata e si punta al massimo il saldo, quindi il totale
del giorno non va mai sotto zero, e i giorni passati non si toccano. Il nome e'
quello del gioco vero, e cosi' le probabilita' (vedi sotto): il marchio e' di
Evolution, e per un gioco fra amici e senza soldi va bene, ma se l'app
diventasse pubblica il nome andrebbe cambiato.

**I giri stanno in `ruota_giocate`, e la generale legge `ruota_giornate`.** Un
giro per riga, numerato nella giornata di ogni giocatore (`n`, nella chiave
primaria: due giri partiti insieme non prendono lo stesso numero). Il saldo si
controlla nell'`INSERT` stesso (un `INSERT OR IGNORE … SELECT … WHERE` che
somma alle classificate i conti della Fortuna, `nettoFortunaSql`): due giri
nello stesso istante, sul saldo letto prima, punterebbero due volte gli stessi
punti. Nello stesso `batch` `riconta` riscrive `ruota_giornate` dalla somma dei
giri, una riga per giocatore e per giorno: e' quella che legge la classifica
generale, che altrimenti sommerebbe tutti i giri di tutti a ogni richiesta. I
punti delle classificate di un giocatore solo li conta `puntiClassificateDi`
(`server/lib/generale.ts`) con le stesse espressioni della generale, e un test
verifica che diano lo stesso numero: se si tocca il conto di un gioco nella
generale, va toccato anche li'. Fra due giri passano almeno
`INTERVALLO_GIRI_MS` (429, `TROPPO_PRESTO`): una ruota lanciata impiega piu' di
tre secondi a fermarsi, e un programma che gira a raffica consumerebbe le
richieste di tutti. `ruota_giri`, la tabella della ruota di una volta al
giorno, non la legge piu' nessuno: la migrazione `0024` ne ha copiato i giri,
con `spicchio` NULL perché la disposizione era un'altra, e non l'ha tolta,
perché una migrazione che cancella vorrebbe un backup.

**Vince il banco, come nel Crazy Time vero, e i test lo tengono fermo.**
Venti spicchi (`SPICCHI_RUOTA` in `shared/ruota.ts`), non i cinquantaquattro
della ruota vera: cinque BANCO, sei SPLIT, tre QUIZ, due MONETA, il triplo, la
FORTUNA, il PACHINKO e il CASH HUNT. Il triplo sta in cima, dove la ruota e'
ferma prima del primo giro, e la fortuna di fronte. I nove spicchi speciali
stanno ognuno fra due semplici, un banco o uno split, mai due banchi o due
split vicini, i quiz ad almeno sei spicchi l'uno dall'altro e le due monete una
di fronte all'altra: sulla ruota di prima i quiz stavano tutti da una parte e
le monete tutte dall'altra, e i banchi erano sette su quindici. La puntata si
paga al lancio — il giro nasce con `delta = -puntata` — e quel che esce la
restituisce moltiplicata (`vincitaDi`, per difetto). Il triplo la restituisce
per tre e lo split a meta', subito, senza minigioco (`pagaSubito`); il quiz
porta alla ruota del quiz e poi alla domanda, e una risposta sbagliata perde
tutta la puntata, qualunque sia il moltiplicatore; la moneta porta uno dei
quattro moltiplicatori di `MOLTIPLICATORI_MONETA`, deciso con il giro, che il
blu paga e il rosso no; il Pachinko e il Cash Hunt hanno i loro (vedi sotto);
la fortuna fa girare la ruota fortunata. Nessun esito ridà la puntata com'era,
che sarebbe il banco con un altro nome: un premio la restituisce con qualcosa
in piu', lo split e il ×0,5 dei minigiochi con la meta' in meno. Chi risponde
sempre giusto riceve in media il 97,12% di quel che punta (`resa`), quanto alla
roulette e come la slot e il blackjack; chi risponde giusto a tre domande su
quattro l'89%, a una su due l'81%, chi tira a indovinare il 74%: nemmeno chi sa
tutto batte il banco, come nel Crazy Time vero (dal 94 al 96%). La resa si
conta dagli spicchi (`valoreDi`: lo split vale la meta', la moneta e' blu una
volta su due, il Pachinko pesa ogni buca per le strade che ci portano, il Cash
Hunt vale la media del muro, la fortuna la media della ruota fortunata), quindi
segue da sola ogni spicchio e ogni moltiplicatore, e
`shared/__tests__/ruota.test.ts` la tiene ferma: rifatta a mano, fra il 96,8 e
il 97,4% per chi sa, sotto la puntata per tutti, e in punti interi a ogni
puntata fino a duemila. Lo stesso file tiene le disposizioni delle ruote e i
conti dei minigiochi. Si puo' avere fortuna una volta, e giocando a lungo si
perde: e' quel che si vuole, perché la ruota insegni che vince il banco. Le
regole lo dicono in una riga, con la resa, e niente scritte sulla ludopatia:
e' una scelta, la lezione la da' la ruota.

**Lo split e' una perdita vestita da vincita, di proposito.** Sei spicchi su
venti restituiscono subito meta' della puntata, per difetto, e si raccontano
come una vincita: le luci della festa, l'adesivo d'oro "Split" con la moneta
tagliata, il suo suono (`split`), un po' di monete che tornano al saldo, che
sale quando arrivano, e "+5 vinti" sul mozzo, che dice quel che e' tornato e
non il conto del giro. E' la ciliegia sola della slot (vedi sotto), le "losses
disguised as wins" delle slot vere: chi gioca la ricorda come una vincita, ed e'
quel che tiene incollati. Il saldo non mente: era sceso della puntata al lancio,
e risale della meta'; il travestimento sta solo nel racconto. Lo stesso vale
per il ×0,5 del Pachinko e del Cash Hunt. Sulla ruota fortunata lo split
diventa ×1,5, un premio vero, e resta rosa: si vede che cosa ha portato la
fortuna.

**Il giro salva la disposizione delle ruote** (`disposizione`,
`DISPOSIZIONE_RUOTA`): i giri di una disposizione di prima contano nel saldo e
non si mostrano, perché lo stesso indice adesso e' un altro spicchio, e una loro
sfida rimasta aperta non si gioca piu' (`NESSUN_GIRO`): la chiude il giro dopo,
con il `delta` che aveva gia', cioe' persa. La 5 e' quella dei venti spicchi,
con lo split, il Pachinko e il Cash Hunt, e vale per le ruote e per i
minigiochi: chi cambia uno spicchio, la ruota fortunata, un moltiplicatore del
quiz, una buca o una casella la deve far salire. Come la 3 e la 4 non ha voluto
una migrazione: il minigioco sta nel giro in JSON (`sfida`), e i campi nuovi,
la strada della pallina, il muro e la casella scelta, ci stanno senza toccare
la tabella. La `0025`, che ha portato la 2, aveva chiuso come perse le sfide
rimaste aperte.

**La fortuna gira la ruota fortunata: gli stessi spicchi, con i premi saliti.**
`SPICCHI_FORTUNATI` ha i venti posti della ruota: il triplo diventa ×10 e la
fortuna ×5; dei cinque banchi due restano, i due accanto al Pachinko e al Cash
Hunt diventano ×3 e l'ultimo un quiz, e due quiz o due banchi non si toccano
mai; ogni split diventa ×1,5. Il quiz, la moneta, il Pachinko e il Cash Hunt
restano dove sono, ma portano i moltiplicatori della fortuna. Quelli del quiz
salgono ognuno di un gradino (`FORTUNATO`: ×1,25 a ×1,5, ×1,5 a ×2, ×1,75 a
×2,5, ×2 a ×3, ×3 a ×5, ×4 a ×10), la moneta paga ×2, ×3, ×4 o ×5
(`MOLTIPLICATORI_MONETA_FORTUNATA`), e nelle buche e nelle caselle il ×0,5
diventa ×1,5 e ogni altro raddoppia, fino al ×30 del Pachinko e al ×10 del Cash
Hunt. Non e' un giro nuovo: e' lo stesso giro, con la stessa puntata. La
fortuna lascia il giro in `sfida`, e `/ruota/fortuna` pesca lo spicchio
fortunato e lo scrive nella sfida (`fortunata`); un premio o il banco chiudono
il giro, i minigiochi lo portano avanti con i moltiplicatori della fortuna. Si
gira una volta: richiederla ridà quel che e' uscito, e l'`UPDATE` e'
condizionato alla sfida appena letta, così due tocchi insieme non la girano due
volte. Una pagina riaperta la ritrova da girare. A chi sa tutto la ruota
fortunata restituisce in media 2,62 volte la puntata: meno del triplo, che e'
l'unico premio sicuro, e un test lo tiene.

**Il Pachinko: una pallina, otto file di pioli, nove buche.** La pallina cade
dal mezzo, e a ogni fila va a sinistra o a destra una volta su due: la buca e'
quante volte e' andata a destra (`bucaDi`), quindi le strade sono quelle del
triangolo di Tartaglia, 1, 8, 28, 56, 70, 56, 28, 8 e 1 su 256
(`STRADE_PACHINKO`). Le buche da sinistra pagano ×15, ×4, ×2, ×1,5, ×0,5, ×1,5,
×2, ×4 e ×15 (`MOLTIPLICATORI_PACHINKO`): in mezzo la piu' facile e la piu'
povera, ai lati le piu' rare e le piu' ricche, in media 409/256 della puntata;
dalla fortuna ×30, ×8, ×4, ×3 e ×1,5, in media 853/256. Nessuna buca ridà la
puntata com'era. La strada la pesca il server quando si lancia
(`/ruota/pachinko`, otto volte `aCaso(2)`), la scrive nel giro e lo chiude
nello stesso `UPDATE` condizionato, con `riconta`, come la moneta: prima del
lancio non esiste da nessuna parte, e chiederlo ancora ridà la strada di prima.
Il tabellone (`Pachinko` in `src/games/ruota/`) fa cadere la pallina lungo
quella strada, piolo dopo piolo, con due animazioni dello stesso tempo: di lato
dritta da un piolo all'altro, in alto e in basso con il rimbalzo e la ricaduta,
così l'arco e' quello di una cosa che cade. Ogni piolo toccato si accende e
suona, un po' piu' alto del precedente (`pallina`); poi la buca si accende, e
arriva l'adesivo, o la festa dal ×5. Si lancia con il bottone del pannello o
toccando il tabellone. Dalla fortuna il tabellone arriva con le buche di
sempre, e salgono come la ruota del quiz, i due ×15 per ultimi, contando fino
al ×30 di tre in tre; solo dopo si lancia.

**Il Cash Hunt: dodici caselle coperte e mescolate, e se ne sceglie una.** Il
muro ha ×0,5 cinque volte, ×1,5 tre, ×2 due, ×3 e ×5 una (`MURO_CASH_HUNT`,
in media 19/12 della puntata); dalla fortuna ×1,5, ×3, ×4, ×6 e ×10, in media
3,375. Quando la ruota ci si ferma il server mescola il muro (`mescolaMuro`,
con `aCaso`) e lo salva nel giro; chi gioca ne riceve solo i valori, dal piu'
grande, e i posti mai prima di aver scelto: chiunque potrebbe leggere dov'e' il
×5. `/ruota/cashhunt` con la casella chiude il giro con il moltiplicatore che
c'e' sotto, e da li' il muro intero si vede; un'altra scelta ridà la prima, e
una casella che non c'e' e' un 400. Il muro (`CashHunt`) si vede scoperto, poi
le caselle si girano, ognuna con il suo simbolo, e si mescolano in tre giri: la
mescolata si vede soltanto, il muro vero l'ha gia' mescolato il server.
Toccata una casella, si gira e si fa grande, poi si girano le altre a onde, e
si vede che cosa c'era. Le caselle sono bottoni con il nome del simbolo, e le
frecce passano dall'una all'altra; sul telefono in piedi il muro ha tre
colonne, di traverso quattro. Dalla fortuna il muro arriva scoperto con i
valori di sempre, che salgono prima di coprirsi, il ×5 per ultimo fino al ×10.

**La ruota del quiz ha dodici categorie, e le pesca il server a ogni giro.**
Quando la ruota si ferma sul quiz il server sceglie le categorie dei dodici
spicchi (`categorieDelQuiz`) fra le quattordici di `CATEGORIE_RUOTA` — sette di
geografia e sette delle altre materie — che quel giocatore oggi non ha ancora
finito (`categorieDisponibili`): dodici a caso, tutte diverse; se ne restano
meno si ripetono, ognuna lo stesso numero di volte o quasi, e se sono almeno due
mai due uguali vicine; se non ne resta nessuna il quiz non esce, ne' sulla ruota
ne' su quella fortunata. I moltiplicatori invece stanno fermi
(`MOLTIPLICATORI_QUIZ`, dal ×4 in cima: ×1,25 tre volte, ×1,5 tre, ×1,75 due, ×2
due, ×3 e ×4 una, in media 1,9), e le categorie fanno un giro a caso, così la
prima pescata non finisce sempre sul ×4. La si gira con `/ruota/quiz`, e lo
spicchio decide insieme la categoria della domanda e il moltiplicatore. Le
categorie stanno nel giro: una pagina riaperta ritrova la stessa ruota. "Accadde
oggi" non c'e', perché il file di un giorno da' fra le tredici e le venti
domande e una categoria della ruota ne vuole trenta; non ci sono le città, che
sono solo della libera, ne' la cartina, perché alla ruota si risponde a scelta.
Le sei categorie del giorno (`categorieDelGiorno`: tre per gruppo, mai quelle
del giorno prima, una catena dal primo giorno uguale per tutti) erano gli
spicchi delle domande della ruota di prima, e restano quelle dei punti di
domanda della slot.

**L'esito lo decide il server, e una sfida lasciata a meta' e' persa.** Lo
spicchio si pesca con `crypto.getRandomValues` (con lo scarto, perché il resto
di una divisione favorirebbe i primi), e il browser fa solo girare le ruote fin
li': il lancio col dito chiede `/ruota/gira`, e la risposta ha gia' l'esito, con
il moltiplicatore della moneta, le categorie della ruota del quiz e il muro del
Cash Hunt, che resta sul server. Cosi' anche la ruota fortunata
(`/ruota/fortuna`) e quella del quiz (`/ruota/quiz`), che a una seconda
richiesta ridanno lo stesso spicchio, la moneta, con il lato a `/moneta`, che
non porta niente, e la pallina del Pachinko, con la strada a `/pachinko`. La
puntata e' persa dal lancio: chi chiude la pagina davanti a una domanda
difficile, a una pallina o a un muro non si salva, e il giro dopo li chiude
cosi' come sono. `/domanda` vuole la ruota del quiz girata (`RUOTA_QUIZ`, 409),
e la domanda e' quella del quiz, con le stesse regole del tempo: `/domanda`
scrive `aperta_at`, la risposta vale entro il limite piu' `MARGINE_RETE_MS`, e
una domanda rimasta aperta la chiude la prima `GET`. Ogni scrittura e'
condizionata allo stato appena letto.

**Le domande di Crazy Time si fanno la notte, con quelle del quiz.**
`scripts/genera-quiz.ts` scrive in `ruota_domande` trenta domande per ognuna
delle quattordici categorie, ogni giorno (`DOMANDE_PER_CATEGORIA`), fra le voci
note, lontane dai soggetti della classificata dello stesso giorno e da quelli
della stessa categoria dei giorni prima. Ogni categoria esce tutti i giorni,
quindi ricordarne tre (`MEMORIA_RUOTA`) vuol dire evitare novanta soggetti prima
di trovarne trenta nuovi, e le categorie con pochi soggetti noti ricordano meno
giorni (`MEMORIA_CORTA`). Misurato su centoventi giorni: i mari con tre giorni
restavano sotto le trenta domande due giorni su tre, i laghi e gli stati
ripetevano comunque, gli oceani anche con due, e la scienza, ottanta soggetti
divisi fra i tipi di domanda, ripete con qualunque memoria; con quei giorni ogni
categoria fa le sue trenta senza ripetere quel che ricorda. La colonna si chiama
ancora `materia`, e porta la categoria: il deploy scrive le domande prima di
pubblicare la pagina, e con una colonna rinominata il codice di prima si sarebbe
rotto in quei minuti. Come le giornate del quiz, una giornata scritta non
cambia, tranne le righe di un formato vecchio (`FORMATO_DOMANDE_RUOTA`), che si
rifanno anche per oggi: il 3 aveva le sei categorie del giorno, il 4 le ha
tutte, il 5 ha le domande piu' facili del quiz (il campo dei Nobel, il gruppo
degli animali). Rifarle non fa rivedere niente a nessuno, perché chi gira non
rivede una domanda lo stesso giorno e la riconosce dall'impronta
(`improntaDomanda`, il testo e la risposta, salvata nel giro con la categoria),
non dal posto nell'elenco; una categoria di cui ha visto tutto non gli esce piu'
fino a domani. `--se-manca` guarda anche queste righe, e il formato, quindi il
deploy le crea per i giorni che non le hanno.

**La ruota si gira col dito, e si disegna una volta.** `RuotaFisica`
(`src/games/ruota/`) e' la ruota grande e quella del quiz: la si prende, la si
trascina attorno al centro e la si lascia, e parte con la velocita' degli ultimi
movimenti del dito (`FINESTRA_MS`). Sotto `LANCIO_MINIMO`, o con il dito fermo
prima di lasciarla, non parte, e la pagina chiede di lanciarla piu' forte. Al
lancio chiede l'esito e intanto gira libera, rallentando appena; quando l'esito
arriva frena fino allo spicchio con `1 - (1 - t)^3`, una curva che comincia
proprio alla velocita' che aveva — niente scatti — e aggiunge i giri interi che
servono a durare almeno `durataMinima`. Si ferma dentro lo spicchio ma mai sul
filo. Gli spicchi sono un disegno fermo (`DisegnoRuota`, che non cambia mai, e
`DisegnoQuiz`, che cambia con le categorie del giro, in `memo`), e a ogni
fotogramma si scrive la rotazione sul gruppo che lo contiene: passare dallo
stato di React ridisegnerebbe gli spicchi sessanta volte al secondo. La ruota
fortunata sta nello stesso disegno: ogni spicchio che cambia ha le due facce,
una sopra l'altra, disegnate con l'asse in alto e poi girate al loro posto, e
quale si vede lo decide la classe della ruota (`is-fortunata`); allo stesso modo
i moltiplicatori della fortuna stanno sotto quelli della ruota del quiz. Lo
scambio e' tutto nel CSS (`scaleX`, con `transform-box: fill-box` e il ritardo
di ogni spicchio nel suo stile): la ruota non si ridisegna. La lancetta scatta a
ogni piolo, dalla parte in cui la spinge la ruota, con il suono del tocco tenuto
a uno ogni 45 ms (a ruota veloce sarebbe un ronzio). Le scritte vanno lungo il
raggio, dal bordo verso il mozzo (`scrittaRadiale` in `geometria.ts`), come nel
Crazy Time vero: si leggono quando lo spicchio e' sotto la lancetta, e le parole
lunghe si stringono (`textLength`) invece di uscire dallo spicchio; sulla ruota
del quiz il nome della categoria corre accanto al moltiplicatore (`scarto`). Le
icone restano dritte, e i numeri dei premi della ruota grande con loro: sono
quel che si guarda. Lo split ha la moneta tagliata in due (`IconaSplit`), il
quiz il fumetto con il punto di domanda (`IconaQuiz`), il Pachinko la pallina
sui pioli, il Cash Hunt il mirino, la fortuna il quadrifoglio. Le facce della
ruota grande si misurano in `misureDi`, e non nel disegno: le icone tutte nello
stesso quadrato verso il bordo, e sotto, con uno stacco, la scritta, della
stessa dimensione per tutti gli spicchi con l'icona; il banco dal bordo al
mozzo; i premi il numero dritto, grande quanto sta nella larghezza dello
spicchio, e sotto il nome, se ce l'hanno (il ×1,5 della fortuna no). La
larghezza di una scritta si stima lettera per lettera e per eccesso
(`larghezzaStimata`): con la stima di prima, per difetto, la scritta della
fortuna non si stringeva e finiva sotto il quadrifoglio. Un test
(`src/games/ruota/__tests__/geometria.test.ts`) controlla che l'icona e la
scritta non si tocchino, che l'icona stia nella larghezza dello spicchio dove
sta e la scritta in quella dove finisce, verso il mozzo. La meta che c'e'
quando la ruota compare e' dove sta gia' ferma, quindi tornando da un minigioco
la ruota non rigira: sta sullo spicchio uscito, con l'esito sul mozzo. Ogni
chiave nuova e' un giro, anche sullo stesso spicchio. Con la tastiera si lancia
con Invio o lo spazio, e senza animazioni la ruota va subito dove deve. La
domanda arriva a parte con la carta, le risposte e la cartina del quiz
(`DomandaRuota`), che servono solo quando si arriva a una domanda.

**La fortuna trasforma la ruota sul posto.** Quando la ruota si ferma sulla
fortuna il quadrifoglio salta fuori dal mozzo (`ColpoDiFortuna`, `COLPO_MS`),
passa l'insegna della ruota fortunata, e il palco si fa verde; poi la ruota
diventa quella fortunata dov'e', senza sparire: due ondate partono dalla
fortuna, sotto la lancetta, girano gli spicchi uno dopo l'altro, una per parte,
e si incontrano sul triplo, che sale per ultimo da ×3 a ×10, un intero alla
volta. Lo stesso conto sale in grande sopra il mozzo (`PremioCheSale`), perché
sulla ruota il ×10 e' piccolo e magari a testa in giu'. I tempi stanno in
`magia.ts`, e la pagina fa partire i suoni con gli stessi numeri — `sale` a ogni
spicchio, `incasso` a ogni passo del conto, `magia` all'ultimo — cosi' si sente
quel che si vede. Dalla ruota fortunata al quiz, la ruota del quiz arriva con i
moltiplicatori di sempre, e solo dopo salgono, uno dopo l'altro dal piu'
piccolo, con il ×4 che conta fino al ×10: si vede che cosa ha portato la
fortuna. Lo stesso fanno le buche del Pachinko e le caselle del Cash Hunt, con
la stessa magia (`aumento` in `magia.ts`). I numeri di un conto stanno uno sopra
l'altro e il CSS ne accende uno alla volta: si spengono con una dissolvenza
negli ultimi millesimi del loro passo e non con un salto (`steps`), perché alla
fine di un'animazione Chrome calcola il progresso come 0,9999999999999984, e un
salto restava acceso — sulla medaglia e sul triplo si leggevano ×4, ×7 e ×10
insieme; e l'ultimo arriva con `forwards`, perché con `both` il suo primo
fotogramma, grande, copriva tutto il conto. Un test
(`ruota/__tests__/conto.test.ts`) li tiene. Il nastro (`NastroFortuna`) dice
"Ruota fortunata", "Quiz fortunato", "Moneta fortunata", "Pachinko fortunato"
o "Cash Hunt fortunato" finché la fortuna dura, e dopo l'esito la ruota torna
quella di sempre. Al neon, sui palchi alti, il carattere si stringe quanto
serve a starci, dalla lunghezza stimata della scritta (`--nastro-em`): gli
ultimi due, alla misura di "Ruota fortunata", uscivano dai lati del palco. Sui
palchi bassi il nastro sta in un angolo, e davanti al Pachinko e al Cash Hunt
non c'e' (`is-tabellone`): arrivano fino all'angolo, e copriva il ×5 del muro.
Senza animazioni la ruota diventa fortunata di colpo, con il suono della
magia; una pagina riaperta a fortuna in corso la trova gia' fortunata.

**Dal triplo c'e' la festa.** `FestaRuota` (`src/games/ruota/Festa.tsx`) prende
lo schermo come la festa della slot: la sala si spegne, girano i raggi,
l'insegna con le lampadine porta il moltiplicatore enorme, d'oro e con lo
spessore, e la vincita conta da zero con le monete che tintinnano sempre piu'
alte. Tre gradini (`festaDi`): dal triplo; dal ×5, con i raggi che girano anche
al contrario, la pioggia di monete e l'onda d'urto; dal ×10, il decuplo della
ruota fortunata e i ×15 e ×30 del Pachinko, con il terremoto, i fuochi
d'artificio e una seconda onda. L'insegna dice il nome del moltiplicatore, o
quante volte, se un nome non ce l'ha (`nomeDellaFesta`: "15 VOLTE"). Quel che
viene dalla fortuna ha il verde e l'oro, e i quadrifogli che volano con le
monete. I premi fissi dal triplo in su hanno sempre la festa, il ×1,5 della
fortuna l'adesivo; una moneta, una domanda, una buca o una casella vinta solo
dal ×5 (`FESTA_MINIGIOCO`): il ×3 della moneta esce una moneta su otto, e una
festa cosi' frequente smetterebbe di dire qualcosa. Sotto, l'adesivo d'oro e la
pioggia di monete. Monete, quadrifogli e fuochi sono un canvas con un seme fisso
per gradino, come nella slot. Un tocco finisce il conto, un altro chiude, e
finita la festa le monete vanno al saldo.

**Crazy Time si gioca di fila, e ogni passaggio ha la sua scena.** Il palco e'
scuro in tutti e due i temi, come una sala, e tiene cinque scene una sopra
l'altra — la ruota, la ruota del quiz, la moneta, il Pachinko e il Cash Hunt —
mentre la domanda prende la pagina intera, come nel quiz; la ruota fortunata
non e' una scena, e' la ruota stessa. Una pagina riaperta davanti a un
Pachinko o a un Cash Hunt li riprende senza preamboli (`ripresa`): la pallina
pronta, o le caselle gia' coperte da scegliere.
Fra una scena e l'altra passa un intermezzo (`Intermezzo`: raggi, un lampo e
l'insegna del minigioco; la scena cambia sotto l'insegna), e le lampadine della
cornice dicono il momento: a turno in attesa, una corsa mentre gira, a raffica
su un minigioco, un lampo rosso al banco, verdi sulla ruota fortunata. Quando la
ruota del quiz si ferma, la categoria e il moltiplicatore saltano fuori
(`Rivelazione`), e poi arriva la domanda. La moneta si lancia toccandola. Mentre
e' in aria il tabellone resta com'era (`conto`) e il lato si dice quando cade:
la risposta del server arriva prima, e sarebbe la soluzione. Una vincita ha
l'adesivo d'oro e la pioggia di monete, o la festa, il banco l'adesivo bordato e
un sussulto del palco. Dopo un giro il pannello torna alla puntata, che resta
quella di prima finché non la si cambia, come al tavolo. Il tabellone in cima
dice il saldo e la puntata; nella scheda della Fortuna la carta dice quanto si
puo' puntare, o dove aspetta una sfida aperta ("Ruota fortunata", "Quiz",
"Moneta", "Pachinko", "Cash Hunt"), e non ha l'anello, perché Crazy Time non
finisce: c'e' solo finché mancano i punti per la prima puntata. La ruota si
riprende in mano `INTERVALLO_GIRI_MS` dopo il lancio: senza animazioni si
fermerebbe subito, e il server direbbe di no.

**La puntata e la vincita si vedono andare e venire.** Al lancio una pila di
fiches vola dal saldo al mozzo, che diventa una fiche "in gioco", e il saldo
scende subito della puntata: e' quel che succede davvero, perché il giro nasce
con la puntata gia' tolta. Alla ruota fortunata la fiche e' gia' sul mozzo, e il
saldo non si muove. Quando la ruota si ferma una vincita torna al saldo in
monete — dal mozzo, dalla moneta caduta sul blu, dalla buca della pallina o
dalla casella scelta — e il saldo sale quando arriva la prima; anche la meta'
dello split torna cosi', in poche monete. Al banco le fiches cadono dal mozzo,
e il mozzo dice quanto si e' vinto o perso. Fino ad allora il tabellone resta
su quel che si e' visto (`conto`), poi un lampo d'oro o rosso accompagna il
conto nuovo. Una domanda vinta o persa si racconta cosi' tornando alla ruota
(`RITORNO_MS`). I voli sono elementi del body animati con le Web Animations
(`src/games/fortuna/voli.ts`, che usa anche la slot), sotto gli adesivi, che
dicono il momento: passare dallo stato di React ridisegnerebbe la pagina a ogni
fotogramma. Durante la domanda la pagina della ruota resta montata e nascosta
(`hidden`): rimontarla farebbe ricontare il tabellone da zero e ridisegnare le
ruote. Ogni risposta del server passa da `aggiorna`, che scrive subito lo stato
nuovo anche in `ultimo`: senza animazioni la ruota e la moneta si fermano
dentro il loro effetto, che React fa girare prima di quello della pagina, e
leggerebbero il giro di prima, come i rulli della slot (vedi sotto).

**La slot rende come Crazy Time, e fa vincere come le slot vere.** Tre rulli di
quaranta fermate, tre righe in vista e una linea (`shared/slot.ts`). Sulla linea
pagano tre uguali (`PREMI`, dal ×5 dei limoni al ×300 dei sette) e le ciliegie
dovunque stiano (`CILIEGIE`): una ridà la puntata, due la pagano cinque volte,
tre venti. Il punto di domanda vale dovunque nella finestra, come gli scatter
delle slot vere: tre in vista, uno per rullo, aprono una domanda che giusta paga
`VINCITA_DOMANDA` volte la puntata, e su un rullo stanno ad almeno tre fermate
l'uno dall'altro, quindi se ne vede uno alla volta. Le frequenze vengono dai PAR
sheet, i fogli che i costruttori danno ai casinò (Harrigan e Dixon, "PAR Sheets,
probabilities, and slot machine play", Journal of Gambling Issues 23, 2009). Si
vince qualcosa un giro ogni tre, come il 33,5% di Lobstermania a quindici linee,
e tre vincite su quattro sono una ciliegia sola, che ridà la puntata: le vincite
che non sono vincite, che nelle slot vere sono la maggior parte (a Lobstermania
il 61% delle vincite non supera la puntata) ed e' quel che tiene incollati. Poi
i limoni, la tripla che si vede di piu' (una ogni sessantacinque giri), e ogni
premio piu' alto e' piu' raro: dal ×20 una volta ogni cinquecento giri, i sette
una ogni sessantaquattromila. La domanda esce ogni cinquanta giri circa e fa
poco meno di un terzo della resa, come le funzioni speciali delle slot video
(Starburst: il 27%). La resa la conta `contaSlot` su tutte le 64.000
combinazioni: la linea il 66,6%, con le domande tutte giuste il 97%, come Crazy
Time, e `shared/__tests__/slot.test.ts` tiene ferme la resa, la frequenza, la
scala delle triple e le vincite grosse. Si punta da 1 a tutto il saldo, come a
Crazy Time e al blackjack, con le fiches che si sommano (vedi sotto). Fino
all'8 ottobre 2026 il tetto era dieci, perché il ×300 dei sette su un saldo
intero da' in un giro decine di migliaia di punti; il tetto l'ha tolto chi
gioca, sapendolo: i sette escono una volta ogni sessantaquattromila giri.

**Le fiches si sommano, e la puntata la dice il display.** Ogni tocco di una
fiche aggiunge il suo valore — 1, 5, 25 e 100, i colori delle fiches dei casino'
(`PUNTATE_SLOT`) —, quindi si punta qualunque cifra fino al saldo; erano un
gruppo di scelte, e il tocco sostituiva la puntata invece di aggiungere. Una
fiche che passerebbe il saldo si ferma li', e il display lo dice con il MAX che lampeggia e un tocco morbido
(`tetto` in `suoni.ts`), mai con un errore: e' quel che fanno le slot vere. La
fiche vola dal bottone al display, che conta quando arriva, mentre la puntata
e' gia' cresciuta (`inVoloFiches`): una leva tirata con le fiches ancora in
aria paga la puntata intera, e il display la mostra subito. "Azzera" rimanda
la pila al banco. A puntata zero la leva e "Gira" non vanno, e al posto della
vincita il display dice "Tocca le fiches", che lampeggia come l'"insert coin"
delle slot vere: e' cosi' che comincia ogni giornata, perché la puntata resta
quella dell'ultimo giro di oggi. Le fiches sono bottoni ("Aggiungi 5"), e la
puntata la annuncia subito una regione `polite`, senza aspettare il volo.

**La domanda della slot e' quella di Crazy Time.** Le stesse trenta domande per
categoria della notte (`ruota_domande`), e chi ne ha avuta una a un gioco non la
rivede all'altro: `domandeViste` guarda `ruota_giocate` e `slot_giri`. La
categoria la pesca il server con le fermate, fra le sei del giorno
(`categorieDelGiorno`) che hanno ancora domande da dare a quel giocatore; se non
ce n'e' nessuna i tre punti di domanda non escono, e le fermate si ripescano
(`fermateACaso`), come lo spicchio senza domande alla ruota. Sui rulli i punti
di domanda si girano e la mostrano.
La domanda si apre con il Via, con il tempo del quiz, e una lasciata a meta' la
chiude il giro dopo: la puntata era gia' pagata, e la linea aveva gia' pagato il
suo. La pagina mostra prima la linea e poi i punti di domanda, e una festa in
mezzo li coprirebbe: insieme a una domanda la linea paga al piu' le prugne, ×15,
e un test lo tiene. Il resto e' come a Crazy Time: le fermate le sceglie il
server, il saldo si controlla nell'`INSERT`, fra due giri passa
`INTERVALLO_SLOT_MS`, e un giro dei rulli di prima (`DISPOSIZIONE_SLOT`) conta
nel saldo e non si mostra, e una sua domanda rimasta aperta non si gioca piu'
(`NESSUN_GIRO`): la chiude il giro dopo, persa. Per questo la disposizione 2,
quella dei quaranta simboli con il punto di domanda, non ha voluto una
migrazione.

**I rulli frenano con un salto che non si vede.** `Rulli` (`src/games/slot/`) li
fa girare verso il basso, sfocati, finché non arriva l'esito; poi ogni rullo, al
suo momento, salta di colpo cinque fermate prima della sua — a quella velocita'
i simboli non si leggono — e da li' frena con `1 - (1 - t)^3`, passa un filo
oltre e torna indietro, come un rullo che si incastra. Cosi' i tre si fermano a
tempi fissi, il primo 0,9 secondi dopo la leva e gli altri ogni 0,42, qualunque
sia la fermata; se i primi due mostrano un punto di domanda, o due sette sulla
linea, il terzo gira un secondo in piu', con il bordo che pulsa. La striscia di
un rullo sono tre giri dei suoi simboli, e a ogni fotogramma si scrive solo il
suo spostamento, come la rotazione della ruota. Le righe del mobile sono
`minmax(0, ...)`: la striscia e' alta quaranta rulli, e lasciata al contenuto
allargherebbe la sua riga. Quante caselle ha lo dice `--celle`, che scrive
`Rulli`: cambiare le fermate non tocca il CSS. Senza animazioni i rulli si
fermano dentro l'effetto di `Rulli`, che React fa girare prima di quelli della
pagina: per questo la leva scrive subito lo stato nuovo in `ultimo`, altrimenti
`fermati` leggerebbe il giro di prima e la vincita non si vedrebbe.

**La leva si tira col dito, e viene verso chi guarda.** `Leva` sta sul fianco
destro del mobile e ruota nel piano del fianco: tirandola il pomo scende e
viene avanti, a meta' corsa il braccio punta dritto verso chi guarda e si vede
di scorcio, col pomo piu' grande davanti al perno. Il disegno e' una
proiezione, con l'occhio un poco a destra della leva e all'altezza del perno,
ed e' lo stesso punto di vista del fianco del mobile (`.slot-fianco` in
`Slot.css`): se si tocca l'uno, i numeri dell'altro vanno rifatti. Con l'occhio
al centro del mobile, come all'inizio, il pomo che veniva avanti scappava di
lato, e la leva girava come la lancetta di un orologio. Oltre `SOGLIA` i rulli
partono e la leva torna su con una molla; un tocco senza trascinare la tira
tutta, e Invio e lo spazio anche, perché e' un bottone. Accanto alle fiches
c'e' "Azzera", e in fondo al banco "Gira", per chi non vuole tirare. Il resto
si vede come a Crazy Time: le fiches volano dal saldo al display della puntata
e il saldo scende alla leva; una vincita accende i simboli che pagano, ognuno a
modo suo (vedi sotto), il display la segna con il suo nome, le monete cadono
nel vassoio e da li' volano al saldo, che sale quando arriva la prima.

**Ogni vincita della slot ha il suo momento, anche la piu' piccola.** Nelle slot
vere una ciliegia che ridà la puntata suona e lampeggia come un premio, e chi
gioca la ricorda come una vincita (Dixon e altri, Universita' di Waterloo, sulle
"losses disguised as wins"): qui succede un giro ogni quattro, quindi deve
esserci, ed essere diversa dalle altre. `VINCITE` (`src/games/slot/vincite.tsx`)
da' a ogni combinazione il nome sul display, il suono e i pezzi che saltano
fuori dai simboli — le scintille della ciliegia, le ciliegie lanciate, le gocce
dei limoni, le fette d'arancia, le bolle delle prugne, gli acini che rimbalzano,
le onde delle campane, le scariche del BAR, le stelle dei sette, i punti di
domanda; `Slot.css` il colore (`--vinta`, sulla linea, sulle cornici, sui led e
sulle lampadine) e l'animazione del simbolo, sotto `data-vince`: la ciliegia
saltella, le ciliegie dondolano dal picciolo, i limoni si spremono, le arance
rotolano, le prugne tremano molli, l'uva si scuote, le campane suonano, il BAR
sfarfalla come un neon, i sette bruciano. I tre punti di domanda si girano uno
dopo l'altro e dietro c'e' la categoria (`Rivela`). Le monete di una vincita,
arrivando, liberano il tabellone (`conto`) solo se nel frattempo non e' partito
un altro giro (`leve`): altrimenti mostrerebbero il saldo del giro nuovo prima
che i rulli si fermino, e dopo una festa, che rende subito la leva, succedeva.
I pezzi sono elementi del DOM animati dal CSS, al piu' trenta, con la strada
calcolata da un numero fisso e non a caso: il disegno resta una funzione pura.

**Il momento di una vincita cresce con la sua rarita'.** `momentoDi`
(`src/games/slot/momenti.ts`) da' a ogni vincita il suo gradino, e un test
verifica che l'ordine sia quello delle frequenze vere di `contaSlot`: piu' una
combinazione e' rara, mai meno festa. La targhetta della ciliegia sola, un
giro su quattro; la targa di due ciliegie e dei limoni, uno su trentadue e uno
su sessantacinque; il palco delle arance e delle prugne, uno su centoventisette
e uno su quattrocentoventisette; poi la festa (vedi sotto). I primi tre stanno
sul mobile (`Targa`): l'adesivo dei giochi fatto insegna da casino', laccata,
con la foglia d'oro, le lampadine che le corrono attorno e la luce che passa,
davanti all'insegna in cima, dove non copre mai la linea. La targhetta dura
poco piu' di un secondo, perché la leva deve tornare pronta presto (`TEMPI`);
la targa e' piu' grande, con le monete che saltano fuori e una luce che passa
sulla lacca del mobile; il palco ha i raggi che girano dietro il mobile, la
fontana di monete e le lampadine che corrono il doppio. Le monete ricadono
oltre i fianchi, e quelle che cadrebbero davanti ai rulli si spengono prima.
Senza animazioni la targa compare e se ne va, e la sua durata va rimessa:
`base.css` porta tutte le animazioni a un niente, e la targa sparirebbe subito.

**Dal ×20 c'e' la festa delle slot vere.** `FestaSlot` (`src/games/slot/`)
prende lo schermo: il lampo, i raggi, la scritta, con la luce che le passa
sopra, la vincita che conta da zero con il tintinnio che sale di tono
(`altezza` di `suona`), e una fontana di monete con le scintille. Ogni gradino
ha il suo colore e qualcosa in piu' di quello prima: BIG WIN dal ×20, SUPER WIN
per le campane, con l'alone e i raggi al contrario, MEGA WIN per il BAR, con la
seconda onda, il terremoto e le monete che esplodono da dietro la scritta. Il
JACKPOT dei sette, una volta ogni sessantaquattromila giri, e' un'altra cosa:
la sala si spegne tranne i rulli, dove i sette bruciano; dalla cima del mobile
si alza il faro, come la candela delle slot vere, e i suoi fasci spazzano il
buio mentre squilla il campanello elettrico (`sirena`); le lettere cadono una
alla volta, ognuna con la sua onda, e a ogni colpo lo schermo trema; poi il
lampo, i fuochi d'artificio e un conto lungo, che sale di un'ottava. Monete e
fuochi sono un canvas, con un seme fisso per gradino: cento elementi animati
dal DOM costerebbero troppo a un telefono, e la stessa festa e' sempre la
stessa. Un tocco finisce il conto, o salta il buio, un altro chiude, e finita
la festa le monete vanno al saldo. Una domanda giusta ha la festa del ×20.

**Il mobile si misura sulla sua larghezza.** `--w` e' quella che ci sta con la
leva da tutti e due i lati — cosi' il mobile resta al centro e la leva sporge
nel margine — o quella che lascia l'altezza, e `--u` ne e' il centesimo: le
parti hanno altezze fisse in centesimi, e la pancia, sotto il banco, prende
quel che avanza fino a un tetto. La pancia e' un vetro illuminato, con i raggi
che girano, e non dice niente: c'erano quanto vale la domanda e le categorie
del giorno, che sono gia' nelle regole e sui punti di domanda. Quando le si sono
tolte se n'e' andata anche lei, con i rulli allungati al suo posto, e il mobile
non era piu' quello che piaceva: si toglie quel che informa, non il disegno, e
non ci si mette altro. `--w` e' registrata con `@property`,
quindi i figli ereditano una lunghezza vera: non registrata, le unita' del
contenitore si risolverebbero dove la si usa, e dentro la pancia, che e' un
contenitore anche lei, varrebbero le sue.

**Il blackjack paga 1 a 1, e rende come gli altri.** Le regole sono quelle
europee dei casinò italiani, controllate sui regolamenti di Venezia e di
Sanremo (`shared/blackjack.ts`): niente carta coperta — il banco prende la
seconda dopo i giocatori, e se fa blackjack si prende anche raddoppi e split —
il banco sta su tutti i 17, si raddoppia con due carte qualunque, anche dopo
uno split, lo split si fa con due carte dello stesso valore fino a quattro
mani, e gli assi una volta, con una carta. C'e' l'assicurazione (vedi sotto);
la resa no, perché quei regolamenti non ce l'hanno. L'unica regola
diversa e' il pagamento del blackjack, alla pari e non 3 a 2: con il 3 a 2 chi
gioca al meglio riceverebbe il 99,4%, piu' della slot e di Crazy Time; cosi' il
97,1% (`resaBlackjack`, un conto esatto con la strategia migliore, a mazzo
infinito). Il sabot si rimescola a ogni carta, come le macchine dei casinò
online: ogni carta e' a caso fra le cinquantadue, con `crypto.getRandomValues`,
e contare non serve. Un test gioca quattrocentomila mani con `consiglio` e
trova la stessa resa del conto. Il panno lo dice ("IL BLACKJACK PAGA 1 A 1"),
come lo dicono i tavoli veri che pagano 6 a 5. Si punta da `PUNTATA_MINIMA_BJ`
a tutto il saldo: la vincita massima e' quanto si e' messo sul tavolo, che il
saldo deve coprire, quindi un giro al piu' raddoppia la giornata.

**L'assicurazione costa meta' puntata, paga 2 a 1, e non conviene mai.** Come
a Venezia e a Sanremo si offre quando il banco mostra un asso, sulla linea che
il panno dice ("L'ASSICURAZIONE PAGA 2 A 1"), e paga se la seconda carta del
banco fa blackjack; dopo si puo' ancora raddoppiare o fare split, e
l'assicurazione resta quella. I regolamenti dicono "non superiore alla meta'":
qui e' la meta', per difetto (`costoAssicurazione`, 12 su 25), perché i punti
sono interi. Si offre al turno di ognuno, prima di ogni altra mossa, e non a
tutti insieme dopo la distribuzione come fa il croupier: senza carta coperta e
con il sabot che si rimescola a ogni carta, le carte uscite prima non dicono
niente della seconda del banco. Per questo contro l'asso il blackjack non sta
da solo: aspetta il suo turno, e la scelta e' sua. Il "blackjack alla pari"
dei casinò, il pagamento subito contro l'asso, qui non c'e': la' costa mezza
puntata rispetto al 3 a 2, qui, con il blackjack gia' pagato alla pari, sarebbe
un regalo. Chi ha un blackjack si assicura come tutti, e prende mezza puntata
se il banco non fa blackjack, una intera se lo fa: lo stesso prezzo di quel
pagamento, un tredicesimo di quel che si mette sulla linea. L'assicurazione
rende meno di zero (`valoreAssicurazione`, −1/13 a mazzo infinito), quindi la
strategia migliore non la prende (`consiglioAssicurazione`) e la resa resta il
97,1%. Si paga come un raddoppio: un movimento `aggiunge` nella scrittura del
tavolo, con il saldo guardato nell'`UPDATE` e `fortuna_giornate` ricontato
nello stesso batch, e l'esito in `bj_mani` la tiene accanto alle mani. Un
doppio tocco risponde `GIA_ASSICURATO`. Se tutte le mani sballano, il banco
pesca lo stesso la seconda carta: e' quella che decide l'assicurazione.

**Il tavolo va avanti con le richieste, non con un orologio.** Un tavolo
(`shared/blackjack-tavolo.ts`) ha fino a `POSTI_BJ` giocatori e tre fasi: le
puntate, il gioco, la fine. Da soli si punta e le carte arrivano subito; con
altri al tavolo la prima puntata apre `PUNTATE_MS` per le loro, e si
distribuisce quando hanno puntato tutti quelli che ci sono. Chi deve decidere
ha `TURNO_MS`, ma solo se qualcuno lo aspetta: da soli si pensa quanto si
vuole, e chi si siede mentre un altro pensa gli lascia un turno intero. Sul
server non c'e' un timer: le scadenze le applica la prima richiesta che arriva
dopo, da chiunque venga (`avanza`), e ogni scadenza che ne segue parte da
quella di prima, non da adesso, cosi' un tavolo letto dopo un minuto e' quello
che sarebbe stato guardandolo tutto il tempo. Il banco gioca nella stessa
richiesta dell'ultima mossa, e la fine resta in vista quanto serve a girare le
sue carte (`durataFine`). Le regole sono funzioni pure su una bozza
(`BozzaBJ`), che dicono che cosa e' cambiato (`MovimentoBJ`): i test le provano
con un mazzo deciso e un orologio finto.

**Una scrittura del tavolo e' un batch con l'impronta.** Lo stato intero sta in
`bj_tavoli.stato` e si riscrive a ogni cambio, condizionato alla versione
letta; nello stesso batch le righe delle mani (`bj_mani`, il registro dei
conti) e dei posti (`bj_seduti`) si scrivono solo se il tavolo ha preso la
scrittura, perché l'`UPDATE` del tavolo mette in `scrittura` un'impronta nuova
e le altre istruzioni la cercano. Un conflitto — due giocatori che scrivono
insieme — rilegge e riprova; una mossa porta il giro, la mano e quante carte
ha, quindi riprovare non fa mai la mossa due volte, e un doppio tocco risponde
`MOSSA_VECCHIA`. Il saldo si guarda nell'`UPDATE` del tavolo, sui conti di
tutti i giochi della Fortuna, e `fortuna_giornate` si riconta nello stesso
batch. Un giocatore siede a un tavolo alla volta: la chiave di `bj_seduti` e'
lui, e un secondo posto fa fallire il batch intero. Una mano lasciata a meta'
su un tavolo che nessuno guarda piu' conta persa, come la sfida di Crazy Time;
i tavoli fermi da un giorno si cancellano quando se ne apre uno.

**Chi c'e' al tavolo lo dice la presenza.** Un posto e' attivo se il giocatore
ha la pagina del blackjack aperta, per la presenza, o ha fatto qualcosa da poco
(`ASSENTE_MS`); non lo e' se la presenza lo vede in un'altra schermata dopo
l'ultima cosa fatta al tavolo, perché cambiando schermata la presenza si scrive
subito (`altrove`). Chi non c'e' e non ha puntato lascia il posto; chi si alza
a giro in corso lascia le mani, che stanno e si pagano alla fine, e libera
subito `bj_seduti`; chi si alza durante le puntate si riprende la puntata.
Lasciare la pagina dall'app e' alzarsi: la pagina lo chiede quando si smonta,
un giro dopo, perché in sviluppo React smonta e rimonta. Chiudere la scheda o
ricaricarla no — una mano in corso non si perde per un ricaricamento — e se non
si torna e' la presenza a liberare il posto. La sala aspetta l'uscita
(`finitaLUscita`) prima di leggere, altrimenti direbbe ancora "Torna al
tavolo". I tavoli degli amici sono quelli con qualcuno seduto e presente, nella
sala e nella scheda della Fortuna, e "Siediti" porta al loro.

**Le carte arrivano nell'ordine del tavolo.** Il server risponde con tutte le
carte del giro, magari anche quelle del banco; il telefono le fa arrivare con
un piano (`pianoDi` in `src/games/blackjack/piano.ts`): la distribuzione come
al tavolo vero, una a testa dalla sinistra del banco, la sua, la seconda a
testa, poi le carte chieste una alla volta e quelle del banco piu' lente, dopo
un respiro. Una carta vola dal sabot girandosi a meta' strada (una Web
Animation sull'elemento, con il ritardo del piano), e il totale di una mano
conta solo le carte arrivate. Le mani hanno un nome (`id`) che non cambia
quando uno split sposta le altre: la carta che passa nella mano nuova
scivola, e le carte gia' viste non rivolano. Una carta e' nuova anche quando
al suo posto ce n'era un'altra (`CarteViste` tiene la carta, non solo il
posto): dopo uno split la seconda carta passa nella mano nuova, e quella che
arriva al suo posto, prima, non volava dal sabot, cambiava faccia e basta.
Il saldo resta fermo (`conto`) finché la vincita non arriva in monete, dalla
puntata o dall'assicurazione; a fine giro il croupier raccoglie le carte negli
scarti (copie nello strato dei voli, perché il tavolo passa intanto al giro
dopo). Il controllo e' di un secondo e mezzo quando si aspetta
qualcuno, di quattro quando tocca a me, di cinque da soli — solo per vedere chi
si siede — e subito dopo una scadenza.

**Il tavolo e' una mezzaluna, e io sto in fondo al centro.** Dritto dalla parte
del banco, con la rastrelliera, il sabot a destra (la sinistra del banco, da
dove si comincia) e gli scarti a sinistra; curvo dalla parte dei giocatori, con
il bordo imbottito. Gli altri stanno due per lato, lungo il bordo, nell'ordine
dei posti da sinistra; il mio posto e' sempre in fondo al centro, con il
cerchio della puntata, e le mie carte le piu' grandi. Un posto degli altri si
misura sull'avatar: e' lui a stare nel punto del posto, come il cerchio di un
posto libero, e il resto gli sta attorno — le carte sopra, il nome sotto, la
puntata dalla parte del centro (`PostoAltro`). Prima il posto si appendeva
dall'alto, e con le carte un posto occupato scendeva rispetto a quelli liberi,
con l'avatar spinto di lato dal nome. I punti stanno nel CSS (`data-posto`),
perché dipendono dalla forma del panno: in verticale gli esterni stanno sotto
gli scarti e il sabot e sopra le scritte, e su un panno piu' largo che alto
(`@container (min-aspect-ratio: 3 / 2)`, il telefono di traverso e il
computer) si aprono ad arco attorno a me. Tutto si misura sul
tavolo, che e' un contenitore (`cqw`, `cqh`): le scritte ad arco hanno un tetto
anche sull'altezza, perché di traverso un arco largo quanto il panno copriva le
mie carte. Le scritte e i fili sono archi dello stesso centro (`Scritte` in
`Tavolo.tsx`): erano curve ognuna con la sua, piu' strette quanto piu' in
basso, e la scritta piccola toccava il filo. I percorsi sono piu' lunghi delle
scritte, perché un carattere piu' largo non le tagli ai capi, e la fascia
dell'assicurazione e' misurata sulla sua scritta in Georgia, il piu' largo dei
tre caratteri del panno (con Times e Noto Serif, che e' quello di Android).
Sotto le scritte c'e' la linea dell'assicurazione, che si accende
quando il banco la offre; la fiche dell'assicurazione invece sta in un cerchio
piu' piccolo a sinistra della puntata, perché sui telefoni bassi la linea passa
a un dito dalle mie carte. Tre o quattro mani, dopo gli split, vanno su due
righe, due per riga: in fila sola coprivano i posti degli altri ai lati, e le
fasce degli esiti si sovrapponevano. Di traverso restano in fila, piu' piccole
e piu' larghe: li' la larghezza c'e', ed e' l'altezza che manca.

**Le mosse si chiamano come ai tavoli italiani, e ci sono sempre tutte.**
Carta, Stai, Raddoppia e Split, spente quando non si possono fare, e
l'Assicurazione quando il banco la offre, al posto di "Tocca a te" (il tempo
resta, sotto). Lo split si chiamava "Dividi", con il segno ⇆, e chi giocava
non lo riconosceva come lo split: il nome e' quello che si sente al tavolo, il
segno sono due carte che si separano, e le regole dicono "Split (dividere)".
L'assicurazione non ha un tondo fra le mosse perché non e' una mossa della
mano: e' una puntata a parte, che si offre una volta e poi sparisce.

**La roulette e' quella europea, senza la partage, e rende come gli altri.**
Trentasette numeri con uno zero solo (`shared/roulette.ts`), e le puntate del
panno vero: pieno, cavallo, terzina, carré, sestina, con lo zero nei cavalli
0-1, 0-2 e 0-3, nelle terzine 0-1-2 e 0-2-3 e nel carré dei primi quattro;
dozzine, colonne e chances semplici. `PUNTATE` le elenca tutte, 157, e il
server accetta solo quelle. Una puntata vinta torna 36 volte diviso i numeri
che copre, quindi rende 36 su 37, il 97,3%, qualunque sia. Lo zero fa perdere
anche le chances semplici: la "partage" dei tavoli francesi ne ridarebbe
meta', e le farebbe rendere il 98,6%, piu' di tutti gli altri giochi della
Fortuna. Si punta da uno a tutto il saldo, senza un massimo, come alla slot
(vedi sopra), e un test tiene la resa di ogni puntata.

**Il tavolo della roulette e' quello del blackjack, con una biglia per tutti.**
`shared/roulette-tavolo.ts` e' una bozza pura come `BozzaBJ`, e
`server/lib/rouletteStore.ts` la scrive allo stesso modo: lo stato in
`rl_tavoli` condizionato alla versione, le righe di `rl_giocate` e `rl_seduti`
solo se il tavolo ha preso la scrittura, il saldo guardato nell'`UPDATE` e
`fortuna_giornate` ricontata nello stesso batch. Le puntate si compongono nel
telefono e partono tutte insieme: una richiesta per giro, non una per fiche, e
mandarle di nuovo le cambia (vale l'ultima; il saldo copre solo la
differenza). Da soli la biglia parte subito; con altri la prima puntata apre
`PUNTATE_RL_MS`, e si lancia quando hanno puntato tutti quelli che ci sono. Il
numero lo pesca il server al lancio, e il giro si paga li': dopo il "rien ne va
plus" non c'e' piu' niente da decidere. La biglia corre `LANCIO_MS`, il numero
resta in vista `FINE_RL_MS`, e chi punta quando la biglia e' gia' ferma comincia
il giro dopo per tutti: chi guarda l'ha gia' vista cadere. Chi si alza prima
del lancio si riprende le fiches.

**La ruota della roulette e' inclinata, e la biglia no.** `RuotaRoulette`
(`src/games/roulette/Ruota.tsx`) e' un piatto in prospettiva (`TILT`), e non un
disegno piatto: un contesto 3D (`preserve-3d`) in cui ogni parte sta alla sua
altezza (`Z`, in unita' del disegno): il bordo di legno sopra la pista, il
cilindro piu' in basso, i separatori di metallo che sporgono dalle caselle in
due strati, il cono a gradini, il fusto della torretta fatto di dischetti uno
sopra l'altro e le braccia sospese sopra il cono, con l'ombra che gira con
loro. Girando, le parti alte scorrono sopra quelle basse, ed e' quello che le
fa sembrare vere. Le luci stanno ferme sopra il cilindro (`Luce`, `LuceCono`,
il luccichio sulla torretta), cosi' il legno e l'oro luccicano passandoci
sotto; i rombi hanno le facce chiare quanto guardano verso la luce. Il fianco
del mobile, con le doghe e la fascia d'oro, non e' nel piatto: e' disegnato
sullo schermo con `proietta` (`Fianco`), e combacia con il bordo perché i conti
sono gli stessi del CSS. Chrome disegna gli strati in prospettiva a un punto
per pixel, senza la densita' dello schermo, e sul telefono i numeri venivano
sgranati: li' ogni strato e' grande `--nitido` volte e rimpicciolito nella sua
trasformazione (`nitidezza`); Safari li disegna gia' nitidi, e ingranditi
vorrebbero nove volte la memoria. Niente `will-change`, `overflow`, `filter` o
`opacity` sul piatto e sul cilindro: appiattirebbero gli strati. La biglia inclinata
diventerebbe un'ellisse, quindi sta sopra il piatto, tonda, e la sua posizione
la calcola `proietta` con la stessa prospettiva del CSS. Il suo angolo si conta
sul cilindro e finisce nella casella del numero qualunque sia la velocita' del
cilindro; corre sulla pista, scende verso i rombi, rimbalza fra i separatori, e
i suoni seguono gli stessi momenti. La sua altezza segue quel che ha sotto
(`fondoA`: la pista, poi il cilindro, piu' basso), e finché corre veloce ha la
scia, due copie di un attimo prima. La ruota e' disegnata grande e rimpicciolita
sul palco (`--piccola`): quando la biglia parte si fa grande sopra il panno, che
si vela, e torna al suo posto dopo l'annuncio del numero. Disegnata piccola e
ingrandita, a pieno schermo sarebbe sfocata. Il tabellone dei numeri usciti non
dice il numero mentre la biglia gira: il server lo mette nella storia al
lancio, e sarebbe la soluzione.

**Il panno si tocca dove si posa la fiche.** Sul telefono il panno sta in
piedi, lo zero in cima, e le puntate interne si scelgono dal punto toccato
(`puntataDa` in `src/games/roulette/panno.ts`): il centro di un numero e' il
pieno, il bordo fra due il cavallo, l'incrocio il carré, il bordo di fuori la
terzina o la sestina. Mentre il dito preme si accendono i numeri coperti, e la
riga sopra le fiches dice la puntata e quanto paga; lasciando, la fiche vola
dal vassoio. Con la tastiera ogni numero e' un bottone che mette un pieno.
Dopo il lancio il croupier annuncia il numero ("Otto, nero, pari e manque"),
poi sul panno il dolly cala sul numero, le fiches perse vanno via, accanto alle
vinte arriva la vincita e le monete volano al saldo, che resta fermo fino ad
allora; un pieno, un cavallo, una terzina, un carré o una sestina vinti hanno
la festa di Crazy Time, con il numero e il nome della puntata.

**I periodi delle classifiche sono di calendario**: il giorno, la settimana da
lunedì a domenica, il mese dal primo, e sempre. Prima erano finestre mobili —
gli ultimi sette giorni, gli ultimi trenta — che cambiavano ogni mattina anche
senza partite nuove e non dicevano mai chi aveva vinto una settimana. Ora un
periodo si chiude, e si torna a guardarlo con `indietro` (le frecce sotto il
selettore), fino a quello del primo giorno di gioco: oltre, il server si ferma
li' e la risposta dice quale periodo e' (`periodo`). I conti stanno in
`shared/periodi.ts`, gli stessi per il Worker e per il browser, che ci scrive
il nome ("La settimana scorsa", "21–27 settembre"). Un giorno passato del Wordle
racconta i tentativi di quel giorno, mentre la serie resta quella di adesso;
"in corso" e la fiamma della serie si mostrano solo in un periodo che arriva a
oggi, perché una partita rimasta aperta ieri non e' in corso, e' non finita.

**A pari punti passa avanti chi ne ha fatti meno in compagnia.** Nel Wordle, nel
cruciverba, nello Scarabeo e nella generale lo spareggio sono gli assist, **al
contrario** di prima: una giornata in compagnia vale quanto una da soli, ma fra
due totali uguali vince chi li ha fatti con le proprie partite. `rankPlayers`,
`ordinaCruciverba`, `ordinaScarabeo` e `ordinaGenerale` devono restare
d'accordo; poi, nella generale, conta chi ci e' arrivato con meno partite.

**I giochi da tavolo non hanno classificata.** Sono partite quando si vuole, con
gli amici — e contro il computer dove ha senso — senza punti ne' classifica:
nelle Libere stanno con le libere dei giochi classificati, ognuno nella sua
famiglia (vedi sotto), anche nel menu laterale del computer (`GIOCHI_DA_TAVOLO`
in `src/games/catalog.ts`), non in `GiocoClassificato`, che porta con se'
classifiche, anelli e statistiche. Sono Indovina chi, Lupus e Scarabocchi, che
il computer non ce l'hanno — si giocano parlandosi, o disegnando — e la
battaglia navale, scacchi, dama, Forza 4, go e tris, con un amico o contro il
computer. La battaglia e il tris una classificata l'hanno avuta, e le giornate
di allora restano nella generale (vedi sotto).

**In Indovina chi l'invito e' gia' la partita.** Una riga di
`indovina_partite` nasce invito — a un amico online (`invitato`) o con un link
(`codice`) — e diventa la partita quando l'altro accetta, con un `UPDATE`
condizionato allo stato 'invito' e al fatto che nessuno dei due sia in
un'altra partita: nello stesso colpo si pescano i due personaggi segreti e chi
comincia. Non serve una tabella delle sfide come nella battaglia, perché
l'invito porta tutto quel che serve alla partita: i personaggi scelti.
Domande, risposte e tentativi sono le mosse (come i colpi della battaglia) e
si scrivono condizionate alla `versione`; le facce abbassate e i messaggi del
canale delle foto no, perché li scrive uno solo dei due e non devono far
fallire la domanda dell'altro arrivata nello stesso istante — per questo
`salvaMossa` scrive solo le colonne delle mosse. Il personaggio dell'altro
esce solo a partita finita (`vistaIndovina`). Chi sbaglia il tentativo perde,
come sulla scatola: senza, tirare a indovinare a ogni turno non costerebbe
niente. Niente resta: le partite ferme da due giorni si cancellano a ogni
invito nuovo.

**Le immagini di Indovina chi non passano dal server.** Le persone sono gli
Avataaars disegnati da DiceBear (`api.dicebear.com/9.x`), gli animali le
Fluent Emoji di Microsoft da jsDelivr, a un commit fisso: le scarica il
browser, come le bandiere del quiz. Ogni tratto delle persone e' scritto nei
parametri e non lasciato al seme — occhiali, barba, cappello, capelli — perché
le domande tornino, e un test verifica che siano valori che DiceBear conosce:
uno sbagliato non darebbe errore, darebbe un tratto a caso. Una foto che non
arriva lascia le iniziali (`Faccia`), e la partita si gioca coi nomi.

**I set propri stanno nel telefono, e le foto vanno da telefono a telefono.**
Le foto si preparano nel browser (un quadrato di 256 punti in JPEG, preso un
po' sopra il centro nelle foto in piedi) e restano in IndexedDB
(`src/games/indovina/archivio.ts`); al server arrivano solo i nomi e
l'impronta di ogni foto (i primi 128 bit del suo SHA-256). Chi non ha le foto
le chiede con un canale WebRTC (`trasferimento.ts`): l'offerta e la risposta
passano dalla partita sul server (`/segnale`, una risposta vale solo per
l'offerta a cui risponde), i candidati si raccolgono tutti prima di mandarla —
con il polling uno alla volta sarebbero una scrittura ciascuno — e poi le foto
vanno dirette, e ognuna si controlla con la sua impronta. Solo STUN, niente
TURN: fra due reti che non si lasciano attraversare il canale non si apre, e
la pagina lo dice. Il ripiego e' il file del set (`setFile.ts`), che si manda
come un documento qualunque e si apre da "Nuovo set".

**Lupus si gioca su un telefono o in una stanza, con lo stesso motore.**
`shared/lupus.ts` e' una funzione che fa avanzare la partita (`applica`),
deterministica dal seme e dall'ora che le si da', e la eseguono il telefono che
passa di mano (`src/games/lupus/telefono.ts`, nel `localStorage`) e il server
della stanza online (`server/lib/lupusStore.ts`): la partita e' la stessa per
costruzione, e ogni regola sta li' e solo li'. Alcune regole sembrano sbagliate
e non lo sono — la Guardia dalla seconda notte, il Mitomane che copia un lupo e
conta subito come lupo, il Criceto che muore se lo guarda il Veggente ma non
Darius, il "Benvenuto!" allo sbranato e non al linciato, la fase della decisione
solo con Amleto o Dorian Wolf —, e sono elencate in testa al motore: vanno lette
prima di correggerne una. Il gioco viene dal repository `lupus`, che aveva un
Durable Object per stanza; qui le stanze stanno su D1. Di partenza i fantasmi
non votano, anche se il regolamento li fa votare alle nomine: e' una regola
della partita (`fantasmiVotano`), e chi la vuole la accende.

**Lo stato di Lupus ha i segreti, e a ognuno arriva la sua vista.** Il server
non manda mai la partita: manda `vistaPer` (`shared/lupus-vista.ts`), con il
proprio ruolo, quel che si e' saputo di notte e quel che si deve fare. Di notte
nessuno aspetta nessuno (`aspetta` e' vuoto), e chi non ha poteri riceve
comunque una richiesta, `dormi`: sapere chi deve ancora scegliere direbbe chi ha
un potere. E prima della fine non si dice perché e' morto qualcuno, come non lo
dice il moderatore: "guardato dal Veggente" direbbe che c'e' un Veggente e che
il morto era il Criceto. Restano le morti che tutti hanno visto, il linciaggio,
e quelle dei segnalini sul tavolo, il teschio di Amleto e il ritratto di Dorian
Wolf (`CAUSE_PUBBLICHE`).

**Il telefono che passa di mano decide a chi va, non come si gioca.** Ogni
momento in cui passa — i ruoli, la notte, il "Benvenuto!" ai nuovi fantasmi, il
ballottaggio segreto — e' un giro con l'elenco di chi lo riceve, fissato quando
comincia (`Giro`): il motore chiude la notte appena l'ultimo con un potere ha
scelto, e il telefono passa comunque a tutti gli altri, che fingono di scegliere
fra i vivi di quando la notte e' cominciata; l'alba si vede solo dopo l'ultimo,
altrimenti direbbe che chi viene dopo non ha poteri. Di notte il telefono va a
tutti i vivi, e con il Baron Samedi anche ai fantasmi, perché lui agisce da
morto e chiamare solo lui lo smaschererebbe; chi ha appena saputo qualcosa lo
legge prima di passarlo (`fatto`). Riaperta, la partita chiede di nuovo chi
tiene il telefono: una schermata privata non si riapre da sola.

**La stanza online di Lupus sta su D1, a polling.** `lupus_stanze` ha la partita
intera in JSON con una `versione`: ogni azione legge, applica e scrive
condizionata alla versione, e a un conflitto riprova (`suStanza`). Il telefono
rilegge ogni `LUPUS_POLL_MS` in partita e ogni `LUPUS_POLL_ATTESA_MS` prima e
dopo, con l'ora del server nella risposta. La discussione e le arringhe
finiscono da sole: la prima richiesta dopo la scadenza manda avanti dalla
scadenza, non da adesso (`scadute`), come il tempo del quiz. Si sta in una
stanza alla volta (la chiave di `lupus_iscritti` e' il giocatore), gli inviti
arrivano con la presenza (`lupus_inviti`, per `LUPUS_INVITO_MS`) e il link e' il
codice di quattro lettere, che si detta anche a voce; le stanze ferme da
`LUPUS_STANZA_FERMA_MS` se ne vanno quando se ne apre un'altra. Chi l'ha aperta
conduce, cioe' manda avanti le fasi del giorno; se la presenza non lo vede da
`LUPUS_CONDUTTORE_ASSENTE_MS` lo puo' fare chiunque, e se esce conduce il primo
entrato dopo di lui. Ogni azione nuova va aggiunta ad `azioneDelGiocatore`
(`shared/lupus-stanza.ts`), che mette sempre come autore chi l'ha mandata: se
no, online risponde "azione sconosciuta".

**Scarabocchi e' una stanza come quelle di Lupus, con due modi.** Il codice e'
di cinque lettere (quelli di Lupus sono quattro, e il link pubblico degli inviti
li cerca tutti e due), chi apre la stanza sceglie il modo e da' il via, e la
partita sta in JSON in `scarabocchi_stanze` con le parole segrete, riscritta
condizionata alla `versione` (`suStanza` in `server/lib/scarabocchiStore.ts`).
Le scadenze le applica la prima richiesta che arriva dopo, ognuna dalla sua ora
(`avanzaIndovina`, `avanzaTelefono` in `shared/scarabocchi.ts`). Chi conta sono
gli iscritti che la presenza vede (`presenti`): il turno di chi ha chiuso l'app
salta, e non lo si aspetta per chiudere un turno o un passo.

**Le cose che arrivano spesso non toccano la riga della stanza.** I tratti si
aggiungono a pezzi in `scarabocchi_tratti`, uno ogni `INVIO_TRATTI_MS` mentre si
disegna, ognuno con il suo numero nel foglio: riscriverlo non fa niente, quindi
il telefono che non ha avuto risposta lo rimanda uguale, e chi guarda li legge
in fila, fermandosi al primo che manca. Le risposte stanno in
`scarabocchi_messaggi`, con l'ora e i punti del server, e si scrivono solo se la
stanza e' ancora quella letta: una risposta arrivata mentre il turno si chiudeva
non vale per quello dopo. Una giusta per giocatore e per turno la tiene un
indice unico. I fogli del telefono senza fili stanno in `scarabocchi_fogli`.
Cosi' sette persone che scrivono insieme non si contendono la stanza, e il giro
di controllo e' una richiesta sola, che porta i pezzi nuovi del disegno e le
risposte nuove. Le mosse sulla lavagna sono testo (`codificaOps`): due caratteri
per coordinata, su una lavagna di 1600 per 1200 che ogni schermo scala sulla sua
larghezza.

**In Indovina il disegno la parola non esce prima del tempo.** Le tre parole le
vede solo chi disegna, la parola chi disegna e chi l'ha gia' indovinata; agli
altri arriva l'indizio, con qualche lettera in chiaro col passare del tempo
(`indizio`, sempre le stesse per lo stesso turno). Una risposta giusta degli
altri arriva senza testo finché il turno e' aperto, e "ci sei quasi" lo sa solo
chi l'ha scritto. Chi indovina prende da trecento a cinquanta punti, per decine,
secondo il tempo (`puntiIndovino`); chi disegna la media di quel che hanno preso
quelli che dovevano indovinare, anche chi non ce l'ha fatta
(`puntiDisegnatore`). Il turno finisce quando hanno indovinato tutti. I punti
non vanno in classifica.

**Nel telefono senza fili nessuno lavora due volte sulla stessa catena.** Chi
lavora a ogni foglio lo decide un quadrato latino (`assegnazione`): in ogni
passo ognuno ha una catena, in ogni catena ognuno lavora una volta. E' quello
ciclico con i posti e i passi mescolati, quindi da un passo all'altro i fogli
girano di un numero di posti diverso, e chi passa a chi non si indovina. Per
questo servono almeno tre giocatori. Le frasi si salvano mentre si scrivono, e a
tempo finito vale la bozza; un disegno vale con i pezzi arrivati entro il
margine. L'album si chiede una catena alla volta, perché i disegni di tutte
insieme sarebbero troppi.

**Le parole da disegnare sono quelle di Nomi, cose e città.**
`scripts/build-scarabocchi.mjs` prende le parole note del lessico nelle
categorie che si disegnano, toglie quelle che un disegno non dice e le parti
intime del corpo, e le divide in tre livelli per frequenza nei sottotitoli: a
ogni turno se ne propone una per livello. Stanno in
`shared/scarabocchi-parole.ts` perché le pesca il server, al via, tre per turno
e senza ripetersi nella partita.

**Scacchi, dama, Forza 4, go e tris passano da una faccia sola.**
`RegoleTavoliere` (`shared/tavolo-regole.ts`) mette i cinque giochi dietro le
stesse funzioni, in testo: la posizione come la scrive ogni gioco (il FEN, le 32
caselle della dama, le 42 del Forza 4, il goban, le 9 del tris) e la mossa nella
notazione piu' semplice da controllare ("e2e4", "22x13x6", la colonna, "D4" o
"passo", la casella). Il server la usa per ogni mossa delle partite fra amici e
il telefono per quelle contro il computer, quindi le regole sono le stesse per
costruzione. Il server non rigioca la partita: `tavolo_partite.posizione` sta
accanto alle mosse e la mossa si controlla su quella, perché rigiocarne cento a
ogni richiesta non starebbe nei dieci millisecondi. Le ripetizioni si contano
con `chiavi`, le posizioni dall'ultima mossa irreversibile (una presa, un
pedone, una pedina): prima di quella nessuna posizione puo' tornare, e la lista
resta corta. Si salva la mossa come la scrive il gioco (`giocaMossa` la
restituisce), non come la manda il telefono: la dama accetta anche "22x6" per
"22x13x6". Lo Scarabeo fra amici ci passa anche lui, con le tessere nascoste:
vedi la sua nota.

**Le partite fra amici sono quelle di Indovina chi, su un tavoliere.** La riga
di `tavolo_partite` nasce invito e diventa la partita con un `UPDATE`
condizionato; chi muove per primo si pesca quando si accetta (`primo`) e nella
rivincita tocca all'altro (`primoDellaRivincita`), con la serie contata per
giocatore. Si gioca una partita da tavoliere alla volta, di tutti i giochi
insieme (`inPartita`). La patta d'accordo, negli scacchi e nella dama, si propone una
volta per mossa (`patta_n`) e una mossa dell'altro la lascia cadere, come al
tavolo: e' il modo di dire di no. Chi aspetta chiude a tavolino dopo cinque
minuti con l'altro fuori linea, o dopo mezz'ora comunque
(`TAVOLO_ATTESA_MS`, `TAVOLO_ATTESA_MASSIMA_MS`): una mossa di scacchi si
pensa, e i tre minuti della battaglia sarebbero pochi. Il go era nel `CHECK`
della tabella gia' dalla migrazione 0021, prima di esserci: cambiare un `CHECK`
in SQLite vuol dire rifare la tabella.

**Contro il computer non passa niente dal server.** La partita sta nel
`localStorage` (`src/games/tavolo/locale.ts`) con il conto per livello, e il
computer pensa in un Web Worker per gioco (`tavolo/computer.ts`): chi gioca a
Forza 4 non scarica il motore degli scacchi. Cominciare una partita nuova
lasciando a meta' quella in corso la conta persa, come nella battaglia. I
motori misurano il tempo con `Date.now()`, che nel Worker di Cloudflare non
avanza durante il calcolo: non si chiamano mai dal server.

**Le pagine dei tavolieri si scaricano a parte, e quelle del quiz anche.**
Regole, pezzi e tavolieri sono un quinto dell'app, e i generatori delle domande
di tutte le materie del quiz un altro bel pezzo: `App.tsx` le carica con `lazy`,
in un `Suspense` attorno alle rotte, e le precarica dopo un paio di secondi. Le
statistiche delle libere del quiz stanno in `quiz/statistiche.ts` perché le
legge anche il profilo, che altrimenti si porterebbe dietro i generatori. Lo
Scarabeo libero arriva a parte anche lui: ha la sala degli amici dei tavolieri.
React Router naviga dentro una transizione di React, quindi la schermata di
prima resta finché la nuova e' pronta, e la View Transition la fotografa
montata. Per questo gli avvisi degli inviti e la registrazione prendono i nomi
da `tavolo/nomi.ts` e non da `tavolo/giochi.ts`, che porta con se' i tavolieri.

**La dama e' quella italiana.** Le regole sono quelle della Federazione
(`shared/dama.ts` cita gli articoli): la pedina non mangia la dama, la dama va
di una casella, prendere e' obbligatorio con le precedenze dell'art. 6 — piu'
pezzi, poi con la dama, poi piu' dame, poi dove una dama si presenta prima — e
la pedina che promuove prendendo si ferma. Le caselle si numerano dalla 1 in
alto a sinistra guardando dal Bianco, con la scura in basso a destra per chi
guarda: le prime mosse del Bianco sono 21-17, 21-18, 22-18, 22-19, 23-19,
23-20 e 24-20. La patta per ripetizione e quella delle quaranta mosse di sole
dame sono automatiche, come nelle app, e non a richiesta come nel regolamento,
che presuppone un arbitro. Le regole sono verificate contro un'implementazione
indipendente, e il test del perft (7, 49, 302, 1469, 7361, 36473, 177532 fino
alla profondita' 7) le tiene ferme.

**Negli scacchi le patte sono automatiche.** Stallo, materiale insufficiente,
triplice ripetizione e cinquanta mosse chiudono la partita da sole: al telefono
non c'e' un arbitro a cui reclamarle. La chiave della ripetizione ha la casella
en passant solo se la presa e' davvero possibile. La notazione e' quella
italiana (R, D, T, A, C) e le mosse si salvano in UCI: l'elenco le riscrive
rigiocando la partita. Il perft sulle posizioni classiche tiene ferme le regole.

**I pezzi degli scacchi sono in linea, con la licenza BSD.** Sono i disegni di
Cburnett presi da Wikimedia Commons, dove l'autore li offre anche con la BSD
(quelli di lichess sono sotto GPL): `src/games/scacchi/pezzi.ts` li tiene come
immagini `data:`, senza richieste, e l'avviso della licenza sta in
`shared/words/SOURCES.md`.

**Il go si conta ad area, e le pietre morte le segnano i giocatori.** Le
regole sono quelle cinesi, le piu' facili da contare a macchina: punti = pietre
vive + intersezioni vuote chiuse dalle proprie pietre, con 7,5 di komi al
Bianco (niente patte). Il suicidio non vale, il ko semplice sta nella
posizione, e i cicli piu' lunghi (triplo ko) finiscono patta alla terza
ripetizione: nel go ogni posizione puo' tornare dopo una cattura, quindi le
chiavi si tengono tutte, e sono impronte corte perché una partita a 19 ne ha
centinaia. Due passi di seguito **fermano** la partita senza chiuderla
(`RegoleTavoliere.conteggio`): quali pietre sono morte non lo sa dire un
programma con certezza. Lo stima il telefono (`stimaMorte`, qualche centinaio
di partite a caso, nel Worker), con il seme della posizione, cosi' due telefoni
fanno la stessa stima; il primo che arriva la propone (`/conteggio`,
`morte`), toccare un gruppo lo cambia, e il conteggio vale quando lo accettano
tutti e due (`morte_ok`), sulla stessa proposta. Proporre non e' accettare: la
prima proposta la manda il telefono da solo, prima che chi gioca l'abbia
guardata, e se valesse come accettazione il telefono accetterebbe per lui una
stima che magari lo fa perdere di settanta punti (provando con Playwright e'
successo al Bianco). Ogni proposta nuova fa cadere le accettazioni di quella di
prima. Chi non e' d'accordo riprende a giocare e cattura quel che per lui e'
morto; la ripresa azzera le chiavi, perché il goban e' quello di prima dei
passi con lo stesso tratto, e alla seconda ripresa sarebbe gia' una ripetizione
che non lascia muovere nessuno. Contro il computer il conteggio non si corregge
a mano: il computer fa da arbitro, e chi non e' d'accordo riprende. Il server
conta con `punteggio`, che e' un riempimento e costa poco; la stima no, e per
questo non la fa lui.

**Il goban e' un SVG in decimi di passo.** Le intersezioni sono punti, e un
SVG li mette dove stanno a qualunque lato; il passo fra due linee vale dieci
unita' e non una perché Chrome sbaglia la larghezza delle lettere dei testi
SVG sotto l'unita', e i numeri a due cifre delle righe si sovrapponevano. Sul
13 e sul 19 le intersezioni sono piccole sotto il dito: il primo tocco mostra
la pietra, il secondo sullo stesso punto la posa. Il lato si sceglie nella
sala e vale per le partite nuove, contro il computer e negli inviti
(`variante`); la rivincita si gioca sullo stesso goban.

**Il computer del go gioca a caso, e i test contano le simulazioni.** Il go
non ha una valutazione da scrivere a mano come gli scacchi: `shared/go-computer.ts`
gioca migliaia di partite veloci fino in fondo (un MCTS con RAVE, alla Michi) e
sceglie la mossa che vince piu' spesso. I livelli sono due tetti, di
simulazioni e di tempo — facile 300 o 140 ms, normale 5.000 o mezzo secondo,
difficile 25.000 o un secondo e mezzo, con le simulazioni scalate sull'area dei
goban grandi — e su un computer da tavolo decide il primo, su un telefono il
secondo. Per questo i test passano `simulazioni`, che da solo toglie il limite
di tempo: a tempo, la stessa partita darebbe mosse diverse su una macchina
carica. Il telefono gli passa l'ultima pietra dell'altro (`ultima`), come le
partite con cui sono misurati i livelli: le risposte vicine partono
avvantaggiate. Passa solo se l'altro ha passato e la stima dice che vince, o se
non resta niente da prendere, salvare o chiudere; sul 13 e sul 19 le mosse sono
sensate ma deboli.

**Nel Forza 4 la cornice sta sopra i dischi.** Il disco che cade scende dietro
la cornice e si vede solo dai fori, come nel gioco vero: la cornice e' un
tracciato SVG con i fori (`evenodd`) sopra lo strato dei dischi, la griglia sta
su un piede con la stecca del fondo, e le colonne da toccare stanno sopra tutto.
Il bordo di ogni foro e' un cerchio a parte, perché un gradiente si misura sul
riquadro di chi lo usa: su un tracciato solo, l'ombra sarebbe stata una per
tutta la griglia.

**Chi deve giocare ha il disco in mano.** Le mani sono due, una per colore, e
restano sempre nella fascia sopra la griglia (`Griglia.tsx`): quella di chi ha
il tratto si vede, l'altra no, e ognuna si sposta da sola fra le colonne. La mia
segue il mouse, o il dito che preme e scorre sulla griglia, e lasciando il disco
cade; lasciato lontano dalla griglia non cade, perché ci si e' ripensato. Quella
dell'altro va avanti e indietro mentre ci pensa. Il dito e il mouse li sente la
griglia, che sa su quale colonna sono: i bottoni delle colonne non prendono il
puntatore e restano per la tastiera e per chi legge lo schermo. Un disco cade
solo se l'ho visto arrivare (`arrivi`), e prima di cadere aspetta che la mano di
chi l'ha giocato sia sopra la sua colonna: quanto, lo dice dove stava la mano
all'ultimo disegno. Poi schiaccia, rimbalza e la griglia sobbalza; il primo
colpo sul fondo e' a `IMPATTO` della caduta, e li' suonano il disco, compare la
mano dell'altro e si accende la mira. Il sobbalzo ha due nomi che si alternano
con il numero della mossa, perché una classe che resta la stessa non fa
ripartire un'animazione.

**La fila si accende dall'ultimo disco verso i capi.** Un anello bianco davanti
alla cornice per ogni disco, e il tratto che li unisce e cresce con loro (`file`
in `shared/forza4.ts` da' le file una per una, dal capo alla coda). Da una parte
dell'ultimo disco ce ne sono al piu' tre, perché con quattro in fila prima la
partita sarebbe gia' finita: e' su quello che conta `attesaFine`, che il
tavoliere passa alle pagine (`GiocoDelTavoliere`) perché l'adesivo, i coriandoli
(`useFesta` con il ritardo) e il risultato nel piede (`useFineVista`) aspettino
la fila invece di arrivare mentre il disco vincente cade. Gli altri dischi
sbiadiscono con la trasparenza: scuriti con un filtro, il giallo veniva color
oliva. A una partita nuova i dischi escono dal fondo; solo quando le mosse
tornano a zero, non quando il server non prende una mossa e la griglia torna
indietro di un disco. `griglia.test.ts` tiene d'accordo il CSS con le misure e i
tempi del codice.

**Il tris e' un tavoliere, e dall'8 ottobre 2026 non ha piu' la
classificata.** Era una serie di cinque partite contro il computer del giorno,
ma il tris non si puo' fare uguale per tutti: chi sa le mosse giuste pareggia
sempre, e una vittoria la decideva la svista che il computer aveva quel giorno
piu' di come si era giocato. Ora sta solo fra i tavolieri, in `GIOCHI_TAVOLIERE`
e in `RegoleTavoliere`, con la sala a `/tris/libera` (`SLUG_TAVOLIERE`), contro
il computer o con un amico, e in `GIOCHI_DA_TAVOLO` con gli altri giochi senza
classificata; `/tris` e `/tris/classificata` portano alla sala. Le serie di
allora restano in `tris_partite`, e i loro punti stanno nella generale dei
periodi che le comprendono, in una colonna a parte (`GeneraleRow.tris`, e la
stessa somma in `puntiClassificateDi`), come quelli della battaglia: una
giornata vale quel che valeva. Per farlo entrare fra i tavolieri la migrazione
`0028` ha rifatto `tavolo_partite` senza il `CHECK` sul gioco, che in SQLite
non si allarga: il gioco lo controlla il server, e un gioco nuovo non deve
volerla rifare un'altra volta. Prima delle migrazioni il deploy scrive nel log
il segnalibro di Time Travel di D1, da cui si torna a com'era se una tabella
rifatta andasse storta.

**Nel tris ogni mossa ha dieci secondi, se non se ne sceglie un altro.** Senza
tempo chi ci pensa abbastanza non sbaglia mai, e il tris finisce sempre patta:
per questo nella sua sala il tempo si sceglie fra cinque e trenta secondi, e
non c'e' "senza". Fra amici il tempo lo tiene il
server (`tempoMossaDi`, `scadenzaMossa` e
`chiudiSeScaduta` in `tavoloStore.ts`), tranne la prima mossa di ciascuno, che
e' senza tempo: chi ha mandato l'invito arriva al tavoliere un momento dopo chi
l'ha accettato, quando la sala se ne accorge. Nelle partite a tempo il giro di
controllo e' di un secondo (`TAVOLO_POLL_A_TEMPO_MS`): la mossa dell'altro
arriva con il ritardo del giro, e intanto il mio tempo corre. Contro il
computer il tempo sta nel telefono, e riparte a ogni turno.

**Il tempo per mossa si sceglie nella sala, e viaggia con l'invito.** Ogni
gioco al tavolo ha i suoi tempi (`TEMPI_MOSSA` in `shared/tavolo-tempi.ts`):
il tris da cinque a trenta secondi, il Forza 4 fino a un minuto, scacchi, dama
e go fino a cinque, lo Scarabeo da uno a cinque minuti, e tutti tranne il tris
anche senza tempo, che e' quello di sempre (`TEMPO_DI_SEMPRE`). L'invito porta
la scelta (`tempoMossa`, in secondi; il server la rimette fra quelle del gioco
con `tempoMossaValido`) e la partita la salva in
`tavolo_partite.tempo_mossa_ms`, con zero per senza tempo; le partite di prima
della migrazione `0043` l'hanno NULL e valgono con il tempo di allora, dieci
secondi il tris e nessuno gli altri. La rivincita tiene il tempo della partita.
Contro il computer il tempo sta nella partita del telefono
(`PartitaLocale.tempo`), che lo ritrova ricaricando la pagina. La scelta si
ricorda per gioco (`giochi.<gioco>.tempo`), e la legge anche l'invito dal
profilo di un amico.

**Le libere fra amici si giocano come da soli.** Quel che una libera fa
scegliere da soli lo fa scegliere anche la sfida, e l'altro gioca con la stessa
scelta: in Nomi, cose e città il tempo (`SECONDI_NOMI_LIBERI`, da uno a cinque
minuti, `nomi_sfide.secondi`), nelle Sequenze la difficolta'
(`sequenze_sfide.livello`, con il facile che parte da due cubetti e il
difficile al contrario, e lo stesso ritmo). Contro il computer di Nomi il tempo
sposta lo stop in proporzione (`nuovaPartita`): a un minuto il computer facile
non puo' aspettarne due e mezzo. Le righe di prima della migrazione `0043`
valgono com'erano, tre minuti e il normale.

**Il computer del tris sbaglia come una persona.** Il tris e' risolto: il
valore di ogni posizione sta in una tabella (`shared/tris-valori.ts`, che
scrive `scripts/genera-tris-valori.ts` e un test ricalcola con il minimax),
perché il minimax a ogni isolato nuovo costava sei dei dieci millisecondi. Il
computer sa sempre quali mosse tengono la patta, e a volte non le gioca: una
svista sottile, che lascia una forchetta, tanto piu' spesso quanto meno sono
le mosse giuste; una grossa, che non para una fila, di rado. Quanto spesso lo
dice il livello (`DISTRAZIONI`).

**Nomi, cose e città si conta la notte, e vale il giorno dopo.** Una risposta
vale di piu' quanto meno l'hanno data gli altri, quindi i punti si fanno quando
hanno giocato tutti: li scrive `scripts/punteggi-nomi.ts`, che il workflow
`nomi.yml` lancia alle 22:07 e alle 23:07 UTC — una delle due e' la mezzanotte
italiana, con l'ora legale o con la solare — e che il workflow notturno e il
deploy rilanciano per le giornate rimaste indietro. Conta solo le giornate non
ancora contate (`giocatori IS NULL`) e finite davvero: qualche minuto dopo la
mezzanotte, quando anche una partita cominciata alle 23:59 ha finito il suo
tempo (`primoGiornoAperto`). Per questo ogni conto di Nomi, cose e città e'
spostato di un giorno: la classifica di un periodo prende le partite dal giorno
prima del suo primo al giorno prima del suo ultimo (`classificaNomi`), la
generale lo stesso, e i punti di ieri stanno nelle classificate di oggi anche
per il saldo della Fortuna (`puntiClassificateDi`). Chi ha giocato oggi sta in
classifica "in arrivo", a zero. Il conto non si fa nel Worker: con molti
giocatori passerebbe di molto i dieci millisecondi, e vuole il lessico intero.

**La rarita' e' un logaritmo, perché con cinquemila giocatori non valga tutto
zero.** Venticinque punti per aver scritto almeno una risposta, da sette a
quindici per ogni risposta valida, e il tempo che toglie al piu' un quarto alle
risposte: al massimo cento (`shared/nomi-cose.ts`). La rarita' di una risposta
e' `ln(giocatori / uguali) / ln(giocatori)`: uno su cinquemila vale quindici,
tutti sette, dieci su cinquemila ancora quasi tredici. Una scala lineare
("una su cinque l'hanno scritta in mille") darebbe il minimo a quasi tutte le
risposte di una partita affollata. Due risposte sono uguali se il lessico le
riconosce nella stessa forma: "le arance" e "arancia" sono la stessa.

**La giornata la fissa chi comincia per primo, e la lettera si vede solo
cominciando.** La lettera gira su diciannove giorni (`letteraDelGiorno`), le
cinque categorie si pescano fra quelle che con la lettera hanno almeno dodici
parole (`categorieDelGiorno`, sui conti del lessico); `nomi_giornate` le fissa
con `INSERT OR IGNORE`, perché un lessico rifatto non cambi la giornata di chi
l'ha gia' giocata. `/state` non apre niente; `/inizia` fa partire il tempo,
tre minuti. Le risposte si salvano mentre si scrive, una richiesta dopo una
pausa e una subito quando la pagina si nasconde (`keepalive`), e una partita
lasciata a meta' la chiude la prima richiesta dopo il tempo, con le risposte
salvate e il tempo intero, come nel quiz.

**Alla consegna si sa quali risposte valgono, e la notte non lo cambia.** Il
server legge il lessico della lettera dagli asset, come il dizionario dello
Scarabeo (`server/lib/lessicoNomi.ts`), e ne apre solo le cinque categorie del
giorno; le forme riconosciute vanno in `forme`, e la notte conta quelle, non le
ricalcola: quel che il gioco ha detto valere vale anche se nel frattempo il
lessico e' cambiato. Se il lessico non si legge la consegna va avanti, e lo dice
la notte. Nella classificata il telefono il lessico non lo scarica: sarebbe
l'elenco delle risposte giuste, e le piu' rare, a portata di mano.

**La libera e' contro il computer o un amico, e si dice stop.** Come al tavolo,
chi finisce per primo dice «stop!» e smettono tutti di scrivere: il computer lo
dice quando ha finito, prima o dopo secondo il livello, e conta solo quel che
aveva scritto fino allo stop dell'altro (`risultato` in
`src/games/nomi/libera.ts`). Scrive le parole note del lessico (`note`, come le
scriverebbe una persona, le piu' comuni per prime), non quelle rare: con le rare
vincerebbe sempre, e le sue risposte non sembrerebbero di nessuno. I punti sono
quelli del tavolo (venti a chi e' l'unico a rispondere, dieci per una risposta
diversa, cinque per una uguale: `puntiSfida`, in shared/ per la sfida fra
amici). Tutto sta nel telefono; il conto delle partite in
`src/games/nomi/conti.ts`, a parte, perché lo legge la classifica.

**Fra amici l'invito e' gia' la partita, e la lettera esce solo dal via.** Come
in Indovina chi (`nomi_sfide`): quando l'altro accetta, nello stesso `UPDATE`
il server pesca la lettera e le categorie e fissa il via, qualche secondo dopo
(`NOMI_SFIDA_VIA_MS`, il tre-due-uno); prima del via la lettera non esce. Si
scrive insieme, ognuno nella sua colonna, quindi due scritture nello stesso
istante non si pestano. Chi finisce dice stop, e l'altro lo vede al giro dopo,
un secondo, e manda subito il suo foglio: vale quel che arriva entro il margine
della rete. Lo stop o il tempo che finisce non si scrivono da soli: la partita
la chiude la prima richiesta che arriva dopo, che riconosce i due fogli con il
lessico e conta i punti come al tavolo. Il foglio dell'altro esce solo a
partita chiusa, prima si sa solo quante risposte ha scritto. La rivincita
porta avanti la serie, come nella battaglia.

**Gli Anagrammi sono cinque parole al giorno, da cinque a nove lettere.** Le
stesse per tutti, una per lunghezza, e si scelgono come la parola del Wordle:
una permutazione per lunghezza, percorsa un giorno alla volta
(`paroleDelGiorno`), che la notte scrive in `anagrammi_giornate` con `INSERT OR
IGNORE` (`scripts/genera-anagrammi.ts`, il passo "Gli anagrammi" di
`cruciverba.yml`, e il deploy per le prossime due settimane): un elenco rifatto
non cambia una giornata scritta. Se la giornata manca il gioco risponde
`ANAGRAMMI_ASSENTI` (503): in locale, `npm run anagrammi:locale`. Le lettere si
mescolano con un seme del giorno e della parola (`semeMescolata`), e non formano
mai un'altra parola valida. Vale ogni parola con le stesse lettere che il
dizionario conosce ("teatro" per "attore"): a parola chiusa si vede quella
dell'elenco, con la sua definizione, e quella scritta.

**Le parole degli Anagrammi sono le comuni che il Wikizionario definisce.**
`scripts/build-anagrammi.mjs` tiene le parole dei sottotitoli (OpenSubtitles,
almeno trecento volte) che hanno una definizione fra quelle del cruciverba, con
i filtri della grafia del Wordle; le risposte valide sono tutte le forme di
napolux con le stesse lettere. Le lettere di una parola stanno in un elenco solo
(`PARTI`, dall'impronta delle lettere in ordine): due terzi alle classificate e
un terzo alle libere, quindi giocare a caso non mostra mai l'anagramma di una
parola del giorno. Il file delle libere sta sotto `/dati/` con l'impronta
nell'indirizzo, come i file del quiz, e porta le definizioni del Wikizionario:
e' CC BY-SA come loro.

**Negli Anagrammi il tempo lo tiene il server, e una parola vale di piu'
presto.** Novanta secondi a parola (`TEMPO_PAROLA_MS`): l'orologio parte quando
la si apre (`/apri`), fra una parola e l'altra ci si ferma quanto si vuole, e
una risposta vale entro il tempo piu' `MARGINE_ANAGRAMMI_MS`; una parola rimasta
aperta la chiude, persa, la prima richiesta che arriva dopo. Una risposta
sbagliata non si scrive, e si riprova finché c'e' tempo. Venti punti per aver
finito, sei per ogni parola trovata e fino a dieci di bonus, pieno per tre
secondi a lettera e poi a scendere fino allo scadere (`puntiParola`): cento
tutte subito, cinquanta tutte all'ultimo. La definizione costa cinque punti, e una
parola trovata ne vale almeno uno. Guardare non apre niente: la partita nasce
con la prima parola aperta. La libera sta tutta nel telefono, con gli stessi
tempi e gli stessi punti, come il sudoku libero.

**Le Sequenze sono il test dei cubetti di Corsi, con un nome che si capisce.**
Nove cubetti sparsi su una tavola (`CUBETTI` in `shared/sequenze.ts`), alcuni si
accendono uno dopo l'altro e si toccano nello stesso ordine; a ogni sequenza
giusta la prossima ha un cubetto in piu'. E' il test con cui gli psicologi
misurano la memoria visuospaziale (Philip Corsi, 1972), ma "Corsi" a chi gioca
non dice niente, e il gioco si chiama per quel che si fa. I cubetti sono sparsi
e non in una griglia, come sulla tavola vera: in una griglia una sequenza si
ricorderebbe come un disegno di righe e colonne, e un test tiene che tre non
stiano mai in fila. La classificata e' di cinque turni uguali per tutti, ognuno
da tre a nove cubetti, e il primo errore chiude il turno: trenta punti per
averli giocati tutti e due per sequenza giusta, fino a cento (`puntiSequenze`).
Chi arriva a cinque o sei, la media degli adulti, fa sessanta o settanta; a
pari punti conta la sequenza piu' lunga, poi il tempo. Fra un turno e l'altro ci
si ferma quanto si vuole. Ogni cubetto ha la sua nota della scala pentatonica
(`NOTE_CUBETTI`), perché una sequenza si ricorda anche a orecchio, come al Simon.

**Una sequenza si vede una volta, e non esce mai prima.** Le sequenze del giorno
non vengono da un seme che il telefono potrebbe rifare: le pesca a caso il primo
che apre un turno e le salva `sequenze_giornate`, con `INSERT OR IGNORE` e poi
la rilettura, come la parola del Wordle. Ne esce una alla volta: la prima con il
turno (`/sequenze/turno`), ognuna delle altre con la risposta giusta alla
precedente (`/sequenze/risposta`), e lo stato non le porta. Una pagina riaperta
con una sequenza aperta la trova chiusa come sbagliata (`chiudiAperta`, alla
prima `GET /state`): rivederla sarebbe un aiuto, e il turno lo dice
(`riaperto`). Le risposte sono condizionate alla `versione`, come le altre
partite del giorno. Il tempo per ripetere le giuste e' lo spareggio, e lo conta
il server dall'uscita della sequenza alla risposta.

**La libera delle Sequenze va avanti finché non si sbaglia, e la sfida anche.**
La libera sta tutta nel telefono, dal seme della partita (`sequenzaDelLivello`):
oltre i nove cubetti uno torna, mai due volte di fila. I livelli sono il facile,
piu' lento e da due cubetti, il normale della classificata, e "al contrario",
che chiede di toccarli dall'ultimo al primo come la seconda meta' del test di
Corsi; il record di ogni livello sta nel `localStorage` (`games/sequenze/conti.ts`).
Con un amico l'invito e' gia' la partita, come in Nomi, cose e città, e la sala
e l'avviso sono gli stessi (`SalaSfida`, `AvvisoSfida` in `src/games/amici/`).
Quando l'altro accetta il server pesca il seme, che non esce da li': anche qui
la prima sequenza la chiede il telefono al via (`/apri`), le altre arrivano con
la risposta alla precedente, e ognuno scrive nelle sue colonne (`livello_a`,
`aperta_a`, `fine_a`), quindi due risposte insieme non si pestano. Vince chi
arriva piu' lontano, a pari livello e' pari, e la sfida si chiude appena chi
gioca ancora ha superato chi ha finito (`vincitoreDi`). Chi resta fermo con una
sequenza da ripetere per `SEQUENZE_SFIDA_FERMA_MS` ha finito li': ha chiuso
l'app. Ogni risposta fa salire la `versione`, e la chiusura e' condizionata a
quella letta: una risposta arrivata nel frattempo non si perde in un conto
vecchio.

**La Ghigliottina e' quella dell'Eredità, e le parole sono scritte a mano.**
Cinque coppie di parole, in ognuna una sola porta alla parola vincente, venti
secondi a coppia; poi un minuto e mezzo per scriverla (`shared/ghigliottina.ts`). Le ghigliottine stanno in
`scripts/data/ghigliottina.tsv`, la vincente e le cinque parole con
l'espressione che le lega ("colpo di fulmine"): nessun elenco libero le ha.
`npm run ghigliottina:build` (`scripts/build-ghigliottina.mjs`) le controlla — la
parola sta nella sua espressione, nessuna ha la radice della vincente, nessuna
indica un'altra vincente meglio di questa — e sceglie le esche: le cinque
parole giuste di un'altra ghigliottina, tutte della stessa, cosi' chi sbaglia
strada segue un'idea che sta in piedi, accoppiate per somiglianza (parte del
discorso, genere e numero, lunghezza, frequenza) perché la forma non dica qual
e' la giusta. Un'esca non deve legarsi alla vincente, e lo script lo sa dalle
espressioni del Wikizionario e del Wiktionary (le estrazioni del dizionario
dello Scarabeo), dalle parole composte di napolux e da quelle dell'elenco; le
righe con il punto esclamativo ("!colpo duro") dicono quelle che le fonti non
conoscono: senza, "duro" faceva da esca a COLPO. Le vincenti si dividono fra
classificate (due terzi, `scripts/data/ghigliottina-classificate.json`, che legge
solo la notte) e libere (`public/dati/ghigliottina/libere.json`, con l'impronta
in `shared/ghigliottina-libere.ts`), e ognuna prende le esche dalla sua parte:
il file del telefono non ha nessuna parola delle classificate. La notte
(`scripts/genera-ghigliottina.ts`, il passo "La Ghigliottina" di
`cruciverba.yml`, e il deploy per due settimane) scrive la giornata in
`ghigliottina_giornate` con `INSERT OR IGNORE`: l'ordine delle coppie e da che
parte sta la giusta vengono dal numero del giorno, e una giornata scritta non
cambia. Se manca, `GHIGLIOTTINA_ASSENTE` (503): in locale
`npm run ghigliottina:locale`.

**Nella Ghigliottina il server dice la giusta solo dopo la scelta, e la vincente
solo alla fine.** `/state` manda le coppie scelte e quella da scegliere, mai
quelle dopo; di una coppia si sa qual era la giusta solo scelta (`/scegli`, che
a un doppio tocco risponde come la prima volta), e la vincente e le
espressioni solo a partita chiusa. Prima di Comincia (`/inizia`, che fa nascere
la partita) non esce nessuna coppia: vista prima del tempo sarebbe tempo
regalato. I tempi li tiene il server, con il margine della rete del quiz: ogni
coppia ha venti secondi (`TEMPO_SCELTA_MS`, da `coppia_at`, scritto dopo la
scena che la porta: `preamboloCoppia`), e finiti conta sbagliata (una scelta
`null`, `scaduta` nella vista); la parola vincente un minuto e mezzo
(`finale_at`, scritto da `/finale`), e la risposta e' una sola. Allo scadere di
una coppia il telefono lo dice subito (`/tempo`); un tempo passato lo applica la
prima richiesta dopo, dalla scadenza (`chiudiScadute`), e se finiscono cosi'
tutte le coppie parte anche la finale, e si chiude: chi ha chiuso la pagina non
resta "in corso" per sempre. I punti sono l'eccezione al principio del Wordle,
perché il gioco e' quello della televisione: ogni scelta sbagliata dimezza il
montepremi (100, 50, 25...), e una vincente sbagliata o non data vale zero. Le
cinque parole si vedono sempre, quindi anche con cinque errori la vincente si
puo' trovare. Nella classifica a pari punti contano le vincenti indovinate, poi
il tempo per scriverle. La scena (`src/games/ghigliottina/Partita.tsx`) e' una
macchina a fasi con i suoi tempi (`tempi()`): la coppia arriva con il suo
anello che si svuota, la scelta aspetta un respiro ("Vediamo…"), e una
sbagliata, o il tempo finito, fa cadere la lama sul montepremi, che si spezza:
i pezzi hanno il numero di prima, e sotto c'e' gia' quello dimezzato (`Taglio`
porta tutti e due). Era il contrario, e per due secondi sotto la targa spaccata
restava il montepremi intero. La vincente si scrive con la tastiera del gioco
(`TastieraGioco`, la stessa della Catena), e intanto la ghigliottina si fa
piccola e le cinque parole salgono sopra di lei in due file, scivolando dal loro
posto (`useScivola`, un FLIP con le Web Animations): si leggono mentre si
scrive. La vincente arriva in una busta e si gira lettera per lettera. La festa
aspetta il verdetto, e la libera sta tutta nel telefono, con le stesse regole e
i tempi che si scelgono.

**La Catena e' l'ultima catena di Reazione a catena, e le catene vengono dalle
espressioni.** Undici parole, ognuna legata alla successiva da un'espressione
(spirito LIBERO, tiro libero): si vede una coppia e della parola in mezzo la
prima lettera, trovata quella si scende alla coppia dopo, e le parole da
indovinare sono cinque, l'ultima la finale (`shared/catena.ts`). Le catene le
scrive `npm run catena:build` (`scripts/build-catena.mjs`) da una rete di
parole: le espressioni scritte a mano della Ghigliottina e quelle di due parole
del Wikizionario fra parole comuni. Ogni parola da indovinare ha almeno un
legame scritto a mano — la finale proprio quello con la parola sopra, perché il
terzo elemento si puo' non vedere —, e con le lettere che se ne vedono e' l'unica
della rete che sta con le due accanto. Le classificate
(`scripts/data/catena-classificate.json`, che legge solo la notte) e le libere
(`public/dati/catena/libere.json`, con l'impronta in `shared/catena-libere.ts`)
si scelgono insieme, e un'espressione di una parte non sta nell'altra. La notte
(`scripts/genera-catena.ts`, il passo "La Catena" di `cruciverba.yml`, e il
deploy per due settimane, sempre dopo la Ghigliottina) scrive la giornata in
`catena_giornate` con `INSERT OR IGNORE`, e salta la catena che ha fra le sue
parole la vincente della Ghigliottina dello stesso giorno: le espressioni sono
le stesse, e la direbbe. Se manca, `CATENA_ASSENTE` (503): in locale
`npm run catena:locale`.

**Nella Catena la verita' sono le mosse, e i tempi partono da soli.**
`catena_partite.mosse` ha le parole provate, i jolly, il terzo elemento comprato
e i tempi finiti (`t`); montepremi, lettere viste e terzo elemento si ricavano
rigiocandole (`svolgiCatena`), con le stesse regole nel server e nel telefono
della libera. Un errore dimezza e mostra un'altra lettera, il secondo dimezza e
mostra la parola, e cosi' il minuto di una parola finito (`TEMPO_PAROLA_CATENA_MS`):
senza un tempo chi ci pensa abbastanza troverebbe ogni parola. I jolly sono due,
non si usano nella finale, e ne' un jolly ne' un errore mostrano l'ultima
lettera. Della finale si vedono le prime due lettere e l'ultima; il terzo
elemento si compra dimezzando, e chi arriva con tutti e due i jolly lo ha in
regalo. Il montepremi parte da cento come quello della Ghigliottina e non scende
sotto uno, perché la finale valga sempre qualcosa; sbagliata vale zero.
`vistaCatena` manda solo le parole fino alla coppia di adesso, e di quella da
indovinare le lettere, non la lunghezza: con le caselle tutte in vista sbagliare
era quasi impossibile, e la parola ora cresce a ogni tasto. Prima di Comincia
(`/inizia`, che fa nascere la partita) non si vede nessuna parola. I tempi li
scrive il server con la mossa che ci porta, dopo il tempo della scena: il minuto
della parola (`parola_at`, `PREAMBOLO_PAROLA_CATENA_MS`) e il minuto e mezzo
della finale (`finale_at`, `PREAMBOLO_FINALE_CATENA_MS`); un tempo da far
partire col telefono non partirebbe mai per chi vuole pensarci. Allo scadere di
una parola il telefono lo dice (`/tempo`, la miccia della scena); un tempo
passato lo applica la prima richiesta dopo, dalla scadenza (`chiudiScadute`), e
una parola arrivata dopo trova la versione cambiata. Si scrive con la tastiera
del gioco (`TastieraGioco`), come il Wordle: con quella del telefono aperta la
catena non si vedrebbe. La parola da indovinare non ha caselle: e' un riquadro
sempre della stessa misura (`Scrittura` in `Partita.tsx`), con le lettere che si
vedono, tessere d'oro, e accanto la riga su cui si scrive, con il cursore. Con
una casella per lettera, una lettera data e la casella vuota della prossima
sembravano una parola di due. Nella finale l'ultima lettera chiude la riga
dall'altra parte, e si scrive in mezzo. Le caselle tornano a parola trovata o
mostrata, quando la lunghezza non e' piu' un segreto.

**Il Paroliere e' il Boggle, con il dizionario dello Scarabeo.** Sedici dadi in
una griglia di quattro (`DADI` in `shared/paroliere.ts`, con le lettere del
gioco e la "Qu" su una faccia sola), tre minuti, e una parola vale se si
scrive passando da un dado a uno vicino, anche di sbieco, senza ripassare;
da tre lettere in su, con i punti del Boggle (1, 1, 2, 3, 5, 11). Vale ogni
parola del dizionario intero, plurali e voci dei verbi comprese, come al
tavolo. La griglia del giorno la sceglie la notte (`scripts/genera-paroliere.ts`,
il passo "Il Paroliere" di `cruciverba.yml`, e il deploy per due settimane):
tira i dadi con il seme del giorno finché non esce una griglia con almeno
ottanta parole comuni (`grigliaDelGiorno`), e la scrive con le comuni e il
traguardo in `paroliere_giornate` (`INSERT OR IGNORE`). Il traguardo e' un
quinto del punteggio di tutte le comuni, fra 25 e 60 (`traguardoDi`): le
griglie non sono uguali, e chi trova meta' delle parole in una griglia povera
ha giocato quanto chi ne trova meta' in una ricca. I punti sono venticinque per
aver giocato e settantacinque in proporzione al traguardo, che oltre non
crescono (`puntiParoliere`); in classifica a pari punti conta il punteggio
sulla griglia, che oltre il traguardo continua a salire. Se la giornata manca,
`PAROLIERE_ASSENTE` (503): in locale `npm run paroliere:locale`.

**Nel Paroliere la griglia esce con la clessidra, e ogni parola va al server.**
`/state` non apre niente e non manda i dadi; `/inizia` fa partire i tre minuti
e li manda. Ogni parola passa da `/parola`, che guarda la strada sulla
griglia (`stradaDi`) e il dizionario (`paroleSconosciute`, lo stesso DAWG dello
Scarabeo letto dagli asset), e la scrive condizionata alla `versione`; dopo il
tempo piu' il margine non vale, e la prima richiesta chiude la partita. Il
telefono le manda una alla volta, in fila (`useParoliereDelGiorno`): chi
traccia veloce non aspetta la risposta per la prossima, e le parole arrivano
nell'ordine in cui sono state trovate. Le comuni della griglia escono solo a
partita finita. La libera sta tutta nel telefono: i dadi li tira il
lavoratore dello Scarabeo (`grigliaLibera`, con quattro o cinque dadi per
lato), che ha gia' il dizionario e manda con la griglia tutte le sue parole,
cosi' ogni parola si controlla subito; il tempo parte quando i dadi sono
fermi. Il traguardo e' misurato sulla griglia di sedici in tre minuti, e con un'altra griglia o un altro tempo non c'e'.

**I dadi del Paroliere si tracciano col dito, e il dito lo sente la griglia.**
`Griglia` (`src/games/paroliere/`) cattura il puntatore sul contenitore e
calcola il dado sotto il dito dalla posizione: un dado che catturasse il
puntatore non saprebbe degli altri. Scorrendo vale solo il centro di ogni dado
(`DENTRO`), perché passando fra due dadi di lato il dito sfiora gli angoli di
quelli in diagonale; tornando sul dado di prima si toglie una lettera. Si gioca
anche a tocchi — le lettere una alla volta, e di nuovo l'ultima per mandare —
e con la tastiera del computer, che scrive la parola e ne cerca la strada.
I dadi sono bottoni, e il clic che il browser manda dopo un tocco non va
contato (`CLIC_DOPO_TOCCO_MS`): contato, ogni tocco mandava la sua lettera da
sola, ed e' venuto fuori provando con Playwright. Com'e' andata una parola lo
dicono i suoi dadi, verdi, gialli se c'era gia', rossi se non esiste, e la
riga sopra la griglia; la scena ha la cupola che si alza, i dadi che si
scuotono con le facce che passano e cadono a onde, la clessidra che si gira e
il timbro "Tempo!".

**Le righe dei giocatori sono larghe quanto il tavoliere.** In `Tavola` il
gruppo — l'altro, il tavoliere, io — e' una griglia larga quanto il tavoliere:
le righe hanno `width: 0` e `min-width: 100%`, quindi la riempiono senza
allargarla. Il tavoliere si misura su `--campo-alto`, l'altezza del campo meno
le due righe. Sul telefono di traverso campo e gruppo diventano
`display: contents` e i giocatori vanno a destra del tavoliere: sopra e sotto
non ci starebbero.

**Con gli amici si gioca in due modi, e un gioco nuovo sceglie il suo.** I
giochi con una soluzione — il Wordle, il cruciverba, lo Scarabeo — si giocano
**in compagnia**: uno gioca, gli altri guardano e suggeriscono, nella
classificata con il suo stesso punteggio e nella libera senza punti. I giochi a
turni o a tempo fra due — la battaglia, il quiz, il tris, Nomi cose e città, le
Sequenze, i tavolieri — si giocano **in sfida**, e solo nelle libere: la classificata e' una
partita uguale per tutti, e un amico la cambierebbe. In sfida si giocano anche
le libere che si giocano da soli — il sudoku, gli Anagrammi, il Paroliere, la
Ghigliottina, la Catena —, sulla stessa partita nello stesso momento (vedi
sotto). Lo Scarabeo ha tutte e due:
in compagnia contro il computer, nella classificata e nella libera, e in sfida
con un amico nella libera, perché e' un gioco a turni fra due anche al tavolo.
Contro il computer dove ha senso: non in Indovina chi, che si gioca parlandosi,
ne' nel quiz, dove il computer saprebbe tutte le risposte, e li' si gioca da
soli. Il sudoku non si gioca in compagnia: guardarlo fare non insegna niente, e
suggerire una cifra vorrebbe dire darla; si sfida. Contro chi si gioca lo dice
l'interruttore Computer | Amico, o Da solo | Con un amico dove il computer non
c'e', ricordato per gioco. Un gioco nuovo prende le regole della sua famiglia
invece di inventarne di nuove.

**Le libere da soli si sfidano sulla stessa partita.** Il sudoku, gli
Anagrammi, il Paroliere, la Ghigliottina e la Catena hanno una sfida sola, in
una tabella sola (`sfide_libere`, `shared/sfide-libere.ts`): chi sfida sceglie
le opzioni della libera, che viaggiano con l'invito; quando l'altro accetta il
server pesca il seme, e dal via ognuno gioca sul suo telefono la partita che il
seme da' a tutti e due, con il motore e la scena della sua libera
(`src/games/<gioco>/Sfida.tsx`, dentro `PaginaSfida`). Vince chi fa piu' punti,
e a pari punti chi ci ha messo meno. I conti li fa il telefono e li manda
mentre gioca (`/avanza`, uno ogni `SFIDE_LIBERE_AVANZA_MS`, e la fine subito):
e' un'amichevole, come la sfida a quiz, e il server guarda solo la misura
(`avanzamentoValido`); i motori non starebbero nei dieci millisecondi. Tre cose
che non si vedono. Il seme esce solo dal via, perché chi lo sapesse prima
potrebbe prepararsi lo schema. Una partita si gioca una volta: il telefono dice
al server che parte (`/parti`), e la seconda volta — la pagina ricaricata, o
lasciata e ritrovata — la sua partita finisce li', con quel che aveva detto;
rigiocarla da capo, con le parole gia' viste, sarebbe un aiuto (in sviluppo
React monta due volte, e `partenze` tiene la richiesta per un attimo). E la
sfida si chiude comunque a `scade_at`, il via piu' la durata massima del gioco
(`durataMassimaMs`): chi chiude l'app non fa aspettare l'altro per sempre. Il
sudoku in sfida non ha aiuti, ha un tempo, e si chiude da solo quando l'altro
l'ha gia' risolto; la Ghigliottina e la Catena hanno due tempi, quello di ogni
passo — una coppia, una parola — e quello della finale (`passo`, `secondi`). Una sfida alla volta, a tutti e cinque i giochi insieme; gli
inviti, il link, la rivincita con la serie e la sala sono quelli delle
Sequenze, e l'avviso (`SfideGate`) dice anche le opzioni, perché si accetta
una partita precisa. Le opzioni stanno nella carta "Partita" come nel quiz
(`Opzioni` e `Scelte` in `src/components/Opzioni.tsx`), con il tempo su un
cursore: le stesse da soli e con un amico, ricordate per gioco
(`useOpzioniLibera`).

**Le libere del Wordle, del cruciverba e dello Scarabeo si guardano in
compagnia.** Una compagnia per host e gioco (`modalita = 'libera'`) segue la
partita che l'host sta giocando: il suo indirizzo sul server (`partita_id`), o
le mosse dello Scarabeo libero, che sta tutto nel suo telefono e le manda a ogni
mossa (`stato`, ricontrollate dal server con `statoLibera` prima di accettare un
suggerimento). Chi guarda la vede cambiare quando l'host passa a un'altra
partita, e suggerisce come nella classificata. Non ci sono punti, quindi chi e'
dentro si puo' mandare via, e la compagnia si chiude quando si vuole: chiusa, si
porta via inviti e suggerimenti. Un invito a una libera vale due ore
(`INVITO_LIBERO_MS`), perché si gioca adesso.

**Ogni gioco ha una classificata e una libera.** La **classificata** e' una al
giorno, uguale per tutti, contro il computer o contro il gioco stesso, e fa i
punti. La **libera** e' quante se ne vuole, a caso, e non entra in classifica:
Wordle con una parola a caso, Scarabeo fino in fondo al sacchetto contro il
computer o un amico, cruciverba da una scorta di schemi, quiz sulla materia, la
categoria, il modo, la zona o l'ambito e le opzioni che si scelgono, Nomi, cose
e città con una lettera a caso contro il computer, Anagrammi con cinque parole a
caso della lunghezza e con il tempo che si sceglie, Sequenze finché non si
sbaglia, Ghigliottina e Catena con una a caso e il tempo della finale che si
sceglie, Paroliere con una griglia a caso di sedici o venticinque dadi e il
tempo che si sceglie. Gli indirizzi dicono sempre dove si e':
`/<gioco>/classificata`, `/<gioco>/libera` (`src/app/rotte.ts`, che ha l'elenco
completo, e i vecchi indirizzi portano ai nuovi in `App.tsx`); `/<gioco>` da
solo porta alla classificata. I giochi da tavolo non hanno ne' l'una ne'
l'altra: la loro sala e' `/<gioco>`, e da li' `/computer`, `/partita/:id`,
`/invito/:codice` (`/scacchi`, `/dama`, `/forza-4`, `/go`); la battaglia ha la
sala a `/battaglia-navale` e le partite a `/battaglia-navale/partita/:id`, anche
contro il computer, che sta sul server. Il tris e' un tavoliere come gli altri,
ma la sua sala sta a `/tris/libera`, l'indirizzo di quando aveva anche la
classificata. Lo Scarabeo con un amico sta sotto la
sua libera: `/scarabeo/libera/partita/:id` e `/scarabeo/libera/invito/:codice`,
e cosi' le sfide delle libere da soli: `/paroliere/libera/sfida/:id` e
`/paroliere/libera/invito/:codice`.

**Il Wordle libero non pesca le parole dei prossimi giorni.** `wordleLibera.ts`
esclude le soluzioni dei prossimi sessanta giorni: altrimenti giocare a caso
diventerebbe un modo di vedere in anticipo la classificata di un giorno che
arriva, e chi gioca tanto partirebbe avvantaggiato.

**Il traguardo dello Scarabeo lo gioca il computer, la notte prima.**
`scripts/genera-computer-scarabeo.ts` fa giocare al computer normale ogni
giornata come la trova chi gioca — dieci mosse a testa contro il computer del
giorno, con le tessere del giorno (`giornataATurni`) — e scrive il suo punteggio
in `scarabeo_computer`: il traguardo di una giornata non cambia, altrimenti due
giocatori dello stesso giorno avrebbero punti su scale diverse. I punti sono
`100 × punteggio / traguardo`, fino al tetto (`puntiScarabeo`): il rapporto
invece di una scala fissa tiene conto della fortuna del sacchetto. Il traguardo
e' il computer al posto di chi gioca, e non il punteggio dell'avversario nella
stessa partita, perché quello cresce con la partita: in rapporto a lui una buona
prima mossa, e poi basta, varrebbe il tetto, e chiudere la giornata quando si e'
avanti converrebbe sempre. Non si fa nel Worker — una mossa del computer costa
decine di millisecondi — e se la riga manca si usa `RIFERIMENTO_SCARABEO`, che a
turni e' rimasto giusto (su quaranta giornate 247 di media, contro i 243 da
solo). Le mosse del traguardo si mostrano solo a giornata chiusa: prima
sarebbero la soluzione.

**La giornata si gioca come il suo traguardo.** `scarabeo_computer.formato` dice
com'e' stato giocato: 1 da solo, le dieci mosse senza avversario delle giornate
di prima dei turni, 2 a turni. `apriPartita` ne ricava `contro_computer` (un
traguardo che manca si scrive di ripiego a turni), cosi' chi gioca lo stesso
giorno gioca la stessa partita. Lo script della notte rifà i traguardi da solo
dei giorni che devono venire e che nessuno ha aperto (`giornateFerme` e
`scriviTraguardo` in `scripts/scarabeo/traguardo.ts`, con la stessa condizione
nell'aggiornamento, per una giornata aperta nel frattempo): oggi e i giorni
passati restano come sono, e il giorno del deploy si gioca da soli fino a
mezzanotte.

**La classificata dello Scarabeo e' a turni contro il computer del giorno.** Una
mossa a testa, come al tavolo: il computer normale risponde a ogni mia mossa,
anche alla decima, e il suo caso viene dal numero del giorno
(`semeDellAvversario`), quindi a mosse uguali risponde uguale. Pensa nel
telefono, nel Web Worker del dizionario (`rispostaDelGiorno`), e la sua mossa va
al server con la mia: un turno, una richiesta, e la pagina le racconta in ordine
— la mia, «Il computer pensa…», la sua (`primaDellaRisposta`). Il server non la
puo' rifare, ma la controlla come una mia: le tessere del suo leggio, la posa in
piedi, le parole nel dizionario, il cambio con il sacchetto che ne ha
(`rispostaControllata`). Che sia proprio quella del computer non lo sa: chi
volesse barare allo Scarabeo ha gia' il motore nel telefono, e scegliere anche
le mosse dell'avversario non gli darebbe molto di piu'. I punti in classifica
restano i miei, in rapporto al traguardo; il punteggio dell'avversario e' per il
tabellino, l'hub e la festa, che e' per chi lo batte.

**Lo Scarabeo libero e' la partita intera, fino in fondo al sacchetto.** Finisce
come dice il regolamento: quando il sacchetto e' vuoto e uno dei due posa la sua
ultima tessera, che prende il valore di quelle rimaste all'altro mentre l'altro
lo perde; o dopo sei turni di fila senza una parola (`TURNI_SENZA_PAROLE`, tre a
testa, come nei tornei), e ognuno perde il valore delle sue. Contro il computer
gira tutto nel browser: il computer e' un Web Worker con il dizionario intero,
lo stesso file che legge il server (vedi sopra), la partita si salva come mosse
nel `localStorage` a ogni turno, e a fine partita va al server, che la rigioca
con le stesse regole per le statistiche. Il computer usa lo stesso motore
(`shared/scarabeo-motore.ts`) del traguardo della classificata, con tre fasce di
scelta: facile, normale, difficile. Con un amico si gioca sul tavolo del server
(vedi sotto).

**Lo Scarabeo fra amici sta sul tavolo dei tavolieri, con le tessere nascoste.**
Le partite sono righe di `tavolo_partite` con `gioco = 'scarabeo'` — l'invito,
l'accettazione, i turni condizionati alla versione, la resa, la vittoria a
tavolino, la rivincita con la serie — e le regole stanno dietro
`RegoleTavoliere` come quelle degli altri (`shared/scarabeo-amici.ts`). Due cose
in piu', che i tavolieri non hanno. La posizione salvata e' il seme del
sacchetto con le mosse, e non esce dal server, perché il seme direbbe le tessere
di tutti: a ognuno arriva la sua vista (`vistaDi`), con il suo leggio, quante
tessere ha l'altro e i cambi dell'altro senza le tessere. E una posa passa anche
dal dizionario (`parole`), dopo le regole, che costano meno. Ogni partita, e
ogni rivincita, ha un sacchetto nuovo (`nuova`). `GiocoAlTavolo` e' i tavolieri
piu' lo Scarabeo: gli inviti, gli avvisi e le partite aperte lo usano, le pagine
dei tavolieri restano su `GiocoTavoliere`. La pagina della partita ha un suo
hook (`useScarabeoAmico`) e non `useTavolo`, che si porta dietro le regole di
scacchi, dama e go per mostrare la mossa prima della risposta: qui le tessere da
pescare le sa solo il server. La sala e' la libera (`/scarabeo/libera`, con
l'interruttore Computer | Amico), e il pannello degli inviti e' quello dei
tavolieri (`SalaAmico.tsx`).

**La battaglia navale non ha piu' la classificata.** Fino al 6 ottobre 2026
c'era: una al giorno contro il computer facile, con la flotta uguale per
tutti. Ma la partita si decide in buona parte con la fortuna dei primi colpi,
e una giornata non misurava come si era giocato; ora la battaglia e' un gioco
da tavolo. Le partite di allora restano in `battaglia_partite`
(`modalita = 'classificata'`): i loro punti stanno nella generale dei periodi
che le comprendono, in una colonna a parte (`GeneraleRow.battaglia`, e la
stessa somma in `puntiClassificateDi`), perché una giornata vale quel che
valeva; una rimasta a meta' si finisce come una partita contro il computer,
senza punti. `/battaglia/classificata`, `/battaglia/summary` e
`/leaderboard/battaglia` non ci sono piu', e i vecchi indirizzi della
classificata e della libera portano alla sala. Contro il computer il suo
colpo arriva nella stessa richiesta del tuo — una scrittura sola per turno —
la pagina lo mostra dopo un respiro (`primaDelComputer` in `useBattaglia.ts`),
e non c'e' polling: non c'e' niente da aspettare.

**Il turno contro il computer si racconta a pezzi, ma la richiesta e' una.**
Il colpo del computer arriva nella risposta al mio: `useBattaglia` lo toglie
(`primaDelComputer`), mostra il mio colpo con il suo annuncio, poi il mirino
del computer che cerca sul mio mare (`MIRA_MS`), poi il suo colpo. Se un colpo
chiude la partita, prima si vede il colpo (`senzaFine`) e solo dopo la
schermata di fine: passarci subito farebbe perdere proprio il colpo che ha
deciso. Mentre si racconta un turno il polling non applica niente
(`racconto`): una vista arrivata a meta' salterebbe avanti.

Le lunghezze delle navi nemiche si sanno dall'inizio, come sul foglio del
gioco su carta: `naviNemiche` le mostra tutte, con le caselle vuote. Quale nave
si e' colpita e dove sta si scopre solo all'affondamento.

**Un amico si invita anche con un link.** `POST /battaglia/link` crea un invito
valido `LINK_SCADENZA_MS` (un giorno), uno per volta; `/battaglia-navale/invito/:codice`
lo apre. Chi non ha un account passa dalla registrazione, che lo dice
(`Welcome` riceve il codice e legge chi invita da `GET /api/inviti/:codice`,
l'unica rotta di gioco senza sessione, che dice solo il nome di chi invita), e
appena entra la pagina dell'invito accetta da sola: aprire il link e' gia' la
risposta. L'accettazione e' un `batch` condizionato come quello delle sfide,
quindi due persone con lo stesso link non aprono due partite. La presenza
riporta solo le partite fra amici: una partita col computer lasciata a meta' non
deve comparire come "la battaglia con X e' in corso".

**La rivincita e' una sfida che porta avanti la serie**, nella battaglia fra
amici e nella sfida a quiz. A partita finita tutti e due possono chiedere
"Gioca ancora"; se l'altro l'aveva gia' chiesta, chiederla e' accettarla, e si
parte subito. La sfida ha `rivincita_di`, e la partita nuova nasce con il conto
delle precedenti: nella battaglia le vittorie di ciascuno (`serie_a`, `serie_b`,
`partite_serie`), contate per giocatore perché chi chiede la rivincita diventa
'a' anche se prima era 'b'; nel quiz i punti, con i due che restano ai loro
posti. A partita finita la pagina della battaglia continua a guardare, piu'
piano (`BATTAGLIA_POLL_LOBBY_MS`): e' li' che arriva la risposta.

**La sfida a quiz e' un'amichevole a tempo, e la verita' sono le risposte.**
Due giocatori, le stesse domande nello stesso momento: il primo che risponde
giusto prende il punto; chi sbaglia e' fuori da quella domanda e all'altro il
tempo va al rallentatore — quel che resta dura il doppio (`RALLENTY`), e
l'orologio segna gli stessi secondi che scendono alla meta'
(`secondiMostrati`); se sbaglia anche lui, o finisce il tempo, il punto non e'
di nessuno. `quiz_duelli` salva le domande e le risposte, nell'ordine di arrivo
e con l'ora del server; quale domanda e' aperta, fino a quando per ciascuno e
chi ha i punti lo ricava `statoSfida` da quelle e da `inizio_at`, e il tempo
che finisce non si scrive. Una risposta e' condizionata al numero di quelle
gia' arrivate (`json_array_length`): due risposte nello stesso istante le
ordina il server. La prima domanda si apre quando sono arrivati tutti e due
(`pronto_a`, `pronto_b`, piu' il tre-due-uno), e i telefoni tengono
l'orologio sull'ora del server.

Le domande le fa **il browser di chi sfida**, con i dati che ha gia' per la
libera: il Worker non ha i dieci millisecondi per farle, ne' una notte per
prepararle come la classificata. Vanno al server con le risposte, che le
controlla (`leggiDomande`) e le manda ai due una alla volta, senza. Chi sfida
potrebbe guardarle: e' un'amichevole, e il prezzo di non avere un generatore
sul server. Si gioca sempre a tempo e al massimo con venti domande, senza aiuti
(`sfidaDalleScelte`); le rotte stanno dentro quelle del quiz, che controllano
la sessione. Il polling e' di un secondo a domanda aperta, una richiesta sola
nella pausa, all'ora in cui si apre la prossima (cadenze in `shared/config.ts`).
**Niente resta**: i punti non vanno in classifica, e sfide e duelli piu'
vecchi di un giorno si cancellano quando se ne crea uno nuovo. L'invito con il
link a una sfida vale un'ora, perché si gioca in due nello stesso momento; la
rotta pubblica `GET /api/inviti/:codice` cerca il codice fra quelli della
battaglia e fra quelli del quiz.

**Le domande del quiz si fanno la notte, e la classificata e' una categoria
sola, di qualunque materia, in un modo solo.** `scripts/genera-quiz.ts` (il
passo "Il quiz" di `cruciverba.yml`, e il deploy per le prossime due settimane)
scrive in `quiz_giornate` le dieci domande di ogni giornata, risposte comprese,
con `INSERT OR IGNORE`: come gli schemi del cruciverba, una giornata scritta non
cambia piu'. Sono deterministiche dal numero del giorno, evitano i soggetti
della stessa categoria delle cinque settimane prima, e categoria e modo li
decide `giornataDelQuiz`: giri di diciotto giorni, uno per categoria — tutte, le
città comprese — in un ordine mescolato ogni volta. Le dieci categorie delle
altre materie fanno da divisori — ogni giorno di geografia sta dopo una di loro,
e ogni giro comincia con una di loro — quindi due giorni di geografia non sono
mai di fila, nemmeno a cavallo di due giri. Al confine i primi quattro giorni
non ripetono gli ultimi quattro del giro prima (`CONFINE_DEL_GIRO`), quindi una
categoria non torna prima di cinque giorni: prima al cambio di giro si leggeva
"Libri, Fiumi, Libri, Fiumi". Il calendario lo usa solo lo script della notte,
il server legge la categoria dalla giornata salvata: cambiarlo tocca solo i
giorni ancora da scrivere. Due giorni di geografia per giro sono sulla cartina
muta (`GIORNI_CARTINA_PER_GIRO`), mai quelli degli oceani e delle città
(`CARTINA_DEL_GIORNO`): gli oceani sono cinque, e seicento pallini sul mondo non
sono una partita. Se la giornata manca il gioco risponde `QUIZ_ASSENTE` (503) e
la card dell'hub dice "Non ancora pronto": in locale, `npm run quiz:locale`.

L'unica eccezione al "non cambia piu'" e' `FORMATO`: una giornata di un formato
vecchio **nel futuro e che nessuno ha aperto** si riscrive (`DA_RIFARE`), perché
nessuno l'ha vista. Il 2 e' quello del modo e del `luogo` di ogni domanda, che la
cartina mostra a risposta data; il 3 quello delle altre materie, con il
calendario nuovo: le giornate gia' scritte con il calendario di sola geografia
si rifanno, se nessuno le ha aperte. Il 4 e' quello di "Accadde oggi" che
chiede sempre l'anno (vedi sotto), e rifà solo le giornate di "Accadde oggi"
(`formatoMinimo`): quelle delle altre categorie scritte col 3 sono gia' come le
farebbe adesso. Il 5 e' quello delle domande piu' facili (vedi sotto), con il
calendario delle diciotto categorie, e rifà tutte le giornate future che
nessuno ha aperto: domani puo' avere la categoria di oggi, ed e' il prezzo di
un calendario nuovo. Oggi e il passato restano come sono, anche di un formato
vecchio, e la colonna `formato` (migrazione `0016`) dice di quale.

**Le città entrano nella classificata, ma solo a scelta.** Erano della sola
libera, perché le principali di un paese lontano non le sa nessuno; ora la
classificata le pesca fra le note — le seicento piu' note del mondo, le trecento
di ogni continente (`cittaDellArea`, la stessa regola per lo script della notte
e per il browser) — e non le gioca mai sulla cartina. Una città che ha il nome
del suo stato o della sua regione non si chiede (`cittaRipete`): "quale di
queste città si trova a Singapore?" si risponde leggendo. La libera comincia da
un menu delle materie (`/quiz/libera`), e ogni materia ha la sua pagina
(`/quiz/libera/geografia`, `VOCI_MATERIE` in `quiz/testi.ts`) con le sezioni e
le opzioni; la partita sta all'indirizzo del menu con le scelte
(`?categoria=…`), così i link di prima funzionano ancora. Al posto della zona le
altre materie hanno l'ambito (`AMBITI`: un periodo, un premio), "Accadde oggi"
il giorno. Gli argomenti della scienza no: chimica e astronomia chiedono cose
diverse, e nella pagina sono sottocategorie (una categoria con l'ambito fisso),
mentre per il modello e per la classificata la scienza resta una categoria sola.
Le opzioni della partita sono una per tutte le materie; le sezioni, la zona e
l'ambito si ricordano per materia. Anche il resto della classificata e' fisso —
dieci domande, il tempo del server, la cartina o la scheda che insegnano,
"Avanti" a mano, niente aiuti — e la libera ne sceglie poco, con le stesse tre
parti in tutte le materie: le sezioni, la partita (come si risponde, nella
geografia; dove o su cosa; quante domande, con `QUANTE_LIBERE` fino a cinquanta,
e il tempo) e la difficoltà, che fa partire la partita come nelle sale dei
giochi da tavolo. In cima, "Da solo | Con un amico" come Computer | Amico nelle
sale: con un amico la difficoltà apre il foglio della sfida, e i cursori
mostrano i valori della sfida (`QUANTE_SFIDA`, `SECONDI_SFIDA`), il piu' vicino
a quello scelto prima: cinquanta domande da soli sono venti in due. La
spiegazione dopo ogni risposta c'e' sempre. Le opzioni di prima — gli aiuti, i
tipi di domanda, quante risposte, la morte improvvisa — c'erano e non le usava
nessuno: il motore le ha ancora (la sfida e il server le leggono), ma `valide`
le rimette ai valori di sempre, anche da un indirizzo o da una scelta salvata.
L'indirizzo porta solo quel che non e' come di solito, così una partita si
condivide con un link che si legge.

**Una libera mescola le sezioni di una materia.** Le tessere della pagina si
scelgono anche insieme — le bandiere con le città e gli stati, la chimica con i
Nobel — e sono caselle da spuntare, almeno una. `partitaMista` divide le
domande in parti uguali, prende dalle altre quel che manca a una sezione corta
(gli oceani sulla cartina sono cinque), non ripete un soggetto fra due
sezioni e le mescola tenendo la salita della difficoltà; ogni domanda porta la
sua sezione (`categoria`, `ambito`), che la carta mostra sopra il testo con il
suo emblema. L'indirizzo le elenca (`?sezioni=bandiere,citta`), e la sfida le
porta nelle impostazioni, che il server rilegge: una materia sola, almeno due
sezioni. La zona resta solo se la capiscono tutte, cioe' nella geografia; gli
anni, il genere e il giorno valgono per una sezione sola, e mescolando si
tolgono.

**Le difficoltà sono fasce di notorietà, non fette dell'elenco.**
`gruppiDiNotorieta` divide un elenco in famosi (il quinto piu' noto, fra venti
e sessanta), noti (fino alla meta', al piu' duecentocinquanta) e il resto, e
`soggetti` pesca da ogni fascia: il facile solo i famosi; il normale meta'
famosi, quattro decimi noti e un decimo il resto; il difficile nessun famoso e
sette decimi il resto. Prima le fasce erano percentuali dell'elenco: fra mille
quadri il facile pescava nei primi trecento, e per chi giocava le tre
difficoltà erano la stessa. Le domande difficili di per se' (`DIFFICILI`: la
corrente di un quadro, il secolo di un libro, l'anno di un film) pesano un
terzo al facile e piu' del doppio al difficile, e al facile gli anni sbagliati
sono due volte piu' lontani.

**Le domande da tirare a indovinare non ci sono piu'.** L'anno di un Nobel non
lo sa nessuno: dei Nobel si chiede il campo, e il campo di chi ne ha vinti due
non e' mai una risposta sbagliata. I nomi scientifici non servono a nessuno: di
un animale si chiede il gruppo (mammiferi, uccelli, rettili, insetti...), con le
sbagliate della stessa parte, vertebrati o no, o quale di quattro e' del gruppo
("quale di questi animali è un mammifero?"), con le sbagliate non tutte dello
stesso gruppo, che direbbero la risposta a chi non sa; le piante non ci sono
piu', e nemmeno l'uomo. I nomi degli animali sono quelli di Wikidata, il piu'
breve, tranne dove e' di un dialetto o da manuale ("bisata", "carcarodonte"): li
corregge `NOMI_SPECIE`. Delle scoperte si chiede soprattutto l'anno, con il
verbo che le spetta (`v`: "ha inventato il telefono", "ha formulato la
relatività", "ha scoperto la penicillina"). Chi si nomina in una domanda
dev'essere noto quanto vuole la difficoltà (`NOTA_PER_NOME`, la fascia della
persona nel file): "quale di queste canzoni è di Sergio Ortega?" non la sa
nemmeno chi canta «El pueblo unido», e "a chi si deve la chitarra elettrica?"
nel facile non esce, perché George Beauchamp non lo conosce nessuno (`cf`, le
Wikipedia di chi ha fatto la scoperta). E sulla cartina gli oceani si cercano
per nome: "quale oceano bagna il Cile" con la cartina davanti si risponde
guardando, non sapendo; a scelta resta.

**Nella musica si scelgono i generi, e gli anni e il paese valgono per tutti.**
La Musica della libera ha una voce per genere — pop, rock, cantautori, rap e hip
hop, dance ed elettronica, R&B e soul, jazz e swing, latina, colonne sonore, gli
altri generi, la musica classica e la lirica — e se ne scelgono quanti se ne
vuole, come gli argomenti della scienza: i generi delle canzoni sono sezioni
(`SezioneQuiz.genere`), e ogni domanda porta il suo, anche senza la risposta
(`senzaRisposta`) e nella sfida, se e' uno dei suoi (`leggiDomande`). Gli anni
(`PERIODI_MUSICA`, dal Settecento agli anni 2020) e il paese di chi canta o
compone (`nazione`) sono di tutte le sezioni insieme, e la pagina offre solo
quelli che i generi scelti hanno per una partita (`soggettiDellaMusica`, almeno
dieci soggetti), con gli stessi conti delle domande; una scelta che non ne ha
piu' abbastanza torna a "tutti", e una riga senza niente da scegliere non c'e'.
Un brano senza anno prende quello in cui il compositore aveva trentacinque anni.
Prima la musica erano tre sezioni — canzoni, classica e lirica — con gli anni e
il genere solo per le canzoni, e "Italiana" era un genere: chi giocava non
capiva perché la classica e la lirica stessero a parte. Con un periodo scelto
non si chiede il decennio ne' il secolo, con un paese da dove viene chi canta:
li direbbe la partita. Si chiede chi la canta, quale canzone e' di un artista,
in che decennio e' uscita (mai a cavallo di due), e da dove viene chi la canta,
se non e' italiano.

**I generi delle canzoni li dice un elenco a mano.**
`scripts/data/generi-artisti.tsv` da' a ogni artista il suo genere, due quando
ha due anime (Battisti cantautori e pop), e `scripts/data/generi-canzoni.tsv` le
canzoni che fanno eccezione: "Beat It" e' anche rock, e una canzone scritta per
un film, un musical o una serie e' anche una colonna sonora — le si trova fra
le categorie di Wikipedia, ma ci stanno anche quelle che un film ha solo usato
("Born to Be Wild"), e la scelta e' a mano. Gli altri generi sono quelli
che da soli non farebbero una partita: il reggae, il country, il folk, il blues,
le canzoni comiche e per bambini. Venivano da Wikidata risalendo le sottoclassi,
e sbagliavano: una canzone senza un genere suo prendeva tutti quelli di chi la
cantava, cinque per "Perfect"; Lucio Dalla era rock; e il tango, "musica da
ballo", portava "Libertango" nella dance, con "4'33" di John Cage. L'elenco e'
fatto con i generi votati su MusicBrainz e quel che si sa di ogni artista;
Wikidata resta solo per chi l'elenco non ha ancora, con un genere solo, e lo
script li nomina. Anche chi canta e l'anno si correggono a mano
(`scripts/data/canzoni-a-mano.tsv`), perché Wikidata a volte ha solo la prima
versione di una canzone ("Hound Dog" era di Big Mama Thornton, "Twist and Shout"
dei Top Notes) o un anno sbagliato ("What's Going On" era del 2001). Lo stesso
elenco segna le canzoni di cui si chiede di chi sono e non chi le canta
(`di-chi`, `dc`): i brani strumentali, che "Chi canta «Gabriel's Oboe»?" non si
puo' chiedere, e quelli che chi li firma non canta, un dj o un produttore con la
voce di un altro ("Titanium" di David Guetta, "Uptown Funk" di Mark Ronson).

**Le canzoni vengono anche dalle classifiche di Wikipedia.** Le candidate di
Wikidata con la voce in italiano, ordinate per numero di Wikipedia, lasciavano
fuori proprio quel che si ascolta di piu': il rap italiano degli ultimi dieci
anni riempie le classifiche e ha poche voci tradotte, e su 1.500 canzoni il rap
italiano ne aveva 35. `scripts/cultura/classifiche.ts` legge con la stessa API
(`wikitesti`) la classifica annuale della FIMI dal 2002, i numeri uno italiani
dal 1960 (sulla Wikipedia inglese), la classifica di fine anno di Billboard dal
1959, i numeri uno inglesi dal 1952 e quelli latini dal 1990, e le pagine di un
anno nuovo le trova da sola (`pagineConPrefisso`). Le tabelle si leggono per
intestazione, con le celle che coprono piu' righe ripetute dove valgono, e chi
canta e' quel che dice la classifica prima del "feat.": gli ospiti non sono la
risposta, e non sono mai una sbagliata. Wikipedia collega un nome solo la prima
volta: un nome senza collegamento prende la pagina che ha altrove sullo stesso
sito. Il collegamento del titolo porta spesso all'album, e vale solo se Wikidata
dice che e' una canzone; una canzone senza una voce sua resta, con il titolo
della classifica e un identificativo dal titolo e da chi la canta (`cl…`).
La notorietà somma alle letture il successo, un anno al primo posto in Italia
quanto `SUCCESSO` (Billboard e i numeri uno inglesi un terzo, i latini un
quarto), e le canzoni restano `CANZONI`, dalla piu' nota.

**Una versione in classifica non e' sempre la canzone.** La pagina di una
cover porta spesso alla voce dell'originale: "Volare" di Bobby Rydell e' la
voce di "Nel blu dipinto di blu". Se Wikidata dice gia' chi la canta, vale la
versione di uno di loro, e quella di un altro solo se chi la canta e' piu'
noto — "Speedy Gonzales" e' di Pat Boone, non di David Hess che l'aveva
incisa per primo (`perLaClassifica`); chi ha le altre versioni non e' mai una
risposta sbagliata. La regola si fida di Wikidata, e quando Wikidata sbaglia
la correzione va in `canzoni-a-mano.tsv`: per "No Other Love" diceva i
Beatles, e la versione in classifica, di Ronnie Hilton, perdeva perché meno
nota. Di una canzone con un ospite o di un dj si chiede di chi
e', non chi la canta: "Wake Me Up" e' di Avicii, ma la canta un altro. Con le
classifiche le canzoni sono quattro volte quelle di prima, e i file del quiz
hanno un tetto sul peso compresso, che e' quel che si scarica
(`MASSIMO_FILE`): scritto, quello delle canzoni passa i 900 kB, compresso ne
pesa 250.

**Nel quiz il tempo lo tiene il server, e la risposta resta li'.** Il telefono
riceve una domanda alla volta senza la risposta (`senzaRisposta`), e l'orologio
parte quando la chiede (`POST /quiz/domanda` scrive `aperta_at`). Una risposta
vale entro il limite piu' `MARGINE_RETE_MS`; dopo, e' "tempo scaduto" anche se
arriva, e una domanda lasciata aperta la chiude la prima `GET /state`
(`chiudiScaduta`). La scrittura e' condizionata al numero di risposte gia' date
(`json_array_length(risposte) = ?`): un doppio tocco non risponde due volte.

**Gli id delle risposte sono testo dei dati, e il server ne guarda solo la
misura.** I generatori li fanno con quel che hanno — "chi:Nikola Tesla",
"da:André-Marie Ampère", "10-04/2", "citta:Monaco di Baviera" — quindi hanno
spazi, accenti, barre e apostrofi. Le rotte del quiz, della sfida e di Crazy
Time accettavano solo lettere semplici, fino a quaranta, e la risposta a una di
quelle domande tornava un errore. Ora usano tutte e tre `sceltaValida`
(`shared/quiz.ts`: fino a `SCELTA_MASSIMA` caratteri, nessun carattere di
controllo), e `domandaValida` scarta una domanda con un id che il server non
accetterebbe; un test genera le partite dai file veri e li prova tutti. La
scelta si confronta con l'id e si salva nel JSON della partita, quindi non
serve altro.

**Chi bagna chi lo dice la cartina, non Wikidata.** Su Wikidata l'Italia era
bagnata da due mari e la Grecia da nessuno. `scripts/quiz/coste.ts` dipinge i
mari di Natural Earth su una griglia di un decimo di grado, percorre la costa
di ogni paese e conta i contatti con ogni acqua: sotto `COSTA_MINIMA` non la
bagna, e ogni tipo d'acqua ha il suo peso (un oceano chiede piu' costa di un
golfo: il Cile non e' "atlantico"). Chi la tocca poco sta in una zona grigia
(`vicine`) e non viene proposto ne' come risposta giusta ne' come sbagliata. Un
mare bagna anche il mare che lo contiene (il Tirreno e' Mediterraneo), i
territori d'oltremare non contano (`partiPrincipali`: la Francia non e'
bagnata dall'Indiano), e un lato che passa il 180 si percorre dalla parte
corta — altrimenti la Russia toccava la baia di Baffin. `controllaRiassunto`
ferma lo script se i conti di controllo non tornano (l'Italia bagnata da
Tirreno, Adriatico e Ionio; l'Austria da niente).

Un paese **senza sbocco sul mare** (`ch`) lo deve dire sia la cartina — nessuna
acqua sfiorata, Caspio a parte — sia Wikidata: i poligoni marini di Natural
Earth hanno dei buchi, e con la sola geometria il Benin, il Togo e la Giordania
risultavano senza mare. I **confinanti** sono due elenchi: `conf`, largo, che
serve a escludere (un fiume non si chiede accanto a un paese vicino a quelli che
attraversa), e `cm`, i confinanti sicuri — per Wikidata *e* sulla cartina, con
la parte principale del paese — che sono le risposte di "con chi confina": il
Brasile confina con la Francia dalla Guyana, ma non e' la risposta che uno si
aspetta.

**I dati del quiz sono tre riassunti fatti la notte, e le immagini non passano
dal server.**
Paesi, capitali, confini, acque, fiumi e laghi, a chiavi corte, in quattro
righe di `quiz_dati` — una per sezione, perché D1 non accetta istruzioni oltre
i cento kB — riscritte solo quando cambia la versione, che e' l'hash del
contenuto. Il browser lo scarica una volta e lo tiene nel `localStorage` con la
sua versione (`src/games/quiz/dati.ts`); le libere si fanno tutte lì, con lo
stesso `generaDomande` della notte e un seme a caso, e le loro statistiche non
lasciano il telefono. Le bandiere vengono da flagcdn, i confini dei paesi e i
mari della cartina da jsDelivr, a versioni fisse: il Worker non li vede mai.

Due riassunti a parte, perché li scarica solo chi li usa: le **linee dei fiumi e
le forme dei laghi** (righe `geo:*`, circa duecento kB) e le **città** (righe
`citta:*`, circa trecento kB, quaranta per paese e centoventi per l'Italia, con
le regioni). Natural Earth ha i fiumi in file da molti mega, e Wikidata dal
browser non regge: il servizio pubblico va in timeout sulle città di un paese e
QLever risponde 429 a chi chiede troppo. Il riassunto dice le loro versioni,
e `GET /quiz/geometrie?v=` e `GET /quiz/citta?v=` rispondono
`private, max-age=31536000, immutable` quando la versione e' quella giusta
(`perSempre`): una richiesta per versione, poi la cache. Per questo il
middleware di `server/app.ts` mette `no-store` solo se la rotta non ha deciso da
sé — prima lo scriveva sempre, e cancellava la cache di queste due.

**Un fiume di Natural Earth si ritrova per nome, per posto e per rete.** Il file
del mondo non ha gli identificativi di Wikidata: `scripts/quiz/geometrie.ts`
prende i tratti con uno dei nomi inglesi del fiume che passano vicino al suo
punto di Wikidata o stanno dentro i paesi che attraversa, e poi `collegate`
tiene solo quelli che fanno una rete: le reti vicine al punto, o la piu' lunga;
la piu' lunga anche quando e' il doppio di quelle (il punto dell'Irtyš e' alla
sorgente, dove si chiama Ertix); e le reti che cominciano entro tre gradi dalla
fine di una tenuta, tranne che dal capo sul punto, che e' foce o sorgente. Senza,
il "Black River" del Vietnam era un pezzo dell'Amur e il Salado di Buenos Aires
continuava quello del Norte. Un fiume che nel mondo e' solo le sue linee dentro i
laghi (lo Snake) non ha una linea, e non si chiede sulla cartina.

**Le domande del quiz parlano italiano, e la grammatica e' una tabella.**
`shared/quiz-lingua.ts` ha il genere e il numero di ogni paese — "dell'Italia",
"degli Stati Uniti", "nei Paesi Bassi", "in Israele" — e lo script si ferma se
nel riassunto c'e' un paese che non ci sta. Le etichette di Wikidata si
prendono in italiano, poi `mul`, poi inglese: la capitale della Norvegia ha solo
`mul`. Per le altre materie la tabella e' quella della prima parola
(`GENERE_PAROLE`: "la battaglia", "il trattato", "lo sbarco", "gli
accordi"), e il verbo segue il tipo del fatto: "si combatté", "fu firmato",
"cominciò". Una parola che la tabella non conosce non si indovina: la domanda
diventa «Battaglia di Canne»: in che anno?, che e' brutta ma giusta.

**Le altre materie del quiz sono file statici, e il server non li legge.**
Arte, libri, cinema, canzoni, musica classica, lirica, Nobel, storia e scienza
stanno in
`public/dati/quiz/<materia>.json`, "Accadde oggi" in
`public/dati/quiz/oggi/MM-GG.json`, uno per giorno dell'anno. Li scrivono
`npm run quiz:cultura` e `npm run quiz:oggi` da Wikidata (con QLever) e da
Wikipedia, e sono versionati come le parole del Wordle: il build non va in
rete, e una fonte che cambia non cambia le domande. L'indirizzo porta
l'impronta (`?v=`, in `shared/quiz-cultura-versioni.ts`), quindi `_headers` li
tiene in cache per sempre. Il browser li scarica per la libera e per la sfida;
la classificata la scrive lo script della notte, che li legge dal repository e
salva in `quiz_giornate` solo le dieci domande del giorno, perché le risposte
della classificata non possono stare nel telefono. Sotto `/dati/` e non sotto
`/quiz/`, dove ci sono le pagine dell'app (vedi la nota su `_headers`).

**Quanto e' nota una voce lo dice anche la Wikipedia in italiano.** Le
Wikipedia che parlano di una voce dicono quel che e' noto nel mondo, e da sole
mettevano "Il fu Mattia Pascal", che ne ha dodici, dietro la seconda lettera
ai Tessalonicesi. `notorietaItaliana` le prende sotto radice e le moltiplica per
quanto si legge la voce italiana in un anno (`letture`: un mese tipico per
dodici, del 2025, perché rifare lo script dia gli stessi numeri). Decide chi
entra negli elenchi e la fascia di difficoltà (`f`) in tutte le materie tranne
"Accadde oggi", che ha il suo punteggio. Prima le voci italiane pesavano 1,4
volte le altre — due volte e mezzo nei libri, due nei film — e non bastava mai:
un classico della scuola non e' una voce italiana un po' nota, e' una voce nota.
I film d'animazione pesano ancora meno della meta' (`PESO_ANIMAZIONE`): chi li
ha diretti non lo sa nessuno. E i film usciti nell'anno delle letture, o in
quello prima, le contano a un terzo e a due terzi (`lettureDiSempre`): le
letture dell'uscita non sono quelle di sempre, e senza uno su quattro dei primi
cinquanta era del 2023 o dopo, Thunderbolts* davanti al Padrino. Libri, quadri e
opere di quegli anni fra i primi non ce ne sono; le canzoni hanno la stessa
regola, e le italiane pesano due volte e mezzo (`PESO_ITALIANE`): hanno meno
Wikipedia delle straniere, chi gioca le conosce meglio, e senza erano una su
sette.

**Per Wikidata una canzone e' spesso una composizione, e chi la canta lo dice
la descrizione.** "Bohemian Rhapsody" e "Imagine" non sono canzoni ma
composizioni musicali, di cui la canzone e' una sottoclasse: escludere le
composizioni toglieva proprio le piu' famose. Fra gli interpreti di Wikidata ci
sono cover e ritornelli (Susan Boyle in "Like a Prayer"): quando la descrizione
italiana ne nomina qualcuno ("singolo di Madonna del 1989") la risposta e' lui,
e gli altri restano nella canzone (`x`) senza essere mai risposte sbagliate;
quando ne nomina un altro la canzone resta fuori. Fuori anche quel che e' di
prima del 1950 e quel che non e' di nessuno — i canti tradizionali, gli inni, le
filastrocche: "La cucaracha" non e' di Bill Haley.

**Una risposta sbagliata deve essere sicuramente sbagliata, e credibile.** I
generatori delle altre materie (`shared/quiz-domande-cultura.ts`) scartano le
opzioni che potrebbero essere giuste: l'altro campo di chi ha vinto due Nobel
non e' un campo sbagliato, ne' l'altro interprete di un duetto un cantante
sbagliato; una corrente sbagliata e' una che al tempo del quadro non
c'era, di venticinque anni almeno; un titolo che hanno piu' quadri
("Autoritratto") non si chiede. Gli anni sbagliati sono vicini a quello giusto,
tanto piu' vicini quanto piu' e' recente (di uno per l'anno scorso, di cento
per l'antichità), mai l'anno zero e mai nel futuro, e la finestra si sposta
perché la risposta giusta non sia sempre quella di mezzo: un test conta le
posizioni. Un secolo non si chiede a meno di due anni dal suo confine, e un
evento con l'anno nel nome ("terremoto di Messina del 1908") non si chiede per
l'anno.

**La scheda che insegna arriva con la risposta.** Per le materie senza cartina,
a risposta data, la carta diventa una scheda: di chi e' il quadro, la corrente,
la tecnica, dove si trova, due frasi da Wikipedia e la voce intera. E' la
stessa cosa della cartina che insegna (`imparo`), accesa sempre: ogni risposta
ha la sua spiegazione, anche nella libera. La compone il generatore
(`SpiegazioneQuiz`), e come la risposta resta sul server finché non si risponde:
`senzaRisposta` non la manda. Le domande lunghe da leggere (`lunga`: quattro
fatti fra cui scegliere quale viene prima) hanno venti secondi invece di
quindici (`SECONDI_LUNGA`), nella classificata, nella libera e nella sfida.

**I quadri vengono da Commons, e il nome del file si vede.** Solo JPEG e PNG di
pubblico dominio, larghi almeno 960 punti: dal 2025 Commons fa le miniature
solo di misure standard, e l'app chiede 330, 500 e 960 (`LARGHEZZE_IMMAGINI`).
Si scaricano dal browser, come le bandiere, e l'indirizzo porta il nome del
file, che a volte dice il quadro: e' lo stesso compromesso del codice del paese
nell'indirizzo delle bandiere, e il tempo resta la difesa della classifica. Il
posto del quadro lo tengono le sue proporzioni (`r`) prima che arrivi, e un
quadro che non arriva lo dice senza bloccare la domanda.

**"Accadde oggi" chiede sempre l'anno.** Si racconta il fatto, o chi e' nato
quel giorno, e si sceglie l'anno. Le domande "Che cosa accadde il 4 ottobre
1957?", con quattro fatti dello stesso giorno fra cui scegliere, non si
potevano fare: i fatti di un giorno sono spesso poco noti, mentre l'anno lo
avvicina anche chi non conosce il fatto. Il tipo `oggi-fatto` resta fra i tipi
solo per le partite gia' giocate, e i generatori non lo fanno piu', nemmeno a
chi lo chiede.

**"Accadde oggi" fuori dalla classificata non gioca il giorno del quiz.** Quando
la classificata di oggi e' "Accadde oggi", i suoi fatti sono gli stessi del
file di oggi, e una libera giocata prima la svelerebbe: la libera prende un
giorno a caso finché la classificata non e' chiusa, e la sfida sempre, perché
l'altro potrebbe non averla giocata (`giornoDellaPartita` in
`src/games/quiz/fonti.ts`). La sfida porta il giorno nelle impostazioni, e la
rivincita resta su quello.

**La soluzione non deve arrivare al client prima della fine.** `toState()` in
`server/routes/wordle.ts` mette `answer: null` finché lo stato è `playing`; è
l'unica cosa che rende la classifica significativa. Vale anche per la vista
condivisa: `guestView()` applica la stessa regola.

**La parola del giorno e' la stessa per tutti.** `dailyAnswer` fa
`INSERT OR IGNORE` della riga del `puzzle_number` e poi la rilegge: il primo
che apre il gioco la fissa, tutti gli altri leggono quella. E' anche
deterministica dal numero del puzzle, quindi la riga salvata e' una garanzia in
piu' — se un domani si rigenerasse l'elenco, le parole già giocate non
cambierebbero. Un test in `shared/__tests__/daily.test.ts` lo blocca.

**La sequenza della parola del giorno non si tocca.** `solutionIndexFor` e'
la stessa da settembre, anche nei giorni delle cinque parole — le quattro in
piu' venivano da una permutazione a parte proprio per non spostarla — e un
test verifica i primi giorni: se cade, chi gioca da allora si trova la parola
di un altro giorno.

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

**Deve sembrare un'app, non un sito.** Ogni schermata e' una `Pagina`
(`src/components/Pagina.tsx`): titolo grande che scivola nella barra, freccia
indietro con il nome della schermata di prima, e `intera` per le schermate di
gioco, che nascondono tab bar e barra laterale da sole (`body:has(.pagina--intera)`
in `Shell.css`: una schermata non deve avvisare nessuno). Le navigazioni passano
da `useNavigazione().vai` o da `Collegamento`, mai da `navigate` o `Link` nudi,
perché e' lì che partono i movimenti: avanti e indietro con le View Transitions
dove ci sono, fra le schede un cambio immediato (vedi sotto). React Router
aggiorna lo stato dentro una transizione di React, quindi `TransizioniProvider`
fa aspettare la View Transition finché la rotta nuova e' montata (guarda la
chiave della location), con un tetto di 700 ms.
I bottoni a destra della barra stanno a dodici punti l'uno dall'altro
(`.pagina__lato--destra`): a quattro, come a sinistra, si toccavano, e
l'anello dell'avatar ci finiva sopra.

**Fra le schede il cambio e' immediato, e una schermata ritrovata non
rientra.** Al cambio di scheda c'era una dissolvenza, e a meta' si vedeva il
fondo vuoto: sembrava che la pagina si ricaricasse. Ora e' come nella tab bar
di iOS, la lente scivola e la pagina c'e'. Altre tre cose davano la stessa
impressione. L'entrata della pagina per i browser senza View Transitions
(`pagina-entra`) valeva con `html:not([data-transizione])`, e quando una
transizione finiva e l'attributo se ne andava ripartiva: ogni pagina, appena
arrivata, tornava trasparente e ricompariva. Adesso la decide la schermata
quando si monta (`useEntrata`, con le regole in `src/app/movimenti.ts`), con
una classe che non cambia piu', e un test vieta le regole legate all'assenza
dell'attributo. Le entrate del contenuto (la cascata delle carte, l'eroe, il
podio) ripartivano a ogni cambio di scheda e a ogni ritorno: le fa solo una
schermata nuova, la prima dell'app o una che arriva avanti, e le altre hanno
`pagina--ferma`, che le spegne ognuna nel suo foglio di stile. E la pagina
nuova prendeva lo scorrimento di quella di prima, tanto che dal fondo delle
Libere le Giornaliere si aprivano a meta': lo scorrimento lo tiene
`TransizioniProvider`, dall'alto per una schermata nuova e dove la si era
lasciata tornando indietro. Toccare la scheda gia' aperta riporta in cima.

**Mentre la pagina scorre, la tab bar e' piena e le copertine stanno al loro
posto.** Avanti e indietro la tab bar e' fotografata a parte, per restare
ferma mentre la pagina scorre, e Safari ne disegnava lo sfocato come un
rettangolo, senza gli angoli tondi: attorno alla capsula restava un riquadro,
chiaro dove sotto c'era una carta. In quei momenti la capsula prende
`--glass-pieno`, il vetro gia' mescolato al fondo, senza `backdrop-filter`. Le
copertine dei giochi da tavolo avevano un nome di transizione, per allargarsi
dalla tessera delle Libere all'eroe della sala: le sei tessere restavano a
galla mentre la pagina scorreva via, e l'icona quadrata si stirava nel
rettangolo dell'eroe. Ora i nomi di transizione sono solo della tab bar e
della barra laterale, e un test lo controlla.

**Le Libere mettono i giochi in famiglie, come li cerca chi vuole giocare.**
Enigmistica (Wordle, cruciverba, sudoku, Anagrammi), Parole (Scarabeo, Paroliere,
Ghigliottina, Catena, Nomi, cose e città),
Cultura (il quiz), Memoria (Sequenze), Strategia (scacchi, dama, go, Forza 4,
tris), Da tavolo (battaglia navale, Indovina chi) e In gruppo, cioe' Lupus, che
e' l'unico che si gioca in tanti (`CATEGORIE_LIBERE` in `src/games/catalog.ts`). Erano due, "I
giochi" e "Da tavolo": quelli con la classificata e gli altri, che e' come sono
fatti e non a che cosa si gioca. Un gioco classificato porta alla sua libera,
uno da tavolo alla sua sala, e un test tiene ogni gioco in una famiglia sola.

**Le schede sono tre: le Libere, le Giornaliere e la Fortuna, in quest'ordine.**
Le Giornaliere (`/`, il calendario) hanno le classificate di oggi, che sono la
parte principale: stanno al centro della barra e sono la pagina che si apre per
prima, anche dall'app installata (`start_url`). Le Libere (`/libere`, il
controller) hanno le partite che non contano, le libere dei giochi classificati
e i giochi da tavolo, con chi c'e' online; la Fortuna (il quadrifoglio) i giochi
d'azzardo. Si chiamavano Arena e Salotto, e `/salotto` porta ancora alle Libere.
Il profilo e la classifica non sono schede: il profilo si apre dall'avatar in
alto a destra di ogni scheda, la classifica dal trofeo accanto e dall'eroe delle
Giornaliere e della Fortuna, che portano alla loro. Mentre si guardano il
profilo e gli amici nessuna scheda e' accesa, e la lente si spegne dov'era
(`Shell.tsx`). Quale scheda e' accesa lo decide prima `delGiorno`:
`/quiz/classificata` sta anche sotto `/quiz`, che e' delle Libere. La freccia
indietro del profilo e delle classifiche dice da dove si e' venuti: lo porta lo
stato della history (`stato` di `Collegamento`), e la classifica lo tiene
cambiando periodo, perché l'indirizzo si sostituisce.

**Sul computer le schede sono una dock, e il menu a sinistra e' della scheda
aperta.** La capsula della tab bar resta, in basso al centro del contenuto come
la dock del Mac, con l'icona e il nome sulla stessa riga; il menu ha i giochi
della scheda nelle famiglie delle Libere (`MENU_LATERALE` in `src/app/menu.ts`),
che si chiudono con la chevron e restano chiuse (`laterale-chiuse` nel
`localStorage`), tranne quella del gioco aperto. Toccando un gioco si apre al
centro la sua configurazione, o la partita di oggi nelle Giornaliere, che con la
Fortuna hanno in cima la classifica. Prima il menu aveva insieme le tre schede e
i giochi di tutte e tre, con le libere dei giochi classificati che mancavano, e
non si capiva che cosa fosse che cosa. La pagina delle Libere, sul computer,
mette le famiglie affiancate, ognuna in una carta con una riga per gioco e il
suo motto: i giochi sono gia' nel menu, e lì si dice che cosa sono. Nella
Fortuna il menu si fa scuro con la pagina, come la dock. Sul telefono non cambia
niente, e un test tiene il menu d'accordo con le famiglie e con le classificate.

**Le icone delle schede si riconoscono anche piene.** Il calendario delle
Giornaliere ha il giorno di oggi (`Giorno` in `Icons.tsx`, con due cifre un
po' piu' piccole, che altrimenti toccano i lati). Pieni, il calendario e il
controller hanno il numero, la croce e i tasti bucati con una maschera, che
vuole un id solo suo (`useId`): la stessa icona sta nella tab bar e nella
barra laterale. Il quadrifoglio pieno ha le foglie staccate e senza tratto:
col tratto si toccavano al centro, e diventava una macchia.

**Le tre schede hanno la stessa forma, e ognuna il suo carattere.** `Vetrina`
(`src/components/`) e' la pagina di tutte e tre: il titolo grande con la data,
i bottoni in alto, l'eroe e le carte. Il carattere sta in `Vetrina.css`: la
luce in cima alla pagina nel colore della scheda (`--giornaliere`, `--libere`,
`--fortuna`, che dicono dove si e' e non che cosa si e' scelto), il movimento
dell'eroe — le righe e il lampo dei riflettori di una gara, le bolle di una
lampada, le lampadine di un'insegna — e le tessere delle Libere, che
galleggiano. Le carte delle classificate sono quelle di prima: una striscia
nel colore del gioco sul lato c'e' stata per un giorno, e sapeva di gia'
visto. L'eroe delle Giornaliere e' la giornata: il posto nella generale di
oggi, i punti, il podio e un anello per gioco. Il podio arriva con
`/api/oggi` (`generale.podio`), che la generale la calcola comunque: nessuna
richiesta in piu' per la schermata che si apre di piu'.

**La Fortuna e' scura in tutti e due i temi.** `Vetrina.css` mette
`color-scheme: dark` sulla sua pagina e ne ridefinisce `--bg` e `--vetro-barra`:
tutti i token sono `light-dark()`, quindi dentro la pagina si girano da soli,
senza una palette scritta due volte. La tab bar, che sta fuori dalla pagina, si
gira con `body:has(.vetrina--fortuna)`, e `Vetrina` cambia il `theme-color`
finché la pagina e' aperta: Safari tingerebbe di chiaro la zona dell'orologio
sopra una sala scura.

**Gli amici sono tutti gli altri del gruppo.** Non c'e' una lista da tenere:
l'app e' fra colleghi, e chi c'e' lo dice la presenza (`server/lib/amici.ts`).
Il profilo ha gli amici online, le Libere li mettono nell'eroe, e toccandone uno
si apre il suo profilo (`/amici/:nickname`, anche dal foglio di un giocatore in
classifica), con i giochi a cui invitarlo. Gli inviti sono quelli delle sale
(`invitaA` in `src/games/amici/amici.ts`): si manda l'invito e si va nella sala
del gioco, che lo trova in attesa e aspetta la risposta come se lo si fosse
mandato da li'. Se l'amico non e' online si va nella sala, da cui lo si invita
con un link; il quiz apre la libera con l'amico in vista (`?sfida=1`), perché la
sfida la prepara il telefono di chi sfida. Il lato del goban e il set di
Indovina chi sono quelli scelti l'ultima volta nella sala, letti dalle loro
chiavi del `localStorage` senza importare `tavolo/locale.ts`, che porta con se'
le regole di tutti i tavolieri.

**I punti e i conti di ogni gioco stanno nella classifica.** Il profilo ha solo
chi sei, gli amici e le impostazioni: le classificate da sempre, le libere e le
statistiche del Wordle si aprono da "I tuoi numeri", nella classifica di ogni
gioco (`classifica/Conti.tsx`), che e' dove si guarda come si sta andando.

**La barra si fa vetro appena qualcosa le scorre sotto**, e il titolo piccolo
compare quando il grande e' passato: sono due momenti diversi (`is-velata`,
`is-scorsa` in `Pagina`). Prima erano uno solo, e finché il titolo grande non
era passato del tutto ci scorreva dietro la freccia indietro, trasparente. Il
vetro e' del colore della pagina (`--vetro-barra`) e non bianco: Safari tinge la
zona dell'orologio con il `theme-color`, che e' `--bg`, e una barra bianca ci
lasciava sopra una fascia grigia.

**Le opzioni stanno in gruppi, come nelle Impostazioni**: una carta per gruppo,
una riga per opzione, un filo fra due righe. Un interruttore per carta,
com'erano, faceva leggere la pagina a pezzi. Le opzioni che non cambia nessuno
non ci sono: nel quiz libero erano un pannello di avanzate, e la schermata non
si capiva più.

**La difficoltà si sceglie con le tacche, e la partita parte da Comincia.** In
tutte le libere e nelle sale — sudoku, scarabeo, battaglia, quiz, Nomi, cose e
città, scacchi, dama, Forza 4, go, tris — la difficoltà e' un elenco di righe
con le tacche nel colore del gioco, con la spunta su quella scelta, e sotto il
bottone Comincia (`Difficolta` in `src/components/`). Il livello resta per la
partita dopo (`useLivelloScelto`, nel `localStorage`; il quiz lo tiene con le
altre scelte), e la prima volta e' il Normale. Per un periodo toccare un livello
faceva partire la partita, e chi guardava le righe non capiva che lo facevano.
Contro chi si gioca, dove si puo' scegliere, lo dice l'interruttore sopra,
Computer | Amico, ricordato per gioco, e si vede solo quel che serve a quella
scelta: la difficoltà contro il computer, gli inviti con un amico. Il colore
contro il computer non si sceglie: cambia a ogni partita (`prossimaParte` in
`tavolo/locale.ts`), come nelle rivincite fra amici.

**Un gioco non ha una pagina sua.** Dalle Giornaliere una carta del giorno porta
dritta alla partita di oggi, e dalle Libere le libere dei giochi classificati e
i giochi da tavolo portano a sceglierle. Le pagine di ogni gioco, con la
classificata, la libera e un podio, erano un passaggio in piu' da attraversare
ogni giorno: l'indirizzo del gioco (`/wordle`, quello dei sottodomini) porta
alla classificata (`AllaClassificata` in `App.tsx`), e la freccia indietro di
una classificata torna alle Giornaliere, quella di una libera o di una sala alle
Libere. Le voci di un controllo segmentato sono larghe uguali e si stringono
(`min-width: 0`): altrimenti la capsula che le segue non ci sta sopra, e su un
telefono stretto l'ultima voce esce dalla carta.

**Le tante alternative numeriche si scelgono con un cursore a punti**
(`Cursore`): le domande del quiz, sette punti da cinque a cinquanta, e i secondi
per domanda. Con sette voci un controllo segmentato non si legge piu'. I punti
stanno alla stessa distanza qualunque sia il valore — e' una scala di scelte,
non un righello — e la maniglia si attacca a quello vicino (`MAGNETE`) e ci
scatta quando la si lascia. Tre cose vengono dalle regole e non dal gusto: il
valore scelto sta sulla riga del titolo, a destra, perché le etichette sotto la
pista le copre il dito che trascina (Nielsen Norman Group); la pista si tocca in
un punto qualunque e le etichette anche, così non serve trascinare (WCAG
2.5.7), e l'area da toccare e' alta 44 punti anche se la pista ne ha sei; da
tastiera e' lo slider di WAI-ARIA, con le frecce, Inizio e Fine, e
`aria-valuetext` che dice "senza tempo" invece del numero del punto.

**La puntata di Crazy Time invece e' una cifra, e si sceglie libera.** Non e'
una scelta fra poche alternative: si punta quanto si vuole, un punto alla volta,
dalla minima a tutto il saldo (`LineaPuntata`). La linea e' un `input type="range"` senza
punti, con la pista e la maniglia del cursore, e accanto il numero si scrive:
su una linea di trecento punti col dito la cifra esatta non si prende, e con un
cursore va dato anche il campo per il valore preciso (Nielsen Norman Group). Il
campo ha il testo a 17 punti, perché sotto i 16 Safari ingrandisce la pagina
quando prende il fuoco.

**Dove si gioca si sceglie su una cartina.** Il foglio "Dove" del quiz ha una
tessera per zona, con la sagoma del continente nel colore della materia e le
terre intorno in grigio, al posto della fila di capsule di prima. Le sagome
sono tracciati SVG scritti una volta in `src/games/quiz/sagome.ts` da
`scripts/genera-sagome.ts`, come i pezzi degli scacchi: i confini di world-atlas
a 1:110 milioni, tagliati sul riquadro della cartina muta (`VISTE`) e
semplificati fino a 43 kB, con il continente di ogni paese preso dal riassunto
del quiz nel D1 locale (prima `npm run quiz:locale`). Un anello che passa il
180 si porta tutto a est prima di tagliarlo: altrimenti la Russia e le Figi
tiravano una striscia da un lato all'altro della sagoma. Il foglio si tocca e si
chiude, quindi le tessere sono bottoni e la scelta la dice `aria-current`, come
le righe con la spunta (`Riga scelta`) del foglio del periodo.

**I gruppi di scelte e i fogli seguono WAI-ARIA anche con la tastiera.**
`SegmentedControl` e' un radio group: Tab entra sulla scelta fatta e le frecce
passano alle altre (`frecceDelGruppo` in `src/lib/gruppo.ts`, con le voci a
`tabIndex` 0 o -1). Le tessere delle sezioni del quiz invece sono caselle da
spuntare in un `group`, perché se ne sceglie piu' d'una. Il foglio (`Sheet`) e'
un dialog modale: il fuoco entra, Tab ci gira dentro, e alla chiusura torna su
quel che l'aveva aperto. L'effetto che lo fa non dipende da `onClose`, che chi
apre il foglio passa nuova a ogni giro: ripartendo a ogni render riportava il
fuoco sul pannello, anche mentre si scriveva nella ricerca dei paesi.

**I testi dicono cosa fare, non perché.** Titoli di poche parole, e niente
righe che spiegano quel che si vede: "Non conta per la classifica" sotto una
libera, "Anche a chi non ha un account" sotto un link, cosa chiede una
categoria, cosa fa un livello. Quel che serve davvero sta nel foglio della "i"
in alto a destra, che ogni gioco ha. Niente retroscena ("il tempo
lo tiene il server", "lo schema lo compone un programma ogni notte") né giri di
parole ("finché ce ne sono", "le opzioni di sempre"). Le opzioni si chiamano
come in un'app: "Difficoltà", "Ordine", "Ripristina le opzioni". Le regole di
ogni gioco sono il minimo per giocare — scopo, comandi, punti in una riga,
classificata e libera in una riga — e il perché delle regole sta in questo
file, non nell'app. Fonti e licenze stanno nel profilo; nelle schermate resta
solo il credito che la licenza chiede (il Wikizionario nelle regole del
cruciverba).

**Le icone SVG di `public/` devono essere XML valido.** Un doppio trattino in un
commento basta a non far caricare l'immagine, mentre la stessa icona messa nella
pagina si vede lo stesso: e' cosi' che il marchio della barra laterale era
rotto senza che nessuno se ne accorgesse. C'e' un test.

**L'icona e' fatta per il Liquid Glass, che un'app web non puo' chiedere.** I
livelli di Icon Composer sono delle app native: di un'app web iOS 26 prende
l'`apple-touch-icon`, ci stende sopra il vetro e ne ricava da solo le versioni
scura, trasparente e colorata, separando il disegno dal fondo. Per questo
l'icona e' piatta — le ombre e i riflessi li mette il vetro — con il fondo
quasi a tinta unita e le copertine molto piu' chiare di lui: senza i colori
resta la luminosita'. Nell'icona di prima il basso del cruciverba e della
battaglia era scuro quanto il fondo, e il riflesso in alto a sinistra finiva
nel disegno. L'`apple-touch-icon` e' piena e a filo, di 1024 punti: gli angoli
li taglia iOS, un pixel trasparente diventa nero, e a 180 le icone grandi della
Home la ingrandirebbero. Il disegno sta a un quinto dal bordo, perché in basso
il vetro fa da lente. Tutto viene da `scripts/genera-icone.mjs`
(`npm run icone`), che scrive anche l'impronta negli indirizzi (`?v=`): Safari
tiene le icone per indirizzo, e chi rimette l'app sulla Home si vedrebbe quella
di prima. Un'app gia' sulla Home tiene l'icona con cui la si e' aggiunta: per
la nuova va tolta e rimessa. I test tengono le soglie di luminosita', l'icona
di iOS piena e l'impronta.

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
gioco. Anche il cursore e' indaco, come ogni scelta: il colore di un gioco o di
una materia dice di che cosa si parla — le icone, le tacche, le sagome — e non
che cosa si e' scelto.

**Il grigio terziario non e' per le parole da leggere.** `--label-tertiary` su
bianco fa 2,4:1, e il WCAG chiede 4,5:1 al testo (1.4.3): sta sulle frecce
delle righe e sulle decorazioni, mentre etichette, conti e titoletti
("Online", "record 80%", i gruppi della barra laterale) usano
`--label-secondary`, che fa 5:1.

**Profondita' con tre livelli, non con le ombre grandi.** Caselle e tasti usano
`--edge-light` (filo di luce in alto), una velatura verticale in
`background-image`, e `--shadow-key` — un'ombra secca senza sfocatura. E' quel
che fa sembrare un tasto un oggetto; premendo **scende** invece di
rimpicciolirsi, perché lo `scale` fa sembrare il tasto un'immagine che si
allontana.

I keyframes delle caselle usano `background-color` e non `background`: la
velatura sta in `background-image` e sostituirla in blocco la cancellerebbe.

**I messaggi non galleggiano sopra griglie e tabelloni.** Ogni gioco ha il suo
posto in pagina: il piede della tavoletta nel Wordle, la riga di mezzo del
tabellino nello Scarabeo, la capsula di stato nel cruciverba, la riga del
suggerimento in compagnia, il piede del mare nemico nella battaglia. Erano
pillole scure sovrapposte — e coprivano proprio le caselle che si stavano
guardando. Le notizie della battaglia stanno in quel piede, accanto al conto
dei colpi, e un test ne misura la lunghezza: una riga che va a capo sposterebbe
i due mari a ogni colpo. L'eccezione sono gli adesivi, che passano da soli e
non fermano niente (vedi sotto).

**I suoni si fanno nel browser, e non si scaricano.** `src/lib/suoni.ts` li
sintetizza con Web Audio — marimba e campanello per le cose musicali, un colpo
di legno per i tocchi, rumore filtrato per acqua ed esplosioni — con un filo di
riverbero e un compressore: nessun file, niente sul server. I momenti che contano
suonano dal loro `Adesivo` (il campo `suono`, un po' piu' piano se l'adesivo e'
bordato); il resto — tasti, tessere, ultimi cinque secondi, il tre-due-uno, chi
entra e chi esce, la rivincita — chiama `suona` dove succede. Il contesto nasce
al primo gesto, si ferma a pagina nascosta, e su iOS la sessione e' "ambient",
che segue l'interruttore del silenzioso. Si spengono dal profilo. Un test li
suona tutti su un contesto finto che rifiuta i valori che Web Audio non accetta.

**La festa della vittoria sta nel body, e solo per una vittoria appena fatta.**
`Coriandoli` e' un portale: dentro la pagina restava sotto il velo del foglio
del risultato, che si apre nello stesso momento, e non la vedeva nessuno.
`useFesta` la accende solo se la partita era stata vista in corso: riaprire una
vittoria di ieri, o riaprire il risultato, non la rifà.

**Nella battaglia i tre esiti sono tre segni, non tre rossi.** Lo spruzzo per
l'acqua, il fuoco su un pezzo colpito e ancora a galla, il relitto scuro con
le croci per una nave a fondo: si distinguono anche senza i colori. Prima
colpito e affondato erano due rossi, e non si capiva quale fosse quale.

**Gli annunci al centro sono solo per i colpi che contano**: colpito e
affondato, mai l'acqua — succede quasi sempre, e un annuncio a ogni colpo
smetterebbe di dire qualcosa. La durata sta in `DURATA_ANNUNCIO_MS`
(`racconto.ts`): il colpo del computer aspetta che l'annuncio sia finito.
L'annuncio e' un `Adesivo` come quelli degli altri giochi; `Annuncio.css` ha
solo i disegni dell'esplosione e dell'affondamento.

**Lo stile della battaglia e' di tutti i giochi: schede, pillole, adesivi.**
`Scheda` (`src/components/Scheda.tsx`) e' la carta con la testata — icona,
titolo, e a destra una `Pillola` che dice lo stato: "Tocca a te", i tentativi,
"Non indovinata". `Adesivo` e' il momento che conta al centro dello schermo, in
due toni che si riconoscono prima di leggere: **vivace**, una carta nel colore
del gioco che salta fuori storta (una cosa bella, mia), e **bordato**, una
carta chiara bordata di colore che trema (una cosa brutta, o dell'avversario).
Sta nel body, non ferma niente e passa da solo; le sue animazioni sono frazioni
di `--durata`. `useCodaAdesivi` li mette in fila — la mossa e poi la fine
della partita, il mio colpo e poi quello del computer — perché due adesivi
insieme si coprirebbero. Con il movimento ridotto l'adesivo compare e sparisce
senza muoversi: anche l'alone ha la sua `--durata`, perché la regola generale
lo portava subito al suo ultimo fotogramma, trasparente, e con lui spariva
l'adesivo intero. Ogni gioco ha il suo carattere dentro lo stesso
stile, senza prendere quello degli altri: il Wordle una tavoletta con gli
alloggi incavati (`--slot`) e le stelle della vittoria, lo Scarabeo il legno
della cornice e del leggio (`--legno-*`) e lo scarabeo d'oro quando si posano
tutte e otto le tessere, Nomi, cose e città il foglio del gioco su carta
(vedi sotto), il cruciverba la matita. La definizione in corso
non ha piu' le righe del quaderno: a passo fisso non combaciavano con quelle
del testo, e sembravano cancellature.

**Un adesivo di fine partita viene prima del riepilogo, non sopra.** Nel Wordle
`useWordle` tiene il foglio del risultato chiuso finché l'adesivo non e' finito
(`ADESIVO_FINE_MS` in `fine.tsx`), nello Scarabeo libero il risultato aspetta
l'adesivo della fine e quello dell'ultima mossa. Chi decide se mostrarlo deve
aver visto la partita **in corso**, e per saperlo l'effetto dipende dallo stato
a tre valori (`null` finché non c'e' una partita, poi in corso o finita), non
da `finita`: con `finita` l'effetto non ripartiva quando la partita compariva,
non vedeva mai "in corso", e la partita finiva senza adesivo. Le mosse del
computer dello Scarabeo lo hanno solo da `MOSSA_DEL_COMPUTER_DA_ADESIVO` punti
in su: le altre bastano nel tabellino.

**Ogni schermata di gioco sta nello schermo, senza scorrere.** Le misure non
sono in pixel ma in unita' del contenitore: la fascia di gioco e' un
`container-type: size` che prende l'altezza lasciata da intestazione e
tastiera, e griglie, tabelloni e mari si misurano su `cqw` e `cqh`. Il lato dei
due mari della battaglia viene da una formula sola (`--lato-nemico`,
`--lato-mio` in `Battaglia.css`): il mare nemico prende quel che serve, il mio
quel che resta. Quando la fascia di gioco e' piu' bassa di 560 punti
(`@container bat (max-height: 560px)`) il mio mare non ci sta piu' con
dignita' e diventa una riga — avatar, navi a galla, freccia — che lo apre in un
foglio. Verificato con Playwright da 320×460 a 1280×800, con le aree sicure di
un'app installata.

**Un figlio piu' largo di chi ritaglia lo fa scorrere.** `overflow: hidden`
taglia quel che esce, ma il contenitore resta scorrevole: quando qualcosa
dentro prende il fuoco, o una prova automatica ci clicca, il browser lo fa
scorrere fin li'. Nella Ghigliottina i fasci di luce dello studio erano piu'
larghi della scena, e dopo la prima scelta tutta la scena restava spostata a
sinistra di trenta punti. Una decorazione che esce dai bordi sta in una
cornice sua con `overflow: hidden` (`.ghi-palco__luci`, i fasci nel `::before`):
quel che esce da una cornice cosi' non allarga piu' chi la contiene.

**Chi ritaglia deve lasciare posto agli anelli.** `.bat` e `.quiz` hanno
`overflow: hidden` per restare nello schermo, e tagliavano ai lati e in cima
l'anello della scheda dove tocca a te e quello della carta del quiz a risposta
data. I due contenitori si allargano di `--anelli` e rientrano dello stesso
tanto, con `align-self: center` al posto dei margini automatici (che con un
figlio piu' largo del padre lo spingerebbero a destra): il contenuto resta
largo com'era, e le misure in `cqw` e `cqh` non cambiano perché contano il
contenuto e non il riquadro. Un contenitore nuovo che ritaglia vuole lo stesso
margine.

**Una svg non e' piu' larga di chi la contiene.** `base.css` da' a tutte le svg
`max-width: 100%`, e l'anello del tempo del blackjack, che sporge attorno al
cerchio della puntata (`calc(100% + 10px)`), si stringeva solo in larghezza:
veniva ovale, e girato di un quarto anche spostato di lato. Una svg che deve
sporgere vuole `max-width: none`.

**Una traccia `auto` si allarga fino al contenuto.** Le carte della
panoramica delle classifiche stavano in una griglia senza colonne scritte, cioe'
con una traccia `auto`: il suo minimo e' il contenuto piu' largo, e "Battaglia
navale", che per stare su una riga non va a capo, portava ogni carta undici
punti oltre il bordo destro di un telefono largo 320. Le colonne di una griglia
di carte sono `minmax(0, 1fr)`. Un altro guaio aveva la fila di capsule della
classifica di prima: scorreva di lato, e lo scatto (`scroll-snap`) senza
`scroll-padding` la fermava con la prima capsula contro il bordo dello schermo.
Nelle classifiche niente scorre piu' di lato, e nemmeno nelle Libere, dove le
libere erano un carosello e ora sono una griglia, e gli amici dell'eroe sono
cinque posti fissi: oltre il quarto c'e' un tondo con il numero.

**La cartina muta e' un SVG, non una libreria.** In Mercatore
(`cartina/geometria.ts`), come le cartine dei telefoni: conserva le forme a ogni
scala. La proiezione di prima accorciava le longitudini del coseno della
latitudine di mezzo della vista, e fuori da quella latitudine il mondo si vedeva
schiacciato. Il mondo si taglia a un meridiano, il 180 o l'Atlantico per
l'Oceania (`taglioPer`): un poligono a cavallo si disegna due volte, spostato di
un giro, e il ritaglio tiene quel che si vede. I riquadri lo sanno
(`arcoMinimo`, `giroPrincipale`): la Russia arriva al 180 e lo passa di un niente
per l'arrotondamento, e prima il suo riquadro era il mondo intero e il suo nome
cadeva fuori dalla cartina. Si sposta e si ingrandisce con i pointer event, e un
tocco cerca il paese anche attorno al dito (`elementsFromPoint` su due anelli di
punti; fiumi, laghi e pallini con `piuVicino`): un dito e' piu' grande di Malta.
Sotto `SUPERFICIE_MINIMA_CARTINA` un paese non si chiede.

**La cartina e' una carta politica.** Cinque tinte pastello (`--carta-tinta-*`),
e due paesi che confinano non hanno mai la stessa: i confini di world-atlas sono
archi condivisi, quindi chi ne ha uno in comune confina, e `coloriVicini`
(`shared/topojson.ts`) li colora con DSATUR quando la cartina arriva, in una
ventina di millisecondi. Sui 235 paesi del mondo cinque tinte bastano sempre, e
vengono usate lo stesso numero di volte. I confini sono un filo scuro intero:
erano bianchi su un colore solo, disegnati con `paint-order: stroke`, e il paese
disegnato dopo ne copriva meta': sul telefono restava mezzo pixel bianco su una
terra quasi bianca. Sotto le terre corre la riva, le terre ancora una volta con
un tratto largo d'acqua piu' scura (`cartina__riva`, un tracciato solo), e sul
mare il reticolo ogni trenta gradi. Fra le tinte non c'e' il lilla: il colore di
una scelta e' l'indaco, e gli stati (`is-mostra`, `is-altro`, il passaggio del
mouse) lo mescolano alla tinta del paese (`--terra`).

**Il pizzico del trackpad e' una rotella con il ctrl.** Chrome, Firefox ed Edge
lo mandano cosi', a passi piccoli; Safari con i suoi GestureEvent, con la scala.
React ascolta la rotella come passiva, e una rotella passiva non si ferma: il
pizzico ingrandiva la pagina intera, e la cartina restava com'era. Gli
ascoltatori stanno sul nodo, con `passive: false` (`zoomDa` in `Cartina.tsx`); il
pizzico ha una misura sua (`0.01` contro `0.0016` di una rotella), e durante un
gesto di Safari la rotella con il ctrl non conta, perché sarebbe lo stesso gesto
due volte. Sul telefono il gesto di Safari non si segue: il pizzico lo seguono
gia' i due puntatori.

**La vista della cartina resta dove la lascia chi gioca.** La cartina e' una
sola per tutta la partita, e da una domanda all'altra non salta sul continente
della risposta: sarebbe un aiuto. La prima vista e' la zona della partita; a
risposta data la cartina va sulla risposta e sulla scelta solo se sono piccole o
fuori dallo schermo, con un margine in pixel per i nomi (`MARGINE_NOMI`), e alla
domanda dopo torna dov'era. Il mondo c'e' sempre tutto: scelta una zona, fuori
le terre si attenuano e non si toccano, ma non spariscono, altrimenti non si
capirebbe dove si e'. A risposta data la cartina smette di essere muta: i nomi
della risposta, della scelta e dei posti della domanda, con la bandiera dei
paesi, e quelli dei paesi intorno dove c'e' posto.

**Dentro una griglia CSS le percentuali mentono, su Safari.** Il Wordle era
tagliato ai lati su iPhone: `width: min(100%, ..., 83.34cqh)` dentro un
riquadro centrato con `display: grid; place-items: center`, dove il `100%` si
risolve contro una traccia `auto` che dipende dal contenuto stesso — un
riferimento circolare che WebKit risolve con la larghezza intrinseca, e la
griglia sforava. Per questo le misure usano `100cqw` e non `100%`, e il
centraggio e' con flex: le unita' del contenitore non dipendono da chi sta
dentro.

**Il mare e' un'acqua sola sotto caselle trasparenti.** Un livello
(`.mare__acque`) con un'animazione sola, invece di cento caselle animate; le
righe del foglio sono il filo interno di ogni casella, e una nave e' uno scafo
che si unisce da prua a poppa. L'acqua e il mirino sono figli assoluti della
griglia, e un figlio assoluto con la sola linea d'inizio (`grid-row: 3`) arriva
fino al bordo della griglia: per questo il mirino ha `span 1`. Senza, era
grande come mezzo mare.

**Le caselle d'angolo dello Scarabeo seguono la curva del tabellone**
(`nth-child` 1, 15, 211 e 225, con il raggio del tabellone meno il suo bordo).
Con gli angoli dritti sporgevano dal bordo arrotondato.

**Nello Scarabeo la direzione la sceglie il gioco, e la freccia la dice.**
`direzioneNaturale` (`useComposizione.ts`) guarda che cosa tocca la casella: sotto
una lettera si scrive in verticale, dopo l'ultima in orizzontale, verso la stella
alla prima mossa; con una tessera gia' posata decide la riga o la colonna della
casella toccata (`direzioneDellaPosa`). Il secondo tocco resta per le mosse di
fianco, che dalla prima casella non si indovinano. Prima la direzione era sempre
orizzontale, segnata da un filo sul lato della casella, e chi non lo vedeva
scriveva nel verso sbagliato.

**La riga di mezzo del tabellino dice che cosa legge il gioco.** Mentre si
compone ci sono le parole che la posa forma, con i loro punti — la principale e
quelle di traverso, barrate se non esistono — o perché la posa non va
(`PERCHE_NO` in `Campo.tsx`). Una mossa rifiutata per una parola di due lettere
nata di traverso, prima, sembrava un errore del gioco.

**Le tessere del leggio si prendono col dito.** Toccata, una tessera va sul
tabellone al cursore; trascinata oltre `SOGLIA` cambia posto sul leggio, con le
altre che le fanno spazio, e portata sopra il leggio si posa sulla casella dove
la si lascia (`posaSu`). La casella sotto il dito si segna con una classe messa
direttamente sul tabellone: passarla per lo stato ridisegnerebbe duecentoventicinque
caselle a ogni movimento. Le tessere gia' posate ricordano il loro posto sul
leggio (`sposta` lo aggiorna), e l'ordine scelto resta anche ricaricando la
pagina, per l'ultima partita sola (`scarabeo-leggio` nel `localStorage`).

**Oro, argento e bronzo sono token, e i gradini del podio anche** (`--oro`,
`--gradino-oro`, ...). Mescolati con `color-mix` al fondo scuro i metalli
diventavano verde oliva e grigio sporco; ora in chiaro il gradino e' tinto del
suo metallo, in scuro e' di vetro, e il filo di metallo in cima dice qual e'.

**I colori dello Scarabeo sono token scritti a mano, non mescole.** `--tessera`,
`--tessera-ink` e i quattro `--premio-*` stanno in `tokens.css` come tutto il
resto. La prima versione li ricavava con `color-mix` dai colori di sistema, e la
mescola cadeva dove capitava: in chiaro i premi erano quasi invisibili, in scuro
la tessera veniva verde oliva. Le due famiglie dicono due cose — **caldo =
moltiplica la parola**, **freddo = moltiplica la lettera** — e la saturazione
dice se e' tripla o doppia.

**Il tabellone si misura anche sull'altezza**
(`width: min(100cqw - 10px, 420px, 100cqh - 10px)` dentro `@supports`): su un
iPhone SE restano 240 punti fra intestazione e leggio, e un tabellone largo 288
ci finiva con l'ultima riga tagliata. I dieci punti sono la cornice di legno,
che e' un `box-shadow` fuori dal bordo — non occupa spazio nel layout, e senza
toglierla uscirebbe dallo schermo. Nella media query
orizzontale `container-type` torna `normal`, perché lì la pagina scorre e senza
un'altezza definita `cqh` si risolve a zero — la stessa trappola documentata per
la griglia del Wordle.

**Nel cruciverba la selezione e' indaco, non verde né gialla.** Parola e
casella che si stanno scrivendo prendono i toni del `--brand`: verde e giallo
qui direbbero "giusta" e "quasi" come nel Wordle. In scuro le bianche non sono
bianche (una griglia chiara in una schermata scura abbaglia), ma restano piu'
chiare delle nere. Le righe della griglia sono `minmax(0, 1fr)` e non `auto`:
lasciate al contenuto, una riga con le lettere scritte cresceva di qualche
punto e le caselle non restavano quadrate. Su computer — largo e con un
puntatore fine — la tastiera a schermo sparisce e le definizioni vanno accanto
alla griglia; un tablet in orizzontale e' largo uguale ma ha solo le dita.

**Il sudoku di traverso non scorre.** Quando lo schermo e' piu' largo che alto
(e largo almeno 640 punti) stato e tastierino vanno accanto alla griglia, le
cifre diventano tre per tre, e la griglia prende tutta l'altezza: `.sud` e' un
contenitore, e la fascia della griglia e' larga quanto e' alta (`min(100cqh,
...)`), altrimenti fra griglia e tastierino resterebbe un vuoto. Sul telefono
di traverso questo ci sta, e per questo `Sudoku.css` rimette l'altezza fissa
alla pagina (`.pagina--intera:has(.sud)`) che `Pagina.css` fa scorrere per tutti
i giochi. La capsula di stato e' un contenitore anche lei: stretta, perde prima
la barretta e poi il livello, e i punti restano su una riga.

**Il foglio degli aiuti e' uno solo** (`FoglioAiuti`, `src/components/Aiuti.tsx`),
per il cruciverba e per il sudoku: quanto vale adesso la partita, e un bottone
per aiuto con quel che costa. Nel sudoku libero i costi non ci sono.

**Nomi, cose e città e' il foglio del gioco su carta.** Una pagina del
quaderno a righe, con il margine rosso fra le categorie e le risposte e le
righe vuote fino in fondo; in cima la lettera nel tondo giallo e la matita
che fa da orologio. Le risposte sono scritte a mano: `--font-mano` e' il
carattere a mano che il telefono ha gia' (Noteworthy su iPhone e Mac, Segoe
Print su Windows, Coming Soon su Android), e dove non c'e' il tondo — niente
da scaricare, come i suoni. Il campo ha l'altezza scritta, perché quei
caratteri hanno misure diverse. La colonna delle categorie e' in `vw` e non in
percentuale: il margine rosso e la colonna si misurano su scatole diverse, e
in percentuale non combaciavano.

**La lettera esce da un rullo, come al tavolo, dove uno dice l'alfabeto a
mente e un altro lo ferma.** `RulloLettera` (`src/games/nomi/Rullo.tsx`) fa
correre le lettere del gioco nella finestra di un tondo giallo, con
l'alfabeto inciso sul bordo che gira insieme, e si ferma sulla lettera con i
raggi, l'onda e il suono. Parte dal tocco su Comincia, dalla difficoltà nella
libera, dal via della sfida, dove prima i secondi del tre-due-uno saltano
fuori nella finestra; quando la lettera arriva frena come i rulli della slot,
con un salto che a lettere sfocate non si vede, sempre in avanti
nell'alfabeto (`inizioFrenata`). Poi la lettera vola al suo posto sul foglio
(`VoloLettera`): e' una copia del tondo grande che rimpicciolisce — ingrandire
quello piccolo verrebbe sfocato — e il posto sul foglio aspetta vuoto finché
non arriva. Nella classificata e nella sfida il tempo intanto corre, perché
e' quello del server: per questo la scena e' corta, e riaprendo la pagina non
si rifà. Nella libera il tempo parte quando la lettera e' ferma, per chi gioca
e per il computer (la fase `pronta`, poi `parti` in `useNomiLibera`): prima
partiva con le parole, e il rullo toglieva un paio di secondi a uno e li
regalava all'altro. Un test lo prova sull'hook vero, fatto girare su un React
da banco (`nomi/__tests__/hook.test.ts`). Senza animazioni la lettera compare
e basta.

**Lo stop e' un timbro.** Un adesivo con la sua classe (`nomi-timbro`, in
`adesivi.tsx`): una carta del colore del foglio con la cornice doppia
d'inchiostro e la scritta storta, che si abbatte dall'alto; sotto, la pagina
sobbalza e si sentono il fischio d'arbitro e il colpo (`stop`). Chi dice stop
e chi lo riceve vedono lo stesso timbro, con la sua riga sotto; il tempo
finito e' lo stesso timbro, arancione. I puntini dell'inchiostro sono il
rumore di un filtro SVG usato come maschera. Le tre pagine timbrano con lo
stesso `useTimbro` (`nomi/useScena.ts`, che ha anche il volo della lettera e
quel che viene dopo la correzione), e il timbro si ricorda quando e' sceso:
la correzione aspetta quel che ne resta, anche quando la fine arriva dal
server mentre e' ancora sul foglio.

**Il foglio si corregge davanti a chi guarda, e solo dopo arriva l'adesivo.**
A partita finita passa la penna di chi corregge (`CartaScritta`): una riga
ogni `PASSO_CORREZIONE_MS`, la spunta verde o la croce rossa con il tratto che
cancella, i punti nella colonna dietro la doppia riga rossa, l'evidenziatore
sulle risposte che ha dato solo chi le ha scritte: al tavolo quelle da venti,
ieri quelle di "Solo tu", se non si giocava da soli, perché da soli lo
sarebbero tutte. Poi la somma, e per ultima la pillola dell'esito, per non
dirlo prima. L'adesivo della fine, e i coriandoli, aspettano
`tempiCorrezione(...).fine`, e il CSS disegna con le stesse variabili
(`--attesa`, `--passo-correzione`, `--totale`, `--fine`): un test legge
`NomiCose.css` e controlla che il lavoro di ogni riga stia nel suo tempo. Il
passo ha un nome lungo perché `--passo`, sul foglio, e' l'altezza delle
righe, e con lo stesso nome la correzione le schiacciava. L'attesa si decide
al primo disegno del foglio corretto (`useCorrezione`) e non cambia piu'. La
correzione e' solo per la fine vista arrivare. Le parole che si potevano
scrivere, e le piu' date di ieri, stanno su un post-it.

**Negli ultimi secondi il foglio si fa urgente.** Da venti la matita e' rossa
e trema, da dieci i secondi battono uno alla volta e il bordo del foglio
pulsa, gli ultimi cinque si sentono. A partita finita la pagina scorre
dentro, con il margine degli anelli: il foglio di oggi e quello di ieri non
stanno in uno schermo, e prima quello di ieri restava tagliato fuori, senza
modo di vederlo. Su un computer i due fogli stanno affiancati; con il
telefono di traverso l'intestazione si fa una riga e lo stop va a destra del
foglio, sotto il pollice.

**Le durate delle animazioni delle caselle sono replicate in
`src/games/wordle/useWordle.ts`** (`REVEAL_*`, `BOUNCE_MS`, `SHAKE_MS`): il
codice deve sapere quando la rotazione e' finita per colorare la tastiera e
aprire il riepilogo al momento giusto. Se si cambia una durata in `Tile.css` va
cambiata anche lì.

## Cose che sembrano sbagliate e non lo sono

**Le classi CSS sono di tutta l'app.** Ogni foglio di stile finisce nello stesso
CSS, quindi un nome comune collide: le tessere delle Libere si chiamano
`libere-tessera` perché `.tessera` e' quella del leggio dello Scarabeo, e con
lo stesso nome prendevano il suo legno. Un nome nuovo va cercato prima nel
resto del CSS.

`solutions.ts` e `guesses.ts` sono **generati** (`npm run words:build`) e
versionati di proposito: così il build non dipende dalla rete e la parola del
giorno non cambia per una fonte che si sposta.

**Le definizioni del cruciverba sono sotto CC BY-SA, non MIT.**
`scripts/data/cruciverba-definizioni.tsv.gz` contiene testo del Wikizionario,
quindi ne eredita la licenza: vedi `shared/words/SOURCES.md`. Il dump da cui
nasce (45 MB) non e' versionato: sta in `scripts/.cache/`, e
`npm run cruciverba:dati` lo riscarica.

**Il dizionario dello Scarabeo sta in tre elenchi versionati, e il DAWG anche.**
`scripts/data/dizionario-scarabeo*.txt.gz` — le comuni, le altre, le basi delle
enclitiche — si rigenerano con `node scripts/build-dizionario.mjs`, che scarica
120 MB di Wiktionary in `scripts/.cache/`; il DAWG con `npm run dawg:build`. Un
test verifica che il DAWG abbia esattamente le parole degli elenchi, ognuna al
suo livello, e l'impronta giusta. Le parole che vengono dal Wiktionary sono
CC BY-SA come le definizioni del cruciverba: vedi `shared/words/SOURCES.md`.

Le partite in corso appaiono in classifica con **zero punti**: serve a vedere
chi sta ancora giocando, non è un bug del calcolo.

In classifica può comparire chi ha **zero partite** e un punteggio pieno: sono
le giornate giocate nella stanza di qualcun altro, che valgono come le proprie
ma i cui tentativi non sono suoi. Per lo stesso motivo il profilo mostra il
pannello statistiche anche con `played === 0`, se ci sono giornate in compagnia,
e la carta della giornata nelle Giornaliere non si nasconde.

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

**Gli schemi liberi del cruciverba vengono da una scorta.** Non se ne genera uno
a richiesta, per la stessa ragione di quelli del giorno: la notte
`cruciverba.yml` tiene `cruciverba_schemi_liberi` rifornita (`--liberi`, fino a
`--al-massimo`), e ognuno ha un seme suo (`semeLibero`), diverso da quello di
qualunque giornata. Se la scorta finisce il gioco lo dice invece di rifare uno
schema gia' fatto da chi gioca.

**Non c'e' un formattatore.** Il codice e' scritto a mano nello stile di
prettier — apici singoli, niente punti e virgola, virgole finali, righe fino a
centoventi colonne — ma non c'e' un file di configurazione né un controllo, e i
file non sono allineati a nessuna larghezza: lanciare prettier, con o senza
opzioni, riformatterebbe mezzo repository.

**Le risposte del quiz stanno in chiaro in `quiz_giornate`.** E' giusto cosi':
la tabella non esce dal server, e le rotte mandano una domanda solo quando si
apre, senza la risposta. Le domande di domani esistono gia' da stanotte, come
gli schemi del cruciverba.

**Il quiz non ha un sottodominio.** Quelli dei primi giochi sono scorciatoie
rimaste dagli indirizzi di prima; il quiz e' nato sotto `giochi.<dominio>/quiz`.

**Il sottodominio Pages e' `game-hub-43l.pages.dev`, non `game-hub.pages.dev`**
(quello e' già di qualcun altro). Conta quando si scrivono i CNAME: puntare al
nome del progetto invece che al sottodominio vero lascia i domini in `pending`.

**Si entra senza password, con un codice mandato all'email.** Ci si registra con
il nickname e l'email; per entrare si scrive l'uno o l'altra, e arriva un codice
di sei cifre (`/auth/login/code`, poi `/auth/login`). Le sessioni durano un
anno, quindi il codice serve di rado: un telefono nuovo, o dopo essere usciti.
Le password c'erano fino alla migrazione `0032`, che le ha svuotate senza
toccare le sessioni: chi era dentro e' rimasto dentro. Le colonne restano,
perché sono NOT NULL e toglierle vorrebbe dire rifare la tabella dei giocatori;
nessuno le legge, e chi si registra le lascia vuote. L'impronta dei token di
sessione usa `toBase64` di `shared/base64.ts`: se cambiasse, le sessioni salvate
non si ritroverebbero piu' e uscirebbero tutti, e un test la tiene ferma su un
token noto.

**La richiesta del codice risponde sempre allo stesso modo**, che l'account
esista o no, e anche quando il codice non parte per l'attesa di un minuto fra
due invii o perché quell'account ne ha gia' avuti dieci oggi
(`CODE_LOGIN_PER_DAY`): dire "non c'e'" direbbe chi e' iscritto. Allo stesso
modo l'ingresso ha un messaggio solo per un account che non c'e' e per un codice
sbagliato, scaduto o bruciato. Il tetto del giorno e' quel che rende inutile
tirare a indovinare: cinque tentativi a codice, un codice al minuto, sarebbero
settemila combinazioni al giorno su un milione; cosi' cinquanta. L'email del
codice scrive il nickname, perché chi entra con l'email puo' non ricordarlo, ed
entrare con il codice conferma anche l'email.

**Il codice per entrare nel database si chiama `reset_password`.** Il `CHECK`
della `0004` conosceva due scopi: il codice per entrare ha preso il posto di
quello per la password nuova, che apriva l'account allo stesso modo, con l'email
(`NEL_DATABASE` in `server/lib/codes.ts`). La `0046` ha rifatto la tabella per
il terzo, `nickname`, e il nome di prima e' rimasto: cambiarlo avrebbe voluto
copiare i codici in giro durante il deploy.

**Il nickname si cambia dal profilo, una volta a settimana, con un codice
all'email** (`/auth/nickname/code`, poi `/auth/nickname`). Il codice ha lo scopo
suo, perché con quello per entrare il cambio aprirebbe anche l'account, e i due
codici si consumerebbero a vicenda. Le domande — il nome e' cambiato, e' libero,
e' passata la settimana (`NICKNAME_OGNI_GIORNI`) — si fanno prima di mandare il
codice e di nuovo quando torna, e l'`UPDATE` guarda la settimana nella sua
condizione, cosi' due richieste insieme non lo cambiano due volte; l'unicita'
la tiene l'indice di `nickname_lower`. Qui le risposte dicono che cosa non va:
chi chiede e' gia' dentro. Restano l'id, la sessione e il colore dell'avatar,
quindi le classifiche e le partite seguono da sole; cambiano gli indirizzi dei
profili degli amici (`/amici/:nickname`). Il giocatore porta da quando si
potra' cambiare di nuovo (`nicknameCambiabileDal`), e il foglio del profilo lo
dice invece di chiedere il nome.

**Senza la posta in produzione non si entra.** `emailVerificationEnabled` vuole
`EMAIL_VERIFICATION = "on"` e la chiave di Resend; senza, la registrazione crea
l'account gia' confermato, ma la richiesta del codice risponde `EMAIL_DISABLED`,
e resta dentro solo chi ha gia' una sessione. In locale, senza la chiave e solo
da localhost, il codice torna nella risposta (`codiceDiProva`) e la schermata lo
mostra: e' l'unico modo di leggerlo. Per provare il giro vero c'e' il finto
servizio di posta di `DEPLOY.md`.

## Prima di aprire una PR

```bash
npm run typecheck && npm run test && npm run build
```

Per provare davvero il gioco serve l'API, quindi `npm run dev:api` (non
`npm run dev`, che avvia solo Vite).
