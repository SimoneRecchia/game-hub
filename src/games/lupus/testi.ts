import type { CausaDiMorte, ImpostazioniLupus, SegretoLupus, TipoCompito, VincitoreLupus } from '@shared/lupus'
import { NOMI_FAZIONI, PERSONAGGI, type Fazione, type IdPersonaggio } from '@shared/lupus-personaggi'
import type { NomeIcona } from './Icone'

/** Chi ha un nome al tavolo: i giocatori della vista, o gli iscritti della stanza. */
export interface ConNome {
  id: string
  nome: string
}

export function nomeDi(giocatori: readonly ConNome[], id: string | null | undefined): string {
  if (!id) return '—'
  return giocatori.find((g) => g.id === id)?.nome ?? '?'
}

/** "Anna", "Anna e Bruno", "Anna, Bruno e Carla". */
export function nomiDi(giocatori: readonly ConNome[], ids: readonly string[]): string {
  const nomi = ids.map((id) => nomeDi(giocatori, id))
  if (nomi.length <= 1) return nomi.join('')
  return `${nomi.slice(0, -1).join(', ')} e ${nomi[nomi.length - 1]}`
}

/** Il nome di un personaggio con le sue copie: "2 Lupi Mannari", "Veggente". */
export function nomeConCopie(id: IdPersonaggio, quante: number): string {
  const p = PERSONAGGI[id]
  return quante > 1 ? `${quante} ${p.plurale ?? p.nome}` : p.nome
}

interface TestoDelCompito {
  titolo: string
  verbo: string
  letale?: boolean
  aiuto?: string
}

/** I compiti della notte in cui si sceglie qualcuno: la domanda, il verbo del bottone, e se e' letale. */
export const COMPITI: Partial<Record<TipoCompito, TestoDelCompito>> = {
  sbranare: { titolo: 'Chi sbranate stanotte?', verbo: 'Sbrana', letale: true },
  proteggere: { titolo: 'Chi proteggi stanotte?', verbo: 'Proteggi' },
  scrutare: { titolo: 'Chi vuoi scrutare?', verbo: 'Scruta' },
  gufare: { titolo: 'Chi vuoi gufare?', verbo: 'Gufa' },
  imitare: { titolo: 'Chi vuoi imitare?', verbo: 'Imita' },
  pozione: { titolo: 'Bevi la pozione?', verbo: 'Uccidi', letale: true },
  teschio: { titolo: 'A chi dai il teschio?', verbo: 'Dai a' },
  ritratto: { titolo: 'A chi affidi il ritratto?', verbo: 'Affida a' },
  passa_teschio: {
    titolo: 'Hai il teschio: a chi lo passi?',
    verbo: 'Passa a',
    aiuto: 'Se Amleto muore e si rivela, chi ha il teschio muore con lui.',
  },
}

/** Perché e' morto qualcuno, a partita finita o quando e' pubblico: "Muore Anna, per mano dei lupi". */
export const CAUSE: Record<CausaDiMorte, string> = {
  lupi: 'per mano dei lupi',
  linciaggio: 'per il linciaggio',
  sguardo: 'per lo sguardo del Veggente o della Cartomante',
  gufata: 'per il Gufo',
  hyde: 'per mano di mister Hyde',
  teschio: 'con il teschio di Amleto',
  ritratto: 'al posto di Dorian Wolf',
}

export const VINCITORI: Record<VincitoreLupus, { titolo: string; sotto: string; icona: NomeIcona }> = {
  villaggio: {
    titolo: 'Vince il villaggio',
    sotto: 'Tutti i lupi mannari sono stati eliminati.',
    icona: 'paese',
  },
  lupi: {
    titolo: 'Vincono i lupi',
    sotto: 'I lupi sono tanti quanti gli altri.',
    icona: 'branco',
  },
  criceto: {
    titolo: 'Vince il Criceto',
    sotto: 'Il Criceto Mannaro è ancora vivo: vince da solo.',
    icona: 'criceto',
  },
  darius: {
    titolo: 'Vince Darius',
    sotto: 'Il guardiano dell’Ombra è rimasto quasi solo.',
    icona: 'darius',
  },
}

/** La fazione di un vincitore: e' il colore della fine. */
export function fazioneDelVincitore(v: VincitoreLupus): Fazione {
  return v === 'villaggio' ? 'villaggio' : v === 'lupi' ? 'lupi' : 'solo'
}

export const ICONE_FAZIONI: Record<Fazione, NomeIcona> = { villaggio: 'paese', lupi: 'branco', solo: 'solitario' }

export { NOMI_FAZIONI }

/** Quel che un giocatore ha saputo di notte, in una riga. */
export function testoDelSegreto(
  s: SegretoLupus,
  giocatori: readonly ConNome[],
): { testo: string; tono: 'neutro' | 'male' } {
  const n = (id: string | null) => nomeDi(giocatori, id)
  switch (s.tipo) {
    case 'sguardo':
      return s.malvagio
        ? { testo: `${n(s.bersaglio)} è un mannaro.`, tono: 'male' }
        : { testo: `${n(s.bersaglio)} non è un mannaro.`, tono: 'neutro' }
    case 'seduta':
      if (!s.bersaglio) return { testo: 'Ieri nessuno è stato linciato.', tono: 'neutro' }
      return s.mannaro
        ? { testo: `${n(s.bersaglio)} era un lupo mannaro.`, tono: 'male' }
        : { testo: `${n(s.bersaglio)} non era un lupo mannaro.`, tono: 'neutro' }
    case 'indagine':
      return { testo: s.quanti === 1 ? 'C’è 1 malvagio vivo.' : `Ci sono ${s.quanti} malvagi vivi.`, tono: 'neutro' }
    case 'loggia':
      return {
        testo: s.altri.length ? `L’altro Massone: ${nomiDi(giocatori, s.altri)}.` : 'Sei l’unico Massone.',
        tono: 'neutro',
      }
    case 'branco':
      return { testo: s.lupi.length ? `I lupi: ${nomiDi(giocatori, s.lupi)}.` : 'Sei l’unico lupo.', tono: 'neutro' }
    case 'imitazione':
      return s.diventato
        ? { testo: `Hai imitato ${n(s.bersaglio)}: ora sei ${PERSONAGGI[s.diventato].nome}.`, tono: 'male' }
        : { testo: `${n(s.bersaglio)} non era né lupo né Veggente: resti come sei.`, tono: 'neutro' }
    case 'resurrezione':
      return {
        testo: s.usato ? `Hai riportato in vita ${n(s.bersaglio)}.` : 'Hai tenuto il potere per dopo.',
        tono: 'neutro',
      }
    case 'pozione':
      return s.bersaglio
        ? { testo: `Hai bevuto la pozione: ${n(s.bersaglio)} morirà.`, tono: 'male' }
        : { testo: 'Non hai bevuto la pozione.', tono: 'neutro' }
    case 'segnalino':
      return {
        testo: s.segnalino === 'teschio' ? `Il teschio è di ${n(s.bersaglio)}.` : `Il ritratto è di ${n(s.bersaglio)}.`,
        tono: 'neutro',
      }
  }
}

/* ─────────────────────────────  Le regole  ───────────────────────────── */

/** I secondi della discussione e delle arringhe, come si scelgono. */
export const SECONDI_DISCUSSIONE: readonly number[] = [0, 60, 120, 180, 300, 600]
export const SECONDI_ARRINGHE: readonly number[] = [0, 30, 60, 90, 120]

export function nomeDeiSecondi(s: number): string {
  if (s === 0) return 'Senza'
  if (s < 60) return `${s} s`
  return s % 60 === 0 ? `${s / 60} min` : `${(s / 60).toLocaleString('it-IT')} min`
}

/** Il punto piu' vicino fra quelli che si scelgono: una durata salvata altrove resta sul suo. */
export function piuVicino(valori: readonly number[], s: number): number {
  return valori.reduce((meglio, v) => (Math.abs(v - s) < Math.abs(meglio - s) ? v : meglio), valori[0])
}

export const NOMI_GUFO: Record<ImpostazioniLupus['gufoLetale'], string> = {
  auto: 'Da 20 giocatori',
  si: 'Sempre',
  no: 'Mai',
}

/** Che cosa fa un fantasma, con le regole della partita: la carta si vede o no, e si vota o no. */
export function cheCosaFaUnFantasma(r: ImpostazioniLupus): string {
  const carta = r.rivelaRuoloAllaMorte
    ? 'Non parli più, e la tua carta la vedono tutti.'
    : 'Non parli più e non mostri la carta.'
  return `${carta} ${r.fantasmiVotano ? 'Di giorno voti ancora gli indiziati.' : 'Non voti più.'}`
}

/** Le regole cambiate rispetto a quelle del regolamento, per la riga che le apre. */
export function regoleCambiate(r: ImpostazioniLupus, base: ImpostazioniLupus): number {
  return (Object.keys(base) as (keyof ImpostazioniLupus)[]).filter((k) => r[k] !== base[k]).length
}
