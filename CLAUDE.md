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

**Il gioco sono due schermate, e lo slot sta nell'indirizzo.** `/wordle` e' il
percorso delle cinque parole, `/wordle/:slot` la griglia di una di esse. Prima la
parola scelta era uno `useState` dentro `useWordle`, perché il selettore era una
striscia sopra la griglia; con una schermata sua, cambiare parola e' una
navigazione — e il tasto indietro del telefono torna al percorso invece di
uscire dal gioco. Un indirizzo che punta a una parola ancora chiusa non mostra un
errore: il server risponde `PAROLA_BLOCCATA` e la pagina rimbalza sul percorso
dicendo quale parola la apre.

**`GET /wordle/day` non deve aprire nessuna partita.** E' la rotta che disegna il
percorso, ed e' di sola lettura come `/summary`: `openGame` scrive `started_at`,
che e' l'istante da cui si conta il bonus velocità della parola del giorno.
Passando da `/state` per sapere come disegnare i nodi, aprire la mappa e
allontanarsi dal telefono costerebbe punti — e nessuno collegherebbe il conto a
una schermata che non fa giocare. Il cronometro parte quando si apre la parola.

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
Wordle in compagnia, le sfide a battaglia navale e la partita aperta. Prima gli
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

**Le due classifiche restano separate.** Una giornata di Wordle vale al massimo
209 punti per costruzione, una di Scarabeo qualche centinaio: sommarle
richiederebbe un tasso di cambio inventato, e normalizzare per giornata ("il
migliore prende cento") cambierebbe le classifiche di ieri ogni volta che
qualcuno gioca. `/leaderboard` resta il Wordle, `/leaderboard/scarabeo` e' l'altro.

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

**La mappa del percorso e' un SVG stirato, non un rapporto fisso.** Le coordinate
delle cinque tappe stanno in `src/games/wordle/percorso.ts`, in uno spazio
100 x 168, e il riquadro le stira fino a riempire lo spazio che resta fra
intestazione e bottone: `preserveAspectRatio="none"`. Serve perché i nodi sono
posizionati in percentuale del riquadro — col comportamento normale l'SVG si
centrerebbe con due bande vuote e la curva non passerebbe piu' per i nodi.
Legando invece l'altezza alla larghezza, su un iPhone SE la scheda veniva larga
217 punti su 320 di schermo e le etichette sbordavano. Lo spessore della linea si
scala di un dieci per cento fra un tratto ripido e uno piatto: a tre pixel e
mezzo non si vede.

Tre dettagli di quella schermata che sembrano gusto e sono conseguenze:

- **Le tappe a destra si ancorano con `right`, non con `left`.** La larghezza di
  un elemento assoluto in shrink-to-fit e' limitata dallo spazio fra il lato
  ancorato e il bordo opposto: con `left: 72%` l'etichetta aveva il 28% di
  riquadro e "2ª parola" andava a capo.
- **L'etichetta si ritaglia il colore del piano** (`--surface`). Il tracciato
  arriva al nodo dal lato dove sta l'etichetta — inevitabile, e' la metà libera —
  e senza quel ritaglio la linea passava in mezzo alle lettere. Per lo stesso
  motivo il piano non ha la velatura verticale di caselle e tasti: su un pannello
  alto seicento pixel schiarisce la parte alta, e lì le etichette comparivano
  come targhette piu' scure.
- **A giornata intatta il tratto pieno non si disegna affatto.** Un
  `stroke-dasharray` di lunghezza zero con la punta arrotondata diventa un
  puntino, e quel puntino compariva in mezzo al lucchetto dell'ultima tappa.

**I colori dello Scarabeo sono token scritti a mano, non mescole.** `--tessera`,
`--tessera-ink` e i quattro `--premio-*` stanno in `tokens.css` come tutto il
resto. La prima versione li ricavava con `color-mix` dai colori di sistema, e la
mescola cadeva dove capitava: in chiaro i premi erano quasi invisibili, in scuro
la tessera veniva verde oliva. Le due famiglie dicono due cose — **caldo =
moltiplica la parola**, **freddo = moltiplica la lettera** — e la saturazione
dice se e' tripla o doppia.

**Il tabellone si misura anche sull'altezza** (`width: min(100%, 420px, 100cqh)`
dentro `@supports`): su un iPhone SE restano 240 punti fra intestazione e leggio,
e un tabellone largo 288 ci finiva con l'ultima riga tagliata. Nella media query
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
