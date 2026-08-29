# Deploy su Cloudflare Pages

Il progetto va su **Cloudflare Pages**, la stessa piattaforma dove stava la
vecchia versione web di Vibe Gym. Una volta configurato, ogni push su `main`
pubblica da solo: qui sotto c'è solo la prima volta.

Servono i permessi sull'account Cloudflare e il repository su GitHub già
collegato (lo è).

---

## Passo 1 · Il database

L'API salva giocatori, sessioni e partite su **D1**, il SQLite di Cloudflare.
Va creato una volta e non si tocca più.

```bash
npx wrangler login          # apre il browser, chiede l'accesso a Cloudflare
npx wrangler d1 create game-hub-db
```

Il comando stampa qualcosa come:

```
[[d1_databases]]
binding = "DB"
database_name = "game-hub-db"
database_id = "a1b2c3d4-...."
```

**Copia `database_id` dentro `wrangler.toml`**, al posto del segnaposto
`SOSTITUISCI_CON_IL_TUO_D1_DATABASE_ID`. Poi crea le tabelle e salva:

```bash
npx wrangler d1 migrations apply game-hub-db --remote
git add wrangler.toml && git commit -m "Configura il database D1" && git push
```

> **Perché l'ID sta nel repository e non nella dashboard.** Quando
> `wrangler.toml` contiene `pages_build_output_dir`, Cloudflare Pages lo usa
> come unica fonte per i binding e ignora quelli impostati nella dashboard.
> Tenerlo qui rende la configurazione versionata; il rovescio è che un ID
> sbagliato romperebbe la produzione, quindi `npm run build` controlla il
> segnaposto durante i build su Pages e si ferma con un messaggio esplicito.
>
> L'ID di un database D1 non è un segreto: senza le credenziali dell'account
> non serve a nulla.

Fai questo passo **prima** del passo 2: così il primo deploy è già completo.

---

## Passo 2 · Il progetto Pages

Nella dashboard Cloudflare → **Workers & Pages** → **Create** →
**Pages** → **Connect to Git** → repository `SimoneRecchia/game-hub`.

Impostazioni del build:

| Campo | Valore |
| --- | --- |
| Project name | `game-hub` |
| Production branch | `main` |
| Framework preset | *None* |
| Build command | `npm run build` |
| Build output directory | `dist` |

Poi, in **Settings → Environment variables → Production**, aggiungi:

| Variabile | Valore | Perché |
| --- | --- | --- |
| `NODE_VERSION` | `22` | Pages parte da una versione più vecchia di quella che serve al build |

Salva e lascia partire il primo deploy. Al termine il sito risponde su
`https://game-hub.pages.dev`.

**Verifica che l'API sia collegata al database** aprendo:

```
https://game-hub.pages.dev/api/health
```

Deve rispondere con un JSON tipo
`{"ok":true,"date":"2026-08-29","puzzleNumber":1,...}`.
Se invece torna un errore 500, il binding D1 non è arrivato: ricontrolla il
passo 1 e guarda i log del build.

---

## Passo 3 · I domini

Il sito vive su sottodomini di **`simonerecchia.com`**: uno per l'hub e uno per
ogni gioco. È sempre lo stesso progetto Pages — il sottodominio decide solo da
quale schermata si entra.

| Sottodominio | Apre |
| --- | --- |
| `giochi.simonerecchia.com` | l'hub, con l'elenco dei giochi |
| `wordle.simonerecchia.com` | direttamente il Wordle di oggi |

Nel progetto Pages: **Custom domains** → **Set up a custom domain**, una volta
per ciascuno. Il dominio è già su Cloudflare, quindi il record DNS viene creato
da solo e il certificato arriva in pochi minuti.

### Perché funziona

Due pezzi, entrambi nel codice e già in funzione:

- **L'ingresso diretto.** `shared/hosts.ts` associa il primo livello dell'host
  a una rotta (`wordle` → `/wordle`) e `src/lib/useHostEntry.ts` la apre al
  primo caricamento. Scatta una volta sola: la navigazione interna verso l'hub
  resta possibile, altrimenti toccare "Giochi" dal sottodominio del gioco
  rimbalzerebbe subito indietro.
- **La sessione condivisa.** Il cookie è normalmente legato al singolo host:
  senza intervento, chi accede su `giochi.` risulterebbe sconosciuto su
  `wordle.`. La variabile `COOKIE_DOMAIN` in `wrangler.toml` lo estende a tutto
  il dominio. Viene applicata solo quando copre davvero l'host della richiesta,
  quindi su `*.pages.dev` e in locale il cookie resta del singolo host.

### Aggiungere il sottodominio di un gioco nuovo

1. Una voce in `GAME_SUBDOMAINS` in `shared/hosts.ts`
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

> **Serve https.** La password viene derivata nel browser con WebCrypto, che
> esiste solo nei contesti sicuri. Su Pages l'https c'è sempre, quindi non è un
> problema in produzione; se però si apre il sito da un IP di rete locale in
> http, l'accesso non funziona — e lo dice esplicitamente invece di dare un
> errore generico.

## Passo 4 · Dismettere la vecchia Vibe Gym web

La versione web di Vibe Gym (repository
[`SimoneRecchia/vibe-gym`](https://github.com/SimoneRecchia/vibe-gym), PWA a
singolo file) sta sullo stesso account Cloudflare. **L'app React Native
([`SimoneRecchia/VibeGym`](https://github.com/SimoneRecchia/VibeGym)) non è
coinvolta: vive sui telefoni e non ha nulla su Cloudflare.**

Nella dashboard, sul progetto Pages di `vibe-gym`:

1. **Custom domains** → rimuovi il dominio, se ne aveva uno. Va fatto **prima**:
   un dominio resta legato al progetto che lo tiene, e non può essere assegnato
   a `game-hub` finché non è libero. Se occupava un sottodominio di
   `simonerecchia.com`, questo è il momento di liberarlo.
2. **Settings → Delete project**, oppure disconnetti il repository da
   *Builds & deployments* se preferisci tenere il sito online e solo fermare i
   deploy automatici.

Cancellare il progetto Pages **non tocca il repository GitHub**: il codice della
vecchia PWA resta dov'è, se un giorno servisse.

---

## Manutenzione

**Nuove migrazioni.** Aggiungi un file numerato in `migrations/` e applicalo
prima del push, altrimenti il codice nuovo cerca tabelle che non esistono:

```bash
npx wrangler d1 migrations apply game-hub-db --remote
```

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

**Reimpostare la password di qualcuno.** Non c'è recupero via email: il modo
più rapido è cancellare il giocatore e farlo registrare di nuovo — ma così
perde i punteggi. In alternativa, cancellare le sue sessioni lo fa solo
disconnettere:

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
| Si è collegati sull'hub ma non sul gioco | `COOKIE_DOMAIN` in `wrangler.toml` non copre l'host: deve valere `simonerecchia.com` per i sottodomini di quel dominio |
| «Apri il sito in https» al momento dell'accesso | Il sito è aperto su un'origine http che non è localhost: WebCrypto non è disponibile |
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
| CPU per richiesta | 10 ms | ~5 ms nel caso peggiore (login) |

Il limite di 10 ms di CPU è la ragione per cui la derivazione della password è
divisa fra browser e server: vedi [`shared/password.ts`](shared/password.ts).
