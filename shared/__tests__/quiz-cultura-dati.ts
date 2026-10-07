/**
 * Dati finti delle altre materie, per i test: abbastanza voci per una partita
 * e per le risposte sbagliate, con i casi difficili dentro — due autori per
 * un'opera, un titolo che hanno tre quadri, chi ha vinto due Nobel, un nome con
 * l'anno dentro.
 */

import {
  GRUPPI_ANIMALI,
  type ArtistaQuiz,
  type DatiArte,
  type DatiCanzoni,
  type DatiCinema,
  type DatiClassica,
  type DatiLibri,
  type DatiLirica,
  type DatiNobel,
  type DatiOggi,
  type DatiScienza,
  type DatiStoria,
  type EventoQuiz,
  type GenereCanzone,
  type PersonaQuiz,
  type PremioNobel,
} from '../quiz-cultura'

const fama = (i: number, n: number) => Math.round((1 - i / Math.max(1, n - 1)) * 1000) / 1000

function persone(prefisso: string, n: number, primoAnno: number, passo: number): PersonaQuiz[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefisso}${i}`,
    n: `${prefisso.toUpperCase()} Persona ${i}`,
    na: primoAnno + i * passo,
    mo: primoAnno + i * passo + 60,
    p: i % 3 === 0 ? 'Italia' : 'Francia',
    ...(i % 3 === 0 ? { it: 1 as const } : {}),
    d: 'artista di prova',
    w: `Persona ${i}`,
    f: fama(i, n),
  }))
}

/** La corrente di un anno, come la darebbe Wikidata: una per epoca. */
function correnteDi(anno: number): string {
  if (anno < 1450) return 'M6'
  if (anno < 1600) return 'M1'
  if (anno < 1750) return 'M2'
  if (anno < 1850) return 'M5'
  if (anno < 1900) return 'M3'
  return 'M4'
}

const pittori = persone('p', 24, 1300, 27).map((p) => ({ ...p, c: [correnteDi(p.na! + 30)] }))

export const ARTE: DatiArte = {
  versione: 'prova',
  correnti: [
    { id: 'M1', n: 'Rinascimento', d: 'Il Rinascimento e’ un periodo della storia dell’arte.', w: 'Rinascimento' },
    { id: 'M2', n: 'Barocco', d: 'Il Barocco e’ uno stile nato a Roma.', w: 'Barocco' },
    { id: 'M3', n: 'Impressionismo', d: 'L’impressionismo e’ un movimento pittorico francese.' },
    { id: 'M4', n: 'Cubismo' },
    { id: 'M5', n: 'Romanticismo' },
    { id: 'M6', n: 'Gotico' },
  ],
  pittori,
  quadri: pittori.flatMap((p, i) =>
    Array.from({ length: 5 }, (_, k) => {
      const n = i * 5 + k
      const anno = p.na! + 25 + k * 4
      // Tre quadri si chiamano "Autoritratto": per titolo non si chiedono.
      const nome = n % 40 === 7 ? 'Autoritratto' : `Quadro ${n}`
      return {
        id: `Q${n}`,
        n: nome,
        a: n === 12 ? [p.id, pittori[(i + 1) % pittori.length].id] : [p.id],
        anno,
        c: [correnteDi(anno)],
        t: 'olio su tela',
        m: 'Museo di prova',
        l: 'Firenze',
        img: { f: `a/ab/Quadro_${n}.jpg`, r: 0.75 },
        w: nome,
        f: fama(n, 120),
      }
    }),
  ),
}

const autori = persone('a', 40, 1300, 17)

export const LIBRI: DatiLibri = {
  versione: 'prova',
  autori,
  libri: autori.flatMap((a, i) =>
    Array.from({ length: 4 }, (_, k) => {
      const n = i * 4 + k
      return {
        id: `L${n}`,
        n: `Libro ${n}`,
        // Un libro scritto in due.
        a: n === 5 ? [a.id, autori[i + 1].id] : [a.id],
        anno: a.na! + 30 + k * 5,
        lingua: a.it ? 'italiano' : 'francese',
        g: 'romanzo',
        ...(a.it ? { it: 1 as const } : {}),
        w: `Libro ${n}`,
        f: fama(n, 160),
      }
    }),
  ),
}

const registi = persone('r', 30, 1890, 3)

export const CINEMA: DatiCinema = {
  versione: 'prova',
  registi,
  film: registi.flatMap((r, i) =>
    Array.from({ length: 5 }, (_, k) => {
      const n = i * 5 + k
      return {
        id: `F${n}`,
        n: `Film ${n}`,
        r: [r.id],
        anno: Math.min(2024, r.na! + 30 + k * 6),
        p: r.p,
        ...(r.it ? { it: 1 as const } : {}),
        g: 'dramma',
        cast: ['Attore Uno', 'Attrice Due'],
        ...(n % 11 === 0 ? { oscar: 1 as const } : {}),
        w: `Film ${n}`,
        f: fama(n, 150),
      }
    }),
  ),
}

const compositori = persone('c', 20, 1680, 8)
const CITTA = ['Milano', 'Venezia', 'Napoli', 'Parigi', 'Vienna', 'Roma', 'Londra', 'Il Cairo']

export const LIRICA: DatiLirica = {
  versione: 'prova',
  compositori,
  opere: compositori.flatMap((c, i) =>
    Array.from({ length: 4 }, (_, k) => {
      const n = i * 4 + k
      return {
        id: `O${n}`,
        n: `Opera ${n}`,
        c: [c.id],
        lib: ['Librettista di prova'],
        anno: c.na! + 30 + k * 3,
        teatro: 'Teatro di prova',
        citta: CITTA[n % CITTA.length],
        lingua: c.it ? 'italiano' : 'tedesco',
        ...(c.it ? { it: 1 as const } : {}),
        w: `Opera ${n}`,
        f: fama(n, 80),
      }
    }),
  ),
}

const PREMI: PremioNobel[] = ['letteratura', 'fisica', 'chimica', 'medicina', 'pace', 'economia']
const premiati = persone('n', 150, 1840, 1)

export const NOBEL: DatiNobel = {
  versione: 'prova',
  premiati,
  premi: (() => {
    const premi: DatiNobel['premi'] = []
    let k = 0
    for (let anno = 1901; anno <= 1990; anno += 1) {
      for (const premio of PREMI) {
        if (premio === 'economia' && anno < 1969) continue
        // Un premio ogni tanto va a due: nessuno dei due e' una risposta sbagliata per l'altro.
        const quanti = anno % 4 === 0 ? 2 : 1
        for (let q = 0; q < quanti; q += 1) premi.push({ chi: premiati[k++ % premiati.length].id, premio, anno })
      }
    }
    // Chi l'ha vinto due volte, lo stesso premio: l'altro anno non e' un anno sbagliato.
    premi.push({ chi: premiati[0].id, premio: premi.find((x) => x.chi === premiati[0].id)!.premio, anno: 1995 })
    return premi
  })(),
}

const TIPI_EVENTI: Array<[EventoQuiz['tipo'], string]> = [
  ['battaglia', 'battaglia di'],
  ['guerra', 'guerra di'],
  ['trattato', 'trattato di'],
  ['rivoluzione', 'rivoluzione di'],
  ['altro', 'fondazione di'],
]

export const STORIA: DatiStoria = {
  versione: 'prova',
  eventi: Array.from({ length: 120 }, (_, i) => {
    const [tipo, parola] = TIPI_EVENTI[i % TIPI_EVENTI.length]
    const anno = -600 + i * 22 + (i % 7)
    return {
      id: `E${i}`,
      // Un nome con l'anno dentro: non fa una domanda sul tempo.
      n: i === 33 ? `terremoto di Luogo del ${anno}` : `${parola} Luogo ${i}`,
      anno: anno === 0 ? 1 : anno,
      ...(tipo === 'guerra' ? { fine: anno + 4 } : {}),
      tipo,
      luogo: `Luogo ${i}`,
      ...(i % 4 === 0 ? { it: 1 as const } : {}),
      w: `Evento ${i}`,
      f: fama(i, 120),
    }
  }),
}

const ELEMENTI: Array<[string, string]> = [
  ['idrogeno', 'H'],
  ['elio', 'He'],
  ['litio', 'Li'],
  ['carbonio', 'C'],
  ['azoto', 'N'],
  ['ossigeno', 'O'],
  ['fluoro', 'F'],
  ['neon', 'Ne'],
  ['sodio', 'Na'],
  ['magnesio', 'Mg'],
  ['alluminio', 'Al'],
  ['silicio', 'Si'],
  ['fosforo', 'P'],
  ['zolfo', 'S'],
  ['cloro', 'Cl'],
  ['argon', 'Ar'],
  ['potassio', 'K'],
  ['calcio', 'Ca'],
  ['ferro', 'Fe'],
  ['rame', 'Cu'],
  ['zinco', 'Zn'],
  ['argento', 'Ag'],
  ['stagno', 'Sn'],
  ['iodio', 'I'],
  ['oro', 'Au'],
  ['mercurio', 'Hg'],
  ['piombo', 'Pb'],
  ['uranio', 'U'],
]

const COMPOSTI: Array<[string, string]> = [
  ['acqua', 'H₂O'],
  ['anidride carbonica', 'CO₂'],
  ['cloruro di sodio', 'NaCl'],
  ['ammoniaca', 'NH₃'],
  ['metano', 'CH₄'],
  ['acido solforico', 'H₂SO₄'],
  ['glucosio', 'C₆H₁₂O₆'],
  ['ozono', 'O₃'],
  ['perossido di idrogeno', 'H₂O₂'],
  ['etanolo', 'C₂H₆O'],
  ['carbonato di calcio', 'CaCO₃'],
  ['acido cloridrico', 'HCl'],
]

const UNITA: Array<[string, string, string, string | undefined]> = [
  ['metro', 'm', 'lunghezza', undefined],
  ['secondo', 's', 'tempo', undefined],
  ['chilogrammo', 'kg', 'massa', undefined],
  ['kelvin', 'K', 'temperatura', 'William Thomson'],
  ['grado Celsius', '°C', 'temperatura', 'Anders Celsius'],
  ['ampere', 'A', 'intensità di corrente', 'André-Marie Ampère'],
  ['mole', 'mol', 'quantità di sostanza', undefined],
  ['newton', 'N', 'forza', 'Isaac Newton'],
  ['pascal', 'Pa', 'pressione', 'Blaise Pascal'],
  ['joule', 'J', 'energia', 'James Prescott Joule'],
  ['watt', 'W', 'potenza', 'James Watt'],
  ['hertz', 'Hz', 'frequenza', 'Heinrich Hertz'],
  ['volt', 'V', 'tensione elettrica', 'Alessandro Volta'],
  ['ohm', 'Ω', 'resistenza elettrica', 'Georg Ohm'],
]

const PIANETI = ['Mercurio', 'Venere', 'Terra', 'Marte', 'Giove', 'Saturno', 'Urano', 'Nettuno']
const SATELLITI: Array<[string, string]> = [
  ['Luna', 'Terra'],
  ['Fobos', 'Marte'],
  ['Deimos', 'Marte'],
  ['Io', 'Giove'],
  ['Europa', 'Giove'],
  ['Ganimede', 'Giove'],
  ['Titano', 'Saturno'],
  ['Encelado', 'Saturno'],
  ['Titania', 'Urano'],
  ['Tritone', 'Nettuno'],
]

export const SCIENZA: DatiScienza = {
  versione: 'prova',
  elementi: ELEMENTI.map(([n, s], i) => ({ id: `EL${i}`, n, s, z: i + 1, w: n, f: fama(i, ELEMENTI.length) })),
  composti: COMPOSTI.map(([n, formula], i) => ({ id: `CO${i}`, n, formula, f: fama(i, COMPOSTI.length) })),
  unita: UNITA.map(([n, s, g, da], i) => ({ id: `UN${i}`, n, s, g, ...(da ? { da } : {}), f: fama(i, UNITA.length) })),
  astri: [
    ...PIANETI.map((n, i) => ({ id: `PI${i}`, n, tipo: 'pianeta' as const, ordine: i + 1, f: fama(i, 8) })),
    ...SATELLITI.map(([n, di], i) => ({
      id: `SA${i}`,
      n,
      tipo: 'satellite' as const,
      di,
      f: fama(i, SATELLITI.length),
    })),
  ],
  scoperte: Array.from({ length: 30 }, (_, i) => ({
    id: `SC${i}`,
    n: i % 3 === 0 ? `teoria numero ${i}` : i % 3 === 1 ? `telefono numero ${i}` : `macchina numero ${i}`,
    chi: i === 4 ? [`Scienziato ${i}`, `Scienziata ${i + 100}`] : [`Scienziato ${i}`],
    ...(i % 5 === 3 ? {} : { anno: 1600 + i * 12 }),
    ...(i % 3 === 0 ? { v: 'f' as const } : i % 3 === 1 ? { v: 'i' as const } : {}),
    f: fama(i, 30),
    // Uno scopritore su tre e' poco noto, e dei due della quarta il piu' noto e' il secondo.
    cf: i === 4 ? [0.2, 0.8] : [i % 3 === 2 ? 0.1 : 0.9],
  })),
  specie: Array.from({ length: 40 }, (_, i) => ({
    id: `SP${i}`,
    n: `animalo ${i}`,
    gr: GRUPPI_ANIMALI[i % GRUPPI_ANIMALI.length],
    f: fama(i, 40),
  })),
}

/* ── La musica: le canzoni e chi le canta, i brani di musica classica ── */

const GENERI_PROVA: GenereCanzone[][] = [['pop'], ['rock'], ['pop', 'rock'], ['rap'], ['dance', 'pop'], ['soul']]

const artisti: ArtistaQuiz[] = Array.from({ length: 60 }, (_, i) => ({
  id: `ar${i}`,
  // Qualche gruppo, con i nomi che chiedono un articolo diverso: "i", "gli", "il".
  n: i === 1 ? 'The Prova' : i === 2 ? 'Ultravox di Prova' : i === 3 ? 'Il Gruppo di Prova' : `Cantante ${i}`,
  ...(i < 5 ? { gr: 1 as const } : {}),
  ...(i < 5 ? {} : { na: 1930 + i }),
  p: i % 4 === 0 ? 'Italia' : i % 4 === 1 ? 'Regno Unito' : i % 4 === 2 ? 'Stati Uniti' : 'Svezia',
  ...(i % 4 === 0 ? { it: 1 as const } : {}),
  w: `Artista ${i}`,
  f: fama(i, 60),
}))

export const CANZONI: DatiCanzoni = {
  versione: 'prova',
  artisti,
  canzoni: Array.from({ length: 300 }, (_, i) => ({
    id: `CZ${i}`,
    n: `Canzone ${i}`,
    // Un duetto ogni tanto: canta anche il secondo.
    a: i % 37 === 5 ? [`ar${i % 60}`, `ar${(i + 7) % 60}`] : [`ar${i % 60}`],
    // E ogni tanto qualcuno nel ritornello, che non e' la risposta.
    ...(i % 13 === 3 ? { x: [`ar${(i + 11) % 60}`] } : {}),
    // Gli anni dal 1955 al 2024, anche quelli a cavallo di due decenni.
    ...(i % 11 === 10 ? {} : { anno: 1955 + ((i * 7) % 70) }),
    g: GENERI_PROVA[i % GENERI_PROVA.length],
    w: `Canzone ${i}`,
    f: fama(i, 300),
  })),
}

const compositoriClassici = persone('k', 30, 1650, 9)

export const CLASSICA: DatiClassica = {
  versione: 'prova',
  compositori: compositoriClassici,
  brani: Array.from({ length: 120 }, (_, i) => ({
    id: `BR${i}`,
    n: `brano di prova ${i}`,
    c: i % 23 === 4 ? [`k${i % 30}`, `k${(i + 1) % 30}`] : [`k${i % 30}`],
    ...(i % 7 === 6 ? {} : { anno: 1650 + (i % 30) * 9 + 30 }),
    w: `Brano ${i}`,
    f: fama(i, 120),
  })),
}

export const OGGI: DatiOggi = {
  versione: 'prova',
  giorno: '03-15',
  fatti: Array.from({ length: 25 }, (_, i) => ({
    anno: i === 0 ? -44 : 800 + i * 50,
    t: i === 0 ? 'Idi di marzo: Giulio Cesare viene assassinato nel Senato' : `Accade il fatto numero ${i}`,
    w: `Fatto ${i}`,
    d: `Il fatto ${i} e’ andato cosi’.`,
    f: fama(i, 25),
  })),
  nati: Array.from({ length: 15 }, (_, i) => ({
    id: `NA${i}`,
    n: `Persona Nata ${i}`,
    anno: 1700 + i * 17,
    ...(i % 2 === 0 ? { fem: 1 as const } : {}),
    d: i % 2 === 0 ? 'scienziata di prova' : 'scrittore di prova',
    f: fama(i, 15),
  })),
}
