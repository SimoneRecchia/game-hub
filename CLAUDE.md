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

**D1 accetta al massimo cento parametri per istruzione.** Una lista che cresce
con i giocatori non si passa con un segnaposto per elemento, ma come JSON in un
parametro solo: `IN (SELECT value FROM json_each(?))`, come fa la classifica
generale (`server/lib/generale.ts`), che con un `?` per giocatore rispondeva 500
dal centunesimo in poi. Il banco dei test (`server/__tests__/banco.ts`) ha lo
stesso limite, perché SQLite in locale ne regge molti di piu' e il test
passerebbe lo stesso.

**WebCrypto esiste solo nei contesti sicuri.** La derivazione della password
gira nel browser, quindi il sito funziona in https o su localhost, non su
un'origine http qualsiasi. `deriveVerifier` solleva `InsecureContextError` in
quel caso, e la schermata di accesso lo mostra: non toglierlo, altrimenti torna
un generico "qualcosa e' andato storto" impossibile da diagnosticare.

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
piu' gradino per tentativo risparmiato, cioe' `[70, 63, 56, 49, 42, 35]`, e
quattordici per una parola non indovinata. Il rapporto fra la giornata migliore
e la peggiore e' **2:1** di proposito: con il 6:1 di una volta due giornate
sfortunate decidevano la classifica, e una vittoria al sesto tentativo valeva
un sesto di una perfetta. C'e' un test su entrambi i lati del compromesso — che
sia recuperabile, e che il gradino non sia simbolico. I bonus di velocità (fino
a uno) e di costanza (fino a tre) sono spareggi: sommati restano sotto il
gradino di sette. Fino alla ridistribuzione dei punti la scala era la stessa
moltiplicata per dieci settimi, da cento a cinquanta e venti: le giornate di
allora valgono quel che valevano.

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

**La verita' di una partita sono le mosse.** `scarabeo_games.mosse` salva solo le
decisioni del giocatore; tabellone, leggio e punti di ogni mossa si ricalcolano
con `rigioca` e `leggioDa`. Cosi' non esiste il caso in cui la riga dice una mano
e le mosse ne implicano un'altra — la stessa ragione per cui le partite di Wordle
salvano le parole e non i colori. `score` in colonna e' l'eccezione, e sta lì
perché la classifica lo somma in SQL senza rigiocare le partite di tutti.

**Un premio vale solo la prima volta.** In `validaPosa` i moltiplicatori si
applicano alle sole caselle **appena coperte**: una parola che passa su una
tripla già usata non la riusa. Senza quel controllo la stessa casella pagherebbe
per tutta la partita, e il tabellone diventerebbe una macchina da punti.

**Passare e cambiare costano una mossa.** Altrimenti il limite di dieci mosse non
vorrebbe dire niente e il cambio diventerebbe un modo gratuito di scegliersi il
leggio. Le tessere cambiate tornano **in fondo alla coda** e non rimescolate: il
leggio deve restare una funzione delle sole mosse, e rimescolare richiederebbe di
salvare lo stato del generatore.

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

**Nel cruciverba il tempo non da' punti.** Centosessanta a chi lo completa
senza aiuti, cinque in meno per ogni lettera svelata, due per ogni errore
segnalato da un controllo — e ricontrollare lo stesso errore non costa
(`registraControllo`). La partita conta gli errori (`errori`), non quel che
costano: il costo lo applica `punteggio`, una volta sola.
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
cruciverba.** Centocinquanta a chi lo risolve senza aiuti, cinque in meno per
ogni cifra svelata, due per ogni cifra sbagliata trovata da un controllo — e
ricontrollare
la stessa cifra sbagliata non costa (`segnalate` tiene la cifra, con lo stesso
`registraControllo`). Due cifre uguali che si vedono si segnano subito nel
browser, perché si vedono a occhio; se una cifra e' sbagliata lo sa solo il
server. Le scritture passano dalla stessa coda con la `versione` del
cruciverba, e le note a matita viaggiano con la griglia (243 cifre in base
otto, `noteInTesto`): riaprendo da un altro telefono ci sono.

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
battaglia navale, a quiz, a Indovina chi, ai tavolieri e a Nomi, cose e città
(rivincite comprese), le partite e il duello aperti. Gli avvisi fuori dalle
rotte (`CoopGate`, `BattagliaGate`, `QuizGate`, `IndovinaGate`, `TavoloGate`,
`NomiGate`, `CompagniaGate`) si danno la precedenza in quest'ordine: due insieme
non si leggerebbero, e gli inviti del cruciverba e dello Scarabeo, che valgono
tutto il giorno, aspettano le sfide, che scadono in pochi minuti. Prima gli
inviti del Wordle avevano il loro polling: due giri separati avrebbero
raddoppiato le richieste, e le Pages Functions gratuite ne contano centomila al
giorno per tutto il sito. La scrittura in `presenza` passa solo ogni venti
secondi o al cambio di attivita' (`segnaPresenza`), e a pagina nascosta il giro
si ferma: un telefono in tasca non e' "online" per chi vuole sfidarlo. Gli amici
online invece non stanno nel giro: `GET /api/amici` lo chiedono solo il profilo,
le Libere e il profilo di un amico, ogni `AMICI_POLL_MS` e mentre li si guarda.

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

**Ogni classificata ha il suo tetto, e la generale e' la somma.**
Prima una giornata di Wordle valeva fino a 209 punti e una di Scarabeo qualche
centinaio, e sommarle avrebbe voluto un tasso di cambio inventato. Adesso ogni
gioco misura quel che gli e' proprio dentro un tetto deciso (`TETTI` in
`shared/punti.ts`, che ha la tabella di tutti), che segue il tempo che una
giornata chiede a chi la gioca bene: il cruciverba 160, lo Scarabeo e il sudoku
150, la battaglia 85, il quiz 75, il Wordle 70, Nomi, cose e città 60, il tris
50. Sono otto, e fanno ottocento: cento a gioco in media, e un test lo tiene.
Non in proporzione diretta: un cruciverba chiede dieci volte il tempo del tris
e vale tre volte tanto, cosi' nessun gioco da solo decide la generale. Per un
periodo tutte
valevano cento: una partita perfetta a tris valeva una perfetta a sudoku. Le
giornate di allora restano come sono, perché i punti si salvano a fine partita
e non si ricalcolano. Il Wordle misura i tentativi, lo Scarabeo il punteggio in
rapporto al computer, il cruciverba e il sudoku gli aiuti, la battaglia i colpi,
il quiz le risposte giuste (quindici per aver giocato, sei per ogni giusta), il
tris le vittorie e le patte, Nomi, cose e città le risposte valide, di piu'
quelle date da pochi. Tutti tengono il principio del Wordle —
**giocarla bene vale circa il doppio di giocarla male**, non dieci volte tanto
— e `shared/__tests__/punti.test.ts` verifica i tetti e i due lati del
compromesso per ogni gioco. La classifica di ogni gioco resta (`/leaderboard`,
`/leaderboard/scarabeo`, ...), la generale e' `/leaderboard/generale`, e
`/leaderboard/panoramica` le da' tutte in una richiesta, i primi tre di ognuna
e dove sei tu: e' la schermata `/classifica`, che le mette una sotto l'altra, e
ognuna si apre per intero (`/classifica/generale`, `/classifica/wordle`). Non
si normalizza per giornata ("il migliore prende tutto il tetto"): cambierebbe le
classifiche di ieri ogni volta che qualcuno gioca. Alla generale si aggiungono
solo i giochi della Fortuna, che non sono classificate (vedi sotto), con un
tratto loro nella barra di ogni giocatore; e la Fortuna ha una classifica sua
(`/classifica/fortuna`, `classificaFortuna`), che mette in fila quel che i tre
giochi hanno dato o tolto nel periodo: si va sotto zero, e a pari conto passa
avanti chi ha giocato meno.

**La Fortuna e' una scheda, e i suoi giochi puntano un saldo solo.**
Crazy Time, la slot e il blackjack stanno nella scheda Fortuna (`/fortuna`, il
quadrifoglio), con il saldo di oggi in cima: i punti delle classificate piu'
quel che i giochi della Fortuna hanno dato o tolto oggi (`saldoDi` in
`server/lib/fortuna.ts`). Quel che si vince a un gioco si punta all'altro. Ogni
gioco controlla il saldo dentro la sua scrittura con lo stesso pezzo di SQL
(`nettoFortunaSql`), sui conti di tutti: Crazy Time ha il suo `ruota_giornate`,
gli altri `fortuna_giornate`, una riga per giocatore, giorno e gioco, riscritta
nel batch di ogni giocata. Il blackjack e' gia' nel `CHECK` di quella tabella.
Crazy Time e' rimasto nelle sue tabelle perché spostarne i conti avrebbe voluto
copiare i giorni passati, e nei minuti del deploy il codice di prima avrebbe
scritto dove il nuovo non leggeva. La generale li somma tutti e li tiene ognuno
nella sua colonna (`GeneraleRow.ruota`, `slot`, `blackjack`); la scheda ha la
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
Quindici spicchi (`SPICCHI_RUOTA` in `shared/ruota.ts`), non i cinquantaquattro
della ruota vera: sette BANCO, tre QUIZ, tre MONETA, il triplo e la FORTUNA. Il
triplo sta in cima, dove la ruota e' ferma prima del primo giro, e la fortuna di
fronte; i banchi si alternano agli altri spicchi, con i quiz da una parte e le
monete dall'altra. La puntata si paga al lancio — il giro nasce con
`delta = -puntata` — e un minigioco vinto la restituisce moltiplicata
(`vincitaDi`, per difetto), quindi non c'e' uno spicchio che lascia tutto
com'e': sarebbe il banco con un altro nome. Il triplo la restituisce per tre
subito, senza minigioco (`MOLTIPLICATORE_FISSO`); il quiz porta alla ruota del
quiz e poi alla domanda, e una risposta sbagliata perde tutta la puntata,
qualunque sia il moltiplicatore; la moneta porta uno dei quattro moltiplicatori
di `MOLTIPLICATORI_MONETA`, deciso con il giro, che il blu paga e il rosso no;
la fortuna fa girare la ruota fortunata (vedi sotto). Chi risponde sempre giusto
riceve in media il 97,07% di quel che punta (`resa`), quanto alla roulette; chi
risponde giusto a tre domande su quattro l'86%, chi tira a indovinare il 63%:
nemmeno chi sa tutto batte il banco, come nel Crazy Time vero (dal 94 al 96%).
La resa si conta dagli spicchi (`valoreDi`: la moneta e' blu una volta su due,
la fortuna vale la media della ruota fortunata), quindi segue da sola ogni
spicchio e ogni moltiplicatore, e `shared/__tests__/ruota.test.ts` la tiene
ferma: rifatta a mano, fra il 97 e il 97,1% per chi sa, sotto la puntata per
tutti, e in punti interi a ogni puntata fino a duemila. Lo stesso file tiene le
disposizioni: il triplo in cima, mai due banchi o due quiz vicini, mai piu' di
tre spicchi fra un banco e l'altro, e mai due moltiplicatori uguali vicini sulla
ruota del quiz, nemmeno su quella fortunata. Si puo' avere fortuna una volta, e
giocando a lungo si perde: e' quel che si vuole, perché la ruota insegni che
vince il banco. Le regole lo dicono in una riga, con la resa, e niente scritte
sulla ludopatia: e' una scelta, la lezione la da' la ruota.

**Il giro salva la disposizione delle ruote** (`disposizione`,
`DISPOSIZIONE_RUOTA`): i giri di una disposizione di prima contano nel saldo e
non si mostrano, perché lo stesso indice adesso e' un altro spicchio, e una loro
sfida rimasta aperta non si gioca piu' (`NESSUN_GIRO`): la chiude il giro dopo,
con il `delta` che aveva gia', cioe' persa. La 4 e' quella della fortuna e della
ruota del quiz, e vale per tutte e tre le ruote: chi cambia uno spicchio, la
ruota fortunata o un moltiplicatore del quiz la deve far salire. Come la 3,
quella del triplo, non ha voluto una migrazione: il minigioco sta nel giro in
JSON (`sfida`), e i campi nuovi ci stanno senza toccare la tabella. La `0025`,
che ha portato la 2, aveva chiuso come perse le sfide rimaste aperte.

**La fortuna gira la ruota fortunata: gli stessi spicchi, con i premi saliti.**
`SPICCHI_FORTUNATI` ha i quindici posti della ruota: il triplo diventa ×10 e la
fortuna ×5, dei sette banchi due restano, due diventano ×3 e tre quiz; il quiz e
la moneta restano dove sono, ma portano i moltiplicatori della fortuna. Quelli
del quiz salgono ognuno di un gradino (`FORTUNATO`: ×1,25 a ×1,5, ×1,5 a ×2,
×1,75 a ×2,5, ×2 a ×3, ×3 a ×5, ×4 a ×10), e la moneta paga ×2, ×3, ×4 o ×5
(`MOLTIPLICATORI_MONETA_FORTUNATA`). Non e' un giro nuovo: e' lo stesso giro,
con la stessa puntata. La fortuna lascia il giro in `sfida`, e `/ruota/fortuna`
pesca lo spicchio fortunato e lo scrive nella sfida (`fortunata`); un premio o
il banco chiudono il giro, la moneta e il quiz lo portano avanti con i
moltiplicatori della fortuna. Si gira una volta: richiederla ridà quel che e'
uscito, e l'`UPDATE` e' condizionato alla sfida appena letta, così due tocchi
insieme non la girano due volte. Una pagina riaperta la ritrova da girare. A chi
sa tutto la ruota fortunata restituisce in media 2,97 volte la puntata: poco
meno del triplo, che e' l'unico premio sicuro, e un test lo tiene.

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
il moltiplicatore della moneta e le categorie della ruota del quiz. Cosi' anche
la ruota fortunata (`/ruota/fortuna`) e quella del quiz (`/ruota/quiz`), che a
una seconda richiesta ridanno lo stesso spicchio, e la moneta: il lato a
`/moneta`, che non porta niente. La puntata e' persa dal lancio: chi chiude la
pagina davanti a una domanda difficile non si salva, e il giro dopo la chiude
cosi' com'e'. `/domanda` vuole la ruota del quiz girata (`RUOTA_QUIZ`, 409), e
la domanda e' quella del quiz, con le stesse regole del tempo: `/domanda` scrive
`aperta_at`, la risposta vale entro il limite piu' `MARGINE_RETE_MS`, e una
domanda rimasta aperta la chiude la prima `GET`. Ogni scrittura e' condizionata
allo stato appena letto.

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
tutte. Rifarle non fa rivedere niente a nessuno, perché chi gira non rivede una
domanda lo stesso giorno e la riconosce dall'impronta (`improntaDomanda`, il
testo e la risposta, salvata nel giro con la categoria), non dal posto
nell'elenco; una categoria di cui ha visto tutto non gli esce piu' fino a
domani. `--se-manca` guarda anche queste righe, e il formato, quindi il deploy
le crea per i giorni che non le hanno.

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
quel che si guarda. Il quiz ha un'icona sola, il fumetto con il punto di domanda
(`IconaQuiz`), e la fortuna il quadrifoglio. La meta che c'e' quando la ruota
compare e' dove sta gia' ferma, quindi tornando da un minigioco la ruota non
rigira: sta sullo spicchio uscito, con l'esito sul mozzo. Ogni chiave nuova e'
un giro, anche sullo stesso spicchio. Con la tastiera si lancia con Invio o lo
spazio, e senza animazioni la ruota va subito dove deve. La domanda arriva a
parte con la carta, le risposte e la cartina del quiz (`DomandaRuota`), che
servono solo quando si arriva a una domanda.

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
fortuna. Il nastro (`NastroFortuna`) dice "Ruota fortunata", "Quiz fortunato" o
"Moneta fortunata" finché la fortuna dura, e dopo l'esito la ruota torna quella
di sempre. Senza animazioni la ruota diventa fortunata di colpo, con il suono
della magia; una pagina riaperta a fortuna in corso la trova gia' fortunata.

**Dal triplo c'e' la festa.** `FestaRuota` (`src/games/ruota/Festa.tsx`) prende
lo schermo come la festa della slot: la sala si spegne, girano i raggi,
l'insegna con le lampadine porta il moltiplicatore enorme, d'oro e con lo
spessore, e la vincita conta da zero con le monete che tintinnano sempre piu'
alte. Tre gradini (`festaDi`): il triplo; il ×5, con i raggi che girano anche al
contrario, la pioggia di monete e l'onda d'urto; il ×10, il premio piu' grande,
con il terremoto, i fuochi d'artificio e una seconda onda. Quel che viene dalla
fortuna ha il verde e l'oro, e i quadrifogli che volano con le monete. I premi
fissi hanno sempre la festa; una moneta o una domanda vinta solo dal ×5
(`FESTA_MINIGIOCO`): il ×3 della moneta esce una moneta su otto, e una festa
cosi' frequente smetterebbe di dire qualcosa. Sotto, l'adesivo d'oro e la
pioggia di monete. Monete, quadrifogli e fuochi sono un canvas con un seme fisso
per gradino, come nella slot. Un tocco finisce il conto, un altro chiude, e
finita la festa le monete vanno al saldo.

**Crazy Time si gioca di fila, e ogni passaggio ha la sua scena.** Il palco e'
scuro in tutti e due i temi, come una sala, e tiene tre scene una sopra l'altra
— la ruota, la ruota del quiz, la moneta — mentre la domanda prende la pagina
intera, come nel quiz; la ruota fortunata non e' una scena, e' la ruota stessa.
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
"Moneta"), e non ha l'anello, perché Crazy Time non finisce: c'e' solo finché
mancano i punti per la prima puntata. La ruota si riprende in mano
`INTERVALLO_GIRI_MS` dopo il lancio: senza animazioni si fermerebbe subito, e il
server direbbe di no.

**La puntata e la vincita si vedono andare e venire.** Al lancio una pila di
fiches vola dal saldo al mozzo, che diventa una fiche "in gioco", e il saldo
scende subito della puntata: e' quel che succede davvero, perché il giro nasce
con la puntata gia' tolta. Alla ruota fortunata la fiche e' gia' sul mozzo, e il
saldo non si muove. Quando la ruota si ferma una vincita torna al saldo in
monete — dal mozzo, o dalla moneta caduta sul blu — e il saldo sale quando
arriva la prima; al banco le fiches cadono dal mozzo, e il mozzo dice quanto si
e' vinto o perso. Fino ad allora il tabellone resta su quel che si e' visto
(`conto`), poi un lampo d'oro o rosso accompagna il conto nuovo. Una domanda
vinta o persa si racconta cosi' tornando alla ruota (`RITORNO_MS`). I voli sono
elementi del body animati con le Web Animations (`src/games/fortuna/voli.ts`,
che usa anche la slot), sotto gli adesivi, che dicono il momento: passare dallo
stato di React ridisegnerebbe la pagina a ogni fotogramma. Durante la domanda la
pagina della ruota resta montata e nascosta (`hidden`): rimontarla farebbe
ricontare il tabellone da zero e ridisegnare le ruote. Ogni risposta del server
passa da `aggiorna`, che scrive subito lo stato nuovo anche in `ultimo`: senza
animazioni la ruota e la moneta si fermano dentro il loro effetto, che React fa
girare prima di quello della pagina, e leggerebbero il giro di prima, come i
rulli della slot (vedi sotto).

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
scala delle triple e le vincite grosse. Si punta da 1 a `PUNTATA_MASSIMA_SLOT`,
dieci, con le fiches che si sommano (vedi sotto), e non tutto il saldo come a
Crazy Time: il ×300 dei sette su un saldo intero darebbe in un giro decine di
migliaia di punti, e la generale non vorrebbe piu' dire niente.

**Le fiches si sommano, e la puntata la dice il display.** Ogni tocco di una
fiche aggiunge il suo valore, quindi si punta qualunque cifra fra uno e dieci;
erano un gruppo di scelte, e il tocco sostituiva la puntata invece di
aggiungere. Una fiche che passerebbe il tetto — dieci, o il saldo se e' meno —
si ferma li', e il display lo dice con il MAX che lampeggia e un tocco morbido
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
cerchio della puntata, e le mie carte le piu' grandi. Tutto si misura sul
tavolo, che e' un contenitore (`cqw`, `cqh`): le scritte ad arco hanno un tetto
anche sull'altezza, perché di traverso un arco largo quanto il panno copriva le
mie carte. Sotto le scritte c'e' la linea dell'assicurazione, che si accende
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

**I giochi da tavolo non hanno classificata.** Sono partite quando si vuole,
con gli amici — e contro il computer dove ha senso — senza punti ne'
classifica: nelle Libere stanno con le libere dei giochi classificati, e nella
barra laterale sotto le Libere (`GIOCHI_DA_TAVOLO` in `src/games/catalog.ts`),
non in `GiocoClassificato`, che porta con se' classifiche, anelli e
statistiche. Sono Indovina chi, che il computer non ce l'ha — si gioca
parlandosi — e scacchi, dama, Forza 4 e go, con un amico o contro il computer.
Il tris e' un tavoliere ma non sta qui: ha la sua classificata (vedi sotto).

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

**Scacchi, dama, Forza 4, go e tris passano da una faccia sola.**
`RegoleTavoliere` (`shared/tavolo-regole.ts`) mette i cinque giochi dietro le
stesse funzioni, in testo: la posizione come la scrive ogni gioco (il FEN, le
32 caselle della dama, le 42 del Forza 4, il goban, le 9 del tris) e la mossa
nella notazione piu' semplice da controllare ("e2e4", "22x13x6", la colonna,
"D4" o "passo", la casella). Il server la usa per ogni mossa
delle partite fra amici e il telefono per quelle contro il computer, quindi le
regole sono le stesse per costruzione. Il server non rigioca la partita:
`tavolo_partite.posizione` sta accanto alle mosse e la mossa si controlla su
quella, perché rigiocarne cento a ogni richiesta non starebbe nei dieci
millisecondi. Le ripetizioni si contano con `chiavi`, le posizioni dall'ultima
mossa irreversibile (una presa, un pedone, una pedina): prima di quella nessuna
posizione puo' tornare, e la lista resta corta. Si salva la mossa come la
scrive il gioco (`giocaMossa` la restituisce), non come la manda il telefono:
la dama accetta anche "22x6" per "22x13x6".

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
in un `Suspense` attorno alle rotte, e le precarica dopo un paio di secondi.
Le statistiche delle libere del quiz stanno in `quiz/statistiche.ts` perché le
legge anche il profilo, che altrimenti si porterebbe dietro i generatori.
React Router naviga
dentro una transizione di React, quindi la schermata di prima resta finché la
nuova e' pronta, e la View Transition la fotografa montata. Per questo gli
avvisi degli inviti e la registrazione prendono i nomi da `tavolo/nomi.ts` e
non da `tavolo/giochi.ts`, che porta con se' i tavolieri.

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
la cornice e si vede solo dai buchi, come nel gioco vero: la cornice e' un
tracciato SVG con i buchi (`evenodd`) sopra lo strato dei dischi, e le colonne
da toccare stanno sopra tutto. La caduta dura la radice della distanza, come
quella di un sasso.

**Il tris ha una classificata, e i tavolieri sono la sua libera.** La
classificata e' una serie di cinque partite contro il computer del giorno
(`/tris/classificata`); la libera e' quella dei giochi da tavoliere: il tris
sta in `GIOCHI_TAVOLIERE` e in `RegoleTavoliere`, con la sala a `/tris/libera`
(`SLUG_TAVOLIERE`), contro il computer o con un amico. Non sta in
`GIOCHI_DA_TAVOLO`, che sono i giochi senza classificata, e le pagine dei
tavolieri lo trovano con `giocoTavoloDi`. Per farlo entrare la migrazione
`0028` ha rifatto `tavolo_partite` senza il `CHECK` sul gioco, che in SQLite
non si allarga: il gioco lo controlla il server, e un gioco nuovo non deve
volerla rifare un'altra volta. Prima delle migrazioni il deploy scrive nel log
il segnalibro di Time Travel di D1, da cui si torna a com'era se una tabella
rifatta andasse storta.

**Nel tris ogni mossa ha dieci secondi, e il tempo lo tiene il server.** Senza
tempo chi ci pensa abbastanza non sbaglia mai, e il tris finisce sempre patta.
Nella classificata `mossa_at` e' quando e' partito il tempo della mossa da
fare: una mossa che arriva oltre il tempo piu' `MARGINE_MOSSA_TRIS_MS` (tre
secondi, come nel quiz) non vale e la partita e' persa, e una partita lasciata
a meta' la chiude la prima richiesta che arriva dopo (`chiudiScaduta`). Allo
scadere il telefono lo dice lui (`/tris/tempo`), senza aspettare il margine: e'
una resa. Fra amici e' lo stesso (`tempoMossaMs` in `RegoleTavoliere`,
`scadenzaMossa` e `chiudiSeScaduta` in `tavoloStore.ts`), tranne la prima mossa
di ciascuno, che e' senza tempo: chi ha mandato l'invito arriva al tavoliere un
momento dopo chi l'ha accettato, quando la sala se ne accorge. Nelle partite a
tempo il giro di controllo e' di un secondo (`TAVOLO_POLL_A_TEMPO_MS`): la
mossa dell'altro arriva con il ritardo del giro, e intanto il mio tempo corre.
Contro il computer il tempo sta nel telefono, e riparte a ogni turno.

**Il computer del tris e' lo stesso per tutti, e ogni partita si puo'
vincere.** Il tris e' risolto: il valore di ogni posizione sta in una tabella
(`shared/tris-valori.ts`, che scrive `scripts/genera-tris-valori.ts` e un test
ricalcola con il minimax), perché il minimax a ogni isolato nuovo costava sei
dei dieci millisecondi. Il computer sbaglia come una persona: una svista
sottile, che lascia una forchetta, tanto piu' spesso quanto meno sono le mosse
giuste; una grossa, che non para una fila, di rado. Nella classificata le
sviste vengono dal seme della partita e dalla posizione (`mossaDelGiorno`),
quindi chi gioca le stesse mosse trova le stesse risposte. Ogni partita ha un
punto debole (`debolezzaDi`): una posizione, raggiungibile tenendo la patta, in
cui il computer sbaglia di sicuro. Si cerca una svista sottile, mai sulla prima
risposta (`PRIMA_MOSSA_DEBOLE`), che sarebbe un'apertura fortunata e non una
strada; quando comincia il computer di solito non ce n'e' — chi ha la mossa in
piu' perde con una forchetta solo alla quinta — e allora e' una fila lasciata
aperta. Un test verifica su quattrocento giorni che ogni partita si possa
vincere. Chi gioca bene ne vince circa una su due; chi sbaglia ogni tanto una
su tre, e ne perde una su cinque.

**La serie del tris conta finita.** Dieci punti per averla finita, otto per
ogni vittoria e quattro per ogni patta (`puntiTris`), fino a cinquanta: la
patta e' quel che fa chi gioca bene contro chi gioca bene, e vale la meta'
della vittoria, non zero. Il giocatore comincia la prima, la terza e la
quinta. I punti si scrivono a serie finita, come in ogni classificata, e nella
classifica del tris a pari punti passa avanti chi ha vinto di piu'. Guardare la
pagina non apre niente: la riga nasce con la prima partita (`/tris/partita`).

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
zero.** Quindici punti per aver scritto almeno una risposta, da quattro a nove
per ogni risposta valida, e il tempo che toglie al piu' un quarto alle risposte:
al massimo sessanta (`shared/nomi-cose.ts`). La rarita' di una risposta e'
`ln(giocatori / uguali) / ln(giocatori)`: uno su cinquemila vale nove, tutti
quattro, dieci su cinquemila ancora piu' di sette e mezzo. Una scala lineare
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
turni o a tempo fra due — la battaglia, il quiz, il tris, Nomi cose e città, i
tavolieri — si giocano **in sfida**, e solo nelle libere: la classificata e' una
partita uguale per tutti, e un amico la cambierebbe. Contro il computer dove ha
senso: non in Indovina chi, che si gioca parlandosi, ne' nel quiz, dove il
computer saprebbe tutte le risposte, e li' si gioca da soli. Il sudoku resta da
solo: guardarlo fare non insegna niente, e suggerire una cifra vorrebbe dire
darla. Contro chi si gioca lo dice l'interruttore Computer | Amico, ricordato
per gioco. Un gioco nuovo prende le regole della sua famiglia invece di
inventarne di nuove.

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
Wordle con una parola a caso, Scarabeo a turni contro il computer, cruciverba
da una scorta di schemi, battaglia contro il computer o contro un amico, quiz
sulla materia, la categoria, il modo, la zona o l'ambito e le opzioni che si
scelgono, Nomi, cose e città con una lettera a caso contro il computer. Gli
indirizzi dicono sempre dove si e': `/<gioco>/classificata`, `/<gioco>/libera`
(`src/app/rotte.ts`, che ha l'elenco completo, e i vecchi indirizzi portano ai
nuovi in `App.tsx`); `/<gioco>` da solo porta alla classificata.
I giochi da tavolo non hanno ne' l'una ne' l'altra: la
loro sala e' `/<gioco>`, e da li' `/computer`, `/partita/:id`, `/invito/:codice`
(`/scacchi`, `/dama`, `/forza-4`, `/go`). Il tris ha le due cose: la sua libera
e' una sala da tavoliere, a `/tris/libera`.

**Il Wordle libero non pesca le parole dei prossimi giorni.** `wordleLibera.ts`
esclude le soluzioni dei prossimi sessanta giorni: altrimenti giocare a caso
diventerebbe un modo di vedere in anticipo la classificata di un giorno che
arriva, e chi gioca tanto partirebbe avvantaggiato.

**Il traguardo dello Scarabeo lo gioca il computer, la notte prima.**
`scripts/genera-computer-scarabeo.ts` fa giocare al computer normale le dieci
mosse di ogni giornata con le tessere del giorno, e scrive il punteggio in
`scarabeo_computer` con `INSERT OR IGNORE`: il riferimento di una giornata non
cambia, altrimenti due giocatori dello stesso giorno avrebbero punti su scale
diverse. I punti sono `150 × punteggio / riferimento`, fino al tetto
(`puntiScarabeo`): il rapporto invece di una scala fissa tiene conto della
fortuna del sacchetto. Non si fa nel Worker — una mossa del computer costa
decine di millisecondi — e se la riga manca si usa `RIFERIMENTO_SCARABEO`. Le
mosse del computer si mostrano solo a giornata chiusa: prima sarebbero la
soluzione.

**Lo Scarabeo libero gira tutto nel browser.** Il computer e' un Web Worker con
il dizionario intero, lo stesso file che legge il server (vedi sopra). La
partita si salva come mosse nel `localStorage` a ogni
turno, e a fine partita va al server, che la rigioca con le stesse regole per le
statistiche. Il computer usa lo stesso motore (`shared/scarabeo-motore.ts`) del
traguardo della classificata, con tre fasce di scelta: facile, normale,
difficile.

**Nella battaglia classificata la flotta del computer e' la stessa per tutti.**
`flottaDelGiorno(numero)` la ricava dal numero del giorno, come il sacchetto
dello Scarabeo: e' l'unica cosa che rende i colpi di due giocatori
confrontabili. Il livello del computer della classificata e' il facile, e il
suo colpo arriva nella stessa richiesta del tuo — una scrittura sola per turno;
la pagina lo mostra dopo un respiro (`primaDelComputer` in `useBattaglia.ts`).
Nella classificata **non si invitano amici**: sarebbe una partita diversa per
chi ce l'ha. Contro il computer non c'e' polling: non c'e' niente da aspettare.

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
decide `giornataDelQuiz`: giri di quindici giorni, uno per categoria della
classificata, in un ordine mescolato ogni volta. Le otto categorie delle altre
materie fanno da divisori — ogni giorno di geografia sta dopo una di loro, e
ogni giro comincia con una di loro — quindi due giorni di geografia non sono
mai di fila, nemmeno a cavallo di due giri. Al confine i primi quattro giorni
non ripetono gli ultimi quattro del giro prima (`CONFINE_DEL_GIRO`), quindi una
categoria non torna prima di cinque giorni: prima al cambio di giro si leggeva
"Libri, Fiumi, Libri, Fiumi". Il calendario lo usa solo lo script della notte,
il server legge la categoria dalla giornata salvata: cambiarlo tocca solo i
giorni ancora da scrivere. Due giorni di geografia per giro sono sulla
cartina muta (`GIORNI_CARTINA_PER_GIRO`). Se la giornata manca il gioco
risponde `QUIZ_ASSENTE` (503) e la card dell'hub dice "Non ancora pronto": in
locale, `npm run quiz:locale`.

L'unica eccezione al "non cambia piu'" e' `FORMATO`: una giornata di un formato
vecchio **nel futuro e che nessuno ha aperto** si riscrive (`DA_RIFARE`), perché
nessuno l'ha vista. Il 2 e' quello del modo e del `luogo` di ogni domanda, che la
cartina mostra a risposta data; il 3 quello delle altre materie, con il
calendario nuovo: le giornate gia' scritte con il calendario di sola geografia
si rifanno, se nessuno le ha aperte. Il 4 e' quello di "Accadde oggi" che
chiede sempre l'anno (vedi sotto), e rifà solo le giornate di "Accadde oggi"
(`formatoMinimo`): quelle delle altre categorie scritte col 3 sono gia' come le
farebbe adesso. Oggi e il passato restano come sono, anche di un formato
vecchio, e la colonna `formato` (migrazione `0016`) dice di quale.

**Le città si giocano solo nella libera.** Sono troppe e troppo difficili per
una partita uguale per tutti: `CATEGORIE_CLASSIFICATA` non le ha. La libera
comincia da un menu delle materie (`/quiz/libera`), e ogni materia ha la sua
pagina (`/quiz/libera/geografia`, `VOCI_MATERIE` in `quiz/testi.ts`) con le
sottocategorie e le opzioni; la partita sta all'indirizzo del menu con le
scelte (`?categoria=…`), così i link di prima funzionano ancora. Al posto della
zona le altre materie hanno l'ambito (`AMBITI`: un periodo, un premio), "Accadde
oggi" il giorno. Gli argomenti della scienza no: chimica e astronomia chiedono
cose diverse, e nella pagina sono sottocategorie (una categoria con l'ambito
fisso), mentre per il modello e per la classificata la scienza resta una
categoria sola. Le opzioni della partita sono una per tutte le materie; la
categoria, la zona e l'ambito si ricordano per materia. Anche il resto
della classificata e' fisso — dieci domande, il tempo del server, la cartina o
la scheda che insegnano, "Avanti" a mano, niente aiuti — e la libera ne sceglie
poco, con le stesse tre sezioni in tutte le materie: la categoria, la partita
(come si risponde, nella geografia; dove o su cosa; quante domande, con
`QUANTE_LIBERE` fino a cinquanta, e il tempo) e la difficoltà, che fa partire
la partita come nelle sale dei giochi da tavolo. In cima, "Da solo | Con un
amico" come Computer | Amico nelle sale: con un amico la difficoltà apre il
foglio della sfida, e i cursori mostrano i valori della sfida (`QUANTE_SFIDA`,
`SECONDI_SFIDA`), il piu' vicino a quello scelto prima: cinquanta domande da
soli sono venti in due. La spiegazione dopo ogni risposta c'e' sempre. Le
opzioni di prima — gli aiuti, i tipi di domanda, quante risposte, la morte
improvvisa — c'erano e non le usava nessuno: il motore le ha ancora (la sfida e
il server le leggono), ma `valide` le rimette ai valori di sempre, anche da un
indirizzo o da una scelta salvata. L'indirizzo porta solo quel che non e' come
di solito, così una partita si condivide con un link che si legge.

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
Arte, libri, cinema, lirica, Nobel, storia e scienza stanno in
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
opere di quegli anni fra i primi non ce ne sono.

**Una risposta sbagliata deve essere sicuramente sbagliata, e credibile.** I
generatori delle altre materie (`shared/quiz-domande-cultura.ts`) scartano le
opzioni che potrebbero essere giuste: chi ha vinto lo stesso Nobel nello stesso
anno non e' mai fra le sbagliate, e l'altro anno di chi ne ha vinti due non e'
un anno sbagliato; una corrente sbagliata e' una che al tempo del quadro non
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
perché e' lì che partono le transizioni: avanti, indietro, scheda, con le View
Transitions dove ci sono. React Router aggiorna lo stato dentro una transizione
di React, quindi `TransizioniProvider` fa aspettare la View Transition finché la
rotta nuova e' montata (guarda la chiave della location), con un tetto di 700 ms.
I bottoni a destra della barra stanno a dodici punti l'uno dall'altro
(`.pagina__lato--destra`): a quattro, come a sinistra, si toccavano, e
l'anello dell'avatar ci finiva sopra.

**Le schede sono tre: le Libere, le Giornaliere e la Fortuna, in
quest'ordine.** Le Giornaliere (`/`, il calendario) hanno le classificate di
oggi, che sono la parte principale: stanno al centro della barra e sono la
pagina che si apre per prima, anche dall'app installata (`start_url`). Le
Libere (`/libere`, il controller) hanno le partite che non contano, le libere
dei sei giochi e i giochi da tavolo, con chi c'e' online; la Fortuna (il
quadrifoglio) i giochi d'azzardo. Si chiamavano Arena e Salotto, e `/salotto`
porta ancora alle Libere. Il profilo e la classifica non sono schede: il
profilo si apre dall'avatar in alto a destra di ogni scheda, la classifica dal
trofeo accanto e dall'eroe delle Giornaliere e della Fortuna, che portano alla
loro. Mentre si guardano il profilo e gli amici nessuna scheda e' accesa, e la
lente si spegne dov'era (`Shell.tsx`). Quale scheda e' accesa lo decide prima
`delGiorno`: `/quiz/classificata` sta anche sotto `/quiz`, che e' delle
Libere. La freccia indietro del profilo e delle classifiche dice da dove si e'
venuti: lo porta lo stato della history (`stato` di `Collegamento`), e la
classifica lo tiene cambiando periodo, perché l'indirizzo si sostituisce.

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

**La difficoltà si sceglie con le tacche, e fa partire la partita.** In tutte
le libere e nelle sale — sudoku, scarabeo, battaglia, quiz, scacchi, dama,
Forza 4, go — la difficoltà e' un elenco di righe con le tacche nel colore del
gioco (`Tacche`), e toccarne una comincia: niente "Comincia" da cercare dopo.
Contro chi si gioca, dove si puo' scegliere, e' un interruttore sopra
(Computer | Amico), ricordato per gioco, e si vede solo quel che serve a quella
scelta: la difficoltà contro il computer, gli inviti con un amico. Il colore
contro il computer non si sceglie: cambia a ogni partita (`prossimaParte` in
`tavolo/locale.ts`), come nelle rivincite fra amici.

**Un gioco non ha una pagina sua.** Dalle Giornaliere una carta del giorno porta
dritta alla partita di oggi, e dalle Libere le libere dei sei giochi e i giochi
da tavolo portano a sceglierle. Le pagine di ogni gioco, con la classificata, la
libera e un podio, erano un passaggio in piu' da attraversare ogni giorno:
l'indirizzo del gioco (`/wordle`, quello dei sottodomini) porta alla
classificata (`AllaClassificata` in `App.tsx`), e la freccia indietro di una
classificata torna alle Giornaliere, quella di una libera o di una sala alle
Libere.
Le voci di un controllo segmentato sono larghe uguali e si stringono
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
`SegmentedControl` e le tessere delle categorie sono radio group: Tab entra
sulla scelta fatta e le frecce passano alle altre (`frecceDelGruppo` in
`src/lib/gruppo.ts`, con le voci a `tabIndex` 0 o -1). Il foglio (`Sheet`) e' un
dialog modale: il fuoco entra, Tab ci gira dentro, e alla chiusura torna su quel
che l'aveva aperto. L'effetto che lo fa non dipende da `onClose`, che chi apre
il foglio passa nuova a ogni giro: ripartendo a ogni render riportava il fuoco
sul pannello, anche mentre si scriveva nella ricerca dei paesi.

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

**Chi ritaglia deve lasciare posto agli anelli.** `.bat` e `.quiz` hanno
`overflow: hidden` per restare nello schermo, e tagliavano ai lati e in cima
l'anello della scheda dove tocca a te e quello della carta del quiz a risposta
data. I due contenitori si allargano di `--anelli` e rientrano dello stesso
tanto, con `align-self: center` al posto dei margini automatici (che con un
figlio piu' largo del padre lo spingerebbero a destra): il contenuto resta
largo com'era, e le misure in `cqw` e `cqh` non cambiano perché contano il
contenuto e non il riquadro. Un contenitore nuovo che ritaglia vuole lo stesso
margine.

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
non arriva. Il tempo intanto corre, perché e' quello del server: per questo
la scena e' corta, e riaprendo la pagina non si rifà. Senza animazioni la
lettera compare e basta.

**Lo stop e' un timbro.** Un adesivo con la sua classe (`nomi-timbro`, in
`adesivi.tsx`): una carta del colore del foglio con la cornice doppia
d'inchiostro e la scritta storta, che si abbatte dall'alto; sotto, la pagina
sobbalza (`scuoti`) e si sentono il fischio d'arbitro e il colpo (`stop`).
Chi dice stop e chi lo riceve vedono lo stesso timbro, con la sua riga sotto;
il tempo finito e' lo stesso timbro, arancione. I puntini dell'inchiostro
sono il rumore di un filtro SVG usato come maschera.

**Il foglio si corregge davanti a chi guarda, e solo dopo arriva l'adesivo.**
A partita finita passa la penna di chi corregge (`CartaScritta`): una riga
ogni `PASSO_CORREZIONE_MS`, la spunta verde o la croce rossa con il tratto che
cancella, i punti nella colonna dietro la doppia riga rossa, l'evidenziatore
sulle risposte che ha dato solo chi le ha scritte; poi la somma, e per ultima
la pillola dell'esito, per non dirlo prima. L'adesivo della fine, e i
coriandoli, aspettano `tempiCorrezione(...).fine`, e il CSS disegna con le
stesse variabili (`--attesa`, `--passo`, `--totale`, `--fine`): un test legge
`NomiCose.css` e controlla che il lavoro di ogni riga stia nel suo tempo. La
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

**Il salt della password si deriva dal nickname.** Quindi il recupero password
richiede il nickname e non l'email: un verifier derivato dall'email non
corrisponderebbe a quello che il login produrra' dopo, e la password nuova
risulterebbe subito sbagliata. Vale anche per qualunque futura funzione che
reimposti una password.

**Il nickname dimenticato si recupera con l'email** (`POST /auth/nickname/request`,
dal link «Non ricordi il nickname?» nella schermata della password). Risponde
sempre allo stesso modo, che l'email sia registrata o no — il nickname lo legge
solo chi apre quella casella — e manda al massimo un'email al minuto per
persona, con un `UPDATE` condizionato su `players.nickname_email_at`: senza un
limite, chiunque potrebbe riempire di posta la casella di un collega. Anche
l'email con il codice della password scrive il nickname in chiaro, perché il
secondo passo lo chiede e chi ha chiesto il codice con l'email potrebbe non
ricordarlo.

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
