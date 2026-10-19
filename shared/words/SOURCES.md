# Da dove arrivano le parole

Il gioco usa due elenchi generati da fonti pubbliche con licenza MIT. Nessuna
parola è stata inventata o tradotta a mano: sono tutte parole italiane
attestate, filtrate con i criteri descritti qui sotto.

Rigenerare gli elenchi: `npm run words:build`
Codice del generatore: [`scripts/build-wordlist.mjs`](../../scripts/build-wordlist.mjs)

## Fonti

| Fonte | Cosa dà | Licenza |
| --- | --- | --- |
| [`napolux/paroleitaliane`](https://github.com/napolux/paroleitaliane) — `280000_parole_italiane.txt` | Le forme flesse dell'italiano: nomi comuni, aggettivi, coniugazioni verbali. È la base dei tentativi ammessi. | MIT |
| [`napolux/paroleitaliane`](https://github.com/napolux/paroleitaliane) — `9000_nomi_propri.txt` | Nomi propri di persona e di luogo, usati come lista di esclusione. | MIT |
| [`napolux/paroleitaliane`](https://github.com/napolux/paroleitaliane) — `lista_badwords.txt` | Termini volgari, usati come lista di esclusione. | MIT |
| [`hermitdave/FrequencyWords`](https://github.com/hermitdave/FrequencyWords) — `content/2018/it/it_50k.txt` | Frequenze d'uso reali, ricavate dal corpus **OpenSubtitles 2018** (~280 milioni di parole di sottotitoli italiani). Serve a distinguere le parole che un madrelingua riconosce da quelle da dizionario. | MIT |

## I due elenchi

### `guesses.ts` — tentativi ammessi (~6.700 parole)

Serve solo a rispondere a "questa parola esiste?". È permissivo di proposito:
meglio accettare un tentativo insolito che rifiutarne uno legittimo.

Filtro: esattamente 5 caratteri `a-z`, minuscoli, senza accenti né apostrofi.

### `solutions.ts` — parole del giorno (~1.130 parole)

Molto più selettivo: qui finiscono solo parole che un madrelingua riconosce
subito. Sono oltre **tre anni** di parole giornaliere.

Un candidato entra solo se supera tutti questi filtri:

1. **È un tentativo ammesso** (invariante verificata da un test: altrimenti il
   gioco rifiuterebbe la parola giusta).
2. **Frequenza minima**: almeno 700 occorrenze nel corpus OpenSubtitles.
   Taglia via le forme verbali rarissime e i tecnicismi.
3. **Grafia italiana**: nessuna delle lettere `j k w x y`, finisce per vocale
   (unica eccezione ammessa: `ovest`), nessun digramma estraneo (`ck`, `sh`,
   `th`, `ph`, `wh`, `ght`, `oo`, `ee`). Tiene fuori i prestiti inglesi e i
   cognomi stranieri che i sottotitoli portano con sé — *black*, *night*,
   *shock*, *clown*.
4. **Non è un accento mancante**. I sottotitoli sono pieni di accenti omessi:
   `potro` compare 5.393 volte contro le 5.962 di `potrò`. Un candidato viene
   scartato se la sua variante accentata regge il confronto (meno di 5× di
   scarto), perché chiederebbe al giocatore una grafia sbagliata. Parole come
   `porto` o `canto`, che esistono di per sé, superano il controllo: sono
   20 volte più frequenti di `portò` e `cantò`.
5. **Non è un nome proprio né una volgarità** (le due liste di esclusione).
6. **Non è collante grammaticale**: fuori le preposizioni articolate (`della`,
   `nella`, `sulla`…) e le forme degli ausiliari *essere*/*avere*/*stare*.
   Le altre coniugazioni restano: sono la spina dorsale dell'italiano e
   reggono bene il gioco.
7. **Passa la curatela manuale**: un'ultima lista, esplicita e commentata nel
   generatore, per quello che sfugge ai filtri automatici — prestiti (`suite`,
   `force`), nomi propri (`praga`, `marte`), verbo + pronome enclitico
   (`dammi`, `farlo`), volgarità non coperte dalla lista. È lo stesso approccio
   del New York Times, che l'elenco delle soluzioni lo cura a mano.

### Perché le parole accentate non ci sono

Le parole con accento o apostrofo (`città`, `perché`, `un'ora`) sono escluse
invece di essere normalizzate senza accento. Chiedere di digitare `CITTA`
significherebbe insegnare una grafia sbagliata, e la tastiera del gioco resta
un pulito A-Z senza tasti speciali. Il costo è basso: le parole italiane
accentate da esattamente cinque lettere sono poche.

## Come viene scelta la parola di oggi

La scelta non è casuale né segue l'ordine dell'elenco: `shared/daily.ts` calcola
una **permutazione deterministica** con seed fisso e la percorre un giorno alla
volta. Conseguenze:

- tutti i giocatori vedono la stessa parola nello stesso momento;
- nessuna parola si ripete finché l'elenco non è esaurito (oltre tre anni);
- l'ordine non è prevedibile guardando l'elenco.

Il cambio scatta a **mezzanotte italiana** (`Europe/Rome`), non a mezzanotte
locale: chi gioca dall'estero resta allineato ai colleghi.

## Il cruciverba

Le definizioni del cruciverba non sono scritte da noi: vengono dal
**[Wikizionario](https://it.wiktionary.org)**, il dizionario libero dei
volontari di Wikimedia, attraverso l'estrazione strutturata di
[kaikki.org](https://kaikki.org/itwiktionary/) (wiktextract).

| Fonte | Cosa dà | Licenza |
| --- | --- | --- |
| Wikizionario italiano, estrazione di kaikki.org | Le voci italiane con le loro definizioni | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.it) |
| [`hermitdave/FrequencyWords`](https://github.com/hermitdave/FrequencyWords) — `it_50k.txt` | Quanto è comune una parola: lo schema preferisce quelle d'uso | MIT |
| [`napolux/paroleitaliane`](https://github.com/napolux/paroleitaliane) — `lista_badwords.txt` | Le parole da non mettere in uno schema | MIT |

Il file che ne esce, `scripts/data/cruciverba-definizioni.tsv.gz`, contiene
testo del Wikizionario ed è quindi anch'esso sotto **CC BY-SA 4.0**. Nel gioco
la fonte è citata nelle regole, e a cruciverba finito ogni definizione porta
alla sua voce.

Le definizioni si **scelgono e si accorciano, non si riscrivono**
(`scripts/cruciverba/definizioni.mjs`): si tiene la prima proposizione, si
taglia a una virgola o prima di un complemento quando non sta in due righe, e
si scarta tutto quello che non definisce — rimandi ("variante di…"),
segnaposto ("definizione mancante"), nomi propri generici, glosse rimaste in
inglese, e le definizioni che contengono la risposta o la sua radice.

Le forme flesse (ALI, OCHE, CARI) prendono la definizione del loro lemma con la
nota "plurale" o "femminile": la definizione del Wikizionario di una forma
flessa è "plurale di ala", che darebbe la risposta.

Rigenerare: `node scripts/build-cruciverba.mjs` (scarica circa 45 MB in
`scripts/.cache/`, non versionata).

## Lo Scarabeo

Il dizionario dello Scarabeo deve dire se una parola esiste, a qualunque
lunghezza da 2 a 15, ed è permissivo di proposito: rifiutare una parola vera in
una partita a punti è peggio che accettarne una rara. Ha due livelli: le parole
**comuni**, che gioca anche il computer, e le **altre**, che valgono quando le
gioca una persona.

| Fonte | Cosa dà | Licenza |
| --- | --- | --- |
| [`napolux/paroleitaliane`](https://github.com/napolux/paroleitaliane) — `280000_parole_italiane.txt` | Le parole comuni, il vocabolario del computer | MIT |
| [`napolux/paroleitaliane`](https://github.com/napolux/paroleitaliane) — `9000_nomi_propri.txt`, `lista_badwords.txt` | Nomi propri e parolacce da togliere | MIT |
| Wikizionario italiano, estrazione di [kaikki.org](https://kaikki.org/itwiktionary/) | Lemmi e forme flesse; quali nomi dell'elenco sono anche parole | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.it) |
| Wiktionary inglese, voci italiane, estrazione di [kaikki.org](https://kaikki.org/dictionary/Italian/) | Altre forme flesse, e le coniugazioni da cui si costruiscono le enclitiche | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.it) |

Le regole sono quelle del
[regolamento della Federazione Italiana Gioco Scrabble](http://www.scrabbleitalia.com/test/regnaz.pdf),
lette con larghezza:

- **Valgono** nomi, aggettivi, verbi in tutte le forme, avverbi, preposizioni
  (anche articolate), pronomi, interiezioni, e le forme verbali con i pronomi
  attaccati all'infinito, al gerundio e all'imperativo — DIMMELO, PORTARLO,
  ANDANDOSENE (articolo 22). Queste non le elenca nessuno: si costruiscono dalle
  coniugazioni (`scripts/scarabeo/enclitiche.mjs`).
- **Non valgono** i nomi propri, le sigle, le abbreviazioni, i prefissi e i
  suffissi, le voci di più parole. Gli accenti si tolgono: "città" è CITTA.
- **Restano fuori** anche le parolacce e le voci che il Wiktionary dà solo come
  volgari o offensive: l'hub lo usano dei colleghi.

L'elenco dei nomi propri di napolux comprende anche "sole", "luna", "stella",
"rosa", "re", "euro": una parola dell'elenco torna fra le comuni se il
Wikizionario italiano la conosce come nome comune, aggettivo o verbo, e fra le
altre se la conosce solo il Wiktionary inglese.

Gli elenchi che ne escono (`scripts/data/dizionario-scarabeo*.txt.gz`) e il DAWG
che li porta nel gioco (`public/scarabeo/dizionario.dawg`) contengono parole del
Wiktionary, e sono quindi anch'essi sotto **CC BY-SA 4.0**; la fonte è citata
nel profilo.

Rigenerare: `node scripts/build-dizionario.mjs` (scarica circa 120 MB in
`scripts/.cache/`, non versionata), poi `npm run dawg:build`.

## Nomi, cose e città

Il lessico di «Nomi, cose e città» (`public/dati/nomi-cose/<lettera>.json`, un
file per lettera) dice se una risposta sta nella sua categoria: se «aquila» è
un animale, «Ancona» una città, «chitarra» uno strumento. È permissivo di
proposito, come il dizionario dello Scarabeo: in una partita a tempo
rifiutare una risposta giusta è peggio che accettarne una insolita.

| Fonte | Cosa dà | Licenza |
| --- | --- | --- |
| Wikizionario italiano, estrazione di [kaikki.org](https://kaikki.org/itwiktionary/) | I nomi comuni con il loro ambito (Zoologia, Botanica, Professioni, Abbigliamento, Anatomia, Gastronomia, Colori, Strumenti musicali), i verbi, gli aggettivi, i nomi di persona | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.it) |
| Wiktionary inglese, voci italiane, estrazione di [kaikki.org](https://kaikki.org/dictionary/Italian/) | Le stesse cose dalle sue categorie («Fruits», «Occupations», «Musical instruments», «Body parts»…), e altri nomi, verbi e aggettivi | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.it) |
| [Wikidata](https://www.wikidata.org), con il motore [QLever](https://qlever.dev) | I comuni italiani, le città del mondo con almeno 50.000 abitanti e le capitali, gli stati, i fiumi, i laghi e i mari con una voce sulla Wikipedia in italiano, i nomi italiani delle specie animali e vegetali, i nomi di persona, i mestieri, gli sport, gli strumenti, i colori, i vestiti, i frutti, gli ortaggi e i piatti | [CC0](https://creativecommons.org/publicdomain/zero/1.0/deed.it) |
| [`napolux/paroleitaliane`](https://github.com/napolux/paroleitaliane) — `9000_nomi_propri.txt` | Nomi di persona (quelli che sono solo luoghi, come «milano», restano fuori) | MIT |
| [`napolux/paroleitaliane`](https://github.com/napolux/paroleitaliane) — `280000_parole_italiane.txt`, `lista_badwords.txt` | Le parole attestate, che decidono quali voci del Wiktionary inglese entrano fra le cose, i verbi e gli aggettivi; le parolacce, che restano fuori da tutto | MIT |
| [`hermitdave/FrequencyWords`](https://github.com/hermitdave/FrequencyWords) — `it_50k.txt` | Quanto è comune una parola, per le parole note (`note`) | MIT |

Ogni file ha anche le parole note di ogni categoria (`note`): fino a quaranta,
scritte come le scriverebbe una persona («L'Aquila», «Mar Rosso», «caffè») e
dalla più nota, che il computer della libera usa come risposte. Quanto è nota
una parola lo dicono, per i nomi, quanti italiani nati dal 1940 lo portano;
per città, paesi e acque, in quante Wikipedia hanno una voce (tutte e due da
Wikidata); per il resto, la frequenza nei sottotitoli italiani.

Le parole sono salvate come le confronta il gioco — minuscole, senza accenti,
spazi e apostrofi — e al singolare e al maschile dove si può: «le arance» e
«pittrice» si ritrovano provando le forme base. Restano fuori le voci che il
Wiktionary dà solo come volgari, offensive, antiche o dialettali, e le
etichette di Wikidata che sono nomi scientifici («Vulpes vulpes») o non
sembrano italiane.

I file contengono parole del Wikizionario e del Wiktionary, e sono quindi
anch'essi sotto **CC BY-SA 4.0**; la fonte è citata nel profilo, in «Fonti e
licenze».

Rigenerare: `npm run nomi:lessico` (usa le estrazioni del Wiktionary già in
`scripts/.cache/`, e vi salva le risposte di QLever).

## Gli Anagrammi

Le parole degli Anagrammi — `scripts/data/anagrammi.tsv.gz` per le
classificate, `public/dati/anagrammi/libere.json` per le libere — sono le
parole comuni che il Wikizionario definisce. Le lettere di una parola stanno in
un elenco solo, quindi una parola delle libere non è mai l'anagramma di una
parola del giorno.

| Fonte | Cosa dà | Licenza |
| --- | --- | --- |
| [`hermitdave/FrequencyWords`](https://github.com/hermitdave/FrequencyWords) — `it_50k.txt` | Le parole comuni: almeno 300 occorrenze nei sottotitoli italiani di OpenSubtitles 2018, con i filtri della grafia del Wordle | MIT |
| [`napolux/paroleitaliane`](https://github.com/napolux/paroleitaliane) — `280000_parole_italiane.txt`, `9000_nomi_propri.txt`, `lista_badwords.txt` | Le altre parole con le stesse lettere, che valgono come risposta; i nomi propri e le parolacce, che restano fuori | MIT |
| Wikizionario italiano, estrazione di [kaikki.org](https://kaikki.org/itwiktionary/) | La definizione di ogni parola, quella scelta per il cruciverba (`scripts/data/cruciverba-definizioni.tsv.gz`) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.it) |

I due file contengono le definizioni del Wikizionario, e sono quindi anch'essi
sotto **CC BY-SA 4.0**; la fonte è citata nelle regole del gioco e nel
profilo, in «Fonti e licenze».

Rigenerare: `npm run anagrammi:build` (scarica gli elenchi di napolux e di
hermitdave in `scripts/.cache/`).

## La Ghigliottina

Le ghigliottine — la parola vincente, le cinque parole e l'espressione che le
lega — sono scritte a mano in `scripts/data/ghigliottina.tsv`, e stanno sotto la
licenza del codice. Le fonti servono solo a controllarle e a scegliere le esche:
le espressioni del Wiktionary e del Wikizionario (le estrazioni di kaikki.org
del dizionario dello Scarabeo, vedi sopra) e le parole composte di napolux
dicono quali parole stanno accanto a una vincente, e quindi non le fanno da
esca. Nei file che ne escono (`scripts/data/ghigliottina-classificate.json`,
`public/dati/ghigliottina/libere.json`) non c'e' testo delle fonti, solo le
parole dell'elenco.

Il nome e il gioco sono quelli del finale dell'Eredità, su Rai 1: per un gioco
fra amici va bene, ma se l'app diventasse pubblica il nome andrebbe cambiato.

Rigenerare: `npm run ghigliottina:build` (le fonti in `scripts/.cache/`, come
per lo Scarabeo).

## La Catena

Le catene sono strade su una rete di espressioni: quelle scritte a mano della
Ghigliottina (vedi sopra), e le voci di due parole del Wikizionario italiano,
dall'estrazione di kaikki.org del dizionario dello Scarabeo, fra parole comuni
nei sottotitoli (hermitdave/FrequencyWords, MIT). I file che ne escono
(`scripts/data/catena-classificate.json`, `public/dati/catena/libere.json`)
hanno le parole e le espressioni, e quelle del Wikizionario sono sotto **CC
BY-SA 4.0**: la fonte è citata nelle regole del gioco e nel profilo.

Il gioco è l'ultima catena di Reazione a catena, su Rai 1: anche qui, se l'app
diventasse pubblica il nome andrebbe cambiato.

Rigenerare: `npm run catena:build` (le fonti in `scripts/.cache/`, come per la
Ghigliottina).

## Il Paroliere

Le parole sono quelle del dizionario dello Scarabeo (vedi sopra): tutte valgono
quando le scrive chi gioca, e le comuni di napolux decidono le griglie del
giorno, il traguardo e le parole che si mostrano alla fine. I dadi sono nostri,
calcolati sulle frequenze delle lettere italiane (`DADI` in `shared/paroliere.ts`).
Le regole sono quelle del Boggle di Alan Turoff, che in Italia si chiama il
Paroliere: anche qui, se l'app diventasse pubblica il nome andrebbe cambiato.

## Scarabocchi

Le parole da disegnare di Scarabocchi (`shared/scarabocchi-parole.ts`) sono le
parole note del lessico di Nomi, cose e città, nelle categorie che si
disegnano: le cose, gli animali, le piante, la frutta, i cibi, i mestieri, gli
sport, gli strumenti, i vestiti e il corpo. Si dividono in tre livelli per
quanto sono comuni nei sottotitoli (hermitdave/FrequencyWords, MIT), e restano
fuori le parole che un disegno non dice e le parti intime del corpo. Le fonti e
le licenze sono quelle del lessico (vedi sopra): il file eredita la CC BY-SA
4.0 del Wikizionario e del Wiktionary.

Rigenerare: `npm run scarabocchi:build` (vuole `it_50k.txt` in
`scripts/.cache/`, che scarica `npm run anagrammi:build`).

## I pezzi degli scacchi

I pezzi della scacchiera (`src/games/scacchi/pezzi.ts`) sono i disegni di Colin
M. L. Burnett, quelli di Wikipedia, presi da
[Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces)
(`Chess_klt45.svg` e gli altri undici). L'autore li offre con la GFDL, la BSD o
la GPL; qui si usano con la **BSD**, che chiede di riportare l'avviso:

> Copyright (c) 2006, Colin M. L. Burnett. All rights reserved.
>
> Redistribution and use in source and binary forms, with or without
> modification, are permitted provided that the following conditions are met:
>
> - Redistributions of source code must retain the above copyright notice, this
>   list of conditions and the following disclaimer.
> - Redistributions in binary form must reproduce the above copyright notice,
>   this list of conditions and the following disclaimer in the documentation
>   and/or other materials provided with the distribution.
> - Neither the name of the author nor the names of its contributors may be used
>   to endorse or promote products derived from this software without specific
>   prior written permission.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
> ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
> WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
> DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
> ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
> (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
> LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
> ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
> (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
> SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

Nel file i disegni sono gli stessi, senza gli spazi e con il `viewBox` al posto
delle misure; nell'app il credito sta nel profilo, in «Fonti e licenze».

## I caratteri

I titoli sono in **Lilita One** (Juan Montoreano) e il testo in **Nunito**
(Vernon Adams, Cyreal, Jacques Le Bailly), presi da Google Fonts nel
sottoinsieme latino e serviti dal sito (`public/fonts/`). Tutti e due sono sotto
la **SIL Open Font License 1.1**, il cui testo sta accanto ai file
(`OFL-Lilita-One.txt`, `OFL-Nunito.txt`); nell'app il credito sta nel profilo,
in «Fonti e licenze».

## Le altre materie del quiz

I file di `public/dati/quiz/` (arte, libri, cinema, canzoni, musica classica,
lirica, Nobel, storia, scienza, e un file per ogni giorno di «Accadde oggi»)
vengono da quattro fonti:

- **[Wikidata](https://www.wikidata.org)**, sotto **CC0**: i quadri, i libri, i
  film, le opere, i premi, i fatti della storia, gli elementi, le unità, i
  pianeti, le scoperte, le specie, e chi è nato in ogni giorno dell'anno;
- **[Wikipedia in italiano](https://it.wikipedia.org)**, sotto
  **[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.it)**:
  le frasi delle spiegazioni (l'inizio della voce di una corrente, di un
  fatto) e i fatti di «Accadde oggi», dalla rubrica «Accadde oggi» della
  pagina principale. I testi sono accorciati; ogni spiegazione porta alla sua
  voce, e il credito sta nelle regole del quiz e nel profilo;
- **le classifiche di Wikipedia**, in italiano (la classifica annuale dei
  singoli della FIMI) e in inglese (i numeri uno italiani, la classifica di fine
  anno di Billboard, i numeri uno inglesi e quelli latini): ne vengono solo i
  fatti — il titolo, chi canta, l'anno e il posto —, che fanno le canzoni del
  quiz di musica insieme a Wikidata;
- **[Wikimedia Commons](https://commons.wikimedia.org)**: le immagini dei
  quadri, solo quelle di **pubblico dominio** o **CC0**. Non sono nei file: i
  file ne hanno il nome, e il browser le scarica da Commons.

Quanto è nota una voce lo dicono anche le visite del 2025 alle voci di
Wikipedia in italiano, dal
[servizio delle statistiche di Wikimedia](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/reference/page-views.html)
(**CC0**): decidono quali voci entrano e quanto è difficile una domanda, e nei
file restano solo come notorietà (`f`).

Rigenerare: `npm run quiz:cultura` e `npm run quiz:oggi` (le risposte delle
fonti restano in `scripts/.cache/`, non versionata).
