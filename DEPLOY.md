# Deploy su Cloudflare Pages

Il sito è **già online**:

| | |
| --- | --- |
| `https://giochi.simonerecchia.com` | l'app: i giochi, le classifiche, il profilo |
| `https://wordle.simonerecchia.com` e gli altri giochi | scorciatoie: portano a `giochi.simonerecchia.com/<gioco>` |
| `https://game-hub-43l.pages.dev` | il sottodominio Cloudflare del progetto |

Ogni push su `main` ripubblica da solo tramite
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

Questo documento serve a due cose: capire com'è configurato, e rimetterlo in
piedi se serve.

## Stato attuale

| | |
| --- | --- |
| Account Cloudflare | `71fffd45bb2939fada1384f0a457d236` |
| Progetto Pages | `game-hub` — **direct upload** (non collegato a Git) |
| Sottodominio Pages | `game-hub-43l.pages.dev` — il suffisso c'è perché `game-hub.pages.dev` è già di qualcun altro |
| Database D1 | `game-hub-db`, `5b224eb2-435b-459e-ac8a-13f34a972578` |
| Variabile | `COOKIE_DOMAIN = simonerecchia.com` |
| DNS | `giochi` e `wordle` → CNAME proxato verso il sottodominio Pages |

## Ricostruire tutto da zero

C'è uno script che fa l'intero giro, ed è idempotente: si può rilanciare su un
ambiente già in piedi senza danni.

```bash
export CLOUDFLARE_API_TOKEN=...      # permessi nella tabella qui sotto
node scripts/setup-cloudflare.mjs
```

Fa, in ordine: verifica il token, crea il database D1 (o riusa), scrive il
`database_id` in `wrangler.toml`, applica le migrazioni **e controlla che le
tabelle esistano davvero**, crea il progetto Pages (o riusa), pubblica il
build, collega i sottodomini creando i record DNS, attende l'attivazione e
verifica `/api/health` su ogni host.

### Permessi del token

| Tipo | Voce | Livello |
| --- | --- | --- |
| Account | Cloudflare Pages | Edit |
| Account | D1 | Edit |
| Account | Account Settings | Read |
| Zone | DNS | Edit |
| Zone | Zone | Read |

Zone resources: `simonerecchia.com`.

## Il deploy automatico

Il progetto Pages è di tipo **direct upload**: non è collegato a Git, e
Cloudflare non permette di convertire un progetto direct-upload in
Git-connected. Il deploy automatico passa quindi da GitHub Actions.

Servono due segreti, una volta sola, in
*Settings → Secrets and variables → Actions*:

| Segreto | Valore |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | un token con Cloudflare Pages:Edit e D1:Edit — in questo account e' quello chiamato **pages-deploy** |
| `CLOUDFLARE_ACCOUNT_ID` | `71fffd45bb2939fada1384f0a457d236` |

Il token in uso non ha permessi su Workers, di proposito: qui non serve nulla di
Workers, e un token che pubblica su Pages non deve poter toccare altri script.

Il workflow esegue typecheck, test, build, **migrazioni D1 prima della
pubblicazione** (il codice nuovo potrebbe cercare tabelle che ancora non
esistono), poi rifornisce quel che il Worker non puo' calcolare da solo — gli
schemi del cruciverba delle prossime due settimane, una scorta di schemi liberi,
il traguardo del computer dello Scarabeo — e infine verifica che `/api/health`
risponda su entrambi i sottodomini: se non risponde, il deploy è considerato
fallito. Il rifornimento di tutte le notti lo fa `cruciverba.yml`.

Finché i segreti non ci sono, si pubblica a mano:

```bash
export CLOUDFLARE_API_TOKEN=...
npm run build && npx wrangler pages deploy dist --project-name game-hub --branch main
```

## I domini

L'app ha **un indirizzo solo**, `giochi.simonerecchia.com`, e ogni gioco ci sta
dentro con il suo nome. I sottodomini dei giochi restano come scorciatoie — un
link vecchio o un'icona sulla Home non si rompono — e portano all'indirizzo
vero. È sempre lo stesso progetto Pages.

| Sottodominio | Porta a |
| --- | --- |
| `giochi.simonerecchia.com` | l'app |
| `wordle.simonerecchia.com` | `giochi.simonerecchia.com/wordle` |
| `scarabeo.simonerecchia.com` | `giochi.simonerecchia.com/scarabeo` |
| `cruciverba.simonerecchia.com` | `giochi.simonerecchia.com/cruciverba` |
| `battaglia.simonerecchia.com` | `giochi.simonerecchia.com/battaglia-navale` |

Gli indirizzi dentro l'app dicono sempre dove si è: `/<gioco>` è la pagina del
gioco, `/<gioco>/classificata` la partita del giorno, `/<gioco>/libera` quella
libera, `/classifica/<gioco>` la sua classifica. L'elenco completo è in
[`src/app/rotte.ts`](src/app/rotte.ts); i vecchi indirizzi (`/wordle/3`,
`/insieme/...`, `/battaglia/...`, `/classifica?gioco=...`) portano ai nuovi.

Sono già collegati. Per aggiungerne altri: **Custom domains** → **Set up a
custom domain** nel progetto Pages, oppure rilanciare
`scripts/setup-cloudflare.mjs` con `SUBDOMAINS` aggiornato.

> **Il record DNS non si crea da solo.** Collegare il dominio al progetto lo
> lascia in stato `pending`: serve anche un **CNAME proxato** verso il
> sottodominio Pages (`game-hub-43l.pages.dev`, non `game-hub.pages.dev` — il
> suffisso conta). Lo script lo crea; a mano va aggiunto dal pannello DNS.

### Perché funziona

Due pezzi, entrambi nel codice e già in funzione:

- **Le scorciatoie.** Uno script in testa a `index.html` riconosce il
  sottodominio di un gioco e porta subito a `giochi.<dominio>/<gioco>`, prima
  che parta l'app. Sta lì e non in una Function perché le Pages non fanno
  redirect per host, e una Function davanti a ogni richiesta consumerebbe il
  tetto di richieste del piano gratuito. La stessa regola è in
  `indirizzoCanonico` (`shared/hosts.ts`), e un test le confronta.
- **La sessione condivisa.** Il cookie è normalmente legato al singolo host:
  senza intervento, chi accede su `giochi.` risulterebbe sconosciuto su
  `wordle.`. La variabile `COOKIE_DOMAIN` in `wrangler.toml` lo estende a tutto
  il dominio. Viene applicata solo quando copre davvero l'host della richiesta,
  quindi su `*.pages.dev` e in locale il cookie resta del singolo host.

### Aggiungere il sottodominio di un gioco nuovo

1. Una voce in `GAME_SUBDOMAINS` in `shared/hosts.ts` **e** nello script in
   testa a `index.html` (il test in `shared/__tests__/hosts.test.ts` cade se ne
   manca una)
2. Il dominio fra i **Custom domains** del progetto Pages

Nient'altro: il cookie e le rotte sono già a posto.

### Dopo l'attivazione

Controlla che l'API risponda da entrambi:

```
https://giochi.simonerecchia.com/api/health
https://wordle.simonerecchia.com/api/health
```

> **Un accesso in più, una volta sola.** Il cookie di sessione è legato al
> dominio da cui viene servito il sito. Chi aveva già usato
> `game-hub.pages.dev` dovrà rifare l'accesso una volta sul dominio nuovo: i
> punteggi non si perdono, stanno sul database e sono legati al nickname.

## La vecchia Vibe Gym web

La vecchia PWA è ancora online su **`vibe-gym.simonerecchia.com`** e va
dismessa a mano. Il perché:

- il **progetto Pages** `vibe-gym` non esiste più: sull'account c'è solo
  `game-hub`;
- il sito è servito da un **Worker**, non da Pages. Si vede dal record DNS:
  `AAAA vibe-gym → 100::` proxato, e Cloudflare lo marca **read-only** —
  è un *custom domain* gestito dal Worker, quindi il record si toglie soltanto
  staccando il dominio dal Worker che lo tiene.

Dalla dashboard: **Workers & Pages** → il Worker di Vibe Gym →
*Settings → Domains & Routes* → rimuovi `vibe-gym.simonerecchia.com`. Poi, se
il Worker non serve ad altro, *Settings → Delete*. Togliendo il dominio, il
record DNS sparisce da solo.

**L'app React Native
([`SimoneRecchia/VibeGym`](https://github.com/SimoneRecchia/VibeGym)) non è
coinvolta**: vive sui telefoni e non ha nulla su Cloudflare. Nemmeno il
repository della PWA ([`SimoneRecchia/vibe-gym`](https://github.com/SimoneRecchia/vibe-gym))
viene toccato: il codice resta dov'è, se un giorno servisse.

---

## Email: il codice per entrare e la conferma

Non ci sono password: ci si registra con il nickname e l'email, e **si entra
con un codice di 6 cifre mandato all'email**. Chi si registra conferma l'email
con lo stesso tipo di codice. Senza un servizio di invio, quindi, in produzione
non entra nessuno di nuovo: resta dentro solo chi ha già una sessione.

Dalle Pages Functions non si può parlare SMTP, e Cloudflare Email Routing
riceve ma non spedisce: serve un'API HTTP. La scelta è **Resend** — 3.000 email
al mese gratis, più che sufficienti per un gruppo di colleghi.

### Com'è configurata

È attiva: la registrazione manda un codice di 6 cifre e il gioco resta chiuso
finché non viene confermato, e per entrare se ne chiede uno con il nickname o
con l'email.

Il dominio mittente è **`mail.simonerecchia.com`**, verificato su Resend nella
regione `eu-west-1`. Un sottodominio e non la radice, così `@simonerecchia.com`
resta libero per una casella vera: i record MX di Resend sulla radice lo
impedirebbero.

Tre record sulla zona `simonerecchia.com`, **senza proxy** — i record di posta
non passano dal proxy, la nuvoletta grigia non è una scelta ma l'unica cosa che
funziona:

| Tipo | Nome | Cosa |
| --- | --- | --- |
| TXT | `resend._domainkey.mail` | la chiave DKIM |
| MX | `send.mail` | i rimbalzi (`feedback-smtp.eu-west-1.amazonses.com`, priorità 10) |
| TXT | `send.mail` | l'SPF (`v=spf1 include:amazonses.com ~all`) |

> **I nomi che Resend mostra sono relativi all'apice della zona**, non al
> dominio mittente: chiede `resend._domainkey.mail`, che sotto
> `simonerecchia.com` diventa `resend._domainkey.mail.simonerecchia.com`.
> Completandoli col dominio mittente invece che con la zona si ottiene
> `resend._domainkey.mail.mail.simonerecchia.com` — Cloudflare lo accetta
> volentieri, e Resend non lo trova mai.

> **Chiamare di nuovo `/verify` rimette tutti i record a `pending`** e fa
> ripartire il controllo da zero. Chiamarla dentro un ciclo di attesa impedisce
> alla verifica di arrivare in fondo: si lancia una volta e poi si aspetta.

La chiave sta fra i **segreti** del progetto Pages, non in `wrangler.toml` che è
versionato:

```bash
npx wrangler pages secret put RESEND_API_KEY --project-name game-hub
```

Quella in produzione ha permesso **Sending access**: può spedire e non toccare
la configurazione dell'account. Per aggiungere o cambiare un dominio serve una
chiave **Full access** — conviene crearla per l'occasione e cancellarla appena
il dominio è verificato.

Se la posta si rompe, **non** si spegne `EMAIL_VERIFICATION`: senza codici non
si entrerebbe in nessun modo, e la richiesta del codice risponderebbe che
l'invio non c'è. Va sistemata la posta; nel frattempo chi ha una sessione resta
dentro, perché le sessioni durano un anno.

### Com'è fatto

| | |
| --- | --- |
| Codice | 6 cifre, valido 15 minuti, 5 tentativi poi si brucia |
| Codici per entrare | al più 10 al giorno per account |
| Nel database | solo l'impronta SHA-256, legata al giocatore e allo scopo |
| Attesa fra due invii | 60 secondi |
| Mittente | `EMAIL_FROM` in `wrangler.toml` |
| Endpoint | `EMAIL_ENDPOINT`, vuoto = Resend (serve per cambiare fornitore) |

`/auth/login/code` risponde sempre allo stesso modo, anche per un nickname che
non esiste: distinguere i due casi la trasformerebbe in un modo per scoprire chi
è iscritto. L'email del codice scrive anche il nickname.

In locale, senza la chiave di Resend, il codice per entrare torna nella risposta
e la schermata lo mostra, solo se la richiesta arriva da localhost: in
produzione l'indirizzo è quello del sito, e il codice non esce mai.

### Provarla in locale

Serve un finto servizio di posta da cui leggere il codice: qualunque cosa
risponda `200` con un JSON va bene. Poi, in `wrangler.toml`,
`EMAIL_VERIFICATION = "on"` e in `.dev.vars`:

```
RESEND_API_KEY=chiave-finta
EMAIL_ENDPOINT=http://127.0.0.1:8899/emails
```

> **Attenzione alla precedenza.** In locale `.dev.vars` **vince** sulle `[vars]`
> di `wrangler.toml` — verificato su wrangler 4.127.1 mettendo i due in
> contraddizione. Quindi per spegnere la verifica in locale basta `.dev.vars`, e
> un comportamento locale che non si spiega guardando `wrangler.toml` è quasi
> sempre lì. Il file vuole formato dotenv (nessuno spazio attorno a `=`, nessuna
> virgoletta) e il cambio richiede il riavvio di `pages dev`.

## Manutenzione

**Nuove migrazioni.** Aggiungi un file numerato in `migrations/` e applicalo
prima del push, altrimenti il codice nuovo cerca tabelle che non esistono:

```bash
npx wrangler d1 migrations apply game-hub-db --remote
```

**Il dizionario dello Scarabeo** non va caricato: e' un file statico
(`public/scarabeo/dizionario.dawg`) che parte con il deploy, e il server lo legge
dagli asset. Per controllare che ci sia:

```bash
curl -sI "https://giochi.<dominio>/scarabeo/dizionario.dawg" | grep -i content-length   # 1,3 MB
```

**Gli schemi del cruciverba.** Non si generano nel Worker — riempire una
griglia non sta nei 10 ms di CPU — ma in anticipo, con
`scripts/genera-cruciverba.mjs`. In produzione lo fa da solo il workflow
**Cruciverba** (`.github/workflows/cruciverba.yml`), ogni notte alle 03:17 UTC:
tiene pronti due mesi di giornate e genera solo quelle che mancano, di solito
una. Il deploy ne controlla due settimane dopo le migrazioni, così un deploy
fatto con il workflow fermo non lascia il gioco senza schema. Usa gli stessi
segreti del deploy.

```bash
node scripts/genera-cruciverba.mjs                 # anteprima di oggi, senza database
node scripts/genera-cruciverba.mjs --local         # due settimane nel D1 locale
node scripts/genera-cruciverba.mjs --remote        # due mesi in produzione
```

Se lo schema di oggi manca, il gioco risponde "non ancora pronto" invece di
rompersi, e la card nell'hub non mostra lo stato. Per controllare la scorta:

```bash
npx wrangler d1 execute game-hub-db --remote \
  --command "SELECT MIN(puzzle_number), MAX(puzzle_number), COUNT(*) FROM cruciverba_schemi"
```

GitHub sospende i workflow programmati di un repository senza attività per
sessanta giorni: è il motivo per cui la scorta è di due mesi. Se succede, basta
riattivarlo da **Actions → Cruciverba → Enable workflow**.

**Le definizioni del cruciverba** stanno in
`scripts/data/cruciverba-definizioni.tsv.gz`, versionate. Vengono dal
Wikizionario e si rigenerano con `node scripts/build-cruciverba.mjs`, che scarica
l'estrazione di kaikki.org (circa 45 MB). Rigenerarle non cambia gli schemi già
scritti: cambia solo quelli delle giornate ancora da generare.

**Guardare i dati.**

```bash
npx wrangler d1 execute game-hub-db --remote \
  --command "SELECT nickname, created_at FROM players ORDER BY created_at"
```

**Chi sta in testa.**

```bash
npx wrangler d1 execute game-hub-db --remote --command "
  SELECT p.nickname, SUM(g.score) AS punti, COUNT(*) AS partite
    FROM wordle_games g JOIN players p ON p.id = g.player_id
   WHERE g.status != 'playing'
   GROUP BY p.id ORDER BY punti DESC"
```

**Far uscire qualcuno.** Non ci sono password da reimpostare: si rientra con il
codice all'email. Cancellare le sue sessioni lo fa uscire da tutti i
dispositivi senza toccare nient'altro:

```bash
npx wrangler d1 execute game-hub-db --remote \
  --command "DELETE FROM sessions WHERE player_id = (
              SELECT id FROM players WHERE nickname_lower = 'nickname')"
```

**Sessioni scadute.** Non danno fastidio (vengono ignorate alla lettura), ma se
la tabella cresce si possono togliere:

```bash
npx wrangler d1 execute game-hub-db --remote \
  --command "DELETE FROM sessions WHERE expires_at < datetime('now')"
```

---

## Se qualcosa non va

| Sintomo | Causa quasi sempre |
| --- | --- |
| `/api/health` risponde 500 | Il binding D1 non è arrivato: `database_id` in `wrangler.toml` è sbagliato o le migrazioni non sono state applicate con `--remote` |
| Il build si ferma dicendo «Configurazione incompleta» | Il `database_id` è ancora il segnaposto: passo 1 |
| Il build fallisce su una sintassi che in locale funziona | `NODE_VERSION` non impostata: Pages sta usando un Node più vecchio |
| Le rotte dirette (`/wordle`, `/classifica`) danno 404 | `public/_redirects` non è finito in `dist/`: dev'esserci `/*  /index.html  200` |
| L'accesso non resta memorizzato | Il sito è servito in `http`: il cookie è `Secure` e il browser lo scarta. Su Pages con dominio custom l'https c'è sempre |
| Il codice non arriva | `RESEND_API_KEY` mancante, oppure il dominio non è verificato su Resend, oppure i record DKIM/SPF sono proxati (devono essere grigi). Se arriva dopo un po', guardare anche lo spam |
| «Adesso non si può entrare: manca l'invio delle email» | `EMAIL_VERIFICATION` è `"off"`, o la chiave Resend non c'è: senza il modo di spedire non partono codici |
| Il codice giusto risulta sbagliato | È scaduto (15 minuti), o se n'è chiesto un altro dopo: vale solo l'ultimo |
| Si è collegati sull'hub ma non sul gioco | `COOKIE_DOMAIN` in `wrangler.toml` non copre l'host: deve valere `simonerecchia.com` per i sottodomini di quel dominio |
| `wordle.simonerecchia.com` apre l'hub invece del gioco | Manca la voce in `GAME_SUBDOMAINS` in `shared/hosts.ts` |
| Il dominio non si può assegnare | È ancora legato a un altro progetto Pages: passo 4, punto 1 |

## Costi

Tutto dentro il piano gratuito, per un gruppo di colleghi con ampio margine:

| | Piano gratuito | Uso previsto |
| --- | --- | --- |
| Richieste Pages Functions | 100.000 al giorno | qualche centinaio |
| Letture D1 | 5 milioni al giorno | qualche migliaio |
| Scritture D1 | 100.000 al giorno | poche decine |
| Spazio D1 | 5 GB | qualche megabyte |
| CPU per richiesta | 10 ms | pochi ms |

Il limite di 10 ms di CPU è la ragione per cui i calcoli pesanti — gli schemi,
il computer dello Scarabeo, i punti della notte — si fanno negli script della
notte o nel browser, mai nel Worker.
