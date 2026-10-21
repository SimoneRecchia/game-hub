# Giochi

**→ [giochi.simonerecchia.com](https://giochi.simonerecchia.com)**

Quattro giochi in italiano per un gruppo di colleghi, in un'app da browser che si
installa sulla Home come un'app vera: **Wordle**, **Scarabeo**, **Cruciverba** e
**Battaglia navale**. Si entra con un nickname, e il browser se lo ricorda.

Ogni gioco ha due partite:

| | Classificata | Libera |
| --- | --- | --- |
| Quante | una al giorno | quante vuoi |
| Uguale per tutti | sì | no, a caso |
| Punti in classifica | fino a **100** | no |
| **Wordle** | la parola del giorno, sei tentativi; puoi farti aiutare da un collega | quante parole vuoi, a caso |
| **Scarabeo** | dieci mosse con le tessere del giorno, contro il punteggio del computer sulle stesse tessere | a turni contro il computer, tre livelli |
| **Cruciverba** | lo schema del giorno, definizioni dal Wikizionario | uno schema dalla scorta |
| **Battaglia navale** | contro il computer, con la sua flotta del giorno uguale per tutti | contro il computer a tre livelli, o contro un amico — online o con un link |

Pensata prima per il telefono, con tab bar di vetro e schermate di gioco a tutto
schermo; su computer le sezioni diventano una barra laterale.

---

## I punti

Ogni classificata vale **al massimo cento punti**, qualunque sia il gioco: è
quel che permette la **classifica generale**, che è la loro somma. Dentro quel
tetto ogni gioco misura quel che gli è proprio, e tutti tengono lo stesso
principio: **giocarla bene vale circa il doppio di giocarla male**, non dieci
volte tanto. Una giornata storta si recupera.

| Gioco | Cosa misura | Perfetta | Giocata male |
| --- | --- | --- | --- |
| Wordle | i tentativi | 100 al primo (+4 di spareggio) | 50 al sesto, 20 se non la indovini |
| Scarabeo | il tuo punteggio in rapporto a quello del computer | 100 se lo pareggi | 50 con metà |
| Cruciverba | gli aiuti usati | 100 senza aiuti | −3 a lettera svelata, −1 a errore |
| Battaglia | i colpi per affondare la flotta | 100 senza acqua | 59 vincendo col mare intero |

Le formule stanno in un posto solo, [`shared/punti.ts`](shared/punti.ts), e
[`shared/__tests__/punti.test.ts`](shared/__tests__/punti.test.ts) verifica i
tetti e i due lati del compromesso per ogni gioco.

**Giocare in compagnia vale uguale.** Nel Wordle classificato puoi invitare fino
a cinque colleghi sulla parola del giorno: la vedono in diretta, suggeriscono, e
prendono il tuo stesso punteggio. A pari punti in classifica passa avanti chi ne
ha fatti meno in compagnia.

---

## Com'è fatto

| | |
| --- | --- |
| Front-end | React 19 + TypeScript, build con Vite, View Transitions |
| Stile | CSS con design token (`light-dark()`), nessun framework; il design system in [`docs/design-system.md`](docs/design-system.md) |
| API | Hono su Cloudflare Pages Functions |
| Dati | Cloudflare D1 (SQLite) |
| Hosting | Cloudflare Pages, deploy automatico a ogni push su `main` |

```
shared/       codice usato sia dal browser sia dal Worker: regole dei giochi,
              punti, calendario, dizionari, i motori del computer
server/       l'API — import relativi, vedi CLAUDE.md
functions/    punto d'ingresso delle Pages Functions
src/          l'app React: app/ (rotte, navigazione), components/, games/, pages/
migrations/   schema D1, in ordine
scripts/      generatori: dizionari, schemi del cruciverba, traguardo dello Scarabeo
```

Quattro scelte spiegano il resto:

- **Il server tiene la verità.** Parole, soluzioni, flotte del computer e
  traguardi restano sul server finché la partita non è chiusa; il browser manda
  mosse e riceve esiti. Le partite si salvano come mosse, e il resto si rigioca.
- **Dieci millisecondi di CPU per richiesta.** È il limite del piano gratuito, e
  decide dove sta il lavoro: gli schemi del
  cruciverba e il traguardo dello Scarabeo si calcolano la notte prima, il
  computer dello Scarabeo libero gira in un Web Worker con il dizionario intero.
- **A polling, non in realtime.** Le partite condivise si rileggono a ritmo
  variabile, e un solo giro di presenza per tutta l'app porta gli inviti: le
  richieste sono contate.
- **Un indirizzo solo.** Tutto sta su `giochi.simonerecchia.com`, e gli
  indirizzi dicono dove si è: `/scarabeo/classificata`, `/battaglia-navale/libera`.
  I sottodomini dei giochi (`wordle.simonerecchia.com`) portano lì.

Le regole che non si vedono dal codice — e perché sono così — sono in
**[CLAUDE.md](CLAUDE.md)**.

---

## Sviluppo

Serve Node 22.

```bash
npm install

# database locale (una volta sola, e a ogni nuova migrazione)
npm run db:migrate:local
npm run cruciverba:locale            # gli schemi del cruciverba
npm run scarabeo:locale              # il traguardo del computer

# tutto insieme su http://127.0.0.1:8788 — front-end + API + D1
npm run build && npm run dev:api
```

`npm run dev` avvia solo Vite, con ricarica immediata ma senza API: utile per lo
stile, non per giocare.

| Comando | Cosa fa |
| --- | --- |
| `npm run dev:api` | Front-end, API e D1 locale insieme |
| `npm run build` | Typecheck e build di produzione |
| `npm run test` | Suite di test (Vitest) |
| `npm run typecheck` | Solo il typecheck dei progetti TS |
| `npm run words:build` | Rigenera gli elenchi del Wordle dalle fonti |
| `npm run dawg:build` | Rigenera il dizionario dello Scarabeo, per il browser e per il server |
| `npm run db:migrate:remote` | Applica le migrazioni al D1 di produzione |

Prima di una PR: `npm run typecheck && npm run test && npm run build`.

## Deploy

Ogni push su `main` esegue typecheck, test, build, migrazioni D1, il
rifornimento di schemi e traguardi, la pubblicazione, e verifica che l'API
risponda. Configurazione, domini e come ricostruire tutto:
**[DEPLOY.md](DEPLOY.md)**.

---

## Da dove vengono le parole

- **Wordle** e **Scarabeo**: [napolux/paroleitaliane](https://github.com/napolux/paroleitaliane)
  (MIT), con le frequenze d'uso di
  [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)
  (MIT, dai sottotitoli di OpenSubtitles 2018) per scegliere le parole del giorno.
- **Cruciverba**: le definizioni del [Wikizionario](https://it.wiktionary.org),
  estratte da [kaikki.org](https://kaikki.org/itwiktionary/), sotto
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.it).

Fonti, filtri e licenze nel dettaglio: [`shared/words/SOURCES.md`](shared/words/SOURCES.md).
Le tastiere hanno le **21 lettere** dell'alfabeto italiano: niente accenti e
niente J K W X Y.
