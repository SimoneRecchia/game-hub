# Il design system: l'album di adesivi

Questo documento raccoglie lo stile dell'app com'è dal 19 ottobre 2026, quando sono stati scelti i mockup
"album di adesivi". Dice **che cosa** usare e **come**; il **perché** di ogni scelta, con la storia di
quel che c'era prima, sta nelle note di `CLAUDE.md` (sezione "Il design"). I valori veri sono nel
codice: `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/fonts.css` e `src/components/`. Se
questo documento e il codice non sono d'accordo, ha ragione il codice, e va corretto il documento.

---

## 1. I principi

1. **Sembra un'app, non un sito.** Ogni schermata è una `Pagina`, le navigazioni passano da
   `useNavigazione` o `Collegamento`, e le schermate di gioco stanno nello schermo senza scorrere.
2. **Ogni cosa è un oggetto disegnato.** Carte e tasti hanno il filo d'inchiostro e l'ombra secca
   sotto, come un adesivo incollato su una pagina. Niente ombre sfocate pesanti, niente resa
   fotografica, niente materiali realistici.
3. **Colori pieni, inchiostro sopra.** I colori sono pastello pieni (giallo, menta, rosa, cielo,
   lilla, pesca) e sopra ci va sempre l'inchiostro scuro, in tutti e due i temi.
4. **Il colore vuole dire una cosa sola.** Il verde è "giusto", il giallo "quasi", l'indaco
   "scelto"; il colore di un gioco dice di che gioco si parla, e basta.
5. **Giocoso dove si gioca, sobrio dove si legge.** Lilita One per titoli, numeri e lettere; Nunito
   per il testo. Le animazioni sono tante ma brevi, e solo `transform` e `opacity`.
6. **Niente stress.** I giochi sono per la pausa: nessun bottone spento senza una parola, nessun
   rimprovero, e nella Fortuna non si legge mai una perdita (vedi §8).
7. **I testi dicono cosa fare, non perché.** Poche parole; le spiegazioni stanno nel foglio della "i".

---

## 2. Le fondamenta

### 2.1 Come sono fatti i token

Ogni colore è un `light-dark(chiaro, scuro)`, preceduto dal valore chiaro nudo per i browser che non
conoscono `light-dark()`:

```css
--surface: #fffbf2;
--surface: light-dark(#fffbf2, #35315f);
```

Il tema lo decide solo `color-scheme` (la preferenza di sistema, o `:root[data-theme]`
dell'interruttore): la palette scura non è mai scritta due volte. `light-dark()` va **solo attorno a
un colore**: su un `box-shadow` intero il valore diventa invalido e l'ombra sparisce. Per le ombre il
colore sta in un token (`--shadow-tint`, `--ink`) e la geometria resta fuori.

### 2.2 L'inchiostro e il filo

| Token | Valore | Uso |
|---|---|---|
| `--ink` | `#2a1f5c` / `#120c2b` | Contorni e ombre secche. Scuro **anche nel tema scuro**: è il contorno degli oggetti, non il testo. |
| `--ink-tenue` | 30% dell'inchiostro | Contorni spenti, tasti disabilitati. |
| `--filo` | `2.5px` | Lo spessore del contorno. 2px sulle cose piccole (badge, pallini). |
| `--carta-luce` | bianco 65% / 8% | La luce interna in cima a carte e tasti. |

### 2.3 Le ombre degli oggetti

| Token | Valore | Uso |
|---|---|---|
| `--ombra-carta` | `0 5px 0 ink, inset 0 3px 0 carta-luce` | Le carte, con `border: var(--filo) solid var(--ink)`. |
| `--ombra-album` | `inset 0 0 0 filo ink, 0 4px 0 ink` | Le carte che i giochi misurano al punto: il filo è un'ombra, così non cambia le misure. |
| `--ombra-tasto` | `0 4px 0 ink, inset 0 3px 0 bianco 50%` | I tasti a riposo. |
| `--ombra-tasto-giu` | `0 1px 0 ink, …` | Il tasto premuto, insieme a `transform: translateY(3px)`. |
| `--shadow-sm/md/lg` | tinte blu-viola sfocate | Solo per ciò che galleggia (fogli, toast, barre di vetro). Mai nero puro. |

**Un tasto premuto scende sulla sua ombra**, non si rimpicciolisce: lo `scale` fa sembrare il tasto
un'immagine che si allontana.

La pressione si scrive `:is(:active, [data-premuto])`, mai `:active` da solo: l'attributo lo mette
`src/lib/premuto.ts` appena il dito tocca, e sul telefono `:active` arrivava tardi, a volte solo
alzando il dito. Il tasto scende subito (la transizione vale solo per il ritorno), e un bottone o un
link senza una pressione sua scende di due punti da solo (`base.css`).

### 2.4 I colori

**I colori pieni dell'album** (uguali nei due temi, sopra sempre `--ink`):

| Token | Valore | Dove |
|---|---|---|
| `--giallo` | `#ffc93c` | Il tasto d'azione delle tastiere, la capsula del controllo segmentato, il "quasi" del Wordle. |
| `--menta` | `#6fe6b8` | Il bottone principale (`Button` pieno). |
| `--rosa` | `#ff8fbf` | Badge, etichette. |
| `--cielo` | `#6ec1ff` | Etichette, decorazioni. |
| `--lilla` | `#c9b8ff` | Etichette; nella Fortuna il biglietto neutro del "giro dopo". |
| `--pesca` | `#ffb48a` | Etichette, decorazioni. |
| `--biglietto` | `#fff1c9` / `#ffe9a8` | La carta del biglietto dentellato. |

**L'accento dell'interfaccia** è l'indaco: `--brand` (`#4f46e5` / `#b4aeff`), con `--brand-ink` per la
scritta sopra e `--brand-soft` per i fondi tenui. È il colore di ogni **scelta** (la selezione del
cruciverba, il cursore, la casella toccata).

**I colori semantici** restano quelli convenzionali: `--green` riuscito, `--red` distruttivo,
`--orange`, `--yellow`, `--blue`, `--teal`, `--pink`, `--purple`. Nella Fortuna il rosso non si usa per
gli esiti (§8).

**Le superfici** salgono di luminosità invece di restare piatte:

| Token | Chiaro | Scuro | Uso |
|---|---|---|---|
| `--bg` | `#fff0ea` | `#26224c` | Il fondo dell'app (carta calda / viola notte). |
| `--surface` | `#fffbf2` | `#35315f` | Le carte. |
| `--surface-2` | `#f5edfa` | `#3e3970` | Una carta dentro una carta, hover. |
| `--surface-3` | `#ebe2f6` | `#474180` | Il terzo gradino. |
| `--bg-elevated` | `#fffbf2` | `#2a2160` | I fogli. |
| `--fill-*`, `--separator` | inchiostro al 6–15% | bianco al 8–20% | Riempimenti, fili fra le righe. |

**Il testo:**

| Token | Uso | Contrasto |
|---|---|---|
| `--label` | Il testo. | — |
| `--label-secondary` | Etichette, conti, titoletti. | 5:1 o più |
| `--label-tertiary` | **Solo** frecce e decorazioni, mai parole. | 2,4:1 |
| `--label-inverted` | Testo sopra un fondo d'inchiostro. | — |

**I fondali** delle schede sono sfumature con tre macchie di colore (`--macchia-1/2/3`) e i puntini
(`--puntini`): `--fondo-giornaliere` (pesca e rosa), `--fondo-libere` (menta e azzurro),
`--fondo-pagina` (lilla, rosa, crema). Le macchie sono sfumature, non cerchi con `filter: blur`.

**Il podio:** `--oro`, `--argento`, `--bronzo` per anelli e numeri dei primi tre; i gradini sono pieni
del loro metallo con il filo d'inchiostro.

### 2.5 La tipografia

| Ruolo | Carattere | Peso |
|---|---|---|
| Titoli, numeri, lettere dei giochi, bottoni | **Lilita One** (`--font-rounded`) | 400, l'unico che ha |
| Testo | **Nunito** (`--font-text`) | 600 il corpo, 700–900 l'enfasi |
| Risposte scritte a mano (Nomi, cose e città, schedina) | `--font-mano` | quello del sistema |
| Codice, cifre tabellari | `--font-mono` | — |

I due caratteri sono serviti dal sito (`public/fonts/`, licenza OFL), mai da Google. `font-synthesis:
none` è globale: il grassetto finto di Lilita One la sbava.

**La scala** (`--text-*`): hero 52, display 42, large-title 34, title-1 28, title-2 22, title-3 20,
headline/body 17, callout 16, subhead 15, footnote 13, caption-1 12, caption-2 11. Hero e display sono
per i numeri del gioco, che sono l'elemento grafico principale.

**Spaziatura delle lettere:** `--tracking-tight` 0.005em, `--tracking-wide` 0.06em (etichette in
maiuscoletto), `--tracking-display` −0.01em (numeri grandi). Lilita e Nunito sono già strette: non
stringerle oltre.

### 2.6 Spazi, raggi, layout

- **Spaziature** a multipli di quattro: `--sp-1` 4, `--sp-2` 8, `--sp-3` 12, `--sp-4` 16, `--sp-5` 20,
  `--sp-6` 24, `--sp-8` 32, `--sp-10` 40, `--sp-12` 48. Il margine laterale sul telefono è 16.
- **Raggi:** `--r-xs` 7, `--r-sm` 11, `--r-md` 15, `--r-lg` 20, `--r-xl` 24, `--r-2xl` 30, `--r-pill`.
  I tasti stanno fra 10 e 18, le carte fra 20 e 28, i fogli 30 in cima.
- **Layout:** barra in alto `--nav-h` 52; tab bar `--tabbar-h` 64 e galleggiante (`--tabbar-spazio`);
  barra laterale del computer `--sidebar-w` 264; colonna `--content-max` 760; le aree sicure
  `--safe-*`.
- **Area da toccare:** almeno 44 punti, anche quando il disegno è più piccolo.

### 2.7 Il movimento

| Token | Valore | Uso |
|---|---|---|
| `--ease-out` | `cubic-bezier(.32,.72,0,1)` | Il default. |
| `--ease-in-out` | `cubic-bezier(.4,0,.2,1)` | Andata e ritorno. |
| `--ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | La capsula del controllo segmentato, le maniglie. |
| `--ease-bounce` | `cubic-bezier(.2,1.9,.4,1)` | Le cose che devono sembrare oggetti (adesivi, timbri). |
| `--ease-push` | `cubic-bezier(.2,.9,.1,1)` | Una schermata o un foglio che entra. |
| `--dur-fast/base/slow/push` | 140 / 240 / 420 / 440 ms | — |

Regole:

- **Solo `transform` e `opacity`.** Niente animazioni di `width`, `top`, `filter` o `box-shadow` su
  cose grandi: il telefono le ridisegna a ogni fotogramma.
- **Brevi:** 200–600 ms per un passo; le scene (un giro, una festa) quanto serve.
- **Ogni passo percepito ha la sua animazione**: niente teletrasporti. Il codice aspetta la fine
  dell'animazione quando quel che viene dopo dipende da lei (le durate sono replicate nel codice).
- **`prefers-reduced-motion` le spegne**, e la schermata resta comprensibile: quel che arriva compare.
- Una scena che si muove a ogni fotogramma scrive la trasformazione direttamente sull'elemento, non
  passa dallo stato di React.

---

## 3. I temi

- **Chiaro**: carta calda, fondali pastello. **Scuro**: viola notte (`#26224c`), carte `#35315f`; i
  colori pieni restano chiari con l'inchiostro sopra.
- **Le sale sono scure in tutti e due i temi**: la Fortuna (`color-scheme: dark` sulla pagina, viola
  con i puntini d'oro), i palchi di Crazy Time, della Ghigliottina e della Catena, la tavola delle
  Sequenze, il panno del Paroliere, il blackjack e la roulette. Un tavolo da gioco non cambia colore.
- La pagina che si fa scura cambia anche il `theme-color`, perché Safari tinge la zona dell'orologio.
- In scuro un colore non si mescola col nero (il giallo diventa oliva): i toni scuri si scrivono a
  mano, per tema.

---

## 4. I componenti

Tutti in `src/components/`. Prima di disegnare un pezzo nuovo, cerca qui.

### Struttura

| Componente | Che cos'è | Regole |
|---|---|---|
| `Pagina` | Lo scheletro di ogni schermata: barra con la capsula indietro, titolo Lilita che scivola nella barra, corpo. | `intera` per le schermate di gioco (nascondono tab bar e barra laterale). `sotto` è il sottotitolo sotto il titolo. I bottoni di destra stanno a 12 punti l'uno dall'altro. |
| `BottoneBarra` | Il tasto tondo della barra (info, invita, statistiche, tema). | Con il filo e l'ombra; il badge è rosa. |
| `Vetrina` | La forma delle tre schede: lucine in cima, etichetta storta con la data, titolo grande, eroe, carte. | Il carattere sta nel `--fondo` della scheda e nell'eroe. |
| `Shell` | Tab bar (capsula con la bolla della scheda accesa) e, sul computer, dock e menu laterale. | I nomi delle View Transitions sono solo della tab bar e della barra laterale. |
| `Sheet` | Il foglio che sale dal fondo: carta col filo, angoli 30 in cima. | È un dialog modale: il fuoco entra, gira dentro, torna a chi l'ha aperto. |
| `Toast` | L'avviso che scende dall'alto, scuro in tutti e due i temi. | Per le cose di servizio, non per gli esiti di gioco. |

### Comandi

| Componente | Che cos'è | Regole |
|---|---|---|
| `Button` | Il tasto disegnato. `filled` (menta), `tinted` (carta), `plain` (solo scritta); `md` 46, `lg` 56. | **Un solo pieno per schermata**, l'azione principale. Spento si fa grigio, non trasparente. |
| `SegmentedControl` | Le scelte esclusive, con la capsula gialla che scivola. | Fino a cinque voci, larghe uguali e che si stringono. È un radio group: frecce da tastiera. |
| `Cursore` | Le tante alternative numeriche: punti alla stessa distanza, maniglia magnetica. | Il valore sta sulla riga del titolo, a destra; la pista si tocca ovunque; slider WAI-ARIA. |
| `Interruttore` | L'interruttore, 54×32, verde acceso. | Per le preferenze, non per le scelte di gioco. |
| `Difficolta` + `Tacche` | La difficoltà: righe con le tacche nel colore del gioco e la spunta, poi Comincia. | Toccare un livello non fa partire la partita. Il livello si ricorda (`useLivelloScelto`). |
| `Field`, `CampoCodice` | I campi di testo e il codice a sei cifre. | Unici posti dove il testo si seleziona. |
| `TastieraLettere` / `TastieraGioco` | La tastiera dei giochi di parole, come quella dei telefoni. | Tre righe in otto colonne; cancellazione a destra, invio sotto di lei, largo due, grigio finché non c'è niente da mandare e poi giallo (`--key-*`). |

### Contenuti

| Componente | Che cos'è | Regole |
|---|---|---|
| `Sezione`, `Elenco`, `Riga` | Le liste come nelle Impostazioni: una carta per gruppo, una riga per voce, un filo fra due righe. | `Riga scelta` per la spunta; `distruttiva` per le azioni pericolose. |
| `Opzioni`, `Scelte` | Le opzioni di una libera nella carta "Partita". | Le opzioni che non cambia nessuno non ci sono. |
| `Scheda` + `Pillola` | La carta di gioco con la testata (icona, titolo) e la pillola di stato a destra. | Misure strette di proposito. Toni della pillola: `turno`, `mira`, `neutra`, `buona`, `cattiva`. |
| `Biglietto` | Il biglietto dentellato (l'eroe delle Giornaliere, i timbri, le partite in corso). | — |
| `Avatar` | La faccina pastello con il filo; l'anello di oro, argento o bronzo per il podio. | Il colore viene dal nickname (`colorForNickname`). |
| `Anello`, `Numero`, `Etichetta`, `Vuoto` | Anello di avanzamento, numero che conta, etichetta col filo, stato vuoto. | `Numero` conta da `da` a `valore`. |
| `FoglioAiuti`, `VoceAiuto` | Il foglio degli aiuti del cruciverba e del sudoku: quanto vale la partita e quanto costa ogni aiuto. | — |

### Momenti

| Componente | Che cos'è | Regole |
|---|---|---|
| `Adesivo` (+ `useCodaAdesivi`) | Il momento che conta, al centro dello schermo, che passa da solo. | Due toni: **vivace** (carta nel colore del gioco che salta fuori storta: una cosa bella) e **bordato** (carta chiara bordata che trema: una cosa brutta, o dell'avversario). In fila, mai due insieme. Le animazioni sono frazioni di `--durata`. |
| `Coriandoli` + `useFesta` | La festa della vittoria, nel body. | Solo per una vittoria vista arrivare, non riaprendo il risultato. |

### Identità

| Componente | Che cos'è | Regole |
|---|---|---|
| `IconaGioco` | L'adesivo di ogni gioco: disegno su una griglia di 48 con il bordo bianco ritagliato. | Il bordo bianco è lo stesso disegno ripetuto sotto, non un filtro. `linea` per il posto vuoto dell'album. |
| `Copertina` | Il vetrino che contiene l'adesivo: bianco al centro, tinto del gioco ai bordi, riflesso in alto. | L'adesivo sta a sette decimi del lato. |
| `IconaFortuna` | I disegni animati dei giochi della Fortuna. | Solo `transform` e `opacity`. |
| `Marchio` | Il marchio dell'app (il dado davanti alle tessere), animato. | Le misure sono quelle dell'icona, tenute uguali da un test. |

---

## 5. I pattern

### 5.1 Le carte

Una carta è `background: var(--surface); border: var(--filo) solid var(--ink); border-radius: 20–28px;
box-shadow: var(--ombra-carta)`. Se un gioco la misura al punto, il filo è un'ombra (`--ombra-album`).
Gli adesivi e le etichette possono essere un poco storti (±2–4°). Fra le righe di una carta un
tratteggio `2px dashed var(--separator)`.

### 5.2 I messaggi

I messaggi non galleggiano sopra griglie e tabelloni: ogni gioco ha il suo posto in pagina (il piede
della tavoletta, la riga di mezzo del tabellino, la capsula di stato). L'eccezione sono gli adesivi,
che passano da soli e non fermano niente. Un adesivo di fine partita viene **prima** del riepilogo,
non sopra.

### 5.3 Le schermate di gioco

- Stanno nello schermo senza scorrere: la fascia di gioco è un `container-type: size`, e griglie e
  tabelloni si misurano in `cqw` e `cqh`.
- Dove la pagina scorre (telefono di traverso) `container-type` torna `normal`, perché `cqh` sarebbe zero.
- Le misure usano `100cqw`, non `100%` dentro una griglia CSS (Safari).
- Chi ritaglia con `overflow: hidden` lascia posto agli anelli e alle decorazioni; una decorazione che
  esce dai bordi sta in una cornice sua.
- Testa comune: titolo al centro con il sottotitolo sotto (`Pagina` con `sotto`), e sotto il
  tabellone a tutta larghezza.

### 5.4 Scelte e opzioni

Le opzioni in gruppi, come nelle Impostazioni. Contro chi si gioca lo dice l'interruttore Computer |
Amico (o Da solo | Con un amico), ricordato per gioco; si vede solo quel che serve a quella scelta.
La difficoltà con le tacche e poi Comincia; i numeri con il cursore; le scelte esclusive con il
controllo segmentato, fino a cinque voci.

### 5.5 La navigazione

Avanti e indietro con le View Transitions; fra le schede un cambio immediato, come la tab bar di iOS.
Una schermata ritrovata non rientra (`pagina--ferma`), e lo scorrimento si ritrova dove lo si era
lasciato. Le entrate del contenuto (la cascata delle carte, il podio) le fa solo una schermata nuova.

### 5.6 I suoni

Sintetizzati nel browser (`src/lib/suoni.ts`), niente file. I momenti che contano suonano dal loro
adesivo; il resto (tasti, tessere, il tre-due-uno) dove succede. Si spengono dal profilo, e su iOS
seguono l'interruttore del silenzioso.

---

## 6. Le identità dei giochi

Ogni gioco ha tre famiglie di colori, tutte in `tokens.css`, e nessuna esce dal gioco:

- `--<gioco>-1`, `--<gioco>-2`: i due toni della copertina.
- `--<gioco>-tinta`: la tinta più chiara e allegra degli adesivi e dei vetrini.
- `--<gioco>-carta-1/2`: i pastello della carta della classificata nelle Giornaliere.
- `--<gioco>-ink`, dove serve: il colore del gioco leggibile come scritta in tutti e due i temi.

Ogni gioco ha il suo carattere dentro lo stesso stile, senza prendere quello degli altri: il Wordle una
tavoletta con gli alloggi incavati (`--slot`), lo Scarabeo il legno (`--legno-*`, `--tessera`,
`--premio-*`: caldo moltiplica la parola, freddo la lettera), il cruciverba la matita con la selezione
indaco, Nomi, cose e città il quaderno a righe (`--nomi-*`), il tris il foglio a quadretti, i tavolieri
i colori dei giochi veri (`--f4-*`, `--scacchi-*`, `--dama-*`, `--go-*`), la battaglia il mare con i
tre segni distinti (`--mare-*`, `--colpito`, `--relitto`), la cartina del quiz l'atlante di scuola
(`--carta-*`), le sale televisive i loro palchi (`--ghi-*`, `--cat-*`, `--par-*`, `--seq-*`), Lupus la
notte (`--lupus-*`).

Le tre schede hanno il loro colore per l'icona accesa e la bolla: `--giornaliere` (indaco),
`--libere` (pesca e rosa), `--fortuna` (verde del quadrifoglio).

---

## 7. Le icone

- Le icone dell'interfaccia sono a tratto, in `src/components/Icons.tsx`; piene, i buchi sono maschere
  con un id proprio (`useId`).
- Le icone dei giochi sono adesivi (`IconaGioco`), nei vetrini (`Copertina`).
- Gli SVG di `public/` devono essere XML valido (un test lo controlla).
- L'icona dell'app è piatta, fatta per il Liquid Glass di iOS: il disegno chiaro su un fondo quasi a
  tinta unita, a un quinto dal bordo (`npm run icone`).

---

## 8. La Fortuna

La scheda Fortuna (Crazy Time, slot, blackjack, roulette, SuperEnalotto) è una sala scura in tutti e
due i temi, con i palchi dei mockup disegnati piatti: la ruota a spicchi pieni, il mobile della slot
con l'insegna LUCKY 7, il panno disegnato del blackjack, la roulette tutta feltro con la ruota piatta,
la diretta del SuperEnalotto come studio disegnato.

**Non si percepisce mai una perdita.** La puntata si paga quando si gioca; da lì ogni esito dice solo
quel che torna, come lo split di Crazy Time:

- Torna qualcosa: "Vinci N" (anche quando N è meno della puntata), l'oro, le monete che volano al
  saldo, l'adesivo o la festa.
- Non torna niente: **il biglietto lilla del giro dopo** ("Al prossimo giro", "Alla prossima mano",
  "Al prossimo concorso": `adesivoRitenta` in `src/games/fortuna/Avvisi.tsx`, classe
  `ct-adesivo-ritenta`), le luci che respirano lilla, le fiches che scivolano via piano senza cifre
  (`ritiraFiches`). Niente parole di perdita, niente segno meno, niente rosso, niente tremito, niente
  suono triste.
- Un fatto del gioco si dice come fatto, in grigio: "Oltre 21".
- Le regole dicono come si vince e quanto torna ("in media torna il 97% di quel che punti").
- Il tabellone in cima ha solo il saldo e la puntata. Le fiches sono quattro (1, 5, 10, 25) e si
  sommano. Il saldo che non basta si dice dove si punterebbe (`PochiPunti`), con il filo d'ambra,
  senza rimproveri.

---

## 9. La voce

- Titoli di poche parole; niente righe che spiegano quel che si vede.
- Niente retroscena ("il tempo lo tiene il server") né giri di parole.
- Le opzioni si chiamano come in un'app: "Difficoltà", "Ordine", "Ripristina le opzioni".
- Le regole di ogni gioco sono il minimo per giocare, nel foglio della "i".
- Italiano semplice, articoli giusti ("la cacciatorpediniere" no), numeri anche in lettere dove si
  annunciano.

---

## 10. L'accessibilità

- Contrasto del testo almeno 4,5:1 (WCAG 1.4.3); `--label-tertiary` mai per le parole. Sui colori pieni
  l'inchiostro fa 7:1 o più.
- Area da toccare di 44 punti; si tocca invece di trascinare dove si può (WCAG 2.5.7).
- Gruppi di scelte come radio group con le frecce; fogli come dialog modali; caselle da spuntare dove
  se ne sceglie più d'una.
- Un esito non si affida al solo colore: segni diversi (lo spruzzo, il fuoco, il relitto), parole e
  icone.
- Gli annunci per lo screen reader stanno in una regione `polite`, una riga per momento.
- `prefers-reduced-motion` spegne i movimenti senza togliere le informazioni.

---

## 11. Da non fare

- Un colore scritto due volte per i due temi, o `light-dark()` attorno a un'ombra intera.
- Un tasto che si rimpicciolisce premuto, o un bottone spento trasparente.
- Ombre sfocate e gradienti fotografici per dare profondità: la profondità è il filo e l'ombra secca.
- Il verde o il giallo per una selezione; l'indaco per "giusto"; il colore di un gioco fuori dal gioco.
- Due bottoni pieni nella stessa schermata.
- Messaggi sopra la griglia, due adesivi insieme, il riepilogo sopra l'adesivo di fine.
- Animare `width`, `top`, `filter` o qualunque cosa che non sia `transform` e `opacity`.
- `preserve-3d` con tanti strati grandi, `will-change` su ciò che cambia misura, `filter: blur` su
  superfici grandi.
- Nella Fortuna: "perso", il meno, il rosso, il tremito per un esito.
- Una classe CSS con un nome comune: le classi sono di tutta l'app, si usa il prefisso del gioco.

---

## 12. Un gioco nuovo, in ordine

1. Le sue famiglie di colori in `tokens.css` (`-1/-2`, `-tinta`, `-carta-*`, `-ink` se serve).
2. Il suo adesivo in `IconaGioco` e la copertina.
3. La schermata in una `Pagina intera` con il sottotitolo, che sta nello schermo senza scorrere.
4. Le carte con il filo e l'ombra, la `Scheda` con la `Pillola` dove c'è uno stato.
5. I momenti con gli `Adesivo` in coda, la festa solo per una vittoria vista arrivare.
6. Le regole minime nel foglio della "i", i testi brevi.
7. Le foto in chiaro e in scuro a 390×844 e a 1280×800, e il controllo dei contrasti.
8. La sua nota in `CLAUDE.md`, se c'è qualcosa che dal codice non si vede.
