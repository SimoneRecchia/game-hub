/**
 * I personaggi di Lupus in Fabula.
 *
 * Fonte: il regolamento di Lupus in Tabula (dV Giochi) per il set base, e "La
 * vendetta della Lupa Mannara" per l'espansione. I testi sono parafrasati; i
 * numeri fra parentesi del regolamento ("Medium (9)") sono quanti giocatori ci
 * vogliono perché il personaggio abbia senso, e qui diventano `minimoGiocatori`.
 *
 * Qui ci sono solo i dati: le regole stanno in lupus.ts. L'ordine delle voci di
 * `PERSONAGGI` non si tocca: e' quello in cui si mettono le carte nel mazzo
 * prima di mescolarlo (`mazzoDi`), e cambiarlo cambierebbe i ruoli che lo
 * stesso seme da' agli stessi giocatori.
 */

export type Fazione = 'villaggio' | 'lupi' | 'solo'

export type IdPersonaggio =
  // il set base
  | 'villico'
  | 'lupo'
  | 'veggente'
  | 'medium'
  | 'indemoniato'
  | 'guardia'
  | 'gufo'
  | 'massone'
  | 'criceto'
  | 'mitomane'
  // La vendetta della Lupa Mannara
  | 'lara'
  | 'mucca'
  | 'darius'
  | 'baron'
  | 'jekyll'
  | 'cartomante'
  | 'purple'
  | 'mortovivo'
  | 'amleto'
  | 'dorian'

export type Serie = 'base' | 'espansione'

/**
 * Che cosa fa di notte il personaggio, se fa qualcosa. Sono i compiti della
 * notte (`TipoCompito` in lupus.ts) tranne i due che non vengono da una carta:
 * il branco che la prima notte si riconosce soltanto, e il teschio che passa
 * di mano. Nessuno ha il nome di un personaggio, nemmeno quelli di uno solo:
 * cosi' nella vista di un giocatore il nome di un personaggio e' un ruolo, e il
 * test che controlla che i ruoli non escano puo' cercarlo senza sbagliarsi.
 */
export type CompitoNotturno =
  | 'sbranare' // i lupi scelgono la vittima
  | 'proteggere'
  | 'scrutare'
  | 'gufare'
  | 'imitare'
  | 'pozione'
  | 'resuscitare'
  | 'seduta' // il Medium
  | 'indagine' // Miss Purple
  | 'loggia' // i Massoni
  | 'sogno' // la Mucca
  | 'teschio'
  | 'ritratto'

export interface Personaggio {
  id: IdPersonaggio
  serie: Serie
  nome: string
  /** Il nome al plurale, per i personaggi che stanno in piu' copie. */
  plurale?: string
  fazione: Fazione
  /**
   * Quel che vede chi legge l'aura: il Veggente, la Cartomante, Darius, e Miss
   * Purple che conta i malvagi. Il Medium guarda un'altra cosa, se il linciato
   * era mannaro (`mannaro` in lupus.ts).
   */
  malvagio: boolean
  /** Conta come lupo mannaro per la fine della partita. */
  contaComeLupo: boolean
  /** Apre gli occhi con i lupi: Lara si', la Mucca no. */
  nelBranco: boolean
  /** Da quanti giocatori lo consiglia il regolamento. */
  minimoGiocatori: number
  /** Quante copie si mettono insieme nel mazzo: i Massoni sono sempre due. */
  inBlocchi: number
  /** Quante copie al massimo in una partita. */
  massimo: number
  compitoNotturno?: CompitoNotturno
  /** Una frase breve, sotto il nome. */
  motto: string
  /** La regola intera, in prosa. */
  descrizione: string
  /** Che cosa fa di notte, se fa qualcosa, detto al giocatore. */
  consiglioNotte?: string
  /** Il colore del personaggio, in CSS. */
  colore: string
}

export const NOMI_FAZIONI: Record<Fazione, string> = {
  villaggio: 'Villaggio',
  lupi: 'Lupi Mannari',
  solo: 'Da solo',
}

export const SCOPI_FAZIONI: Record<Fazione, string> = {
  villaggio: 'Vince quando tutti i lupi mannari sono stati eliminati.',
  lupi: 'Vince quando i lupi mannari sono tanti quanti gli altri giocatori vivi.',
  solo: 'Ha una condizione di vittoria tutta sua.',
}

export const PERSONAGGI: Record<IdPersonaggio, Personaggio> = {
  villico: {
    id: 'villico',
    serie: 'base',
    nome: 'Villico',
    plurale: 'Villici',
    fazione: 'villaggio',
    malvagio: false,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 0,
    inBlocchi: 1,
    massimo: 40,
    motto: 'Un onesto abitante di Tabula.',
    descrizione:
      'Non ha poteri speciali: di giorno discute, sospetta e vota. La sua arma è il ragionamento, e il voto.',
    colore: '#5cc48f',
  },
  lupo: {
    id: 'lupo',
    serie: 'base',
    nome: 'Lupo Mannaro',
    plurale: 'Lupi Mannari',
    fazione: 'lupi',
    malvagio: true,
    contaComeLupo: true,
    nelBranco: true,
    minimoGiocatori: 0,
    inBlocchi: 1,
    massimo: 8,
    compitoNotturno: 'sbranare',
    motto: 'Di notte sbrana, di giorno finge.',
    descrizione:
      'Ogni notte i lupi si riconoscono e scelgono insieme una vittima da sbranare. Di giorno si mescolano ai ' +
      'villici e cercano di far linciare gli innocenti. Vincono quando sono tanti quanti gli altri giocatori vivi.',
    consiglioNotte: 'Scegli, insieme agli altri lupi, chi sbranare.',
    colore: '#e5484d',
  },
  veggente: {
    id: 'veggente',
    serie: 'base',
    nome: 'Veggente',
    fazione: 'villaggio',
    malvagio: false,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 8,
    inBlocchi: 1,
    massimo: 1,
    compitoNotturno: 'scrutare',
    motto: 'Sonda la mente di un giocatore.',
    descrizione:
      'Ogni notte indica un giocatore vivo e scopre se è un mannaro oppure no. È il nemico numero uno dei lupi: ' +
      'rivelarsi troppo presto vuol dire finire sul menu.',
    consiglioNotte: 'Scegli un giocatore: scoprirai se è un mannaro.',
    colore: '#8b7cf6',
  },
  medium: {
    id: 'medium',
    serie: 'base',
    nome: 'Medium',
    fazione: 'villaggio',
    malvagio: false,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 9,
    inBlocchi: 1,
    massimo: 1,
    compitoNotturno: 'seduta',
    motto: 'Parla con i fantasmi.',
    descrizione:
      'Dalla seconda notte in poi, ogni notte scopre se il giocatore linciato quel giorno era un lupo mannaro. ' +
      'Sa quindi se il villaggio ha colpito nel segno.',
    consiglioNotte: 'Scoprirai se il linciato di oggi era un lupo mannaro.',
    colore: '#5eb8d6',
  },
  indemoniato: {
    id: 'indemoniato',
    serie: 'base',
    nome: 'Indemoniato',
    fazione: 'lupi',
    malvagio: false,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 10,
    inBlocchi: 1,
    massimo: 1,
    motto: 'Umano di giorno e di notte, ma tifa per i lupi.',
    descrizione:
      'È un umano a tutti gli effetti, e il Veggente lo vede come tale. Ma parteggia per i lupi mannari, senza ' +
      'sapere chi siano: vince se vincono loro. Il suo lavoro è confondere il villaggio.',
    colore: '#f0883e',
  },
  guardia: {
    id: 'guardia',
    serie: 'base',
    nome: 'Guardia del Corpo',
    fazione: 'villaggio',
    malvagio: false,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 11,
    inBlocchi: 1,
    massimo: 1,
    compitoNotturno: 'proteggere',
    motto: 'Veglia su un abitante ogni notte.',
    descrizione:
      'Dalla seconda notte in poi indica un giocatore, diverso da sé, da proteggere. Se i lupi scelgono proprio ' +
      'quel giocatore, quella notte nessuno viene sbranato. Protegge solo dai lupi.',
    consiglioNotte: 'Scegli chi proteggere stanotte (non te stesso).',
    colore: '#4f9cf5',
  },
  gufo: {
    id: 'gufo',
    serie: 'base',
    nome: 'Gufo',
    fazione: 'villaggio',
    malvagio: false,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 12,
    inBlocchi: 1,
    massimo: 1,
    compitoNotturno: 'gufare',
    motto: 'Chi viene gufato finisce sotto accusa.',
    descrizione:
      'Ogni notte indica un giocatore: il giorno dopo quel giocatore entra d’ufficio tra gli indiziati, insieme ' +
      'al più votato. Nella variante "Gufo Letale" (consigliata da 20 giocatori) il gufato muore all’alba, a ' +
      'meno che non sia un mannaro.',
    consiglioNotte: 'Scegli chi gufare: domani sarà tra gli indiziati.',
    colore: '#c9a86a',
  },
  massone: {
    id: 'massone',
    serie: 'base',
    nome: 'Massone',
    plurale: 'Massoni',
    fazione: 'villaggio',
    malvagio: false,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 13,
    inBlocchi: 2,
    massimo: 2,
    compitoNotturno: 'loggia',
    motto: 'Due umani che si conoscono.',
    descrizione:
      'Sono due, e la prima notte si riconoscono. Ognuno sa che l’altro è innocente: una certezza rara in un ' +
      'villaggio di sospetti. Vanno sempre inseriti in coppia.',
    consiglioNotte: 'Ecco chi è l’altro Massone.',
    colore: '#d8b74a',
  },
  criceto: {
    id: 'criceto',
    serie: 'base',
    nome: 'Criceto Mannaro',
    fazione: 'solo',
    malvagio: true,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 15,
    inBlocchi: 1,
    massimo: 1,
    motto: 'Piccolo, peloso, e gioca solo per sé.',
    descrizione:
      'Non appartiene a nessuna fazione. I lupi non possono sbranarlo: se lo scelgono, quella notte non muore ' +
      'nessuno. Muore però se il Veggente lo guarda. Per il Medium e per il conteggio finale è un umano. È ' +
      'l’unico vincitore se è ancora vivo quando la partita finisce.',
    colore: '#d97fb8',
  },
  mitomane: {
    id: 'mitomane',
    serie: 'base',
    nome: 'Mitomane',
    fazione: 'villaggio',
    malvagio: false,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 16,
    inBlocchi: 1,
    massimo: 1,
    compitoNotturno: 'imitare',
    motto: 'Vuole essere qualcun altro.',
    descrizione:
      'Parte come umano. Alla fine della seconda notte indica un giocatore vivo: se è un lupo mannaro o il ' +
      'Veggente, ne assume il ruolo a tutti gli effetti e da quel momento agisce con lui. Altrimenti resta un ' +
      'umano normale. Il Veggente vede il mitomane-lupo come un lupo.',
    consiglioNotte: 'Scegli chi imitare: se è un lupo o il Veggente, lo diventerai.',
    colore: '#9aa5b5',
  },

  // La vendetta della Lupa Mannara
  lara: {
    id: 'lara',
    serie: 'espansione',
    nome: 'Lara, la Lupa Mannara',
    fazione: 'lupi',
    malvagio: true,
    contaComeLupo: true,
    nelBranco: true,
    minimoGiocatori: 8,
    inBlocchi: 1,
    massimo: 1,
    compitoNotturno: 'sbranare',
    motto: 'Una lupa che può tradire il branco.',
    descrizione:
      'È un lupo mannaro a tutti gli effetti, ma può decidere di sbranare un altro lupo: quella notte nessun ' +
      'villico muore, e gli altri lupi non possono opporsi. Non può scegliere se stessa.',
    consiglioNotte: 'Scegli chi sbranare: puoi anche colpire un altro lupo.',
    colore: '#c0334a',
  },
  mucca: {
    id: 'mucca',
    serie: 'espansione',
    nome: 'Mucca Mannara',
    fazione: 'lupi',
    malvagio: true,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 12,
    inBlocchi: 1,
    massimo: 1,
    compitoNotturno: 'sogno',
    motto: 'Sogna di essere un lupo.',
    descrizione:
      'Sa chi sono i lupi mannari (li vede la prima notte, senza che loro vedano lei) e vince con loro. Non ' +
      'conta come lupo per la fine della partita, ma il Veggente e il Medium la vedono come mannara.',
    consiglioNotte: 'Ecco chi sono i lupi mannari.',
    colore: '#b9856a',
  },
  darius: {
    id: 'darius',
    serie: 'espansione',
    nome: 'Darius, guardiano dell’Ombra',
    fazione: 'solo',
    malvagio: true,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 9,
    inBlocchi: 1,
    massimo: 1,
    compitoNotturno: 'scrutare',
    motto: 'Un veggente malvagio che vuole restare solo.',
    descrizione:
      'Ogni notte sonda un giocatore come il Veggente. Il Veggente e il Medium lo vedono come mannaro. È ' +
      'l’unico vincitore se a fine partita è vivo da solo o con un solo altro giocatore, chiunque sia. Se è ' +
      'morto, vince o perde con gli umani.',
    consiglioNotte: 'Scegli un giocatore: scoprirai se è un mannaro.',
    colore: '#6e5bd8',
  },
  baron: {
    id: 'baron',
    serie: 'espansione',
    nome: 'Baron Samedi',
    fazione: 'villaggio',
    malvagio: false,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 8,
    inBlocchi: 1,
    massimo: 1,
    compitoNotturno: 'resuscitare',
    motto: 'Riporta in vita un fantasma.',
    descrizione:
      'Una volta per partita, dalla seconda notte, può riportare in vita il primo giocatore morto: quello torna ' +
      'vivo all’alba con tutte le sue abilità e non può essere ucciso durante quella notte. Agisce anche se ' +
      'è un fantasma. Non può usare il potere su se stesso.',
    consiglioNotte: 'Vuoi usare il tuo potere stanotte?',
    colore: '#7fd1c1',
  },
  jekyll: {
    id: 'jekyll',
    serie: 'espansione',
    nome: 'Dottor Jekyll',
    fazione: 'villaggio',
    malvagio: false,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 12,
    inBlocchi: 1,
    massimo: 1,
    compitoNotturno: 'pozione',
    motto: 'Una pozione, una notte da mister Hyde.',
    descrizione:
      'Umano. Una volta per partita, dalla seconda notte, può bere la pozione e uccidere un giocatore a sua ' +
      'scelta. All’alba il villaggio viene informato che il dottor Jekyll si è trasformato in mister Hyde.',
    consiglioNotte: 'Bevi la pozione e scegli chi uccidere, oppure aspetta.',
    colore: '#8fd35e',
  },
  cartomante: {
    id: 'cartomante',
    serie: 'espansione',
    nome: 'Cartomante',
    fazione: 'villaggio',
    malvagio: false,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 16,
    inBlocchi: 1,
    massimo: 1,
    compitoNotturno: 'scrutare',
    motto: 'Una seconda veggente, che il Veggente non conosce.',
    descrizione:
      'Ha la stessa abilità del Veggente: ogni notte scopre se un giocatore è mannaro. I due non si conoscono e ' +
      'agiscono in momenti diversi della notte.',
    consiglioNotte: 'Scegli un giocatore: scoprirai se è un mannaro.',
    colore: '#b56fd6',
  },
  purple: {
    id: 'purple',
    serie: 'espansione',
    nome: 'Miss Purple',
    fazione: 'villaggio',
    malvagio: false,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 9,
    inBlocchi: 1,
    massimo: 1,
    compitoNotturno: 'indagine',
    motto: 'Sa quanti malvagi sono ancora in giro.',
    descrizione:
      'Investigatrice umana. Dalla seconda notte, ogni notte scopre quanti malvagi sono ancora vivi (lupi ' +
      'mannari, Mucca, Criceto, Darius). Nel regolamento è un’alternativa al Medium.',
    consiglioNotte: 'Scoprirai quanti malvagi sono ancora vivi.',
    colore: '#a05cc4',
  },
  mortovivo: {
    id: 'mortovivo',
    serie: 'espansione',
    nome: 'Mortovivo',
    fazione: 'villaggio',
    malvagio: false,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 12,
    inBlocchi: 1,
    massimo: 1,
    motto: 'È già morto, e non gli importa.',
    descrizione:
      'Umano che non conta mai tra i vivi per la fine della partita. Se viene ucciso rivela la sua carta e ' +
      'continua a giocare come se fosse vivo: parla e vota. Non può essere ucciso una seconda volta.',
    colore: '#7f8c8d',
  },
  amleto: {
    id: 'amleto',
    serie: 'espansione',
    nome: 'Amleto',
    fazione: 'villaggio',
    malvagio: false,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 12,
    inBlocchi: 1,
    massimo: 1,
    compitoNotturno: 'teschio',
    motto: 'Lega il proprio destino a un teschio.',
    descrizione:
      'Umano. La prima notte consegna il teschio a un giocatore; da allora, alla fine di ogni giorno, chi ha il ' +
      'teschio lo passa a un altro vivo. Quando Amleto muore può rivelarsi: in quel caso muore anche chi ha il ' +
      'teschio in quel momento. Se non si rivela, il teschio continua a girare.',
    consiglioNotte: 'Scegli a chi consegnare il teschio.',
    colore: '#c7b299',
  },
  dorian: {
    id: 'dorian',
    serie: 'espansione',
    nome: 'Dorian Wolf',
    fazione: 'villaggio',
    malvagio: false,
    contaComeLupo: false,
    nelBranco: false,
    minimoGiocatori: 12,
    inBlocchi: 1,
    massimo: 1,
    compitoNotturno: 'ritratto',
    motto: 'Si salva a spese del proprio ritratto.',
    descrizione:
      'Umano. La prima notte affida il ritratto a un altro giocatore. Quando Dorian muore può rivelarsi e ' +
      'restare in vita: al suo posto muore chi ha il ritratto (se è già un fantasma, Dorian si salva comunque). ' +
      'Funziona una volta sola.',
    consiglioNotte: 'Scegli a chi affidare il ritratto.',
    colore: '#d4a3ff',
  },
}

export const TUTTI_I_PERSONAGGI = Object.keys(PERSONAGGI) as IdPersonaggio[]

/** L'ordine in cui il moderatore chiama i personaggi di notte. Chi di notte non fa niente non c'e'. */
export const ORDINE_DELLA_NOTTE: IdPersonaggio[] = [
  'amleto', // solo la prima notte: consegna il teschio
  'dorian', // solo la prima notte: affida il ritratto
  'mucca', // solo la prima notte: vede i lupi
  'massone', // solo la prima notte: si riconoscono
  'guardia',
  'veggente',
  'cartomante',
  'darius',
  'lupo',
  'lara',
  'medium',
  'purple',
  'baron',
  'jekyll',
  'gufo',
  'mitomane', // "alla fine della seconda notte"
]

/** Il nome del personaggio, al plurale se le copie sono piu' d'una e il nome ce l'ha. */
export function nomeDelPersonaggio(id: IdPersonaggio, quanti = 1): string {
  const p = PERSONAGGI[id]
  return quanti > 1 && p.plurale ? p.plurale : p.nome
}

/** Il personaggio conta come lupo mannaro per la fine della partita. */
export function ruoloDaLupo(id: IdPersonaggio): boolean {
  return PERSONAGGI[id].contaComeLupo
}
