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

**Il dizionario dello Scarabeo sta in D1, a secchi.** Due vincoli indipendenti lo
tengono fuori dal Worker: 271.055 parole sono 2,8 MB e il bundle del piano
gratuito ne ammette 1 MiB compresso, e costruire un insieme da centomila voci a
ogni avvio a freddo costerebbe da solo piu' dei 10 ms di CPU. E non una riga per
parola, perché il piano gratuito concede 100.000 scritture al giorno: le parole
sono raggruppate per lunghezza e prime due lettere (`chiaveDizionario`), 2.309
righe, e una verifica legge al massimo un secchio per parola formata. Se si
cambia quella chiave **va ricaricata la tabella** — c'e' un test che fissa il
formato perché il cambio non passi inosservato.

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

**La presenza e' un giro solo per tutta l'app.** `PresenzaProvider`
(`src/lib/presenza.tsx`) chiama `POST /api/presenza` ogni otto secondi a pagina
visibile: dice al server dove si trova il giocatore e riporta gli inviti del
Wordle in compagnia, le sfide a battaglia navale e a quiz (rivincite comprese),
la partita e il duello aperti. Prima gli
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
rapporto al computer, il cruciverba gli aiuti, la battaglia i colpi, il quiz
le risposte giuste (venti per aver giocato, otto per ogni giusta). Tutti
tengono il principio del Wordle — **giocarla bene vale circa il doppio di
giocarla male**, non dieci volte tanto — e `shared/__tests__/punti.test.ts`
verifica i tetti e i due lati del compromesso per ogni gioco. La
classifica di ogni gioco resta (`/leaderboard`, `/leaderboard/scarabeo`, ...), la
generale e' `/leaderboard/generale`. Non si normalizza per giornata ("il
migliore prende cento"): cambierebbe le classifiche di ieri ogni volta che
qualcuno gioca.

**A pari punti passa avanti chi ne ha fatti meno in compagnia.** Nel Wordle e
nella generale lo spareggio sono gli assist, **al contrario** di prima: una
giornata in compagnia vale quanto una da soli, ma fra due totali uguali vince chi
li ha fatti con le proprie partite. `rankPlayers` e `ordinaGenerale` devono
restare d'accordo; poi, nella generale, conta chi ci e' arrivato con meno
partite.

**Ogni gioco ha una classificata e una libera.** La **classificata** e' una al
giorno, uguale per tutti, contro il computer o contro il gioco stesso, e fa i
punti. La **libera** e' quante se ne vuole, a caso, e non entra in classifica:
Wordle con una parola a caso, Scarabeo a turni contro il computer, cruciverba
da una scorta di schemi, battaglia contro il computer o contro un amico, quiz
sulla categoria, il modo, la zona e le opzioni che si scelgono. Gli
indirizzi dicono sempre dove si e': `/<gioco>/classificata`, `/<gioco>/libera`
(`src/app/rotte.ts`, che ha l'elenco completo, e i vecchi indirizzi portano ai
nuovi in `App.tsx`).

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
il dizionario intero in un DAWG (`src/games/scarabeo/dizionario.dawg`, 600 kB,
versionato: un test verifica che sia quello che si ricostruisce dall'elenco con
`npm run dawg:build`). La partita si salva come mosse nel `localStorage` a ogni
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
sola, in un modo solo.** `scripts/genera-quiz.ts` (il passo "Il quiz" di
`cruciverba.yml`, e il deploy per le prossime due settimane) scrive in
`quiz_giornate` le dieci domande di ogni giornata, risposte comprese, con
`INSERT OR IGNORE`: come gli schemi del cruciverba, una giornata scritta non
cambia piu'. Sono deterministiche dal numero del giorno, evitano i soggetti
della stessa categoria delle cinque settimane prima, e categoria e modo li
decide `giornataDelQuiz`: giri mescolati delle categorie della classificata,
mai la stessa due giorni di fila, e due giorni per giro sulla cartina muta
(`GIORNI_CARTINA_PER_GIRO`), mai vicini. Se la giornata manca il gioco risponde
`QUIZ_ASSENTE` (503) e la card dell'hub dice "Non ancora pronto": in locale,
`npm run quiz:locale`.

L'unica eccezione al "non cambia piu'" e' `FORMATO`: una giornata di un formato
vecchio **nel futuro e che nessuno ha aperto** si riscrive (`DA_RIFARE`), perché
nessuno l'ha vista. Il 2 e' quello del modo e del `luogo` di ogni domanda, che la
cartina mostra a risposta data; oggi e il passato restano come sono, anche di un
formato vecchio, e la colonna `formato` (migrazione `0016`) dice di quale.

**Le città si giocano solo nella libera.** Sono troppe e troppo difficili per
una partita uguale per tutti: `CATEGORIE_CLASSIFICATA` non le ha. Anche il resto
della classificata e' fisso — dieci domande, il tempo del server, la cartina che
insegna, "Avanti" a mano, niente aiuti — mentre la libera sceglie tutto: fino a
`QUANTE_MASSIME` domande (cinquanta), e nelle opzioni avanzate quali domande,
fra quante risposte, quanto note, il ritmo, cosa accendere sulla cartina, i due
"50 e 50", il ripasso delle sbagliate e la morte improvvisa. L'indirizzo porta
solo quel che non e' come di solito (`BANDIERINE` in `QuizLibero.tsx`), così una
partita si condivide con un link che si legge.

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
`mul`.

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

**I testi dicono cosa fare, non perché.** Titoli di poche parole, un
sottotitolo solo quando serve a decidere, e corto; niente retroscena ("il tempo
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
gioco.

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

**Le tessere del leggio si prendono col dito.** Toccata, una tessera va sul
tabellone al cursore; trascinata oltre `SOGLIA` cambia posto sul leggio, con le
altre che le fanno spazio, e portata sopra il leggio si posa sulla casella dove
la si lascia (`posaSu`). La casella sotto il dito si segna con una classe messa
direttamente sul tabellone: passarla per lo stato ridisegnerebbe duecentoventicinque
caselle a ogni movimento. Le tessere gia' posate ricordano il loro posto sul
leggio (`sposta` lo aggiorna), e l'ordine scelto resta anche ricaricando la
pagina, per l'ultima partita sola (`scarabeo-leggio` nel `localStorage`).

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

**Il dizionario dello Scarabeo si carica a mano, una volta per ambiente:**
`node scripts/seed-dizionario.mjs [--remote]`, dopo le migrazioni. Non sta nelle
migrazioni perché sono 2,3 MB di SQL che non cambiano mai, e rieseguirli a ogni
deploy sarebbe tempo e scritture buttate. Se la tabella `dizionario` e' vuota il
gioco rifiuta **ogni** parola: e' il primo posto da guardare se "non accetta
niente".

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
