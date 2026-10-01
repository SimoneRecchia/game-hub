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
piu' gradino per tentativo risparmiato, cioe' `[100, 90, 80, 70, 60, 50]`, e
venti per una parola non indovinata. Il rapporto fra la giornata migliore e la
peggiore e' **2:1** di proposito: con il 6:1 di una volta due giornate
sfortunate decidevano la classifica, e una vittoria al sesto tentativo valeva
un sesto di una perfetta. C'e' un test su entrambi i lati del compromesso — che
sia recuperabile, e che il gradino non sia simbolico. I bonus di velocità (fino
a uno) e di costanza (fino a tre) sono spareggi: sommati restano sotto il
gradino di dieci.

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
schema scritto non cambia piu', come le parole del Wordle. E' deterministico
dal numero del giorno, e il budget si conta in nodi e non in millisecondi,
così una macchina piu' lenta non cambia lo schema. Se la tabella non ha la
giornata di oggi il gioco risponde `SCHEMA_ASSENTE` (503) e la card dell'hub
non mostra lo stato: in locale, `npm run cruciverba:locale`.

**Le definizioni del cruciverba si scelgono, non si scrivono.** Vengono dal
Wikizionario (CC BY-SA, estrazione di kaikki.org) e
`scripts/cruciverba/definizioni.mjs` fa solo due cose: accorcia — la prima
proposizione, un taglio a una virgola o prima di un complemento — e **scarta**.
Via i rimandi, i segnaposto, i nomi propri generici, le glosse inglesi, e ogni
definizione che contiene la risposta o la sua radice ("che regola" per
REGOLATORE, "cani" per CANE). Le forme flesse prendono la definizione del loro
lemma **della stessa parte del discorso** con la nota "plurale": ORE e' il
plurale del nome "ora", non dell'avverbio "in questo momento", e la definizione
del Wikizionario di una forma flessa ("plurale di ala") darebbe la risposta. La
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

**Nel cruciverba il tempo non da' punti.** Cento a chi lo completa senza
aiuti, tre in meno per ogni lettera svelata, uno per ogni errore segnalato da
un controllo — e ricontrollare lo stesso errore non costa (`registraControllo`).
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
cruciverba.** Cento a chi lo risolve senza aiuti, tre in meno per ogni cifra
svelata, uno per ogni cifra sbagliata trovata da un controllo — e ricontrollare
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
visibile: dice al server dove si trova il giocatore e riporta gli inviti del
Wordle in compagnia, le sfide a battaglia navale, a quiz e a Indovina chi
(rivincite comprese), le partite e il duello aperti. Gli avvisi fuori dalle
rotte (`CoopGate`, `BattagliaGate`, `QuizGate`, `IndovinaGate`) si danno la
precedenza in quest'ordine: due insieme non si leggerebbero. Prima gli
inviti del Wordle avevano il loro polling: due giri separati avrebbero
raddoppiato le richieste, e le Pages Functions gratuite ne contano centomila al
giorno per tutto il sito. La scrittura in `presenza` passa solo ogni venti
secondi o al cambio di attivita' (`segnaPresenza`), e a pagina nascosta il giro
si ferma: un telefono in tasca non e' "online" per chi vuole sfidarlo.

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

**Ogni classificata vale al massimo cento punti, e la generale e' la somma.**
Prima una giornata di Wordle valeva fino a 209 punti e una di Scarabeo qualche
centinaio, e sommarle avrebbe voluto un tasso di cambio inventato. Adesso ogni
gioco misura quel che gli e' proprio dentro lo stesso tetto (`shared/punti.ts`,
che ha la tabella di tutti): il Wordle i tentativi, lo Scarabeo il punteggio in
rapporto al computer, il cruciverba e il sudoku gli aiuti, la battaglia i colpi, il quiz
le risposte giuste (venti per aver giocato, otto per ogni giusta). Tutti
tengono il principio del Wordle — **giocarla bene vale circa il doppio di
giocarla male**, non dieci volte tanto — e `shared/__tests__/punti.test.ts`
verifica i tetti e i due lati del compromesso per ogni gioco. La
classifica di ogni gioco resta (`/leaderboard`, `/leaderboard/scarabeo`, ...), la
generale e' `/leaderboard/generale`, e `/leaderboard/panoramica` le da' tutte
in una richiesta, i primi tre di ognuna e dove sei tu: e' la schermata
`/classifica`, che le mette una sotto l'altra, e ognuna si apre per intero
(`/classifica/generale`, `/classifica/wordle`). Non si normalizza per giornata
("il migliore prende cento"): cambierebbe le classifiche di ieri ogni volta che
qualcuno gioca. Alla generale si aggiunge solo la ruota, che non e' una
classificata (vedi sotto).

**La ruota punta i punti delle classificate, una volta al giorno.** Sta fra le
carte del giorno, dopo i giochi (`/ruota`): si puntano da `PUNTATA_MINIMA` a
tutti i punti fatti oggi nelle classificate, e quel che la ruota da' o toglie
(`ruota_giri.delta`) entra nella generale del giorno, in una colonna sua
(`GeneraleRow.ruota`, gia' dentro `punti`). La puntata si misura sulle sole
classificate (`punti - ruota` della generale di oggi): la ruota non punta su se
stessa, e quel che si gioca dopo il giro conta per la giornata ma non per la
puntata, gia' fatta. Un giro per giocatore al giorno, con la chiave primaria e
un `INSERT OR IGNORE`.

**La ruota ha tre specie di spicchi, e i test le tengono ferme.** Ventiquattro
spicchi (`SPICCHI` in `shared/ruota.ts`), non i cinquantaquattro di Crazy Time:
su un telefono non si leggevano. Un x2 solo, che raddoppia la puntata ed e' il
solo spicchio che la guarda; otto "niente", che lasciano tutto com'e'; e le
sfide — testa o croce e due domande per materia — ognuna con la sua posta, da
dieci a cinquanta punti, che si vince se va bene e si perde se va male. Prima
c'erano anche un x3, i ÷2 e ÷3 e dei punti fissi: dividere una puntata non
diceva niente a nessuno, e i punti fissi sono diventati le poste delle sfide.
Si perde al massimo la posta piu' alta, e per girare servono almeno altrettanti
punti di oggi (`PUNTATA_MINIMA`): il totale del giorno non va mai sotto zero.
In media un giro vale da cinque punti in meno (chi tira a indovinare) a sedici
in piu' (chi sa tutto), piu' un ventiquattresimo della puntata per il x2; il
x2 esce un giro su ventiquattro. Siccome nessuno spicchio toglie dalla
puntata, la pagina propone di puntare tutto. `shared/__tests__/ruota.test.ts`
tiene ferme queste condizioni e la disposizione: due vicini mai dello stesso
colore (arte, libri e cinema hanno quello della cultura), le due domande di una
materia lontane. Il giro salva l'indice dello spicchio: una disposizione nuova
cambia lo spicchio mostrato per i giri gia' fatti quel giorno, quindi si cambia
a giornata finita.

**L'esito lo decide il server, e una sfida lasciata a meta' e' persa.** Lo
spicchio si pesca con `crypto.getRandomValues` (con lo scarto, perché il resto
di una divisione favorirebbe i primi), e il browser fa solo girare la ruota fin
li': la risposta di `/ruota/gira` ha gia' l'esito. Lo spicchio di una materia
che oggi non ha domande non esce. Una sfida scrive subito il `delta` di quando
va male: chi chiude la pagina davanti a una domanda difficile non si salva.
Testa o croce si sceglie prima (`/moneta` porta il lato) e la moneta la lancia
il server; la domanda e' quella del quiz, con le stesse regole del tempo:
`/domanda` scrive `aperta_at`, la risposta vale entro il limite piu'
`MARGINE_RETE_MS`, e una domanda rimasta aperta la chiude la prima `GET`. Ogni
scrittura e' condizionata allo stato appena letto.

**Le domande della ruota si fanno la notte, con quelle del quiz.**
`scripts/genera-quiz.ts` scrive in `ruota_domande` cinque domande per materia e
per giorno, fra le voci note, lontane dai soggetti della classificata dello
stesso giorno e da quelli della stessa materia delle cinque settimane prima;
il server ne pesca una quando la domanda si apre. Come le giornate del quiz,
`INSERT OR IGNORE`: una giornata scritta non cambia. `--se-manca` guarda anche
queste righe, quindi il deploy le crea per i giorni che non le hanno.

**La ruota si disegna una volta e gira scrivendo l'angolo.** Gli spicchi sono un
SVG fermo (`Disegno`, in `memo`), e a ogni fotogramma l'animazione scrive la
rotazione sul gruppo che lo contiene: passare dallo stato di React ridisegnerebbe
ventiquattro spicchi sessanta volte al secondo. Rallenta come una ruota
vera (`1 - (1 - t)^4`), si ferma dentro lo spicchio ma mai sul filo, e la
lancetta scatta a ogni spicchio, con il suono del tocco tenuto a uno ogni 45 ms
(a ruota veloce sarebbe un ronzio). Scritte e icone stanno dritte quando lo
spicchio e' sotto la lancetta, dove si guardano, e i numeri verso il bordo, dove
lo spicchio e' largo: piu' dentro, due poste vicine si leggevano come un numero
solo. La domanda arriva a parte con la carta, le risposte e la
cartina del quiz (`DomandaRuota`), che servono solo quando la ruota si ferma su
una domanda.

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

**A pari punti passa avanti chi ne ha fatti meno in compagnia.** Nel Wordle e
nella generale lo spareggio sono gli assist, **al contrario** di prima: una
giornata in compagnia vale quanto una da soli, ma fra due totali uguali vince chi
li ha fatti con le proprie partite. `rankPlayers` e `ordinaGenerale` devono
restare d'accordo; poi, nella generale, conta chi ci e' arrivato con meno
partite.

**I giochi da tavolo non hanno classificata.** Sono partite quando si vuole,
con gli amici — e contro il computer dove ha senso — senza punti ne'
classifica: nella home stanno con le libere, e nella barra laterale in una
sezione loro (`GIOCHI_DA_TAVOLO` in `src/games/catalog.ts`), non in
`GiocoClassificato`, che
porta con se' classifiche, anelli e statistiche. Sono Indovina chi, che il
computer non ce l'ha — si gioca parlandosi — e scacchi, dama, Forza 4 e go,
con un amico o contro il computer.

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

**Scacchi, dama, Forza 4 e go passano da una faccia sola.** `RegoleTavoliere`
(`shared/tavolo-regole.ts`) mette i quattro giochi dietro le stesse funzioni,
in testo: la posizione come la scrive ogni gioco (il FEN, le 32 caselle della
dama, le 42 del Forza 4, il goban) e la mossa nella notazione piu' semplice da
controllare ("e2e4", "22x13x6", la colonna, "D4" o "passo"). Il server la usa per ogni mossa
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

**Le righe dei giocatori sono larghe quanto il tavoliere.** In `Tavola` il
gruppo — l'altro, il tavoliere, io — e' una griglia larga quanto il tavoliere:
le righe hanno `width: 0` e `min-width: 100%`, quindi la riempiono senza
allargarla. Il tavoliere si misura su `--campo-alto`, l'altezza del campo meno
le due righe. Sul telefono di traverso campo e gruppo diventano
`display: contents` e i giocatori vanno a destra del tavoliere: sopra e sotto
non ci starebbero.

**Ogni gioco ha una classificata e una libera.** La **classificata** e' una al
giorno, uguale per tutti, contro il computer o contro il gioco stesso, e fa i
punti. La **libera** e' quante se ne vuole, a caso, e non entra in classifica:
Wordle con una parola a caso, Scarabeo a turni contro il computer, cruciverba
da una scorta di schemi, battaglia contro il computer o contro un amico, quiz
sulla materia, la categoria, il modo, la zona o l'ambito e le opzioni che si
scelgono. Gli
indirizzi dicono sempre dove si e': `/<gioco>/classificata`, `/<gioco>/libera`
(`src/app/rotte.ts`, che ha l'elenco completo, e i vecchi indirizzi portano ai
nuovi in `App.tsx`); `/<gioco>` da solo porta alla classificata.
I giochi da tavolo non hanno ne' l'una ne' l'altra: la
loro sala e' `/<gioco>`, e da li' `/computer`, `/partita/:id`, `/invito/:codice`
(`/scacchi`, `/dama`, `/forza-4`, `/go`).

**Il Wordle libero non pesca le parole dei prossimi giorni.** `wordleLibera.ts`
esclude le soluzioni dei prossimi sessanta giorni: altrimenti giocare a caso
diventerebbe un modo di vedere in anticipo la classificata di un giorno che
arriva, e chi gioca tanto partirebbe avvantaggiato.

**Il traguardo dello Scarabeo lo gioca il computer, la notte prima.**
`scripts/genera-computer-scarabeo.ts` fa giocare al computer normale le dieci
mosse di ogni giornata con le tessere del giorno, e scrive il punteggio in
`scarabeo_computer` con `INSERT OR IGNORE`: il riferimento di una giornata non
cambia, altrimenti due giocatori dello stesso giorno avrebbero punti su scale
diverse. I punti sono `100 × punteggio / riferimento`, fino a cento
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
si rifanno, se nessuno le ha aperte. Oggi e il passato restano come sono, anche
di un formato vecchio, e la colonna `formato` (migrazione `0016`) dice di quale.

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

**Un gioco non ha una pagina sua.** Dalla home una carta del giorno porta dritta
alla partita di oggi, e le partite libere — le libere dei sei giochi e i giochi
da tavolo, in una griglia sola — portano a sceglierle. Le pagine di ogni gioco,
con la classificata, la libera e un podio, erano un passaggio in piu' da
attraversare ogni giorno: l'indirizzo del gioco (`/wordle`, quello dei
sottodomini) porta alla classificata (`AllaClassificata` in `App.tsx`), e la
freccia indietro di ogni partita torna alla home. Le voci di un controllo
segmentato sono larghe uguali e si stringono (`min-width: 0`): altrimenti la
capsula che le segue non ci sta sopra, e su un telefono stretto l'ultima voce
esce dalla carta.

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

**La puntata della ruota invece e' una cifra, e si sceglie libera.** Non e' una
scelta fra poche alternative: si punta quanto si vuole, un punto alla volta,
dalla minima a tutti (`LineaPuntata`). La linea e' un `input type="range"` senza
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
insieme si coprirebbero. Ogni gioco ha il suo carattere dentro lo stesso
stile, senza prendere quello degli altri: il Wordle una tavoletta con gli
alloggi incavati (`--slot`) e le stelle della vittoria, lo Scarabeo il legno
della cornice e del leggio (`--legno-*`) e lo scarabeo d'oro quando si posano
tutte e otto le tessere, il cruciverba la matita e il quaderno a righe.

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
Nelle classifiche niente scorre piu' di lato, e nemmeno nella home, dove le
libere erano un carosello e ora sono una griglia.

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

**Le durate delle animazioni delle caselle sono replicate in
`src/games/wordle/useWordle.ts`** (`REVEAL_*`, `BOUNCE_MS`, `SHAKE_MS`): il
codice deve sapere quando la rotazione e' finita per colorare la tastiera e
aprire il riepilogo al momento giusto. Se si cambia una durata in `Tile.css` va
cambiata anche lì.

## Cose che sembrano sbagliate e non lo sono

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
