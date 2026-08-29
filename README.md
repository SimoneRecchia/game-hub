# Game Hub

Hub di giochi da browser per un gruppo di colleghi: si sceglie un nickname, si
gioca la sfida del giorno e il punteggio finisce in classifica.

Il primo gioco è un **Wordle italiano**: una parola di cinque lettere, sei
tentativi, la stessa parola per tutti, nuova a mezzanotte.

Pensato prima per il telefono, ma su desktop non è una pagina mobile ingrandita:
i tab si spostano nella barra in alto e il layout usa la larghezza disponibile.

---

## Com'è fatto

| | |
| --- | --- |
| Front-end | React 19 + TypeScript, build con Vite |
| Stile | CSS con design token, nessun framework |
| API | Hono su Cloudflare Pages Functions |
| Dati | Cloudflare D1 (SQLite) |
| Hosting | Cloudflare Pages, deploy automatico a ogni push su `main` |

Bundle iniziale: **~14 kB gzip** più React. Il dizionario dei tentativi (17 kB
gzip) si carica solo quando si entra nel gioco.

### Struttura

```
shared/       codice usato sia dal browser sia dal Worker
              (regole del gioco, punteggio, calendario, dizionari, password)
server/       implementazione dell'API — import relativi, vedi nota sotto
functions/    punto d'ingresso delle Pages Functions
src/          applicazione React
migrations/   schema D1, in ordine
scripts/      generatore dei dizionari, controllo di configurazione
```

Il codice sotto `server/` usa **import relativi** e non l'alias `@shared`: il
bundler delle Pages Functions non legge i path di `tsconfig`, e un import
aliasato farebbe fallire il build del deploy. L'alias è stato tolto da
`tsconfig.worker.json` così il typecheck se ne accorge subito.

---

## Sviluppo

Serve Node 20 o più recente.

```bash
npm install

# database locale (una volta sola, e a ogni nuova migrazione)
npm run db:migrate:local

# tutto insieme su http://127.0.0.1:8788 — front-end + API + D1
npm run dev:api
```

`npm run dev` avvia solo Vite, con ricarica immediata ma senza API: utile per
lavorare sullo stile, non per provare il gioco.

| Comando | Cosa fa |
| --- | --- |
| `npm run dev:api` | Front-end, API e D1 locale insieme |
| `npm run dev` | Solo Vite, senza API |
| `npm run build` | Typecheck e build di produzione |
| `npm run test` | Suite di test (Vitest) |
| `npm run typecheck` | Solo il typecheck dei tre progetti TS |
| `npm run words:build` | Rigenera i dizionari dalle fonti |
| `npm run db:migrate:local` | Applica le migrazioni al D1 locale |
| `npm run db:migrate:remote` | Applica le migrazioni al D1 di produzione |

---

## Deploy

Cloudflare Pages, un push su `main` e il sito si aggiorna.
La prima configurazione è in **[DEPLOY.md](DEPLOY.md)**.

---

## Le tre decisioni che spiegano il resto

### La parola la valuta il server

Finché la partita è aperta il browser non conosce la soluzione: manda il
tentativo e riceve i colori. Costa un viaggio in rete per tentativo, ma è la
differenza fra una classifica che misura qualcosa e una che misura la voglia di
aprire gli strumenti per sviluppatori.

Il controllo "questa parola non esiste" resta invece locale, così un tentativo
sbagliato non fa aspettare nessuno.

### Le password si derivano in due passaggi

Le Pages Functions sul piano gratuito hanno **10 ms di CPU per richiesta**: un
PBKDF2 robusto lato server li sfonderebbe da solo. Le 210.000 iterazioni girano
quindi nel browser e il Worker ne applica altre 12.000 su un salt casuale.

Due effetti collaterali graditi: la password in chiaro non lascia mai il
dispositivo, e chi rubasse il database dovrebbe rompere 222.000 iterazioni per
giocatore. Dettagli in [`shared/password.ts`](shared/password.ts).

L'autenticazione resta volutamente minima — nickname e password, nessuna email,
nessun secondo fattore: serve solo a legare i punteggi a una persona.

### I tentativi contano più di tutto il resto

Il tetto complessivo dei bonus (19 punti) sta sotto il gradino fra due
tentativi (20), quindi **chi indovina prima sta davanti, sempre**. Velocità e
giorni consecutivi fanno solo da spareggio. Due test verificano l'invariante e
la condizione numerica che la sostiene, perché è il tipo di vincolo che si
rompe da solo la prima volta che si ritocca una costante.

```
tentativi   120 · 100 · 80 · 60 · 40 · 20     (gradino 20)
velocità    fino a +10   (pieno sotto i 45s, zero dopo 12 minuti)
costanza    fino a  +9   (un punto per giorno consecutivo)
sconfitta         5      (aver giocato conta comunque)
```

---

## Le parole

Da due elenchi pubblici con licenza MIT, generati da uno script riproducibile
(`npm run words:build`):

- **6.453 tentativi ammessi** — permissivo di proposito
- **1.132 parole del giorno** — oltre tre anni di gioco, solo parole di uso
  comune

Fonti, filtri e criteri sono documentati in
**[`shared/words/SOURCES.md`](shared/words/SOURCES.md)** — compreso il motivo
per cui la sola frequenza d'uso non basta a scegliere le soluzioni (i
sottotitoli italiani scrivono `potro` quasi quanto `potrò`).

La tastiera ha le **21 lettere** dell'alfabeto italiano: niente accenti e
niente J K W X Y, che compaiono solo nei prestiti. Tasti più grandi sul
telefono e nessun tasto che non possa mai servire.

---

## Aggiungere un gioco

1. Una voce in [`src/games/catalog.ts`](src/games/catalog.ts)
2. Una cartella sotto `src/games/`
3. Le rotte API in `server/routes/`, montate in `server/app.ts`
4. Una migrazione in `migrations/` per le sue tabelle
5. Una rotta in `src/App.tsx`

Punteggio e classifica sono già scritti in termini di partite: un gioco nuovo
che salva `score` e `status` entra in classifica senza altro lavoro.
