# Deploy su Cloudflare Pages

Il sito è **già online**:

| | |
| --- | --- |
| `https://giochi.simonerecchia.com` | l'hub, con l'elenco dei giochi |
| `https://wordle.simonerecchia.com` | direttamente il Wordle di oggi |
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
| `CLOUDFLARE_API_TOKEN` | un token con Cloudflare Pages:Edit e D1:Edit |
| `CLOUDFLARE_ACCOUNT_ID` | `71fffd45bb2939fada1384f0a457d236` |

Il workflow esegue typecheck, test, build, **migrazioni D1 prima della
pubblicazione** (il codice nuovo potrebbe cercare tabelle che ancora non
esistono) e poi verifica che `/api/health` risponda su entrambi i sottodomini:
se non risponde, il deploy è considerato fallito.

Finché i segreti non ci sono, si pubblica a mano:

```bash
export CLOUDFLARE_API_TOKEN=...
npm run build && npx wrangler pages deploy dist --project-name game-hub --branch main
```

## I domini

Il sito vive su sottodomini di **`simonerecchia.com`**: uno per l'hub e uno per
ogni gioco. È sempre lo stesso progetto Pages — il sottodominio decide solo da
quale schermata si entra.

| Sottodominio | Apre |
| --- | --- |
| `giochi.simonerecchia.com` | l'hub, con l'elenco dei giochi |
| `wordle.simonerecchia.com` | direttamente il Wordle di oggi |

Sono già collegati. Per aggiungerne altri: **Custom domains** → **Set up a
custom domain** nel progetto Pages, oppure rilanciare
`scripts/setup-cloudflare.mjs` con `SUBDOMAINS` aggiornato.

> **Il record DNS non si crea da solo.** Collegare il dominio al progetto lo
> lascia in stato `pending`: serve anche un **CNAME proxato** verso il
> sottodominio Pages (`game-hub-43l.pages.dev`, non `game-hub.pages.dev` — il
> suffisso conta). Lo script lo crea; a mano va aggiunto dal pannello DNS.

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
