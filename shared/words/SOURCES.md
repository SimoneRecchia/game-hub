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
